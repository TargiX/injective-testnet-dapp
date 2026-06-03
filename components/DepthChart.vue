<script setup lang="ts">
import { toHumanPrice, toHumanQuantity, fmtPrice, fmt } from '~/utils/inj-format'

const { orderbookBuys, orderbookSells, selectedMarket } = useInjective()

const W = 320
const H = 150
const PAD = 4
const LEVELS = 40 // levels per side closest to mid

const chart = computed(() => {
  const m = selectedMarket.value
  if (!m?.baseToken || !m?.quoteToken) return null
  const bd = m.baseToken.decimals
  const qd = m.quoteToken.decimals

  const prep = (raw: { price: string; quantity: string }[], dir: 'asc' | 'desc') => {
    const mapped = raw.map((l) => ({
      price: toHumanPrice(l.price, bd, qd),
      size: toHumanQuantity(l.quantity, bd),
    }))
    mapped.sort((a, b) => (dir === 'asc' ? a.price - b.price : b.price - a.price))
    return mapped
  }

  const rawBids = prep(orderbookBuys.value, 'desc')
  const rawAsks = prep(orderbookSells.value, 'asc')
  if (!rawBids.length || !rawAsks.length) return null

  const bestBid = rawBids[0].price
  const bestAsk = rawAsks[0].price
  const mid = (bestBid + bestAsk) / 2

  // Focus on near-spread liquidity (±BAND of mid) so outlier orders far from
  // the mid don't stretch the x-axis flat. Fall back to top-N if too sparse.
  const BAND = 0.35
  const lo = mid * (1 - BAND)
  const hi = mid * (1 + BAND)
  const cumulate = (levels: { price: number; size: number }[]) => {
    let band = levels.filter((l) => l.price >= lo && l.price <= hi)
    if (band.length < 1) band = levels.slice(0, LEVELS) // only if nothing near mid
    let cum = 0
    return band.slice(0, LEVELS).map((l) => ({ price: l.price, cum: (cum += l.size) }))
  }

  const bids = cumulate(rawBids) // best→worse (high→low price)
  const asks = cumulate(rawAsks) // best→worse (low→high price)

  // Fixed, symmetric price domain around mid so the mid line stays centered and
  // bids fill the left half / asks the right half — the classic depth look.
  const minPrice = lo
  const maxPrice = hi
  const spanPrice = maxPrice - minPrice || 1
  const maxCum = Math.max(bids[bids.length - 1].cum, asks[asks.length - 1].cum) || 1

  const x = (p: number) =>
    PAD + (Math.min(Math.max((p - minPrice) / spanPrice, 0), 1)) * (W - 2 * PAD)
  const y = (c: number) => H - PAD - (c / maxCum) * (H - 2 * PAD)
  const baseY = H - PAD

  // bids drawn from mid leftward: order low→high price for a left-to-right path
  const bidsAsc = [...bids].reverse()
  const bidPath =
    `M${x(bidsAsc[0].price).toFixed(1)},${baseY.toFixed(1)} ` +
    bidsAsc.map((l) => `L${x(l.price).toFixed(1)},${y(l.cum).toFixed(1)}`).join(' ') +
    ` L${x(bestBid).toFixed(1)},${baseY.toFixed(1)} Z`

  const askPath =
    `M${x(bestAsk).toFixed(1)},${baseY.toFixed(1)} ` +
    asks.map((l) => `L${x(l.price).toFixed(1)},${y(l.cum).toFixed(1)}`).join(' ') +
    ` L${x(maxPrice).toFixed(1)},${baseY.toFixed(1)} Z`

  const bidLine = 'M' + bidsAsc.map((l) => `${x(l.price).toFixed(1)},${y(l.cum).toFixed(1)}`).join(' L')
  const askLine = 'M' + asks.map((l) => `${x(l.price).toFixed(1)},${y(l.cum).toFixed(1)}`).join(' L')

  return {
    bidPath,
    askPath,
    bidLine,
    askLine,
    midX: x(mid),
    mid,
    minPrice,
    maxPrice,
    maxCum,
  }
})
</script>

<template>
  <section class="card depthchart">
    <div class="card-head">
      <span class="card-title">Depth</span>
      <span v-if="chart" class="num faint mid">mid {{ fmtPrice(chart.mid) }}</span>
    </div>

    <div v-if="!chart" class="state muted">Waiting for order book…</div>

    <div v-else class="svg-wrap">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="svg">
        <defs>
          <linearGradient id="bidFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1fb87a" stop-opacity="0.32" />
            <stop offset="100%" stop-color="#1fb87a" stop-opacity="0.02" />
          </linearGradient>
          <linearGradient id="askFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f0556a" stop-opacity="0.32" />
            <stop offset="100%" stop-color="#f0556a" stop-opacity="0.02" />
          </linearGradient>
        </defs>
        <path :d="chart.bidPath" fill="url(#bidFill)" />
        <path :d="chart.askPath" fill="url(#askFill)" />
        <path :d="chart.bidLine" fill="none" stroke="#1fb87a" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        <path :d="chart.askLine" fill="none" stroke="#f0556a" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        <line
          :x1="chart.midX"
          :x2="chart.midX"
          y1="0"
          :y2="H"
          stroke="#5b677a"
          stroke-width="1"
          stroke-dasharray="3 3"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <div class="axis">
        <span class="num bid">{{ fmtPrice(chart.minPrice) }}</span>
        <span class="num faint">cum size · max {{ fmt(chart.maxCum, 0) }}</span>
        <span class="num ask">{{ fmtPrice(chart.maxPrice) }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mid {
  font-size: 12px;
}
.svg-wrap {
  padding: 10px 10px 6px;
}
.svg {
  display: block;
  width: 100%;
  height: 150px;
}
.axis {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 2px;
  font-size: 10px;
}
.bid {
  color: var(--bid);
}
.ask {
  color: var(--ask);
}
.state {
  padding: 40px 16px;
  text-align: center;
}
</style>
