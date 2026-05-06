<template>
  <div class="page-container table-page">
    <div class="table-toolbar">
      <div class="page-title">作品管理</div>
      <a-space>
        <a-select v-model:value="filters.contestId" placeholder="选择评选项目" style="width:200px" allow-clear @change="fetchList">
          <a-select-option v-for="c in contests" :key="c.id" :value="c.id">{{ c.title }}</a-select-option>
        </a-select>
        <a-select v-model:value="filters.status" placeholder="状态" style="width:100px" allow-clear @change="fetchList">
          <a-select-option value="pending">待审核</a-select-option>
          <a-select-option value="approved">已通过</a-select-option>
          <a-select-option value="rejected">已拒绝</a-select-option>
        </a-select>
        <a-input-search v-model:value="filters.keyword" placeholder="搜索标题/描述" style="width:180px" @search="fetchList" allow-clear />
      </a-space>
    </div>

    <div class="table-container">
      <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination" @change="handleTableChange" rowKey="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'image'">
            <a-image :src="record.imageUrl" :width="80" :height="60" style="object-fit:cover;border-radius:4px;cursor:pointer" @click="openDetail(record)" />
          </template>
          <template v-else-if="column.dataIndex === 'user'">
            <a-space>
              <a-avatar :src="record.user?.avatar" size="small" />
              <span>{{ record.user?.nickname || '-' }}</span>
            </a-space>
          </template>
          <template v-else-if="column.dataIndex === 'contest'">
            {{ record.contest?.title || '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <a-tag :color="statusColorMap[record.status]">{{ statusMap[record.status] || record.status }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-space>
              <a @click="openDetail(record)">查看</a>
              <a v-if="record.status === 'pending'" @click="handleAudit(record.id, 'approved')">通过</a>
              <a v-if="record.status === 'pending'" class="text-warning" @click="openReject(record)">拒绝</a>
              <a-popconfirm title="确定删除该作品？" @confirm="handleDelete(record.id)">
                <a class="text-danger">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <!-- 拒绝原因 -->
    <a-modal v-model:open="rejectVisible" title="拒绝原因" @ok="handleReject" :confirmLoading="auditing">
      <a-textarea v-model:value="rejectReason" :rows="3" placeholder="请填写拒绝原因" />
    </a-modal>

    <!-- 详情抽屉 -->
    <a-drawer v-model:open="detailVisible" title="作品详情" width="500">
      <div v-if="detailEntry">
        <a-image :src="detailEntry.imageUrl" style="width:100%;border-radius:8px;margin-bottom:16px" />
        <a-descriptions :column="1" size="small" bordered>
          <a-descriptions-item label="标题">{{ detailEntry.title || '-' }}</a-descriptions-item>
          <a-descriptions-item label="描述">{{ detailEntry.description || '-' }}</a-descriptions-item>
          <a-descriptions-item label="用户">{{ detailEntry.user?.nickname || '-' }}</a-descriptions-item>
          <a-descriptions-item label="所属评选">{{ detailEntry.contest?.title || '-' }}</a-descriptions-item>
          <a-descriptions-item label="票数">{{ detailEntry.voteCount }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="statusColorMap[detailEntry.status]">{{ statusMap[detailEntry.status] }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item v-if="detailEntry.rejectReason" label="拒绝原因">{{ detailEntry.rejectReason }}</a-descriptions-item>
          <a-descriptions-item label="提交时间">{{ detailEntry.createdAt }}</a-descriptions-item>
        </a-descriptions>
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { photoContestApi } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const route = useRoute()
const loading = ref(false)
const auditing = ref(false)
const rejectVisible = ref(false)
const detailVisible = ref(false)
const contests = ref<any[]>([])
const list = ref<any[]>([])
const rejectReason = ref('')
const currentEntry = ref<any>(null)
const detailEntry = ref<any>(null)
const filters = reactive({
  contestId: (route.query.contestId as string) || undefined,
  status: undefined as string | undefined,
  keyword: '',
})
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const statusMap: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
const statusColorMap: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'error' }

const columns = [
  { title: '照片', dataIndex: 'image', width: 100 },
  { title: '用户', dataIndex: 'user', width: 130 },
  { title: '标题', dataIndex: 'title', width: 150 },
  { title: '评选', dataIndex: 'contest', width: 120 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '票数', dataIndex: 'voteCount', width: 70 },
  { title: '提交时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140 },
]

const fetchContests = async () => {
  const res = await photoContestApi.getContests({ page: 1, pageSize: 100, regionId: userStore.regionId })
  contests.value = res.data.list
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await photoContestApi.getEntries({
      page: pagination.current,
      pageSize: pagination.pageSize,
      contestId: filters.contestId,
      status: filters.status,
      keyword: filters.keyword || undefined,
    })
    list.value = res.data.list
    pagination.total = res.data.total
  } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; fetchList() }

const handleAudit = async (id: string, status: string) => {
  try {
    await photoContestApi.auditEntry(id, { status })
    message.success(status === 'approved' ? '已通过' : '已拒绝')
    fetchList()
  } catch {}
}

const openReject = (record: any) => { currentEntry.value = record; rejectReason.value = ''; rejectVisible.value = true }
const handleReject = async () => {
  if (!rejectReason.value) return message.warning('请填写拒绝原因')
  auditing.value = true
  try {
    await photoContestApi.auditEntry(currentEntry.value.id, { status: 'rejected', rejectReason: rejectReason.value })
    message.success('已拒绝')
    rejectVisible.value = false
    fetchList()
  } finally { auditing.value = false }
}

const handleDelete = async (id: string) => {
  try { await photoContestApi.deleteEntry(id); message.success('已删除'); fetchList() } catch {}
}

const openDetail = (record: any) => { detailEntry.value = record; detailVisible.value = true }

onMounted(() => { fetchContests(); fetchList() })
</script>
