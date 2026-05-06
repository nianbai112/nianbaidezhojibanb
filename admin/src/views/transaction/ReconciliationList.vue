<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.type" placeholder="对账类型" allow-clear style="width:120px">
        <a-select-option value="daily">日对账</a-select-option>
        <a-select-option value="monthly">月对账</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header">
        <span class="page-title">对账管理</span>
        <a-space>
          <a-button type="primary" :loading="generateLoading" @click="onGenerate">生成今日对账</a-button>
          <a-button @click="onExportAll">导出全部</a-button>
        </a-space>
      </div>

      <DataTable
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :total="total"
        v-model:page="page"
        v-model:page-size="pageSize"
        @change="onTableChange"
      >
        <template #totalAmount="{ record }"><span class="money">¥{{ formatMoney(record.totalAmount) }}</span></template>
        <template #totalRefund="{ record }"><span class="money" style="color:#ef4444">¥{{ formatMoney(record.totalRefund) }}</span></template>
        <template #totalFee="{ record }"><span class="money">¥{{ formatMoney(record.totalFee) }}</span></template>
        <template #netAmount="{ record }"><span class="money" style="color:#3B82F6;font-weight:600">¥{{ formatMoney(record.netAmount) }}</span></template>
        <template #status="{ record }">
          <a-tag v-if="record.status === 'done'" color="green">已完成</a-tag>
          <a-tag v-else color="orange">生成中</a-tag>
        </template>
        <template #action="{ record }">
          <a-space>
            <a-button v-if="record.status === 'done'" type="link" size="small" @click="onExport(record)">下载</a-button>
            <span v-else style="color:#9ca3af">-</span>
          </a-space>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { financeApi } from '@/api/finance'
import { formatMoney } from '@/utils/format'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import type { Dayjs } from 'dayjs'

const loading = ref(false)
const generateLoading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({
  type: undefined as string | undefined,
  dateRange: undefined as [Dayjs, Dayjs] | undefined,
})

const columns = [
  { title: '日期', dataIndex: 'date', width: 120 },
  { title: '类型', dataIndex: 'type', width: 80 },
  { title: '总订单', dataIndex: 'totalOrders', width: 80 },
  { title: '总金额', dataIndex: 'totalAmount', width: 110, slot: 'totalAmount' },
  { title: '退款', dataIndex: 'totalRefund', width: 100, slot: 'totalRefund' },
  { title: '手续费', dataIndex: 'totalFee', width: 90, slot: 'totalFee' },
  { title: '净额', dataIndex: 'netAmount', width: 110, slot: 'netAmount' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '操作', dataIndex: 'action', width: 80, slot: 'action' },
]

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, type: filter.type }
    if (filter.dateRange) {
      params.dateRange = [filter.dateRange[0].format('YYYY-MM-DD'), filter.dateRange[1].format('YYYY-MM-DD')]
    }
    const res = await financeApi.getReconciliationList(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch { /* handled */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.type = undefined; filter.dateRange = undefined; onSearch() }
function onTableChange() { fetchList() }

async function onGenerate() {
  generateLoading.value = true
  try {
    const today = dayjs().format('YYYY-MM-DD')
    await financeApi.generateReconciliation(today, 'daily')
    message.success('对账生成任务已提交')
    fetchList()
  } catch { /* handled */ } finally { generateLoading.value = false }
}

async function onExport(record: any) {
  try {
    const res = await financeApi.exportReconciliation(record.id)
    const fileUrl = res.data?.data?.fileUrl || res.data?.fileUrl
    if (fileUrl) {
      window.open(fileUrl)
      message.success('导出成功')
    } else {
      message.info('文件生成中，请稍后再试')
    }
  } catch { /* handled */ }
}

async function onExportAll() {
  if (list.value.length === 0) {
    message.info('暂无数据可导出')
    return
  }
  try {
    const params: any = { page: 1, pageSize: 10000, type: filter.type }
    if (filter.dateRange) {
      params.dateRange = [filter.dateRange[0].format('YYYY-MM-DD'), filter.dateRange[1].format('YYYY-MM-DD')]
    }
    const res = await financeApi.getReconciliationList(params)
    const allData = res.data?.data?.list || res.data?.list || []
    if (allData.length === 0) {
      message.info('暂无数据可导出')
      return
    }
    const completed = allData.filter((r: any) => r.status === 'done')
    if (completed.length === 0) {
      message.info('没有已完成的对账单可导出')
      return
    }
    message.success(`共 ${completed.length} 条对账记录可导出`)
  } catch { /* handled */ }
}

fetchList()
</script>

<style lang="less" scoped>
.money { font-family: 'SF Mono', Monaco, monospace; color: #374151; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  .page-title { font-weight: 600; font-size: 16px; }
}
</style>
