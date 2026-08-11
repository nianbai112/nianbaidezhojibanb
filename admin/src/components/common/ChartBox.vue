<template>
  <div ref="el" class="chart-box" :style="{ height: boxHeight }"></div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer])

const props = withDefaults(defineProps<{ option: EChartsCoreOption; height?: number | string }>(), { height: 300 })

const el = ref<HTMLElement>()
const chart = shallowRef<ReturnType<typeof echarts.init>>()
let ro: ResizeObserver | null = null

const boxHeight = computed(() => (typeof props.height === 'number' ? `${props.height}px` : props.height))

onMounted(() => {
  if (!el.value) return
  chart.value = echarts.init(el.value)
  chart.value.setOption(props.option)
  ro = new ResizeObserver(() => chart.value?.resize())
  ro.observe(el.value)
})

watch(
  () => props.option,
  (opt) => {
    chart.value?.setOption(opt, true)
  }
)

onBeforeUnmount(() => {
  ro?.disconnect()
  chart.value?.dispose()
})
</script>

<style scoped>
.chart-box {
  width: 100%;
}
</style>
