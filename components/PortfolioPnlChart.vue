<script setup lang="ts">
import { fmt } from '~/utils/inj-format'

const props = defineProps<{
  series: { time: number; value: number }[]
  unrealized: number
}>()

const chartContainer = ref<HTMLElement | null>(null)
let chartInstance: any = null
let areaSeries: any = null
let resizeObserver: ResizeObserver | null = null
let lw: any = null

async function initChart() {
  if (chartInstance) return
  const el = chartContainer.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  if (rect.width < 10 || rect.height < 10) {
    setTimeout(initChart, 100)
    return
  }

  if (!lw) lw = await import('lightweight-charts')

  chartInstance = lw.createChart(el, {
    width: rect.width,
    height: rect.height,
    layout: {
      background: { type: lw.ColorType.Solid, color: 'transparent' },
      textColor: '#5b677a',
      fontFamily: "'SF Mono','JetBrains Mono',ui-monospace,Menlo,monospace",
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.03)' },
      horzLines: { color: 'rgba(255,255,255,0.03)' },
    },
    rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.08)',
      timeVisible: true,
      secondsVisible: false,
    },
    crosshair: { mode: lw.CrosshairMode.Normal },
    handleScale: true,
    handleScroll: true,
  })

  areaSeries = chartInstance.addAreaSeries({
    lineColor: '#4ade80',
    topColor: 'rgba(74,222,128,0.25)',
    bottomColor: 'rgba(74,222,128,0.02)',
    lineWidth: 2,
    priceLineVisible: false,
  })

  resizeObserver = new ResizeObserver(() => {
    if (!chartInstance || !el) return
    const r = el.getBoundingClientRect()
    chartInstance.applyOptions({ width: r.width, height: r.height })
  })
  resizeObserver.observe(el)

  renderData()
}

function renderData() {
  if (!areaSeries) return
  const data = props.series.map(p => ({ time: p.time as any, value: p.value }))
  // Append the live unrealized PnL as a final "now" point so the curve shows
  // realized-to-date + the open-position jump.
  if (data.length) {
    const last = data[data.length - 1]
    data.push({ time: Math.floor(Date.now() / 1000) as any, value: last.value + props.unrealized })
  }
  areaSeries.setData(data)
  chartInstance?.timeScale().fitContent()
}

watch(() => [props.series, props.unrealized], renderData, { deep: true })

onMounted(initChart)
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chartInstance?.remove()
  chartInstance = null
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div v-if="!series.length" class="flex-1 flex items-center justify-center text-sm text-[var(--ui-text-muted)]">
      <div class="text-center">
        <p>No perp trades yet</p>
        <p class="text-[10px] text-[var(--ui-text-dimmed)] mt-1">Realized PnL appears here after your first perp trade</p>
      </div>
    </div>
    <div v-else ref="chartContainer" class="relative flex-1 min-h-0">
      <div class="absolute top-2 left-3 z-10 pointer-events-none">
        <span class="text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)]">Cumulative PnL</span>
      </div>
    </div>
  </div>
</template>
