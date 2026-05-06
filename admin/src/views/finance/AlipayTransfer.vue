<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:130px">
        <a-select-option value="pending">待处理</a-select-option>
        <a-select-option value="processing">处理中</a-select-option>
        <a-select-option value="success">已完成</a-select-option>
        <a-select-option value="failed">失败</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" value-format="YYYY-MM-DD" />
      <template #extra>
        <a-button type="primary" @click="onCreate"><plus-outlined />新建转账</a-button>
      </template>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">支付宝转账记录</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #payeeAccount="{ record }">
          <span style="font-family:'SF Mono',Monaco,monospace;font-size:13px">{{ record.payeeAccount }}</span>
        </template>
        <template #payeeName="{ record }">{{ record.payeeName || '-' }}</template>
        <template #amount="{ record }">
          <span style="color:#374151;font-family:'SF Mono',Monaco,monospace">¥{{ Number(record.amount).toFixed(2) }}</span>
        </template>
        <template #status="{ record }">
          <a-tag :color="statusColor(record.status)">{{ statusText(record.status) }}</a-tag>
        </template>
        <template #action="{ record }">
          <a @click="onDetail(record)">详情</a>
        </template>
      </DataTable>
    </div>

    <!-- 新建转账 Modal -->
    <a-modal v-model:open="createVisible" title="新建支付宝转账" :confirm-loading="createLoading" @ok="onCreateSubmit">
      <a-form layout="vertical">
        <a-form-item label="收款账户" required>
          <a-input v-model:value="form.payeeAccount" placeholder="支付宝账号（手机号/邮箱）" />
        </a-form-item>
        <a-form-item label="收款人姓名">
          <a-input v-model:value="form.payeeName" placeholder="收款人真实姓名" />
        </a-form-item>
        <a-form-item label="转账金额 (元)" required>
          <a-input-number v-model:value="form.amount" :min="0.01" :precision="2" style="width:100%" placeholder="0.00" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="form.remark" :rows="2" placeholder="转账备注" />
        </a-form-item>
        <div style="background:#fff7e6;padding:12px;border-radius:4px;color:#ad6800;font-size:12px">
          提示：转账将在服务端执行，支付宝密钥不会暴露到前端。转账记录可在此页面查看。
        </div>
      </a-form>
    </a-modal>

    <!-- 详情 Modal -->
    <a-modal v-model:open="detailVisible" title="转账详情" :footer="null" :width="480">
      <a-descriptions v-if="detail" :column="1" size="small" bordered>
        <a-descriptions-item label="转账单号">{{ detail.transferNo }}</a-descriptions-item>
        <a-descriptions-item label="收款账户">{{ detail.payeeAccount }}</a-descriptions-item>
        <a-descriptions-item label="收款人">{{ detail.payeeName || '-' }}</a-descriptions-item>
        <a-descriptions-item label="金额">¥{{ Number(detail.amount).toFixed(2) }}</a-descriptions-item>
        <a-descriptions-item label="状态"><a-tag :color="statusColor(detail.status)">{{ statusText(detail.status) }}</a-tag></a-descriptions-item>
        <a-descriptions-item v-if="detail.alipayOrderNo" label="支付宝单号">{{ detail.alipayOrderNo }}</a-descriptions-item>
        <a-descriptions-item v-if="detail.failReason" label="失败原因">{{ detail.failReason }}</a-descriptions-item>
        <a-descriptions-item label="操作人">{{ detail.operatorName || '-' }}</a-descriptions-item>
        <a-descriptions-item label="备注">{{ detail.remark || '-' }}</a-descriptions-item>
        <a-descriptions-item label="创建时间">{{ detail.createdAt }}</a-descriptions-item>
      </a-descriptions>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { financeApi } from '@/api/finance'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ status: undefined as string | undefined, dateRange: undefined as any })

const columns = [
  { title: '转账单号', dataIndex: 'transferNo', width: 200 },
  { title: '收款账户', dataIndex: 'payeeAccount', width: 150, slot: 'payeeAccount' },
  { title: '收款人', dataIndex: 'payeeName', width: 100, slot: 'payeeName' },
  { title: '金额', dataIndex: 'amount', width: 110, slot: 'amount' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '备注', dataIndex: 'remark', width: 150, ellipsis: true },
  { title: '操作人', dataIndex: 'operatorName', width: 100 },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 60, slot: 'action', fixed: 'right' },
]

function statusColor(s: string) { return s === 'success' ? 'green' : s === 'processing' ? 'blue' : s === 'failed' ? 'red' : 'orange' }
function statusText(s: string) { return s === 'success' ? '已完成' : s === 'processing' ? '处理中' : s === 'failed' ? '失败' : '待处理' }

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, status: filter.status }
    if (filter.dateRange?.length === 2) { params.startAt = filter.dateRange[0]; params.endAt = filter.dateRange[1] }
    const res = await financeApi.getAlipayTransfers(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.status = undefined; filter.dateRange = undefined; onSearch() }

// Create
const createVisible = ref(false)
const createLoading = ref(false)
const form = reactive({ payeeAccount: '', payeeName: '', amount: 0, remark: '' })

function onCreate() { Object.assign(form, { payeeAccount: '', payeeName: '', amount: 0, remark: '' }); createVisible.value = true }

async function onCreateSubmit() {
  if (!form.payeeAccount || form.amount <= 0) return message.warning('请填写收款账户和金额')
  createLoading.value = true
  try {
    await financeApi.createAlipayTransfer(form)
    message.success('转账已提交，请等待执行')
    createVisible.value = false
    fetchList()
  } finally { createLoading.value = false }
}

// Detail
const detailVisible = ref(false)
const detail = ref<any>(null)

async function onDetail(record: any) {
  try {
    const res = await financeApi.getAlipayTransferDetail(record.id)
    detail.value = res.data || record
  } catch { detail.value = record }
  detailVisible.value = true
}

fetchList()
</script>
