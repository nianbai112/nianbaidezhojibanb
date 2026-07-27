<template>
  <div class="page-shell">
    <PageHeader title="二手分析" subtitle="关注发布、交易意向、交易方式和二手支付表现">
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
        <div class="section-head"><h3>交易方式占比</h3><span>发布商品维度</span></div>
        <div class="metric-list">
          <div v-for="item in data.deliveryTypes || []" :key="item.name" class="metric-row">
            <span>{{ item.name }}</span>
            <div class="bar-track"><div class="bar-fill delivery" :style="{ width: barWidth(item.count, deliveryMax) }"></div></div>
            <strong>{{ item.count }}</strong>
          </div>
          <EmptyState v-if="!(data.deliveryTypes || []).length" description="暂无交易方式数据" :image-size="64" />
        </div>
      </section>

      <section class="glass-card">
        <div class="section-head"><h3>商品状态分布</h3><span>当前库存状态</span></div>
        <el-table :data="data.status || []" size="small">
          <el-table-column prop="name" label="状态" min-width="120" />
          <el-table-column prop="count" label="数量" width="100" />
          <el-table-column label="占比" width="100">
            <template #default="{ row }">{{ rate(row.count, data.products?.total) }}%</template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <div class="main-grid">
      <section class="glass-card">
        <div class="section-head"><h3>发布趋势</h3><span>按天统计新增二手商品</span></div>
        <div class="trend-chart">
          <div v-for="item in data.trend || []" :key="item.date" class="trend-item">
            <div class="trend-date">{{ item.date }}</div>
            <div class="trend-bar-wrapper"><div class="trend-bar" :style="{ height: barWidth(item.count, trendMax) }"></div></div>
            <div class="trend-count">{{ item.count }}</div>
          </div>
          <EmptyState v-if="!(data.trend || []).length" description="暂无趋势数据" :image-size="64" />
        </div>
      </section>

      <section class="glass-card">
        <div class="section-head"><h3>意向/订单状态</h3><span>校内交易和自提以意向为主</span></div>
        <el-table :data="data.orderStatus || []" size="small">
          <el-table-column prop="name" label="状态" min-width="120" />
          <el-table-column prop="count" label="数量" width="100" />
        </el-table>
      </section>
    </div>
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
const data = ref<any>({})
const filters = reactive({ regionId: '' })
const unwrap = (res: any) => res?.data ?? res ?? {}
const money = (value: any) => Number(value || 0).toFixed(2)
const rate = (value: any, total: any) => Number(total || 0) > 0 ? ((Number(value || 0) / Number(total)) * 100).toFixed(1) : '0.0'
const barWidth = (count: number, max: number) => `${Math.max(4, (Number(count || 0) / Math.max(max, 1)) * 100)}%`
const deliveryMax = computed(() => Math.max(...(data.value.deliveryTypes || []).map((item: any) => item.count), 1))
const trendMax = computed(() => Math.max(...(data.value.trend || []).map((item: any) => item.count), 1))

const statItems = computed<StatItem[]>(() => [
  { label: '商品总数', value: data.value.products?.total || 0, icon: 'Goods', tone: 'blue' },
  { label: '新增发布', value: data.value.products?.new || 0, icon: 'DocumentAdd', tone: 'green' },
  { label: '在售', value: data.value.products?.onSale || 0, icon: 'Sell', tone: 'cyan' },
  { label: '已售出', value: data.value.products?.sold || 0, icon: 'SoldOut', tone: 'purple' },
  { label: '交易意向', value: data.value.orders?.total || 0, icon: 'ChatLineSquare', tone: 'orange' },
  { label: '二手支付', value: `¥${money(data.value.orders?.paidAmount)}`, icon: 'Money', tone: 'red' },
])

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
    const res = await request.get('/admin/analytics/second-hand', { params: params() })
    data.value = unwrap(res)
    if (showSuccess) ElMessage.success('二手分析已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载二手分析失败')
    data.value = {}
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
.glass-card { background: var(--mx-card); border: 1px solid var(--mx-border); border-radius: 6px; padding: 18px; margin-bottom: 16px; }
.main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.section-head h3 { margin: 0; color: var(--mx-text); font-size: 16px; }
.section-head span { color: var(--mx-muted); font-size: 12px; }
.metric-list { display: flex; flex-direction: column; gap: 12px; min-height: 220px; }
.metric-row { display: grid; grid-template-columns: 110px 1fr 48px; gap: 10px; align-items: center; color: var(--mx-sub); font-size: 13px; }
.bar-track { height: 18px; background: var(--mx-soft); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 999px; }
.bar-fill.delivery { background: var(--el-color-primary); }
.trend-chart { display: flex; align-items: flex-end; gap: 8px; min-height: 240px; padding: 8px 12px 0; }
.trend-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 26px; }
.trend-date { font-size: 10px; color: var(--mx-muted); writing-mode: vertical-rl; height: 68px; overflow: hidden; }
.trend-bar-wrapper { width: 100%; height: 150px; display: flex; align-items: flex-end; }
.trend-bar { width: 100%; background: var(--el-color-primary); border-radius: 6px 6px 0 0; }
.trend-count { font-size: 12px; color: var(--mx-sub); }
@media (max-width: 1200px) {
  .main-grid { grid-template-columns: 1fr; }
}
</style>
