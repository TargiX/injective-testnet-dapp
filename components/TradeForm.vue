<script setup lang="ts">
import { fmtPrice, fmt, toHumanAmount } from '~/utils/inj-format'

const {
  selectedMarket,
  orderbookBuys,
  orderbookSells,
  isConnected,
  isDemo,
  balances,
  fillPrice,
  fillAmount,
  submitting,
  submitSpotOrder,
} = useInjective()

const toast = useToast()

type OrderSide = 'buy' | 'sell'
type OrderType = 'limit' | 'market'

const side = ref<OrderSide>('buy')
const orderType = ref<OrderType>('limit')
const priceInput = ref('')
const amountInput = ref('')

const bestAsk = computed(() => {
  const m = selectedMarket.value
  if (!m?.baseToken || !m?.quoteToken) return 0
  const bd = m.baseToken.decimals
  const qd = m.quoteToken.decimals
  const sells = orderbookSells.value
  if (!sells.length) return 0
  return Math.min(...sells.map((s) => Number(s.price) * 10 ** (bd - qd)))
})

const bestBid = computed(() => {
  const m = selectedMarket.value
  if (!m?.baseToken || !m?.quoteToken) return 0
  const bd = m.baseToken.decimals
  const qd = m.quoteToken.decimals
  const buys = orderbookBuys.value
  if (!buys.length) return 0
  return Math.max(...buys.map((b) => Number(b.price) * 10 ** (bd - qd)))
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

const baseSymbol = computed(() => selectedMarket.value?.baseToken?.symbol ?? '')
const quoteSymbol = computed(() => selectedMarket.value?.quoteToken?.symbol ?? '')

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

const availableBalance = computed(() =>
  side.value === 'buy' ? quoteBalance.value : baseBalance.value,
)

const availableLabel = computed(() =>
  side.value === 'buy' ? quoteSymbol.value : baseSymbol.value,
)

const maxBuy = computed(() =>
  price.value > 0 ? quoteBalance.value / price.value : 0,
)

function setPercent(pct: number) {
  if (side.value === 'buy') {
    amountInput.value = String(maxBuy.value * (pct / 100))
  } else {
    amountInput.value = String(baseBalance.value * (pct / 100))
  }
}

async function submitOrder() {
  if (!price.value || !amount.value) return
  const result = await submitSpotOrder(side.value, price.value, amount.value)
  if ('error' in result) {
    toast.add({ title: 'Order failed', description: result.error, color: 'error' })
  } else {
    toast.add({
      title: `${side.value === 'buy' ? 'Buy' : 'Sell'} placed`,
      description: `${fmt(amount.value, 4)} ${baseSymbol.value} @ ${fmtPrice(price.value)} ${quoteSymbol.value}`,
      color: 'success',
    })
    amountInput.value = ''
  }
}

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
    </div>

    <div class="flex-1 flex flex-col gap-2.5 px-3 py-2.5 overflow-y-auto">
      <div v-if="!selectedMarket" class="text-sm text-[var(--ui-text-muted)] text-center py-6">
        Select a market
      </div>

      <template v-else>
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-[var(--ui-text-dimmed)]">Available</span>
          <span class="font-mono tabular-nums">
            {{ fmt(availableBalance, 4) }}
            <span class="text-[var(--ui-text-dimmed)]">{{ availableLabel }}</span>
          </span>
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
              v-model="priceInput"
              type="text"
              inputmode="decimal"
              :placeholder="fmtPrice(defaultPrice)"
              class="flex-1 bg-transparent py-1.5 text-sm font-mono tabular-nums text-center outline-none"
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
              v-model="amountInput"
              type="text"
              inputmode="decimal"
              placeholder="0.00"
              class="flex-1 bg-transparent px-2.5 py-1.5 text-sm font-mono tabular-nums outline-none"
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

        <div class="flex items-center justify-between text-[11px]">
          <span class="text-[var(--ui-text-dimmed)]">Total</span>
          <span class="font-mono tabular-nums">
            {{ fmt(total, 4) }}
            <span class="text-[var(--ui-text-dimmed)]">{{ quoteSymbol }}</span>
          </span>
        </div>

        <button
          class="w-full py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          :class="side === 'buy'
            ? 'bg-bid/20 text-bid hover:bg-bid/30'
            : 'bg-ask/20 text-ask hover:bg-ask/30'"
          :disabled="!price || !amount || submitting || (!isConnected && !isDemo)"
          @click="submitOrder"
        >
          <template v-if="submitting">
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
      </template>
    </div>
  </div>
</template>
