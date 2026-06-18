<script setup lang="ts">
import { fmtPrice, fmt } from '~/utils/inj-format'

const {
  address,
  isConnected,
  positions,
  loadPositions,
  submitting,
  closePosition,
  selectedMarketId,
} = useInjective()

const toast = useToast()

const showAllMarkets = ref(false)

const visible = computed(() => {
  if (showAllMarkets.value) return positions.value
  return positions.value.filter(p => p.marketId === selectedMarketId.value)
})

// Aggregate unrealized PnL across visible positions (for the header chip).
const totalUpnl = computed(() =>
  visible.value.reduce((sum, p) => sum + p.upnl, 0),
)

// Close-position confirm modal.
const closingPos = ref<null | (typeof positions.value[number])>(null)
const closeOpen = ref(false)
const closing = ref(false)

function askClose(p: typeof positions.value[number]) {
  closingPos.value = p
  closeOpen.value = true
}

async function confirmClose() {
  const p = closingPos.value
  if (!p) return
  closing.value = true
  const result = await closePosition(p)
  closing.value = false
  if ('error' in result) {
    closeOpen.value = false
    toast.add({ title: 'Close failed', description: result.error, color: 'error' })
  } else {
    closeOpen.value = false
    toast.add({
      title: `Closing ${p.direction === 'long' ? 'long' : 'short'} ${fmt(p.quantity, 4)}`,
      description: `${p.ticker} @ ~${fmtPrice(p.markPrice)}`,
      color: 'success',
    })
  }
}

watch(address, () => {
  if (address.value) loadPositions()
}, { immediate: true })
</script>

<template>
  <div class="h-full flex flex-col rounded-lg overflow-hidden bg-[var(--ui-bg)] ring ring-[var(--ui-border)]">
    <div class="flex-none flex items-center justify-between px-4 py-2 border-b border-border-soft">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-wider text-[var(--ui-text-muted)]">Positions</span>
        <UBadge v-if="visible.length" variant="subtle" size="sm">{{ visible.length }}</UBadge>
        <span
          v-if="visible.length"
          class="text-[10px] font-mono tabular-nums"
          :class="totalUpnl >= 0 ? 'text-bid' : 'text-ask'"
        >
          {{ totalUpnl >= 0 ? '+' : '' }}{{ fmt(totalUpnl, 2) }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors"
          :class="!showAllMarkets ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
          @click="showAllMarkets = false"
        >
          This Market
        </button>
        <button
          class="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors"
          :class="showAllMarkets ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
          @click="showAllMarkets = true"
        >
          All
        </button>
        <UButton
          variant="ghost"
          size="xs"
          :loading="submitting"
          icon="i-lucide-rotate-ccw"
          @click="loadPositions"
        />
      </div>
    </div>

    <div v-if="!isConnected" class="flex-1 flex items-center justify-center text-sm text-[var(--ui-text-muted)] py-6">
      Connect wallet to view positions
    </div>

    <div v-else-if="!visible.length" class="flex-1 flex items-center justify-center text-sm text-[var(--ui-text-muted)] py-6">
      No open positions
    </div>

    <template v-else>
      <div class="flex-none grid grid-cols-[1fr_0.6fr_0.8fr_0.8fr_1fr_auto] max-lg:grid-cols-[1fr_0.6fr_1fr_auto] px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)] border-b border-border-soft">
        <span>Market</span>
        <span class="text-right">Size</span>
        <span class="text-right">Entry</span>
        <span class="text-right max-lg:hidden">Liq.</span>
        <span class="text-right">PnL</span>
        <span class="w-10"></span>
      </div>
      <div class="flex-1 overflow-y-auto min-h-0">
        <div
          v-for="(p, i) in visible"
          :key="p.marketId + i"
          class="grid grid-cols-[1fr_0.6fr_0.8fr_0.8fr_1fr_auto] max-lg:grid-cols-[1fr_0.6fr_1fr_auto] items-center px-3 py-1.5 border-b border-border-soft last:border-b-0"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <span
              class="text-[9px] font-bold uppercase px-1 py-0.5 rounded flex-none"
              :class="p.direction === 'long' ? 'bg-bid/15 text-bid' : 'bg-ask/15 text-ask'"
            >
              {{ p.direction === 'long' ? 'L' : 'S' }}
            </span>
            <span class="text-[11px] max-lg:text-[10px] font-semibold truncate">
              {{ p.ticker }}
            </span>
            <span class="text-[9px] text-[var(--ui-text-dimmed)] hidden lg:inline">{{ p.leverage }}x</span>
          </div>
          <span class="text-right font-mono tabular-nums text-[11px] max-lg:text-[10px] truncate">
            {{ fmt(p.quantity, 4) }}
          </span>
          <span class="text-right font-mono tabular-nums text-[11px] max-lg:text-[10px] truncate">
            {{ fmtPrice(p.entryPrice) }}
          </span>
          <span class="text-right font-mono tabular-nums text-[11px] max-lg:hidden truncate text-[var(--ui-text-muted)]">
            {{ fmtPrice(p.liquidationPrice) }}
          </span>
          <span
            class="text-right font-mono tabular-nums text-[11px] max-lg:text-[10px] font-semibold truncate"
            :class="p.upnl >= 0 ? 'text-bid' : 'text-ask'"
            :title="`Mark ${fmtPrice(p.markPrice)}`"
          >
            {{ p.upnl >= 0 ? '+' : '' }}{{ fmt(p.upnl, 2) }}
            <span class="text-[9px] opacity-70">({{ p.upnlPct >= 0 ? '+' : '' }}{{ p.upnlPct.toFixed(1) }}%)</span>
          </span>
          <span class="w-10 flex justify-end">
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-x"
              :loading="submitting"
              :disabled="submitting"
              @click="askClose(p)"
            />
          </span>
        </div>
      </div>
    </template>

    <!-- Close-position confirm modal -->
    <UModal
      v-model:open="closeOpen"
      :ui="{ content: 'max-w-sm' }"
      :close="!closing"
      :dismissible="!closing"
    >
      <template #title>
        <span class="text-base font-bold text-ask">Close Position</span>
      </template>
      <template #body>
        <div v-if="closingPos" class="space-y-2.5">
          <div class="flex items-center justify-between text-sm">
            <span class="text-[var(--ui-text-muted)]">Market</span>
            <span class="font-semibold">{{ closingPos.ticker }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-[var(--ui-text-muted)]">Side</span>
            <span class="font-semibold uppercase" :class="closingPos.direction === 'long' ? 'text-bid' : 'text-ask'">
              {{ closingPos.direction }}
            </span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-[var(--ui-text-muted)]">Size</span>
            <span class="font-mono tabular-nums">{{ fmt(closingPos.quantity, 4) }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-[var(--ui-text-muted)]">Mark</span>
            <span class="font-mono tabular-nums">{{ fmtPrice(closingPos.markPrice) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-[var(--ui-text-muted)]">PnL</span>
            <span class="font-mono tabular-nums font-bold" :class="closingPos.upnl >= 0 ? 'text-bid' : 'text-ask'">
              {{ closingPos.upnl >= 0 ? '+' : '' }}{{ fmt(closingPos.upnl, 2) }}
            </span>
          </div>
          <p class="pt-1 text-[11px] text-[var(--ui-text-dimmed)] leading-snug">
            Submits a reduce-only order at ~mark price (0.1% through). May take a moment to fill.
          </p>
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full gap-2">
          <UButton block color="neutral" variant="subtle" :disabled="closing" @click="close">
            Cancel
          </UButton>
          <UButton block color="error" :loading="closing" :disabled="closing" @click="confirmClose">
            <span v-if="!closing">Close Position</span>
            <span v-else>Closing…</span>
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
