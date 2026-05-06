<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:130px">
        <a-select-option value="pending">待支付</a-select-option>
        <a-select-option value="paid">已支付</a-select-option>
        <a-select-option value="refunded">已退款</a-select-option>
      </a-select>
      <a-input v-model:value="filter.userId" placeholder="用户ID" allow-clear style="width:200px" />
      <a-input v-model:value="filter.orderNo" placeholder="订单号" allow-clear style="width:200px" />
      <a-range-picker v-model:value="filter.dateRange" value-format="YYYY-MM-DD" :placeholder="['开始日期','结束日期']" style="width:240px" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">订单管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #orderNo="{ record }">
          <span style="font-family:monospace;font-size:12px">{{ record.orderNo }}</span>
        </template>
        <template #user="{ record }">
          <a-space>
            <a-avatar :src="record.User?.avatar" :size="28" />
            <span>{{ record.User?.nickname || record.userId }}</span>
          </a-space>
        </template>
        <template #amount="{ record }">{{ fmt(record.amount) }}</template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'paid' ? 'green' : record.status === 'refunded' ? 'red' : record.status === 'pending' ? 'orange' : 'default'">
            {{ record.status === 'paid' ? '已支付' : record.status === 'refunded' ? '已退款' : record.status === 'pending' ? '待支付' : record.status }}
          </a-tag>
        </template>
        <template #action="{ record }">
          <a @click="onRefund(record)" v-if="record.status === 'paid'" style="color:#ef4444">退款</a>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="refundVisible" title="退款确认" @ok="onRefundSubmit" :confirm-loading="refundLoading">
      <a-form layout="vertical">
        <a-form-item label="退款原因" required>
          <a-textarea v-model:value="refundReason" :rows="3" placeholder="请输入退款原因" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { datingApi } from '@/api/dating'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ status: undefined as string | undefined, userId: '', orderNo: '', dateRange: undefined as [string, string] | undefined })

const columns = [
  { title: '订单号', dataIndex: 'orderNo', width: 180, slot: 'orderNo' },
  { title: '用户', dataIndex: 'user', width: 160, slot: 'user' },
  { title: '套餐', dataIndex: 'package', width: 130, format: (v: any) => v?.name || '-' },
  { title: '金额', dataIndex: 'amount', width: 90, slot: 'amount' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '支付方式', dataIndex: 'payChannel', width: 80, format: (v: any) => v || '-' },
  { title: '支付时间', dataIndex: 'payTime', width: 160 },
  { title: '操作', dataIndex: 'action', width: 70, slot: 'action', fixed: 'right' },
]

function fmt(v: any) { const n = Number(v); return Number.isNaN(n) ? '0.00' : n.toFixed(2) }

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, status: filter.status, userId: filter.userId || undefined, orderNo: filter.orderNo || undefined }
    if (filter.dateRange?.length === 2) {
      params.startDate = filter.dateRange[0]
      params.endDate = filter.dateRange[1]
    }
    const res = await datingApi.getOrderList(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.status = undefined; filter.userId = ''; filter.orderNo = ''; filter.dateRange = undefined; onSearch() }

const refundVisible = ref(false)
const refundId = ref('')
const refundReason = ref('')
const refundLoading = ref(false)

function onRefund(record: any) { refundId.value = record.id; refundReason.value = ''; refundVisible.value = true }

async function onRefundSubmit() {
  if (!refundReason.value) return message.warning('请输入退款原因')
  refundLoading.value = true
  try {
    await datingApi.refundOrder(refundId.value, refundReason.value)
    message.success('已退款')
    refundVisible.value = false
    fetchList()
  } finally { refundLoading.value = false }
}

fetchList()
</script>
