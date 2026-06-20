<script setup lang="ts">
/**
 * Consistent empty/loading/connect state: a dimmed leading icon above a short
 * message. Used across panels (OrderBook, Positions, OpenOrders, TradeHistory,
 * BalancePanel, SpotMarkets) so every "nothing here" reads the same way.
 */
withDefaults(defineProps<{
  icon?: string
  message: string
  hint?: string
  loading?: boolean
}>(), {
  icon: 'i-lucide-inbox',
  loading: false,
})
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center gap-2 py-6 text-[var(--ui-text-muted)]">
    <UIcon
      :name="loading ? 'i-lucide-loader-circle' : icon"
      class="size-7 text-[var(--ui-text-dimmed)]"
      :class="loading ? 'animate-spin' : ''"
    />
    <div class="text-center">
      <p class="text-sm">{{ loading ? 'Loading…' : message }}</p>
      <p v-if="hint && !loading" class="text-[10px] text-[var(--ui-text-dimmed)] mt-1">{{ hint }}</p>
    </div>
  </div>
</template>
