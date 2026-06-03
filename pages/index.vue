<script setup lang="ts">
const {
  endpoints,
  init,
  loadMarkets,
  loadBalances,
  loadOrderbook,
  loadTrades,
  selectedMarketId,
} = useInjective()

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await init()
  // Markets first so the token registry is populated before we map balances.
  await loadMarkets()
  await Promise.all([loadOrderbook(), loadTrades()])
  // Demo-address balances (read-only) so the panel shows real data with no wallet.
  loadBalances()
  // Light polling keeps the order book + depth feeling live without a socket.
  pollTimer = setInterval(loadOrderbook, 2500)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})

// Reload book + price series whenever the selected market changes.
watch(selectedMarketId, () => {
  loadOrderbook()
  loadTrades()
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <div class="logo">▚</div>
        <div>
          <h1>Injective Testnet dApp</h1>
          <p class="faint sub">
            Wallet · on-chain balance · live spot order book — via the
            <code>injective-ts</code> gRPC-web SDK
          </p>
        </div>
      </div>
      <div class="topbar-right">
        <span class="pill net">
          <span class="dot" />
          injective-888 · testnet
        </span>
        <WalletConnect />
      </div>
    </header>

    <main class="layout">
      <div class="col-left">
        <SpotMarkets />
      </div>
      <div class="col-mid">
        <PriceChart />
        <OrderBook />
      </div>
      <div class="col-right">
        <DepthChart />
        <BalancePanel />
        <section class="card endpoints">
          <div class="card-head"><span class="card-title">gRPC-web Endpoints</span></div>
          <dl>
            <dt>chain</dt>
            <dd class="num faint">{{ endpoints.grpc }}</dd>
            <dt>indexer</dt>
            <dd class="num faint">{{ endpoints.indexer }}</dd>
          </dl>
        </section>
      </div>
    </main>

    <footer class="foot faint">
      Live data from Injective Testnet · injective-888
    </footer>
  </div>
</template>

<style scoped>
.page {
  max-width: 1340px;
  margin: 0 auto;
  padding: 22px 22px 40px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-soft);
}
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}
.logo {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: linear-gradient(135deg, #00c2a8, #0a6d8a);
  color: #04130f;
  font-size: 20px;
  font-weight: 800;
}
h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.sub {
  margin: 2px 0 0;
  font-size: 12px;
}
.sub code,
.endpoints code {
  font-family: var(--mono);
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.pill.net .dot {
  background: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 194, 168, 0.18);
}
.layout {
  display: grid;
  grid-template-columns: 280px 1fr 320px;
  gap: 16px;
  align-items: start;
  flex: 1;
}
.col-left :deep(.markets) {
  height: 640px;
}
.col-mid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.col-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.endpoints dl {
  margin: 0;
  padding: 12px 16px 16px;
}
.endpoints dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-faint);
  margin-top: 8px;
}
.endpoints dd {
  margin: 2px 0 0;
  font-size: 11px;
  word-break: break-all;
}
.foot {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
  font-size: 12px;
  text-align: center;
}
@media (max-width: 1080px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .col-left :deep(.markets) {
    height: 360px;
  }
}
</style>
