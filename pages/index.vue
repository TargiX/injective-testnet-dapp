<script setup lang="ts">
const {
  init,
  loadMarkets,
  loadBalances,
  loadOrderbook,
  loadTrades,
  selectedMarketId,
} = useInjective()

const toast = useToast()
const bottomTab = ref<'orderbook' | 'balances'>('orderbook')

let pollTimer: ReturnType<typeof setInterval> | null = null

async function pollCycle() {
  await Promise.all([loadOrderbook(), loadTrades()])
}

onMounted(async () => {
  try {
    await init()
    await loadMarkets()
    await Promise.all([loadOrderbook(), loadTrades()])
    loadBalances()
    pollTimer = setInterval(() => {
      pollCycle()
      loadBalances()
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
})
</script>

<template>
  <div class="h-dvh flex flex-col bg-surface text-[var(--ui-text)] overflow-hidden">
    <header class="flex-none flex items-center justify-between gap-4 px-5 py-3 border-b border-border-soft">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 grid place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-dim text-surface font-extrabold text-base">
          ▚
        </div>
        <div>
          <h1 class="text-sm font-bold tracking-tight leading-tight">Injective Trading</h1>
          <p class="text-[11px] text-[var(--ui-text-muted)] leading-tight">
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
        <WalletConnect />
      </div>
    </header>

    <main class="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-3 p-3 overflow-hidden">
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
              :class="bottomTab === 'balances' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
              @click="bottomTab = 'balances'"
            >
              Balances
            </button>
          </div>
          <div class="flex-1 overflow-hidden">
            <OrderBook v-show="bottomTab === 'orderbook'" />
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
      <UBadge variant="subtle" color="success" size="sm">
        <span class="inline-block w-1.5 h-1.5 rounded-full bg-bid mr-1 shadow-glow-bid" />
        Live
      </UBadge>
    </footer>
  </div>
</template>
