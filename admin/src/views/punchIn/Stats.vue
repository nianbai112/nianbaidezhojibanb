<template>
  <div class="page-container">
    <!-- 统计卡片 -->
    <a-row :gutter="16" style="margin-bottom:16px">
      <a-col :span="6">
        <a-card>
          <a-statistic title="总打卡次数" :value="overview.totalRecords" :value-style="{ color: '#409EFF' }">
            <template #prefix><check-circle-outlined /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="今日打卡" :value="overview.todayRecords" :value-style="{ color: '#67C23A' }">
            <template #prefix><field-time-outlined /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="打卡地点" :value="overview.totalLocations" :value-style="{ color: '#E6A23C' }">
            <template #prefix><environment-outlined /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="活跃用户" :value="overview.totalUsers" :value-style="{ color: '#F56C6C' }">
            <template #prefix><user-outlined /></template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <!-- 趋势图 -->
    <a-card title="打卡趋势（近7天）" style="margin-bottom:16px">
      <div style="height:300px">
        <v-chart :option="trendOption" autoresize />
      </div>
    </a-card>

    <!-- 热门地点 -->
    <a-card title="热门打卡地点 TOP10">
      <a-table :columns="locationCols" :data-source="topLocations" :pagination="false" size="small" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { punchInApi } from '@/api/punchIn'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { CheckCircleOutlined, FieldTimeOutlined, EnvironmentOutlined, UserOutlined } from '@ant-design/icons-vue'

use([LineChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const overview = ref({ totalRecords: 0, todayRecords: 0, totalLocations: 0, totalUsers: 0 })
const trends = ref<{ date: string; count: number }[]>([])
const topLocations = ref<any[]>([])

const trendOption = ref({
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: [] as string[] },
  yAxis: { type: 'value', minInterval: 1 },
  series: [{ data: [] as number[], type: 'line', smooth: true, areaStyle: { opacity: 0.15 }, itemStyle: { color: '#409EFF' } }],
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
})

const locationCols = [
  { title: '排名', dataIndex: 'index', width: 60, customRender: ({ index }: any) => index + 1 },
  { title: '地点名称', dataIndex: 'name', width: 200 },
  { title: '地址', dataIndex: 'address', ellipsis: true },
  { title: '打卡次数', dataIndex: 'recordCount', width: 100 },
]

async function loadData() {
  try {
    const [ov, tr, loc] = await Promise.all([
      punchInApi.getStatsOverview(),
      punchInApi.getStatsTrends(7),
      punchInApi.getStatsLocations(10),
    ])
    overview.value = ov.data.data!
    topLocations.value = loc.data.data || []

    const td = tr.data.data || []
    trends.value = td
    trendOption.value.xAxis.data = td.map((d) => d.date.slice(5))
    trendOption.value.series[0].data = td.map((d) => d.count)
  } catch { /* handled */ }
}

onMounted(loadData)
</script>
