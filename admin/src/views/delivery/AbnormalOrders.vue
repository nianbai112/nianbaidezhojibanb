<template>
  <div class="page-shell">
    <PageHeader title="异常订单" subtitle="处理异常配送订单" icon="Warning" />
    <div class="filter-bar">
      <el-button type="primary" @click="loadData">刷新</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="orderNo" label="订单号" width="200" show-overflow-tooltip />
      <el-table-column prop="orderType" label="来源" width="90">
        <template #default="{ row }">{{ row.orderType === 'shop' ? '外卖配送' : '跑腿配送' }}</template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="150" show-overflow-tooltip />
      <el-table-column prop="user.nickname" label="用户" width="100">
        <template #default="{ row }">{{ row.user?.nickname || row.userId }}</template>
      </el-table-column>
      <el-table-column prop="price" label="金额" width="100">
        <template #default="{ row }">¥{{ Number(row.price).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag type="danger" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="abnormalReason" label="异常原因" min-width="260">
        <template #default="{ row }">
          <div class="risk-list">
            <div v-for="event in row.openRiskEvents || []" :key="event.id" class="risk-item">
              <el-tag :type="event.eventLevel === 'critical' ? 'danger' : event.eventLevel === 'error' ? 'warning' : 'info'" size="small">
                {{ riskTypeMap[event.eventType] || event.eventType }}
              </el-tag>
              <span>{{ event.description }}</span>
              <span class="risk-actions">
                <el-button link type="success" @click="handleRisk(event.id, 'release')">审核放行</el-button>
                <el-button link type="danger" @click="handleRisk(event.id, 'reject')">拒绝结算</el-button>
              </span>
            </div>
            <span v-if="!(row.openRiskEvents || []).length">{{ row.abnormalReason || '-' }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="下单时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { handleErrandRiskEvent } from '@/api/errand'

const statusMap: Record<string, string> = {
  CANCELLED: '已取消',
  REFUNDING: '退款中',
  REFUNDED: '已退款',
  PENDING_PAY: '待付款',
  pending_pay: '待付款',
  pending_accept: '待接单',
  accepted: '已接单',
  in_progress: '进行中',
  arrived: '已到达',
  refunding: '退款中',
  refunded: '已退款',
  cancelled: '已取消',
  SHIPPED: '配送中',
  RECEIVED: '已送达',
}
const riskTypeMap: Record<string, string> = {
  unaccepted_timeout: '长时间无人接单',
  delivery_overdue: '履约超时',
  refund_failed: '退款失败',
  partial_refund_settlement_review: '部分退款收益复核',
  marketing_related_account_assignment_attempt: '营销关联账号',
  marketing_shared_device_and_ip: '营销设备与网络关联',
  marketing_shared_device_or_ip: '营销弱关联提示',
  self_assignment_attempt: '本人接单',
  auto_receipt_hold_48h: '自动确认长时间阻塞',
  merchant_delay: '商家出餐延迟',
  cannot_contact: '无法联系用户',
  address_issue: '地址问题',
  vehicle_issue: '车辆故障',
  other: '其他异常',
}
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/errand/abnormal-orders', { params: { page: page.value, pageSize: pageSize.value } })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') } finally { loading.value = false }
}

const handleRisk = async (id: string, resolution: 'release' | 'reject') => {
  try {
    const { value } = await ElMessageBox.prompt(
      resolution === 'release' ? '请填写审核放行依据' : '请填写拒绝结算原因',
      resolution === 'release' ? '审核放行' : '拒绝结算',
      { inputValidator: value => !!String(value || '').trim() || '处置说明不能为空' },
    )
    await handleErrandRiskEvent(id, resolution, String(value).trim())
    ElMessage.success(resolution === 'release' ? '已提交放行复核' : '已拒绝结算')
    await loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '处理失败')
  }
}

onMounted(() => loadData())
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.risk-list { display: grid; gap: 8px; }
.risk-item { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; }
.risk-actions { display: inline-flex; white-space: nowrap; }
</style>
