<script setup lang="ts">
import { fmtPrice } from '~/utils/inj-format'

const { pricePoints, selectedMarket, tradesLoading } = useInjective()

const W = 600
const H = 160
const PAD = 6

const chart = computed(() => {
  const pts = pricePoints.value
  if (pts.length < 2) return null

  const prices = pts.map((p) => p.p)
  const times = pts.map((p) => p.t)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const minT = times[0]
  const maxT = times[times.length - 1]
  const spanP = maxP - minP || 1
  const spanT = maxT - minT || 1

  const x = (t: number) => PAD + ((t - minT) / spanT) * (W - 2 * PAD)
  const y = (p: number) => H - PAD - ((p - minP) / spanP) * (H - 2 * PAD)

  const coords = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.p).toFixed(1)}`)
  const line = `M${coords.join(' L')}`
  const area = `M${x(minT).toFixed(1)},${(H - PAD).toFixed(1)} L${coords.join(
    ' L',
  )} L${x(maxT).toFixed(1)},${(H - PAD).toFixed(1)} Z`

  const last = prices[prices.length - 1]
  const first = prices[0]
  const changePct = ((last - first) / first) * 100
  const up = last >= first

  return { line, area, last, changePct, up, minP, maxP }
})
</script>

<template>
  <section class="card pricechart">
    <div class="card-head">
      <div class="title-wrap">
        <span class="card-title">Price</span>
        <span v-if="selectedMarket" class="pair-id">
          <span class="pair-icons">
            <TokenIcon :logo="(selectedMarket.baseToken as any)?.logo" :symbol="selectedMarket.baseToken?.symbol" :size="18" />
            <TokenIcon class="q" :logo="(selectedMarket.quoteToken as any)?.logo" :symbol="selectedMarket.quoteToken?.symbol" :size="18" />
          </span>
          <span class="ticker num">{{ selectedMarket.ticker }}</span>
        </span>
      </div>
      <div v-if="chart" class="last-wrap">
        <span class="num last" :class="chart.up ? 'up' : 'down'">
          {{ fmtPrice(chart.last) }}
        </span>
        <span class="num chg" :class="chart.up ? 'up' : 'down'">
          {{ chart.up ? '▲' : '▼' }} {{ Math.abs(chart.changePct).toFixed(2) }}%
        </span>
      </div>
    </div>

    <div v-if="!chart" class="state muted">
      {{ tradesLoading ? 'Loading trades…' : 'Not enough trade history.' }}
    </div>

    <div v-else class="svg-wrap">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="svg">
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" :stop-color="chart.up ? '#1fb87a' : '#f0556a'" stop-opacity="0.28" />
            <stop offset="100%" :stop-color="chart.up ? '#1fb87a' : '#f0556a'" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path :d="chart.area" fill="url(#priceFill)" />
        <path
          :d="chart.line"
          fill="none"
          :stroke="chart.up ? '#1fb87a' : '#f0556a'"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
          stroke-linejoin="round"
        />
      </svg>
      <div class="axis">
        <span class="num faint">{{ fmtPrice(chart.maxP) }}</span>
        <span class="num faint">{{ fmtPrice(chart.minP) }}</span>
      </div>
    </div>

    <div class="foot faint">last {{ pricePoints.length }} trades · via <code>fetchTrades</code></div>
  </section>
</template>

<style scoped>
.title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pair-id {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.pair-icons {
  display: inline-flex;
  align-items: center;
}
.pair-icons .q {
  margin-left: -7px;
}
.ticker {
  font-size: 13px;
  font-weight: 600;
}
.last-wrap {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.last {
  font-size: 16px;
  font-weight: 700;
}
.chg {
  font-size: 12px;
  font-weight: 600;
}
.up {
  color: var(--bid);
}
.down {
  color: var(--ask);
}
.svg-wrap {
  position: relative;
  padding: 8px 10px 4px;
}
.svg {
  display: block;
  width: 100%;
  height: 160px;
}
.axis {
  position: absolute;
  top: 8px;
  right: 12px;
  bottom: 4px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  font-size: 10px;
  pointer-events: none;
}
.state {
  padding: 40px 16px;
  text-align: center;
}
.foot {
  padding: 6px 16px 12px;
  font-size: 11px;
}
.foot code {
  font-family: var(--mono);
}
</style>
