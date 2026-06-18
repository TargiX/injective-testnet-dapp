<script setup lang="ts">
import { fmtPrice, fmt, toHumanAmount } from '~/utils/inj-format'

const {
  selectedMarket,
  orderbookBuys,
  orderbookSells,
  isConnected,
  isDemo,
  balances,
  subaccountBalances,
  fillPrice,
  fillAmount,
  submitting,
  submitSpotOrder,
  submitDerivativeOrder,
  depositMargin,
} = useInjective()

const toast = useToast()

type OrderSide = 'buy' | 'sell'
type OrderType = 'limit' | 'market'
interface PendingOrder {
  side: OrderSide
  price: number
  amount: number
  total: number
  orderType: OrderType
  kind: 'spot' | 'perp'
  leverage?: number
  margin?: number
}

const side = ref<OrderSide>('buy')
const orderType = ref<OrderType>('limit')
const priceInput = ref('')
const amountInput = ref('')
const leverage = ref(1)

const confirmOpen = ref(false)
const confirming = ref(false)
const pendingOrder = ref<PendingOrder | null>(null)

// refs to inputs so keyboard shortcuts (B/S) can focus them, and Esc can blur.
const priceInputEl = ref<HTMLInputElement | null>(null)
const amountInputEl = ref<HTMLInputElement | null>(null)

const bestAsk = computed(() => {
  const m = selectedMarket.value
  if (!m?.marketId) return 0
  const sells = orderbookSells.value
  if (!sells.length) return 0
  const toHuman = m.kind === 'spot'
    ? (p: string) => Number(p) * 10 ** (m.baseDecimals - m.quoteDecimals)
    : (p: string) => Number(p) / 10 ** m.quoteDecimals
  return Math.min(...sells.map((s) => toHuman(s.price)))
})

const bestBid = computed(() => {
  const m = selectedMarket.value
  if (!m?.marketId) return 0
  const buys = orderbookBuys.value
  if (!buys.length) return 0
  const toHuman = m.kind === 'spot'
    ? (p: string) => Number(p) * 10 ** (m.baseDecimals - m.quoteDecimals)
    : (p: string) => Number(p) / 10 ** m.quoteDecimals
  return Math.max(...buys.map((b) => toHuman(b.price)))
})

const defaultPrice = computed(() =>
  side.value === 'buy' ? bestAsk.value : bestBid.value,
)

const tickSize = computed(() => {
  const p = defaultPrice.value
  if (!p) return 0.01
  if (p >= 1000) return 1
  if (p >= 100) return 0.1
  if (p >= 10) return 0.01
  if (p >= 1) return 0.001
  return 0.0001
})

const price = computed(() => {
  if (orderType.value === 'market') return defaultPrice.value
  const v = parseFloat(priceInput.value)
  return isNaN(v) || v <= 0 ? defaultPrice.value : v
})

function nudgePrice(dir: -1 | 1) {
  const current = parseFloat(priceInput.value)
  const base = isNaN(current) || current <= 0 ? defaultPrice.value : current
  priceInput.value = String(base + dir * tickSize.value)
}

const amount = computed(() => {
  const v = parseFloat(amountInput.value)
  return isNaN(v) ? 0 : v
})

const total = computed(() => price.value * amount.value)

const baseSymbol = computed(() => selectedMarket.value?.baseSymbol ?? '')
const quoteSymbol = computed(() => selectedMarket.value?.quoteSymbol ?? '')
const isPerp = computed(() => selectedMarket.value?.kind === 'perp')

const quoteBalance = computed(() => {
  const denom = selectedMarket.value?.quoteDenom
  if (!denom) return 0
  const b = balances.value.find((x) => x.denom === denom)
  return b ? toHumanAmount(b.amount, b.decimals) : 0
})

const baseBalance = computed(() => {
  const denom = selectedMarket.value?.baseDenom
  if (!denom) return 0
  const b = balances.value.find((x) => x.denom === denom)
  return b ? toHumanAmount(b.amount, b.decimals) : 0
})

// For perp, the spendable balance is the margin deposited to the subaccount
// in the quote denom. Falls back to bank balance if none deposited yet.
const marginBalance = computed(() => {
  const denom = selectedMarket.value?.quoteDenom
  if (!denom) return 0
  const b = subaccountBalances.value.find((x) => x.denom === denom)
  return b ? toHumanAmount(b.amount, b.decimals) : 0
})

const availableBalance = computed(() => {
  if (isPerp.value) return marginBalance.value || quoteBalance.value
  return side.value === 'buy' ? quoteBalance.value : baseBalance.value
})

const availableLabel = computed(() =>
  isPerp.value ? quoteSymbol.value : (side.value === 'buy' ? quoteSymbol.value : baseSymbol.value),
)

// Perp leverage is capped by the market's initial margin ratio.
const maxLeverage = computed(() => {
  const m = selectedMarket.value
  if (!m?.initialMarginRatio) return 1
  return Math.max(1, Math.floor(1 / m.initialMarginRatio))
})

const leverageOptions = computed(() => {
  const max = maxLeverage.value
  // Standard steps, clamped to the market max.
  const steps = [1, 2, 3, 5, 10, 20, 50]
  return steps.filter((s) => s <= max)
})

// Initial margin = notional / leverage.
const margin = computed(() => {
  if (!isPerp.value) return 0
  return total.value / Math.max(1, leverage.value)
})

const maxBuy = computed(() => {
  if (price.value <= 0) return 0
  if (isPerp.value) {
    // Max size = availableMargin * leverage / price
    return (availableBalance.value * leverage.value) / price.value
  }
  return quoteBalance.value / price.value
})

function setPercent(pct: number) {
  if (isPerp.value) {
    amountInput.value = String(maxBuy.value * (pct / 100))
  } else if (side.value === 'buy') {
    amountInput.value = String(maxBuy.value * (pct / 100))
  } else {
    amountInput.value = String(baseBalance.value * (pct / 100))
  }
}

// Clamp leverage when switching to a perp market with a lower max.
watch(maxLeverage, (max) => {
  if (leverage.value > max) leverage.value = max
})

// Stage 1: build a pending order and open the confirm modal (no signing yet).
function submitOrder() {
  if (!price.value || !amount.value) return
  const kind = selectedMarket.value?.kind ?? 'spot'
  pendingOrder.value = {
    side: side.value,
    price: price.value,
    amount: amount.value,
    total: total.value,
    orderType: orderType.value,
    kind,
    ...(kind === 'perp' ? { leverage: leverage.value, margin: margin.value } : {}),
  }
  confirmOpen.value = true
}

// Stage 2: user confirmed — now sign + broadcast.
async function confirmOrder() {
  const p = pendingOrder.value
  if (!p) return
  confirming.value = true
  const result = p.kind === 'perp'
    ? await submitDerivativeOrder(p.side, p.price, p.amount, p.leverage ?? 1)
    : await submitSpotOrder(p.side, p.price, p.amount)
  confirming.value = false
  if ('error' in result) {
    confirmOpen.value = false
    toast.add({ title: 'Order failed', description: result.error, color: 'error' })
  } else {
    confirmOpen.value = false
    toast.add({
      title: `${p.side === 'buy' ? 'Buy' : 'Sell'} placed`,
      description: p.kind === 'perp'
        ? `${fmt(p.amount, 4)} ${baseSymbol.value} @ ${fmtPrice(p.price)} ${quoteSymbol.value} · ${p.leverage}x`
        : `${fmt(p.amount, 4)} ${baseSymbol.value} @ ${fmtPrice(p.price)} ${quoteSymbol.value}`,
      color: 'success',
    })
    amountInput.value = ''
  }
}

// Deposit margin to the subaccount (perp only). Opens the wallet signature flow.
const depositting = ref(false)
const depositAmount = ref('')
async function handleDeposit() {
  const denom = selectedMarket.value?.quoteDenom
  if (!denom) return
  const amt = parseFloat(depositAmount.value)
  if (!(amt > 0)) return
  depositting.value = true
  const result = await depositMargin(denom, amt)
  depositting.value = false
  if ('error' in result) {
    toast.add({ title: 'Deposit failed', description: result.error, color: 'error' })
  } else {
    toast.add({
      title: 'Margin deposited',
      description: `${fmt(amt, 4)} ${quoteSymbol.value} → subaccount`,
      color: 'success',
    })
    depositAmount.value = ''
  }
}

// Keyboard shortcuts. `b`/`s` only fire when not typing in an input
// (defineShortcuts auto-disables letter shortcuts inside inputs); `escape`
// uses usingInput:true so it clears the focused price/amount field too.
// Enter is handled per-input (@keydown.enter) since you're typing when you press it.
function focusPrice() {
  // If market type hides the price input, focus amount instead.
  (priceInputEl.value ?? amountInputEl.value)?.focus()
}

defineShortcuts({
  'b': () => { side.value = 'buy'; nextTick(focusPrice) },
  's': () => { side.value = 'sell'; nextTick(focusPrice) },
  'escape': {
    handler: () => {
      priceInput.value = ''
      amountInput.value = ''
      priceInputEl.value?.blur()
      amountInputEl.value?.blur()
    },
    usingInput: true,
  },
})

watch(fillPrice, (v) => {
  if (v != null && v > 0) {
    priceInput.value = String(v)
    nextTick(() => { fillPrice.value = null })
  }
})

watch(fillAmount, (v) => {
  if (v != null && v > 0) {
    amountInput.value = String(v)
    nextTick(() => { fillAmount.value = null })
  }
})

watch(side, () => {
  priceInput.value = ''
  amountInput.value = ''
})

watch(orderType, () => {
  priceInput.value = ''
})

watch(selectedMarket, () => {
  priceInput.value = ''
  amountInput.value = ''
})
</script>

<template>
  <div class="flex flex-col rounded-lg overflow-hidden bg-[var(--ui-bg)] ring ring-[var(--ui-border)]">
    <div class="flex-none px-3 py-2 border-b border-border-soft">
      <div class="grid grid-cols-2 rounded-lg overflow-hidden bg-surface-2 p-0.5">
        <button
          class="py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all"
          :class="side === 'buy'
            ? 'bg-bid/20 text-bid shadow-sm'
            : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
          @click="side = 'buy'"
        >
          Buy
        </button>
        <button
          class="py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all"
          :class="side === 'sell'
            ? 'bg-ask/20 text-ask shadow-sm'
            : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
          @click="side = 'sell'"
        >
          Sell
        </button>
      </div>
    </div>

    <div class="flex-none flex items-center gap-1 px-3 py-1.5 border-b border-border-soft">
      <button
        v-for="t in (['limit', 'market'] as const)"
        :key="t"
        class="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors"
        :class="orderType === t
          ? 'bg-surface-3 text-[var(--ui-text)]'
          : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
        @click="orderType = t"
      >
        {{ t }}
      </button>
      <div v-if="isPerp" class="ml-auto flex items-center gap-0.5">
        <span class="text-[10px] text-[var(--ui-text-dimmed)] mr-1">Lev</span>
        <button
          v-for="lev in leverageOptions"
          :key="lev"
          class="px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors"
          :class="leverage === lev
            ? 'bg-accent/20 text-accent'
            : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
          @click="leverage = lev"
        >
          {{ lev }}x
        </button>
      </div>
    </div>

    <div class="flex-1 flex flex-col gap-2.5 px-3 py-2.5 overflow-y-auto">
      <div v-if="!selectedMarket" class="text-sm text-[var(--ui-text-muted)] text-center py-6">
        Select a market
      </div>

      <template v-else>
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-[var(--ui-text-dimmed)]">{{ isPerp ? 'Margin' : 'Available' }}</span>
          <span class="font-mono tabular-nums">
            {{ fmt(availableBalance, 4) }}
            <span class="text-[var(--ui-text-dimmed)]">{{ availableLabel }}</span>
          </span>
        </div>

        <!-- Perp: deposit margin to subaccount when none is available -->
        <div v-if="isPerp && marginBalance === 0" class="rounded-md bg-surface-2 border border-border-soft p-2 space-y-1.5">
          <p class="text-[10px] text-[var(--ui-text-dimmed)] leading-snug">
            No margin on subaccount. Deposit {{ quoteSymbol }} to trade perps.
          </p>
          <div class="flex gap-1">
            <input
              v-model="depositAmount"
              type="text"
              inputmode="decimal"
              :placeholder="`0.00 ${quoteSymbol}`"
              class="flex-1 bg-surface-3 rounded px-2 py-1 text-xs font-mono tabular-nums outline-none border border-border-soft focus:border-accent-dim"
              @keydown.enter.prevent="handleDeposit"
            />
            <button
              class="px-2 py-1 text-[10px] font-bold uppercase rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40 transition-colors"
              :disabled="!parseFloat(depositAmount) || depositting || !isConnected"
              @click="handleDeposit"
            >
              {{ depositting ? '…' : 'Deposit' }}
            </button>
          </div>
          <button
            v-if="quoteBalance > 0"
            class="text-[10px] text-accent hover:underline"
            @click="depositAmount = String(quoteBalance)"
          >
            Use bank balance ({{ fmt(quoteBalance, 2) }} {{ quoteSymbol }})
          </button>
        </div>

        <div v-if="orderType === 'limit'">
          <span class="text-[10px] text-[var(--ui-text-dimmed)] uppercase tracking-wider">Price ({{ quoteSymbol }})</span>
          <div class="mt-0.5 flex items-center rounded-md bg-surface-2 border border-border-soft focus-within:border-accent-dim transition-colors">
            <button
              class="flex-none w-8 flex items-center justify-center text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text)] transition-colors"
              @click="nudgePrice(-1)"
            >
              −
            </button>
            <input
              ref="priceInputEl"
              v-model="priceInput"
              type="text"
              inputmode="decimal"
              :placeholder="fmtPrice(defaultPrice)"
              class="flex-1 bg-transparent py-1.5 text-sm font-mono tabular-nums text-center outline-none"
              @keydown.enter.prevent="amountInputEl?.focus()"
            />
            <button
              class="flex-none w-8 flex items-center justify-center text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text)] transition-colors"
              @click="nudgePrice(1)"
            >
              +
            </button>
          </div>
        </div>

        <div v-else class="flex items-center justify-between rounded-md bg-surface-2 px-3 py-1.5 text-sm">
          <span class="text-[var(--ui-text-dimmed)] text-[10px] uppercase tracking-wider">Market price</span>
          <span class="font-mono tabular-nums">{{ fmtPrice(defaultPrice) }}</span>
        </div>

        <div>
          <span class="text-[10px] text-[var(--ui-text-dimmed)] uppercase tracking-wider">Amount ({{ baseSymbol }})</span>
          <div class="mt-0.5 flex items-center rounded-md bg-surface-2 border border-border-soft focus-within:border-accent-dim transition-colors">
            <input
              ref="amountInputEl"
              v-model="amountInput"
              type="text"
              inputmode="decimal"
              placeholder="0.00"
              class="flex-1 bg-transparent px-2.5 py-1.5 text-sm font-mono tabular-nums outline-none"
              @keydown.enter.prevent="submitOrder"
            />
          </div>
        </div>

        <div class="flex gap-1">
          <button
            v-for="p in [25, 50, 75, 100]"
            :key="p"
            class="flex-1 py-1 text-[10px] font-semibold rounded bg-surface-2 text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text)] hover:bg-surface-3 transition-colors"
            @click="setPercent(p)"
          >
            {{ p }}%
          </button>
        </div>

        <div v-if="isPerp" class="flex items-center justify-between text-[11px]">
          <span class="text-[var(--ui-text-dimmed)]">Notional</span>
          <span class="font-mono tabular-nums text-[var(--ui-text-muted)]">
            {{ fmt(total, 4) }}
            <span class="text-[var(--ui-text-dimmed)]">{{ quoteSymbol }}</span>
          </span>
        </div>
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-[var(--ui-text-dimmed)]">{{ isPerp ? 'Margin' : 'Total' }}</span>
          <span class="font-mono tabular-nums">
            <template v-if="isPerp">
              {{ fmt(margin, 4) }}
              <span class="text-[var(--ui-text-dimmed)]">{{ quoteSymbol }}</span>
            </template>
            <template v-else>
              {{ fmt(total, 4) }}
              <span class="text-[var(--ui-text-dimmed)]">{{ quoteSymbol }}</span>
            </template>
          </span>
        </div>

        <button
          class="w-full py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          :class="side === 'buy'
            ? 'bg-bid/20 text-bid hover:bg-bid/30'
            : 'bg-ask/20 text-ask hover:bg-ask/30'"
          :disabled="!price || !amount || submitting || confirming || (!isConnected && !isDemo)"
          @click="submitOrder"
        >
          <template v-if="confirming">
            Signing…
          </template>
          <template v-else-if="!isConnected && !isDemo">
            Connect Wallet
          </template>
          <template v-else>
            {{ side === 'buy' ? 'Buy' : 'Sell' }} {{ baseSymbol }}
          </template>
        </button>

        <div v-if="isDemo && !isConnected" class="text-[10px] text-center text-[var(--ui-text-dimmed)]">
          Demo mode — connect Keplr to trade
        </div>

        <div class="hidden lg:flex items-center justify-center gap-2 pt-1 text-[10px] text-[var(--ui-text-dimmed)]">
          <kbd class="px-1.5 py-0.5 rounded bg-surface-2 border border-border-soft font-mono">B</kbd>
          <span>buy</span>
          <kbd class="px-1.5 py-0.5 rounded bg-surface-2 border border-border-soft font-mono">S</kbd>
          <span>sell</span>
          <kbd class="px-1.5 py-0.5 rounded bg-surface-2 border border-border-soft font-mono">Esc</kbd>
          <span>clear</span>
        </div>
      </template>
    </div>
  </div>

  <UModal
    v-model:open="confirmOpen"
    :ui="{ content: 'max-w-sm' }"
    :close="!confirming"
    :dismissible="!confirming"
  >
    <template #title>
      <span
        class="text-base font-bold uppercase tracking-wide"
        :class="pendingOrder?.side === 'buy' ? 'text-bid' : 'text-ask'"
      >
        Confirm {{ pendingOrder?.side === 'buy' ? 'Buy' : 'Sell' }}
      </span>
    </template>

    <template #body>
      <div v-if="pendingOrder" class="space-y-2.5">
        <div class="flex items-center justify-between text-sm">
          <span class="text-[var(--ui-text-muted)]">Market</span>
          <span class="font-semibold">{{ baseSymbol }}/{{ quoteSymbol }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-[var(--ui-text-muted)]">Type</span>
          <span class="font-semibold uppercase">{{ pendingOrder.orderType }}</span>
        </div>
        <div v-if="pendingOrder.kind === 'perp'" class="flex items-center justify-between text-sm">
          <span class="text-[var(--ui-text-muted)]">Leverage</span>
          <span class="font-mono tabular-nums font-semibold">{{ pendingOrder.leverage }}x</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-[var(--ui-text-muted)]">Price</span>
          <span class="font-mono tabular-nums">{{ fmtPrice(pendingOrder.price) }} {{ quoteSymbol }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-[var(--ui-text-muted)]">Amount</span>
          <span class="font-mono tabular-nums">{{ fmt(pendingOrder.amount, 4) }} {{ baseSymbol }}</span>
        </div>
        <div class="h-px bg-border-soft my-1" />
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--ui-text-muted)]">{{ pendingOrder.kind === 'perp' ? 'Margin' : 'Total' }}</span>
          <span class="font-mono tabular-nums text-base font-bold">
            {{ fmt(pendingOrder.kind === 'perp' ? (pendingOrder.margin ?? 0) : pendingOrder.total, 4) }}
            <span class="text-[var(--ui-text-muted)] text-sm font-normal">{{ quoteSymbol }}</span>
          </span>
        </div>
        <p class="pt-1 text-[11px] text-[var(--ui-text-dimmed)] leading-snug">
          Confirming will request a signature in your wallet extension.
        </p>
      </div>
    </template>

    <template #footer="{ close }">
      <div class="flex w-full gap-2">
        <UButton
          block
          color="neutral"
          variant="subtle"
          :disabled="confirming"
          @click="close"
        >
          Cancel
        </UButton>
        <UButton
          block
          :color="pendingOrder?.side === 'buy' ? 'success' : 'error'"
          :loading="confirming"
          :disabled="confirming"
          @click="confirmOrder"
        >
          <span v-if="!confirming">Confirm {{ pendingOrder?.side === 'buy' ? 'Buy' : 'Sell' }}</span>
          <span v-else>Signing…</span>
        </UButton>
      </div>
    </template>
  </UModal>
</template>
