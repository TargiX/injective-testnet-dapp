/**
 * IBC bridge composable — outbound cross-chain transfers from Injective to
 * Osmosis / Cosmos Hub over hardcoded mainnet channels.
 *
 * Our wallet signs on Injective, so every transfer originates here and we only
 * ever need the INJECTIVE-SIDE source channel. Channel/port IDs are constants
 * (no runtime IBC client query) — this is exactly how Injective Portal and
 * mintscan model it. Authoritative source for the Osmosis pair is the cosmos
 * chain-registry `_IBC/injective-osmosis.json` (channel-8 ↔ channel-122).
 *
 * MsgTransfer timeout note: `sdk.MsgTransfer.fromJSON({ timeout })` passes the
 * value straight to `BigInt()` with NO unit conversion (verified in SDK source),
 * so `timeout` must already be in **nanoseconds**. See buildTimeout().
 */
import { useInjective } from '~/composables/useInjective'

export type IbcRouteKey = 'osmosis' | 'cosmoshub'

export interface IbcRoute {
  key: IbcRouteKey
  label: string // 'Osmosis'
  chainId: string // destination chain id
  bech32Prefix: string // 'osmo' | 'cosmos'
  /** Injective-side source channel (our wallet signs on Injective). */
  channelId: string
  port: string // always 'transfer'
  explorerTx: string // %s = tx hash
}

export interface RecentTransfer {
  id: string
  routeKey: IbcRouteKey
  routeLabel: string
  denom: string
  symbol: string
  amount: string // human-readable, for display only
  txHash: string
  at: number // unix millis
}

/** Hardcoded mainnet IBC channels (Injective side). Port is always 'transfer'. */
export const IBC_ROUTES: Record<IbcRouteKey, IbcRoute> = {
  osmosis: {
    key: 'osmosis',
    label: 'Osmosis',
    chainId: 'osmosis-1',
    bech32Prefix: 'osmo',
    // Injective↔Osmosis: injective channel-8 ↔ osmosis channel-122 (chain-registry).
    channelId: 'channel-8',
    port: 'transfer',
    explorerTx: 'https://www.mintscan.io/osmosis/tx/%s',
  },
  cosmoshub: {
    key: 'cosmoshub',
    label: 'Cosmos Hub',
    chainId: 'cosmoshub-4',
    bech32Prefix: 'cosmos',
    // Injective↔Cosmos Hub: injective channel-93 (Polkachu / chain-registry).
    channelId: 'channel-93',
    port: 'transfer',
    explorerTx: 'https://www.mintscan.io/cosmos/tx/%s',
  },
}

export const IBC_ROUTE_LIST = Object.values(IBC_ROUTES)

/** Standard IBC transfer window — relayers must relay within this. */
export const IBC_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Build an IBC timeout timestamp. MsgTransfer takes ABSOLUTE nanoseconds since
 * unix epoch (the SDK's fromJSON does `BigInt(params.timeout)` — no conversion).
 * Default window: 10 minutes from `fromMs`.
 */
export function buildTimeout(fromMs: number = Date.now()): number {
  return (fromMs + IBC_TIMEOUT_MS) * 1_000_000
}

/**
 * Convert an Injective bech32 address to the destination chain's prefix.
 * Keplr/Leap derive the same account across Cosmos chains, so an inj address
 * maps directly to the osmo/cosmos equivalent. Returns { ok: false } on a bad
 * address rather than throwing (the UI surfaces a validation message).
 *
 * `sdkAddress` is the injected Address class; production passes it via dynamic
 * import, tests pass a real/stubbed implementation directly.
 */
export function convertAddressWith(
  injAddress: string,
  prefix: string,
  sdkAddress: { fromBech32: (b: string, p?: string) => { toBech32: (p?: string) => string } },
): { ok: true; address: string } | { ok: false; error: string } {
  if (!injAddress) return { ok: false, error: 'No address' }
  try {
    const converted = sdkAddress.fromBech32(injAddress).toBech32(prefix)
    if (!converted.startsWith(prefix)) {
      return { ok: false, error: 'Conversion produced an unexpected prefix' }
    }
    return { ok: true, address: converted }
  } catch {
    return { ok: false, error: 'Invalid address' }
  }
}

/**
 * Async address conversion used by the UI. Dynamically imports sdk-ts (keeps it
 * out of the SSR bundle). Tests use convertAddressWith directly with the real
 * (or stubbed) Address class.
 */
export async function convertAddress(
  injAddress: string,
  prefix: string,
): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
  const sdk = await import('@injectivelabs/sdk-ts')
  return convertAddressWith(injAddress, prefix, sdk.Address)
}

/** Scale a human amount to chain units. Pure — unit-tested directly. */
export function toChainAmount(humanAmount: number, decimals: number): string {
  if (!(humanAmount > 0) || !(decimals >= 0)) return '0'
  return (humanAmount * 10 ** decimals).toFixed(0)
}

/**
 * Params for buildTransferMsg, extracted so tests can assert the message shape
 * without a running engine.
 */
export interface BuildTransferArgs {
  route: IbcRoute
  denom: string
  chainAmount: string
  sender: string
  receiver: string
  timeout: number
  fromMs?: number
}

export function useIbc() {
  const {
    address,
    balances,
    tokenRegistry,
    isTestnet,
    loadBalances,
    broadcastMsg,
  } = useInjective()

  const submitting = useState<boolean>('ibc-submitting', () => false)
  const transferError = useState<string>('ibc-error', () => '')
  const recentTransfers = useState<RecentTransfer[]>('ibc-recent', () => [])

  /**
   * Balances the user can actually bridge. We surface native inj + any IBC
   * denoms (ibc/...) they hold; arbitrary CW20/ERC20 tokens have no IBC path
   * from Injective and would just confuse the picker.
   */
  const transferableBalances = computed(() =>
    balances.value
      .filter((b) => b.denom === 'inj' || b.denom.startsWith('ibc/'))
      .map((b) => ({
        ...b,
        symbol: b.symbol || (b.denom === 'inj' ? 'INJ' : b.denom.slice(0, 12)),
      })),
  )

  /** Resolve the destination-chain recipient, honoring an explicit override. */
  async function resolveRecipient(
    route: IbcRoute,
    override?: string,
  ): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
    if (override && override.trim()) {
      const trimmed = override.trim()
      if (!trimmed.startsWith(route.bech32Prefix)) {
        return {
          ok: false,
          error: `Recipient must start with "${route.bech32Prefix}" on ${route.label}`,
        }
      }
      return { ok: true, address: trimmed }
    }
    if (!address.value) return { ok: false, error: 'Wallet not connected' }
    return convertAddress(address.value, route.bech32Prefix)
  }

  /**
   * Submit an outbound IBC transfer. Builds MsgTransfer and signs it through
   * useInjective's broadcastMsg (same MsgBroadcaster path as spot/perp orders).
   */
  async function submitIbcTransfer(params: {
    routeKey: IbcRouteKey
    denom: string
    humanAmount: number
    recipientOverride?: string
    decimals?: number
    symbol?: string
  }): Promise<{ txHash: string } | { error: string }> {
    if (!address.value) return { error: 'Wallet not connected' }
    if (isTestnet.value) {
      return { error: 'IBC bridge is mainnet-only (testnet channels differ)' }
    }
    const route = IBC_ROUTES[params.routeKey]
    if (!route) return { error: 'Unknown route' }
    if (!(params.humanAmount > 0)) return { error: 'Enter an amount' }

    const recipient = await resolveRecipient(route, params.recipientOverride)
    if (!recipient.ok) return { error: recipient.error }

    // Resolve decimals for chain scaling. Prefer the caller's hint (from the
    // balance row), else fall back to the token registry, else INJ default.
    const reg = tokenRegistry.value
    const decimals = params.decimals ?? reg[params.denom]?.decimals ?? 18
    const symbol = params.symbol ?? reg[params.denom]?.symbol ?? params.denom
    const chainAmount = toChainAmount(params.humanAmount, decimals)
    const timeout = buildTimeout()

    submitting.value = true
    transferError.value = ''
    try {
      const sdk = await import('@injectivelabs/sdk-ts')
      const msg = sdk.MsgTransfer.fromJSON({
        amount: {
          denom: params.denom,
          amount: chainAmount,
        },
        sender: address.value,
        receiver: recipient.address,
        port: route.port,
        channelId: route.channelId,
        timeout,
      })

      const result = await broadcastMsg(msg)
      if ('error' in result) return result

      // Record for the activity panel (newest first).
      recentTransfers.value = [
        {
          id: result.txHash,
          routeKey: route.key,
          routeLabel: route.label,
          denom: params.denom,
          symbol,
          amount: params.humanAmount.toString(),
          txHash: result.txHash,
          at: Date.now(),
        },
        ...recentTransfers.value,
      ].slice(0, 20)

      loadBalances()

      return { txHash: result.txHash }
    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Transaction failed'
      return { error: msg.includes('User rejected') ? 'Rejected by user' : msg }
    } finally {
      submitting.value = false
    }
  }

  return {
    // routes
    IBC_ROUTES,
    IBC_ROUTE_LIST,
    // state
    submitting,
    transferError,
    recentTransfers,
    transferableBalances,
    // actions
    submitIbcTransfer,
    resolveRecipient,
  }
}
