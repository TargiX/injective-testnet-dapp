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

const favorites = useState<string[]>('inj-favorites', () => [
  '0xa508cb32923323679f29a032c70342c147c17d0145625922b0ef22e955c844c0',
  '0x35fd4fa9291ea68ce5eef6e0ea8567c7744c1891c2059ef08580ba2e7a31f101',
])

function toggleFav(marketId: string) {
  const idx = favorites.value.indexOf(marketId)
  if (idx >= 0) {
    favorites.value = favorites.value.filter(id => id !== marketId)
  } else {
    favorites.value = [marketId, ...favorites.value]
  }
}

const filtered = computed(() => {
  const q = query.value.trim().toUpperCase()
  let list = markets.value
  if (q) list = list.filter(m => m.ticker.toUpperCase().includes(q))

  const favIds = favorites.value
  return [...list].sort((a, b) => {
    const aFav = favIds.includes(a.marketId) ? 0 : 1
    const bFav = favIds.includes(b.marketId) ? 0 : 1
    if (aFav !== bFav) return aFav - bFav
    return a.ticker.localeCompare(b.ticker)
  })
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
        class="flex items-center gap-1.5 px-1.5 py-1.5 rounded-md cursor-pointer border border-transparent transition-colors hover:bg-surface-2"
        :class="{ 'bg-surface-2 !border-accent-dim': m.marketId === selectedMarketId }"
        @click="selectMarket(m.marketId)"
      >
        <button
          class="flex-none w-5 h-5 grid place-items-center text-[var(--ui-text-dimmed)] hover:text-accent transition-colors"
          @click.stop="toggleFav(m.marketId)"
        >
          <svg
            class="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            :fill="favorites.includes(m.marketId) ? 'currentColor' : 'none'"
            stroke="currentColor"
            stroke-width="2"
            :class="favorites.includes(m.marketId) ? 'text-accent' : ''"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
        <TokenIcon :logo="(m.baseToken as any)?.logo" :symbol="m.baseToken?.symbol" :size="18" />
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
