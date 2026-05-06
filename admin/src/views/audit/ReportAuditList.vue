<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.status" placeholder="处理状态" allow-clear style="width: 130px">
        <a-select-option value="pending">待处理</a-select-option>
        <a-select-option value="handled">已处理</a-select-option>
        <a-select-option value="ignored">已忽略</a-select-option>
      </a-select>
      <a-select v-model:value="filter.targetType" placeholder="举报对象" allow-clear style="width: 120px">
        <a-select-option value="post">帖子</a-select-option>
        <a-select-option value="comment">评论</a-select-option>
        <a-select-option value="user">用户</a-select-option>
        <a-select-option value="topic">话题</a-select-option>
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
        <template #targetType="{ record }">
          <a-tag>{{ targetTypeMap[record.targetType] || record.targetType }}</a-tag>
        </template>
        <template #status="{ record }">
          <StatusTag :status="reportStatusMap[record.status] || record.status" type="audit" />
        </template>
        <template #action="{ record }">
          <a-space>
            <template v-if="record.status === 'pending'">
              <a-button type="link" size="small" style="color: #10b981" @click="onHandle(record, 'handled')">通过举报</a-button>
              <a-button type="link" size="small" @click="onHandle(record, 'ignored')">忽略</a-button>
            </template>
            <span v-else style="color: #9ca3af">
              {{ record.handleResult || '--' }}
            </span>
          </a-space>
        </template>
      </DataTable>
    </div>

    <a-modal
      :open="handleVisible"
      :title="'举报处理'"
      :confirm-loading="handleLoading"
      @ok="onHandleSubmit"
      @cancel="handleVisible = false"
      :width="480"
    >
      <a-form layout="vertical">
        <a-form-item label="处理结果" required>
          <a-radio-group v-model:value="handleForm.result">
            <a-radio-button value="handled" style="color: #10b981">
              <check-outlined /> 通过举报
            </a-radio-button>
            <a-radio-button value="ignored" style="color: #6b7280">
              <stop-outlined /> 忽略
            </a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="处理备注" :required="handleForm.result === 'handled'">
          <a-textarea
            v-model:value="handleForm.remark"
            :rows="4"
            :placeholder="handleForm.result === 'handled' ? '请填写处理备注' : '可选，填写忽略原因'"
            :maxlength="500"
            show-count
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { CheckOutlined, StopOutlined } from '@ant-design/icons-vue'
import { contentApi } from '@/api/content'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import type { Report } from '@/types/content'

const loading = ref(false)
const handleLoading = ref(false)
const list = ref<Report[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ status: undefined as string | undefined, targetType: undefined as string | undefined })

const handleVisible = ref(false)
const handleRecord = ref<Report | null>(null)
const handleForm = reactive({ result: 'handled' as 'handled' | 'ignored', remark: '' })

const targetTypeMap: Record<string, string> = {
  post: '帖子',
  comment: '评论',
  user: '用户',
  topic: '话题',
}

const reportStatusMap: Record<string, string> = {
  pending: 'pending',
  handled: 'approved',
  ignored: 'rejected',
}

const columns = [
  { title: 'ID', dataIndex: 'id', width: 70 },
  { title: '举报人', dataIndex: 'reporterName', width: 110 },
  { title: '举报对象', dataIndex: 'targetType', width: 100, slot: 'targetType' },
  { title: '对象标题', dataIndex: 'targetTitle', width: 180, ellipsis: true },
  { title: '举报原因', dataIndex: 'reason', width: 140, ellipsis: true },
  { title: '补充描述', dataIndex: 'description', width: 180, ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 90, slot: 'status' },
  { title: '举报时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 160, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await contentApi.getReportList({ page: page.value, pageSize: pageSize.value, ...filter })
    list.value = (res.data?.data?.list || res.data?.list || []) as Report[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } catch {
    // handled by interceptor
  } finally {
    loading.value = false
  }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.status = undefined; filter.targetType = undefined; onSearch() }
function onTableChange() { fetchList() }

function onHandle(record: Report, result: 'handled' | 'ignored') {
  handleRecord.value = record
  handleForm.result = result
  handleForm.remark = ''
  handleVisible.value = true
}

async function onHandleSubmit() {
  if (!handleRecord.value) return
  if (handleForm.result === 'handled' && !handleForm.remark.trim()) {
    message.warning('请填写处理备注')
    return
  }
  handleLoading.value = true
  try {
    await contentApi.handleReport(Number(handleRecord.value.id), handleForm.result, handleForm.remark)
    message.success('处理成功')
    handleVisible.value = false
    fetchList()
  } catch {
    // handled by interceptor
  } finally {
    handleLoading.value = false
  }
}

fetchList()
</script>
