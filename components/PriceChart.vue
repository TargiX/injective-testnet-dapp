<script setup lang="ts">
import { fmtPrice } from '~/utils/inj-format'
import type { ChartResolution, PriceCandle } from '~/composables/useInjective'

const {
  chartCandles,
  chartCandlesLoading,
  chartCandlesError,
  loadChartCandles,
  selectedMarket,
} = useInjective()

const chartContainer = ref<HTMLElement | null>(null)
const lastPrice = ref<number>(0)
const changePct = ref<number>(0)
const isUp = ref(true)
type ChartMode = 'candle' | 'line'
const chartMode = ref<ChartMode>('line')

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1W'
const timeframes: {
  label: string
  value: Timeframe
  resolution: ChartResolution
  countback: number
}[] = [
  { label: '1m', value: '1m', resolution: '1', countback: 360 },
  { label: '5m', value: '5m', resolution: '5', countback: 300 },
  { label: '15m', value: '15m', resolution: '15', countback: 300 },
  { label: '1h', value: '1h', resolution: '60', countback: 240 },
  { label: '4h', value: '4h', resolution: '240', countback: 180 },
  { label: '1D', value: '1d', resolution: '1D', countback: 180 },
  { label: '1W', value: '1W', resolution: '1W', countback: 104 },
]
const activeTf = ref<Timeframe>('5m')
const activeTimeframe = computed(
  () => timeframes.find(t => t.value === activeTf.value) ?? timeframes[1],
)

function isFlat(data: PriceCandle[]): boolean {
  if (!data.length) return true
  let min = Infinity, max = -Infinity
  for (const d of data) {
    for (const v of [d.open, d.high, d.low, d.close]) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (!isFinite(min) || !isFinite(max) || max <= 0) return true
  return (max - min) / max < 0.000001
}

let chartInstance: any = null
let mainSeries: any = null
let volumeSeries: any = null
let resizeObserver: ResizeObserver | null = null
let lw: any = null
let lastFitKey = ''
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function initChart() {
  if (chartInstance) return
  const el = chartContainer.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  if (rect.width < 10 || rect.height < 10) {
    setTimeout(initChart, 100)
    return
  }

  if (!lw) {
    lw = await import('lightweight-charts')
  }

  chartInstance = lw.createChart(el, {
    width: rect.width,
    height: rect.height,
    layout: {
      background: { type: lw.ColorType.Solid, color: 'transparent' },
      textColor: '#5b677a',
      fontFamily: "'SF Mono','JetBrains Mono',ui-monospace,Menlo,monospace",
      fontSize: 10,
    },
    grid: {
      vertLines: { color: 'rgba(35,43,58,0.5)' },
      horzLines: { color: 'rgba(35,43,58,0.5)' },
    },
    crosshair: {
      vertLine: { color: '#5b677a', width: 1, style: 2, labelBackgroundColor: '#232b3a' },
      horzLine: { color: '#5b677a', width: 1, style: 2, labelBackgroundColor: '#232b3a' },
    },
    rightPriceScale: {
      borderColor: '#1b2230',
      scaleMargins: { top: 0.1, bottom: 0.2 },
    },
    timeScale: {
      borderColor: '#1b2230',
      timeVisible: true,
      secondsVisible: false,
      ticksVisible: true,
      minimumHeight: 24,
      rightOffset: 3,
      barSpacing: 8,
      minBarSpacing: 1,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
  })

  volumeSeries = chartInstance.addSeries(lw.HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '',
  })
  chartInstance.priceScale('').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })

  resizeObserver = new ResizeObserver(() => {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) {
      chartInstance?.applyOptions({ width: r.width, height: r.height })
    }
  })
  resizeObserver.observe(el)

  updateChartData()
}

function fitChartToData(mode: ChartMode) {
  if (!chartInstance) return

  const timeScale = chartInstance.timeScale()
  timeScale.applyOptions(
    mode === 'line'
      ? {
          rightOffset: 2,
          barSpacing: 8,
          minBarSpacing: 0.5,
        }
      : {
          rightOffset: 3,
          barSpacing: 8,
          minBarSpacing: 1,
        },
  )

  const fitKey = `${selectedMarket.value?.marketId ?? 'none'}:${activeTf.value}:${mode}`
  if (fitKey !== lastFitKey) {
    lastFitKey = fitKey
    timeScale.fitContent()
  }
}

function updateChartData() {
  if (!chartInstance || !lw) return

  const data = chartCandles.value

  if (!data.length) {
    if (mainSeries) mainSeries.setData([])
    if (volumeSeries) volumeSeries.setData([])
    lastPrice.value = 0
    changePct.value = 0
    lastFitKey = ''
    return
  }

  const flat = isFlat(data)
  const newMode = flat || data.length < 3 ? 'line' : 'candle'

  if (chartMode.value !== newMode || !mainSeries) {
    if (mainSeries) {
      chartInstance.removeSeries(mainSeries)
    }

    chartMode.value = newMode

    if (newMode === 'line') {
      mainSeries = chartInstance.addSeries(lw.LineSeries, {
        color: '#1fb87a',
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      })
    } else {
      mainSeries = chartInstance.addSeries(lw.CandlestickSeries, {
        upColor: '#1fb87a',
        downColor: '#f0556a',
        borderUpColor: '#1fb87a',
        borderDownColor: '#f0556a',
        wickUpColor: '#1fb87a',
        wickDownColor: '#f0556a',
      })
    }
  }

  if (newMode === 'line') {
    mainSeries.setData(data.map((c) => ({ time: c.time, value: c.close })))
  } else {
    mainSeries.setData(data.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })))
  }

  volumeSeries.setData(
    data.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(31,184,122,0.25)' : 'rgba(240,85,106,0.25)',
    }))
  )

  fitChartToData(newMode)

  const first = data[0].close
  const last = data[data.length - 1].close
  lastPrice.value = last
  changePct.value = first ? ((last - first) / first) * 100 : 0
  isUp.value = last >= first
}

async function refreshChartHistory() {
  const marketId = selectedMarket.value?.marketId
  if (!marketId) return
  const tf = activeTimeframe.value
  await loadChartCandles(tf.resolution, tf.countback)
}

watch(chartCandles, () => {
  if (!chartInstance) {
    initChart()
  } else {
    updateChartData()
  }
}, { deep: true })

watch(activeTf, () => {
  refreshChartHistory()
})

watch(selectedMarket, () => {
  lastFitKey = ''
  refreshChartHistory()
})

onMounted(() => {
  setTimeout(initChart, 50)
  refreshChartHistory()
  refreshTimer = setInterval(refreshChartHistory, 15_000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (chartInstance) {
    chartInstance.remove()
    chartInstance = null
    mainSeries = null
    volumeSeries = null
  }
})
</script>

<template>
  <div class="h-full flex flex-col rounded-lg overflow-hidden bg-[var(--ui-bg)] ring ring-[var(--ui-border)]">
    <div class="flex-none flex items-center justify-between px-4 py-2 border-b border-border-soft">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-wider text-[var(--ui-text-muted)]">Chart</span>
        <UBadge variant="subtle" color="neutral" size="sm">
          {{ chartMode === 'candle' ? 'Candles' : 'Line' }}
        </UBadge>
      </div>

      <div class="flex items-center gap-0.5">
        <button
          v-for="tf in timeframes"
          :key="tf.value"
          class="px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors"
          :class="activeTf === tf.value
            ? 'bg-surface-3 text-[var(--ui-text)]'
            : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
          @click="activeTf = tf.value"
        >
          {{ tf.label }}
        </button>
      </div>

      <div v-if="lastPrice" class="flex items-baseline gap-2">
        <span class="font-mono tabular-nums text-sm font-bold" :class="isUp ? 'text-bid' : 'text-ask'">
          {{ fmtPrice(lastPrice) }}
        </span>
        <span class="font-mono tabular-nums text-[11px] font-semibold" :class="isUp ? 'text-bid' : 'text-ask'">
          {{ isUp ? '▲' : '▼' }} {{ Math.abs(changePct).toFixed(2) }}%
        </span>
      </div>
    </div>

    <div class="relative flex-1 min-h-0">
      <div
        v-if="chartCandlesLoading || !chartCandles.length"
        class="absolute inset-0 z-10 flex items-center justify-center text-sm text-[var(--ui-text-muted)]"
      >
        {{ chartCandlesLoading ? 'Loading candles…' : (chartCandlesError || 'No historical candles.') }}
      </div>
      <div ref="chartContainer" class="absolute inset-0" />
    </div>
  </div>
</template>
