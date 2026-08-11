<template>
  <div class="page-shell">
    <PageHeader title="数据概览" subtitle="统一查看用户、内容、订单和区域经营数据">
      <template #actions>
        <el-select v-model="filters.regionId" clearable filterable placeholder="全部区域" style="width: 180px" @change="loadData">
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 260px" @change="loadData" />
        <el-button type="primary" :loading="loading" @click="loadData(true)">刷新</el-button>
      </template>
    </PageHeader>

    <StatGrid :items="statItems" />

    <div class="main-grid">
      <section class="glass-card">
        <div class="section-head">
          <h3>用户增长趋势</h3>
          <span>按选择时间段统计</span>
        </div>
        <div class="trend-list">
          <div v-for="item in userTrend" :key="item.date" class="trend-row">
            <span>{{ item.date }}</span>
            <div class="bar-track"><div class="bar-fill user" :style="{ width: barWidth(item.count, maxUserTrend) }"></div></div>
            <strong>{{ item.count }}</strong>
          </div>
          <EmptyState v-if="!userTrend.length" description="暂无趋势数据" :image-size="64" />
        </div>
      </section>

      <section class="glass-card">
        <div class="section-head">
          <h3>业务线成交拆分</h3>
          <span>按支付订单与业务订单综合统计</span>
        </div>
        <el-table :data="businessBreakdown" size="small">
          <el-table-column prop="name" label="业务线" min-width="120" />
          <el-table-column prop="orders" label="订单/意向" width="100" />
          <el-table-column prop="completed" label="完成" width="90" />
          <el-table-column label="GMV" width="120">
            <template #default="{ row }">¥{{ money(row.gmv) }}</template>
          </el-table-column>
          <el-table-column label="支付单" width="90">
            <template #default="{ row }">{{ row.paidCount || 0 }}</template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <section class="glass-card">
      <div class="section-head">
        <h3>区域数据对比</h3>
        <span>按订单量排序</span>
      </div>
      <el-table :data="regionData" size="small">
        <el-table-column prop="name" label="区域" min-width="160" />
        <el-table-column prop="users" label="用户" width="100" />
        <el-table-column prop="posts" label="帖子" width="100" />
        <el-table-column prop="orders" label="订单" width="100" />
        <el-table-column prop="merchants" label="商家" width="100" />
        <el-table-column label="GMV" width="140">
          <template #default="{ row }">¥{{ money(row.gmv) }}</template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { StatItem } from '@/types/admin'
import { request } from '@/api/request'
import { fetchRegions } from '@/api/admin'

const dateRange = ref<any[]>([])
const loading = ref(false)
const regions = ref<any[]>([])
const filters = reactive({ regionId: '' })
const overview = ref<any>({})
const userData = ref<any>({})
const orderData = ref<any>({})
const regionData = ref<any[]>([])

const unwrap = (res: any) => res?.data ?? res ?? {}
const money = (value: any) => Number(value || 0).toFixed(2)
const barWidth = (count: number, max: number) => `${Math.max(4, (Number(count || 0) / Math.max(max, 1)) * 100)}%`

const userTrend = computed(() => userData.value?.trend || [])
const maxUserTrend = computed(() => Math.max(...userTrend.value.map((item: any) => item.count), 1))
const businessBreakdown = computed(() => orderData.value?.businessBreakdown || [])

const statItems = computed<StatItem[]>(() => {
  const data = overview.value || {}
  const item = (label: string, value: string | number, trend: number): StatItem => ({
    label,
    value,
    delta: `${trend >= 0 ? '+' : ''}${trend}%`,
    down: trend < 0,
  })
  return [
    item('总用户', data.users?.total || 0, data.users?.trend ?? 0),
    item('新增用户', data.users?.new || 0, data.users?.trend ?? 0),
    item('总帖子', data.content?.totalPosts || 0, data.content?.trend ?? 0),
    item('订单/意向', orderData.value?.total || data.orders?.total || 0, data.orders?.trend ?? 0),
    item('总GMV', `¥${money(orderData.value?.gmv ?? data.gmv?.total)}`, data.orders?.trend ?? 0),
    item('活跃商家', data.merchants?.active || 0, 0),
  ]
})

import { formatDateRangeParams } from '@/utils/date'

function params() {
  const result: any = { regionId: filters.regionId || undefined }
  if (dateRange.value?.length === 2) {
    const { startDate, endDate } = formatDateRangeParams(dateRange.value)
    if (startDate) result.startDate = startDate
    if (endDate) result.endDate = endDate
  }
  return result
}

async function loadRegions() {
  try {
    regions.value = await fetchRegions()
  } catch {
    regions.value = []
  }
}

async function loadData(showSuccess = false) {
  loading.value = true
  try {
    const query = params()
    const [overviewRes, usersRes, ordersRes, regionsRes] = await Promise.all([
      request.get('/admin/analytics/overview', { params: query }),
      request.get('/admin/analytics/users', { params: query }),
      request.get('/admin/analytics/orders', { params: query }),
      request.get('/admin/analytics/regions', { params: query }),
    ])
    overview.value = unwrap(overviewRes)
    userData.value = unwrap(usersRes)
    orderData.value = unwrap(ordersRes)
    regionData.value = Array.isArray(unwrap(regionsRes)) ? unwrap(regionsRes) : []
    if (showSuccess) ElMessage.success('数据概览已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadRegions()
  await loadData()
})
</script>

<style scoped>
.glass-card { background: var(--mx-card); border: 1px solid var(--mx-border); border-radius: 6px; padding: 18px; }
.main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.section-head h3 { margin: 0; color: var(--mx-text); font-size: 16px; }
.section-head span { color: var(--mx-muted); font-size: 12px; }
.trend-list { display: flex; flex-direction: column; gap: 10px; min-height: 260px; }
.trend-row { display: grid; grid-template-columns: 92px 1fr 52px; gap: 10px; align-items: center; font-size: 13px; color: var(--mx-sub); }
.bar-track { height: 18px; background: var(--mx-soft); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 999px; }
.bar-fill.user { background: var(--el-color-primary); }
@media (max-width: 1200px) {
  .main-grid { grid-template-columns: 1fr; }
}
</style>
