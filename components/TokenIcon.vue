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

const bg = computed(() => {
  const s = props.symbol || ''
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return `hsl(${h} 55% 32%)`
})
</script>

<template>
  <span
    class="inline-flex flex-none rounded-full overflow-hidden border border-border-soft"
    :style="{ width: size + 'px', height: size + 'px' }"
    :title="symbol"
  >
    <img
      v-if="showImg"
      :src="logo"
      :alt="symbol"
      loading="lazy"
      class="w-full h-full object-cover"
      @error="failed = true"
    />
    <span
      v-else
      class="w-full h-full flex items-center justify-center text-white font-bold tracking-tighter"
      :style="{ background: bg, fontSize: Math.max(8, size * 0.4) + 'px' }"
    >
      {{ initials.slice(0, 2) }}
    </span>
  </span>
</template>
