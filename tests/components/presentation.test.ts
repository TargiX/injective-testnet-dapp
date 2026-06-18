/**
 * Smoke tests for presentational components that take props and render
 * without hitting composables/SDK. Catches the "white screen of death" class:
 * template compile errors, undefined-prop crashes, broken v-for/v-if logic.
 *
 * Heavier components (PriceChart, TradeForm, Positions) depend on Nuxt UI
 * primitives + composables + defineShortcuts/defineProps auto-imports; mounting
 * them needs the full Nuxt environment, which is deferred to e2e. We cover
 * their LOGIC via the composable tests above.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

// AssetAllocation + TradeHistoryTable are pure-prop presentational components.
import AssetAllocation from '~/components/AssetAllocation.vue'
import TradeHistoryTable from '~/components/TradeHistoryTable.vue'

describe('AssetAllocation', () => {
  it('mounts and renders a row per asset', () => {
    const wrapper = mount(AssetAllocation, {
      props: {
        rows: [
          { denom: 'inj', symbol: 'INJ', amount: 100, usdValue: 200, pct: 66.7 },
          { denom: 'uusdt', symbol: 'USDT', amount: 50, usdValue: 100, pct: 33.3 },
        ],
      },
    })
    expect(wrapper.html()).toContain('INJ')
    expect(wrapper.html()).toContain('USDT')
    // USD values
    expect(wrapper.html()).toContain('200')
    expect(wrapper.html()).toContain('100')
  })

  it('shows the "no price" note when a denom is unpriced', () => {
    const wrapper = mount(AssetAllocation, {
      props: {
        rows: [
          { denom: 'inj', symbol: 'INJ', amount: 100, usdValue: 200, pct: 100 },
          { denom: 'factory/x/foo', symbol: 'FOO', amount: 50, usdValue: null, pct: null },
        ],
      },
    })
    expect(wrapper.html()).toContain('FOO')
    expect(wrapper.html()).toContain('no price')
  })
})

describe('TradeHistoryTable', () => {
  it('mounts and lists trades', () => {
    const wrapper = mount(TradeHistoryTable, {
      props: {
        trades: [
          { tradeId: '1', ticker: 'INJ/USDT', direction: 'buy', price: 1.5,
            quantity: 10, fee: 0.01, pnl: 5, executedAt: Date.now(), kind: 'perp' },
          { tradeId: '2', ticker: 'TIA/USDT', direction: 'sell', price: 6,
            quantity: 2, fee: 0.02, pnl: -1, executedAt: Date.now(), kind: 'spot' },
        ],
      },
    })
    expect(wrapper.html()).toContain('INJ/USDT')
    expect(wrapper.html()).toContain('TIA/USDT')
    expect(wrapper.html()).toContain('2 trades')
  })

  it('shows the empty-state when no trades match', () => {
    const wrapper = mount(TradeHistoryTable, {
      props: { trades: [] },
    })
    expect(wrapper.html()).toContain('No trades match')
  })

  it('filters by side (buy only)', async () => {
    const wrapper = mount(TradeHistoryTable, {
      props: {
        trades: [
          { tradeId: '1', ticker: 'INJ/USDT', direction: 'buy', price: 1,
            quantity: 1, fee: 0, pnl: 0, executedAt: Date.now(), kind: 'perp' },
          { tradeId: '2', ticker: 'TIA/USDT', direction: 'sell', price: 1,
            quantity: 1, fee: 0, pnl: 0, executedAt: Date.now(), kind: 'perp' },
        ],
      },
    })
    // Click the "buy" side filter.
    const buttons = wrapper.findAll('button')
    const buyBtn = buttons.find(b => b.text().toLowerCase().includes('buy'))
    await buyBtn!.trigger('click')
    // The filtered table body — exclude the datalist (which always lists all
    // tickers as filter options).
    const tableRows = wrapper.findAll('[class*="border-b border-border-soft"]')
    const tickersInRows = tableRows.map(r => r.text()).join(' ')
    expect(tickersInRows).toContain('INJ/USDT')
    expect(tickersInRows).not.toContain('TIA/USDT')
  })
})
