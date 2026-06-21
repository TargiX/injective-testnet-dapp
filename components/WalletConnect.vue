<script setup lang="ts">
import { shortAddress } from '~/utils/inj-format'
import type { DropdownMenuItem } from '@nuxt/ui'

const {
  address,
  walletName,
  connecting,
  walletError,
  isConnected,
  connect,
  disconnect,
} = useInjective()

const toast = useToast()

const copied = ref(false)
async function copyAddress() {
  try {
    await navigator.clipboard.writeText(address.value)
    copied.value = true
    toast.add({ title: 'Address copied', color: 'success', icon: 'i-lucide-check', timeout: 1500 })
    setTimeout(() => (copied.value = false), 1500)
  } catch { /* */ }
}

// Wallet "logo": deterministic color from the wallet name + first letter, in a
// TokenIcon-style circle. No brand-icon dependency needed (Keplr/Cosmostation
// aren't in simple-icons anyway), and it stays consistent with the app's look.
const walletInitial = computed(() => (walletName.value || 'W').charAt(0).toUpperCase())
const walletColor = computed(() => {
  const name = walletName.value || ''
  // Cheap deterministic hue from the name; 55% saturation / 45% lightness reads
  // well on dark and matches TokenIcon's style.
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `hsl(${h} 55% 45%)`
})

// Dropdown items for the connected state.
const menuItems = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Copy address', icon: 'i-lucide-copy', onSelect: () => copyAddress() },
    {
      label: 'View on Explorer',
      icon: 'i-lucide-external-link',
      to: `https://www.mintscan.io/injective/address/${address.value}`,
      target: '_blank',
    },
  ],
  [{ label: 'Disconnect', icon: 'i-lucide-log-out', color: 'error', onSelect: () => disconnect() }],
])

// Surface wallet errors as a readable toast (with install link + icon) instead
// of a truncated inline span. The toast auto-dismisses and never gets clipped.
const WALLET_LINKS = {
  keplr: { name: 'Keplr', url: 'https://www.keplr.app/' },
  cosmostation: { name: 'Cosmostation', url: 'https://cosmostation.io/' },
} as const

watch(walletError, (err) => {
  if (!err) return
  // Match "Cosmostation not detected" / "Keplr not detected" → helpful install hint.
  const detected = err.match(/(Cosmostation|Keplr) not detected/i)
  const key = detected?.[1]?.toLowerCase() as keyof typeof WALLET_LINKS | undefined
  const info = key ? WALLET_LINKS[key] : null
  toast.add({
    title: info ? `${info.name} not found` : 'Wallet error',
    description: info
      ? `Install the ${info.name} extension, then refresh and try again.`
      : err,
    color: 'error',
    icon: info ? 'i-lucide-puzzle' : 'i-lucide-triangle-alert',
    timeout: 8000,
    actions: info
      ? [{ label: `Get ${info.name}`, to: info.url, target: '_blank', icon: 'i-lucide-external-link' }]
      : undefined,
  })
})
</script>

<template>
  <div class="flex items-center gap-2 flex-wrap">
    <template v-if="!isConnected">
      <UButton
        :loading="connecting"
        icon="i-lucide-wallet"
        @click="connect('keplr')"
      >
        {{ connecting ? 'Connecting…' : 'Connect Keplr' }}
      </UButton>
      <UButton
        variant="outline"
        :disabled="connecting"
        @click="connect('cosmostation')"
      >
        Cosmostation
      </UButton>
    </template>

    <!-- Connected: wallet logo circle + address as a dropdown trigger -->
    <UDropdownMenu
      v-else
      :items="menuItems"
      :content="{ align: 'end' }"
      :ui="{ content: 'w-52' }"
    >
      <button
        class="flex items-center gap-2 rounded-md bg-surface-2 hover:bg-surface-3 ring-1 ring-[var(--ui-border)] pl-1.5 pr-2 py-1 transition-colors cursor-pointer"
      >
        <span
          class="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-white flex-none"
          :style="{ background: walletColor }"
        >
          {{ walletInitial }}
        </span>
        <span class="flex flex-col items-start leading-tight">
          <span class="text-[9px] text-[var(--ui-text-dimmed)] uppercase tracking-wider capitalize">{{ walletName }}</span>
          <span class="text-[11px] font-mono tabular-nums">{{ shortAddress(address) }}</span>
        </span>
        <UIcon name="i-lucide-chevron-down" class="size-3.5 text-[var(--ui-text-dimmed)] flex-none" />
      </button>
    </UDropdownMenu>
  </div>
</template>
