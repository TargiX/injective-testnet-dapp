/**
 * On-chain values on Injective are integers scaled by a token's decimals.
 * The indexer returns spot order-book prices/quantities in "chain units":
 *
 *   humanPrice    = chainPrice    * 10^(baseDecimals - quoteDecimals)
 *   humanQuantity = chainQuantity / 10^baseDecimals
 *
 * e.g. INJ/USDT (base 18, quote 6): chainPrice 0.0000000000199 -> 19.90 USDT
 *      chainQty 982000000000000000000 -> 982 INJ
 */

export function toHumanPrice(
  chainPrice: string | number,
  baseDecimals: number,
  quoteDecimals: number,
): number {
  return Number(chainPrice) * 10 ** (baseDecimals - quoteDecimals)
}

export function toHumanQuantity(
  chainQuantity: string | number,
  baseDecimals: number,
): number {
  return Number(chainQuantity) / 10 ** baseDecimals
}

/** Scale a raw bank balance (min units) down by its token decimals. */
export function toHumanAmount(amount: string | number, decimals: number): number {
  return Number(amount) / 10 ** decimals
}

/** Compact, aligned number formatting for a data-dense trading UI. */
export function fmt(value: number, maxFractionDigits = 4): string {
  if (!isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  })
}

export function fmtPrice(value: number): string {
  if (!isFinite(value)) return '—'
  // More precision for sub-dollar prices, fewer digits for large ones.
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : 6
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Classify a denom into a short, human label instead of showing the raw hash. */
export function denomKind(denom: string): string {
  if (denom === 'inj') return 'Native'
  if (denom.startsWith('peggy')) return 'Peggy'
  if (denom.startsWith('factory/')) return 'Factory'
  if (denom.startsWith('ibc/')) return 'IBC'
  if (denom.startsWith('share')) return 'Share'
  return 'Token'
}

/**
 * Some testnet tokens have a "name" that is really a denom path
 * (factory/inj1.../foo) or an address. Only surface genuinely human names.
 */
export function cleanName(name?: string): string {
  if (!name) return ''
  const n = name.trim()
  if (!n) return ''
  if (n.includes('/')) return ''
  if (/^(inj1|0x|peggy|ibc)/i.test(n)) return ''
  if (n.length > 24) return ''
  return n
}

/** inj1qy... / inj1... — shorten a bech32 address for display. */
export function shortAddress(addr: string, head = 10, tail = 6): string {
  if (!addr) return ''
  if (addr.length <= head + tail) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}
