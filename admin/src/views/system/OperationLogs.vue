<template>
  <div class="page-container">
    <PageHeader title="操作日志" subtitle="查看管理员操作日志，支持按模块、操作类型筛选" icon="Document">
      <template #actions>
        <el-button @click="exportLogs">导出</el-button>
        <el-button @click="loadLogs">刷新</el-button>
      </template>
    </PageHeader>

    <SearchPanel @search="loadLogs" @reset="resetFilters">
      <el-input v-model="filters.keyword" placeholder="搜索操作内容" clearable style="width: 200px" />
      <el-select v-model="filters.module" placeholder="模块" clearable style="width: 120px">
        <el-option label="用户" value="user" />
        <el-option label="商家" value="merchant" />
        <el-option label="订单" value="order" />
        <el-option label="内容" value="content" />
        <el-option label="财务" value="finance" />
        <el-option label="系统" value="system" />
      </el-select>
      <el-select v-model="filters.action" placeholder="操作类型" clearable style="width: 120px">
        <el-option label="新增" value="create" />
        <el-option label="修改" value="update" />
        <el-option label="删除" value="delete" />
        <el-option label="审核" value="audit" />
        <el-option label="登录" value="login" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 240px" />
    </SearchPanel>

    <div class="glass-card" style="padding: 0;">
      <el-table :data="logs" v-loading="loading" border stripe>
        <el-table-column prop="adminName" label="操作人" width="120" />
        <el-table-column prop="module" label="模块" width="80">
          <template #default="{ row }">
            <el-tag size="small">{{ getModuleLabel(row.module) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作" width="80">
          <template #default="{ row }">
            <el-tag :type="getActionType(row.action)" size="small">{{ getActionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="目标" min-width="150">
          <template #default="{ row }">
            <span>{{ row.targetType || '-' }}: {{ row.targetId || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="详情" min-width="200">
          <template #default="{ row }">
            <span class="detail-text">{{ formatDetail(row.detail) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="120" />
        <el-table-column label="时间" width="160">
          <template #default="{ row }">
            <TimeText :time="row.createdAt" />
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadLogs"
          @size-change="loadLogs"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import TimeText from '@/components/common/TimeText.vue'

const loading = ref(false)
const logs = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const dateRange = ref<any[]>([])

const filters = reactive({
  keyword: '',
  module: '',
  action: ''
})

const moduleLabels: Record<string, string> = {
  user: '用户',
  merchant: '商家',
  order: '订单',
  content: '内容',
  finance: '财务',
  system: '系统',
  region: '区域',
  delivery: '配送'
}

const actionLabels: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '删除',
  audit: '审核',
  login: '登录',
  logout: '登出',
  ban: '封禁',
  unban: '解封'
}

const actionTypes: Record<string, string> = {
  create: 'success',
  update: '',
  delete: 'danger',
  audit: 'warning',
  login: 'info'
}

const getModuleLabel = (module: string) => moduleLabels[module] || module
const getActionLabel = (action: string) => actionLabels[action] || action
const getActionType = (action: string) => actionTypes[action] || ''

const formatDetail = (detail: any) => {
  if (!detail) return '-'
  if (typeof detail === 'string') return detail
  try {
    return JSON.stringify(detail).substring(0, 100)
  } catch {
    return '-'
  }
}

const loadLogs = async () => {
  loading.value = true
  try {
    const params: any = {
      page: page.value,
      pageSize: pageSize.value,
      ...filters
    }
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]?.toISOString()
      params.endDate = dateRange.value[1]?.toISOString()
    }
    const res = await request.get('/admin/operation-logs', { params })
    logs.value = res.data?.list || []
    total.value = res.data?.total || 0
  } catch {
    logs.value = []
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.module = ''
  filters.action = ''
  dateRange.value = []
  loadLogs()
}

const exportLogs = () => {
  const csv = ['操作人,模块,操作,目标,详情,IP,时间']
  logs.value.forEach(l => {
    csv.push(`${l.adminName || ''},${getModuleLabel(l.module)},${getActionLabel(l.action)},"${l.targetType || ''}:${l.targetId || ''}","${formatDetail(l.detail)}",${l.ip || ''},${l.createdAt || ''}`)
  })
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '操作日志.csv'
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  loadLogs()
})
</script>

<style scoped>
.page-container { padding: 24px; }
.detail-text { font-size: 13px; color: #64748b; }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 16px; border: 1px solid rgba(255,255,255,0.8); }
</style>
