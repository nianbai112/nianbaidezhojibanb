<template>
  <div class="page-container">
    <PageHeader title="评论管理" subtitle="管理用户评论，支持审核、删除、置顶等操作" icon="ChatDotRound">
      <template #actions>
        <el-button @click="loadComments">刷新</el-button>
        <el-button type="danger" :disabled="!selectedRows.length" @click="batchDelete">批量删除</el-button>
      </template>
    </PageHeader>

    <div class="stats-row glass-card">
      <div class="stat-item">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">总评论数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.today }}</div>
        <div class="stat-label">今日新增</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.pending }}</div>
        <div class="stat-label">待审核</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.deleted }}</div>
        <div class="stat-label">已删除</div>
      </div>
    </div>

    <SearchPanel @search="loadComments" @reset="resetFilters">
      <el-input v-model="filters.keyword" placeholder="搜索评论内容" clearable style="width: 200px" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px">
        <el-option label="正常" value="active" />
        <el-option label="已隐藏" value="hidden" />
        <el-option label="待审核" value="pending" />
        <el-option label="已删除" value="deleted" />
      </el-select>
      <RegionSelector v-model="filters.regionId" width="160px" />
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 240px" />
    </SearchPanel>

    <div class="glass-card" style="padding: 0;">
      <el-table :data="comments" v-loading="loading" @selection-change="handleSelectionChange" border stripe>
        <el-table-column type="selection" width="55" />
        <el-table-column label="评论内容" min-width="200">
          <template #default="{ row }">
            <div class="comment-cell">
              <div class="comment-text">{{ row.content }}</div>
              <div class="comment-post">帖子：{{ row.postTitle || '-' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="评论者" width="140">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="28" :src="row.userAvatar">{{ (row.userName || '?')[0] }}</el-avatar>
              <span>{{ row.userName || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="regionName" label="区域" width="100" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag :status="row.status || 'active'" />
          </template>
        </el-table-column>
        <el-table-column label="点赞" width="70" prop="likeCount" />
        <el-table-column label="回复" width="70" prop="replyCount" />
        <el-table-column label="发布时间" width="160">
          <template #default="{ row }">
            <TimeText :time="row.createdAt" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="viewPost(row)">查看帖子</el-button>
            <el-button size="small" link type="warning" v-if="row.status === 'active'" @click="hideComment(row)">隐藏</el-button>
            <el-button size="small" link type="success" v-if="row.status !== 'active'" @click="restoreComment(row)">恢复</el-button>
            <el-button size="small" link type="danger" @click="deleteComment(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadComments"
          @size-change="loadComments"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'
import RegionSelector from '@/components/common/RegionSelector.vue'

const router = useRouter()
const loading = ref(false)
const comments = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedRows = ref<any[]>([])
const dateRange = ref<any[]>([])

const stats = reactive({
  total: 0,
  today: 0,
  pending: 0,
  deleted: 0
})

const filters = reactive({
  keyword: '',
  status: '',
  regionId: ''
})

const loadComments = async () => {
  loading.value = true
  try {
    const params: any = {
      page: page.value,
      pageSize: pageSize.value,
      ...filters
    }
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]?.toISOString()
      params.endDate = dateRange.value[1]?.toISOString()
    }
    const res = await request.get('/admin/comments', { params })
    comments.value = res.data?.list || []
    total.value = res.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
    comments.value = []
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const res = await request.get('/admin/comments/stats')
    if (res.data) Object.assign(stats, res.data)
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.status = ''
  filters.regionId = ''
  dateRange.value = []
  loadComments()
}

const handleSelectionChange = (rows: any[]) => {
  selectedRows.value = rows
}

const viewPost = (row: any) => {
  if (row.postId) {
    router.push(`/content/posts?id=${row.postId}`)
  }
}

const hideComment = async (row: any) => {
  try {
    await request.put(`/admin/comments/${row.id}/audit`, { status: 'hidden' })
    ElMessage.success('评论已隐藏')
    loadComments()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

const restoreComment = async (row: any) => {
  try {
    await request.put(`/admin/comments/${row.id}/audit`, { status: 'active' })
    ElMessage.success('评论已恢复')
    loadComments()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

const deleteComment = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定删除该评论？', '确认')
    await request.delete(`/admin/comments/${row.id}`)
    ElMessage.success('评论已删除')
    loadComments()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

const batchDelete = async () => {
  if (!selectedRows.value.length) return
  try {
    await ElMessageBox.confirm(`确定删除 ${selectedRows.value.length} 条评论？`, '确认')
    await Promise.all(selectedRows.value.map(row => request.delete(`/admin/comments/${row.id}`)))
    ElMessage.success('批量删除成功')
    loadComments()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

onMounted(() => {
  loadComments()
  loadStats()
})
</script>

<style scoped>
.page-container { padding: 24px; }
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 20px;
  margin-bottom: 16px;
}
.stat-item { text-align: center; }
.stat-value { font-size: 24px; font-weight: 700; color: #1e293b; }
.stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }
.comment-cell { display: flex; flex-direction: column; gap: 4px; }
.comment-text { font-size: 14px; }
.comment-post { font-size: 12px; color: #94a3b8; }
.user-cell { display: flex; align-items: center; gap: 8px; }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 16px; border: 1px solid rgba(255,255,255,0.8); }
</style>
