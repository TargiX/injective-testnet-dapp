<script setup lang="ts">
const props = withDefaults(
  defineProps<{ logo?: string; symbol?: string; size?: number }>(),
  { size: 22 },
)

const failed = ref(false)
watch(
  () => props.logo,
  () => (failed.value = false),
)

const showImg = computed(() => !!props.logo && !failed.value)

const initials = computed(() => (props.symbol || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?')

// Deterministic pleasant color from the symbol.
const bg = computed(() => {
  const s = props.symbol || ''
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return `hsl(${h} 55% 32%)`
})
</script>

<template>
  <span
    class="tok"
    :style="{ width: size + 'px', height: size + 'px' }"
    :title="symbol"
  >
    <img
      v-if="showImg"
      :src="logo"
      :alt="symbol"
      loading="lazy"
      @error="failed = true"
    />
    <span
      v-else
      class="mono"
      :style="{ background: bg, fontSize: Math.max(8, size * 0.4) + 'px' }"
    >
      {{ initials.slice(0, 2) }}
    </span>
  </span>
</template>

<style scoped>
.tok {
  display: inline-flex;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg-elev-2);
  border: 1px solid var(--border-soft);
}
.tok img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mono {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  letter-spacing: -0.02em;
}
</style>
