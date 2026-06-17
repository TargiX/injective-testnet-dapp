<script setup lang="ts">
const { connectionState, latencyMs } = useInjective()

const STALE_LATENCY = 4000 // ms — anything slower than ~1 poll cycle is "slow"

const dotColor = computed(() => {
  switch (connectionState.value) {
    case 'live':
      return latencyMs.value > STALE_LATENCY ? 'bg-yellow-400' : 'bg-bid'
    case 'stale':
      return 'bg-yellow-400'
    case 'offline':
      return 'bg-ask'
    default: // connecting
      return 'bg-yellow-400'
  }
})

const glow = computed(() =>
  dotColor.value === 'bg-bid' ? 'shadow-glow-bid' : 'shadow-none',
)

const label = computed(() => {
  switch (connectionState.value) {
    case 'live':
      return latencyMs.value > STALE_LATENCY ? `${latencyMs.value}ms slow` : `${latencyMs.value}ms`
    case 'stale':
      return 'stale'
    case 'offline':
      return 'offline'
    default:
      return 'connecting'
  }
})

const pulse = computed(() => connectionState.value === 'connecting')
</script>

<template>
  <div
    class="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[var(--ui-text-muted)]"
    :title="`Latency ${latencyMs}ms · ${connectionState}`"
  >
    <span class="relative flex">
      <span
        v-if="pulse"
        class="absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-60 animate-ping"
      />
      <span
        class="relative inline-block w-1.5 h-1.5 rounded-full transition-colors"
        :class="[dotColor, glow]"
      />
    </span>
    <span>{{ label }}</span>
  </div>
</template>
