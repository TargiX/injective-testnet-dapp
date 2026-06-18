/**
 * Portfolio & P&L composable. Builds the portfolio dashboard's data:
 *  - trade history (perp realized PnL is free from DerivativeTrade.pnl; spot
 *    has no pnl field so spot trades carry pnl=null)
 *  - cumulative realized PnL series for the chart (+ unrealized offset)
 *  - aggregate PnL stats
 *  - asset allocation (bank + subaccount balances, priced where possible)
 *
 * Reuses useInjective()'s already-loaded markets/balances/positions — does not
 * re-fetch them. Only trade history is fetched here (paginated, capped at 500).
 */

export interface TradeRow {
  tradeId: string
  marketId: string
  ticker: string
  direction: 'buy' | 'sell' | 'long' | 'short'
  price: number
  quantity: number
  fee: number
  pnl: number | null // null for spot (no pnl field); quote units for perp
  executedAt: number // unix millis
  kind: 'spot' | 'perp'
  isLiquidation?: boolean
}

export interface PnlPoint {
  time: number // unix seconds (chart time axis)
  value: number // cumulative realized PnL in quote units
}

export interface PnlStats {
  realizedTotal: number
  unrealizedTotal: number
  feesPaid: number
  tradeCount: number
  bestTrade: number
  worstTrade: number
}

export interface AllocationRow {
  denom: string
  symbol: string
  amount: number // human
  usdValue: number | null // null = unpriced
  pct: number | null
  logo?: string
}

const MAX_TRADES = 500

export function usePortfolio() {
  const {
    address,
    isConnected,
    balances,
    subaccountBalances,
    positions,
    markets,
    spotMarkets,
    derivMarkets,
    marketStats,
    getApi,
  } = useInjective()

  const trades = useState<TradeRow[]>('pf-trades', () => [])
  const tradesLoading = useState<boolean>('pf-trades-loading', () => false)
  const tradesError = useState<string>('pf-trades-error', () => '')

  // Cache of last prices keyed by marketId (from marketStats of selected + a
  // per-market fetch would be ideal, but we approximate from spot markets).
  const priceByDenom = computed<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    // Use spot markets: baseDenom -> lastPrice (quote value of 1 base unit).
    for (const m of spotMarkets.value) {
      if (m.baseDenom && marketStats.value && m.marketId === markets.value.find(x => x.marketId === m.marketId)?.marketId) {
        map[m.baseDenom] = marketStats.value.lastPrice
      }
    }
    return map
  })

  /** Price a denom in quote (USD-ish) units using cached spot prices. */
  function priceDenom(denom: string): number | null {
    return priceByDenom.value[denom] ?? null
  }

  /** Load all perp + spot trades for the connected address, paginated. */
  async function loadTradeHistory() {
    if (!address.value) {
      trades.value = []
      return
    }
    tradesLoading.value = true
    tradesError.value = ''
    try {
      const api = await getApi()
      if (!api) {
        tradesError.value = 'Engine not ready'
        return
      }
      const { derivApi, spotApi } = api
      // Fetch perp trades (have pnl) + spot trades (no pnl) in parallel.
      const allMarkets = [...spotMarkets.value, ...derivMarkets.value]
      const tickerOf = (marketId: string) =>
        allMarkets.find(m => m.marketId === marketId)?.ticker ?? marketId.slice(0, 8)
      const quoteDecimalsOf = (marketId: string) =>
        allMarkets.find(m => m.marketId === marketId)?.quoteDecimals ?? 6
      const kindOf = (marketId: string): 'spot' | 'perp' =>
        derivMarkets.value.some(m => m.marketId === marketId) ? 'perp' : 'spot'

      const [derivRes, spotRes] = await Promise.all([
        derivApi.fetchTrades({ accountAddress: address.value, pagination: { limit: MAX_TRADES } }).catch(() => ({ trades: [] })),
        spotApi.fetchTrades({ accountAddress: address.value, pagination: { limit: MAX_TRADES } }).catch(() => ({ trades: [] })),
      ])

      const dTrades: any[] = (derivRes as any)?.trades ?? []
      const sTrades: any[] = (spotRes as any)?.trades ?? []

      const mapped: TradeRow[] = []

      for (const t of dTrades) {
        const qd = quoteDecimalsOf(t.marketId)
        const div = 10 ** qd
        mapped.push({
          tradeId: t.tradeId,
          marketId: t.marketId,
          ticker: tickerOf(t.marketId),
          direction: t.tradeDirection,
          price: Number(t.executionPrice) / div,
          quantity: Number(t.executionQuantity), // perp qty: chain == human
          fee: Number(t.fee) / div,
          pnl: t.pnl !== undefined && t.pnl !== '' ? Number(t.pnl) / div : 0,
          executedAt: Number(t.executedAt),
          kind: 'perp',
          isLiquidation: !!t.isLiquidation,
        })
      }
      for (const t of sTrades) {
        const m = allMarkets.find(mk => mk.marketId === t.marketId)
        const bd = m?.baseDecimals ?? 18
        const qd = m?.quoteDecimals ?? 6
        mapped.push({
          tradeId: t.tradeId,
          marketId: t.marketId,
          ticker: tickerOf(t.marketId),
          direction: t.tradeDirection,
          price: Number(t.price) * 10 ** (bd - qd),
          quantity: Number(t.quantity) / 10 ** bd,
          fee: Number(t.fee) / 10 ** qd,
          pnl: null, // spot has no realized pnl field
          executedAt: Number(t.executedAt),
          kind: 'spot',
        })
      }

      // Newest first for the table; chart sorts ascending internally.
      mapped.sort((a, b) => b.executedAt - a.executedAt)
      trades.value = mapped.slice(0, MAX_TRADES)
    } catch (e: any) {
      tradesError.value = e?.message || 'Failed to load trade history'
    } finally {
      tradesLoading.value = false
    }
  }

  /** Cumulative realized perp PnL over time (ascending) for the area chart. */
  const realizedPnlSeries = computed<PnlPoint[]>(() => {
    const perp = trades.value
      .filter(t => t.kind === 'perp' && t.pnl !== null)
      .sort((a, b) => a.executedAt - b.executedAt)
    let cum = 0
    return perp.map(t => {
      cum += t.pnl as number
      return { time: Math.floor(t.executedAt / 1000), value: cum }
    })
  })

  /** Unrealized PnL sum across open positions (live, from positions state). */
  const unrealizedPnl = computed(() =>
    positions.value.reduce((s, p) => s + p.upnl, 0),
  )

  const pnlStats = computed<PnlStats>(() => {
    const perp = trades.value.filter(t => t.kind === 'perp' && t.pnl !== null)
    const realized = perp.reduce((s, t) => s + (t.pnl as number), 0)
    const fees = trades.value.reduce((s, t) => s + t.fee, 0)
    const pnls = perp.map(t => t.pnl as number)
    return {
      realizedTotal: realized,
      unrealizedTotal: unrealizedPnl.value,
      feesPaid: fees,
      tradeCount: trades.value.length,
      bestTrade: pnls.length ? Math.max(...pnls) : 0,
      worstTrade: pnls.length ? Math.min(...pnls) : 0,
    }
  })

  /** Asset allocation across bank + subaccount balances. */
  const assetAllocation = computed<AllocationRow[]>(() => {
    const byDenom = new Map<string, { amount: number; symbol: string; logo?: string }>()
    const toHuman = (amt: string, dec: number) => Number(amt) / 10 ** dec

    // Bank balances
    for (const b of balances.value) {
      const human = toHuman(b.amount, b.decimals)
      byDenom.set(b.denom, { amount: human, symbol: b.symbol, logo: (b as any).logo })
    }
    // Subaccount (margin) balances — add to existing
    for (const b of subaccountBalances.value) {
      const existing = byDenom.get(b.denom)
      const human = toHuman(b.amount, b.decimals)
      byDenom.set(b.denom, {
        amount: (existing?.amount ?? 0) + human,
        symbol: existing?.symbol ?? b.symbol,
        logo: existing?.logo ?? (b as any).logo,
      })
    }

    const rows: AllocationRow[] = []
    for (const [denom, info] of byDenom) {
      if (info.amount <= 0) continue
      const price = priceDenom(denom)
      rows.push({
        denom,
        symbol: info.symbol,
        amount: info.amount,
        usdValue: price !== null ? price * info.amount : null,
        pct: null, // filled after total
        logo: info.logo,
      })
    }
    // Compute pct of priced total.
    const pricedTotal = rows.reduce((s, r) => s + (r.usdValue ?? 0), 0)
    for (const r of rows) {
      r.pct = pricedTotal > 0 && r.usdValue !== null ? (r.usdValue / pricedTotal) * 100 : null
    }
    return rows.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))
  })

  const portfolioValue = computed(() =>
    assetAllocation.value.reduce((s, r) => s + (r.usdValue ?? 0), 0),
  )

  return {
    trades,
    tradesLoading,
    tradesError,
    loadTradeHistory,
    realizedPnlSeries,
    unrealizedPnl,
    pnlStats,
    assetAllocation,
    portfolioValue,
  }
}
