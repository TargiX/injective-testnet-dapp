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

// Surface wallet errors as a readable toast (with install link + icon) instead
// of a truncated inline span. The toast auto-dismisses and never gets clipped.
watch(walletError, (err) => {
  if (!err) return
  const notDetected = /Keplr not detected/i.test(err)
  toast.add({
    title: notDetected ? 'Keplr not found' : 'Wallet error',
    description: notDetected
      ? 'Install the Keplr extension, then refresh and try again.'
      : err,
    color: 'error',
    icon: notDetected ? 'i-lucide-puzzle' : 'i-lucide-triangle-alert',
    timeout: 8000,
    actions: notDetected
      ? [{ label: 'Get Keplr', to: 'https://www.keplr.app/', target: '_blank', icon: 'i-lucide-external-link' }]
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
