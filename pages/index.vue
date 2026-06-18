<script setup lang="ts">
const {
  init,
  loadMarkets,
  loadBalances,
  loadSubaccountBalances,
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
    loadMarketStats()
    pollTimer = setInterval(() => {
      pollCycle()
      loadBalances()
      loadSubaccountBalances()
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
  loadMarketStats()
})
</script>

<template>
  <div class="h-dvh flex flex-col bg-surface text-[var(--ui-text)] overflow-hidden">
    <header class="flex-none flex items-center justify-between gap-4 px-5 py-3 border-b border-border-soft">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 grid place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-dim text-surface font-extrabold text-base">
          ▚
        </div>
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
        <div>
          <h1 class="text-sm font-bold tracking-tight leading-tight">Injective Trading</h1>
          <p class="hidden lg:block text-[11px] text-[var(--ui-text-muted)] leading-tight">
            Wallet · balances · live order book ·
            <code class="font-mono">injective-ts</code> gRPC-web
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <UBadge variant="subtle" color="success" size="sm">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-bid mr-1.5 shadow-glow-bid" />
          injective-1 · mainnet
        </UBadge>
        <ConnectionIndicator class="hidden sm:flex" />
        <WalletConnect />
      </div>
    </header>

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
                class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
                :class="bottomTab === 'orderbook' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
                @click="bottomTab = 'orderbook'"
              >
                Order Book
              </button>
              <button
                class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
                :class="bottomTab === 'trades' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
                @click="bottomTab = 'trades'"
              >
                Trades
              </button>
              <button
                class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
                :class="bottomTab === 'balances' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
                @click="bottomTab = 'balances'"
              >
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
          <div class="flex-1 overflow-hidden">
            <OpenOrders />
          </div>
        </div>
      </main>

      <footer class="flex-none flex items-center justify-between px-5 py-1.5 border-t border-border-soft text-[11px]">
        <div class="flex items-center gap-1">
          <span class="text-[var(--ui-text-dimmed)]">injective-1 · mainnet</span>
        </div>
        <ConnectionIndicator />
      </footer>
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
              class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
              :class="bottomTab === 'orderbook' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
              @click="bottomTab = 'orderbook'"
            >
              Order Book
            </button>
            <button
              class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
              :class="bottomTab === 'trades' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
              @click="bottomTab = 'trades'"
            >
              Trades
            </button>
            <button
              class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors"
              :class="bottomTab === 'balances' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
              @click="bottomTab = 'balances'"
            >
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

        <div v-show="mobileTab === 'orders'" class="h-full overflow-hidden">
          <OpenOrders />
        </div>
      </main>

      <nav
        class="flex-none flex items-stretch justify-around border-t border-border-soft bg-surface-1"
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
