<template>
  <div class="page-container table-page">
    <div class="table-toolbar">
      <div class="page-title">待审核照片</div>
      <a-space>
        <a-select v-model:value="contestId" placeholder="选择评选项目" style="width:220px" allow-clear @change="fetchList">
          <a-select-option v-for="c in contests" :key="c.id" :value="c.id">{{ c.title }}</a-select-option>
        </a-select>
        <a-button v-if="selectedIds.length" type="primary" @click="batchAudit('approved')">批量通过 ({{ selectedIds.length }})</a-button>
        <a-button v-if="selectedIds.length" danger @click="openBatchReject">批量拒绝 ({{ selectedIds.length }})</a-button>
      </a-space>
    </div>

    <div class="table-container">
      <a-table :dataSource="list" :columns="columns" :loading="loading" :pagination="pagination"
        @change="handleTableChange" rowKey="id" :row-selection="{ selectedRowKeys: selectedIds, onChange: onSelectChange }">
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
          <template v-else-if="column.dataIndex === 'action'">
            <a-space>
              <a-button size="small" type="primary" @click="handleAudit(record.id, 'approved')">通过</a-button>
              <a-button size="small" danger @click="openReject(record)">拒绝</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <!-- 拒绝原因弹窗 -->
    <a-modal v-model:open="rejectVisible" title="拒绝原因" @ok="handleReject" :confirmLoading="auditing">
      <a-textarea v-model:value="rejectReason" :rows="3" placeholder="请填写拒绝原因（会通知用户）" />
    </a-modal>

    <!-- 批量拒绝弹窗 -->
    <a-modal v-model:open="batchRejectVisible" title="批量拒绝原因" @ok="handleBatchReject" :confirmLoading="auditing">
      <a-textarea v-model:value="batchRejectReason" :rows="3" placeholder="请填写批量拒绝原因" />
    </a-modal>

    <!-- 作品详情抽屉 -->
    <a-drawer v-model:open="detailVisible" title="作品详情" width="480">
      <div v-if="detailEntry">
        <a-image :src="detailEntry.imageUrl" style="width:100%;border-radius:8px;margin-bottom:16px" />
        <a-descriptions :column="1" size="small" bordered>
          <a-descriptions-item label="标题">{{ detailEntry.title || '-' }}</a-descriptions-item>
          <a-descriptions-item label="描述">{{ detailEntry.description || '-' }}</a-descriptions-item>
          <a-descriptions-item label="用户">{{ detailEntry.user?.nickname || '-' }}</a-descriptions-item>
          <a-descriptions-item label="所属评选">{{ detailEntry.contest?.title || '-' }}</a-descriptions-item>
          <a-descriptions-item label="提交时间">{{ detailEntry.createdAt }}</a-descriptions-item>
        </a-descriptions>
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { photoContestApi } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const loading = ref(false)
const auditing = ref(false)
const rejectVisible = ref(false)
const batchRejectVisible = ref(false)
const detailVisible = ref(false)
const contestId = ref<string | undefined>()
const contests = ref<any[]>([])
const list = ref<any[]>([])
const selectedIds = ref<string[]>([])
const rejectReason = ref('')
const batchRejectReason = ref('')
const currentEntry = ref<any>(null)
const detailEntry = ref<any>(null)
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const columns = [
  { title: '照片', dataIndex: 'image', width: 100 },
  { title: '用户', dataIndex: 'user', width: 130 },
  { title: '标题', dataIndex: 'title', width: 150 },
  { title: '描述', dataIndex: 'description', ellipsis: true },
  { title: '评选', dataIndex: 'contest', width: 120 },
  { title: '提交时间', dataIndex: 'createdAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 140 },
]

const onSelectChange = (keys: any) => { selectedIds.value = keys as string[] }

const fetchContests = async () => {
  const res = await photoContestApi.getContests({ page: 1, pageSize: 100, regionId: userStore.regionId })
  contests.value = res.data.list
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await photoContestApi.getPendingEntries({
      page: pagination.current, pageSize: pagination.pageSize, contestId: contestId.value,
    })
    list.value = res.data.list
    pagination.total = res.data.total
    selectedIds.value = []
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

const openBatchReject = () => { batchRejectReason.value = ''; batchRejectVisible.value = true }
const handleBatchReject = async () => {
  if (!batchRejectReason.value) return message.warning('请填写拒绝原因')
  auditing.value = true
  try {
    await photoContestApi.batchAuditEntries({ ids: selectedIds.value, status: 'rejected', rejectReason: batchRejectReason.value })
    message.success('批量拒绝完成')
    batchRejectVisible.value = false
    fetchList()
  } finally { auditing.value = false }
}

const batchAudit = async (status: string) => {
  try {
    await photoContestApi.batchAuditEntries({ ids: selectedIds.value, status })
    message.success(`批量${status === 'approved' ? '通过' : '拒绝'}完成`)
    fetchList()
  } catch {}
}

const openDetail = (record: any) => { detailEntry.value = record; detailVisible.value = true }

onMounted(() => { fetchContests(); fetchList() })
</script>
