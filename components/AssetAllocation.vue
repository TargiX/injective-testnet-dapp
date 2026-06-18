<script setup lang="ts">
import { fmt, fmtPrice } from '~/utils/inj-format'

defineProps<{
  rows: { denom: string; symbol: string; amount: number; usdValue: number | null; pct: number | null; logo?: string }[]
}>()
</script>

<template>
  <div class="space-y-1.5">
    <div v-for="r in rows" :key="r.denom" class="flex items-center gap-2">
      <TokenIcon :logo="r.logo" :symbol="r.symbol" :size="18" />
      <span class="text-[11px] font-semibold w-20 truncate">{{ r.symbol }}</span>
      <!-- allocation bar -->
      <div class="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          class="h-full rounded-full transition-all"
          :class="r.usdValue === null ? 'bg-[var(--ui-text-dimmed)]' : 'bg-accent'"
          :style="{ width: (r.pct ?? 0) + '%' }"
        />
      </div>
      <span class="text-[10px] font-mono tabular-nums text-right w-24">
        <template v-if="r.usdValue !== null">
          {{ fmt(r.usdValue, 2) }}
        </template>
        <template v-else>
          <span class="text-[var(--ui-text-dimmed)]" :title="`${fmt(r.amount, 4)} (no price)`">{{ fmt(r.amount, 2) }}</span>
        </template>
      </span>
      <span v-if="r.pct !== null" class="text-[9px] font-mono tabular-nums text-[var(--ui-text-dimmed)] w-10 text-right">
        {{ r.pct.toFixed(1) }}%
      </span>
      <span v-else class="text-[9px] text-[var(--ui-text-dimmed)] w-10 text-right">—</span>
    </div>
    <p v-if="rows.some(r => r.usdValue === null)" class="pt-1 text-[9px] text-[var(--ui-text-dimmed)]">
      Some assets have no on-chain price and are shown by amount only.
    </p>
  </div>
</template>
