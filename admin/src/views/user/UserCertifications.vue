<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.status" placeholder="审核状态" allow-clear style="width:120px">
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
        @change="onTableChange"
      >
        <template #studentCardImage="{ record }">
          <a-image :src="record.studentCardImage" :width="80" :height="50" style="object-fit:cover;border-radius:4px;cursor:pointer" />
        </template>
        <template #studentCertStatus="{ record }">
          <StatusTag :status="record.studentCertStatus" type="audit" />
        </template>
        <template #action="{ record }">
          <template v-if="record.studentCertStatus === 'pending'">
            <a-space>
              <a-button type="primary" size="small" @click="onAudit(record, 'approve')">通过</a-button>
              <a-button danger size="small" @click="onAudit(record, 'reject')">拒绝</a-button>
            </a-space>
          </template>
          <span v-else style="color:#9ca3af">-</span>
        </template>
      </DataTable>
    </div>

    <!-- 审核弹窗 -->
    <AuditModal
      v-model:visible="auditVisible"
      :title="`学生认证审核 - ${auditUser?.nickname}`"
      :images="auditUser ? [auditUser.studentCardImage] : []"
      @submit="onAuditSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { userApi } from '@/api/user'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import AuditModal from '@/components/common/AuditModal.vue'
import type { UserInfo } from '@/types/user'

const loading = ref(false)
const list = ref<UserInfo[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ status: undefined as string | undefined })

const auditVisible = ref(false)
const auditUser = ref<UserInfo | null>(null)

const columns = [
  { title: '用户ID', dataIndex: 'id', width: 70 },
  { title: '昵称', dataIndex: 'nickname', width: 120 },
  { title: '姓名', dataIndex: 'realName', width: 90 },
  { title: '学号', dataIndex: 'studentId', width: 120 },
  { title: '学校', dataIndex: 'school', width: 140 },
  { title: '学生证', dataIndex: 'studentCardImage', width: 100, slot: 'studentCardImage' },
  { title: '状态', dataIndex: 'studentCertStatus', width: 90, slot: 'studentCertStatus' },
  { title: '申请时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await userApi.getCertList({ page: page.value, pageSize: pageSize.value, status: filter.status })
    list.value = res.data.data.list
    total.value = res.data.data.total
  } catch { /* handled */ }
  finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.status = undefined; onSearch() }
function onTableChange() { fetchList() }

function onAudit(record: UserInfo, _action: string) {
  auditUser.value = record
  auditVisible.value = true
}

async function onAuditSubmit(action: 'approve' | 'reject', remark: string) {
  if (!auditUser.value) return
  if (action === 'approve') {
    await userApi.approveCert(auditUser.value.id)
  } else {
    await userApi.rejectCert(auditUser.value.id, remark)
  }
  message.success('操作成功')
  auditVisible.value = false
  fetchList()
}

fetchList()
</script>
