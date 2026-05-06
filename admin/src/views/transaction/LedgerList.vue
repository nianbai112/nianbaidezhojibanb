<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.userId" placeholder="用户ID" allow-clear style="width:150px" />
      <a-select v-model:value="filter.type" placeholder="类型" allow-clear style="width:120px">
        <a-select-option value="income">收入</a-select-option>
        <a-select-option value="expense">支出</a-select-option>
        <a-select-option value="freeze">冻结</a-select-option>
        <a-select-option value="unfreeze">解冻</a-select-option>
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
        <template #type="{ record }">
          <a-tag :color="typeColor(record.type)">{{ typeLabel(record.type) }}</a-tag>
        </template>
        <template #amount="{ record }">
          <span :style="{ color: record.type === 'expense' ? '#ef4444' : '#10b981', fontFamily: '\'SF Mono\', Monaco, monospace' }">
            {{ record.type === 'expense' ? '-' : '+' }}¥{{ formatMoney(record.amount) }}
          </span>
        </template>
        <template #balance="{ record }"><span class="money">¥{{ formatMoney(record.balance) }}</span></template>
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
import type { Dayjs } from 'dayjs'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({
  userId: '',
  type: undefined as string | undefined,
  dateRange: undefined as [Dayjs, Dayjs] | undefined,
})

const columns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '用户', dataIndex: 'userNickname', width: 100 },
  { title: '类型', dataIndex: 'type', width: 80, slot: 'type' },
  { title: '金额', dataIndex: 'amount', width: 110, slot: 'amount' },
  { title: '余额', dataIndex: 'balance', width: 110, slot: 'balance' },
  { title: '业务', dataIndex: 'bizType', width: 100 },
  { title: '备注', dataIndex: 'remark', width: 160, ellipsis: true },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
]

function typeColor(type: string): string {
  const map: Record<string, string> = {
    income: 'green', expense: 'red', freeze: 'orange', unfreeze: 'blue',
  }
  return map[type] || 'default'
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    income: '收入', expense: '支出', freeze: '冻结', unfreeze: '解冻',
  }
  return map[type] || type
}

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, userId: filter.userId, type: filter.type }
    if (filter.dateRange) {
      params.dateRange = [filter.dateRange[0].format('YYYY-MM-DD'), filter.dateRange[1].format('YYYY-MM-DD')]
    }
    const res = await financeApi.getBalanceLogs(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch { /* handled */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.userId = ''; filter.type = undefined; filter.dateRange = undefined; onSearch() }
function onTableChange() { fetchList() }

fetchList()
</script>

<style lang="less" scoped>
.money { font-family: 'SF Mono', Monaco, monospace; color: #374151; }
</style>
