# Injective Testnet dApp

A small **Nuxt 3 / TypeScript** dApp on the **Injective (Cosmos) testnet**. One focused project that touches the whole stack:

- **Wallet integration** — connect Keplr / Leap via the modular `@injectivelabs/wallet-*` strategy packages.
- **Blockchain + Cosmos** — Injective Testnet (`injective-888`), native `inj…` bech32 addresses. Injective is built on the Cosmos SDK, so reading its chain *is* working with Cosmos.
- **gRPC-web** — on-chain data is read through the `injective-ts` gRPC-web clients (`ChainGrpcBankApi`, `IndexerGrpcSpotApi`).

## What it shows

| Screen | Covers |
| --- | --- |
| **Connect wallet → address + balances** | wallet + blockchain + gRPC read (`ChainGrpcBankApi.fetchBalances`) |
| **Spot markets list** | Cosmos / indexer + typed market data (`IndexerGrpcSpotApi.fetchMarkets`) |
| **Live order book** | Injective's on-chain order book — dense bids/asks UI with depth bars, spread, and ~2.5s polling (`fetchOrderbookV2`) |
| **Price chart** | area/line of recent trade prices with last + % change (`fetchTrades`) |
| **Depth chart** | classic cumulative bid/ask depth curve around mid |

The two charts are hand-rolled in plain SVG (zero chart-lib dependency) — full
control, no bundle/SSR risk. For production candlesticks the natural choice is
TradingView Lightweight Charts (what Injective's own UI uses).

## Stack

- Nuxt 3 (SPA / `ssr: false`)
- `@injectivelabs/sdk-ts`, `@injectivelabs/networks`, `@injectivelabs/ts-types`, `@injectivelabs/utils`
- `@injectivelabs/wallet-base`, `@injectivelabs/wallet-core`, `@injectivelabs/wallet-cosmos`

### Note on SSR

The Injective SDK pulls in node-oriented dependencies, so the app runs **client-only** (`ssr: false`) and uses `vite-plugin-node-polyfills` to provide `Buffer` / `global` / `process` in the browser. The wallet is a browser extension, so this is also the logically correct place for it to live.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

All three panels load immediately with real testnet data and **no wallet
required** — chain reads (`fetchBalances`, `fetchMarkets`, `fetchOrderbookV2`)
are public. The Wallet Balances panel defaults to a **read-only demo address**
so anyone opening the link sees real balances without connecting anything.

Connecting Keplr/Leap is optional — it just switches the panel to your own
address. Fund it from the [Injective testnet faucet](https://testnet.faucet.injective.network/).

### Demo address

Set once per deploy via env (no wallet/keys involved — read-only):

```bash
NUXT_PUBLIC_DEMO_ADDRESS=inj1...   # defaults to a funded testnet address
```

## Layout

```
composables/useInjective.ts   gRPC-web clients, wallet strategy, reactive state
utils/inj-format.ts           on-chain → human price/quantity scaling
components/WalletConnect.vue   Keplr / Leap connect, address display
components/BalancePanel.vue    bank balances (gRPC-web)
components/SpotMarkets.vue     spot markets list + filter
components/OrderBook.vue       live order book with depth bars + spread
components/PriceChart.vue      SVG price area chart from recent trades
components/DepthChart.vue      SVG cumulative depth chart (bids/asks)
pages/index.vue                dashboard + order-book/trades polling
```

> Built to get hands-on with the Injective stack.
