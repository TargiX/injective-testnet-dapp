<script setup lang="ts">
import { fmt, shortAddress } from '~/utils/inj-format'
import {
  IBC_ROUTE_LIST,
  type IbcRouteKey,
} from '~/composables/useIbc'

const {
  address,
  isConnected,
  isTestnet,
  loadBalances,
} = useInjective()

const {
  transferableBalances,
  submitting,
  transferError,
  recentTransfers,
  submitIbcTransfer,
  resolveRecipient,
} = useIbc()

const toast = useToast()

// ---- form state ----
const routeKey = ref<IbcRouteKey>('osmosis')
const selectedDenom = ref<string>('')
const amount = ref<string>('')
// "Auto" derives the destination address from the connected Injective wallet
// (Keplr/Leap share the account across chains). "Custom" lets the user paste.
const recipientMode = ref<'auto' | 'custom'>('auto')
const customRecipient = ref<string>('')
const resolvedRecipient = ref<{ ok: true; address: string } | { ok: false; error: string } | null>(null)

const route = computed(() => IBC_ROUTE_LIST.find((r) => r.key === routeKey.value)!)
const selectedBalance = computed(() =>
  transferableBalances.value.find((b) => b.denom === selectedDenom.value),
)

// Resolve the destination address whenever inputs that affect it change.
async function refreshRecipient() {
  if (recipientMode.value === 'custom') {
    resolvedRecipient.value = customRecipient.value.trim()
      ? { ok: true, address: customRecipient.value.trim() }
      : null
    return
  }
  if (!isConnected.value || !route.value) {
    resolvedRecipient.value = null
    return
  }
  resolvedRecipient.value = await resolveRecipient(route.value)
}
watch([routeKey, recipientMode, customRecipient, address], refreshRecipient, { immediate: true })

// Pick a default token once balances load.
watch(transferableBalances, (list) => {
  if (!selectedDenom.value && list.length) selectedDenom.value = list[0].denom
}, { immediate: true })

// Reload balances on mount so the bridge shows current holdings.
onMounted(() => { if (isConnected.value) loadBalances() })
watch(address, (a) => { if (a) loadBalances() })

// ---- derived ----
const humanBalance = computed(() => {
  const b = selectedBalance.value
  if (!b) return 0
  return Number(b.amount) / 10 ** b.decimals
})
const numericAmount = computed(() => {
  const n = Number(amount.value)
  return isFinite(n) ? n : 0
})
const insufficient = computed(() =>
  numericAmount.value > 0 && numericAmount.value > humanBalance.value + 1e-12,
)
const canSubmit = computed(() =>
  isConnected.value &&
  !isTestnet.value &&
  selectedDenom.value &&
  numericAmount.value > 0 &&
  !insufficient.value &&
  resolvedRecipient.value?.ok &&
  !submitting.value,
)

function setMax() {
  amount.value = humanBalance.value > 0 ? String(humanBalance.value) : ''
}

function switchRoute(key: IbcRouteKey) {
  routeKey.value = key
}

// ---- submit (two-stage: confirm modal → sign) ----
const confirmOpen = ref(false)
const lastResult = ref<{ txHash: string } | { error: string } | null>(null)

function openConfirm() {
  lastResult.value = null
  confirmOpen.value = true
}

async function confirmTransfer() {
  const balance = selectedBalance.value
  if (!balance || !resolvedRecipient.value?.ok) return
  const result = await submitIbcTransfer({
    routeKey: routeKey.value,
    denom: balance.denom,
    humanAmount: numericAmount.value,
    decimals: balance.decimals,
    symbol: balance.symbol,
    recipientOverride: recipientMode.value === 'custom' ? customRecipient.value.trim() : undefined,
  })
  lastResult.value = result
  if ('txHash' in result) {
    confirmOpen.value = false
    amount.value = ''
    toast.add({
      title: 'Transfer submitted',
      description: `${fmt(numericAmount.value, 4) || '—'} ${balance.symbol} → ${route.value.label}`,
      color: 'success',
    })
  }
}

function explorerUrl(txHash: string, key: IbcRouteKey) {
  const r = IBC_ROUTE_LIST.find((x) => x.key === key)!
  return r.explorerTx.replace('%s', txHash)
}

useHead({ title: 'Bridge · Injective Trading' })
</script>

<template>
  <main class="flex-1 overflow-y-auto">
    <div class="max-w-5xl mx-auto p-4 lg:p-6 space-y-5">
      <!-- Page heading -->
      <div class="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 class="text-xl font-bold flex items-center gap-2">
            <span class="w-7 h-7 grid place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-dim text-surface text-sm">⇄</span>
            IBC Bridge
          </h1>
          <p class="text-[11px] text-[var(--ui-text-muted)] mt-0.5">
            Transfer tokens cross-chain from Injective via IBC · native MsgTransfer signing
          </p>
        </div>
        <UBadge v-if="!isTestnet" variant="subtle" color="success" size="sm">
          <span class="inline-block w-1.5 h-1.5 rounded-full mr-1.5 bg-bid shadow-glow-bid" />
          mainnet · IBC active
        </UBadge>
        <UBadge v-else variant="subtle" color="warning" size="sm">testnet</UBadge>
      </div>

      <!-- Not connected -->
      <div v-if="!isConnected" class="flex flex-col items-center justify-center py-20 text-center">
        <div class="w-16 h-16 grid place-items-center rounded-2xl bg-surface-2 mb-4">
          <UIcon name="i-lucide-wallet" class="size-8 text-[var(--ui-text-dimmed)]" />
        </div>
        <h2 class="text-lg font-bold mb-1">Connect your wallet</h2>
        <p class="text-sm text-[var(--ui-text-muted)]">Connect Keplr or Leap to bridge tokens via IBC.</p>
      </div>

      <template v-else>
        <!-- Testnet gate -->
        <div
          v-if="isTestnet"
          class="rounded-lg ring-1 ring-[var(--ui-border)] bg-surface-2 p-4 flex items-start gap-3"
        >
          <UIcon name="i-lucide-info" class="size-5 text-yellow-400 flex-none mt-0.5" />
          <div class="text-sm">
            <p class="font-semibold mb-0.5">IBC bridge is mainnet-only</p>
            <p class="text-[var(--ui-text-muted)] text-xs">
              Channel IDs on testnet (<code>injective-888</code>) differ and relayer uptime is
              unreliable. Switch to mainnet to bridge real tokens.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <!-- Form card -->
          <div class="lg:col-span-3 rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-4 lg:p-5 space-y-4">
            <!-- Destination chain -->
            <div>
              <label class="text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)]">Destination</label>
              <div class="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  v-for="r in IBC_ROUTE_LIST"
                  :key="r.key"
                  type="button"
                  class="px-3 py-2.5 rounded-md text-left transition-colors ring-1"
                  :class="routeKey === r.key
                    ? 'bg-surface-3 ring-accent/50 text-[var(--ui-text)]'
                    : 'bg-surface-2 ring-[var(--ui-border)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]'"
                  @click="switchRoute(r.key)"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-bold">{{ r.label }}</span>
                    <span class="text-[9px] font-mono text-[var(--ui-text-dimmed)]">{{ r.channelId }}</span>
                  </div>
                  <span class="text-[10px] text-[var(--ui-text-dimmed)] font-mono">{{ r.chainId }}</span>
                </button>
              </div>
            </div>

            <!-- Token -->
            <div>
              <div class="flex items-center justify-between">
                <label class="text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)]">Token</label>
                <span v-if="selectedBalance" class="text-[10px] text-[var(--ui-text-dimmed)] font-mono">
                  balance: {{ fmt(humanBalance, 6) }}
                </span>
              </div>
              <select
                v-model="selectedDenom"
                class="mt-1.5 w-full bg-surface-2 ring-1 ring-[var(--ui-border)] rounded-md px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-accent/50"
              >
                <option value="" disabled>Select a token</option>
                <option v-for="b in transferableBalances" :key="b.denom" :value="b.denom">
                  {{ b.symbol }} · {{ fmt(Number(b.amount) / 10 ** b.decimals, 4) }}
                </option>
              </select>
              <p v-if="!transferableBalances.length" class="mt-1.5 text-[11px] text-[var(--ui-text-dimmed)]">
                No bridgeable balances (INJ / IBC tokens) found.
              </p>
            </div>

            <!-- Amount -->
            <div>
              <div class="flex items-center justify-between">
                <label class="text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)]">Amount</label>
                <button
                  type="button"
                  class="text-[10px] uppercase tracking-wider text-accent font-bold hover:opacity-80"
                  @click="setMax"
                >
                  Max
                </button>
              </div>
              <div class="mt-1.5 relative">
                <input
                  v-model="amount"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  class="w-full bg-surface-2 ring-1 ring-[var(--ui-border)] rounded-md px-3 py-2.5 text-sm font-mono pr-20 focus:outline-none focus:ring-accent/50"
                  :class="insufficient ? 'ring-ask/60' : ''"
                >
                <span
                  v-if="selectedBalance"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[var(--ui-text-muted)]"
                >
                  {{ selectedBalance.symbol }}
                </span>
              </div>
              <p v-if="insufficient" class="mt-1.5 text-[11px] text-ask">Insufficient balance</p>
            </div>

            <!-- Recipient -->
            <div>
              <div class="flex items-center justify-between">
                <label class="text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)]">Recipient</label>
                <div class="flex items-center gap-0.5 rounded bg-surface-2 p-0.5">
                  <button
                    type="button"
                    class="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded transition-colors"
                    :class="recipientMode === 'auto' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
                    @click="recipientMode = 'auto'"
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    class="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded transition-colors"
                    :class="recipientMode === 'custom' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'"
                    @click="recipientMode = 'custom'"
                  >
                    Custom
                  </button>
                </div>
              </div>
              <div class="mt-1.5">
                <div
                  v-if="recipientMode === 'auto'"
                  class="bg-surface-2 ring-1 ring-[var(--ui-border)] rounded-md px-3 py-2.5 text-sm font-mono flex items-center justify-between gap-2"
                >
                  <span class="truncate" :class="resolvedRecipient?.ok ? 'text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)]'">
                    {{ resolvedRecipient?.ok ? resolvedRecipient.address : 'resolving…' }}
                  </span>
                  <span class="text-[10px] text-[var(--ui-text-dimmed)] flex-none">{{ route.bech32Prefix }}1…</span>
                </div>
                <input
                  v-else
                  v-model="customRecipient"
                  type="text"
                  :placeholder="`${route.bech32Prefix}1…`"
                  class="w-full bg-surface-2 ring-1 ring-[var(--ui-border)] rounded-md px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-accent/50"
                >
              </div>
              <p v-if="resolvedRecipient && !resolvedRecipient.ok" class="mt-1.5 text-[11px] text-ask">
                {{ resolvedRecipient.error }}
              </p>
            </div>

            <!-- Submit -->
            <UButton
              block
              size="lg"
              :loading="submitting"
              :disabled="!canSubmit"
              class="mt-1"
              @click="openConfirm"
            >
              <span v-if="!isConnected">Connect wallet</span>
              <span v-else-if="isTestnet">Mainnet only</span>
              <span v-else-if="!selectedDenom">Select a token</span>
              <span v-else-if="submitting">Signing…</span>
              <span v-else>Bridge to {{ route.label }}</span>
            </UButton>
            <p v-if="transferError" class="text-[11px] text-ask text-center">{{ transferError }}</p>
          </div>

          <!-- Summary + recent transfers -->
          <div class="lg:col-span-2 space-y-4">
            <!-- Route summary -->
            <div class="rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-4 space-y-2.5">
              <h2 class="text-sm font-bold uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-route" class="size-4 text-accent" />
                Route
              </h2>
              <div class="flex items-center gap-2 text-sm">
                <span class="font-mono px-2 py-1 rounded bg-surface-2 text-[var(--ui-text-muted)]">inj1…</span>
                <UIcon name="i-lucide-arrow-right" class="size-4 text-accent flex-none" />
                <span class="font-mono px-2 py-1 rounded bg-surface-2 text-[var(--ui-text-muted)] truncate">
                  {{ route.bech32Prefix }}1…
                </span>
              </div>
              <dl class="text-[11px] space-y-1 pt-1 border-t border-[var(--ui-border)]">
                <div class="flex justify-between">
                  <dt class="text-[var(--ui-text-dimmed)]">Source channel</dt>
                  <dd class="font-mono">{{ route.channelId }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--ui-text-dimmed)]">Port</dt>
                  <dd class="font-mono">{{ route.port }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--ui-text-dimmed)]">Timeout</dt>
                  <dd class="font-mono">10 min</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--ui-text-dimmed)]">Fee</dt>
                  <dd class="font-mono">gas only</dd>
                </div>
              </dl>
            </div>

            <!-- Recent transfers -->
            <div class="rounded-lg bg-[var(--ui-bg)] ring-1 ring-[var(--ui-border)] p-4">
              <h2 class="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <UIcon name="i-lucide-history" class="size-4 text-accent" />
                Recent Transfers
              </h2>
              <div v-if="!recentTransfers.length" class="flex flex-col items-center justify-center gap-2 py-6 text-[var(--ui-text-muted)]">
                <UIcon name="i-lucide-arrow-left-right" class="size-7 text-[var(--ui-text-dimmed)]" />
                <span class="text-sm">No transfers yet</span>
              </div>
              <div v-else class="space-y-2">
                <a
                  v-for="t in recentTransfers"
                  :key="t.id"
                  :href="explorerUrl(t.txHash, t.routeKey)"
                  target="_blank"
                  rel="noopener"
                  class="flex items-center gap-2 text-[11px] hover:bg-surface-2 -mx-1 px-1 py-1 rounded transition-colors"
                >
                  <span class="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-accent/15 text-accent flex-none">
                    {{ t.routeLabel }}
                  </span>
                  <span class="font-mono tabular-nums flex-none">{{ fmt(Number(t.amount), 4) }} {{ t.symbol }}</span>
                  <span class="text-[var(--ui-text-dimmed)] truncate flex-1 font-mono">{{ shortAddress(t.txHash) }}</span>
                  <UIcon name="i-lucide-external-link" class="size-3 text-[var(--ui-text-dimmed)] flex-none" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Confirm modal -->
    <UModal
      v-model:open="confirmOpen"
      :ui="{ content: 'max-w-sm' }"
      :close="!submitting"
      :dismissible="!submitting"
    >
      <template #title>
        <span class="text-base font-bold">Confirm transfer</span>
      </template>
      <template #description>
        <span class="text-[11px] text-[var(--ui-text-muted)]">Review before signing in your wallet.</span>
      </template>

      <div class="space-y-3">
        <div class="rounded-md bg-surface-2 p-3 space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-[var(--ui-text-dimmed)] text-xs">Amount</span>
            <span class="font-mono font-semibold">{{ fmt(numericAmount, 6) }} {{ selectedBalance?.symbol }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--ui-text-dimmed)] text-xs">From</span>
            <span class="font-mono">{{ shortAddress(address) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[var(--ui-text-dimmed)] text-xs">To {{ route.label }}</span>
            <span class="font-mono">
              {{ resolvedRecipient?.ok ? shortAddress(resolvedRecipient.address) : '—' }}
            </span>
          </div>
          <div class="flex justify-between border-t border-[var(--ui-border)] pt-2">
            <span class="text-[var(--ui-text-dimmed)] text-xs">Channel</span>
            <span class="font-mono">{{ route.channelId }}</span>
          </div>
        </div>
        <p v-if="lastResult && 'error' in lastResult" class="text-xs text-ask">{{ lastResult.error }}</p>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" :disabled="submitting" @click="confirmOpen = false">Cancel</UButton>
          <UButton :loading="submitting" :disabled="submitting" @click="confirmTransfer">
            <span v-if="!submitting">Confirm transfer</span>
            <span v-else>Signing…</span>
          </UButton>
        </div>
      </template>
    </UModal>
  </main>
</template>
