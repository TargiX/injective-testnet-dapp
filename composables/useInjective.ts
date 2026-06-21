import type { DerivativeMarket, SpotMarket } from '@injectivelabs/sdk-ts'

export type WalletId = 'keplr' | 'cosmostation'

export type MarketMode = 'spot' | 'perp'

/**
 * Normalized market descriptor consumed by UI components. Spot markets come
 * straight from the spot indexer; perpetual markets are oracle-priced
 * synthetics with no base token. Components read `baseDecimals`/`quoteDecimals`
 * instead of poking `baseToken.decimals` directly so both kinds render through
 * the same code paths.
 *
 * NOTE on quantity scaling: spot quantity divides by baseDecimals, but perp
 * quantity has NO decimals (chain quantity == human quantity). Components that
 * convert chain quantity must branch on `kind`; see OrderBook/TradeHistory.
 */
export interface MarketRef {
  kind: MarketMode
  marketId: string
  ticker: string // 'INJ/USDT' (spot) | 'INJ/USDT PERP' (perp)
  baseSymbol: string // 'INJ'
  quoteSymbol: string // 'USDT'
  quoteDenom: string
  quoteDecimals: number
  baseDecimals: number // spot: baseToken.decimals; perp: price decimals from tens multiplier
  minPriceTickSize: number
  minQuantityTickSize: number
  // spot-only
  baseDenom?: string
  // perp-only
  initialMarginRatio?: number
  maintenanceMarginRatio?: number
  oracleScaleFactor?: number
  isPerpetual?: boolean
  raw: SpotMarket | DerivativeMarket
}

/**
 * Normalized derivative position in human-readable values. Used by the
 * Positions panel. upnl is self-computed (the V2 endpoint may return "0").
 */
export interface PositionRow {
  marketId: string
  ticker: string
  direction: 'long' | 'short'
  quantity: number
  entryPrice: number
  markPrice: number
  margin: number
  liquidationPrice: number
  upnl: number
  upnlPct: number
  leverage: number
}

export interface TokenInfo {
  denom: string
  symbol: string
  decimals: number
  logo?: string
  name?: string
}

export interface BalanceRow {
  denom: string
  symbol: string
  amount: string
  decimals: number
  logo?: string
  name?: string
  /** Chain the balance lives on ('injective' | 'osmosis' | 'cosmoshub'). */
  chain?: string
}

export interface OrderbookLevel {
  price: string
  quantity: string
}

export interface PricePoint {
  t: number // ms timestamp
  p: number // human price
}

export type ChartResolution = '1' | '5' | '15' | '60' | '240' | '1D' | '1W'

export interface PriceCandle {
  time: number // seconds timestamp, as expected by lightweight-charts
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Endpoints {
  grpc: string
  indexer: string
  chart: string
}

// The Injective SDK is large and node-oriented, so we never pull it into the
// SSR/server bundle. Everything is loaded lazily via dynamic import the first
// time a chain/wallet call runs — which is always client-side (onMounted or a
// click handler).
interface Engine {
  endpoints: Endpoints
  bankApi: any
  spotApi: any
  derivApi: any
  accountApi: any
  chartApi: any
  walletStrategy: any
  Wallet: any
}

let enginePromise: Promise<Engine> | null = null

/**
 * @internal test-only — swap the engine singleton so unit tests can inject a
 * mock without hitting the real Injective gRPC endpoints. Only imported from
 * tests; production code never calls this.
 */
export function __setEngineForTesting(engine: Partial<Engine>) {
  enginePromise = Promise.resolve(engine as Engine)
}
/** @internal test-only — reset the singleton between tests. */
export function __resetEngineForTesting() {
  enginePromise = null
}

async function createEngine(): Promise<Engine> {
  const [
    sdk,
    networks,
    tsTypes,
    walletBase,
    walletCore,
    walletCosmos,
    indexerProto,
    grpcWeb,
  ] = await Promise.all([
    import('@injectivelabs/sdk-ts'),
    import('@injectivelabs/networks'),
    import('@injectivelabs/ts-types'),
    import('@injectivelabs/wallet-base'),
    import('@injectivelabs/wallet-core'),
    import('@injectivelabs/wallet-cosmos'),
    import('@injectivelabs/indexer-proto-ts-v2'),
    import('@protobuf-ts/grpcweb-transport'),
  ])

  const isTestnet = useRuntimeConfig().public.network === 'testnet'
  const network = isTestnet ? networks.Network.Testnet : networks.Network.Mainnet
  const endpoints = networks.getNetworkEndpoints(network)
  // Chart endpoint fallback differs per network; the k8s chart service is
  // mainnet-only, so on testnet we prefer the indexer's chart endpoint.
  const chartEndpoint =
    endpoints.chart && endpoints.chart !== endpoints.indexer
      ? endpoints.chart
      : isTestnet
        ? endpoints.indexer
        : 'https://k8s.mainnet.chart.grpc-web.injective.network'
  const { Wallet } = walletBase
  const { ChainId } = tsTypes

  // Chain, exchange indexer, and chart history are separate gRPC-web services.
  const bankApi = new sdk.ChainGrpcBankApi(endpoints.grpc)
  const spotApi = new sdk.IndexerGrpcSpotApi(endpoints.indexer)
  const derivApi = new sdk.IndexerGrpcDerivativesApi(endpoints.indexer)
  const accountApi = new sdk.IndexerGrpcAccountApi(endpoints.indexer)
  const chartApi = new indexerProto.InjectiveChartRPCClient(
    new grpcWeb.GrpcWebFetchTransport({
      baseUrl: chartEndpoint,
      format: 'binary',
    }),
  )

  // NOTE on Cosmostation: the SDK has TWO bugs blocking it:
  //   1. CosmosWalletStrategy's constructor allow-list (`cosmosWallets`) omits
  //      Cosmostation, so `new CosmosWalletStrategy({ wallet: Wallet.Cosmostation })`
  //      throws "Cosmos Wallet for Cosmostation is not supported". That array
  //      isn't exported. Fix: build a Keplr strategy (passes the guard) then swap
  //      its `wallet` + inner `cosmosWallet` to Cosmostation. The inner
  //      CosmosWallet allow-list DOES include Cosmostation.
  //   2. checkCosmostationChainSupport() requires injective-1 in a `.official[]`
  //      array Cosmostation no longer populates. Fix: no-op the stale check on
  //      our inner instance (Cosmostation's Keplr-compatible API handles enable).
  // getCurrentCosmosWallet() just returns this.cosmosWallet without re-validating,
  // so the swaps are safe and complete. Instance-level → no effect on Keplr.
  const cosmostationStrategy = new walletCosmos.CosmosWalletStrategy({
    chainId: ChainId.Mainnet,
    wallet: Wallet.Keplr, // passes the constructor guard (bug #1 bypass)
  })
  const cosmostationInner = new walletCosmos.CosmosWallet({
    wallet: Wallet.Cosmostation, // inner allow-list includes it
    chainId: ChainId.Mainnet,
  })
  ;(cosmostationInner as any).checkChainIdSupport = async () => true // bug #2 bypass
  ;(cosmostationStrategy as any).wallet = Wallet.Cosmostation
  ;(cosmostationStrategy as any).cosmosWallet = cosmostationInner

  const walletStrategy = new walletCore.BaseWalletStrategy({
    chainId: ChainId.Mainnet,
    strategies: {
      [Wallet.Keplr]: new walletCosmos.CosmosWalletStrategy({
        chainId: ChainId.Mainnet,
        wallet: Wallet.Keplr,
      }),
      [Wallet.Cosmostation]: cosmostationStrategy,
    },
  })

  return {
    endpoints: { grpc: endpoints.grpc, indexer: endpoints.indexer, chart: chartEndpoint },
    bankApi,
    spotApi,
    derivApi,
    accountApi,
    chartApi,
    walletStrategy,
    Wallet,
  }
}

function getEngine(): Promise<Engine> {
  return (enginePromise ??= createEngine())
}

export function useInjective() {
  // Network selection ('mainnet' | 'testnet') from runtime config. Resolved
  // once per composable scope; broadcast functions read this via getNetwork().
  const isTestnet = useRuntimeConfig().public.network === 'testnet'

  // Resolve the sdk Network enum + chain id lazily (avoid importing the whole
  // networks package on SSR where the composable is created but never trades).
  async function getNetwork() {
    const networks = await import('@injectivelabs/networks')
    const network = isTestnet ? networks.Network.Testnet : networks.Network.Mainnet
    const endpoints = networks.getNetworkEndpoints(network)
    return { network, endpoints }
  }
  const chainId = isTestnet ? 'injective-888' : 'injective-1'

  const address = useState<string>('inj-address', () => '')
  const walletName = useState<string>('inj-wallet', () => '')
  const connecting = useState<boolean>('inj-connecting', () => false)
  const walletError = useState<string>('inj-wallet-error', () => '')

  const balances = useState<BalanceRow[]>('inj-balances', () => [])
  const balancesLoading = useState<boolean>('inj-balances-loading', () => false)

  // Subaccount (margin) balances — required for derivatives trading. Spot draws
  // directly from the bank balance; perp orders must have quote-denom margin
  // deposited to the subaccount via MsgDeposit.
  const subaccountBalances = useState<BalanceRow[]>('inj-sub-balances', () => [])

  const spotMarkets = useState<MarketRef[]>('inj-spot-markets', () => [])
  const derivMarkets = useState<MarketRef[]>('inj-deriv-markets', () => [])
  const mode = useState<MarketMode>('inj-mode', () => 'spot')
  // `markets` reflects the active mode — SpotMarkets.vue / selectMarket read it.
  const markets = computed(() => (mode.value === 'spot' ? spotMarkets.value : derivMarkets.value))
  const marketsLoading = useState<boolean>('inj-markets-loading', () => false)
  const marketsError = useState<string>('inj-markets-error', () => '')

  const selectedMarketId = useState<string>('inj-selected-market', () => '')
  const orderbookBuys = useState<OrderbookLevel[]>('inj-ob-buys', () => [])
  const orderbookSells = useState<OrderbookLevel[]>('inj-ob-sells', () => [])
  const orderbookLoading = useState<boolean>('inj-ob-loading', () => false)
  const orderbookUpdatedAt = useState<number>('inj-ob-updated', () => 0)

  // Connection health: derived from how recently the orderbook refreshed.
  // The poll cycle (index.vue, ~3s) updates latencyMs/connectionState on each
  // tick; this computed is the reactive source of truth for the indicator.
  const latencyMs = useState<number>('inj-latency', () => 0)
  const lastPollAt = useState<number>('inj-last-poll', () => 0)
  const connectionState = computed<'connecting' | 'live' | 'stale' | 'offline'>(() => {
    const updated = orderbookUpdatedAt.value
    if (!updated) return 'connecting'
    const ageMs = Date.now() - updated
    if (ageMs < 6000) return 'live'        // ~2 poll cycles fresh
    if (ageMs < 15000) return 'stale'      // lagging but reachable
    return 'offline'                       // book hasn't moved in 5+ cycles
  })

  // Recent trades are live market activity. Historical OHLCV chart data is
  // loaded separately through InjectiveChartRPC below.
  const pricePoints = useState<PricePoint[]>('inj-price-points', () => [])
  const tradesLoading = useState<boolean>('inj-trades-loading', () => false)
  const chartCandles = useState<PriceCandle[]>('inj-chart-candles', () => [])
  const chartCandlesLoading = useState<boolean>('inj-chart-candles-loading', () => false)
  const chartCandlesError = useState<string>('inj-chart-candles-error', () => '')

  const marketStats = useState<{
    lastPrice: number
    changePct: number
    high: number
    low: number
    volume: number
    quoteVolume: number
  } | null>('inj-market-stats', () => null)

  const fillPrice = useState<number | null>('inj-fill-price', () => null)
  const fillAmount = useState<number | null>('inj-fill-amount', () => null)

  const endpoints = useState<Endpoints>('inj-endpoints', () => ({
    grpc: '',
    indexer: '',
    chart: '',
  }))

  const tokenRegistry = useState<Record<string, TokenInfo>>(
    'inj-token-registry',
    () => ({ inj: { denom: 'inj', symbol: 'INJ', decimals: 18 } }),
  )

  // Read-only demo address (from runtime config / env) so balances render with
  // real on-chain data even when no wallet is connected.
  // Demo address is mainnet-specific; on testnet we just show empty balances
  // in demo mode (you'll connect a wallet with faucet funds to trade).
  const configDemoAddress = useRuntimeConfig().public.demoAddress as string
  const demoAddress = isTestnet ? '' : configDemoAddress

  const isConnected = computed(() => !!address.value)
  // Whose balances we display: the connected wallet, or the demo address.
  const viewAddress = computed(() => address.value || demoAddress)
  const isDemo = computed(() => !address.value)

  const selectedMarket = computed(() =>
    markets.value.find((m) => m.marketId === selectedMarketId.value),
  )

  function registerMarketTokens(list: MarketRef[]) {
    const reg = { ...tokenRegistry.value }
    for (const m of list) {
      // Spot base token
      if (m.kind === 'spot' && m.baseDenom) {
        const raw = m.raw as SpotMarket
        reg[m.baseDenom] = {
          denom: m.baseDenom,
          symbol: m.baseSymbol,
          decimals: m.baseDecimals,
          logo: (raw.baseToken as any)?.logo,
          name: (raw.baseToken as any)?.name,
        }
      }
      // Quote token (both spot + perp settle in a quote denom)
      if (m.quoteDenom) {
        const raw = m.raw as SpotMarket | DerivativeMarket
        const qt = (raw as any).quoteToken
        reg[m.quoteDenom] = {
          denom: m.quoteDenom,
          symbol: m.quoteSymbol,
          decimals: m.quoteDecimals,
          logo: qt?.logo,
          name: qt?.name,
        }
      }
    }
    tokenRegistry.value = reg
  }

  /** Normalize a SpotMarket into the unified MarketRef. */
  function toSpotRef(m: SpotMarket): MarketRef {
    return {
      kind: 'spot',
      marketId: m.marketId,
      ticker: m.ticker,
      baseSymbol: m.baseToken?.symbol ?? '',
      quoteSymbol: m.quoteToken?.symbol ?? '',
      baseDenom: m.baseDenom,
      quoteDenom: m.quoteDenom,
      baseDecimals: m.baseToken?.decimals ?? 18,
      quoteDecimals: m.quoteToken?.decimals ?? 6,
      minPriceTickSize: m.minPriceTickSize,
      minQuantityTickSize: m.minQuantityTickSize,
      raw: m,
    }
  }

  /** Normalize a PerpetualMarket into the unified MarketRef. */
  function toPerpRef(m: DerivativeMarket): MarketRef {
    const p = m as any // PerpetualMarket fields
    // Base/quote symbols come from the oracle pair (e.g. 'INJ' / 'USDT').
    const baseSymbol = p.oracleBase ?? ''
    const quoteSymbol = p.oracleQuote ?? ''
    const ticker = p.ticker ?? `${baseSymbol}/${quoteSymbol} PERP`
    return {
      kind: 'perp',
      marketId: p.marketId,
      ticker,
      baseSymbol,
      quoteSymbol,
      quoteDenom: p.quoteDenom,
      quoteDecimals: p.quoteToken?.decimals ?? 6,
      // Perp prices/margins scale by quoteDecimals; quantity has no decimals.
      // baseDecimals is used only for price-tick math, so derive it from quote.
      baseDecimals: p.quoteToken?.decimals ?? 6,
      minPriceTickSize: p.minPriceTickSize,
      minQuantityTickSize: p.minQuantityTickSize,
      initialMarginRatio: Number(p.initialMarginRatio),
      maintenanceMarginRatio: Number(p.maintenanceMarginRatio),
      oracleScaleFactor: p.oracleScaleFactor,
      isPerpetual: p.isPerpetual,
      raw: m,
    }
  }

  async function init() {
    const engine = await getEngine()
    endpoints.value = engine.endpoints
  }

  // ---- wallet ----

  /**
   * Wallet extensions inject their global (window.leap / window.keplr) via a
   * content script that runs after the page loads — and a freshly-installed
   * extension often needs a page refresh before it injects. The SDK checks the
   * global synchronously and throws "Please install X extension" if it's
   * missing at that instant. To avoid a misleading error right after install,
   * we poll for the global for up to ~3s before handing off to the SDK.
   */
  function walletGlobal(walletId: WalletId): any {
    const w = typeof window !== 'undefined' ? (window as any) : {}
    if (walletId === 'cosmostation') {
      // Cosmostation injects window.cosmostation.providers.keplr — a Keplr-compatible
      // API we route through the (working) Keplr strategy. See connect() for why.
      return w.cosmostation?.providers?.keplr
    }
    return w.keplr
  }

  async function waitForWallet(walletId: WalletId, timeoutMs = 3000): Promise<boolean> {
    if (walletGlobal(walletId)) return true
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 200))
      if (walletGlobal(walletId)) return true
    }
    return false
  }

  async function suggestKeplrChain() {
    const keplr = (window as any).keplr
    if (!keplr) return

    const rpcUrl = endpoints.value.grpc || 'https://sentry.tm.injective.network:443'
    const restUrl = endpoints.value.grpc || 'https://sentry.lcd.injective.network:443'

    try {
      await keplr.experimentalSuggestChain({
        chainId,
        chainName: isTestnet ? 'Injective Testnet' : 'Injective',
        rpc: rpcUrl,
        rest: restUrl,
        bip44: { coinType: 60 },
        bech32Config: {
          bech32PrefixAccAddr: 'inj',
          bech32PrefixAccPub: 'injpub',
          bech32PrefixValAddr: 'injvaloper',
          bech32PrefixValPub: 'injvaloperpub',
          bech32PrefixConsAddr: 'injvalcons',
          bech32PrefixConsPub: 'injvalconspub',
        },
        currencies: [
          { coinDenom: 'INJ', coinMinimalDenom: 'inj', coinDecimals: 18 },
        ],
        feeCurrencies: [
          { coinDenom: 'INJ', coinMinimalDenom: 'inj', coinDecimals: 18, gasPriceStep: { low: 500000000, average: 750000000, high: 1000000000 } },
        ],
        stakeCurrency: { coinDenom: 'INJ', coinMinimalDenom: 'inj', coinDecimals: 18 },
      })
    } catch {
      // chain suggestion rejected or already exists — ignore
    }
  }

  async function connect(walletId: WalletId) {
    connecting.value = true
    walletError.value = ''
    try {
      // Wait for the extension's injected global (handles the just-installed /
      // slow-injection race). If it never appears, give an actionable error
      // rather than the SDK's bare "Please install" (which is misleading when
      // the user just installed it but hasn't refreshed the page).
      const found = await waitForWallet(walletId)
      if (!found) {
        throw new Error(
          `${walletId === 'cosmostation' ? 'Cosmostation' : 'Keplr'} not detected. ` +
          'If you just installed the extension, refresh the page and try again.',
        )
      }

      const { walletStrategy, Wallet } = await getEngine()
      const target = walletId === 'cosmostation' ? Wallet.Cosmostation : Wallet.Keplr
      await walletStrategy.setWallet(target)

      if (walletId === 'keplr') {
        await suggestKeplrChain()
      }

      const addresses = await walletStrategy.enableAndGetAddresses()
      address.value = addresses[0] ?? ''
      walletName.value = walletId
      if (address.value) await loadBalances()
    } catch (e: any) {
      walletError.value = e?.message || 'Failed to connect wallet'
    } finally {
      connecting.value = false
    }
  }

  function disconnect() {
    address.value = ''
    walletName.value = ''
    walletError.value = ''
    // Fall back to the read-only demo address balances.
    loadBalances()
  }

  // ---- balances (chain, gRPC-web) ----
  // Reads balances for the connected wallet, or the demo address when no wallet
  // is connected. fetchBalances is a public read — no signing, no wallet needed.
  async function loadBalances() {
    if (!viewAddress.value) return
    balancesLoading.value = true
    try {
      const { bankApi } = await getEngine()
      const res = await bankApi.fetchBalances(viewAddress.value)
      const reg = tokenRegistry.value
      balances.value = res.balances.map((b: { denom: string; amount: string }) => {
        const token = reg[b.denom]
        return {
          denom: b.denom,
          symbol: token?.symbol ?? b.denom,
          amount: b.amount,
          decimals: token?.decimals ?? 0,
          logo: token?.logo,
          name: token?.name,
          chain: 'injective',
        }
      })
    } catch (e: any) {
      walletError.value = e?.message || 'Failed to fetch balances'
    } finally {
      balancesLoading.value = false
    }
  }

  // ---- spot + perp markets (indexer, gRPC-web) ----
  async function loadMarkets() {
    marketsLoading.value = true
    marketsError.value = ''
    try {
      const { spotApi, derivApi } = await getEngine()
      const [spotRes, derivRes] = await Promise.all([
        spotApi.fetchMarkets(),
        derivApi.fetchMarkets().catch(() => []), // perp load must not block spot
      ])

      const spot: MarketRef[] = (spotRes as SpotMarket[])
        .filter((m) => m.baseToken && m.quoteToken)
        .map(toSpotRef)
        .sort((a, b) => a.ticker.localeCompare(b.ticker))
      spotMarkets.value = spot

      const perp: MarketRef[] = (derivRes as DerivativeMarket[])
        .filter((m: any) => m.isPerpetual && m.quoteToken) // perp only, drop expiry/binary
        .map(toPerpRef)
        .sort((a, b) => a.ticker.localeCompare(b.ticker))
      derivMarkets.value = perp

      registerMarketTokens([...spot, ...perp])

      if (!selectedMarketId.value) {
        // Start on the flagship Injective spot market and fall back only if it
        // is unavailable on the current endpoint.
        const prefer = ['INJ/USDT', 'INJ/USDC', 'TIA/USDT']
        const pick =
          prefer
            .map((t) => spot.find((m) => m.ticker === t))
            .find(Boolean) ?? spot[0]
        selectedMarketId.value = pick?.marketId ?? ''
      }
    } catch (e: any) {
      marketsError.value = e?.message || 'Failed to fetch markets'
    } finally {
      marketsLoading.value = false
    }
  }

  function selectMarket(marketId: string) {
    if (marketId === selectedMarketId.value) return
    // Clear stale data; the page's watcher reloads book + trades for the new id.
    orderbookBuys.value = []
    orderbookSells.value = []
    pricePoints.value = []
    recentTrades.value = []
    chartCandles.value = []
    marketStats.value = null
    chartCandlesError.value = ''
    selectedMarketId.value = marketId
  }

  /** Switch spot ↔ perp and select a sensible default market in the new mode. */
  function switchMode(next: MarketMode) {
    if (next === mode.value) return
    mode.value = next
    const list = next === 'spot' ? spotMarkets.value : derivMarkets.value
    const prefer = next === 'spot'
      ? ['INJ/USDT', 'INJ/USDC', 'TIA/USDT']
      : ['INJ/USDT PERP', 'INJ-USDT PERP', 'TIA/USDT PERP', 'INJ/USDC PERP']
    const pick =
      prefer
        .map((t) => list.find((m) => m.ticker.toUpperCase() === t.toUpperCase()))
        .find(Boolean) ?? list[0]
    selectMarket(pick?.marketId ?? '')
  }

  // ---- order book (indexer, gRPC-web) ----
  async function loadOrderbook() {
    const market = selectedMarket.value
    const marketId = selectedMarketId.value
    if (!marketId || !market) return
    orderbookLoading.value = true
    try {
      const { spotApi, derivApi } = await getEngine()
      const api = market.kind === 'spot' ? spotApi : derivApi
      const ob = await api.fetchOrderbookV2(marketId)
      orderbookBuys.value = ob.buys ?? []
      orderbookSells.value = ob.sells ?? []
      orderbookUpdatedAt.value = Date.now()
    } catch {
      // transient indexer hiccup — keep the last good book
    } finally {
      orderbookLoading.value = false
    }
  }

  // ---- recent trades → price series (indexer, gRPC-web) ----
  const recentTrades = useState<any[]>('inj-recent-trades', () => [])

  async function loadTrades() {
    const market = selectedMarket.value
    if (!market?.marketId) return
    tradesLoading.value = true
    try {
      const { spotApi, derivApi } = await getEngine()
      const api = market.kind === 'spot' ? spotApi : derivApi
      const res = await api.fetchTrades({ marketId: market.marketId })
      const list: any[] = res.trades ?? res ?? []
      const qd = market.quoteDecimals

      recentTrades.value = list

      // Spot chain price: human = chainPrice * 10^(baseDecimals - quoteDecimals)
      // Perp chain price: human = chainPrice / 10^quoteDecimals  (price is in
      // quote units, scaled only by quoteDecimals — no base token).
      const toHumanPrice =
        market.kind === 'spot'
          ? (p: string) => Number(p) * 10 ** (market.baseDecimals - qd)
          : (p: string) => Number(p) / 10 ** qd

      const points = list
        .map((t) => ({
          t: Number(t.executedAt),
          p: toHumanPrice(t.price),
        }))
        .filter((pt) => pt.t > 0 && isFinite(pt.p) && pt.p > 0)
        .sort((a, b) => a.t - b.t)
      pricePoints.value = points
    } catch {
      // keep last good series
    } finally {
      tradesLoading.value = false
    }
  }

  let chartCandlesRequestId = 0

  // ---- historical candles (chart RPC / TradingView-compatible bars) ----
  async function loadChartCandles(
    resolution: ChartResolution = '5',
    countback = 240,
  ) {
    const market = selectedMarket.value
    if (!market?.marketId) return

    const requestId = ++chartCandlesRequestId
    chartCandlesLoading.value = true
    chartCandlesError.value = ''

    try {
      const { chartApi } = await getEngine()
      const to = Math.floor(Date.now() / 1000)
      // Call as a method (chartApi.fn(...)) not a detached reference — the
      // gRPC client relies on `this` (this.client.methods). Detaching throws
      // "Cannot read properties of undefined (reading 'methods')".
      const req = {
        symbol: '',
        marketId: market.marketId,
        resolution,
        from: 0,
        to,
        countback,
        fillGaps: false,
      }
      const res = market.kind === 'spot'
        ? (await chartApi.spotMarketHistory(req)).response
        : (await chartApi.derivativeMarketHistory(req)).response

      const candles: PriceCandle[] = (res.t ?? [])
        .map((time: number, index: number) => ({
          time,
          open: Number(res.o?.[index]),
          high: Number(res.h?.[index]),
          low: Number(res.l?.[index]),
          close: Number(res.c?.[index]),
          volume: Number(res.v?.[index] ?? 0),
        }))
        .filter((c: PriceCandle) =>
          c.time > 0 &&
          [c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) &&
          c.open > 0 &&
          c.high > 0 &&
          c.low > 0 &&
          c.close > 0,
        )
        .sort((a: PriceCandle, b: PriceCandle) => a.time - b.time)

      if (requestId === chartCandlesRequestId) {
        chartCandles.value = candles
        if (!candles.length && res.s && res.s !== 'ok') {
          chartCandlesError.value = `Chart history unavailable: ${res.s}`
        }
      }
    } catch (e: any) {
      if (requestId === chartCandlesRequestId) {
        chartCandlesError.value = e?.message || 'Failed to fetch chart history'
      }
    } finally {
      if (requestId === chartCandlesRequestId) {
        chartCandlesLoading.value = false
      }
    }
  }

  // ---- 24h market stats from hourly candles ----
  async function loadMarketStats() {
    const market = selectedMarket.value
    if (!market?.marketId) return

    try {
      const { chartApi } = await getEngine()
      const to = Math.floor(Date.now() / 1000)
      // Call as a method — see loadChartCandles for the `this`-binding note.
      const req = {
        symbol: '',
        marketId: market.marketId,
        resolution: '60',
        from: 0,
        to,
        countback: 24,
        fillGaps: false,
      }
      const res = market.kind === 'spot'
        ? (await chartApi.spotMarketHistory(req)).response
        : (await chartApi.derivativeMarketHistory(req)).response

      const times = res.t ?? []
      if (!times.length) return

      const opens = (res.o ?? []).map(Number)
      const highs = (res.h ?? []).map(Number)
      const lows = (res.l ?? []).map(Number)
      const closes = (res.c ?? []).map(Number)
      const vols = (res.v ?? []).map(Number)

      const valid = times.map((_, i) => i).filter(i =>
        opens[i] > 0 && closes[i] > 0 && isFinite(opens[i]) && isFinite(closes[i])
      )
      if (!valid.length) return

      const lastClose = closes[valid[valid.length - 1]]
      const firstOpen = opens[valid[0]]
      const changePct = firstOpen ? ((lastClose - firstOpen) / firstOpen) * 100 : 0

      marketStats.value = {
        lastPrice: lastClose,
        changePct,
        high: Math.max(...valid.map(i => highs[i])),
        low: Math.min(...valid.map(i => lows[i])),
        volume: valid.reduce((sum, i) => sum + (vols[i] || 0), 0),
        quoteVolume: valid.reduce((sum, i) => sum + (vols[i] || 0) * closes[i], 0),
      }
    } catch {
      // transient — keep last
    }
  }

  // ---- shared broadcast helper (chain, gRPC-web) ----
  // Every order/deposit/IBC transfer builds a MsgBase and signs it through the
  // same MsgBroadcaster over walletStrategy. Centralizing the boilerplate keeps
  // the call sites short and the rejected/error message normalization uniform.
  // `msgs` may be a single message or an array; MsgBroadcaster accepts both.
  async function broadcastMsg(
    msgs: any | any[],
  ): Promise<{ txHash: string } | { error: string }> {
    if (!address.value) return { error: 'Wallet not connected' }
    try {
      const [{ walletStrategy }, walletCore] = await Promise.all([
        getEngine(),
        import('@injectivelabs/wallet-core'),
      ])
      const { network, endpoints } = await getNetwork()

      const broadcaster = new walletCore.MsgBroadcaster({
        network,
        endpoints,
        walletStrategy,
      })

      const response = await broadcaster.broadcast({
        msgs,
        injectiveAddress: address.value,
      })

      return { txHash: response.txHash }
    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Transaction failed'
      return { error: msg.includes('User rejected') ? 'Rejected by user' : msg }
    }
  }

  // ---- order submission (chain, gRPC-web) ----
  const submitting = ref(false)

  async function submitSpotOrder(
    orderSide: 'buy' | 'sell',
    humanPrice: number,
    humanQuantity: number,
  ): Promise<{ txHash: string } | { error: string }> {
    if (!address.value) return { error: 'Wallet not connected' }
    const market = selectedMarket.value
    if (!market?.marketId) return { error: 'No market selected' }

    submitting.value = true
    try {
      const sdk = await import('@injectivelabs/sdk-ts')

      const subaccountId = sdk.getDefaultSubaccountId(address.value)

      const msg = sdk.MsgCreateSpotLimitOrder.fromJSON({
        marketId: market.marketId,
        subaccountId,
        injectiveAddress: address.value,
        orderType: orderSide === 'buy' ? sdk.OrderType.BUY : sdk.OrderType.SELL,
        price: humanPrice.toString(),
        quantity: humanQuantity.toString(),
        feeRecipient: address.value,
      })

      const result = await broadcastMsg(msg)
      if ('error' in result) return result

      loadBalances()
      loadOrderbook()

      return { txHash: result.txHash }
    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Transaction failed'
      return { error: msg.includes('User rejected') ? 'Rejected by user' : msg }
    } finally {
      submitting.value = false
    }
  }

  // ---- derivatives: order submission (chain, gRPC-web) ----
  async function submitDerivativeOrder(
    orderSide: 'buy' | 'sell',
    humanPrice: number,
    humanQuantity: number,
    leverage: number,
  ): Promise<{ txHash: string } | { error: string }> {
    if (!address.value) return { error: 'Wallet not connected' }
    const market = selectedMarket.value
    if (!market?.marketId || market.kind !== 'perp') return { error: 'No perp market selected' }
    if (!(humanPrice > 0) || !(humanQuantity > 0)) return { error: 'Invalid price or quantity' }

    const imr = market.initialMarginRatio
    const maxLeverage = imr ? Math.floor(1 / imr) : 1
    const lev = Math.max(1, Math.min(leverage, maxLeverage))

    submitting.value = true
    try {
      const sdk = await import('@injectivelabs/sdk-ts')

      const raw = market.raw as any
      const tens = sdk.getDerivativeMarketTensMultiplier({
        quoteDecimals: market.quoteDecimals,
        minPriceTickSize: raw.minPriceTickSize,
        minQuantityTickSize: raw.minQuantityTickSize,
      })

      // Initial margin = notional / leverage, in human quote units.
      const notional = humanPrice * humanQuantity
      const humanMargin = notional / lev

      // Scale human → chain using the SDK's fixed-precision helpers.
      const chainPrice = sdk.derivativePriceToChainPriceToFixed({
        value: humanPrice,
        tensMultiplier: tens.priceTensMultiplier,
        quoteDecimals: market.quoteDecimals,
      })
      const chainMargin = sdk.derivativeMarginToChainMarginToFixed({
        value: humanMargin,
        tensMultiplier: tens.priceTensMultiplier,
        quoteDecimals: market.quoteDecimals,
      })
      const chainQuantity = sdk.derivativeQuantityToChainQuantityToFixed({
        value: humanQuantity,
        tensMultiplier: tens.quantityTensMultiplier,
      })

      const subaccountId = sdk.getDefaultSubaccountId(address.value)

      const msg = sdk.MsgCreateDerivativeLimitOrder.fromJSON({
        marketId: market.marketId,
        subaccountId,
        injectiveAddress: address.value,
        // OrderType enum (numeric) — same namespace as spot; ts types are loose here.
        orderType: (orderSide === 'buy' ? sdk.OrderType.BUY : sdk.OrderType.SELL) as any,
        price: chainPrice,
        margin: chainMargin,
        quantity: chainQuantity,
        feeRecipient: address.value,
      })

      const result = await broadcastMsg(msg)
      if ('error' in result) return result

      loadBalances()
      loadSubaccountBalances()
      loadOrderbook()

      return { txHash: result.txHash }
    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Transaction failed'
      return { error: msg.includes('User rejected') ? 'Rejected by user' : msg }
    } finally {
      submitting.value = false
    }
  }

  // ---- open orders (indexer) ----
  const openOrders = useState<any[]>('inj-open-orders', () => [])
  const ordersLoading = ref(false)

  async function loadOpenOrders() {
    if (!address.value) {
      openOrders.value = []
      return
    }
    ordersLoading.value = true
    try {
      const { spotApi } = await getEngine()
      const sdk = await import('@injectivelabs/sdk-ts')
      const subaccountId = sdk.getDefaultSubaccountId(address.value)
      const res = await spotApi.fetchOrders({ subaccountId })
      openOrders.value = res.orders ?? []
    } catch {
      // transient — keep last
    } finally {
      ordersLoading.value = false
    }
  }

  const cancellingIds = ref<Set<string>>(new Set())

  async function cancelSpotOrder(
    order: { marketId: string; orderHash: string; cid?: string },
  ): Promise<{ txHash: string } | { error: string }> {
    if (!address.value) return { error: 'Wallet not connected' }

    cancellingIds.value.add(order.orderHash)

    try {
      const sdk = await import('@injectivelabs/sdk-ts')

      const subaccountId = sdk.getDefaultSubaccountId(address.value)

      const msg = sdk.MsgCancelSpotOrder.fromJSON({
        marketId: order.marketId,
        subaccountId,
        injectiveAddress: address.value,
        orderHash: order.orderHash,
      })

      const result = await broadcastMsg(msg)
      if ('error' in result) return result

      loadOpenOrders()
      loadBalances()

      return { txHash: result.txHash }
    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Transaction failed'
      return { error: msg.includes('User rejected') ? 'Rejected by user' : msg }
    } finally {
      cancellingIds.value.delete(order.orderHash)
    }
  }

  // ---- derivatives: subaccount margin balances (indexer) ----
  async function loadSubaccountBalances() {
    if (!address.value) {
      subaccountBalances.value = []
      return
    }
    try {
      const { accountApi } = await getEngine()
      const sdk = await import('@injectivelabs/sdk-ts')
      const subaccountId = sdk.getDefaultSubaccountId(address.value)
      const res = await accountApi.fetchSubaccountBalancesList(subaccountId)
      const reg = tokenRegistry.value
      subaccountBalances.value = (res ?? [])
        .filter((b: any) => b?.deposit?.availableBalance && Number(b.deposit.availableBalance) > 0)
        .map((b: any) => {
          const denom: string = b.denom
          const token = reg[denom]
          return {
            denom,
            symbol: token?.symbol ?? denom,
            amount: b.deposit.availableBalance,
            decimals: token?.decimals ?? 0,
            logo: token?.logo,
            name: token?.name,
          }
        })
    } catch {
      // subaccount balances are best-effort; the deposit UI falls back to bank balance
    }
  }

  // ---- derivatives: deposit margin to subaccount (chain, gRPC-web) ----
  async function depositMargin(
    denom: string,
    humanAmount: number,
  ): Promise<{ txHash: string } | { error: string }> {
    if (!address.value) return { error: 'Wallet not connected' }
    if (!(humanAmount > 0)) return { error: 'Enter an amount' }

    const market = selectedMarket.value
    const quoteDecimals = market?.quoteDecimals ?? 6

    try {
      const sdk = await import('@injectivelabs/sdk-ts')

      const subaccountId = sdk.getDefaultSubaccountId(address.value)
      // Margin is held in quote-denom units: chainAmount = human * 10^quoteDecimals.
      const chainAmount = (humanAmount * 10 ** quoteDecimals).toFixed(0)

      const msg = sdk.MsgDeposit.fromJSON({
        subaccountId,
        injectiveAddress: address.value,
        amount: {
          amount: chainAmount,
          denom,
        },
      })

      const result = await broadcastMsg(msg)
      if ('error' in result) return result

      loadBalances()
      loadSubaccountBalances()

      return { txHash: result.txHash }
    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Transaction failed'
      return { error: msg.includes('User rejected') ? 'Rejected by user' : msg }
    }
  }

  // ---- derivatives: positions (indexer, gRPC-web) ----
  // Normalized to human values. upnl is self-computed because the V2 endpoint
  // does not send with_upnl (returns "0"); we keep the indexer value as fallback.
  const positions = useState<PositionRow[]>('inj-positions', () => [])

  async function loadPositions() {
    if (!address.value) {
      positions.value = []
      return
    }
    try {
      const { derivApi } = await getEngine()
      const sdk = await import('@injectivelabs/sdk-ts')
      const subaccountId = sdk.getDefaultSubaccountId(address.value)
      const res = await derivApi.fetchPositionsV2({ subaccountId })
      const list: any[] = (res as any)?.positions ?? res ?? []

      positions.value = list.map((p: any): PositionRow => {
        const market = markets.value.find((m) => m.marketId === p.marketId)
        const qd = market?.quoteDecimals ?? 6
        const div = 10 ** qd
        const entry = Number(p.entryPrice) / div
        const mark = Number(p.markPrice) / div
        const qty = Number(p.quantity) // perp qty: chain == human
        const margin = Number(p.margin) / div
        const liq = Number(p.liquidationPrice) / div
        const direction = p.direction === 'short' ? 'short' : 'long'
        // Self-computed uPnL (long: (mark-entry)*qty, short: (entry-mark)*qty).
        const indexerUpnl = Number(p.upnl) / div
        const computed = direction === 'long'
          ? (mark - entry) * qty
          : (entry - mark) * qty
        const upnl = Math.abs(indexerUpnl) > 0 ? indexerUpnl : computed
        const upnlPct = margin > 0 ? (upnl / margin) * 100 : 0
        const leverage = margin > 0 && entry > 0 ? (entry * qty) / margin : (market?.initialMarginRatio ? 1 / market.initialMarginRatio : 1)
        return {
          marketId: p.marketId,
          ticker: market?.ticker ?? p.ticker ?? p.marketId.slice(0, 10),
          direction,
          quantity: qty,
          entryPrice: entry,
          markPrice: mark,
          margin,
          liquidationPrice: liq,
          upnl,
          upnlPct,
          leverage,
        }
      })
    } catch {
      // positions are best-effort; keep last good list
    }
  }

  // ---- derivatives: resting derivative orders incl. SL/TP (indexer) ----
  async function loadDerivativeOrders() {
    if (!address.value) return
    try {
      const { derivApi } = await getEngine()
      const sdk = await import('@injectivelabs/sdk-ts')
      const subaccountId = sdk.getDefaultSubaccountId(address.value)
      const res = await derivApi.fetchOrders({ subaccountId })
      const derivOrders: any[] = (res as any)?.orders ?? res ?? []
      // Tag + merge into openOrders so OpenOrders.vue can render both spot & perp.
      const tagged = derivOrders.map((o: any) => ({ ...o, __kind: 'perp' as const }))
      const spot = openOrders.value.filter((o: any) => o.__kind !== 'perp')
      openOrders.value = [...spot, ...tagged]
    } catch {
      // keep last good orders
    }
  }

  // ---- derivatives: close a position via reduce-only opposite order ----
  async function closePosition(
    pos: PositionRow,
  ): Promise<{ txHash: string } | { error: string }> {
    if (!address.value) return { error: 'Wallet not connected' }
    const market = markets.value.find((m) => m.marketId === pos.marketId)
    if (!market || market.kind !== 'perp') return { error: 'Not a perp market' }

    submitting.value = true
    try {
      const sdk = await import('@injectivelabs/sdk-ts')

      const raw = market.raw as any
      const tens = sdk.getDerivativeMarketTensMultiplier({
        quoteDecimals: market.quoteDecimals,
        minPriceTickSize: raw.minPriceTickSize,
        minQuantityTickSize: raw.minQuantityTickSize,
      })

      // Limit price slightly through mark to cross quickly (0.1% buffer).
      const crossPrice = pos.direction === 'long'
        ? pos.markPrice * 0.999
        : pos.markPrice * 1.001
      const chainPrice = sdk.derivativePriceToChainPriceToFixed({
        value: crossPrice,
        tensMultiplier: tens.priceTensMultiplier,
        quoteDecimals: market.quoteDecimals,
      })
      const chainQuantity = sdk.derivativeQuantityToChainQuantityToFixed({
        value: pos.quantity,
        tensMultiplier: tens.quantityTensMultiplier,
      })
      const subaccountId = sdk.getDefaultSubaccountId(address.value)

      const msg = sdk.MsgCreateDerivativeLimitOrder.fromJSON({
        marketId: market.marketId,
        subaccountId,
        injectiveAddress: address.value,
        // Opposite direction; margin 0 = reduce-only (closes the position).
        orderType: (pos.direction === 'long' ? sdk.OrderType.SELL : sdk.OrderType.BUY) as any,
        price: chainPrice,
        margin: '0',
        quantity: chainQuantity,
        feeRecipient: address.value,
      })

      const result = await broadcastMsg(msg)
      if ('error' in result) return result

      loadBalances()
      loadSubaccountBalances()
      loadPositions()

      return { txHash: result.txHash }
    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Transaction failed'
      return { error: msg.includes('User rejected') ? 'Rejected by user' : msg }
    } finally {
      submitting.value = false
    }
  }

  // ---- derivatives: stop-loss / take-profit (conditional reduce-only order) ----
  async function submitDerivativeStopOrder(
    orderSide: 'buy' | 'sell',
    humanTrigger: number,
    humanQuantity: number,
    kind: 'stop' | 'take',
  ): Promise<{ txHash: string } | { error: string }> {
    if (!address.value) return { error: 'Wallet not connected' }
    const market = selectedMarket.value
    if (!market?.marketId || market.kind !== 'perp') return { error: 'No perp market selected' }
    if (!(humanTrigger > 0) || !(humanQuantity > 0)) return { error: 'Invalid trigger or quantity' }

    submitting.value = true
    try {
      const sdk = await import('@injectivelabs/sdk-ts')

      const raw = market.raw as any
      const tens = sdk.getDerivativeMarketTensMultiplier({
        quoteDecimals: market.quoteDecimals,
        minPriceTickSize: raw.minPriceTickSize,
        minQuantityTickSize: raw.minQuantityTickSize,
      })

      const chainTrigger = sdk.derivativePriceToChainPriceToFixed({
        value: humanTrigger,
        tensMultiplier: tens.priceTensMultiplier,
        quoteDecimals: market.quoteDecimals,
      })
      // Trigger order also needs a price (worst-acceptable fill). Use the trigger
      // itself as the limit price for stop, and trigger for take — simple & safe.
      const chainPrice = chainTrigger
      const chainQuantity = sdk.derivativeQuantityToChainQuantityToFixed({
        value: humanQuantity,
        tensMultiplier: tens.quantityTensMultiplier,
      })

      // STOP_* triggers when price crosses *below* (SL); TAKE_* when *above* (TP).
      // Combine with side: closing a long → SELL; closing a short → BUY.
      const orderType = kind === 'stop'
        ? (orderSide === 'sell' ? sdk.OrderType.STOP_SELL : sdk.OrderType.STOP_BUY)
        : (orderSide === 'sell' ? sdk.OrderType.TAKE_SELL : sdk.OrderType.TAKE_BUY)

      const subaccountId = sdk.getDefaultSubaccountId(address.value)

      const msg = sdk.MsgCreateDerivativeLimitOrder.fromJSON({
        marketId: market.marketId,
        subaccountId,
        injectiveAddress: address.value,
        orderType: orderType as any,
        price: chainPrice,
        triggerPrice: chainTrigger,
        margin: '0', // reduce-only: SL/TP only close existing positions
        quantity: chainQuantity,
        feeRecipient: address.value,
      })

      const result = await broadcastMsg(msg)
      if ('error' in result) return result

      loadPositions()
      loadDerivativeOrders()

      return { txHash: result.txHash }
    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Transaction failed'
      return { error: msg.includes('User rejected') ? 'Rejected by user' : msg }
    } finally {
      submitting.value = false
    }
  }

  // ---- derivatives: cancel a derivative order (incl. SL/TP) ----
  async function cancelDerivativeOrder(
    order: { marketId: string; orderHash: string; cid?: string },
  ): Promise<{ txHash: string } | { error: string }> {
    if (!address.value) return { error: 'Wallet not connected' }
    try {
      const sdk = await import('@injectivelabs/sdk-ts')

      const subaccountId = sdk.getDefaultSubaccountId(address.value)
      const msg = sdk.MsgCancelDerivativeOrder.fromJSON({
        marketId: order.marketId,
        subaccountId,
        injectiveAddress: address.value,
        orderHash: order.orderHash,
      })

      const result = await broadcastMsg(msg)
      if ('error' in result) return result

      loadDerivativeOrders()

      return { txHash: result.txHash }
    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Transaction failed'
      return { error: msg.includes('User rejected') ? 'Rejected by user' : msg }
    }
  }

  // Direct access to the indexer APIs for the portfolio composable (trade
  // history across all markets). Returns null if the engine isn't ready yet.
  async function getApi() {
    try {
      const { derivApi, spotApi } = await getEngine()
      return { derivApi, spotApi }
    } catch {
      return null
    }
  }

  return {
    // lifecycle
    init,
    getApi,
    // shared broadcast (also used by useIbc for MsgTransfer)
    broadcastMsg,
    // wallet
    address,
    walletName,
    connecting,
    walletError,
    isConnected,
    isDemo,
    viewAddress,
    demoAddress,
    connect,
    disconnect,
    isTestnet,
    chainId,
    // balances
    balances,
    balancesLoading,
    loadBalances,
    subaccountBalances,
    loadSubaccountBalances,
    // markets
    markets,
    spotMarkets,
    derivMarkets,
    mode,
    switchMode,
    marketsLoading,
    marketsError,
    loadMarkets,
    selectedMarketId,
    selectedMarket,
    selectMarket,
    // orderbook
    orderbookBuys,
    orderbookSells,
    orderbookLoading,
    orderbookUpdatedAt,
    latencyMs,
    lastPollAt,
    connectionState,
    loadOrderbook,
    fillPrice,
    fillAmount,
    // trades / price series
    pricePoints,
    tradesLoading,
    loadTrades,
    recentTrades,
    // historical chart candles
    chartCandles,
    chartCandlesLoading,
    chartCandlesError,
    loadChartCandles,
    marketStats,
    loadMarketStats,
    // order submission
    submitting,
    submitSpotOrder,
    submitDerivativeOrder,
    depositMargin,
    // open orders
    openOrders,
    ordersLoading,
    loadOpenOrders,
    cancellingIds,
    cancelSpotOrder,
    // derivatives: positions + conditional orders
    positions,
    loadPositions,
    loadDerivativeOrders,
    closePosition,
    submitDerivativeStopOrder,
    cancelDerivativeOrder,
  }
}
