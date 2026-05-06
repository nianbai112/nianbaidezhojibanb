<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.orderNo" placeholder="订单号" allow-clear style="width:200px" />
      <a-select v-model:value="filter.bizType" placeholder="业务类型" allow-clear style="width:120px">
        <a-select-option value="order">商城订单</a-select-option>
        <a-select-option value="recharge">充值</a-select-option>
        <a-select-option value="vip">会员</a-select-option>
        <a-select-option value="delivery">配送</a-select-option>
      </a-select>
      <a-select v-model:value="filter.payStatus" placeholder="支付状态" allow-clear style="width:120px">
        <a-select-option value="pending">待支付</a-select-option>
        <a-select-option value="paid">已支付</a-select-option>
        <a-select-option value="refunding">退款中</a-select-option>
        <a-select-option value="refunded">已退款</a-select-option>
        <a-select-option value="closed">已关闭</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" />
    </FilterBar>

    <div class="page-card">
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        @change="onTableChange"
      >
        <template #amount="{ record }"><span class="money">¥{{ formatMoney(record.amount) }}</span></template>
        <template #payStatus="{ record }"><StatusTag :status="record.payStatus" type="payment" /></template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { financeApi } from '@/api/finance'
import { formatMoney } from '@/utils/format'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import type { Dayjs } from 'dayjs'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({
  orderNo: '',
  bizType: undefined as string | undefined,
  payStatus: undefined as string | undefined,
  dateRange: undefined as [Dayjs, Dayjs] | undefined,
})

const columns = [
  { title: '订单号', dataIndex: 'orderNo', width: 190 },
  { title: '业务类型', dataIndex: 'bizType', width: 90 },
  { title: '用户', dataIndex: 'userNickname', width: 100 },
  { title: '金额', dataIndex: 'amount', width: 100, slot: 'amount' },
  { title: '支付方式', dataIndex: 'payMethod', width: 90 },
  { title: '状态', dataIndex: 'payStatus', width: 90, slot: 'payStatus' },
  { title: '支付时间', dataIndex: 'payTime', width: 160 },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
]

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, orderNo: filter.orderNo, bizType: filter.bizType, payStatus: filter.payStatus }
    if (filter.dateRange) {
      params.dateRange = [filter.dateRange[0].format('YYYY-MM-DD'), filter.dateRange[1].format('YYYY-MM-DD')]
    }
    const res = await financeApi.getPaymentList(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch { /* handled */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.orderNo = ''; filter.bizType = undefined; filter.payStatus = undefined; filter.dateRange = undefined; onSearch() }
function onTableChange() { fetchList() }

fetchList()
</script>

<style lang="less" scoped>
.money { font-family: 'SF Mono', Monaco, monospace; color: #374151; }
</style>
