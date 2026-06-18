/**
 * Regression coverage for the perp/spot API branching in the data loaders.
 * Uses the same `this`-sensitive mock pattern as composables.chart.test.ts so
 * a detached-method refactor in loadOrderbook/loadTrades also fails the test.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useInjective,
  __setEngineForTesting,
  __resetEngineForTesting,
} from '~/composables/useInjective'

beforeEach(() => __resetEngineForTesting())

/**
 * Mock indexer APIs whose methods read `this._calls`. If a loader detaches a
 * method (e.g. `const api = market.kind === 'spot' ? spotApi : derivApi` is
 * fine, but `const fn = api.fetchOrderbookV2` + `fn(...)` would break `this`).
 */
function makeApis() {
  const calls: string[] = []
  const mk = (label: string) => ({
    fetchOrderbookV2(this: any, _id: string) {
      this._calls.push(`${label}-book`)
      return { buys: [{ price: '1500000', quantity: '1000000000000000000' }], sells: [] }
    },
    fetchTrades(this: any, _req: any) {
      this._calls.push(`${label}-trades`)
      return { trades: [] }
    },
  })
  const spotApi: any = { _calls: calls, ...mk('spot') }
  const derivApi: any = { _calls: calls, ...mk('deriv') }
  return { calls, spotApi, derivApi }
}

describe('loadOrderbook / loadTrades — spot vs perp branching', () => {
  function seedMarket(kind: 'spot' | 'perp') {
    const inj = useInjective()
    inj.mode.value = kind
    const store = kind === 'spot' ? inj.spotMarkets : inj.derivMarkets
    store.value = [{
      kind,
      marketId: kind === 'spot' ? 'm-spot' : 'm-perp',
      ticker: kind === 'spot' ? 'INJ/USDT' : 'INJ/USDT PERP',
      baseSymbol: 'INJ', quoteSymbol: 'USDT', quoteDenom: 'uusdt',
      quoteDecimals: 6, baseDecimals: kind === 'spot' ? 18 : 6,
      minPriceTickSize: 0.01, minQuantityTickSize: 0.001, raw: {},
    } as any]
    inj.selectedMarketId.value = kind === 'spot' ? 'm-spot' : 'm-perp'
    return inj
  }

  it('spot market → loadOrderbook uses spotApi', async () => {
    const { calls, spotApi, derivApi } = makeApis()
    __setEngineForTesting({ spotApi, derivApi } as any)
    const { loadOrderbook } = seedMarket('spot')
    await loadOrderbook()
    expect(calls).toContain('spot-book')
    expect(calls).not.toContain('deriv-book')
  })

  it('perp market → loadOrderbook uses derivApi', async () => {
    const { calls, spotApi, derivApi } = makeApis()
    __setEngineForTesting({ spotApi, derivApi } as any)
    const { loadOrderbook } = seedMarket('perp')
    await loadOrderbook()
    expect(calls).toContain('deriv-book')
    expect(calls).not.toContain('spot-book')
  })

  it('loadTrades branches by kind too', async () => {
    const { calls, spotApi, derivApi } = makeApis()
    __setEngineForTesting({ spotApi, derivApi } as any)
    const { loadTrades } = seedMarket('perp')
    await loadTrades()
    expect(calls).toContain('deriv-trades')
  })
})
