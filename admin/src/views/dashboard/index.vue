<template>
  <div class="dashboard-page" style="padding: 24px">
    <!-- ========== 核心 KPI 卡片 ========== -->
    <div class="kpi-row">
      <a-card
        v-for="card in kpiCards"
        :key="card.key"
        size="small"
        class="kpi-card"
        :body-style="{ padding: '16px 20px' }"
      >
        <div class="kpi-meta">
          <span class="kpi-label">{{ card.label }}</span>
          <a-tag v-if="card.tag" size="small" :color="card.tagColor">{{ card.tag }}</a-tag>
        </div>
        <div class="kpi-value" :style="{ color: card.color || '#1f2937' }">
          {{ card.value }}
        </div>
        <div v-if="card.trend !== undefined" class="kpi-trend" :class="card.trend >= 0 ? 'up' : 'down'">
          {{ card.trend >= 0 ? '↑' : '↓' }} {{ Math.abs(card.trend) }}%
          <span class="kpi-compare">较昨日</span>
        </div>
        <div v-else-if="card.sub" class="kpi-sub">{{ card.sub }}</div>
      </a-card>
    </div>

    <!-- ========== 待办 / 预警 ========== -->
    <div class="pending-row">
      <a-card
        v-for="item in pendingItems"
        :key="item.key"
        size="small"
        :hoverable="item.count > 0"
        class="pending-card"
        @click="item.route && $router.push(item.route)"
      >
        <div class="pending-content">
          <div class="pending-left">
            <component :is="item.icon" class="pending-icon" :style="{ color: item.iconColor }" />
            <span class="pending-label">{{ item.label }}</span>
          </div>
          <a-badge
            :count="item.count"
            :overflow-count="99"
            :number-style="{ backgroundColor: item.count > 0 ? '#ef4444' : '#d1d5db', minWidth: '20px', height: '20px', lineHeight: '20px', fontSize: '12px', borderRadius: '10px' }"
          />
        </div>
      </a-card>
    </div>

    <!-- ========== 趋势图表 ========== -->
    <div class="trend-row">
      <a-card title="近7天用户增长" size="small" class="trend-card">
        <v-chart :option="userTrendOption" autoresize style="height: 280px" />
      </a-card>
      <a-card title="近7天订单趋势" size="small" class="trend-card">
        <v-chart :option="orderTrendOption" autoresize style="height: 280px" />
      </a-card>
      <a-card title="近7天 GMV 趋势" size="small" class="trend-card">
        <v-chart :option="gmvTrendOption" autoresize style="height: 280px" />
      </a-card>
      <a-card title="近7天帖子发布" size="small" class="trend-card">
        <v-chart :option="postTrendOption" autoresize style="height: 280px" />
      </a-card>
    </div>

    <!-- ========== 区域概览 + 服务器状态 ========== -->
    <div class="bottom-row">
      <a-card title="区域 / 学校数据概览" size="small" class="region-card">
        <a-table
          :data-source="regionList"
          :columns="regionColumns"
          size="small"
          :pagination="false"
          :scroll="{ y: 320 }"
          row-key="id"
        />
      </a-card>

      <!-- 服务器状态（仅超级管理员） -->
      <a-card v-if="serverStatus.visible" title="服务器状态" size="small" class="server-card">
        <template #extra>
          <a-button type="link" size="small" @click="$router.push('/ops/overview')">查看运维中心</a-button>
        </template>
        <a-row :gutter="[16, 12]">
          <a-col :span="8">
            <div class="server-item">
              <div class="server-label">运行状态</div>
              <a-tag :color="serverStatus.backendStatus === 'running' ? 'success' : 'error'">
                {{ serverStatus.backendStatus }}
              </a-tag>
            </div>
          </a-col>
          <a-col :span="8">
            <div class="server-item">
              <div class="server-label">运行时间</div>
              <div class="server-value">{{ Math.floor(serverStatus.uptimeSeconds / 3600) }}h</div>
            </div>
          </a-col>
          <a-col :span="8">
            <div class="server-item">
              <div class="server-label">CPU 使用率</div>
              <div class="server-value" :style="{ color: serverStatus.cpuUsage > 80 ? '#ef4444' : '#1f2937' }">
                {{ serverStatus.cpuUsage }}%
              </div>
            </div>
          </a-col>
          <a-col :span="8">
            <div class="server-item">
              <div class="server-label">内存使用率</div>
              <div class="server-value" :style="{ color: serverStatus.memoryUsage > 80 ? '#ef4444' : '#1f2937' }">
                {{ serverStatus.memoryUsage }}%
              </div>
            </div>
          </a-col>
          <a-col :span="8">
            <div class="server-item">
              <div class="server-label">DB / Redis</div>
              <div class="server-value">
                <a-tag size="small" :color="serverStatus.dbStatus === 'healthy' ? 'success' : 'error'">DB</a-tag>
                <a-tag size="small" :color="serverStatus.redisStatus === 'healthy' ? 'success' : 'error'">Redis</a-tag>
              </div>
            </div>
          </a-col>
          <a-col :span="8">
            <div class="server-item">
              <div class="server-label">今日错误</div>
              <div class="server-value" :style="{ color: serverStatus.todayErrorCount > 0 ? '#ef4444' : '#1f2937' }">
                {{ serverStatus.todayErrorCount }}
              </div>
            </div>
          </a-col>
        </a-row>
      </a-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import {
  FileTextOutlined,
  ShopOutlined,
  MoneyCollectOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  CreditCardOutlined,
} from '@ant-design/icons-vue'
import { dashboardApi } from '@/api/dashboard'
import { opsApi } from '@/api/ops'
import { formatMoney } from '@/utils/format'
import { useUserStore } from '@/stores/user'
import type { DashboardStats, TrendDataPoint, RegionOverview } from '@/types/system'

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent])

const userStore = useUserStore()

// ---------- 原始数据 ----------
const stats = ref<Partial<DashboardStats>>({})
const trends = ref<TrendDataPoint[]>([])
const regionList = ref<RegionOverview[]>([])

// ---------- KPI 卡片 ----------
const kpiCards = computed(() => {
  const d = stats.value
  return [
    {
      key: 'totalUsers',
      label: '用户总数',
      value: d.totalUsers?.toLocaleString() ?? '--',
      color: '#3B82F6',
      sub: `今日 +${d.todayNewUsers ?? 0}`,
      tag: '用户',
      tagColor: 'blue',
    },
    {
      key: 'todayNewUsers',
      label: '今日新增用户',
      value: String(d.todayNewUsers ?? '--'),
      color: '#3B82F6',
      trend: d.userGrowth ?? 0,
      tag: '新增',
      tagColor: 'processing',
    },
    {
      key: 'dau',
      label: '近7天活跃用户',
      value: String(d.dauEstimate ?? '--'),
      color: '#6366F1',
      sub: 'DAU 估算',
      tag: '活跃',
      tagColor: 'purple',
    },
    {
      key: 'merchantCount',
      label: '商家总数',
      value: d.merchantCount?.toLocaleString() ?? '--',
      color: '#F59E0B',
      sub: `活跃商家 ${d.activeMerchantCount ?? 0}`,
      tag: '商家',
      tagColor: 'orange',
    },
    {
      key: 'activeMerchantCount',
      label: '活跃商家',
      value: String(d.activeMerchantCount ?? '--'),
      color: '#F59E0B',
      tag: '营业中',
      tagColor: 'warning',
    },
    {
      key: 'totalOrders',
      label: '总订单数',
      value: d.totalOrders?.toLocaleString() ?? '--',
      color: '#10B981',
      sub: `今日 +${d.todayOrders ?? 0}`,
      tag: '订单',
      tagColor: 'green',
    },
    {
      key: 'todayOrders',
      label: '今日订单',
      value: String(d.todayOrders ?? '--'),
      color: '#10B981',
      trend: d.orderGrowth ?? 0,
      tag: '今日',
      tagColor: 'success',
    },
    {
      key: 'totalGmv',
      label: '总 GMV（元）',
      value: d.totalGmv ? formatMoney(d.totalGmv) : '--',
      color: '#EC4899',
      sub: `累计交易额`,
      tag: 'GMV',
      tagColor: 'pink',
    },
    {
      key: 'todayGmv',
      label: '今日 GMV（元）',
      value: d.todayGmv ? formatMoney(d.todayGmv) : '--',
      color: '#EC4899',
      trend: d.gmvGrowth ?? 0,
      tag: '今日',
      tagColor: 'magenta',
    },
    {
      key: 'content',
      label: '内容数据',
      value: `${d.postCount?.toLocaleString() ?? '--'} 帖 / ${d.commentCount?.toLocaleString() ?? '--'} 评`,
      color: '#8B5CF6',
      sub: '帖子 / 评论',
      tag: '内容',
      tagColor: 'geekblue',
    },
  ]
})

// ---------- 待办预警 ----------
const pendingItems = ref([
  { key: 'posts', label: '待审核帖子', count: 0, route: '/content/posts', icon: FileTextOutlined, iconColor: '#3B82F6' },
  { key: 'merchants', label: '待审核商家', count: 0, route: '/shop/merchants', icon: ShopOutlined, iconColor: '#F59E0B' },
  { key: 'withdraws', label: '待处理提现', count: 0, route: '/finance/withdraws', icon: MoneyCollectOutlined, iconColor: '#10B981' },
  { key: 'reports', label: '待处理举报', count: 0, route: '/content/reports', icon: ExclamationCircleOutlined, iconColor: '#EF4444' },
  { key: 'certs', label: '待审核认证', count: 0, route: '/user/certifications', icon: SafetyCertificateOutlined, iconColor: '#6366F1' },
  { key: 'refunds', label: '待处理退款', count: 0, route: '/shop/refunds', icon: CreditCardOutlined, iconColor: '#EC4899' },
])

// ---------- 服务器状态 ----------
const serverStatus = reactive<any>({
  visible: false,
  backendStatus: '-',
  uptimeSeconds: 0,
  cpuUsage: 0,
  memoryUsage: 0,
  dbStatus: '-',
  redisStatus: '-',
  todayErrorCount: 0,
  lastRestartAt: null,
})

async function fetchServerStatus() {
  if (!userStore.isSuperAdmin) return
  try {
    const res = await opsApi.getOverview()
    if (res.data?.code === 0) {
      const d = res.data.data
      Object.assign(serverStatus, {
        visible: true,
        backendStatus: d.backendStatus,
        uptimeSeconds: d.uptimeSeconds,
        cpuUsage: d.cpuUsage,
        memoryUsage: d.memoryUsage,
        dbStatus: d.dbStatus,
        redisStatus: d.redisStatus,
        todayErrorCount: d.todayErrorCount,
        lastRestartAt: d.lastRestartAt,
      })
    }
  } catch {
    // 静默失败
  }
}

// ---------- 图表配置 ----------
const commonChartConfig = {
  tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
  grid: { left: 48, right: 20, top: 24, bottom: 24 },
  legend: { show: false },
}

const userTrendOption = computed(() => ({
  ...commonChartConfig,
  xAxis: { type: 'category' as const, data: trends.value.map((d) => d.date), axisLine: { lineStyle: { color: '#e5e7eb' } }, axisLabel: { color: '#6b7280' } },
  yAxis: { type: 'value' as const, axisLine: { show: false }, splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLabel: { color: '#6b7280' } },
  series: [{
    name: '新增用户',
    type: 'bar' as const,
    data: trends.value.map((d) => d.users),
    itemStyle: { color: '#3B82F6', borderRadius: [4, 4, 0, 0] },
    barWidth: '40%',
  }],
}))

const orderTrendOption = computed(() => ({
  ...commonChartConfig,
  xAxis: { type: 'category' as const, data: trends.value.map((d) => d.date), axisLine: { lineStyle: { color: '#e5e7eb' } }, axisLabel: { color: '#6b7280' } },
  yAxis: { type: 'value' as const, axisLine: { show: false }, splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLabel: { color: '#6b7280' } },
  series: [{
    name: '订单数',
    type: 'line' as const,
    data: trends.value.map((d) => d.orders),
    smooth: true,
    itemStyle: { color: '#10B981' },
    lineStyle: { width: 3 },
    areaStyle: { color: 'rgba(16,185,129,0.08)' },
    symbol: 'circle',
    symbolSize: 6,
  }],
}))

const gmvTrendOption = computed(() => ({
  ...commonChartConfig,
  xAxis: { type: 'category' as const, data: trends.value.map((d) => d.date), axisLine: { lineStyle: { color: '#e5e7eb' } }, axisLabel: { color: '#6b7280' } },
  yAxis: { type: 'value' as const, axisLine: { show: false }, splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLabel: { color: '#6b7280', formatter: (v: number) => `¥${(v / 100).toFixed(0)}` } },
  series: [{
    name: 'GMV',
    type: 'line' as const,
    data: trends.value.map((d) => d.gmv),
    smooth: true,
    itemStyle: { color: '#EC4899' },
    lineStyle: { width: 3 },
    areaStyle: { color: 'rgba(236,72,153,0.08)' },
    symbol: 'circle',
    symbolSize: 6,
  }],
}))

const postTrendOption = computed(() => ({
  ...commonChartConfig,
  xAxis: { type: 'category' as const, data: trends.value.map((d) => d.date), axisLine: { lineStyle: { color: '#e5e7eb' } }, axisLabel: { color: '#6b7280' } },
  yAxis: { type: 'value' as const, axisLine: { show: false }, splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLabel: { color: '#6b7280' } },
  series: [{
    name: '帖子数',
    type: 'bar' as const,
    data: trends.value.map((d) => d.posts),
    itemStyle: { color: '#8B5CF6', borderRadius: [4, 4, 0, 0] },
    barWidth: '40%',
  }],
}))

// ---------- 区域表格 ----------
const regionColumns = [
  { title: '区域名称', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: '状态', dataIndex: 'isOpen', key: 'isOpen', width: 80, customRender: ({ text }: any) => text ? '开放' : '关闭' },
  { title: '用户数', dataIndex: 'userCount', key: 'userCount', width: 90, align: 'right' as const },
  { title: '帖子数', dataIndex: 'postCount', key: 'postCount', width: 90, align: 'right' as const },
  { title: '商家数', dataIndex: 'merchantCount', key: 'merchantCount', width: 90, align: 'right' as const },
  { title: '订单数', dataIndex: 'orderCount', key: 'orderCount', width: 90, align: 'right' as const },
]

// ---------- 数据加载 ----------
onMounted(async () => {
  fetchServerStatus()

  try {
    const [statsRes, trendsRes, regionsRes] = await Promise.all([
      dashboardApi.getStats(),
      dashboardApi.getTrends(),
      dashboardApi.getRegions(),
    ])

    const data = (statsRes.data?.data || statsRes.data) as Partial<DashboardStats>
    if (data) {
      stats.value = data
      pendingItems.value[0].count = data.pendingPosts ?? 0
      pendingItems.value[1].count = data.pendingMerchants ?? 0
      pendingItems.value[2].count = data.pendingWithdraws ?? 0
      pendingItems.value[3].count = data.pendingReports ?? 0
      pendingItems.value[4].count = data.pendingCerts ?? 0
      pendingItems.value[5].count = data.pendingRefunds ?? 0
    }

    const trendData = trendsRes.data?.data || trendsRes.data
    if (Array.isArray(trendData)) {
      trends.value = trendData
    }

    const regionData = regionsRes.data?.data || regionsRes.data
    if (regionData?.list) {
      regionList.value = regionData.list
    }
  } catch (err) {
    console.error('Dashboard 数据加载失败', err)
  }
})
</script>

<style lang="less" scoped>
// ---------- KPI 卡片 ----------
.kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 16px;

  @media (max-width: 1400px) {
    grid-template-columns: repeat(3, 1fr);
  }
  @media (max-width: 992px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 576px) {
    grid-template-columns: 1fr;
  }
}

.kpi-card {
  :deep(.ant-card-body) {
    padding: 16px 20px;
  }
  transition: box-shadow 0.2s;
  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }

  .kpi-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .kpi-label {
    font-size: 13px;
    color: #6b7280;
  }
  .kpi-value {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 4px;
  }
  .kpi-trend {
    font-size: 12px;
    font-weight: 500;
    &.up { color: #10b981; }
    &.down { color: #ef4444; }
  }
  .kpi-compare {
    color: #9ca3af;
    margin-left: 4px;
    font-weight: 400;
  }
  .kpi-sub {
    font-size: 12px;
    color: #9ca3af;
  }
}

// ---------- 待办卡片 ----------
.pending-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 16px;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(3, 1fr);
  }
  @media (max-width: 576px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.pending-card {
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    transform: translateY(-1px);
  }

  :deep(.ant-card-body) {
    padding: 14px 16px;
  }

  .pending-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pending-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pending-icon {
    font-size: 18px;
  }
  .pending-label {
    font-size: 13px;
    color: #4b5563;
  }
}

// ---------- 趋势图表 ----------
.trend-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 16px;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
}

.trend-card {
  :deep(.ant-card-head) {
    min-height: 40px;
    padding: 0 16px;
    .ant-card-head-title {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
    }
  }
  :deep(.ant-card-body) {
    padding: 12px 16px 8px;
  }
}

// ---------- 底部区域 ----------
.bottom-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
}

.region-card {
  :deep(.ant-card-head) {
    min-height: 40px;
    padding: 0 16px;
    .ant-card-head-title {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
    }
  }
  :deep(.ant-card-body) {
    padding: 12px 16px;
  }
}

.server-card {
  :deep(.ant-card-head) {
    min-height: 40px;
    padding: 0 16px;
    .ant-card-head-title {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
    }
  }
  :deep(.ant-card-body) {
    padding: 16px;
  }
}

.server-item {
  text-align: center;
  .server-label {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 6px;
  }
  .server-value {
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
  }
}
</style>
