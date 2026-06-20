<script setup lang="ts">
import { shortAddress } from '~/utils/inj-format'

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
    setTimeout(() => (copied = false), 1200)
  } catch { /* */ }
}

// Surface wallet errors as a readable toast (with install links + icon) instead
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
        @click="connect('cosmostation')"
      >
        {{ connecting ? 'Connecting…' : 'Connect Cosmostation' }}
      </UButton>
      <UButton
        variant="outline"
        :disabled="connecting"
        @click="connect('keplr')"
      >
        Keplr
      </UButton>
    </template>

    <template v-else>
      <UButton
        variant="outline"
        :title="address"
        @click="copyAddress"
      >
        <span class="capitalize text-accent font-semibold">{{ walletName }}</span>
        <span class="font-mono tabular-nums">{{ shortAddress(address) }}</span>
        <UIcon
          :name="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          class="size-3.5 text-[var(--ui-text-dimmed)]"
          :class="copied ? 'text-bid' : ''"
        />
      </UButton>
      <UButton variant="ghost" @click="disconnect">
        Disconnect
      </UButton>
    </template>
  </div>
</template>
