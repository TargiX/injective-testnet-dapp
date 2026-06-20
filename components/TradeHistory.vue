<script setup lang="ts">
import { fmtPrice, fmt } from '~/utils/inj-format'

const { recentTrades, tradesLoading, selectedMarket } = useInjective()

const baseSymbol = computed(() => selectedMarket.value?.baseSymbol ?? '')

interface TradeRow {
  price: number
  size: number
  total: number
  side: 'buy' | 'sell'
  time: string
}

const rows = computed<TradeRow[]>(() => {
  const m = selectedMarket.value
  if (!m?.marketId) return []
  // Spot: price = chain * 10^(bd-qd), size = chain / 10^bd
  // Perp:  price = chain / 10^qd,        size = chain (no decimals)
  const toPrice = m.kind === 'spot'
    ? (p: string) => Number(p) * 10 ** (m.baseDecimals - m.quoteDecimals)
    : (p: string) => Number(p) / 10 ** m.quoteDecimals
  const toSize = m.kind === 'spot'
    ? (q: string) => Number(q) / 10 ** m.baseDecimals
    : (q: string) => Number(q)

  return [...recentTrades.value]
    .map((t): TradeRow => {
      const price = toPrice(t.price)
      const size = toSize(t.quantity)
      const side: 'buy' | 'sell' = t.tradeDirection === 'sell' || t.orderType === 'sell' ? 'sell' : 'buy'
      return {
        price,
        size,
        total: price * size,
        side,
        time: new Date(Number(t.executedAt)).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }
    })
    .sort((a, b) => b.total - a.total > 0 ? -1 : 1)
    .slice(0, 50)
    .reverse()
})
</script>

<template>
  <div class="h-full flex flex-col">
    <EmptyState
      v-if="tradesLoading && !rows.length"
      icon="i-lucide-zap"
      message="Loading trades"
      loading
    />

    <EmptyState
      v-else-if="!rows.length"
      icon="i-lucide-zap"
      message="No recent trades"
    />

    <template v-else>
      <div class="flex-none grid grid-cols-[1fr_1fr_1fr_auto] max-lg:grid-cols-[1fr_1fr_auto] px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)] border-b border-border-soft">
        <span>Price</span>
        <span class="text-right">Amount</span>
        <span class="text-right max-lg:hidden">Total</span>
        <span class="text-right w-14 max-lg:w-12">Time</span>
      </div>
      <div class="flex-1 overflow-y-auto min-h-0">
        <div
          v-for="(r, i) in rows"
          :key="i"
          class="grid grid-cols-[1fr_1fr_1fr_auto] max-lg:grid-cols-[1fr_1fr_auto] px-3 py-[2px] text-[11px] max-lg:text-[10px] border-b border-border-soft last:border-b-0"
        >
          <span class="font-mono tabular-nums font-semibold truncate" :class="r.side === 'buy' ? 'text-bid' : 'text-ask'">
            {{ fmtPrice(r.price) }}
          </span>
          <span class="font-mono tabular-nums text-right truncate">{{ fmt(r.size, 4) }}</span>
          <span class="font-mono tabular-nums text-right text-[var(--ui-text-muted)] max-lg:hidden">{{ fmt(r.total, 2) }}</span>
          <span class="font-mono tabular-nums text-right text-[var(--ui-text-dimmed)] w-14 max-lg:w-12">{{ r.time }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
