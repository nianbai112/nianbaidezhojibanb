<template>
  <div class="page-container">
    <div class="page-header">
      <h2>埋点事件</h2>
      <el-button type="primary" @click="loadEvents(true)">刷新</el-button>
    </div>

    <div class="filter-bar glass-card">
      <el-select v-model="filters.eventName" placeholder="事件类型" clearable style="width: 150px">
        <el-option label="页面访问" value="page_view" />
        <el-option label="按钮点击" value="button_click" />
        <el-option label="内容曝光" value="content_expose" />
        <el-option label="内容点击" value="content_click" />
        <el-option label="搜索" value="search" />
        <el-option label="分享" value="share" />
      </el-select>
      <el-input v-model="filters.pagePath" placeholder="页面路径" clearable style="width: 200px" />
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 240px" />
      <el-button type="primary" @click="loadEvents(false)">查询</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="events" v-loading="loading">
        <el-table-column prop="eventName" label="事件类型" width="120" />
        <el-table-column prop="pagePath" label="页面路径" min-width="150" show-overflow-tooltip />
        <el-table-column prop="targetId" label="目标ID" width="120" show-overflow-tooltip />
        <el-table-column prop="userId" label="用户ID" width="120" show-overflow-tooltip />
        <el-table-column prop="regionId" label="区域" width="100" />
        <el-table-column prop="createdAt" label="时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <el-pagination v-if="total > pageSize" :current-page="page" :page-size="pageSize" :total="total" @current-change="handlePageChange" layout="prev, pager, next" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const events = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const dateRange = ref([])
const filters = reactive({ eventName: '', pagePath: '' })

const formatDate = (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-'
const unwrapPage = (res: any) => res?.data ?? res ?? {}

const loadEvents = async (showSuccess = false) => {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, ...filters }
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]?.toISOString()
      params.endDate = dateRange.value[1]?.toISOString()
    }
    const res = await request.get('/admin/tracking/events', { params })
    const data = unwrapPage(res)
    events.value = data.list || []
    total.value = data.total || 0
    if (showSuccess) ElMessage.success('埋点事件已刷新')
  } catch (error: any) {
    ElMessage.error(error?.message || '加载埋点事件失败')
    events.value = []
    total.value = 0
  } finally { loading.value = false }
}

const handlePageChange = (p: number) => { page.value = p; loadEvents() }
onMounted(() => loadEvents())
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.filter-bar { display: flex; gap: 12px; padding: 16px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; }
.el-pagination { margin-top: 16px; justify-content: flex-end; }
</style>
