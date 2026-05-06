<template>
  <div class="page-container">
    <div class="page-title mb-4">订单管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="5">
          <a-select v-model:value="filters.activityId" placeholder="选择活动" allow-clear show-search option-filter-prop="label" @change="fetchList">
            <a-select-option v-for="a in activities" :key="a.id" :value="a.id" :label="a.title">{{ a.title }}</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3"><a-input v-model:value="filters.orderNo" placeholder="订单号" allow-clear @change="fetchList" /></a-col>
        <a-col :span="3">
          <a-select v-model:value="filters.orderStatus" placeholder="订单状态" allow-clear @change="fetchList">
            <a-select-option value="pending">待支付</a-select-option>
            <a-select-option value="paid">已支付</a-select-option>
            <a-select-option value="cancelled">已取消</a-select-option>
            <a-select-option value="completed">已完成</a-select-option>
            <a-select-option value="refunded">已退款</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filters.payStatus" placeholder="支付状态" allow-clear @change="fetchList">
            <a-select-option value="unpaid">未支付</a-select-option>
            <a-select-option value="paid">已支付</a-select-option>
            <a-select-option value="refunded">已退款</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3"><a-input v-model:value="filters.keyword" placeholder="搜索用户/订单号" allow-clear @change="fetchList" /></a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'user'">
          <a-space><a-avatar :src="record.user?.avatar" size="small" /><span>{{ record.user?.nickname || '-' }}</span></a-space>
        </template>
        <template v-else-if="column.dataIndex === 'payStatus'">
          <a-tag :color="record.payStatus === 'paid' ? 'success' : record.payStatus === 'refunded' ? 'warning' : 'default'">{{ payStatusMap[record.payStatus] || record.payStatus }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'orderStatus'">
          <a-tag :color="orderStatusColor[record.orderStatus]">{{ orderStatusMap[record.orderStatus] || record.orderStatus }}</a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a @click="openDetail(record)">详情</a>
            <a v-if="record.refundStatus && record.refundStatus !== 'approved' && record.refundStatus !== 'rejected'" v-permission="'activity:audit'" @click="openRefundAudit(record)">退款审核</a>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- Detail Drawer -->
    <a-drawer v-model:open="detailVisible" title="订单详情" width="500">
      <div v-if="detailOrder">
        <a-descriptions :column="1" size="small" bordered>
          <a-descriptions-item label="订单号">{{ detailOrder.orderNo }}</a-descriptions-item>
          <a-descriptions-item label="用户">{{ detailOrder.user?.nickname || '-' }}</a-descriptions-item>
          <a-descriptions-item label="活动">{{ detailOrder.activity?.title || '-' }}</a-descriptions-item>
          <a-descriptions-item label="套餐">{{ detailOrder.package?.name || '-' }}</a-descriptions-item>
          <a-descriptions-item label="数量">{{ detailOrder.quantity }}</a-descriptions-item>
          <a-descriptions-item label="金额">{{ detailOrder.amount }}</a-descriptions-item>
          <a-descriptions-item label="支付状态"><a-tag :color="detailOrder.payStatus === 'paid' ? 'success' : 'default'">{{ payStatusMap[detailOrder.payStatus] || detailOrder.payStatus }}</a-tag></a-descriptions-item>
          <a-descriptions-item label="订单状态"><a-tag :color="orderStatusColor[detailOrder.orderStatus]">{{ orderStatusMap[detailOrder.orderStatus] || detailOrder.orderStatus }}</a-tag></a-descriptions-item>
          <a-descriptions-item v-if="detailOrder.refundStatus" label="退款状态">{{ detailOrder.refundStatus }}</a-descriptions-item>
          <a-descriptions-item v-if="detailOrder.refundReason" label="退款原因">{{ detailOrder.refundReason }}</a-descriptions-item>
          <a-descriptions-item label="支付时间">{{ detailOrder.payTime || '-' }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ detailOrder.createdAt }}</a-descriptions-item>
        </a-descriptions>
        <a-divider>票券信息</a-divider>
        <a-table :dataSource="detailOrder.tickets || []" :columns="ticketColumns" rowKey="id" size="small" :pagination="false" />
      </div>
    </a-drawer>

    <!-- Refund Audit Modal -->
    <a-modal v-model:open="refundVisible" title="退款审核" @ok="handleRefundAudit" :confirmLoading="auditing">
      <a-form :model="refundForm" :label-col="{ span: 5 }">
        <a-form-item label="审核结果"><a-radio-group v-model:value="refundForm.status"><a-radio value="approved">批准</a-radio><a-radio value="rejected">拒绝</a-radio></a-radio-group></a-form-item>
        <a-form-item label="原因"><a-textarea v-model:value="refundForm.reason" :rows="2" placeholder="审核原因" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { activityApi } from '@/api/activity'

const route = useRoute()
const loading = ref(false)
const auditing = ref(false)
const detailVisible = ref(false)
const refundVisible = ref(false)
const activities = ref<any[]>([])
const list = ref<any[]>([])
const detailOrder = ref<any>(null)
const currentOrder = ref<any>(null)
const filters = reactive({
  activityId: (route.query.activityId as string) || undefined,
  orderNo: '', orderStatus: undefined as string | undefined,
  payStatus: undefined as string | undefined, keyword: '',
})
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })
const refundForm = reactive({ status: 'approved', reason: '' })

const payStatusMap: Record<string, string> = { unpaid: '未支付', paid: '已支付', refunded: '已退款' }
const orderStatusMap: Record<string, string> = { pending: '待支付', paid: '已支付', cancelled: '已取消', completed: '已完成', refunded: '已退款' }
const orderStatusColor: Record<string, string> = { pending: 'default', paid: 'processing', cancelled: 'error', completed: 'success', refunded: 'warning' }

const columns = [
  { title: '订单号', dataIndex: 'orderNo', width: 180 },
  { title: '用户', dataIndex: 'user', width: 120 },
  { title: '活动', dataIndex: 'activity', width: 120 },
  { title: '套餐', dataIndex: 'package', width: 100 },
  { title: '数量', dataIndex: 'quantity', width: 50 },
  { title: '金额', dataIndex: 'amount', width: 70 },
  { title: '支付', dataIndex: 'payStatus', width: 70 },
  { title: '状态', dataIndex: 'orderStatus', width: 70 },
  { title: '支付时间', dataIndex: 'payTime', width: 150 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

const ticketColumns = [
  { title: '票号', dataIndex: 'ticketNumber', width: 120 },
  { title: '状态', dataIndex: 'ticketStatus', width: 80 },
  { title: '核验时间', dataIndex: 'checkInTime', width: 150 },
]

const fetchActivities = async () => {
  const res = await activityApi.getActivities({ page: 1, pageSize: 100 })
  activities.value = (res.data as any).list || []
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await activityApi.getActivityOrders({
      page: pagination.current, pageSize: pagination.pageSize,
      activityId: filters.activityId,
      orderNo: filters.orderNo || undefined,
      orderStatus: filters.orderStatus,
      payStatus: filters.payStatus,
      keyword: filters.keyword || undefined,
    })
    const data = res.data as any
    list.value = data.list || []
    pagination.total = data.total || 0
  } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; fetchList() }

const openDetail = async (record: any) => {
  try {
    const res = await activityApi.getActivityOrderDetail(record.id)
    detailOrder.value = res.data
    detailVisible.value = true
  } catch {}
}

const openRefundAudit = (record: any) => {
  currentOrder.value = record
  refundForm.status = 'approved'
  refundForm.reason = ''
  refundVisible.value = true
}

const handleRefundAudit = async () => {
  auditing.value = true
  try {
    await activityApi.auditOrderRefund(currentOrder.value.id, { status: refundForm.status, reason: refundForm.reason || undefined })
    message.success(refundForm.status === 'approved' ? '退款已批准' : '退款已拒绝')
    refundVisible.value = false
    fetchList()
  } finally { auditing.value = false }
}

onMounted(() => { fetchActivities(); fetchList() })
</script>
