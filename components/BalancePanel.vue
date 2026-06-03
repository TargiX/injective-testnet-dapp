<script setup lang="ts">
import { toHumanAmount, fmt, shortAddress, denomKind, cleanName } from '~/utils/inj-format'

const {
  isDemo,
  viewAddress,
  balances,
  balancesLoading,
  loadBalances,
} = useInjective()

// Show recognized tradeable assets (tokens we know the symbol + decimals for,
// i.e. decimals > 0). This filters out raw share/factory denoms we can't label.
const visible = computed(() =>
  [...balances.value]
    .filter((b) => b.decimals > 0)
    .map((b) => ({ ...b, human: toHumanAmount(b.amount, b.decimals) }))
    .filter((b) => b.human > 0)
    .sort((a, b) => b.human - a.human),
)
</script>

<template>
  <section class="card">
    <div class="card-head">
      <span class="card-title">Wallet Balances</span>
      <button
        class="btn btn-ghost refresh"
        :disabled="balancesLoading"
        @click="loadBalances"
      >
        {{ balancesLoading ? '…' : '↻' }}
      </button>
    </div>

    <div class="addr-bar">
      <span v-if="isDemo" class="pill demo">read-only demo</span>
      <span v-else class="pill mine"><span class="dot" />your wallet</span>
      <a
        class="num addr-link"
        :href="`https://testnet.explorer.injective.network/account/${viewAddress}`"
        target="_blank"
        rel="noopener"
        :title="viewAddress"
      >
        {{ shortAddress(viewAddress) }}
      </a>
    </div>

    <div v-if="balancesLoading && !balances.length" class="empty">
      <p class="muted">Loading balances…</p>
    </div>

    <div v-else-if="!visible.length" class="empty">
      <p class="muted">No non-zero balances.</p>
      <p class="faint hint">
        Grab testnet INJ from the
        <a href="https://testnet.faucet.injective.network/" target="_blank" rel="noopener">
          Injective faucet
        </a>
        and refresh.
      </p>
    </div>

    <table v-else class="bal-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th class="r">Amount</th>
          <th class="r">Type</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="b in visible" :key="b.denom">
          <td>
            <span class="asset">
              <TokenIcon :logo="b.logo" :symbol="b.symbol" :size="24" />
              <span class="asset-text">
                <span class="sym">{{ b.symbol }}</span>
                <span v-if="cleanName(b.name)" class="name faint">{{ cleanName(b.name) }}</span>
              </span>
            </span>
          </td>
          <td class="r num amt">{{ fmt(b.human, 6) }}</td>
          <td class="r"><span class="kind">{{ denomKind(b.denom) }}</span></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.addr-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--border-soft);
}
.pill.demo {
  color: var(--warn);
  border-color: rgba(240, 180, 41, 0.35);
}
.pill.mine .dot {
  background: var(--bid);
  box-shadow: 0 0 0 3px rgba(31, 184, 122, 0.18);
}
.addr-link {
  font-size: 12px;
  color: var(--text-dim);
}
.addr-link:hover {
  color: var(--accent);
}
.empty {
  padding: 22px 16px;
}
.empty p {
  margin: 0 0 6px;
}
.hint {
  font-size: 12px;
}
code {
  font-family: var(--mono);
  background: var(--bg-elev-2);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}
.refresh {
  padding: 4px 9px;
  font-size: 15px;
  line-height: 1;
}
.bal-table {
  width: 100%;
  border-collapse: collapse;
}
.bal-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-faint);
  padding: 9px 16px;
  border-bottom: 1px solid var(--border-soft);
}
.bal-table td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-soft);
  font-size: 13px;
}
.bal-table tr:last-child td {
  border-bottom: none;
}
.r {
  text-align: right;
}
.asset {
  display: flex;
  align-items: center;
  gap: 9px;
}
.asset-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.sym {
  font-weight: 600;
}
.asset-text .name {
  font-size: 11px;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amt {
  font-weight: 500;
}
.kind {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-dim);
  background: var(--bg-elev-2);
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  padding: 2px 8px;
}
</style>
