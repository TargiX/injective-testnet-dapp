<script setup lang="ts">
import { fmt, fmtPrice } from '~/utils/inj-format'

const {
  address,
  isConnected,
  balances,
  subaccountBalances,
  positions,
  loadBalances,
  loadSubaccountBalances,
  loadPositions,
} = useInjective()

const {
  trades,
  tradesLoading,
  tradesError,
  loadTradeHistory,
  realizedPnlSeries,
  unrealizedPnl,
  pnlStats,
  assetAllocation,
  portfolioValue,
} = usePortfolio()

onMounted(async () => {
  if (address.value) {
    await Promise.all([
      loadTradeHistory(),
      loadPositions(),
      loadBalances(),
      loadSubaccountBalances(),
    ])
  }
})

// Reload when the wallet connects/changes.
watch(address, async (addr) => {
  if (addr) {
    await Promise.all([loadTradeHistory(), loadPositions(), loadBalances(), loadSubaccountBalances()])
  }
})

useHead({ title: 'Portfolio · Injective Trading' })
</script>

<template>
  <main class="flex-1 overflow-y-auto">
    <div class="max-w-6xl mx-auto p-4 lg:p-6 space-y-6">
      <!-- Not connected -->
      <div v-if="!isConnected" class="flex flex-col items-center justify-center py-20 text-center">
        <div class="w-16 h-16 grid place-items-center rounded-2xl bg-surface-2 mb-4">
          <UIcon name="i-lucide-wallet" class="size-8 text-[var(--ui-text-dimmed)]" />
        </div>
        <h2 class="text-lg font-bold mb-1">Connect your wallet</h2>
        <p class="text-sm text-[var(--ui-text-muted)]">View your portfolio, P&amp;L, and trade history.</p>
      </div>

      <template v-else>
        <!-- Page heading -->
        <div class="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 class="text-xl font-bold">Portfolio</h1>
            <p class="text-[11px] text-[var(--ui-text-muted)]">
              {{ address.slice(0, 12) }}…{{ address.slice(-6) }}
            </p>
          </div>
          <div class="text-right">
            <span class="text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)]">Estimated value</span>
            <p class="text-xl font-bold font-mono tabular-nums">${{ fmt(portfolioValue, 2) }}</p>
            <p class="text-[9px] text-[var(--ui-text-dimmed)]">priced assets only</p>
          </div>
        </div>

        <!-- P&L summary cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-3">
            <span class="text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)]">Realized PnL</span>
            <p
              class="text-lg font-bold font-mono tabular-nums mt-1"
              :class="pnlStats.realizedTotal >= 0 ? 'text-bid' : 'text-ask'"
            >
              {{ pnlStats.realizedTotal >= 0 ? '+' : '' }}${{ fmt(pnlStats.realizedTotal, 2) }}
            </p>
          </div>
          <div class="rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-3">
            <span class="text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)]">Unrealized PnL</span>
            <p
              class="text-lg font-bold font-mono tabular-nums mt-1"
              :class="pnlStats.unrealizedTotal >= 0 ? 'text-bid' : 'text-ask'"
            >
              {{ pnlStats.unrealizedTotal >= 0 ? '+' : '' }}${{ fmt(pnlStats.unrealizedTotal, 2) }}
            </p>
          </div>
          <div class="rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-3">
            <span class="text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)]">Fees Paid</span>
            <p class="text-lg font-bold font-mono tabular-nums mt-1 text-[var(--ui-text-muted)]">
              ${{ fmt(pnlStats.feesPaid, 2) }}
            </p>
          </div>
          <div class="rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-3">
            <span class="text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)]">Trades</span>
            <p class="text-lg font-bold font-mono tabular-nums mt-1">{{ pnlStats.tradeCount }}</p>
          </div>
        </div>

        <!-- PnL chart -->
        <div class="rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-4">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-bold uppercase tracking-wider">Perp PnL</h2>
            <span class="text-[10px] text-[var(--ui-text-dimmed)]">Realized + unrealized</span>
          </div>
          <div class="h-[280px]">
            <PortfolioPnlChart :series="realizedPnlSeries" :unrealized="unrealizedPnl" />
          </div>
        </div>

        <!-- Two-column: allocation + positions -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Asset allocation -->
          <div class="rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-4">
            <h2 class="text-sm font-bold uppercase tracking-wider mb-3">Asset Allocation</h2>
            <div v-if="!assetAllocation.length" class="text-sm text-[var(--ui-text-muted)] py-4 text-center">
              No balances
            </div>
            <AssetAllocation v-else :rows="assetAllocation" />
          </div>

          <!-- Open positions -->
          <div class="rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-4">
            <h2 class="text-sm font-bold uppercase tracking-wider mb-3">Open Positions</h2>
            <div v-if="!positions.length" class="text-sm text-[var(--ui-text-muted)] py-4 text-center">
              No open positions
            </div>
            <div v-else class="space-y-1.5">
              <div
                v-for="p in positions"
                :key="p.marketId"
                class="flex items-center gap-2 text-[11px]"
              >
                <span
                  class="text-[9px] font-bold uppercase px-1 py-0.5 rounded flex-none"
                  :class="p.direction === 'long' ? 'bg-bid/15 text-bid' : 'bg-ask/15 text-ask'"
                >
                  {{ p.direction === 'long' ? 'L' : 'S' }}
                </span>
                <span class="font-semibold truncate flex-1">{{ p.ticker }}</span>
                <span class="font-mono tabular-nums text-[var(--ui-text-muted)]">{{ fmt(p.quantity, 4) }}</span>
                <span
                  class="font-mono tabular-nums font-semibold w-20 text-right"
                  :class="p.upnl >= 0 ? 'text-bid' : 'text-ask'"
                >
                  {{ p.upnl >= 0 ? '+' : '' }}{{ fmt(p.upnl, 2) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Trade history -->
        <div class="rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-bold uppercase tracking-wider">Trade History</h2>
            <UButton
              v-if="trades.length"
              variant="ghost"
              size="xs"
              :loading="tradesLoading"
              icon="i-lucide-rotate-ccw"
              @click="loadTradeHistory"
            />
          </div>
          <div v-if="tradesError" class="text-sm text-ask py-4 text-center">{{ tradesError }}</div>
          <div v-else-if="tradesLoading && !trades.length" class="text-sm text-[var(--ui-text-muted)] py-4 text-center">
            Loading trades…
          </div>
          <div v-else-if="!trades.length" class="text-sm text-[var(--ui-text-muted)] py-4 text-center">
            No trades yet
          </div>
          <TradeHistoryTable v-else :trades="trades" />
          <p v-if="trades.length >= 500" class="pt-2 text-[9px] text-[var(--ui-text-dimmed)]">
            Showing the most recent 500 trades.
          </p>
        </div>
      </template>
    </div>
  </main>
</template>
