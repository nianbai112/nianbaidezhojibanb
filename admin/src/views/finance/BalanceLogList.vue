<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.userId" placeholder="用户ID" allow-clear style="width:150px" />
      <a-select v-model:value="filter.type" placeholder="类型" allow-clear style="width:140px">
        <a-select-option value="RECHARGE">充值</a-select-option>
        <a-select-option value="WITHDRAW">提现</a-select-option>
        <a-select-option value="PAY">支付</a-select-option>
        <a-select-option value="REFUND">退款</a-select-option>
        <a-select-option value="REWARD">奖励</a-select-option>
        <a-select-option value="COMMISSION">佣金</a-select-option>
        <a-select-option value="TRANSFER_IN">转入</a-select-option>
        <a-select-option value="TRANSFER_OUT">转出</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" value-format="YYYY-MM-DD" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">余额变动记录</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #user="{ record }">
          <a-space>
            <a-avatar v-if="record.userAvatar" :src="record.userAvatar" :size="24" />
            <span>{{ record.userNickname || record.userId }}</span>
          </a-space>
        </template>
        <template #type="{ record }">
          <a-tag :color="typeColor(record.type)">{{ typeLabel(record.type) }}</a-tag>
        </template>
        <template #amount="{ record }">
          <span :style="{ color: isIncome(record.type) ? '#10b981' : '#ef4444', fontFamily: 'SF Mono, Monaco, monospace' }">
            {{ isIncome(record.type) ? '+' : '-' }}{{ fmt(record.amount) }}
          </span>
        </template>
        <template #balanceBefore="{ record }">
          <span style="font-family:'SF Mono',Monaco,monospace">{{ fmt(record.balanceBefore) }}</span>
        </template>
        <template #balanceAfter="{ record }">
          <span style="font-family:'SF Mono',Monaco,monospace">{{ fmt(record.balanceAfter) }}</span>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { financeApi } from '@/api/finance'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ userId: '', type: undefined as string | undefined, dateRange: undefined as any })

const columns = [
  { title: '用户', dataIndex: 'userNickname', width: 140, slot: 'user' },
  { title: '类型', dataIndex: 'type', width: 90, slot: 'type' },
  { title: '变动金额', dataIndex: 'amount', width: 120, slot: 'amount' },
  { title: '变动前余额', dataIndex: 'balanceBefore', width: 120, slot: 'balanceBefore' },
  { title: '变动后余额', dataIndex: 'balanceAfter', width: 120, slot: 'balanceAfter' },
  { title: '业务单号', dataIndex: 'orderNo', width: 180, ellipsis: true },
  { title: '备注', dataIndex: 'description', width: 160, ellipsis: true },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
]

const typeMap: Record<string, { color: string; label: string; income: boolean }> = {
  RECHARGE: { color: 'green', label: '充值', income: true },
  WITHDRAW: { color: 'orange', label: '提现', income: false },
  PAY: { color: 'red', label: '支付', income: false },
  REFUND: { color: 'blue', label: '退款', income: true },
  REWARD: { color: 'purple', label: '奖励', income: true },
  COMMISSION: { color: 'cyan', label: '佣金', income: true },
  TRANSFER_IN: { color: 'green', label: '转入', income: true },
  TRANSFER_OUT: { color: 'red', label: '转出', income: false },
}

function typeColor(t: string) { return typeMap[t]?.color || 'default' }
function typeLabel(t: string) { return typeMap[t]?.label || t }
function isIncome(t: string) { return typeMap[t]?.income !== false }
function fmt(v: any) {
  const n = Number(v)
  if (Number.isNaN(n)) return '0.00'
  return (n / 100).toFixed(2)
}

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, type: filter.type, userId: filter.userId || undefined }
    if (filter.dateRange?.length === 2) { params.startAt = filter.dateRange[0]; params.endAt = filter.dateRange[1] }
    const res = await financeApi.getBalanceLogs(params)
    const raw = res.data?.data?.list || res.data?.list || []
    list.value = raw.map((r: any) => ({
      ...r,
      balanceBefore: r.balanceAfter !== undefined ? Number(r.balanceAfter) - (isIncome(r.type) ? Number(r.amount) : -Number(r.amount)) : Number(r.balance),
      balanceAfter: r.balanceAfter !== undefined ? Number(r.balanceAfter) : Number(r.balance),
    }))
    total.value = res.data?.data?.total || res.data?.total || 0
  } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.userId = ''; filter.type = undefined; filter.dateRange = undefined; onSearch() }

fetchList()
</script>
