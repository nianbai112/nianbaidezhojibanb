<template>
  <div class="page-shell">
    <PageHeader title="异常中心" subtitle="监控平台异常情况，及时处理风险" icon="Warning" />

    <div class="summary-cards">
      <el-card v-for="card in summaryCards" :key="card.key" shadow="hover" class="summary-card">
        <div class="card-value" :style="{ color: card.color }">{{ card.value }}</div>
        <div class="card-label">{{ card.label }}</div>
      </el-card>
    </div>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filters" class="filter-form">
        <el-form-item label="异常类型">
          <el-select v-model="filters.type" clearable placeholder="全部" style="width: 140px">
            <el-option label="审核待处理" value="audit" />
            <el-option label="退款售后" value="refund" />
            <el-option label="提现待审" value="withdraw" />
            <el-option label="订单异常" value="order" />
            <el-option label="AI任务失败" value="ai_task" />
            <el-option label="系统错误" value="error_log" />
            <el-option label="高危操作" value="operation" />
          </el-select>
        </el-form-item>
        <el-form-item label="风险等级">
          <el-select v-model="filters.level" clearable placeholder="全部" style="width: 120px">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
            <el-option label="紧急" value="critical" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部" style="width: 120px">
            <el-option label="待处理" value="pending" />
            <el-option label="处理中" value="processing" />
            <el-option label="已处理" value="resolved" />
            <el-option label="已忽略" value="ignored" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadAlerts">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="alerts" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="type" label="异常类型" width="120">
          <template #default="{ row }">
            <el-tag :type="typeTagMap[row.type]" size="small">{{ typeLabelMap[row.type] || row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="风险等级" width="100">
          <template #default="{ row }">
            <el-tag :type="levelTagMap[row.level]" size="small" effect="dark">{{ levelLabelMap[row.level] || row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="异常标题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="region" label="关联区域" width="120">
          <template #default="{ row }">{{ row.region?.name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagMap[row.status]" size="small">{{ statusLabelMap[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="发生时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button-group size="small">
              <el-button v-if="row.status === 'pending'" type="success" @click="handleResolve(row)">处理</el-button>
              <el-button v-if="row.status === 'pending'" type="warning" @click="handleIgnore(row)">忽略</el-button>
              <el-button v-if="row.businessId" type="primary" @click="goBusiness(row)">查看</el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @change="loadAlerts"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const alerts = ref<any[]>([])
const summary = ref<any>({})
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const filters = reactive({ type: '', level: '', status: '' })

const summaryCards = ref([
  { key: 'pendingAlertCount', label: '待处理异常', value: 0, color: '#e6a23c' },
  { key: 'highRiskAlertCount', label: '高风险异常', value: 0, color: '#f56c6c' },
  { key: 'pendingAuditCount', label: '待审核帖子', value: 0, color: '#409eff' },
  { key: 'pendingRefundCount', label: '待处理退款', value: 0, color: '#e6a23c' },
  { key: 'pendingWithdrawCount', label: '待审核提现', value: 0, color: '#67c23a' },
  { key: 'errorLogCount', label: '今日错误日志', value: 0, color: '#f56c6c' },
])

const typeLabelMap: Record<string, string> = {
  audit: '审核待处理', refund: '退款售后', withdraw: '提现待审', order: '订单异常',
  ai_task: 'AI任务失败', error_log: '系统错误', operation: '高危操作',
}
const typeTagMap: Record<string, string> = {
  audit: '', refund: 'warning', withdraw: 'success', order: 'danger',
  ai_task: 'info', error_log: 'danger', operation: 'warning',
}
const levelLabelMap: Record<string, string> = { low: '低', medium: '中', high: '高', critical: '紧急' }
const levelTagMap: Record<string, string> = { low: 'info', medium: '', high: 'warning', critical: 'danger' }
const statusLabelMap: Record<string, string> = { pending: '待处理', processing: '处理中', resolved: '已处理', ignored: '已忽略' }
const statusTagMap: Record<string, string> = { pending: 'warning', processing: '', resolved: 'success', ignored: 'info' }

function formatTime(t: string) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN')
}

async function loadSummary() {
  try {
    const res: any = await request.get('/admin/ops/alerts/summary')
    summary.value = res
    summaryCards.value.forEach(c => { c.value = res[c.key] ?? 0 })
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function loadAlerts() {
  loading.value = true
  try {
    const params = { ...filters, page: pagination.page, pageSize: pagination.pageSize }
    const res: any = await request.get('/admin/ops/alerts', { params })
    alerts.value = res.list || []
    pagination.total = res.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
    alerts.value = []
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.type = ''
  filters.level = ''
  filters.status = ''
  pagination.page = 1
  loadAlerts()
}

async function handleResolve(row: any) {
  try {
    const { value } = await ElMessageBox.prompt('请输入处理备注', '处理异常', {
      inputPlaceholder: '处理备注（可选）',
      confirmButtonText: '确认处理',
      cancelButtonText: '取消',
    })
    await request.post(`/admin/ops/alerts/${row.id}/resolve`, { note: value })
    ElMessage.success('已处理')
    loadAlerts()
    loadSummary()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

async function handleIgnore(row: any) {
  try {
    const { value } = await ElMessageBox.prompt('请输入忽略原因', '忽略异常', {
      inputPlaceholder: '忽略原因（可选）',
      confirmButtonText: '确认忽略',
      cancelButtonText: '取消',
    })
    await request.post(`/admin/ops/alerts/${row.id}/ignore`, { reason: value })
    ElMessage.success('已忽略')
    loadAlerts()
    loadSummary()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

function goBusiness(row: any) {
  ElMessage.info(`跳转到业务: ${row.businessId}`)
}

onMounted(() => {
  loadSummary()
  loadAlerts()
})
</script>

<style scoped>
.page-shell { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.summary-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.summary-card { text-align: center; }
.card-value { font-size: 28px; font-weight: 700; line-height: 1.2; }
.card-label { font-size: 13px; color: #666; margin-top: 4px; }
.filter-card { margin-bottom: 0; }
.filter-form { display: flex; flex-wrap: wrap; gap: 8px; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
