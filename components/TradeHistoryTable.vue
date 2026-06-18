<script setup lang="ts">
import { fmtPrice, fmt } from '~/utils/inj-format'

const props = defineProps<{
  trades: {
    tradeId: string
    ticker: string
    direction: string
    price: number
    quantity: number
    fee: number
    pnl: number | null
    executedAt: number
    kind: 'spot' | 'perp'
    isLiquidation?: boolean
  }[]
}>()

const filterMarket = ref('all')
const filterSide = ref<'all' | 'buy' | 'sell'>('all')

const filtered = computed(() => {
  return props.trades.filter(t => {
    if (filterMarket.value !== 'all' && t.ticker !== filterMarket.value) return false
    if (filterSide.value !== 'all') {
      const side = t.direction === 'buy' || t.direction === 'long' ? 'buy' : 'sell'
      if (side !== filterSide.value) return false
    }
    return true
  })
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- Filters -->
    <div class="flex items-center gap-2 flex-wrap">
      <input
        v-model="filterMarket"
        list="market-list"
        placeholder="All markets"
        class="bg-surface-2 rounded px-2 py-1 text-[11px] border border-border-soft outline-none w-32 focus:border-accent-dim"
      />
      <datalist id="market-list">
        <option v-for="t in [...new Set(trades.map(t => t.ticker))]" :key="t" :value="t" />
      </datalist>
      <div class="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
        <button
          v-for="s in (['all', 'buy', 'sell'] as const)"
          :key="s"
          class="px-2 py-0.5 text-[10px] font-semibold uppercase rounded transition-colors"
          :class="filterSide === s ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
          @click="filterSide = s"
        >
          {{ s }}
        </button>
      </div>
      <span class="ml-auto text-[10px] text-[var(--ui-text-dimmed)]">{{ filtered.length }} trades</span>
    </div>

    <!-- Table -->
    <div v-if="!filtered.length" class="text-center text-sm text-[var(--ui-text-muted)] py-6">
      No trades match the filters
    </div>
    <div v-else class="overflow-x-auto">
      <div class="min-w-[480px]">
        <div class="grid grid-cols-[1fr_1.2fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-2 px-2 py-1 text-[9px] uppercase tracking-wider text-[var(--ui-text-dimmed)] border-b border-border-soft">
          <span>Time</span>
          <span>Market</span>
          <span class="text-right">Price</span>
          <span class="text-right">Size</span>
          <span class="text-right">Fee</span>
          <span class="text-right">PnL</span>
        </div>
        <div class="max-h-[400px] overflow-y-auto">
          <div
            v-for="t in filtered"
            :key="t.tradeId"
            class="grid grid-cols-[1fr_1.2fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-2 px-2 py-1.5 text-[10px] border-b border-border-soft last:border-b-0 items-center"
          >
            <span class="font-mono tabular-nums text-[var(--ui-text-dimmed)] truncate">
              {{ new Date(t.executedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
            </span>
            <div class="flex items-center gap-1 min-w-0">
              <span
                class="text-[8px] font-bold uppercase px-0.5 rounded flex-none"
                :class="(t.direction === 'buy' || t.direction === 'long') ? 'bg-bid/15 text-bid' : 'bg-ask/15 text-ask'"
              >
                {{ (t.direction === 'buy' || t.direction === 'long') ? 'B' : 'S' }}
              </span>
              <span class="truncate">{{ t.ticker }}</span>
              <span v-if="t.kind === 'perp'" class="text-[7px] text-accent flex-none">P</span>
              <span v-if="t.isLiquidation" class="text-[7px] text-ask flex-none">LIQ</span>
            </div>
            <span class="text-right font-mono tabular-nums truncate">{{ fmtPrice(t.price) }}</span>
            <span class="text-right font-mono tabular-nums truncate">{{ fmt(t.quantity, 4) }}</span>
            <span class="text-right font-mono tabular-nums text-[var(--ui-text-dimmed)] truncate">{{ fmt(t.fee, 4) }}</span>
            <span
              class="text-right font-mono tabular-nums truncate"
              :class="t.pnl === null ? 'text-[var(--ui-text-dimmed)]' : (t.pnl >= 0 ? 'text-bid' : 'text-ask')"
            >
              {{ t.pnl === null ? '—' : (t.pnl >= 0 ? '+' : '') + fmt(t.pnl, 2) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
