<script setup lang="ts">
import { cleanName } from '~/utils/inj-format'

const {
  markets,
  marketsLoading,
  marketsError,
  selectedMarketId,
  selectMarket,
} = useInjective()

const query = ref('')
const filtered = computed(() => {
  const q = query.value.trim().toUpperCase()
  if (!q) return markets.value
  return markets.value.filter((m) => m.ticker.toUpperCase().includes(q))
})
</script>

<template>
  <div class="h-full flex flex-col rounded-lg overflow-hidden bg-[var(--ui-bg)] ring ring-[var(--ui-border)]">
    <div class="flex-none flex items-center justify-between px-4 py-2 border-b border-border-soft">
      <span class="text-xs font-bold uppercase tracking-wider text-[var(--ui-text-muted)]">Spot Markets</span>
      <UBadge variant="subtle" size="sm">{{ markets.length }}</UBadge>
    </div>

    <div class="flex-none px-3 py-2 border-b border-border-soft">
      <UInput
        v-model="query"
        placeholder="Filter e.g. INJ"
        size="sm"
        icon="i-lucide-search"
      />
    </div>

    <div v-if="marketsError" class="p-4 text-ask text-sm">{{ marketsError }}</div>
    <div v-else-if="marketsLoading && !markets.length" class="p-4 text-sm text-[var(--ui-text-muted)]">
      Loading markets…
    </div>

    <ul v-else class="list-none m-0 p-1 overflow-y-auto flex-1 min-h-0">
      <li
        v-for="m in filtered"
        :key="m.marketId"
        class="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer border border-transparent transition-colors hover:bg-surface-2"
        :class="{ 'bg-surface-2 !border-accent-dim': m.marketId === selectedMarketId }"
        @click="selectMarket(m.marketId)"
      >
        <TokenIcon :logo="(m.baseToken as any)?.logo" :symbol="m.baseToken?.symbol" :size="20" />
        <span class="text-[13px] font-semibold whitespace-nowrap leading-tight">
          <span class="text-[var(--ui-text-highlighted)]">{{ m.baseToken?.symbol }}</span>
          <span class="text-[var(--ui-text-dimmed)] mx-0.5 font-normal">/</span>
          <span class="text-[var(--ui-text-muted)]">{{ m.quoteToken?.symbol }}</span>
        </span>
        <span class="ml-auto text-[10px] text-[var(--ui-text-dimmed)] max-w-[70px] truncate text-right">
          {{ cleanName((m.baseToken as any)?.name) }}
        </span>
      </li>
      <li v-if="!filtered.length" class="p-4 text-sm text-[var(--ui-text-muted)] text-center cursor-default">
        No matches.
      </li>
    </ul>
  </div>
</template>
