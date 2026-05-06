<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset">
      <a-select v-model:value="filter.status" placeholder="状态" allow-clear style="width:130px">
        <a-select-option value="pending">待处理</a-select-option>
        <a-select-option value="resolved">已处理</a-select-option>
        <a-select-option value="rejected">已驳回</a-select-option>
      </a-select>
    </FilterBar>

    <div class="page-card">
      <div class="page-header"><span class="page-title">举报管理</span></div>
      <DataTable :columns="columns" :data-source="list" :loading="loading" :total="total" v-model:page="page" v-model:page-size="pageSize" @change="fetchList">
        <template #reporter="{ record }">
          <a-space>
            <a-avatar :src="record.reporter?.avatar" :size="28" />
            <span>{{ record.reporter?.nickname || record.reporterId }}</span>
          </a-space>
        </template>
        <template #target="{ record }">
          <a-space>
            <a-avatar :src="record.target?.avatar" :size="28" />
            <span>{{ record.target?.nickname || record.targetId }}</span>
          </a-space>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'pending' ? 'orange' : record.status === 'resolved' ? 'green' : 'red'">
            {{ record.status === 'pending' ? '待处理' : record.status === 'resolved' ? '已处理' : '已驳回' }}
          </a-tag>
        </template>
        <template #action="{ record }">
          <a @click="onHandle(record)" v-if="record.status === 'pending'">处理</a>
        </template>
      </DataTable>
    </div>

    <a-modal v-model:open="handleVisible" title="处理举报" @ok="onHandleSubmit" :confirm-loading="handleLoading">
      <a-form layout="vertical">
        <a-form-item label="处理结果" required>
          <a-select v-model:value="handleForm.status">
            <a-select-option value="resolved">已处理</a-select-option>
            <a-select-option value="rejected">驳回</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="处理备注">
          <a-textarea v-model:value="handleForm.result" :rows="3" placeholder="可选" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { datingApi } from '@/api/dating'
import FilterBar from '@/components/common/FilterBar.vue'
import DataTable from '@/components/common/DataTable.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ status: undefined as string | undefined })

const columns = [
  { title: '举报人', dataIndex: 'reporter', width: 160, slot: 'reporter' },
  { title: '被举报人', dataIndex: 'target', width: 160, slot: 'target' },
  { title: '举报原因', dataIndex: 'reason', width: 160 },
  { title: '状态', dataIndex: 'status', width: 80, slot: 'status' },
  { title: '处理结果', dataIndex: 'result', width: 150, format: (v: any) => v || '-' },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 70, slot: 'action', fixed: 'right' },
]

async function fetchList() {
  loading.value = true
  try {
    const res = await datingApi.getReportList({ page: page.value, pageSize: pageSize.value, status: filter.status })
    list.value = (res.data?.data?.list || res.data?.list || []) as any[]
    total.value = res.data?.data?.total || res.data?.total || 0
  } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() { filter.status = undefined; onSearch() }

const handleVisible = ref(false)
const handleId = ref('')
const handleLoading = ref(false)
const handleForm = reactive({ status: 'resolved', result: '' })

function onHandle(record: any) { handleId.value = record.id; handleForm.status = 'resolved'; handleForm.result = ''; handleVisible.value = true }

async function onHandleSubmit() {
  handleLoading.value = true
  try {
    await datingApi.handleReport(handleId.value, { ...handleForm })
    message.success('已处理')
    handleVisible.value = false
    fetchList()
  } finally { handleLoading.value = false }
}

fetchList()
</script>
