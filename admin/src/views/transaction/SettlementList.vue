<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.merchantName" placeholder="商家名称" allow-clear style="width:180px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="pending">待结算</a-select-option>
        <a-select-option value="processing">结算中</a-select-option>
        <a-select-option value="completed">已完成</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header">
        <span class="page-title">商家结算</span>
        <a-button type="primary" :loading="generateLoading" @click="onGenerate">
          <template #icon><plus-outlined /></template>
          生成结算单
        </a-button>
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
        <template #fee="{ record }"><span class="money">¥{{ formatMoney(record.fee) }}</span></template>
        <template #netAmount="{ record }"><span class="money">¥{{ formatMoney(record.netAmount) }}</span></template>
        <template #status="{ record }"><StatusTag :status="record.status" type="payment" /></template>
        <template #action="{ record }">
          <a-button type="link" size="small" @click="openDetail(record)">详情</a-button>
        </template>
      </DataTable>
    </div>

    <!-- Detail Drawer -->
    <a-drawer
      :open="drawerVisible"
      title="结算详情"
      :width="520"
      @close="drawerVisible = false"
    >
      <template v-if="detail">
        <a-descriptions :column="1" bordered size="small">
          <a-descriptions-item label="商家">{{ detail.merchantName }}</a-descriptions-item>
          <a-descriptions-item label="结算周期">{{ detail.period }}</a-descriptions-item>
          <a-descriptions-item label="订单数">{{ detail.orderCount }}</a-descriptions-item>
          <a-descriptions-item label="订单总额"><span class="money">¥{{ formatMoney(detail.totalAmount) }}</span></a-descriptions-item>
          <a-descriptions-item label="退款金额"><span class="money">¥{{ formatMoney(detail.totalRefund || 0) }}</span></a-descriptions-item>
          <a-descriptions-item label="手续费"><span class="money">¥{{ formatMoney(detail.fee) }}</span></a-descriptions-item>
          <a-descriptions-item label="结算金额"><span class="money" style="color:#3B82F6;font-weight:600">¥{{ formatMoney(detail.netAmount) }}</span></a-descriptions-item>
          <a-descriptions-item label="状态"><StatusTag :status="detail.status" type="payment" /></a-descriptions-item>
          <a-descriptions-item label="备注">{{ detail.remark || '-' }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ detail.createdAt }}</a-descriptions-item>
        </a-descriptions>
      </template>
      <div v-else class="empty-detail">
        <a-empty description="暂无数据" />
      </div>
    </a-drawer>

    <!-- Generate Modal -->
    <a-modal
      v-model:open="generateVisible"
      title="生成结算单"
      :confirm-loading="generateLoading"
      @ok="onGenerateConfirm"
      @cancel="generateVisible = false"
      :width="480"
    >
      <a-form layout="vertical">
        <a-form-item label="商家" required>
          <a-input v-model:value="generateForm.merchantName" placeholder="输入商家名称" />
        </a-form-item>
        <a-form-item label="结算周期" required>
          <a-month-picker v-model:value="generateForm.period" style="width:100%" placeholder="选择结算月份" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="generateForm.remark" :rows="2" placeholder="选填" :maxlength="200" show-count />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import request from '@/utils/request'
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
  merchantName: '',
  status: undefined as string | undefined,
  dateRange: undefined as [Dayjs, Dayjs] | undefined,
})

const drawerVisible = ref(false)
const detail = ref<any>(null)

const generateVisible = ref(false)
const generateLoading = ref(false)
const generateForm = reactive({
  merchantName: '',
  period: null as Dayjs | null,
  remark: '',
})

const columns = [
  { title: '商家', dataIndex: 'merchantName', width: 140 },
  { title: '结算周期', dataIndex: 'period', width: 120 },
  { title: '订单数', dataIndex: 'orderCount', width: 80 },
  { title: '订单总额', dataIndex: 'totalAmount', width: 110, slot: 'totalAmount' },
  { title: '手续费', dataIndex: 'fee', width: 90, slot: 'fee' },
  { title: '结算金额', dataIndex: 'netAmount', width: 110, slot: 'netAmount' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '创建时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 70, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, merchantName: filter.merchantName, status: filter.status }
    if (filter.dateRange) {
      params.dateRange = [filter.dateRange[0].format('YYYY-MM-DD'), filter.dateRange[1].format('YYYY-MM-DD')]
    }
    const res = await request.get('/admin/settlements', { params })
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch { /* handled */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.merchantName = ''; filter.status = undefined; filter.dateRange = undefined; onSearch() }
function onTableChange() { fetchList() }

function openDetail(record: any) {
  detail.value = record
  drawerVisible.value = true
}

function onGenerate() {
  generateForm.merchantName = ''
  generateForm.period = null
  generateForm.remark = ''
  generateVisible.value = true
}

async function onGenerateConfirm() {
  if (!generateForm.merchantName.trim()) {
    message.warning('请输入商家名称')
    return
  }
  if (!generateForm.period) {
    message.warning('请选择结算周期')
    return
  }
  generateLoading.value = true
  try {
    await request.post('/admin/settlements/generate', {
      merchantName: generateForm.merchantName.trim(),
      period: generateForm.period.format('YYYY-MM'),
      remark: generateForm.remark.trim() || undefined,
    })
    message.success('结算单已生成')
    generateVisible.value = false
    fetchList()
  } catch { /* handled */ } finally { generateLoading.value = false }
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
.empty-detail { padding: 40px 0; }
</style>
