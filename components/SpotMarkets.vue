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
  <section class="card markets">
    <div class="card-head">
      <span class="card-title">Spot Markets</span>
      <span class="pill">{{ markets.length }}</span>
    </div>

    <div class="search">
      <input
        v-model="query"
        type="text"
        placeholder="Filter e.g. INJ"
        spellcheck="false"
      />
    </div>

    <div v-if="marketsError" class="state err">{{ marketsError }}</div>
    <div v-else-if="marketsLoading && !markets.length" class="state muted">
      Loading markets…
    </div>

    <ul v-else class="list">
      <li
        v-for="m in filtered"
        :key="m.marketId"
        :class="{ active: m.marketId === selectedMarketId }"
        @click="selectMarket(m.marketId)"
      >
        <TokenIcon :logo="(m.baseToken as any)?.logo" :symbol="m.baseToken?.symbol" :size="24" />
        <span class="pair">
          <span class="base">{{ m.baseToken?.symbol }}</span>
          <span class="slash">/</span>
          <span class="quote">{{ m.quoteToken?.symbol }}</span>
        </span>
        <span class="name faint">{{ cleanName((m.baseToken as any)?.name) }}</span>
      </li>
      <li v-if="!filtered.length" class="state muted no-hover">No matches.</li>
    </ul>
  </section>
</template>

<style scoped>
.markets {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.search {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
}
.search input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 7px 10px;
  color: var(--text);
  font-size: 13px;
  font-family: var(--mono);
  outline: none;
}
.search input:focus {
  border-color: var(--accent-dim);
}
.list {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  flex: 1;
}
.list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border-radius: 7px;
  cursor: pointer;
  border: 1px solid transparent;
}
.list li:hover:not(.no-hover) {
  background: var(--bg-elev-2);
}
.list li.active {
  background: var(--bg-elev-2);
  border-color: var(--accent-dim);
}
.pair {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.base {
  color: var(--text);
}
.slash {
  color: var(--text-faint);
  margin: 0 3px;
  font-weight: 400;
}
.quote {
  color: var(--text-dim);
}
.name {
  margin-left: auto;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 90px;
  text-align: right;
}
.state {
  padding: 18px 16px;
  font-size: 13px;
}
.no-hover {
  cursor: default;
}
</style>
