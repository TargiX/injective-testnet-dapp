/**
 * Cross-chain balance + price aggregation for the portfolio dashboard.
 *
 * Reads bank balances on the IBC counterparty chains (Osmosis, Cosmos Hub) so
 * the portfolio can show a single net-worth across all chains the user holds
 * assets on. This is READ-ONLY — no signing, no wallet needed beyond deriving
 * the same account address on the destination chain (Keplr/Leap share the
 * account across Cosmos chains; convertAddress does the bech32 swap).
 *
 * Architecture notes:
 *  - Browser-direct REST to public Cosmos LCDs (lcd.osmosis.zone,
 *    cosmos-api.polkachu.com) — all verified to send
 *    `access-control-allow-origin: *`. No proxy needed, and the app is ssr:false
 *    with a static-deploy (nuxt generate) path that would drop a server route.
 *  - Separate store from useInjective's `balances` — that ref is mutated on every
 *    order/cancel/deposit and would thrash remote fetches. assetAllocation (a
 *    computed in usePortfolio) merges the two.
 *  - Prices via CoinGecko simple/price (CORS-open, no key), cached 60s. On
 *    failure, tokens price to `null` (same "unpriced" UX as today).
 */
import { useInjective } from '~/composables/useInjective'
import {
  IBC_ROUTES,
  type IbcRouteKey,
  convertAddress,
} from '~/composables/useIbc'
import type { BalanceRow } from '~/composables/useInjective'

/**
 * Static denom metadata for the tokens we actually expect to see across the
 * three chains. Covers native denoms + their IBC hashes on Injective. Unknown
 * denoms fall back to { symbol: denom, decimals: 0 } (existing behaviour).
 *
 * decimals source: chain-registry assetlist.json for each chain.
 */
export interface DenomMeta {
  symbol: string
  decimals: number
  coingeckoId: string
}

export const CHAIN_DENOMS: Record<string, DenomMeta> = {
  // ---- Injective native ----
  inj: { symbol: 'INJ', decimals: 18, coingeckoId: 'injective-protocol' },
  // INJ bridged to Osmosis / Cosmos Hub as an IBC token.
  'ibc/64BA6E03FE5FB6C79B03BCE3A4B7D6E2AC1F4D7C4F0CE0C6BC5FBCB9D5B96DD6': {
    symbol: 'INJ', decimals: 18, coingeckoId: 'injective-protocol',
  },
  // ---- Osmosis native ----
  uosmo: { symbol: 'OSMO', decimals: 6, coingeckoId: 'osmosis' },
  // OSMO bridged to Injective.
  'ibc/14F9BC3E44B8A9C1BE1FB08980FAB87034C9905EFAA1553CBB2770A5C8C7CB6C': {
    symbol: 'OSMO', decimals: 6, coingeckoId: 'osmosis',
  },
  // ---- Cosmos Hub native ----
  uatom: { symbol: 'ATOM', decimals: 6, coingeckoId: 'cosmos' },
  // ATOM bridged to Injective.
  'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4DA99B3A0E06AACB78D08D67AEC': {
    symbol: 'ATOM', decimals: 6, coingeckoId: 'cosmos',
  },
  // ---- stable-ish quotes that show up on Injective markets ----
  uusdc: { symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin' },
  uusdt: { symbol: 'USDT', decimals: 6, coingeckoId: 'tether' },
  'factory/inj1.../uusdt': { symbol: 'USDT', decimals: 6, coingeckoId: 'tether' },
}

/** Resolve denom metadata with the existing fallback. */
export function resolveDenom(denom: string): DenomMeta {
  return (
    CHAIN_DENOMS[denom] ?? {
      symbol: denom.startsWith('ibc/') ? denom.slice(0, 12) : denom,
      decimals: 0,
      coingeckoId: '',
    }
  )
}

const PRICE_TTL_MS = 60 * 1000

interface CosmosBalanceResp {
  balances: { denom: string; amount: string }[]
  pagination?: { next_key?: string | null }
}

/**
 * Page through a chain's bank balances endpoint. Pure function — takes the
 * fetcher so it's unit-testable without a network. Returns raw {denom,amount}
 * pairs; the caller attaches metadata + chain.
 */
export async function fetchAllBalancesRaw(
  lcdBase: string,
  bech32Address: string,
  fetcher: (url: string) => Promise<any> = (u) => $fetch(u),
): Promise<{ denom: string; amount: string }[]> {
  const out: { denom: string; amount: string }[] = []
  let nextKey: string | null | undefined = undefined
  // Hard cap on pages to avoid an infinite loop against a hostile endpoint.
  for (let page = 0; page < 50; page++) {
    const url = new URL(
      `${lcdBase.replace(/\/$/, '')}/cosmos/bank/v1beta1/balances/${bech32Address}`,
    )
    if (nextKey) url.searchParams.set('pagination.key', nextKey)
    url.searchParams.set('pagination.limit', '200')
    const res = (await fetcher(url.toString())) as CosmosBalanceResp
    if (Array.isArray(res?.balances)) out.push(...res.balances)
    nextKey = res?.pagination?.next_key ?? null
    if (!nextKey) break
  }
  return out
}

/** Convert raw LCD balances into typed BalanceRows tagged with the chain. */
export function toBalanceRows(
  raw: { denom: string; amount: string }[],
  chain: string,
): BalanceRow[] {
  return raw.map((b) => {
    const meta = resolveDenom(b.denom)
    return {
      denom: b.denom,
      symbol: meta.symbol,
      amount: b.amount,
      decimals: meta.decimals,
      chain,
    }
  })
}

export type CrosschainMap = Partial<Record<IbcRouteKey, BalanceRow[]>>

export function useCrosschain() {
  const { address, isTestnet } = useInjective()

  const crossChainBalances = useState<CrosschainMap>('xc-balances', () => ({}))
  const crosschainLoading = useState<boolean>('xc-loading', () => false)
  const crosschainError = useState<Record<string, string>>('xc-errors', () => ({}))
  const prices = useState<Record<string, number>>('xc-prices', () => ({}))
  const pricesAt = useState<number>('xc-prices-at', () => 0)

  /**
   * Fetch USD prices from CoinGecko for all chains' native tokens in one call.
   * Cached for PRICE_TTL_MS. On any failure we leave the existing cache in
   * place rather than blanking prices (a stale price beats no price).
   */
  async function loadPrices(force = false) {
    if (!force && pricesAt.value && Date.now() - pricesAt.value < PRICE_TTL_MS) return
    const ids = ['injective-protocol', 'osmosis', 'cosmos', 'usd-coin', 'tether'].join(',')
    try {
      const res = await $fetch<Record<string, { usd: number }>>(
        'https://api.coingecko.com/api/v3/simple/price',
        { params: { ids, vs_currencies: 'usd' }, timeout: 8000 },
      )
      const map: Record<string, number> = {}
      for (const [id, val] of Object.entries(res)) if (val?.usd) map[id] = val.usd
      prices.value = map
      pricesAt.value = Date.now()
    } catch {
      // keep stale cache; prices stay as-is (possibly empty → null pricing).
    }
  }

  /** USD price for a denom, or null if unpriced. */
  function priceDenom(denom: string): number | null {
    const meta = resolveDenom(denom)
    if (meta.coingeckoId && prices.value[meta.coingeckoId] != null) {
      return prices.value[meta.coingeckoId]
    }
    return null
  }

  /**
   * Load balances on every IBC counterparty chain. One chain failing does not
   * blank the others (Promise.allSettled). No-op on testnet — channels/addresses
   * differ and LCDs are mainnet-only.
   */
  async function loadCrosschainBalances(forcePrices = true) {
    if (!address.value || isTestnet.value) return
    crosschainLoading.value = true
    crosschainError.value = {}
    // Always refresh prices alongside balances.
    loadPrices(forcePrices).catch(() => {})

    const entries = await Promise.allSettled(
      (Object.keys(IBC_ROUTES) as IbcRouteKey[]).map(async (key) => {
        const route = IBC_ROUTES[key]
        const recipient = await convertAddress(address.value, route.bech32Prefix)
        if (!recipient.ok) throw new Error(recipient.error)
        const raw = await fetchAllBalancesRaw(route.lcd, recipient.address)
        return { key, rows: toBalanceRows(raw, key) }
      }),
    )

    const next: CrosschainMap = {}
    const errors: Record<string, string> = {}
    for (const [i, key] of (Object.keys(IBC_ROUTES) as IbcRouteKey[]).entries()) {
      const r = entries[i]
      if (r?.status === 'fulfilled') next[key] = r.value.rows
      else if (r?.status === 'rejected') errors[key] = String(r.reason?.message || r.reason)
    }
    crossChainBalances.value = next
    crosschainError.value = errors
    crosschainLoading.value = false
  }

  /** All remote balances flattened (for allocation aggregation). */
  const allCrosschainBalances = computed<BalanceRow[]>(() => {
    const out: BalanceRow[] = []
    for (const rows of Object.values(crossChainBalances.value)) {
      if (rows) out.push(...rows)
    }
    return out
  })

  /** Net worth held on remote chains, priced where possible (USD). */
  const crosschainNetWorth = computed(() =>
    allCrosschainBalances.value.reduce((sum, b) => {
      const human = Number(b.amount) / 10 ** b.decimals
      const price = priceDenom(b.denom)
      return sum + (price != null ? price * human : 0)
    }, 0),
  )

  /** Per-chain net worth subtotal, keyed by chain label. */
  const perChainNetWorth = computed<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const [key, rows] of Object.entries(crossChainBalances.value)) {
      const label = IBC_ROUTES[key as IbcRouteKey]?.label ?? key
      map[label] =
        rows?.reduce((s, b) => {
          const human = Number(b.amount) / 10 ** b.decimals
          const price = priceDenom(b.denom)
          return s + (price != null ? price * human : 0)
        }, 0) ?? 0
    }
    return map
  })

  /** Number of remote chains that returned at least one balance row. */
  const activeChainCount = computed(
    () => Object.values(crossChainBalances.value).filter((r) => r && r.length > 0).length,
  )

  return {
    // state
    crossChainBalances,
    crosschainLoading,
    crosschainError,
    allCrosschainBalances,
    crosschainNetWorth,
    perChainNetWorth,
    activeChainCount,
    prices,
    // actions
    loadCrosschainBalances,
    loadPrices,
    priceDenom,
  }
}
