import type { SpotMarket } from '@injectivelabs/sdk-ts'

export type WalletId = 'keplr' | 'leap'

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
  chartApi: any
  walletStrategy: any
  Wallet: any
}

let enginePromise: Promise<Engine> | null = null

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

  const endpoints = networks.getNetworkEndpoints(networks.Network.Mainnet)
  const chartEndpoint =
    endpoints.chart && endpoints.chart !== endpoints.indexer
      ? endpoints.chart
      : 'https://k8s.mainnet.chart.grpc-web.injective.network'
  const { Wallet } = walletBase
  const { ChainId } = tsTypes

  // Chain, exchange indexer, and chart history are separate gRPC-web services.
  const bankApi = new sdk.ChainGrpcBankApi(endpoints.grpc)
  const spotApi = new sdk.IndexerGrpcSpotApi(endpoints.indexer)
  const chartApi = new indexerProto.InjectiveChartRPCClient(
    new grpcWeb.GrpcWebFetchTransport({
      baseUrl: chartEndpoint,
      format: 'binary',
    }),
  )

  const walletStrategy = new walletCore.BaseWalletStrategy({
    chainId: ChainId.Mainnet,
    strategies: {
      [Wallet.Keplr]: new walletCosmos.CosmosWalletStrategy({
        chainId: ChainId.Mainnet,
        wallet: Wallet.Keplr,
      }),
      [Wallet.Leap]: new walletCosmos.CosmosWalletStrategy({
        chainId: ChainId.Mainnet,
        wallet: Wallet.Leap,
      }),
    },
  })

  return {
    endpoints: { grpc: endpoints.grpc, indexer: endpoints.indexer, chart: chartEndpoint },
    bankApi,
    spotApi,
    chartApi,
    walletStrategy,
    Wallet,
  }
}

function getEngine(): Promise<Engine> {
  return (enginePromise ??= createEngine())
}

export function useInjective() {
  const address = useState<string>('inj-address', () => '')
  const walletName = useState<string>('inj-wallet', () => '')
  const connecting = useState<boolean>('inj-connecting', () => false)
  const walletError = useState<string>('inj-wallet-error', () => '')

  const balances = useState<BalanceRow[]>('inj-balances', () => [])
  const balancesLoading = useState<boolean>('inj-balances-loading', () => false)

  const markets = useState<SpotMarket[]>('inj-markets', () => [])
  const marketsLoading = useState<boolean>('inj-markets-loading', () => false)
  const marketsError = useState<string>('inj-markets-error', () => '')

  const selectedMarketId = useState<string>('inj-selected-market', () => '')
  const orderbookBuys = useState<OrderbookLevel[]>('inj-ob-buys', () => [])
  const orderbookSells = useState<OrderbookLevel[]>('inj-ob-sells', () => [])
  const orderbookLoading = useState<boolean>('inj-ob-loading', () => false)
  const orderbookUpdatedAt = useState<number>('inj-ob-updated', () => 0)

  // Recent trades are live market activity. Historical OHLCV chart data is
  // loaded separately through InjectiveChartRPC below.
  const pricePoints = useState<PricePoint[]>('inj-price-points', () => [])
  const tradesLoading = useState<boolean>('inj-trades-loading', () => false)
  const chartCandles = useState<PriceCandle[]>('inj-chart-candles', () => [])
  const chartCandlesLoading = useState<boolean>('inj-chart-candles-loading', () => false)
  const chartCandlesError = useState<string>('inj-chart-candles-error', () => '')

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
  const demoAddress = useRuntimeConfig().public.demoAddress as string

  const isConnected = computed(() => !!address.value)
  // Whose balances we display: the connected wallet, or the demo address.
  const viewAddress = computed(() => address.value || demoAddress)
  const isDemo = computed(() => !address.value)

  const selectedMarket = computed(() =>
    markets.value.find((m) => m.marketId === selectedMarketId.value),
  )

  function registerMarketTokens(list: SpotMarket[]) {
    const reg = { ...tokenRegistry.value }
    for (const m of list) {
      if (m.baseToken && m.baseDenom) {
        reg[m.baseDenom] = {
          denom: m.baseDenom,
          symbol: m.baseToken.symbol,
          decimals: m.baseToken.decimals,
          logo: (m.baseToken as any).logo,
          name: (m.baseToken as any).name,
        }
      }
      if (m.quoteToken && m.quoteDenom) {
        reg[m.quoteDenom] = {
          denom: m.quoteDenom,
          symbol: m.quoteToken.symbol,
          decimals: m.quoteToken.decimals,
          logo: (m.quoteToken as any).logo,
          name: (m.quoteToken as any).name,
        }
      }
    }
    tokenRegistry.value = reg
  }

  async function init() {
    const engine = await getEngine()
    endpoints.value = engine.endpoints
  }

  // ---- wallet ----
  async function suggestKeplrChain() {
    const keplr = (window as any).keplr
    if (!keplr) return

    const rpcUrl = endpoints.value.grpc || 'https://sentry.tm.injective.network:443'
    const restUrl = endpoints.value.grpc || 'https://sentry.lcd.injective.network:443'

    try {
      await keplr.experimentalSuggestChain({
        chainId: 'injective-1',
        chainName: 'Injective',
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
      const { walletStrategy, Wallet } = await getEngine()
      const target = walletId === 'leap' ? Wallet.Leap : Wallet.Keplr
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
        }
      })
    } catch (e: any) {
      walletError.value = e?.message || 'Failed to fetch balances'
    } finally {
      balancesLoading.value = false
    }
  }

  // ---- spot markets (indexer, gRPC-web) ----
  async function loadMarkets() {
    marketsLoading.value = true
    marketsError.value = ''
    try {
      const { spotApi } = await getEngine()
      const res: SpotMarket[] = await spotApi.fetchMarkets()
      const active = res
        .filter((m) => m.baseToken && m.quoteToken)
        .sort((a, b) => a.ticker.localeCompare(b.ticker))
      markets.value = active
      registerMarketTokens(active)
      if (!selectedMarketId.value) {
        // Start on the flagship Injective spot market and fall back only if it
        // is unavailable on the current endpoint.
        const prefer = ['INJ/USDT', 'INJ/USDC', 'TIA/USDT']
        const pick =
          prefer
            .map((t) => active.find((m) => m.ticker === t))
            .find(Boolean) ?? active[0]
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
    chartCandles.value = []
    chartCandlesError.value = ''
    selectedMarketId.value = marketId
  }

  // ---- order book (indexer, gRPC-web) ----
  async function loadOrderbook() {
    const marketId = selectedMarketId.value
    if (!marketId) return
    orderbookLoading.value = true
    try {
      const { spotApi } = await getEngine()
      const ob = await spotApi.fetchOrderbookV2(marketId)
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
  async function loadTrades() {
    const market = selectedMarket.value
    if (!market || !market.baseToken || !market.quoteToken) return
    tradesLoading.value = true
    try {
      const { spotApi } = await getEngine()
      const res = await spotApi.fetchTrades({ marketId: market.marketId })
      const list: any[] = res.trades ?? res ?? []
      const bd = market.baseToken.decimals
      const qd = market.quoteToken.decimals
      const points = list
        .map((t) => ({
          t: Number(t.executedAt),
          p: Number(t.price) * 10 ** (bd - qd),
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
      const res = await chartApi.spotMarketHistory({
        symbol: '',
        marketId: market.marketId,
        resolution,
        from: 0,
        to,
        countback,
        fillGaps: false,
      }).response

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
      const [{ walletStrategy }, sdk, networks, walletCore] = await Promise.all([
        getEngine(),
        import('@injectivelabs/sdk-ts'),
        import('@injectivelabs/networks'),
        import('@injectivelabs/wallet-core'),
      ])

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

      const endpoints = networks.getNetworkEndpoints(networks.Network.Mainnet)

      const broadcaster = new walletCore.MsgBroadcaster({
        network: networks.Network.Mainnet,
        endpoints,
        walletStrategy,
      })

      const response = await broadcaster.broadcast({
        msgs: msg,
        injectiveAddress: address.value,
      })

      loadBalances()
      loadOrderbook()

      return { txHash: response.txHash }
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
      const [{ walletStrategy }, sdk, networks, walletCore] = await Promise.all([
        getEngine(),
        import('@injectivelabs/sdk-ts'),
        import('@injectivelabs/networks'),
        import('@injectivelabs/wallet-core'),
      ])

      const subaccountId = sdk.getDefaultSubaccountId(address.value)

      const msg = sdk.MsgCancelSpotOrder.fromJSON({
        marketId: order.marketId,
        subaccountId,
        injectiveAddress: address.value,
        orderHash: order.orderHash,
      })

      const endpoints = networks.getNetworkEndpoints(networks.Network.Mainnet)

      const broadcaster = new walletCore.MsgBroadcaster({
        network: networks.Network.Mainnet,
        endpoints,
        walletStrategy,
      })

      const response = await broadcaster.broadcast({
        msgs: msg,
        injectiveAddress: address.value,
      })

      loadOpenOrders()
      loadBalances()

      return { txHash: response.txHash }
    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Transaction failed'
      return { error: msg.includes('User rejected') ? 'Rejected by user' : msg }
    } finally {
      cancellingIds.value.delete(order.orderHash)
    }
  }

  return {
    // lifecycle
    init,
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
    // balances
    balances,
    balancesLoading,
    loadBalances,
    // markets
    markets,
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
    loadOrderbook,
    fillPrice,
    fillAmount,
    // trades / price series
    pricePoints,
    tradesLoading,
    loadTrades,
    // historical chart candles
    chartCandles,
    chartCandlesLoading,
    chartCandlesError,
    loadChartCandles,
    // order submission
    submitting,
    submitSpotOrder,
    // open orders
    openOrders,
    ordersLoading,
    loadOpenOrders,
    cancellingIds,
    cancelSpotOrder,
  }
}
