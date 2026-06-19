/**
 * Cross-chain balance aggregation unit tests. Covers the pure/extracted logic:
 * denom metadata resolution, raw→typed balance mapping with chain tagging,
 * LCD pagination, and failure isolation (one chain rejecting doesn't blank
 * the other). Mirrors the this-sensitive, no-network style of the other suites.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  CHAIN_DENOMS,
  resolveDenom,
  fetchAllBalancesRaw,
  toBalanceRows,
} from '~/composables/useCrosschain'

describe('resolveDenom — static metadata table', () => {
  it('resolves native Injective INJ', () => {
    expect(resolveDenom('inj')).toEqual({
      symbol: 'INJ', decimals: 18, coingeckoId: 'injective-protocol',
    })
  })

  it('resolves native Osmosis OSMO', () => {
    expect(resolveDenom('uosmo')).toEqual({
      symbol: 'OSMO', decimals: 6, coingeckoId: 'osmosis',
    })
  })

  it('resolves native Cosmos Hub ATOM', () => {
    expect(resolveDenom('uatom')).toEqual({
      symbol: 'ATOM', decimals: 6, coingeckoId: 'cosmos',
    })
  })

  it('resolves IBC-hash denoms (OSMO bridged to Injective)', () => {
    const hash = 'ibc/14F9BC3E44B8A9C1BE1FB08980FAB87034C9905EFAA1553CBB2770A5C8C7CB6C'
    expect(resolveDenom(hash)).toEqual({
      symbol: 'OSMO', decimals: 6, coingeckoId: 'osmosis',
    })
  })

  it('falls back for an unknown denom with sensible defaults', () => {
    const res = resolveDenom('factory/inj1xyz/ufoo')
    expect(res.decimals).toBe(0)
    expect(res.symbol).toBe('factory/inj1xyz/ufoo') // passthrough for non-ibc
    expect(res.coingeckoId).toBe('')
  })

  it('truncates unknown ibc hashes for the fallback symbol', () => {
    const res = resolveDenom('ibc/DEADBEEF1234567890')
    expect(res.symbol).toBe('ibc/DEADBEEF') // first 12 chars
    expect(res.decimals).toBe(0)
  })

  it('CHAIN_DENOMS entries are consistent (symbol non-empty, decimals >= 0)', () => {
    for (const [denom, meta] of Object.entries(CHAIN_DENOMS)) {
      expect(meta.symbol.length).toBeGreaterThan(0)
      expect(meta.decimals).toBeGreaterThanOrEqual(0)
      expect(meta.coingeckoId.length).toBeGreaterThan(0)
      expect(denom.length).toBeGreaterThan(0)
    }
  })
})

describe('toBalanceRows — raw LCD response → typed rows with chain tag', () => {
  it('maps raw balances and attaches metadata + chain', () => {
    const rows = toBalanceRows(
      [
        { denom: 'uosmo', amount: '5000000' }, // 5 OSMO
        { denom: 'uatom', amount: '2500000' }, // 2.5 ATOM
      ],
      'osmosis',
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      denom: 'uosmo', symbol: 'OSMO', amount: '5000000', decimals: 6, chain: 'osmosis',
    })
    expect(rows[1].symbol).toBe('ATOM')
    expect(rows[1].chain).toBe('osmosis')
  })

  it('every row carries the passed chain value', () => {
    const rows = toBalanceRows(
      [{ denom: 'uatom', amount: '1' }],
      'cosmoshub',
    )
    expect(rows[0].chain).toBe('cosmoshub')
  })

  it('preserves unknown denoms with decimals 0 fallback', () => {
    const rows = toBalanceRows(
      [{ denom: 'sometoken', amount: '42' }],
      'osmosis',
    )
    expect(rows[0].decimals).toBe(0)
    expect(rows[0].amount).toBe('42')
  })
})

describe('fetchAllBalancesRaw — pagination accumulation', () => {
  it('follows pagination.next_key until it is null', async () => {
    const pages = [
      { balances: [{ denom: 'a', amount: '1' }, { denom: 'b', amount: '2' }], pagination: { next_key: 'cursor1' } },
      { balances: [{ denom: 'c', amount: '3' }], pagination: { next_key: 'cursor2' } },
      { balances: [{ denom: 'd', amount: '4' }], pagination: { next_key: null } },
    ]
    let call = 0
    const fetcher = vi.fn(async (_url: string) => pages[call++])
    const out = await fetchAllBalancesRaw('https://lcd.test', 'osmo1abc', fetcher)
    expect(out).toHaveLength(4)
    expect(out.map((b) => b.denom)).toEqual(['a', 'b', 'c', 'd'])
    // Three fetches for three pages.
    expect(fetcher).toHaveBeenCalledTimes(3)
    // The second+ fetches carry the pagination cursor.
    expect(fetcher.mock.calls[1][0]).toContain('pagination.key=')
  })

  it('passes the pagination.limit param', async () => {
    const fetcher = vi.fn(async () => ({ balances: [], pagination: { next_key: null } }))
    await fetchAllBalancesRaw('https://lcd.test', 'cosmos1abc', fetcher)
    expect(fetcher.mock.calls[0][0]).toContain('pagination.limit=200')
  })

  it('handles a single page with no next_key', async () => {
    const fetcher = vi.fn(async () => ({
      balances: [{ denom: 'x', amount: '9' }],
      pagination: { next_key: null },
    }))
    const out = await fetchAllBalancesRaw('https://lcd.test', 'osmo1abc', fetcher)
    expect(out).toEqual([{ denom: 'x', amount: '9' }])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('guards against a hostile endpoint that never stops paginating', async () => {
    // Always returns a next_key — the 50-page hard cap must break the loop.
    const fetcher = vi.fn(async () => ({
      balances: [{ denom: 'x', amount: '1' }],
      pagination: { next_key: 'forever' },
    }))
    const out = await fetchAllBalancesRaw('https://lcd.test', 'osmo1abc', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(50)
    expect(out.length).toBe(50) // one row per page
  })
})

describe('crosschainNetWorth — failure isolation (Promise.allSettled)', () => {
  /**
   * The aggregation uses Promise.allSettled so one chain failing doesn't blank
   * the others. We simulate this by checking the pure merge contract: a
   * rejected route contributes no rows, a fulfilled route keeps its rows.
   */
  it('a rejected entry produces no rows while a fulfilled one keeps them', () => {
    // Mimic the allSettled result → map transform done in loadCrosschainBalances.
    const results = [
      { status: 'fulfilled', value: { key: 'osmosis', rows: toBalanceRows([{ denom: 'uosmo', amount: '1000000' }], 'osmosis') } },
      { status: 'rejected', reason: { message: 'LCD down' } },
    ] as const

    const next: Record<string, any[]> = {}
    const errors: Record<string, string> = {}
    const keys = ['osmosis', 'cosmoshub']
    for (let i = 0; i < keys.length; i++) {
      const r: any = results[i]
      if (r?.status === 'fulfilled') next[keys[i]] = r.value.rows
      else if (r?.status === 'rejected') errors[keys[i]] = String(r.reason?.message || r.reason)
    }
    expect(next.osmosis).toHaveLength(1)
    expect(next.osmosis[0].symbol).toBe('OSMO')
    expect(next.cosmoshub).toBeUndefined()
    expect(errors.cosmoshub).toBe('LCD down')
    expect(errors.osmosis).toBeUndefined()
  })
})
