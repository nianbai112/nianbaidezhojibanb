<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width: 120px">
        <a-select-option value="pending">待处理</a-select-option>
        <a-select-option value="refunded">已退款</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
      >
        <template #amount="{ record }">
          {{ (record.amount / 100).toFixed(2) }}
        </template>
        <template #status="{ record }">
          <StatusTag :status="record.status" type="payment" />
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { financeApi } from '@/api/finance'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'

// 财务退款列表

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ status: undefined as string | undefined })

const columns = [
  { title: '退款号', dataIndex: 'refundNo', width: 180 },
  { title: '原订单', dataIndex: 'originalOrderNo', width: 180 },
  { title: '用户', dataIndex: 'userNickname', width: 100 },
  { title: '金额', dataIndex: 'amount', width: 100, slot: 'amount' },
  { title: '原因', dataIndex: 'reason', width: 150 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
]

async function fetchList() {
  loading.value = true
  try {
    // 获取财务退款列表
    const res = await financeApi.getRefundFinanceList({
      page: page.value,
      pageSize: pageSize.value,
      ...filter,
    })
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch (err: any) {
    message.error(err?.message || '获取退款列表失败')
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  fetchList()
}

function onReset() {
  filter.status = undefined
  onSearch()
}

fetchList()
</script>

<style lang="less" scoped>
</style>
