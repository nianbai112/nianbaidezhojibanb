<template>
  <div class="page-shell">
    <PageHeader title="订单分析" subtitle="按商家、跑腿、商城、二手拆分平台交易表现">
      <template #actions>
        <el-select v-model="filters.regionId" clearable filterable placeholder="全部区域" style="width: 180px" @change="loadData">
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 260px" @change="loadData" />
        <el-button type="primary" :loading="loading" @click="loadData(true)">刷新</el-button>
      </template>
    </PageHeader>

    <StatGrid :items="statItems" />

    <section class="glass-card">
      <div class="section-head">
        <h3>业务线拆分</h3>
        <span>GMV 优先按支付单统计，兼容业务订单金额</span>
      </div>
      <el-table :data="data.businessBreakdown || []">
        <el-table-column prop="name" label="业务线" min-width="140" />
        <el-table-column prop="orders" label="订单/意向" width="120" />
        <el-table-column prop="completed" label="完成" width="100" />
        <el-table-column prop="paidCount" label="支付单" width="100" />
        <el-table-column label="GMV" width="150">
          <template #default="{ row }">¥{{ money(row.gmv) }}</template>
        </el-table-column>
        <el-table-column label="完成率" width="120">
          <template #default="{ row }">{{ rate(row.completed, row.orders) }}%</template>
        </el-table-column>
      </el-table>
    </section>

    <section class="glass-card">
      <div class="section-head">
        <h3>订单趋势</h3>
        <span>商家订单趋势，其他业务线在拆分表中展示</span>
      </div>
      <div class="trend-chart">
        <div v-for="item in data.trend || []" :key="item.date" class="trend-item">
          <div class="trend-date">{{ item.date }}</div>
          <div class="trend-bar-wrapper">
            <div class="trend-bar" :style="{ height: barHeight(item.count) }"></div>
          </div>
          <div class="trend-count">{{ item.count }}</div>
        </div>
        <EmptyState v-if="!(data.trend || []).length" description="暂无趋势数据" :image-size="64" />
      </div>
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
const data = ref<any>({})
const regions = ref<any[]>([])
const filters = reactive({ regionId: '' })
const unwrap = (res: any) => res?.data ?? res ?? {}
const money = (value: any) => Number(value || 0).toFixed(2)
const maxCount = computed(() => Math.max(...(data.value.trend?.map((item: any) => item.count) || [1]), 1))
const barHeight = (count: number) => `${Math.max(4, (Number(count || 0) / maxCount.value) * 100)}%`
const rate = (value: any, total: any) => Number(total || 0) > 0 ? ((Number(value || 0) / Number(total)) * 100).toFixed(1) : '0.0'
const statItems = computed<StatItem[]>(() => [
  { label: '订单/意向', value: data.value.total || 0 },
  { label: '完成订单', value: data.value.completed || 0 },
  { label: 'GMV', value: `¥${money(data.value.gmv)}` },
  { label: '退款金额', value: `¥${money(data.value.refundAmount)}` },
  { label: '退款率', value: `${data.value.refundRate || 0}%` },
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
    const res = await request.get('/admin/analytics/orders', { params: params() })
    data.value = unwrap(res)
    if (showSuccess) ElMessage.success('订单分析已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载订单分析失败')
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
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.section-head h3 { margin: 0; color: var(--mx-text); font-size: 16px; }
.section-head span { color: var(--mx-muted); font-size: 12px; }
.trend-chart { display: flex; align-items: flex-end; gap: 8px; min-height: 240px; padding: 8px 12px 0; }
.trend-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 26px; }
.trend-date { font-size: 10px; color: var(--mx-muted); writing-mode: vertical-rl; height: 68px; overflow: hidden; }
.trend-bar-wrapper { width: 100%; height: 150px; display: flex; align-items: flex-end; }
.trend-bar { width: 100%; background: var(--el-color-warning); border-radius: 6px 6px 0 0; }
.trend-count { font-size: 12px; color: var(--mx-sub); }
</style>
