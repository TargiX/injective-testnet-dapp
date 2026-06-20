<script setup lang="ts">
import { cleanName } from '~/utils/inj-format'

const {
  markets,
  marketsLoading,
  marketsError,
  selectedMarketId,
  selectMarket,
  mode,
  switchMode,
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
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-list" class="size-3.5 text-accent" />
        <div class="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
          <button
            class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
            :class="mode === 'spot'
              ? 'bg-surface-3 text-[var(--ui-text)]'
              : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
            @click="switchMode('spot')"
          >
            Spot
          </button>
          <button
            class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
            :class="mode === 'perp'
              ? 'bg-surface-3 text-[var(--ui-text)]'
              : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
            @click="switchMode('perp')"
          >
            Perp
          </button>
        </div>
      </div>
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
    <EmptyState
      v-else-if="marketsLoading && !markets.length"
      icon="i-lucide-list"
      message="Loading markets"
      loading
    />

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
          <UIcon
            name="i-lucide-star"
            class="size-3.5"
            :class="favorites.includes(m.marketId) ? 'text-accent' : ''"
            :filled="favorites.includes(m.marketId)"
          />
        </button>
        <TokenIcon :logo="(m.raw as any)?.baseToken?.logo" :symbol="m.baseSymbol" :size="18" />
        <span class="text-[13px] font-semibold whitespace-nowrap leading-tight">
          <span class="text-[var(--ui-text-highlighted)]">{{ m.baseSymbol }}</span>
          <span class="text-[var(--ui-text-dimmed)] mx-0.5 font-normal">/</span>
          <span class="text-[var(--ui-text-muted)]">{{ m.quoteSymbol }}</span>
        </span>
        <span
          v-if="m.kind === 'perp'"
          class="ml-1 px-1 py-0.5 rounded text-[8px] font-bold uppercase bg-accent/15 text-accent"
        >
          Perp
        </span>
        <span class="ml-auto text-[10px] text-[var(--ui-text-dimmed)] max-w-[70px] truncate text-right">
          {{ cleanName((m.raw as any)?.baseToken?.name) }}
        </span>
      </li>
      <li v-if="!filtered.length" class="flex flex-col items-center justify-center gap-2 py-8 text-[var(--ui-text-muted)] cursor-default">
        <UIcon name="i-lucide-search-x" class="size-7 text-[var(--ui-text-dimmed)]" />
        <span class="text-sm">No matches.</span>
      </li>
    </ul>
  </div>
</template>
