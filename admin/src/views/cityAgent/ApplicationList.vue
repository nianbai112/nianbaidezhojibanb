<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.status" placeholder="审核状态" allow-clear style="width:140px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="approved">已通过</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
      </a-select>
      <a-input v-model:value="filter.keyword" placeholder="申请人/手机号" allow-clear style="width:180px" />
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
        <template #status="{ record }">
          <StatusTag :status="record.status" type="audit" />
        </template>
        <template #action="{ record }">
          <a-space>
            <template v-if="record.status === 'pending'">
              <a-button type="link" size="small" style="color:#10b981" @click="onAudit(record, 'approve')">通过</a-button>
              <a-button type="link" size="small" danger @click="onAudit(record, 'reject')">拒绝</a-button>
            </template>
            <span v-else style="color:#999">--</span>
          </a-space>
        </template>
      </DataTable>
    </div>
    <AuditModal
      v-model:visible="auditVisible"
      :loading="auditLoading"
      :title="'审核城市代理申请'"
      @submit="onAuditSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { cityAgentApi } from '@/api/cityAgent'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import AuditModal from '@/components/common/AuditModal.vue'

const loading = ref(false)
const auditLoading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ status: undefined as string | undefined, keyword: '' })
const auditVisible = ref(false)
const auditRecord = ref<any>(null)

const columns = [
  { title: '申请人', dataIndex: 'applicantName', width: 120 },
  { title: '手机号', dataIndex: 'phone', width: 130 },
  { title: '邮箱', dataIndex: 'email', width: 160 },
  { title: '申请城市', dataIndex: 'city', width: 120 },
  { title: '申请区域', dataIndex: 'region', width: 120 },
  { title: '审核状态', dataIndex: 'status', width: 100, slot: 'status' },
  { title: '申请时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await cityAgentApi.getApplications({ page: page.value, pageSize: pageSize.value, ...filter })
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    // handled by interceptor
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
  filter.keyword = ''
  onSearch()
}

function onTableChange() {
  fetchList()
}

function onAudit(record: any, _action: string) {
  auditRecord.value = record
  auditVisible.value = true
}

async function onAuditSubmit(action: 'approve' | 'reject', remark: string) {
  if (!auditRecord.value) return
  auditLoading.value = true
  try {
    await cityAgentApi.auditApplication(auditRecord.value.id, {
      status: action === 'approve' ? 'approved' : 'rejected',
      reason: remark || undefined,
    })
    message.success('操作成功')
    auditVisible.value = false
    fetchList()
  } catch {
    // handled by interceptor
  } finally {
    auditLoading.value = false
  }
}

fetchList()
</script>
