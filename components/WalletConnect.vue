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
  } catch {
    /* clipboard unavailable */
  }
}
</script>

<template>
  <div class="wallet">
    <template v-if="!isConnected">
      <button
        class="btn btn-primary"
        :disabled="connecting"
        @click="connect('keplr')"
      >
        {{ connecting ? 'Connecting…' : 'Connect Keplr' }}
      </button>
      <button
        class="btn"
        :disabled="connecting"
        @click="connect('leap')"
      >
        Leap
      </button>
    </template>

    <template v-else>
      <button class="addr num" :title="address" @click="copyAddress">
        <span class="addr-wallet">{{ walletName }}</span>
        <span>{{ shortAddress(address) }}</span>
        <span class="addr-copy">{{ copied ? '✓' : '⧉' }}</span>
      </button>
      <button class="btn btn-ghost" @click="disconnect">Disconnect</button>
    </template>

    <span v-if="walletError" class="err wallet-err">{{ walletError }}</span>
  </div>
</template>

<style scoped>
.wallet {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.addr {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.addr:hover {
  border-color: var(--accent-dim);
}
.addr-wallet {
  text-transform: capitalize;
  color: var(--accent);
  font-weight: 600;
  font-family: var(--sans);
}
.addr-copy {
  color: var(--text-dim);
}
.wallet-err {
  flex-basis: 100%;
}
</style>
