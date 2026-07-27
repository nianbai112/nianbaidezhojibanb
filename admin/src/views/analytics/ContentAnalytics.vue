<template>
  <div class="page-shell">
    <PageHeader title="内容分析">
      <template #actions>
        <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px" @change="loadData" />
        <el-button type="primary" :loading="loading" @click="loadData(true)">刷新</el-button>
      </template>
    </PageHeader>

    <StatGrid :items="statItems" />

    <div class="glass-card">
      <h3>帖子发布趋势</h3>
      <div class="trend-chart">
        <div v-for="(item, index) in data.postTrend" :key="index" class="trend-item">
          <div class="trend-date">{{ item.date }}</div>
          <div class="trend-bar-wrapper">
            <div class="trend-bar" :style="{ height: (item.count / maxCount * 100) + '%' }"></div>
          </div>
          <div class="trend-count">{{ item.count }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import type { StatItem } from '@/types/admin'
import { request } from '@/api/request'

const dateRange = ref<any>(null)
const loading = ref(false)
const data = ref<any>({})

const maxCount = computed(() => Math.max(...(data.value.postTrend?.map((i: any) => i.count) || [1]), 1))
const unwrap = (res: any) => res?.data ?? res ?? {}

const statItems = computed<StatItem[]>(() => [
  { label: '总帖子', value: data.value.posts?.total || 0, icon: 'Document', tone: 'blue' },
  { label: '新增帖子', value: data.value.posts?.new || 0, icon: 'DocumentAdd', tone: 'green' },
  { label: '总评论', value: data.value.comments?.total || 0, icon: 'ChatDotRound', tone: 'orange' },
  { label: '总点赞', value: data.value.likes?.total || 0, icon: 'Pointer', tone: 'red' },
])

import { formatDateRangeParams } from '@/utils/date'

const loadData = async (showSuccess = false) => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) {
      const { startDate, endDate } = formatDateRangeParams(dateRange.value)
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
    }
    const res = await request.get('/admin/analytics/content', { params })
    data.value = unwrap(res)
    if (showSuccess === true) ElMessage.success('内容分析已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载数据失败')
    data.value = {}
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadData() })
</script>

<style scoped>
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 10px; padding: 20px; }
.glass-card h3 { margin-bottom: 16px; }
.trend-chart { display: flex; align-items: flex-end; gap: 8px; height: 200px; padding: 0 20px; }
.trend-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.trend-date { font-size: 10px; color: #909399; }
.trend-bar-wrapper { width: 100%; height: 150px; display: flex; align-items: flex-end; }
.trend-bar { width: 100%; background: var(--el-color-warning); border-radius: 6px 6px 0 0; transition: height 0.3s; }
.trend-count { font-size: 12px; font-weight: 500; }
</style>
