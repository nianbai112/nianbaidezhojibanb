<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:120px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="processing">处理中</a-select-option>
        <a-select-option value="success">已完成</a-select-option>
        <a-select-option value="failed">失败</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
      </a-select>
      <a-select v-model:value="filter.userType" placeholder="用户类型" allow-clear style="width:120px">
        <a-select-option value="user">普通用户</a-select-option>
        <a-select-option value="rider">骑手</a-select-option>
        <a-select-option value="merchant">商家</a-select-option>
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
        <template #fee="{ record }"><span class="money">¥{{ formatMoney(record.fee) }}</span></template>
        <template #actualAmount="{ record }"><span class="money">¥{{ formatMoney(record.actualAmount) }}</span></template>
        <template #status="{ record }"><StatusTag :status="record.status" type="payment" /></template>
        <template #action="{ record }">
          <a-space>
            <template v-if="record.status === 'pending'">
              <a-button type="link" size="small" style="color:#10b981" @click="onAudit(record, 'approve')">通过</a-button>
              <a-button type="link" size="small" danger @click="onAudit(record, 'reject')">拒绝</a-button>
            </template>
            <template v-else-if="record.status === 'processing'">
              <a-button type="link" size="small" @click="onMarkSuccessOpen(record)">标记打款</a-button>
            </template>
            <span v-else style="color:#9ca3af">-</span>
          </a-space>
        </template>
      </DataTable>
    </div>

    <AuditModal
      v-model:visible="auditVisible"
      title="提现审核"
      @submit="onAuditSubmit"
    />

    <!-- Mark Success Modal -->
    <a-modal
      v-model:open="markVisible"
      title="标记打款完成"
      :confirm-loading="markLoading"
      @ok="onMarkSuccessConfirm"
      @cancel="markVisible = false"
      :width="420"
    >
      <a-form layout="vertical">
        <a-form-item label="转账单号" required>
          <a-input v-model:value="transferNo" placeholder="请输入银行/微信转账单号" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { financeApi } from '@/api/finance'
import { formatMoney } from '@/utils/format'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import AuditModal from '@/components/common/AuditModal.vue'
import type { Dayjs } from 'dayjs'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({
  status: undefined as string | undefined,
  userType: undefined as string | undefined,
  dateRange: undefined as [Dayjs, Dayjs] | undefined,
})

const auditVisible = ref(false)
const auditRecord = ref<any>(null)

const markVisible = ref(false)
const markLoading = ref(false)
const markRecord = ref<any>(null)
const transferNo = ref('')

const columns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '用户', dataIndex: 'userNickname', width: 100 },
  { title: '用户类型', dataIndex: 'userType', width: 90 },
  { title: '提现金额', dataIndex: 'amount', width: 100, slot: 'amount' },
  { title: '手续费', dataIndex: 'fee', width: 80, slot: 'fee' },
  { title: '实际到账', dataIndex: 'actualAmount', width: 100, slot: 'actualAmount' },
  { title: '收款账户', dataIndex: 'accountType', width: 80 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '申请时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, status: filter.status, userType: filter.userType }
    if (filter.dateRange) {
      params.dateRange = [filter.dateRange[0].format('YYYY-MM-DD'), filter.dateRange[1].format('YYYY-MM-DD')]
    }
    const res = await financeApi.getWithdrawList(params)
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch { /* handled */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.status = undefined; filter.userType = undefined; filter.dateRange = undefined; onSearch() }
function onTableChange() { fetchList() }

function onAudit(record: any, _action: string) {
  auditRecord.value = record
  auditVisible.value = true
}

async function onAuditSubmit(action: 'approve' | 'reject', remark: string) {
  if (!auditRecord.value) return
  try {
    if (action === 'approve') {
      await financeApi.approveWithdraw(auditRecord.value.id, remark)
    } else {
      await financeApi.rejectWithdraw(auditRecord.value.id, remark)
    }
    message.success(action === 'approve' ? '提现已通过' : '提现已拒绝')
    auditVisible.value = false
    fetchList()
  } catch { /* handled */ }
}

function onMarkSuccessOpen(record: any) {
  markRecord.value = record
  transferNo.value = 'ADMIN_' + Date.now()
  markVisible.value = true
}

async function onMarkSuccessConfirm() {
  if (!transferNo.value.trim()) {
    message.warning('请输入转账单号')
    return
  }
  if (!markRecord.value) return
  markLoading.value = true
  try {
    await financeApi.markWithdrawSuccess(markRecord.value.id, transferNo.value.trim())
    message.success('已标记打款完成')
    markVisible.value = false
    fetchList()
  } catch { /* handled */ } finally { markLoading.value = false }
}

fetchList()
</script>

<style lang="less" scoped>
.money { font-family: 'SF Mono', Monaco, monospace; color: #374151; }
</style>
