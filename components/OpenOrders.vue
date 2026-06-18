<script setup lang="ts">
import { fmtPrice, fmt } from '~/utils/inj-format'

const {
  address,
  isConnected,
  isDemo,
  openOrders,
  ordersLoading,
  loadOpenOrders,
  cancellingIds,
  cancelSpotOrder,
  selectedMarketId,
  markets,
  mode,
} = useInjective()

const toast = useToast()

const showAllMarkets = ref(false)

const visible = computed(() => {
  if (showAllMarkets.value) return openOrders.value
  return openOrders.value.filter(o => o.marketId === selectedMarketId.value)
})

interface Row {
  orderHash: string
  cid: string
  marketId: string
  ticker: string
  side: string
  price: number
  filled: number
  total: number
  unfilled: number
  createdAt: number
}

const rows = computed<Row[]>(() => {
  return visible.value.map(o => {
    const market = markets.value.find(m => m.marketId === o.marketId)
    const bd = market?.baseDecimals ?? 18
    const qd = market?.quoteDecimals ?? 6
    const kind = market?.kind ?? 'spot'
    const ticker = market?.ticker ?? o.marketId.slice(0, 10) + '…'
    // Spot: price = chain * 10^(bd-qd), qty = chain / 10^bd
    // Perp:  price = chain / 10^qd,        qty = chain
    const toPrice = kind === 'spot'
      ? (p: string) => Number(p) * 10 ** (bd - qd)
      : (p: string) => Number(p) / 10 ** qd
    const toQty = kind === 'spot'
      ? (q: string) => Number(q) / 10 ** bd
      : (q: string) => Number(q)
    const qty = toQty(o.quantity)
    const unfilled = toQty(o.unfilledQuantity)
    const filled = qty - unfilled
    return {
      orderHash: o.orderHash,
      cid: o.cid,
      marketId: o.marketId,
      ticker,
      side: o.orderSide,
      price: toPrice(o.price),
      filled,
      total: qty,
      unfilled,
      createdAt: o.createdAt,
    }
  })
})

async function handleCancel(orderHash: string, marketId: string, cid?: string) {
  const result = await cancelSpotOrder({ orderHash, marketId, cid })
  if ('error' in result) {
    toast.add({ title: 'Cancel failed', description: result.error, color: 'error' })
  } else {
    toast.add({ title: 'Order cancelled', color: 'success' })
  }
}

watch(address, () => {
  if (address.value) loadOpenOrders()
}, { immediate: true })

const refreshTimer = ref<any>(null)
onMounted(() => {
  if (address.value) loadOpenOrders()
  refreshTimer.value = setInterval(() => {
    if (address.value) loadOpenOrders()
  }, 5000)
})
onBeforeUnmount(() => {
  if (refreshTimer.value) clearInterval(refreshTimer.value)
})
</script>

<template>
  <div class="h-full flex flex-col rounded-lg overflow-hidden bg-[var(--ui-bg)] ring ring-[var(--ui-border)]">
    <div class="flex-none flex items-center justify-between px-4 py-2 border-b border-border-soft">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-wider text-[var(--ui-text-muted)]">Open Orders</span>
        <UBadge v-if="rows.length" variant="subtle" size="sm">{{ rows.length }}</UBadge>
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
          :loading="ordersLoading"
          icon="i-lucide-rotate-ccw"
          @click="loadOpenOrders"
        />
      </div>
    </div>

    <div v-if="!isConnected" class="flex-1 flex items-center justify-center text-sm text-[var(--ui-text-muted)] py-6">
      Connect wallet to view orders
    </div>

    <div v-else-if="ordersLoading && !openOrders.length" class="flex-1 flex items-center justify-center text-sm text-[var(--ui-text-muted)]">
      Loading…
    </div>

    <div v-else-if="!rows.length" class="flex-1 flex flex-col items-center justify-center text-sm text-[var(--ui-text-muted)] py-6 gap-1">
      <span>No open orders</span>
      <span v-if="mode === 'perp'" class="text-[10px] text-[var(--ui-text-dimmed)]">Perp positions & orders — coming soon</span>
    </div>

    <template v-else>
      <div class="flex-none grid grid-cols-[1fr_1fr_1fr_1fr_auto] max-lg:grid-cols-[1fr_1fr_1fr_auto] px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)] border-b border-border-soft">
        <span>Market</span>
        <span class="text-right">Price</span>
        <span class="text-right">Filled</span>
        <span class="text-right max-lg:hidden">Total</span>
        <span class="w-10"></span>
      </div>
      <div class="flex-1 overflow-y-auto min-h-0">
        <div
          v-for="r in rows"
          :key="r.orderHash"
          class="grid grid-cols-[1fr_1fr_1fr_1fr_auto] max-lg:grid-cols-[1fr_1fr_1fr_auto] items-center px-3 py-1.5 border-b border-border-soft last:border-b-0"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <span
              class="text-[9px] font-bold uppercase px-1 py-0.5 rounded flex-none"
              :class="r.side === 'buy' ? 'bg-bid/15 text-bid' : 'bg-ask/15 text-ask'"
            >
              {{ r.side === 'buy' ? 'B' : 'S' }}
            </span>
            <span class="text-[11px] max-lg:text-[10px] font-semibold truncate">{{ r.ticker }}</span>
          </div>
          <span class="text-right font-mono tabular-nums text-[11px] max-lg:text-[10px] truncate">{{ fmtPrice(r.price) }}</span>
          <span class="text-right font-mono tabular-nums text-[11px] max-lg:text-[10px] text-[var(--ui-text-muted)] truncate">
            {{ fmt(r.filled, 4) }}<span class="text-[var(--ui-text-dimmed)]">/{{ fmt(r.total, 4) }}</span>
          </span>
          <span class="text-right font-mono tabular-nums text-[11px] max-lg:hidden">{{ fmt(r.total * r.price, 2) }}</span>
          <span class="w-10 flex justify-end">
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-x"
              :loading="cancellingIds.has(r.orderHash)"
              :disabled="cancellingIds.has(r.orderHash)"
              @click="handleCancel(r.orderHash, r.marketId, r.cid)"
            />
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
