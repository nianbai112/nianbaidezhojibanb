<template>
  <div class="page-container">
    <PageHeader title="登录日志" subtitle="查看管理员登录日志，监控异常登录" icon="Key">
      <template #actions>
        <el-button :loading="loading" @click="loadLogs(true)">刷新</el-button>
      </template>
    </PageHeader>

    <SearchPanel @search="loadLogs" @reset="resetFilters">
      <el-input v-model="filters.keyword" placeholder="搜索账号/IP" clearable style="width: 200px" />
      <el-select v-model="filters.success" placeholder="状态" clearable style="width: 120px">
        <el-option label="成功" :value="true" />
        <el-option label="失败" :value="false" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 240px" />
    </SearchPanel>

    <div class="glass-card" style="padding: 0;">
      <el-table :data="logs" v-loading="loading" border stripe>
        <el-table-column prop="adminName" label="账号" width="120" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'" size="small">{{ row.success ? '成功' : '失败' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="failReason" label="失败原因" min-width="150">
          <template #default="{ row }">{{ row.failReason || '-' }}</template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="120" />
        <el-table-column prop="userAgent" label="设备" min-width="200" show-overflow-tooltip />
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
import { ElMessage } from 'element-plus'
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
  success: undefined as boolean | undefined
})

const loadLogs = async (showSuccess = false) => {
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
    const res: any = await request.get('/admin/login-logs', { params })
    logs.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
    if (showSuccess === true) ElMessage.success('登录日志已刷新')
  } catch {
    logs.value = []
    ElMessage.error('加载登录日志失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.success = undefined
  dateRange.value = []
  loadLogs()
}

onMounted(() => {
  loadLogs()
})
</script>

<style scoped>
.page-container { padding: 24px; }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 16px; border: 1px solid rgba(255,255,255,0.8); }
</style>
