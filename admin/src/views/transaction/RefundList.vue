<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.refundNo" placeholder="退款号" allow-clear style="width:200px" />
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:130px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="approved">已通过</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
        <a-select-option value="completed">已完成</a-select-option>
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
        @change="onTableChange"
      >
        <template #amount="{ record }"><span class="money">¥{{ formatMoney(record.amount) }}</span></template>
        <template #status="{ record }"><StatusTag :status="record.status" type="audit" /></template>
        <template #action="{ record }">
          <a-space>
            <template v-if="record.status === 'pending'">
              <a-button type="link" size="small" style="color:#10b981" @click="onAudit(record, 'approve')">通过</a-button>
              <a-button type="link" size="small" danger @click="onAudit(record, 'reject')">拒绝</a-button>
            </template>
            <span v-else style="color:#9ca3af">-</span>
          </a-space>
        </template>
      </DataTable>
    </div>

    <AuditModal
      v-model:visible="auditVisible"
      title="退款审核"
      @submit="onAuditSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { shopApi } from '@/api/shop'
import { formatMoney } from '@/utils/format'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import AuditModal from '@/components/common/AuditModal.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({
  refundNo: '',
  status: undefined as string | undefined,
})

const auditVisible = ref(false)
const auditRecord = ref<any>(null)

const columns = [
  { title: '退款号', dataIndex: 'refundNo', width: 190 },
  { title: '原订单号', dataIndex: 'orderNo', width: 190 },
  { title: '用户', dataIndex: 'userNickname', width: 100 },
  { title: '金额', dataIndex: 'amount', width: 100, slot: 'amount' },
  { title: '原因', dataIndex: 'reason', width: 150, ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 90, slot: 'status' },
  { title: '申请时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 120, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await shopApi.getRefundList({
      page: page.value,
      pageSize: pageSize.value,
      refundNo: filter.refundNo || undefined,
      status: filter.status,
    })
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch { /* handled */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.refundNo = ''; filter.status = undefined; onSearch() }
function onTableChange() { fetchList() }

function onAudit(record: any, _action: string) {
  auditRecord.value = record
  auditVisible.value = true
}

async function onAuditSubmit(action: 'approve' | 'reject', remark: string) {
  if (!auditRecord.value) return
  try {
    if (action === 'approve') {
      await shopApi.approveRefund(auditRecord.value.id, remark)
    } else {
      await shopApi.rejectRefund(auditRecord.value.id, remark)
    }
    message.success(action === 'approve' ? '退款已通过' : '退款已拒绝')
    auditVisible.value = false
    fetchList()
  } catch { /* handled */ }
}

fetchList()
</script>

<style lang="less" scoped>
.money { font-family: 'SF Mono', Monaco, monospace; color: #374151; }
</style>
