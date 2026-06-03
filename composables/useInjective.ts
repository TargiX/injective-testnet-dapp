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

export interface Endpoints {
  grpc: string
  indexer: string
}

// The Injective SDK is large and node-oriented, so we never pull it into the
// SSR/server bundle. Everything is loaded lazily via dynamic import the first
// time a chain/wallet call runs — which is always client-side (onMounted or a
// click handler).
interface Engine {
  endpoints: Endpoints
  bankApi: any
  spotApi: any
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
  ] = await Promise.all([
    import('@injectivelabs/sdk-ts'),
    import('@injectivelabs/networks'),
    import('@injectivelabs/ts-types'),
    import('@injectivelabs/wallet-base'),
    import('@injectivelabs/wallet-core'),
    import('@injectivelabs/wallet-cosmos'),
  ])

  const endpoints = networks.getNetworkEndpoints(networks.Network.Testnet)
  const { Wallet } = walletBase
  const { ChainId } = tsTypes

  // ChainGrpcBankApi (chain) and IndexerGrpcSpotApi (indexer) both talk gRPC-web.
  const bankApi = new sdk.ChainGrpcBankApi(endpoints.grpc)
  const spotApi = new sdk.IndexerGrpcSpotApi(endpoints.indexer)

  const walletStrategy = new walletCore.BaseWalletStrategy({
    chainId: ChainId.Testnet,
    strategies: {
      [Wallet.Keplr]: new walletCosmos.CosmosWalletStrategy({
        chainId: ChainId.Testnet,
        wallet: Wallet.Keplr,
      }),
      [Wallet.Leap]: new walletCosmos.CosmosWalletStrategy({
        chainId: ChainId.Testnet,
        wallet: Wallet.Leap,
      }),
    },
  })

  return {
    endpoints: { grpc: endpoints.grpc, indexer: endpoints.indexer },
    bankApi,
    spotApi,
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

  // recent trades → price series for the price chart
  const pricePoints = useState<PricePoint[]>('inj-price-points', () => [])
  const tradesLoading = useState<boolean>('inj-trades-loading', () => false)

  const endpoints = useState<Endpoints>('inj-endpoints', () => ({
    grpc: '',
    indexer: '',
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
  async function connect(walletId: WalletId) {
    connecting.value = true
    walletError.value = ''
    try {
      const { walletStrategy, Wallet } = await getEngine()
      const target = walletId === 'leap' ? Wallet.Leap : Wallet.Keplr
      await walletStrategy.setWallet(target)
      const addresses = await walletStrategy.enableAndGetAddresses()
      // For Cosmos wallets this is already an inj... bech32 address.
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
        // Default to a market with a dense, balanced testnet book so the depth
        // chart and order book look alive out of the box. INJ/USDT is one click
        // away in the list.
        const prefer = ['TIA/USDT', 'INJ/USDT']
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
    // trades / price series
    pricePoints,
    tradesLoading,
    loadTrades,
    // meta
    endpoints,
    tokenRegistry,
  }
}
