<template>
  <div class="page-shell">
    <PageHeader title="售后处理" subtitle="先核对订单与履约证据，再处理退款申请" icon="Money" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索退款单号/订单号" clearable style="width: 240px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="待处理" value="pending" />
        <el-option label="处理中" value="processing" />
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="refundNo" label="退款单号" width="180" show-overflow-tooltip />
      <el-table-column prop="paymentNo" label="支付单号" width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.paymentNo || row.payment?.orderNo || '-' }}</template>
      </el-table-column>
      <el-table-column prop="orderNo" label="订单号" width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.orderNo || row.bizOrderNo || '-' }}</template>
      </el-table-column>
      <el-table-column prop="userName" label="用户" width="120">
        <template #default="{ row }">{{ row.userName || row.user?.nickname || row.userId || '-' }}</template>
      </el-table-column>
      <el-table-column prop="merchantName" label="商家" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.merchantName || row.merchant?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="amount" label="金额" width="100">
        <template #default="{ row }">¥{{ (Number(row.amount || 0) / 100).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.status] || 'info'" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="refundedAt" label="处理时间" width="170">
        <template #default="{ row }">{{ formatDate(row.refundedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="270" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.bizType === 'order' && row.bizId" link type="primary" @click="viewOrderEvidence(row)">履约证据</el-button>
          <template v-if="row.status === 'pending'">
            <el-button size="small" type="success" @click="approve(row)">同意</el-button>
            <el-button size="small" type="danger" @click="reject(row)">拒绝</el-button>
          </template>
          <el-button v-if="row.status === 'processing'" size="small" type="primary" @click="complete(row)">完成</el-button>
          <span v-if="row.status === 'success' || row.status === 'failed'">-</span>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { getRefunds, approveRefund, rejectRefund, completeRefund } from '@/api/merchant'
import { ElMessage, ElMessageBox } from 'element-plus'

const statusMap: Record<string, string> = { pending: '待处理', processing: '处理中', success: '成功', failed: '失败' }
const statusTypeMap: Record<string, string> = { pending: 'warning', processing: 'primary', success: 'success', failed: 'danger' }
const route = useRoute()
const router = useRouter()

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: String(route.query.keyword || ''), status: '' })

const formatDate = (d: any) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getRefunds({ page: page.value, pageSize: pageSize.value, ...filters })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载退款列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '' })
  page.value = 1
  loadData()
}

const viewOrderEvidence = (row: any) => router.push({ path: '/order/center', query: { focusId: row.bizId, orderType: 'order' } })

const approve = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定同意该退款申请？', '确认', { type: 'warning' })
    await approveRefund(row.id)
    ElMessage.success('已同意')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

const reject = async (row: any) => {
  try {
    const { value: remark } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝退款', { inputPlaceholder: '拒绝原因', type: 'warning' })
    await rejectRefund(row.id, remark)
    ElMessage.success('已拒绝')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

const complete = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定标记该退款为已完成？', '确认', { type: 'warning' })
    await completeRefund(row.id)
    ElMessage.success('已完成')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

onMounted(() => loadData())
watch(() => route.query.keyword, (keyword) => {
  filters.keyword = String(keyword || '')
  page.value = 1
  loadData()
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
