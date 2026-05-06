<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:180px" :options="regionOpts" :field-names="{ value: 'id', label: 'name' }" show-search option-filter-prop="name" />
      <a-input v-model:value="filter.orderNo" placeholder="订单号" allow-clear style="width:180px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="pending_pay">待支付</a-select-option>
        <a-select-option value="paid">已支付</a-select-option>
        <a-select-option value="completed">已完成</a-select-option>
        <a-select-option value="refunding">退款中</a-select-option>
        <a-select-option value="refunded">已退款</a-select-option>
        <a-select-option value="cancelled">已取消</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" value-format="YYYY-MM-DD" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">订单管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #user="{ record }">
          <a-space v-if="record.User">
            <a-avatar :src="record.User.avatar" :size="24" />
            <span>{{ record.User.nickname }}</span>
          </a-space>
          <span v-else>-</span>
        </template>
        <template #package="{ record }">{{ record.Package?.name || '-' }}</template>
        <template #amount="{ record }">¥{{ record.amount }}</template>
        <template #verifyStatus="{ record }">
          <a-tag v-if="record.verifyStatus === 'verified'" color="green">已核销</a-tag>
          <a-tag v-else-if="record.status === 'paid'" color="orange">待核销</a-tag>
          <span v-else style="color:#ccc">-</span>
        </template>
        <template #status="{ record }">
          <a-tag :color="statusColor(record.status)">{{ statusText(record.status) }}</a-tag>
        </template>
        <template #action="{ record }">
          <a-space>
            <a @click="onDetail(record)">详情</a>
            <a v-if="record.status === 'paid' && record.verifyStatus !== 'verified'" @click="onVerify(record)">核销</a>
            <a v-if="['paid', 'completed'].includes(record.status) && record.verifyStatus !== 'verified'" style="color:#ff4f4f" @click="onRefund(record)">退款</a>
          </a-space>
        </template>
      </DataTable>
    </div>

    <!-- 订单详情抽屉 -->
    <a-drawer v-model:open="detailVisible" title="订单详情" :width="480">
      <a-descriptions v-if="detail" :column="1" size="small" bordered>
        <a-descriptions-item label="订单号">{{ detail.orderNo }}</a-descriptions-item>
        <a-descriptions-item label="用户">{{ detail.User?.nickname }} ({{ detail.User?.phone || '-' }})</a-descriptions-item>
        <a-descriptions-item label="套餐">{{ detail.Package?.name }}</a-descriptions-item>
        <a-descriptions-item label="数量">{{ detail.quantity }}</a-descriptions-item>
        <a-descriptions-item label="金额">¥{{ detail.amount }}</a-descriptions-item>
        <a-descriptions-item label="支付渠道">{{ detail.payChannel || '-' }}</a-descriptions-item>
        <a-descriptions-item label="支付时间">{{ detail.payTime || '-' }}</a-descriptions-item>
        <a-descriptions-item label="状态"><a-tag :color="statusColor(detail.status)">{{ statusText(detail.status) }}</a-tag></a-descriptions-item>
        <a-descriptions-item label="核销码">{{ detail.verifyCode || '-' }}</a-descriptions-item>
        <a-descriptions-item label="核销状态"><a-tag v-if="detail.verifyStatus === 'verified'" color="green">已核销</a-tag><span v-else>待核销</span></a-descriptions-item>
        <a-descriptions-item v-if="detail.verifyTime" label="核销时间">{{ detail.verifyTime }}</a-descriptions-item>
        <a-descriptions-item v-if="detail.refundReason" label="退款原因">{{ detail.refundReason }}</a-descriptions-item>
        <a-descriptions-item v-if="detail.refundAmount" label="退款金额">¥{{ detail.refundAmount }}</a-descriptions-item>
        <a-descriptions-item label="买家人">{{ detail.buyerName || '-' }}</a-descriptions-item>
        <a-descriptions-item label="买家电话">{{ detail.buyerPhone || '-' }}</a-descriptions-item>
        <a-descriptions-item label="下单时间">{{ detail.createdAt }}</a-descriptions-item>
      </a-descriptions>
    </a-drawer>

    <!-- 核销 Modal -->
    <a-modal v-model:open="verifyVisible" title="核销订单" :confirm-loading="verifyLoading" @ok="onVerifySubmit">
      <a-form layout="vertical">
        <a-form-item label="订单号"><strong>{{ verifyRecord?.orderNo }}</strong></a-form-item>
        <a-form-item label="套餐">{{ verifyRecord?.Package?.name }}</a-form-item>
        <a-form-item label="核销码" required>
          <a-input v-model:value="verifyCode" placeholder="请输入核销码" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 退款 Modal -->
    <a-modal v-model:open="refundVisible" title="退款" :confirm-loading="refundLoading" @ok="onRefundSubmit">
      <a-form layout="vertical">
        <a-form-item label="订单号"><strong>{{ refundRecord?.orderNo }}</strong></a-form-item>
        <a-form-item label="套餐">{{ refundRecord?.Package?.name }}</a-form-item>
        <a-form-item label="支付金额">¥{{ refundRecord?.amount }}</a-form-item>
        <a-form-item label="退款金额 (元)">
          <a-input-number v-model:value="refundAmount" :min="0" :precision="2" style="width:100%" />
        </a-form-item>
        <a-form-item label="退款原因" required>
          <a-textarea v-model:value="refundReason" placeholder="请输入退款原因" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { groupBuyApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { shopApi } from '@/api/shop'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const userStore = useUserStore()
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ regionId: userStore.regionId || undefined as string | undefined, orderNo: '', status: undefined as string | undefined, dateRange: undefined as [string, string] | undefined })
const regionOpts = ref<any[]>([])

const columns = [
  { title: '订单号', dataIndex: 'orderNo', width: 180 },
  { title: '用户', dataIndex: 'User', width: 140, slot: 'user' },
  { title: '套餐', dataIndex: 'Package', width: 150, slot: 'package' },
  { title: '数量', dataIndex: 'quantity', width: 60 },
  { title: '金额', dataIndex: 'amount', width: 90, slot: 'amount' },
  { title: '核销码', dataIndex: 'verifyCode', width: 90 },
  { title: '核销', dataIndex: 'verifyStatus', width: 80, slot: 'verifyStatus' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '下单时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action', fixed: 'right' },
]

const statusMap: Record<string, { color: string; text: string }> = {
  pending_pay: { color: 'orange', text: '待支付' },
  paid: { color: 'blue', text: '已支付' },
  completed: { color: 'green', text: '已完成' },
  refunding: { color: 'purple', text: '退款中' },
  refunded: { color: 'default', text: '已退款' },
  cancelled: { color: 'red', text: '已取消' },
}

function statusColor(s: string) { return statusMap[s]?.color || 'default' }
function statusText(s: string) { return statusMap[s]?.text || s }

async function fetchList() {
  loading.value = true
  try {
    const params: any = {
      page: page.value, pageSize: pageSize.value,
      regionId: filter.regionId,
      orderNo: filter.orderNo || undefined,
      status: filter.status,
    }
    if (filter.dateRange?.length === 2) {
      params.startAt = filter.dateRange[0]
      params.endAt = filter.dateRange[1]
    }
    const res = await groupBuyApi.getOrders(params)
    list.value = res.data?.list || []
    total.value = res.data?.total || 0
  } finally { loading.value = false }
}

async function loadRegions() {
  try {
    const res = await shopApi.getMerchantList({ page: 1, pageSize: 1000 })
    const merchants = (res.data?.data?.list || res.data?.list || []) as any[]
    const map = new Map<string, any>()
    merchants.forEach((m: any) => { if (m.regionId && !map.has(m.regionId)) map.set(m.regionId, { id: m.regionId, name: m.regionName || m.regionId }) })
    regionOpts.value = Array.from(map.values())
  } catch { /* ignore */ }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.regionId = undefined; filter.orderNo = ''; filter.status = undefined; filter.dateRange = undefined; onSearch() }

// Detail
const detailVisible = ref(false)
const detail = ref<any>(null)

async function onDetail(record: any) {
  try {
    const res = await groupBuyApi.getOrderDetail(record.id)
    detail.value = res.data || record
  } catch { detail.value = record }
  detailVisible.value = true
}

// Verify
const verifyVisible = ref(false)
const verifyLoading = ref(false)
const verifyRecord = ref<any>(null)
const verifyCode = ref('')

function onVerify(record: any) {
  verifyRecord.value = record
  verifyCode.value = ''
  verifyVisible.value = true
}

async function onVerifySubmit() {
  if (!verifyRecord.value || !verifyCode.value) return message.warning('请输入核销码')
  verifyLoading.value = true
  try {
    await groupBuyApi.verifyOrder(verifyRecord.value.id, verifyCode.value)
    message.success('核销成功')
    verifyVisible.value = false
    fetchList()
  } finally { verifyLoading.value = false }
}

// Refund
const refundVisible = ref(false)
const refundLoading = ref(false)
const refundRecord = ref<any>(null)
const refundAmount = ref(0)
const refundReason = ref('')

function onRefund(record: any) {
  refundRecord.value = record
  refundAmount.value = Number(record.amount) || 0
  refundReason.value = ''
  refundVisible.value = true
}

async function onRefundSubmit() {
  if (!refundRecord.value || !refundReason.value) return message.warning('请输入退款原因')
  refundLoading.value = true
  try {
    await groupBuyApi.refundOrder(refundRecord.value.id, { reason: refundReason.value, amount: refundAmount.value })
    message.success('退款已处理')
    refundVisible.value = false
    fetchList()
  } finally { refundLoading.value = false }
}

loadRegions()
fetchList()
</script>
