/**
 * Pure-logic tests for usePortfolio computations. No SDK, no engine — we seed
 * the shared useState stores (trades, balances, positions) and assert the
 * computed PnL series, stats, and allocation are correct.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useInjective } from '~/composables/useInjective'
import { usePortfolio } from '~/composables/usePortfolio'

beforeEach(() => {
  // Clear useState store between tests (tests/setup.ts clears on beforeEach,
  // but be explicit since these tests lean heavily on shared state).
})

/** Seed trades directly into the usePortfolio 'pf-trades' store. */
function seedTrades(trades: any[]) {
  const inj = useInjective()
  inj.address.value = 'inj1test' // mark connected so loaders no-op
  const pf = usePortfolio()
  pf.trades.value = trades
  return pf
}

describe('realizedPnlSeries — cumulative perp realized PnL', () => {
  it('cumulates perp pnls over time (ascending)', () => {
    const pf = seedTrades([
      { tradeId: '1', marketId: 'm', ticker: 'INJ/USDT PERP', direction: 'buy',
        price: 1, quantity: 1, fee: 0.1, pnl: 10, executedAt: 100000, kind: 'perp' },
      { tradeId: '2', marketId: 'm', ticker: 'INJ/USDT PERP', direction: 'sell',
        price: 1, quantity: 1, fee: 0.1, pnl: -5, executedAt: 200000, kind: 'perp' },
      { tradeId: '3', marketId: 'm', ticker: 'INJ/USDT PERP', direction: 'sell',
        price: 1, quantity: 1, fee: 0.1, pnl: 20, executedAt: 300000, kind: 'perp' },
    ])
    const series = pf.realizedPnlSeries.value
    expect(series.map(p => p.value)).toEqual([10, 5, 25])
    // time in seconds
    expect(series.map(p => p.time)).toEqual([100, 200, 300])
  })

  it('ignores spot trades (no pnl field → pnl null)', () => {
    const pf = seedTrades([
      { tradeId: 's1', marketId: 'm', ticker: 'INJ/USDT', direction: 'buy',
        price: 1, quantity: 1, fee: 0.1, pnl: null, executedAt: 100000, kind: 'spot' },
      { tradeId: 'p1', marketId: 'm', ticker: 'INJ/USDT PERP', direction: 'buy',
        price: 1, quantity: 1, fee: 0, pnl: 7, executedAt: 200000, kind: 'perp' },
    ])
    expect(pf.realizedPnlSeries.value.map(p => p.value)).toEqual([7])
  })

  it('is empty when there are no perp trades', () => {
    const pf = seedTrades([])
    expect(pf.realizedPnlSeries.value).toEqual([])
  })
})

describe('pnlStats — aggregate totals', () => {
  it('sums realized, fees, and finds best/worst', () => {
    const pf = seedTrades([
      { tradeId: '1', marketId: 'm', ticker: 'T', direction: 'buy',
        price: 1, quantity: 1, fee: 0.5, pnl: 10, executedAt: 1, kind: 'perp' },
      { tradeId: '2', marketId: 'm', ticker: 'T', direction: 'sell',
        price: 1, quantity: 1, fee: 0.5, pnl: -3, executedAt: 2, kind: 'perp' },
    ])
    const s = pf.pnlStats.value
    expect(s.realizedTotal).toBe(7) // 10 + (-3)
    expect(s.feesPaid).toBe(1) // 0.5 + 0.5
    expect(s.tradeCount).toBe(2)
    expect(s.bestTrade).toBe(10)
    expect(s.worstTrade).toBe(-3)
  })

  it('unrealizedTotal reflects open positions', () => {
    const inj = useInjective()
    inj.address.value = 'inj1test'
    inj.positions.value = [
      { marketId: 'm', ticker: 'T', direction: 'long', quantity: 1, entryPrice: 1,
        markPrice: 2, margin: 1, liquidationPrice: 0.5, upnl: 5, upnlPct: 500, leverage: 1 },
      { marketId: 'm2', ticker: 'T2', direction: 'short', quantity: 1, entryPrice: 2,
        markPrice: 1, margin: 2, liquidationPrice: 3, upnl: -2, upnlPct: -100, leverage: 1 },
    ]
    const pf = usePortfolio()
    pf.trades.value = []
    expect(pf.pnlStats.value.unrealizedTotal).toBe(3) // 5 + (-2)
  })
})

describe('assetAllocation — balances priced where possible', () => {
  it('prices a denom that has a spot market; leaves others unpriced', () => {
    const inj = useInjective()
    inj.address.value = 'inj1test'
    // Balance: 100 INJ (priced at 2) + 50 of an unknown denom (no market).
    inj.balances.value = [
      { denom: 'inj', symbol: 'INJ', amount: '100000000000000000000', decimals: 18 } as any, // 100 INJ
      { denom: 'factory/x/foo', symbol: 'FOO', amount: '50000000', decimals: 6 } as any, // 50 FOO
    ]
    inj.spotMarkets.value = [
      { kind: 'spot', marketId: 'm-inj', ticker: 'INJ/USDT', baseDenom: 'inj',
        baseSymbol: 'INJ', quoteSymbol: 'USDT', quoteDenom: 'uusdt',
        quoteDecimals: 6, baseDecimals: 18, raw: {} } as any,
    ]
    // selectedMarket + marketStats drive priceByDenom; set lastPrice=2 for INJ.
    inj.mode.value = 'spot'
    inj.selectedMarketId.value = 'm-inj'
    inj.marketStats.value = { lastPrice: 2, changePct: 0, high: 0, low: 0, volume: 0, quoteVolume: 0 }

    const pf = usePortfolio()
    const alloc = pf.assetAllocation.value

    const injRow = alloc.find(r => r.denom === 'inj')
    expect(injRow).toBeTruthy()
    expect(injRow!.amount).toBe(100)
    expect(injRow!.usdValue).toBe(200) // 100 * 2

    const fooRow = alloc.find(r => r.denom === 'factory/x/foo')
    expect(fooRow).toBeTruthy()
    expect(fooRow!.usdValue).toBeNull() // no market → unpriced
  })
})
