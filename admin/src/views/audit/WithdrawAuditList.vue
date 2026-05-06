<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width: 130px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="processing">处理中</a-select-option>
        <a-select-option value="success">已完成</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
      </a-select>
      <a-select v-model:value="filter.userType" placeholder="用户类型" allow-clear style="width: 120px">
        <a-select-option value="user">普通用户</a-select-option>
        <a-select-option value="rider">骑手</a-select-option>
        <a-select-option value="merchant">商家</a-select-option>
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
        v-model:selected-keys="selectedKeys"
        :row-selection="true"
        :batch-actions="batchActions"
        @change="onTableChange"
        @batch-action="onBatchAction"
      >
        <template #amount="{ record }">
          <span class="money">{{ formatMoney(record.amount) }}</span>
        </template>
        <template #userType="{ record }">
          <a-tag>{{ userTypeMap[record.userType] || record.userType }}</a-tag>
        </template>
        <template #status="{ record }">
          <StatusTag :status="record.status" type="payment" />
        </template>
        <template #action="{ record }">
          <a-space>
            <template v-if="record.status === 'pending'">
              <a-button type="link" size="small" style="color: #10b981" @click="onQuickApprove(record)">通过</a-button>
              <a-button type="link" size="small" danger @click="onOpenReject(record)">拒绝</a-button>
            </template>
            <template v-else-if="record.status === 'processing'">
              <a-button type="link" size="small" @click="onMarkSuccess(record)">标记打款</a-button>
            </template>
            <span v-else style="color: #9ca3af">--</span>
          </a-space>
        </template>
      </DataTable>
    </div>

    <AuditModal
      v-model:visible="auditVisible"
      title="提现审核"
      :loading="auditLoading"
      @submit="onAuditSubmit"
    />
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
import { formatMoney } from '@/utils/format'
import type { WithdrawRecord } from '@/types/finance'

const loading = ref(false)
const auditLoading = ref(false)
const list = ref<WithdrawRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedKeys = ref<(string | number)[]>([])
const filter = reactive({ status: undefined as string | undefined, userType: undefined as string | undefined })

const auditVisible = ref(false)
const auditRecord = ref<WithdrawRecord | null>(null)

const userTypeMap: Record<string, string> = {
  user: '普通用户',
  rider: '骑手',
  merchant: '商家',
}

const columns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '用户', dataIndex: 'userNickname', width: 110 },
  { title: '用户类型', dataIndex: 'userType', width: 100, slot: 'userType' },
  { title: '金额(元)', dataIndex: 'amount', width: 100, slot: 'amount' },
  { title: '收款方式', dataIndex: 'accountType', width: 90 },
  { title: '收款账户', dataIndex: 'accountInfo', width: 160, ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 90, slot: 'status' },
  { title: '申请时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 160, slot: 'action', fixed: 'right' },
]

const batchActions = [
  { key: 'approve', label: '批量通过' },
  { key: 'reject', label: '批量拒绝', danger: true },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await financeApi.getWithdrawList({ page: page.value, pageSize: pageSize.value, status: filter.status, userType: filter.userType })
    list.value = (res.data?.data?.list || res.data?.list || []) as WithdrawRecord[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    // handled by interceptor
  } finally {
    loading.value = false
  }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.status = undefined; filter.userType = undefined; onSearch() }
function onTableChange() { fetchList() }

async function onQuickApprove(record: WithdrawRecord) {
  auditLoading.value = true
  try {
    await financeApi.approveWithdraw(Number(record.id))
    message.success('已通过')
    fetchList()
  } catch {
    // handled by interceptor
  } finally {
    auditLoading.value = false
  }
}

function onOpenReject(record: WithdrawRecord) {
  auditRecord.value = record
  auditVisible.value = true
}

async function onAuditSubmit(action: 'approve' | 'reject', remark: string) {
  if (!auditRecord.value) return
  auditLoading.value = true
  try {
    if (action === 'approve') {
      await financeApi.approveWithdraw(Number(auditRecord.value.id), remark)
    } else {
      await financeApi.rejectWithdraw(Number(auditRecord.value.id), remark)
    }
    message.success('操作成功')
    auditVisible.value = false
    fetchList()
  } catch {
    // handled by interceptor
  } finally {
    auditLoading.value = false
  }
}

async function onMarkSuccess(record: WithdrawRecord) {
  auditLoading.value = true
  try {
    await financeApi.markWithdrawSuccess(Number(record.id), 'ADMIN_' + Date.now())
    message.success('已标记打款')
    fetchList()
  } catch {
    // handled by interceptor
  } finally {
    auditLoading.value = false
  }
}

async function onBatchAction(action: string, keys: (string | number)[]) {
  auditLoading.value = true
  try {
    for (const id of keys) {
      if (action === 'approve') {
        await financeApi.approveWithdraw(Number(id))
      } else {
        await financeApi.rejectWithdraw(Number(id), '批量拒绝')
      }
    }
    message.success('批量操作成功')
    selectedKeys.value = []
    fetchList()
  } catch {
    // handled by interceptor
  } finally {
    auditLoading.value = false
  }
}

fetchList()
</script>

<style lang="less" scoped>
.money {
  font-family: 'SF Mono', Monaco, monospace;
  color: #374151;
}
</style>
