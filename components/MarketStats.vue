<script setup lang="ts">
import { fmtPrice, fmt } from '~/utils/inj-format'

const { selectedMarket, marketStats } = useInjective()

const baseSymbol = computed(() => selectedMarket.value?.baseToken?.symbol ?? '')
const quoteSymbol = computed(() => selectedMarket.value?.quoteToken?.symbol ?? '')
const ticker = computed(() => selectedMarket.value?.ticker ?? '')

const isUp = computed(() => (marketStats.value?.changePct ?? 0) >= 0)
</script>

<template>
  <div v-if="selectedMarket" class="flex-none flex items-center gap-3 lg:gap-5 px-3 lg:px-5 py-1.5 border-b border-border-soft bg-[var(--ui-bg)] text-[11px]">
    <div class="flex items-center gap-1.5">
      <TokenIcon :logo="(selectedMarket.baseToken as any)?.logo" :symbol="baseSymbol" :size="16" />
      <span class="font-bold text-[12px]">{{ ticker }}</span>
    </div>

    <template v-if="marketStats">
      <div class="flex items-center gap-1.5">
        <span class="text-[var(--ui-text-dimmed)]">Last</span>
        <span class="font-mono tabular-nums font-semibold" :class="isUp ? 'text-bid' : 'text-ask'">
          {{ fmtPrice(marketStats.lastPrice) }}
        </span>
      </div>

      <div class="flex items-center gap-1">
        <span class="text-[var(--ui-text-dimmed)]">24h</span>
        <span class="font-mono tabular-nums font-semibold" :class="isUp ? 'text-bid' : 'text-ask'">
          {{ isUp ? '+' : '' }}{{ marketStats.changePct.toFixed(2) }}%
        </span>
      </div>

      <div class="hidden xl:flex items-center gap-1">
        <span class="text-[var(--ui-text-dimmed)]">High</span>
        <span class="font-mono tabular-nums">{{ fmtPrice(marketStats.high) }}</span>
      </div>

      <div class="hidden xl:flex items-center gap-1">
        <span class="text-[var(--ui-text-dimmed)]">Low</span>
        <span class="font-mono tabular-nums">{{ fmtPrice(marketStats.low) }}</span>
      </div>

      <div class="hidden lg:flex items-center gap-1">
        <span class="text-[var(--ui-text-dimmed)]">Vol</span>
        <span class="font-mono tabular-nums">{{ fmt(marketStats.volume, 0) }} {{ baseSymbol }}</span>
      </div>

      <div class="flex items-center gap-1">
        <span class="text-[var(--ui-text-dimmed)]">Vol</span>
        <span class="font-mono tabular-nums">{{ fmt(marketStats.quoteVolume, 0) }} {{ quoteSymbol }}</span>
      </div>
    </template>

    <template v-else>
      <span class="text-[var(--ui-text-dimmed)]">Loading stats…</span>
    </template>
  </div>
</template>
