<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-input v-model:value="filter.keyword" placeholder="帖子标题" allow-clear style="width: 200px" />
      <a-select v-model:value="filter.auditStatus" placeholder="审核状态" allow-clear style="width: 130px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="approved">已通过</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
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
        <template #auditStatus="{ record }">
          <StatusTag :status="record.auditStatus" type="audit" />
        </template>
        <template #action="{ record }">
          <a-space>
            <template v-if="record.auditStatus === 'pending'">
              <a-button type="link" size="small" style="color: #10b981" @click="onQuickAudit(record, 'approve')">通过</a-button>
              <a-button type="link" size="small" danger @click="onOpenReject(record)">拒绝</a-button>
            </template>
            <span v-else style="color: #9ca3af">--</span>
          </a-space>
        </template>
      </DataTable>
    </div>

    <AuditModal
      v-model:visible="auditVisible"
      title="帖子审核"
      :images="auditRecord?.images || []"
      :loading="auditLoading"
      @submit="onAuditSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { contentApi } from '@/api/content'
import { auditApi } from '@/api/audit'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import AuditModal from '@/components/common/AuditModal.vue'
import type { Post } from '@/types/content'

const loading = ref(false)
const auditLoading = ref(false)
const list = ref<Post[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedKeys = ref<(string | number)[]>([])
const filter = reactive({ keyword: '', auditStatus: undefined as string | undefined })

const auditVisible = ref(false)
const auditRecord = ref<Post | null>(null)
const pendingAction = ref<'approve' | 'reject'>('approve')

const columns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '标题', dataIndex: 'title', width: 220, ellipsis: true },
  { title: '作者', dataIndex: 'userNickname', width: 110 },
  { title: '类型', dataIndex: 'type', width: 70 },
  { title: '审核状态', dataIndex: 'auditStatus', width: 100, slot: 'auditStatus' },
  { title: '发布时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action', fixed: 'right' },
]

const batchActions = [
  { key: 'approve', label: '批量通过' },
  { key: 'reject', label: '批量拒绝', danger: true },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await contentApi.getPostList({ page: page.value, pageSize: pageSize.value, ...filter })
    list.value = (res.data?.data?.list || res.data?.list || []) as Post[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    // handled by interceptor
  } finally {
    loading.value = false
  }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.keyword = ''; filter.auditStatus = undefined; onSearch() }
function onTableChange() { fetchList() }

function onQuickAudit(record: Post, action: 'approve' | 'reject') {
  auditRecord.value = record
  pendingAction.value = action
  if (action === 'approve') {
    onAuditSubmit('approve', '')
  } else {
    auditVisible.value = true
  }
}

function onOpenReject(record: Post) {
  auditRecord.value = record
  pendingAction.value = 'reject'
  auditVisible.value = true
}

async function onAuditSubmit(action: 'approve' | 'reject', remark: string) {
  if (!auditRecord.value) return
  auditLoading.value = true
  try {
    if (action === 'approve') {
      await contentApi.approvePost(Number(auditRecord.value.id), remark)
    } else {
      await contentApi.rejectPost(Number(auditRecord.value.id), remark)
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

async function onBatchAction(action: string, keys: (string | number)[]) {
  auditLoading.value = true
  try {
    await auditApi.batchAudit({
      type: 'post',
      ids: keys.map(Number),
      action: action as 'approve' | 'reject',
      remark: action === 'reject' ? '批量拒绝' : undefined,
    })
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
