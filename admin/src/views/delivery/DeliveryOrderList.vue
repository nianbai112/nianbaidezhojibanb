<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.orderNo" placeholder="订单号" allow-clear style="width:180px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:130px">
        <a-select-option value="waiting_accept">待接单</a-select-option>
        <a-select-option value="accepted">已接单</a-select-option>
        <a-select-option value="picked_up">已取件</a-select-option>
        <a-select-option value="delivering">配送中</a-select-option>
        <a-select-option value="completed">已完成</a-select-option>
        <a-select-option value="cancelled">已取消</a-select-option>
        <a-select-option value="refunded">已退款</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" />
    </FilterBar>

    <div class="page-card">
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize">
        <template #status="{ record }"><StatusTag :status="record.status" type="delivery" /></template>
        <template #fee="{ record }">{{ (Number(record.fee) / 100).toFixed(2) }}</template>
        <template #action="{ record }">
          <a-space>
            <a @click="$router.push(`/delivery/order/${record.id}`)">详情</a>
            <a v-if="record.status === 'waiting_accept'" @click="onOpenAssign(record)">派单</a>
            <a-popconfirm v-if="['waiting_accept', 'accepted'].includes(record.status)" title="确认取消该订单？" ok-text="确认" cancel-text="取消" @confirm="onCancel(record)">
              <a style="color:#ef4444">取消</a>
            </a-popconfirm>
            <a v-if="record.status === 'completed'" style="color:#1677ff" @click="onRefund(record)">退款</a>
          </a-space>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="assignModal.visible" title="分配骑手" width="400px" :confirm-loading="assignModal.loading" @ok="onAssignSubmit">
      <a-select v-model:value="assignModal.riderId" placeholder="搜索选择骑手" show-search :filter-option="false" style="width:100%" :options="riderOpts" :field-names="{ value: 'id', label: 'name' }" @search="onSearchRider" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { deliveryApi } from '@/api/delivery'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ orderNo: '', status: undefined as string | undefined, dateRange: undefined as any })

const columns = [
  { title: '订单号', dataIndex: 'orderNo', width: 180 },
  { title: '用户', dataIndex: 'userNickname', width: 100 },
  { title: '取件地址', dataIndex: 'pickupAddress', width: 200, ellipsis: true },
  { title: '送件地址', dataIndex: 'deliveryAddress', width: 200, ellipsis: true },
  { title: '距离(米)', dataIndex: 'distance', width: 90 },
  { title: '费用', dataIndex: 'fee', width: 90, slot: 'fee' },
  { title: '骑手', dataIndex: 'riderName', width: 90 },
  { title: '状态', dataIndex: 'status', width: 90, slot: 'status' },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 160, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (filter.orderNo) params.orderNo = filter.orderNo
    if (filter.status) params.status = filter.status
    if (filter.dateRange) {
      params.startDate = filter.dateRange[0]?.format('YYYY-MM-DD HH:mm:ss')
      params.endDate = filter.dateRange[1]?.format('YYYY-MM-DD HH:mm:ss')
    }
    const res = await deliveryApi.getOrderList(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.orderNo = ''; filter.status = undefined; filter.dateRange = undefined; onSearch() }

async function onCancel(record: any) {
  try {
    await deliveryApi.cancelOrder(record.id, { reason: '管理员取消' })
    message.success('已取消')
    fetchList()
  } catch { message.error('取消失败') }
}

async function onRefund(record: any) {
  try {
    await deliveryApi.cancelOrder(record.id, { reason: '管理员退款' })
    message.success('已发起退款')
    fetchList()
  } catch { message.error('退款失败') }
}

// ---- 派单 modal ----
const assignModal = reactive({ visible: false, loading: false, riderId: '', targetId: '' })
const riderOpts = ref<any[]>([])

function onOpenAssign(record: any) {
  assignModal.targetId = record.id
  assignModal.riderId = ''
  riderOpts.value = []
  assignModal.visible = true
}

async function onSearchRider(keyword: string) {
  if (!keyword) { riderOpts.value = []; return }
  try {
    const res = await deliveryApi.getRiderList({ page: 1, pageSize: 20, keyword, auditStatus: 'approved' })
    const riders = (res.data?.data?.list || res.data?.list || []) as any[]
    riderOpts.value = riders.map((r: any) => ({ id: r.userId || r.id, name: `${r.realName || r.User?.nickname} ${r.phone}` }))
  } catch { /* ignore */ }
}

async function onAssignSubmit() {
  if (!assignModal.riderId) { message.warning('请选择骑手'); return }
  assignModal.loading = true
  try {
    await deliveryApi.assignOrder(assignModal.targetId, { riderId: assignModal.riderId })
    message.success('派单成功')
    assignModal.visible = false
    fetchList()
  } catch { message.error('派单失败') }
  finally { assignModal.loading = false }
}

fetchList()
</script>
