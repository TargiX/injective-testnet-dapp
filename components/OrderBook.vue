<script setup lang="ts">
import {
  toHumanPrice,
  toHumanQuantity,
  fmtPrice,
  fmt,
} from '~/utils/inj-format'

const {
  selectedMarket,
  orderbookBuys,
  orderbookSells,
  orderbookLoading,
  orderbookUpdatedAt,
} = useInjective()

const LEVELS = 14

interface Row {
  price: number
  size: number
  cum: number
  depth: number // 0..1 share of max cumulative depth
}

function build(
  levels: { price: string; quantity: string }[],
  dir: 'asc' | 'desc',
  baseDecimals: number,
  quoteDecimals: number,
): { rows: Row[]; maxCum: number } {
  const mapped = levels.map((l) => ({
    price: toHumanPrice(l.price, baseDecimals, quoteDecimals),
    size: toHumanQuantity(l.quantity, baseDecimals),
  }))
  mapped.sort((a, b) => (dir === 'asc' ? a.price - b.price : b.price - a.price))
  const top = mapped.slice(0, LEVELS)
  let cum = 0
  const rows: Row[] = top.map((r) => {
    cum += r.size
    return { ...r, cum, depth: 0 }
  })
  return { rows, maxCum: cum }
}

const book = computed(() => {
  const m = selectedMarket.value
  if (!m || !m.baseToken || !m.quoteToken) {
    return { asks: [] as Row[], bids: [] as Row[] }
  }
  const bd = m.baseToken.decimals
  const qd = m.quoteToken.decimals

  // bids: best (highest) first, cumulative downward
  const { rows: bids, maxCum: bidMax } = build(orderbookBuys.value, 'desc', bd, qd)
  // asks: lowest first for cumulative, displayed reversed (highest on top)
  const { rows: asksAsc, maxCum: askMax } = build(orderbookSells.value, 'asc', bd, qd)

  const max = Math.max(bidMax, askMax, 1)
  for (const r of bids) r.depth = r.cum / max
  for (const r of asksAsc) r.depth = r.cum / max

  return { asks: [...asksAsc].reverse(), bids }
})

const spread = computed(() => {
  const bestAsk = book.value.asks.at(-1)?.price
  const bestBid = book.value.bids[0]?.price
  if (bestAsk == null || bestBid == null) return null
  const abs = bestAsk - bestBid
  const mid = (bestAsk + bestBid) / 2
  return { abs, pct: mid ? (abs / mid) * 100 : 0, mid }
})

const quoteSym = computed(() => selectedMarket.value?.quoteToken?.symbol ?? '')
const baseSym = computed(() => selectedMarket.value?.baseToken?.symbol ?? '')

const updatedLabel = computed(() => {
  if (!orderbookUpdatedAt.value) return ''
  const secs = Math.max(0, Math.round((Date.now() - orderbookUpdatedAt.value) / 1000))
  return secs < 2 ? 'just now' : `${secs}s ago`
})
</script>

<template>
  <section class="card book">
    <div class="card-head">
      <div class="title-wrap">
        <span class="card-title">Order Book</span>
        <span v-if="selectedMarket" class="pair-id">
          <span class="pair-icons">
            <TokenIcon :logo="(selectedMarket.baseToken as any)?.logo" :symbol="selectedMarket.baseToken?.symbol" :size="18" />
            <TokenIcon class="q" :logo="(selectedMarket.quoteToken as any)?.logo" :symbol="selectedMarket.quoteToken?.symbol" :size="18" />
          </span>
          <span class="ticker num">{{ selectedMarket.ticker }}</span>
        </span>
      </div>
      <span class="pill live">
        <span class="dot" />
        {{ orderbookLoading ? 'updating' : 'live' }}
      </span>
    </div>

    <div v-if="!selectedMarket" class="state muted">Select a market.</div>

    <div v-else class="grid">
      <div class="cols">
        <span>Price <em>{{ quoteSym }}</em></span>
        <span class="r">Size <em>{{ baseSym }}</em></span>
        <span class="r">Sum <em>{{ baseSym }}</em></span>
      </div>

      <!-- asks (sells) -->
      <div class="side asks">
        <div v-for="(r, i) in book.asks" :key="'a' + i" class="row">
          <div class="depth ask-depth" :style="{ width: r.depth * 100 + '%' }" />
          <span class="num price ask">{{ fmtPrice(r.price) }}</span>
          <span class="num r">{{ fmt(r.size, 3) }}</span>
          <span class="num r faint">{{ fmt(r.cum, 2) }}</span>
        </div>
      </div>

      <!-- spread -->
      <div class="spread">
        <template v-if="spread">
          <span class="num mid">{{ fmtPrice(spread.mid) }}</span>
          <span class="spread-meta faint">
            spread <span class="num">{{ fmtPrice(spread.abs) }}</span>
            (<span class="num">{{ spread.pct.toFixed(3) }}%</span>)
          </span>
        </template>
        <span v-else class="faint">—</span>
      </div>

      <!-- bids (buys) -->
      <div class="side bids">
        <div v-for="(r, i) in book.bids" :key="'b' + i" class="row">
          <div class="depth bid-depth" :style="{ width: r.depth * 100 + '%' }" />
          <span class="num price bid">{{ fmtPrice(r.price) }}</span>
          <span class="num r">{{ fmt(r.size, 3) }}</span>
          <span class="num r faint">{{ fmt(r.cum, 2) }}</span>
        </div>
      </div>
    </div>

    <div class="book-foot faint">
      <span>via <code>IndexerGrpcSpotApi.fetchOrderbookV2</code> · gRPC-web</span>
      <span v-if="updatedLabel">updated {{ updatedLabel }}</span>
    </div>
  </section>
</template>

<style scoped>
.book {
  display: flex;
  flex-direction: column;
}
.title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pair-id {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.pair-icons {
  display: inline-flex;
  align-items: center;
}
.pair-icons .q {
  margin-left: -7px;
}
.ticker {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.grid {
  padding: 6px 0;
}
.cols {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  padding: 6px 16px 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-faint);
}
.cols em {
  font-style: normal;
  opacity: 0.7;
}
.side {
  display: flex;
  flex-direction: column;
}
.row {
  position: relative;
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  padding: 3px 16px;
  font-size: 12.5px;
  align-items: center;
}
.depth {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 0;
}
.bid-depth {
  background: var(--bid-bg);
}
.ask-depth {
  background: var(--ask-bg);
}
.row > span {
  position: relative;
  z-index: 1;
}
.r {
  text-align: right;
}
.price {
  font-weight: 600;
}
.bid {
  color: var(--bid);
}
.ask {
  color: var(--ask);
}
.spread {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  margin: 4px 0;
  border-top: 1px solid var(--border-soft);
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-elev-2);
}
.mid {
  font-size: 15px;
  font-weight: 700;
}
.spread-meta {
  font-size: 11px;
}
.state {
  padding: 28px 16px;
}
.book-foot {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-top: 1px solid var(--border-soft);
  font-size: 11px;
}
.book-foot code {
  font-family: var(--mono);
}
</style>
