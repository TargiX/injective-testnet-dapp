<script setup lang="ts">
import { fmtPrice, fmt, toHumanPrice, toHumanQuantity } from '~/utils/inj-format'

const { recentTrades, tradesLoading, selectedMarket } = useInjective()

const baseSymbol = computed(() => selectedMarket.value?.baseToken?.symbol ?? '')

interface TradeRow {
  price: number
  size: number
  total: number
  side: 'buy' | 'sell'
  time: string
}

const rows = computed<TradeRow[]>(() => {
  const m = selectedMarket.value
  if (!m?.baseToken || !m?.quoteToken) return []
  const bd = m.baseToken.decimals
  const qd = m.quoteToken.decimals

  return [...recentTrades.value]
    .map((t) => ({
      price: toHumanPrice(t.price, bd, qd),
      size: toHumanQuantity(t.quantity, bd),
      total: toHumanPrice(t.price, bd, qd) * toHumanQuantity(t.quantity, bd),
      side: t.tradeDirection === 'sell' || t.orderType === 'sell' ? 'sell' : 'buy',
      time: new Date(Number(t.executedAt)).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }))
    .sort((a, b) => b.total - a.total > 0 ? -1 : 1)
    .slice(0, 50)
    .reverse()
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div v-if="tradesLoading && !rows.length" class="flex-1 flex items-center justify-center text-sm text-[var(--ui-text-muted)]">
      Loading…
    </div>

    <div v-else-if="!rows.length" class="flex-1 flex items-center justify-center text-sm text-[var(--ui-text-muted)]">
      No recent trades
    </div>

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
