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

const copied = ref(false)
async function copyAddress() {
  try {
    await navigator.clipboard.writeText(address.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch { /* */ }
}
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

    <span v-if="walletError" class="text-ask text-xs max-w-[200px] truncate">{{ walletError }}</span>
  </div>
</template>
