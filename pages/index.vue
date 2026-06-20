<script setup lang="ts">
const {
  init,
  loadMarkets,
  loadBalances,
  loadSubaccountBalances,
  loadPositions,
  loadDerivativeOrders,
  loadOrderbook,
  loadTrades,
  loadMarketStats,
  selectedMarketId,
  mode,
  switchMode,
  latencyMs,
  lastPollAt,
} = useInjective()

const toast = useToast()
const bottomTab = ref<'orderbook' | 'trades' | 'balances'>('orderbook')
// Right-panel segmented control (perp mode shows Positions alongside Orders).
const rightTab = ref<'orders' | 'positions'>('orders')
// Mobile bottom-tab navigation. `lg` (1024px) is the desktop breakpoint —
// below it we render a single-panel + bottom-nav layout instead of the
// 3-column grid.
const MOBILE_BP = '(min-width: 1024px)'
const isDesktop = ref(true)
const mobileTab = ref<'markets' | 'chart' | 'book' | 'trade' | 'orders'>('chart')

let mq: MediaQueryList | null = null

let pollTimer: ReturnType<typeof setInterval> | null = null

async function pollCycle() {
  const started = Date.now()
  lastPollAt.value = started
  try {
    await Promise.all([loadOrderbook(), loadTrades()])
    latencyMs.value = Date.now() - started
  } catch {
    // loadOrderbook/loadTrades swallow their own errors, so a throw here
    // would mean a deeper (transport) failure — surface it via latency spike.
    latencyMs.value = Date.now() - started
  }
}

onMounted(async () => {
  // Sync viewport breakpoint so we render desktop vs mobile tree.
  if (typeof window !== 'undefined' && window.matchMedia) {
    mq = window.matchMedia(MOBILE_BP)
    isDesktop.value = mq.matches
    const handler = (e: MediaQueryListEvent) => { isDesktop.value = e.matches }
    mq.addEventListener?.('change', handler)
  }

  try {
    await init()
    await loadMarkets()
    await Promise.all([loadOrderbook(), loadTrades()])
    loadBalances()
    loadSubaccountBalances()
    loadPositions()
    loadDerivativeOrders()
    loadMarketStats()
    pollTimer = setInterval(() => {
      pollCycle()
      loadBalances()
      loadSubaccountBalances()
      if (mode.value === 'perp') {
        loadPositions()
        loadDerivativeOrders()
      }
      loadMarketStats()
    }, 3000)
  } catch (e: any) {
    toast.add({ title: 'Init failed', description: e?.message, color: 'error' })
  }
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})

watch(selectedMarketId, () => {
  Promise.all([loadOrderbook(), loadTrades()])
  loadSubaccountBalances()
  if (mode.value === 'perp') {
    loadPositions()
    loadDerivativeOrders()
  }
  loadMarketStats()
})
</script>

<template>
  <div class="flex-1 flex flex-col bg-surface text-[var(--ui-text)] overflow-hidden">
    <!-- Spot/Perp mode toggle (terminal-only; not relevant on Portfolio page) -->
    <div class="flex-none flex items-center gap-2 px-4 lg:px-5 py-1.5 border-b border-border-soft">
      <div class="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
        <button
          class="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded transition-colors"
          :class="mode === 'spot'
            ? 'bg-surface-3 text-[var(--ui-text)]'
            : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
          @click="switchMode('spot')"
        >
          Spot
        </button>
        <button
          class="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded transition-colors"
          :class="mode === 'perp'
            ? 'bg-accent/20 text-accent'
            : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
          @click="switchMode('perp')"
        >
          Perp
        </button>
      </div>
    </div>

    <MarketStats />

    <!-- ============ DESKTOP (lg+): unchanged 3-column terminal ============ -->
    <template v-if="isDesktop">
      <main class="flex-1 grid grid-cols-[260px_1fr_300px] gap-3 p-3 overflow-hidden">
        <div class="min-h-0 overflow-hidden">
          <SpotMarkets />
        </div>
        <div class="flex flex-col gap-3 overflow-hidden">
          <div class="h-[45%] overflow-hidden">
            <PriceChart />
          </div>
          <div class="flex-1 overflow-hidden flex flex-col rounded-lg bg-[var(--ui-bg)] ring ring-[var(--ui-border)]">
            <div class="flex-none flex items-center gap-0.5 px-3 py-1.5 border-b border-border-soft">
              <button
                class="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
                :class="bottomTab === 'orderbook' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
                @click="bottomTab = 'orderbook'"
              >
                <UIcon name="i-lucide-book-open" class="size-3.5" />
                Order Book
              </button>
              <button
                class="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
                :class="bottomTab === 'trades' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
                @click="bottomTab = 'trades'"
              >
                <UIcon name="i-lucide-zap" class="size-3.5" />
                Trades
              </button>
              <button
                class="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
                :class="bottomTab === 'balances' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
                @click="bottomTab = 'balances'"
              >
                <UIcon name="i-lucide-wallet" class="size-3.5" />
                Balances
              </button>
            </div>
            <div class="flex-1 overflow-hidden">
              <OrderBook v-show="bottomTab === 'orderbook'" />
              <TradeHistory v-show="bottomTab === 'trades'" />
              <BalancePanel v-show="bottomTab === 'balances'" />
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-3 overflow-hidden">
          <TradeForm />
          <div class="flex-1 overflow-hidden flex flex-col">
            <!-- Right-panel segmented control: Positions (perp) | Orders -->
            <div v-if="mode === 'perp'" class="flex-none flex items-center gap-0.5 px-3 py-1.5 border-b border-border-soft">
              <button
                class="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
                :class="rightTab === 'positions' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
                @click="rightTab = 'positions'"
              >
                <UIcon name="i-lucide-crosshair" class="size-3.5" />
                Positions
              </button>
              <button
                class="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
                :class="rightTab === 'orders' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
                @click="rightTab = 'orders'"
              >
                <UIcon name="i-lucide-inbox" class="size-3.5" />
                Orders
              </button>
            </div>
            <div class="flex-1 overflow-hidden">
              <Positions v-if="mode === 'perp' && rightTab === 'positions'" />
              <OpenOrders v-else />
            </div>
          </div>
        </div>
      </main>
    </template>

    <!-- ============ MOBILE (<lg): single panel + bottom tabs ============ -->
    <template v-else>
      <main class="flex-1 overflow-hidden p-2">
        <SpotMarkets v-show="mobileTab === 'markets'" />

        <div v-show="mobileTab === 'chart'" class="h-full overflow-hidden">
          <PriceChart />
        </div>

        <!-- Book tab keeps the existing orderbook/trades/balances segmented control -->
        <div v-show="mobileTab === 'book'" class="h-full overflow-hidden flex flex-col rounded-lg bg-[var(--ui-bg)] ring ring-[var(--ui-border)]">
          <div class="flex-none flex items-center gap-0.5 px-3 py-1.5 border-b border-border-soft">
            <button
              class="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
              :class="bottomTab === 'orderbook' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
              @click="bottomTab = 'orderbook'"
            >
              <UIcon name="i-lucide-book-open" class="size-3.5" />
              Order Book
            </button>
            <button
              class="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
              :class="bottomTab === 'trades' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
              @click="bottomTab = 'trades'"
            >
              <UIcon name="i-lucide-zap" class="size-3.5" />
              Trades
            </button>
            <button
              class="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
              :class="bottomTab === 'balances' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
              @click="bottomTab = 'balances'"
            >
              <UIcon name="i-lucide-wallet" class="size-3.5" />
              Balances
            </button>
          </div>
          <div class="flex-1 overflow-hidden">
            <OrderBook v-show="bottomTab === 'orderbook'" />
            <TradeHistory v-show="bottomTab === 'trades'" />
            <BalancePanel v-show="bottomTab === 'balances'" />
          </div>
        </div>

        <div v-show="mobileTab === 'trade'" class="h-full overflow-hidden">
          <TradeForm />
        </div>

        <div v-show="mobileTab === 'orders'" class="h-full overflow-hidden flex flex-col">
          <!-- In perp mode, the Orders tab gets a Positions/Orders sub-toggle -->
          <div v-if="mode === 'perp'" class="flex-none flex items-center gap-0.5 px-3 py-1.5 border-b border-border-soft">
            <button
              class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
              :class="rightTab === 'positions' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
              @click="rightTab = 'positions'"
            >
              Positions
            </button>
            <button
              class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
              :class="rightTab === 'orders' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
              @click="rightTab = 'orders'"
            >
              Orders
            </button>
          </div>
          <div class="flex-1 overflow-hidden">
            <Positions v-if="mode === 'perp' && rightTab === 'positions'" />
            <OpenOrders v-else />
          </div>
        </div>
      </main>

      <nav
        class="flex-none flex items-stretch justify-around border-t border-border-soft bg-surface-1/85 backdrop-blur-md"
        style="padding-bottom: env(safe-area-inset-bottom, 0px)"
      >
        <button
          v-for="t in [
            { id: 'markets', icon: 'i-lucide-list', label: 'Markets' },
            { id: 'chart', icon: 'i-lucide-candlestick-chart', label: 'Chart' },
            { id: 'book', icon: 'i-lucide-book-open', label: 'Book' },
            { id: 'trade', icon: 'i-lucide-arrow-left-right', label: 'Trade' },
            { id: 'orders', icon: 'i-lucide-inbox', label: 'Orders' },
          ]"
          :key="t.id"
          class="flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors"
          :class="mobileTab === t.id ? 'text-accent' : 'text-[var(--ui-text-dimmed)]'"
          @click="mobileTab = (t.id as typeof mobileTab)"
        >
          <UIcon :name="t.icon" class="size-5" />
          <span class="text-[10px] font-medium">{{ t.label }}</span>
        </button>
      </nav>
    </template>
  </div>
</template>
