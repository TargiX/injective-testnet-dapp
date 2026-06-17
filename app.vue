<script setup lang="ts">
// Register the service worker for installable/offline-shell support.
// Production-only: skip in dev to avoid caching stale assets while hacking.
onMounted(() => {
  if (
    import.meta.env.PROD &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator
  ) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silent: SW failure must never break the trading UI.
    })
  }
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
