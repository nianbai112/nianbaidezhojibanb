<template>
  <div class="page-container">
    <FilterBar @search="onSearch" @reset="onReset" show-expand>
      <a-input v-model:value="filter.keyword" placeholder="评论内容/用户" allow-clear style="width:180px" />
      <a-input v-model:value="filter.postId" placeholder="帖子ID" allow-clear style="width:130px" />
      <a-select v-model:value="filter.regionId" placeholder="区域" allow-clear style="width:130px" :options="regionOpts" />
      <a-select v-model:value="filter.auditStatus" placeholder="审核状态" allow-clear style="width:110px">
        <a-select-option value="pending">待审核</a-select-option>
        <a-select-option value="approved">已通过</a-select-option>
        <a-select-option value="rejected">已拒绝</a-select-option>
      </a-select>
      <a-select v-model:value="filter.status" placeholder="显示状态" allow-clear style="width:110px">
        <a-select-option value="0">正常</a-select-option>
        <a-select-option value="1">已隐藏</a-select-option>
      </a-select>
      <template #expand>
        <a-range-picker v-model:value="filter.dateRange" style="width:240px" />
      </template>
    </FilterBar>

    <div class="page-card">
      <DataTable
        :columns="columns as any"
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
        <template #user="{ record }">
          <a-space :size="8">
            <a-avatar :src="record.userAvatar" :size="24" />
            <span>{{ record.userNickname || '-' }}</span>
          </a-space>
        </template>
        <template #auditStatus="{ record }"><StatusTag :status="record.auditStatus" type="audit" /></template>
        <template #statusSlot="{ record }">
          <a-tag v-if="record.status === 'active'" color="green">正常</a-tag>
          <a-tag v-else-if="record.status === 'hidden'" color="orange">隐藏</a-tag>
          <a-tag v-else-if="record.status === 'deleted'" color="red">已删除</a-tag>
          <a-tag v-else color="default">{{ record.status || '-' }}</a-tag>
        </template>
        <template #action="{ record }">
          <a-space>
            <template v-if="record.auditStatus === 'pending'">
              <a-button type="link" size="small" style="color:#10b981" @click="onAudit(record, 'approve')">通过</a-button>
              <a-button type="link" size="small" danger @click="onAudit(record, 'reject')">拒绝</a-button>
            </template>
            <a-button type="link" size="small" @click="$router.push(`/content/post/${record.postId}`)">查看帖子</a-button>
            <a-popconfirm title="确定删除?" @confirm="onDelete(record.id)">
              <a-button type="link" size="small" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </DataTable>
    </div>

    <AuditModal
      v-model:visible="auditVisible"
      title="评论审核"
      @submit="onAuditSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { contentApi } from '@/api/content'
import { areaApi } from '@/api/area'
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
const selectedKeys = ref<(string | number)[]>([])
const regionOpts = ref<{ label: string; value: string }[]>([])

const filter = reactive({
  keyword: '',
  postId: '',
  regionId: undefined as string | undefined,
  auditStatus: undefined as string | undefined,
  status: undefined as string | undefined,
  dateRange: undefined as [Dayjs, Dayjs] | undefined,
})

const auditVisible = ref(false)
const auditTarget = ref<any>(null)
const auditAction = ref<'approve' | 'reject'>('approve')

const columns = [
  { title: 'ID', dataIndex: 'id', width: 60 },
  { title: '用户', dataIndex: 'user', width: 110, slot: 'user' },
  { title: '内容', dataIndex: 'content', ellipsis: true, width: 220 },
  { title: '帖子ID', dataIndex: 'postId', width: 70 },
  { title: '区域', dataIndex: 'regionName', width: 80 },
  { title: '赞', dataIndex: 'likeCount', width: 50 },
  { title: '回复', dataIndex: 'replyCount', width: 50 },
  { title: '审核', dataIndex: 'auditStatus', width: 70, slot: 'auditStatus' },
  { title: '状态', dataIndex: 'statusSlot', width: 70, slot: 'statusSlot' },
  { title: '时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 220, slot: 'action', fixed: 'right' },
]

const batchActions = [
  { key: 'approve', label: '批量通过' },
  { key: 'reject', label: '批量拒绝', danger: true },
  { key: 'delete', label: '批量删除', danger: true },
]

async function fetchRegions() {
  try {
    const res = await areaApi.getList({ page: 1, pageSize: 100 })
    const body: any = res.data?.data || res.data || {}
    const regions = body.list || body.data || []
    regionOpts.value = (regions as any[]).map((r: any) => ({ label: r.name, value: r.id }))
  } catch { /* ignore */ }
}

async function fetchList() {
  loading.value = true
  try {
    const params: any = {
      page: page.value, pageSize: pageSize.value,
      keyword: filter.keyword || undefined,
      postId: filter.postId || undefined,
      regionId: filter.regionId,
      auditStatus: filter.auditStatus,
      status: filter.status,
    }
    if (filter.dateRange) {
      params.startDate = filter.dateRange[0].format('YYYY-MM-DD')
      params.endDate = filter.dateRange[1].format('YYYY-MM-DD')
    }
    const res = await contentApi.getCommentList(params)
    const body: any = res.data?.data || res.data || {}
    list.value = body.list || []
    total.value = body.total || 0
  } catch { message.error('加载评论列表失败') } finally { loading.value = false }
}

function onSearch() { page.value = 1; fetchList() }
function onReset() {
  filter.keyword = ''; filter.postId = ''; filter.regionId = undefined
  filter.auditStatus = undefined; filter.status = undefined; filter.dateRange = undefined
  onSearch()
}
function onTableChange() { fetchList() }

async function onBatchAction(action: string, keys: (string | number)[]) {
  try {
    if (action === 'approve') {
      for (const id of keys) { await contentApi.approveComment(Number(id)) }
    } else if (action === 'reject') {
      for (const id of keys) { await contentApi.rejectComment(Number(id), '批量拒绝') }
    } else if (action === 'delete') {
      for (const id of keys) { await contentApi.deleteComment(Number(id)) }
    }
    message.success('操作成功')
    selectedKeys.value = []
    fetchList()
  } catch { message.error('批量操作失败') }
}

function onAudit(record: any, action: 'approve' | 'reject') {
  auditTarget.value = record
  auditAction.value = action
  auditVisible.value = true
}

async function onAuditSubmit(action: 'approve' | 'reject', remark: string) {
  if (!auditTarget.value) return
  try {
    if (action === 'approve') await contentApi.approveComment(Number(auditTarget.value.id))
    else await contentApi.rejectComment(Number(auditTarget.value.id), remark)
    message.success('操作成功')
    auditVisible.value = false
    fetchList()
  } catch { message.error('审核失败') }
}

async function onDelete(id: number) {
  try {
    await contentApi.deleteComment(id)
    message.success('已删除')
    fetchList()
  } catch { message.error('删除失败') }
}

onMounted(() => { fetchRegions(); fetchList() })
</script>
