/**
 * Regression test for the chart crash: "Cannot read properties of undefined
 * (reading 'methods')". The bug was caused by detaching a gRPC method into a
 * local const:
 *
 *   const historyFn = chartApi.spotMarketHistory   // ❌ loses `this`
 *   await historyFn(req)                            // this.client is undefined
 *
 * The real chartApi's methods read `this.client.methods`, so detaching throws.
 * To catch this class of bug, the mock here uses REAL methods that read `this`
 * — a detached reference will fail with the same symptom.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Import the composable + the test-only escape hatch. `useInjective` reads
// module-level enginePromise, so injecting via __setEngineForTesting works.
// useInjective is normally a Nuxt auto-import; here we import it directly.
import {
  useInjective,
  __setEngineForTesting,
  __resetEngineForTesting,
} from '~/composables/useInjective'

/**
 * Build a mock chartApi whose methods genuinely use `this`. If any loader
 * detaches the method into a local const (the chart-bug pattern), calling it
 * throws — exactly reproducing the production crash.
 */
function makeChartApi() {
  const calls: string[] = []
  return {
    _calls: calls,
    spotMarketHistory(this: any, _req: any) {
      this._calls.push('spot') // uses `this` — the regression trigger
      return Promise.resolve({
        response: {
          t: [1000, 2000, 3000],
          o: ['1', '2', '3'],
          h: ['1.5', '2.5', '3.5'],
          l: ['0.5', '1.5', '2.5'],
          c: ['1.2', '2.2', '3.2'],
          v: ['10', '20', '30'],
        },
      })
    },
    derivativeMarketHistory(this: any, _req: any) {
      this._calls.push('deriv')
      return Promise.resolve({
        response: {
          t: [4000, 5000],
          o: ['4', '5'],
          h: ['4.5', '5.5'],
          l: ['3.5', '4.5'],
          c: ['4.2', '5.2'],
          v: ['40', '50'],
        },
      })
    },
  }
}

beforeEach(() => __resetEngineForTesting())

describe('loadChartCandles — chart-bug regression', () => {
  it('calls spotMarketHistory on a spot market (method stays bound to `this`)', async () => {
    const chartApi: any = makeChartApi()
    __setEngineForTesting({ chartApi } as any)

    const { selectedMarketId, loadChartCandles, chartCandles, spotMarkets, mode } =
      useInjective()

    // `markets` is a computed of (mode ? spotMarkets : derivMarkets); seed the
    // underlying store and keep mode='spot'.
    mode.value = 'spot'
    spotMarkets.value = [
      {
        kind: 'spot',
        marketId: 'm-spot',
        ticker: 'INJ/USDT',
        baseSymbol: 'INJ',
        quoteSymbol: 'USDT',
        quoteDenom: 'uusdt',
        quoteDecimals: 6,
        baseDecimals: 18,
        minPriceTickSize: 0.01,
        minQuantityTickSize: 0.001,
        raw: {},
      } as any,
    ]
    selectedMarketId.value = 'm-spot'

    await loadChartCandles('5', 3)

    // The mock pushed 'spot' only if it was called WITH the correct `this`.
    expect(chartApi._calls).toContain('spot')
    expect(chartCandles.value.length).toBe(3)
    expect(chartCandles.value[0]).toMatchObject({ time: 1000, open: 1, close: 1.2 })
  })

  it('calls derivativeMarketHistory on a perp market', async () => {
    const chartApi: any = makeChartApi()
    __setEngineForTesting({ chartApi } as any)

    const { selectedMarketId, loadChartCandles, chartCandles, derivMarkets, mode } =
      useInjective()

    mode.value = 'perp'
    derivMarkets.value = [
      {
        kind: 'perp',
        marketId: 'm-perp',
        ticker: 'INJ/USDT PERP',
        baseSymbol: 'INJ',
        quoteSymbol: 'USDT',
        quoteDenom: 'uusdt',
        quoteDecimals: 6,
        baseDecimals: 6,
        minPriceTickSize: 0.01,
        minQuantityTickSize: 0.001,
        raw: {},
      } as any,
    ]
    selectedMarketId.value = 'm-perp'

    await loadChartCandles('5', 2)

    expect(chartApi._calls).toContain('deriv')
    expect(chartApi._calls).not.toContain('spot')
    expect(chartCandles.value.length).toBe(2)
  })

  it('detects a detached method — the exact chart-bug pattern (guards against re-regression)', () => {
    // Simulate the buggy refactor: detach the method, then call it. The mock's
    // method reads `this`, so a detached call throws — proving the mock has the
    // sensitivity to catch this regression class. If this test ever stops
    // throwing, our mock lost its `this`-sensitivity and is no longer useful.
    const chartApi: any = makeChartApi()
    const detached = chartApi.spotMarketHistory // ❌ detached — `this` lost
    // Throws synchronously (inside the method, before the Promise resolves).
    expect(() => detached({})).toThrow(/_calls/)
  })
})
