<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.userId" placeholder="用户ID" allow-clear style="width:150px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="processing">处理中</a-select-option>
        <a-select-option value="success">已完成</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
      </a-select>
      <a-select v-model:value="filter.userType" placeholder="用户类型" allow-clear style="width:120px">
        <a-select-option value="user">用户</a-select-option>
        <a-select-option value="rider">骑手</a-select-option>
        <a-select-option value="merchant">商家</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filter.dateRange" style="width:240px" value-format="YYYY-MM-DD" />
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">提现管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #user="{ record }">
          <a-space>
            <a-avatar v-if="record.userAvatar" :src="record.userAvatar" :size="24" />
            <span>{{ record.userNickname || record.userId }}</span>
          </a-space>
        </template>
        <template #userType="{ record }">
          <a-tag :color="userTypeColor(record.userType)">{{ record.userType || 'user' }}</a-tag>
        </template>
        <template #amount="{ record }">
          <span style="color:#374151;font-family:'SF Mono',Monaco,monospace">{{ fmt(record.amount) }}</span>
        </template>
        <template #fee="{ record }">{{ fmt(record.fee) }}</template>
        <template #actualAmount="{ record }">
          <span style="font-weight:500;font-family:'SF Mono',Monaco,monospace">{{ fmt(record.actualAmount) }}</span>
        </template>
        <template #accountInfo="{ record }">
          <span style="font-size:12px">{{ maskAccount(record.accountInfo) }}</span>
        </template>
        <template #status="{ record }">
          <StatusTag :status="record.status" type="payment" />
        </template>
        <template #action="{ record }">
          <a-space>
            <template v-if="record.status === 'pending'">
              <a-button type="link" size="small" style="color:#10b981" @click="onAudit(record, 'approve')">通过</a-button>
              <a-button type="link" size="small" danger @click="onAudit(record, 'reject')">拒绝</a-button>
            </template>
            <template v-else-if="record.status === 'processing'">
              <a-button type="link" size="small" @click="onMarkSuccess(record)">标记打款</a-button>
            </template>
            <span v-else style="color:#9ca3af">-</span>
          </a-space>
        </template>
      </DataTable>
    </div>

    <AuditModal v-model:visible="auditVisible" @submit="onAuditSubmit" />

    <a-modal v-model:open="markVisible" title="标记打款" :confirm-loading="markLoading" @ok="onMarkSubmit">
      <a-form layout="vertical">
        <a-form-item label="转账单号" required>
          <a-input v-model:value="transferNo" placeholder="输入支付宝/微信转账单号" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { financeApi } from '@/api/finance'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import AuditModal from '@/components/common/AuditModal.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ userId: '', status: undefined as string | undefined, userType: undefined as string | undefined, dateRange: undefined as any })
const auditVisible = ref(false)
const auditRecord = ref<any>(null)

const columns = [
  { title: '用户', dataIndex: 'userNickname', width: 120, slot: 'user' },
  { title: '类型', dataIndex: 'userType', width: 70, slot: 'userType' },
  { title: '金额', dataIndex: 'amount', width: 100, slot: 'amount' },
  { title: '手续费', dataIndex: 'fee', width: 80, slot: 'fee' },
  { title: '实际金额', dataIndex: 'actualAmount', width: 100, slot: 'actualAmount' },
  { title: '收款账户', dataIndex: 'accountInfo', width: 160, slot: 'accountInfo' },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '申请时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action', fixed: 'right' },
]

function userTypeColor(t: string) { return t === 'user' ? 'blue' : t === 'rider' ? 'purple' : 'orange' }
function fmt(v: any) { const n = Number(v); return Number.isNaN(n) ? '0.00' : (n / 100).toFixed(2) }
function maskAccount(a: string) { if (!a || a.length < 8) return a || '-'; return a.slice(0, 3) + '****' + a.slice(-4) }

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, status: filter.status, userType: filter.userType }
    if (filter.dateRange?.length === 2) { params.startAt = filter.dateRange[0]; params.endAt = filter.dateRange[1] }
    const res = await financeApi.getWithdrawList(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.userId = ''; filter.status = undefined; filter.userType = undefined; filter.dateRange = undefined; onSearch() }

function onAudit(record: any, _action: string) { auditRecord.value = record; auditVisible.value = true }

async function onAuditSubmit(action: 'approve' | 'reject', remark: string) {
  if (!auditRecord.value) return
  if (action === 'approve') await financeApi.approveWithdraw(auditRecord.value.id, remark)
  else await financeApi.rejectWithdraw(auditRecord.value.id, remark)
  message.success('操作成功')
  auditVisible.value = false
  fetchList()
}

const markVisible = ref(false)
const markLoading = ref(false)
const markRecord = ref<any>(null)
const transferNo = ref('')

function onMarkSuccess(record: any) {
  markRecord.value = record
  transferNo.value = ''
  markVisible.value = true
}

async function onMarkSubmit() {
  if (!markRecord.value || !transferNo.value) return message.warning('请输入转账单号')
  markLoading.value = true
  try {
    await financeApi.markWithdrawSuccess(markRecord.value.id, transferNo.value)
    message.success('已标记打款')
    markVisible.value = false
    fetchList()
  } finally { markLoading.value = false }
}

fetchList()
</script>
