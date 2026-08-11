<template>
  <div class="page-shell">
    <PageHeader title="搜索关键词分析">
      <template #actions>
        <el-button type="primary" :loading="loading" @click="loadKeywords(true)">刷新</el-button>
      </template>
    </PageHeader>

    <div class="filter-bar glass-card">
      <el-input v-model="filters.keyword" placeholder="搜索关键词" clearable style="width: 180px" @keyup.enter="loadKeywords(false)" />
      <el-select v-model="filters.regionId" placeholder="区域" clearable filterable style="width: 180px">
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 260px" />
      <el-button type="primary" @click="loadKeywords(false)">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="summary-row">
      <div class="summary-card">
        <span>关键词数</span>
        <strong>{{ totalKeywords }}</strong>
      </div>
      <div class="summary-card">
        <span>搜索次数</span>
        <strong>{{ totalCount }}</strong>
      </div>
    </div>

    <div class="glass-card" style="padding: 20px;">
      <el-table :data="keywords" v-loading="loading">
        <el-table-column type="index" label="排名" width="80" />
        <el-table-column prop="keyword" label="关键词" min-width="200" />
        <el-table-column prop="count" label="搜索次数" width="120" />
        <el-table-column label="搜索类型" min-width="140">
          <template #default="{ row }">{{ (row.types || []).join('、') || '-' }}</template>
        </el-table-column>
        <el-table-column prop="regionCount" label="覆盖区域" width="110" />
        <el-table-column label="最近搜索" width="180">
          <template #default="{ row }">{{ formatDate(row.latestAt) }}</template>
        </el-table-column>
        <el-table-column label="占比" width="120">
          <template #default="{ row }">{{ totalCount > 0 ? ((row.count / totalCount) * 100).toFixed(1) : '0.0' }}%</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import { fetchRegions } from '@/api/admin'
import PageHeader from '@/components/common/PageHeader.vue'

const loading = ref(false)
const keywords = ref<any[]>([])
const regions = ref<any[]>([])
const dateRange = ref<any[]>([])
const totalKeywords = ref(0)
const totalSearches = ref(0)
const filters = reactive({ keyword: '', regionId: '' })
const totalCount = computed(() => totalSearches.value || keywords.value.reduce((sum: number, k: any) => sum + k.count, 0))
const unwrap = (res: any) => res?.data ?? res ?? {}
const formatDate = (date?: string) => date ? new Date(date).toLocaleString('zh-CN') : '-'

import { formatDateRangeParams } from '@/utils/date'

const loadKeywords = async (showSuccess = false) => {
  loading.value = true
  try {
    const params: any = { limit: 100, keyword: filters.keyword, regionId: filters.regionId }
    if (dateRange.value?.length === 2) {
      const { startDate, endDate } = formatDateRangeParams(dateRange.value)
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
    }
    const res = await request.get('/admin/tracking/search-keywords', { params })
    const data = unwrap(res)
    keywords.value = data?.keywords || []
    totalKeywords.value = Number(data?.totalKeywords || keywords.value.length)
    totalSearches.value = Number(data?.totalSearches || keywords.value.reduce((sum: number, k: any) => sum + Number(k.count || 0), 0))
    if (showSuccess) ElMessage.success('搜索关键词已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载搜索关键词失败')
    keywords.value = []
    totalKeywords.value = 0
    totalSearches.value = 0
  } finally { loading.value = false }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.regionId = ''
  dateRange.value = []
  loadKeywords(false)
}

const loadRegions = async () => {
  try {
    regions.value = await fetchRegions()
  } catch {
    regions.value = []
  }
}

onMounted(() => {
  loadRegions()
  loadKeywords()
})
</script>

<style scoped>
.filter-bar { display: flex; gap: 12px; padding: 16px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.summary-row { display: grid; grid-template-columns: repeat(2, minmax(0, 180px)); gap: 12px; margin-bottom: 16px; }
.summary-card { background: #fff; border: 1px solid #dbe4f0; border-radius: 6px; padding: 14px 16px; }
.summary-card span { display: block; color: #64748b; font-size: 13px; margin-bottom: 8px; }
.summary-card strong { color: #0f172a; font-size: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 10px; }
</style>
