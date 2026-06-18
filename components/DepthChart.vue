<script setup lang="ts">
import { fmtPrice, fmt } from '~/utils/inj-format'

const { orderbookBuys, orderbookSells, selectedMarket } = useInjective()

const W = 320
const H = 150
const PAD = 4
const LEVELS = 40

const chart = computed(() => {
  const m = selectedMarket.value
  if (!m?.marketId) return null
  const bd = m.baseDecimals
  const qd = m.quoteDecimals
  const kind = m.kind

  const prep = (raw: { price: string; quantity: string }[], dir: 'asc' | 'desc') => {
    const toPrice = kind === 'spot'
      ? (p: string) => Number(p) * 10 ** (bd - qd)
      : (p: string) => Number(p) / 10 ** qd
    const toSize = kind === 'spot'
      ? (q: string) => Number(q) / 10 ** bd
      : (q: string) => Number(q)
    const mapped = raw.map((l) => ({
      price: toPrice(l.price),
      size: toSize(l.quantity),
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

  const BAND = 0.35
  const lo = mid * (1 - BAND)
  const hi = mid * (1 + BAND)
  const cumulate = (levels: { price: number; size: number }[]) => {
    let band = levels.filter((l) => l.price >= lo && l.price <= hi)
    if (band.length < 1) band = levels.slice(0, LEVELS)
    let cum = 0
    return band.slice(0, LEVELS).map((l) => ({ price: l.price, cum: (cum += l.size) }))
  }

  const bids = cumulate(rawBids)
  const asks = cumulate(rawAsks)

  const minPrice = lo
  const maxPrice = hi
  const spanPrice = maxPrice - minPrice || 1
  const maxCum = Math.max(bids[bids.length - 1].cum, asks[asks.length - 1].cum) || 1

  const x = (p: number) =>
    PAD + (Math.min(Math.max((p - minPrice) / spanPrice, 0), 1)) * (W - 2 * PAD)
  const y = (c: number) => H - PAD - (c / maxCum) * (H - 2 * PAD)
  const baseY = H - PAD

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
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold uppercase tracking-wider text-[var(--ui-text-muted)]">Depth</span>
        <span v-if="chart" class="font-mono tabular-nums text-xs text-[var(--ui-text-dimmed)]">mid {{ fmtPrice(chart.mid) }}</span>
      </div>
    </template>

    <div v-if="!chart" class="py-10 text-center text-sm text-[var(--ui-text-muted)]">Waiting for order book…</div>

    <div v-else class="px-2.5 pt-2 pb-1">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="block w-full h-[150px]">
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
      <div class="flex items-center justify-between text-[10px] font-mono tabular-nums px-1 pt-1">
        <span class="text-bid">{{ fmtPrice(chart.minPrice) }}</span>
        <span class="text-[var(--ui-text-dimmed)]">cum size · max {{ fmt(chart.maxCum, 0) }}</span>
        <span class="text-ask">{{ fmtPrice(chart.maxPrice) }}</span>
      </div>
    </div>
  </UCard>
</template>
