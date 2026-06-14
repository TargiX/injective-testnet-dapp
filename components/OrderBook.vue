<script setup lang="ts">
import {
  toHumanPrice,
  toHumanQuantity,
  fmtPrice,
  fmt,
} from '~/utils/inj-format'

const {
  selectedMarket,
  orderbookBuys,
  orderbookSells,
  orderbookLoading,
  orderbookUpdatedAt,
  fillPrice,
  fillAmount,
} = useInjective()

const LEVELS = 14

interface Row {
  price: number
  size: number
  cum: number
  depth: number
}

function build(
  levels: { price: string; quantity: string }[],
  dir: 'asc' | 'desc',
  baseDecimals: number,
  quoteDecimals: number,
): { rows: Row[]; maxCum: number } {
  const mapped = levels.map((l) => ({
    price: toHumanPrice(l.price, baseDecimals, quoteDecimals),
    size: toHumanQuantity(l.quantity, baseDecimals),
  }))
  mapped.sort((a, b) => (dir === 'asc' ? a.price - b.price : b.price - a.price))
  const top = mapped.slice(0, LEVELS)
  let cum = 0
  const rows: Row[] = top.map((r) => {
    cum += r.size
    return { ...r, cum, depth: 0 }
  })
  return { rows, maxCum: cum }
}

const book = computed(() => {
  const m = selectedMarket.value
  if (!m || !m.baseToken || !m.quoteToken) {
    return { asks: [] as Row[], bids: [] as Row[] }
  }
  const bd = m.baseToken.decimals
  const qd = m.quoteToken.decimals

  const { rows: bids, maxCum: bidMax } = build(orderbookBuys.value, 'desc', bd, qd)
  const { rows: asksAsc, maxCum: askMax } = build(orderbookSells.value, 'asc', bd, qd)

  const max = Math.max(bidMax, askMax, 1)
  for (const r of bids) r.depth = r.cum / max
  for (const r of asksAsc) r.depth = r.cum / max

  return { asks: [...asksAsc].reverse(), bids }
})

const spread = computed(() => {
  const bestAsk = book.value.asks.at(-1)?.price
  const bestBid = book.value.bids[0]?.price
  if (bestAsk == null || bestBid == null) return null
  const abs = bestAsk - bestBid
  const mid = (bestAsk + bestBid) / 2
  return { abs, pct: mid ? (abs / mid) * 100 : 0, mid }
})

const updatedLabel = computed(() => {
  if (!orderbookUpdatedAt.value) return ''
  const secs = Math.max(0, Math.round((Date.now() - orderbookUpdatedAt.value) / 1000))
  return secs < 2 ? 'now' : `${secs}s`
})
</script>

<template>
  <div class="h-full flex flex-col rounded-lg overflow-hidden bg-[var(--ui-bg)] ring ring-[var(--ui-border)]">
    <div class="flex-none flex items-center justify-between px-4 py-2 border-b border-border-soft">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-wider text-[var(--ui-text-muted)]">Order Book</span>
      </div>
      <UBadge variant="subtle" color="success" size="sm">
        <span class="inline-block w-1.5 h-1.5 rounded-full bg-bid mr-1 shadow-glow-bid" />
        {{ orderbookLoading ? 'sync' : 'live' }}
      </UBadge>
    </div>

    <div v-if="!selectedMarket" class="flex-1 flex items-center justify-center text-sm text-[var(--ui-text-muted)]">Select a market.</div>

    <template v-else>
      <div class="flex-none grid grid-cols-[1.2fr_1fr_1fr] px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)] border-b border-border-soft">
        <span>Price</span>
        <span class="text-right">Size</span>
        <span class="text-right">Sum</span>
      </div>

      <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div class="flex-1 overflow-y-auto min-h-0">
          <div v-for="(r, i) in book.asks" :key="'a' + i" class="relative grid grid-cols-[1.2fr_1fr_1fr] px-3 py-[2px] text-[11px] cursor-pointer hover:brightness-125 transition-all" @click="fillPrice = r.price; fillAmount = null">
            <div class="absolute inset-0 right-0 bg-ask-bg" :style="{ width: r.depth * 100 + '%' }" />
            <span class="relative font-mono tabular-nums font-semibold text-ask">{{ fmtPrice(r.price) }}</span>
            <span class="relative font-mono tabular-nums text-right">{{ fmt(r.size, 3) }}</span>
            <span class="relative font-mono tabular-nums text-right text-[var(--ui-text-dimmed)]">{{ fmt(r.cum, 2) }}</span>
          </div>
        </div>

        <div class="flex-none flex items-center justify-between px-3 py-1.5 border-y border-border-soft bg-surface-2">
          <template v-if="spread">
            <span class="font-mono tabular-nums text-sm font-bold">{{ fmtPrice(spread.mid) }}</span>
            <span class="text-[10px] text-[var(--ui-text-dimmed)]">
              <span class="font-mono tabular-nums">{{ fmtPrice(spread.abs) }}</span>
              (<span class="font-mono tabular-nums">{{ spread.pct.toFixed(2) }}%</span>)
            </span>
          </template>
          <span v-else class="text-[var(--ui-text-dimmed)]">—</span>
        </div>

        <div class="flex-1 overflow-y-auto min-h-0">
          <div v-for="(r, i) in book.bids" :key="'b' + i" class="relative grid grid-cols-[1.2fr_1fr_1fr] px-3 py-[2px] text-[11px] cursor-pointer hover:brightness-125 transition-all" @click="fillPrice = r.price; fillAmount = null">
            <div class="absolute inset-0 right-0 bg-bid-bg" :style="{ width: r.depth * 100 + '%' }" />
            <span class="relative font-mono tabular-nums font-semibold text-bid">{{ fmtPrice(r.price) }}</span>
            <span class="relative font-mono tabular-nums text-right">{{ fmt(r.size, 3) }}</span>
            <span class="relative font-mono tabular-nums text-right text-[var(--ui-text-dimmed)]">{{ fmt(r.cum, 2) }}</span>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>
