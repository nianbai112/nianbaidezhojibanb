<template>
  <div class="page-shell">
    <PageHeader title="骑手结算" subtitle="管理骑手结算记录，支持生成、确认、打款、驳回" icon="Van" />

    <div class="summary-grid">
      <el-card shadow="never">
        <div class="summary-label">未结算骑手收益</div>
        <div class="summary-value">¥{{ Number(pendingSummary.amount || 0).toFixed(2) }}</div>
        <div class="summary-sub">{{ pendingSummary.orderCount || 0 }} 单 / {{ pendingSummary.riderCount || 0 }} 位骑手</div>
      </el-card>
      <el-card shadow="never">
        <div class="summary-label">待确认结算单</div>
        <div class="summary-value">{{ pendingCount }}</div>
        <div class="summary-sub">生成后需要财务确认</div>
      </el-card>
      <el-card shadow="never">
        <div class="summary-label">已打款结算单</div>
        <div class="summary-value">{{ paidCount }}</div>
        <div class="summary-sub">打款后写入骑手钱包流水</div>
      </el-card>
    </div>

    <div class="filter-bar">
      <el-select v-model="filters.status" placeholder="状态筛选" clearable style="width: 140px" @change="loadData">
        <el-option label="待确认" value="PENDING" />
        <el-option label="已确认" value="CONFIRMED" />
        <el-option label="已打款" value="PAID" />
        <el-option label="已驳回" value="REJECTED" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 260px" @change="loadData" />
      <el-button type="primary" @click="loadData" :loading="loading">刷新</el-button>
      <el-button type="success" @click="openGenerateDialog">按未结算订单生成</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border stripe empty-text="暂无结算记录">
      <el-table-column prop="settlementNo" label="结算单号" width="200" />
      <el-table-column label="骑手" width="120">
        <template #default="{ row }">{{ row.riderName || row.rider?.nickname || row.riderId }}</template>
      </el-table-column>
      <el-table-column prop="orderCount" label="订单数" width="80" align="center" />
      <el-table-column label="配送费" width="100" align="right">
        <template #default="{ row }">¥{{ Number(row.deliveryFeeTotal).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="奖励" width="80" align="right">
        <template #default="{ row }">¥{{ Number(row.rewardAmount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="扣款" width="80" align="right">
        <template #default="{ row }">¥{{ Number(row.penaltyAmount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="应付金额" width="100" align="right">
        <template #default="{ row }"><b>¥{{ Number(row.payableAmount).toFixed(2) }}</b></template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="结算周期" width="200">
        <template #default="{ row }">{{ formatDate(row.periodStart) }} ~ {{ formatDate(row.periodEnd) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="viewDetail(row.id)">详情</el-button>
          <el-button v-if="row.status === 'PENDING'" link type="success" @click="confirmSettlement(row.id)">确认</el-button>
          <el-button v-if="row.status === 'CONFIRMED'" link type="warning" @click="paySettlement(row.id)">打款</el-button>
          <el-button v-if="row.status === 'PENDING' || row.status === 'CONFIRMED'" link type="danger" @click="rejectSettlement(row.id)">驳回</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>

    <el-drawer v-model="drawerVisible" title="结算详情" size="600px">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="结算单号">{{ detail.settlementNo }}</el-descriptions-item>
          <el-descriptions-item label="骑手">{{ detail.riderName || detail.rider?.nickname }}</el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag :type="statusTagType(detail.status)">{{ statusMap[detail.status] || detail.status }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="订单数">{{ detail.orderCount }}</el-descriptions-item>
          <el-descriptions-item label="配送费">¥{{ Number(detail.deliveryFeeTotal).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="奖励">¥{{ Number(detail.rewardAmount).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="扣款">¥{{ Number(detail.penaltyAmount).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="应付金额"><b>¥{{ Number(detail.payableAmount).toFixed(2) }}</b></el-descriptions-item>
          <el-descriptions-item label="结算周期" :span="2">{{ formatDate(detail.periodStart) }} ~ {{ formatDate(detail.periodEnd) }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.remark" label="备注" :span="2">{{ detail.remark }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.rejectReason" label="驳回原因" :span="2">{{ detail.rejectReason }}</el-descriptions-item>
        </el-descriptions>

        <h4 style="margin: 16px 0 8px">配送订单明细</h4>
        <el-table :data="detail.orders || []" border size="small" empty-text="暂无订单明细">
          <el-table-column prop="orderNo" label="订单号" />
          <el-table-column prop="title" label="标题" />
          <el-table-column label="配送费" width="80" align="right">
            <template #default="{ row }">¥{{ Number(row.price).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="小费" width="60" align="right">
            <template #default="{ row }">¥{{ Number(row.tip).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="完成时间" width="160">
            <template #default="{ row }">{{ row.completeTime ? new Date(row.completeTime).toLocaleString('zh-CN') : '-' }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>

    <el-dialog v-model="showGenerateDialog" title="生成骑手结算单" width="480px">
      <el-form label-width="80px">
        <el-form-item label="结算周期">
          <el-date-picker v-model="generateForm.periodStart" type="datetime" placeholder="开始时间" style="width: 180px" />
          <span style="margin: 0 8px">~</span>
          <el-date-picker v-model="generateForm.periodEnd" type="datetime" placeholder="结束时间" style="width: 180px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerateDialog = false">取消</el-button>
        <el-button type="primary" @click="doGenerate" :loading="generating">生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

const statusMap: Record<string, string> = { PENDING: '待确认', CONFIRMED: '已确认', PAID: '已打款', REJECTED: '已驳回' }
const statusTagType = (s: string) => s === 'PAID' ? 'success' : s === 'CONFIRMED' ? 'primary' : s === 'REJECTED' ? 'danger' : 'warning'

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const dateRange = ref<any>(null)
const filters = reactive({ status: '' })
const pendingSummary = ref<any>({})

const drawerVisible = ref(false)
const detail = ref<any>(null)

const showGenerateDialog = ref(false)
const generating = ref(false)
const defaultStart = () => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  d.setHours(0, 0, 0, 0)
  return d
}
const generateForm = reactive<any>({ periodStart: defaultStart(), periodEnd: new Date() })

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('zh-CN') : '-'
const pendingCount = computed(() => list.value.filter(item => item.status === 'PENDING').length)
const paidCount = computed(() => list.value.filter(item => item.status === 'PAID').length)

const loadPendingSummary = async () => {
  try {
    const res: any = await request.get('/admin/rider-settlements/pending-summary')
    pendingSummary.value = res?.data || res || {}
  } catch {
    pendingSummary.value = {}
  }
}

const openGenerateDialog = () => {
  generateForm.periodStart = defaultStart()
  generateForm.periodEnd = new Date()
  showGenerateDialog.value = true
}

import { formatDateRangeParams } from '@/utils/date'

const loadData = async () => {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (filters.status) params.status = filters.status
    if (dateRange.value?.length === 2) {
      const { startDate, endDate } = formatDateRangeParams(dateRange.value)
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
    }
    const res: any = await request.get('/admin/rider-settlements', { params })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const viewDetail = async (id: string) => {
  try {
    const res: any = await request.get(`/admin/rider-settlements/${id}`)
    detail.value = res?.data || res
    drawerVisible.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '加载详情失败')
  }
}

const confirmSettlement = async (id: string) => {
  try {
    await ElMessageBox.confirm('确认此结算单？', '确认操作')
    await request.put(`/admin/rider-settlements/${id}/confirm`, {})
    ElMessage.success('结算已确认')
    await Promise.all([loadData(), loadPendingSummary()])
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '确认失败')
  }
}

const paySettlement = async (id: string) => {
  try {
    await ElMessageBox.confirm('确认打款此结算单？将写入钱包流水。', '打款确认')
    await request.put(`/admin/rider-settlements/${id}/pay`, {})
    ElMessage.success('打款成功')
    await Promise.all([loadData(), loadPendingSummary()])
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '打款失败')
  }
}

const rejectSettlement = async (id: string) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回结算', { inputPattern: /.+/, inputErrorMessage: '驳回原因不能为空' })
    await request.put(`/admin/rider-settlements/${id}/reject`, { reason: value })
    ElMessage.success('已驳回')
    await Promise.all([loadData(), loadPendingSummary()])
  } catch (e: any) {
    if (e !== 'cancel' && e?.action !== 'cancel') ElMessage.error(e?.message || '驳回失败')
  }
}

const doGenerate = async () => {
  if (!generateForm.periodStart || !generateForm.periodEnd) {
    ElMessage.warning('请选择结算周期')
    return
  }
  generating.value = true
  try {
    const res: any = await request.post('/admin/rider-settlements/generate', {
      periodStart: generateForm.periodStart,
      periodEnd: generateForm.periodEnd,
    })
    ElMessage.success(res?.message || `成功生成 ${res?.count || 0} 条结算单`)
    showGenerateDialog.value = false
    await Promise.all([loadData(), loadPendingSummary()])
  } catch (e: any) {
    ElMessage.error(e?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

onMounted(() => Promise.all([loadData(), loadPendingSummary()]))
</script>

<style scoped>
.page-shell { padding: 24px; }
.summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
.summary-label { color: #667085; font-size: 13px; }
.summary-value { color: #101828; font-size: 26px; font-weight: 700; margin-top: 8px; }
.summary-sub { color: #98a2b3; font-size: 12px; margin-top: 6px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; align-items: center; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
