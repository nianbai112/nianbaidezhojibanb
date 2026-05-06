<template>
  <div class="page-container">
    <div class="page-title mb-4">回复管理</div>

    <a-card size="small" class="mb-4">
      <a-row :gutter="12">
        <a-col :span="3"><a-input v-model:value="filters.ratingId" placeholder="评分ID" allow-clear @change="fetchList" /></a-col>
        <a-col :span="3"><a-input v-model:value="filters.userId" placeholder="用户ID" allow-clear @change="fetchList" /></a-col>
        <a-col :span="3">
          <a-select v-model:value="filters.status" placeholder="状态" allow-clear @change="fetchList">
            <a-select-option value="approved">已通过</a-select-option>
            <a-select-option value="pending">待审核</a-select-option>
            <a-select-option value="rejected">已拒绝</a-select-option>
          </a-select>
        </a-col>
      </a-row>
    </a-card>

    <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'user'">
          <a-space><a-avatar :src="record.user?.avatar" size="small" /><span>{{ record.user?.nickname || '-' }}</span></a-space>
        </template>
        <template v-else-if="column.dataIndex === 'rating'">
          <span>{{ record.rating?.item?.name || '-' }} ({{ record.rating?.score }}分)</span>
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <a-tag :color="record.status === 'approved' ? 'success' : record.status === 'rejected' ? 'error' : 'warning'">
            {{ record.status === 'approved' ? '已通过' : record.status === 'rejected' ? '已拒绝' : '待审核' }}
          </a-tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a-space>
            <a v-if="record.status !== 'approved'" v-permission="'rating:audit'" @click="handleAudit(record, 'approved')">通过</a>
            <a v-if="record.status !== 'rejected'" v-permission="'rating:audit'" @click="handleAudit(record, 'rejected')">拒绝</a>
            <a-popconfirm title="确定删除该回复？" @confirm="handleDelete(record.id)"><a class="text-danger">删除</a></a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { ratingApi } from '@/api/rating'

const loading = ref(false)
const list = ref<any[]>([])
const filters = reactive({
  ratingId: '',
  userId: '',
  status: undefined as string | undefined,
})
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const columns = [
  { title: '用户', dataIndex: 'user', width: 150 },
  { title: '评分信息', dataIndex: 'rating', width: 150 },
  { title: '内容', dataIndex: 'content', ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 160 },
]

const fetchList = async () => {
  loading.value = true
  try {
    const res = await ratingApi.getReplyList({
      page: pagination.current, pageSize: pagination.pageSize,
      ratingId: filters.ratingId || undefined,
      userId: filters.userId || undefined,
      status: filters.status,
    })
    const data = res.data as any
    list.value = data.list || []
    pagination.total = data.total || 0
  } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; fetchList() }

const handleAudit = async (record: any, status: string) => {
  try {
    await ratingApi.auditReply(record.id, { status })
    message.success(status === 'approved' ? '已通过' : '已拒绝')
    fetchList()
  } catch {}
}

const handleDelete = async (id: string) => {
  try { await ratingApi.deleteReply(id); message.success('已删除'); fetchList() } catch {}
}

onMounted(() => { fetchList() })
</script>
