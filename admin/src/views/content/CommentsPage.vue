<template>
  <div class="page-container">
    <PageHeader title="评论管理" subtitle="管理用户评论，支持审核、删除、置顶等操作" icon="ChatDotRound">
      <template #actions>
        <el-button @click="loadComments">刷新</el-button>
        <el-button v-if="hasDeletePermission" type="danger" :disabled="!selectedRows.length" @click="batchDelete">批量删除</el-button>
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
      <el-input v-model="filters.postId" placeholder="帖子ID" clearable style="width: 180px" />
      <el-input v-model="filters.userId" placeholder="评论者ID" clearable style="width: 180px" />
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
              <div v-if="row.parent" class="comment-context">回复：{{ row.parent.userName || '用户' }} / {{ row.parent.content }}</div>
              <div class="comment-post">帖子：{{ row.postTitle || '-' }}</div>
              <div class="comment-flags">
                <el-tag v-if="row.isTop" type="danger" size="small">置顶</el-tag>
                <el-tag v-if="row.reportCount" type="warning" size="small">举报 {{ row.reportCount }}</el-tag>
                <el-tag :type="row.countedInPost ? 'success' : 'info'" size="small">{{ row.countedInPost ? '计入评论数' : '不计数' }}</el-tag>
              </div>
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
        <el-table-column label="审核" width="90">
          <template #default="{ row }">
            <StatusTag :status="row.auditStatus || 'pending'" />
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
            <el-button size="small" link type="primary" @click="viewDetail(row)">详情</el-button>
            <el-button size="small" link @click="viewPost(row)">查看帖子</el-button>
            <el-button v-if="hasAuditPermission" size="small" link type="warning" v-show="row.status === 'active'" @click="hideComment(row)">隐藏</el-button>
            <el-button v-if="hasAuditPermission" size="small" link type="success" v-show="row.status !== 'active'" @click="restoreComment(row)">恢复</el-button>
            <el-button v-if="hasDeletePermission" size="small" link type="danger" @click="deleteComment(row)">删除</el-button>
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

    <el-drawer v-model="showDetail" title="评论详情" size="640px">
      <template v-if="detailData">
        <div class="detail-section">
          <h4>评论内容</h4>
          <div class="detail-content">{{ detailData.baseInfo?.content || detailData.content || '-' }}</div>
          <div class="detail-tags">
            <el-tag v-if="detailData.baseInfo?.isAnonymous || detailData.isAnonymous" type="warning" size="small">匿名评论</el-tag>
            <StatusTag :status="detailData.baseInfo?.status || detailData.status" />
            <StatusTag :status="detailData.baseInfo?.auditStatus || detailData.auditStatus" />
            <el-tag v-if="detailData.baseInfo?.isTop || detailData.isTop" type="danger" size="small">置顶</el-tag>
            <el-tag :type="detailData.counterImpact?.countedInPost ? 'success' : 'info'" size="small">
              {{ detailData.counterImpact?.countedInPost ? '计入帖子评论数' : '不计入帖子评论数' }}
            </el-tag>
          </div>
        </div>

        <div class="detail-section">
          <h4>{{ detailData.baseInfo?.isAnonymous || detailData.isAnonymous ? '真实评论者（仅审核权限可见）' : '作者' }}</h4>
          <div class="detail-user">
            <el-avatar :size="36" :src="detailData.author?.avatar || detailData.userAvatar">{{ (detailData.author?.nickname || detailData.userName || '?')[0] }}</el-avatar>
            <div>
              <div>{{ detailData.author?.nickname || detailData.userName || '-' }}</div>
              <div class="muted">UID {{ detailData.author?.uid || detailData.userUid || '-' }} / {{ detailData.author?.status || detailData.userStatus || '-' }}</div>
            </div>
          </div>
          <el-alert v-if="detailData.baseInfo?.isAnonymous || detailData.isAnonymous" type="warning" :closable="false" title="小程序不返回真实评论者；此处用于审核与处置。" />
          <div class="detail-actions">
            <el-button size="small" @click="viewUserPosts(detailData.author?.id || detailData.userId)">查看该用户帖子</el-button>
            <el-button size="small" @click="viewUserComments(detailData.author?.id || detailData.userId)">查看该用户评论</el-button>
          </div>
          <div class="risk-line">
            <span>帖子 {{ detailData.author?.risk?.postCount || 0 }}</span>
            <span>评论 {{ detailData.author?.risk?.commentCount || 0 }}</span>
            <span>被举报 {{ detailData.author?.risk?.reportCount || detailData.reportCount || 0 }}</span>
            <span v-if="detailData.author?.risk?.muted" class="danger">已禁言</span>
          </div>
        </div>

        <div class="detail-section" v-if="detailData.post">
          <h4>所属帖子</h4>
          <div class="detail-row"><span>标题：</span>{{ detailData.post.title || detailData.post.content?.slice(0, 40) || '-' }}</div>
          <div class="detail-row"><span>作者：</span>{{ detailData.post.user?.nickname || detailData.postAuthorName || '-' }}</div>
          <div class="detail-row"><span>区域：</span>{{ detailData.post.region?.name || detailData.regionName || '-' }}</div>
          <div class="detail-row"><span>评论计数：</span>{{ detailData.counterImpact?.postCommentCount ?? detailData.postCommentCount ?? 0 }}</div>
        </div>

        <div class="detail-section" v-if="detailData.parent">
          <h4>父评论</h4>
          <div class="context-box">
            <strong>{{ detailData.parent.user?.nickname || detailData.parent.userName || '用户' }}</strong>
            <p>{{ detailData.parent.content }}</p>
          </div>
        </div>

        <div class="detail-section" v-if="detailData.replies?.length || detailData.replyPreview?.length">
          <h4>回复上下文</h4>
          <div v-for="reply in (detailData.replies || detailData.replyPreview || [])" :key="reply.id" class="context-box">
            <strong>{{ reply.user?.nickname || reply.userName || '用户' }}</strong>
            <p>{{ reply.content }}</p>
          </div>
        </div>

        <div class="detail-section">
          <h4>计数与风险</h4>
          <div class="risk-line">
            <span>存储点赞 {{ detailData.likes?.storedCount ?? detailData.likeCount ?? 0 }}</span>
            <span>真实点赞 {{ detailData.likes?.realCount ?? '-' }}</span>
            <span>点赞差异 {{ detailData.likes?.drift ?? '-' }}</span>
            <span>举报 {{ detailData.reports?.total ?? detailData.reportCount ?? 0 }}</span>
          </div>
          <div v-if="detailData.lottery" class="detail-row"><span>抽奖：</span>{{ detailData.lottery.title }} / {{ detailData.lottery.status }}</div>
        </div>

        <div class="detail-section" v-if="detailData.timeline?.length">
          <h4>处理时间线</h4>
          <div v-for="item in detailData.timeline" :key="`${item.action}-${item.at}`" class="timeline-row">
            <span>{{ item.title }}</span>
            <TimeText :time="item.at" />
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'
import RegionSelector from '@/components/common/RegionSelector.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const hasAuditPermission = ref(auth.permissions.includes('comment:audit'))
const hasDeletePermission = ref(auth.permissions.includes('comment:delete'))
const loading = ref(false)
const comments = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedRows = ref<any[]>([])
const dateRange = ref<any[]>([])
const showDetail = ref(false)
const detailData = ref<any>(null)

const routeParam = (key: string) => {
  const value = route.query[key]
  return Array.isArray(value) ? String(value[0] || '') : String(value || '')
}

const stats = reactive({
  total: 0,
  today: 0,
  pending: 0,
  deleted: 0
})

const filters = reactive({
  postId: routeParam('postId'),
  userId: routeParam('userId'),
  keyword: '',
  status: '',
  regionId: ''
})

import { formatDateRangeParams } from '@/utils/date'

const loadComments = async () => {
  loading.value = true
  try {
    const params: any = {
      page: page.value,
      pageSize: pageSize.value,
      ...filters
    }
    if (dateRange.value?.length === 2) {
      const { startDate, endDate } = formatDateRangeParams(dateRange.value)
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
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
  filters.postId = ''
  filters.userId = ''
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
    router.push({ path: '/content/posts', query: { id: row.postId } })
  }
}

const viewUserPosts = (userId?: string) => {
  if (!userId) return
  router.push({ path: '/content/posts', query: { userId } })
}

const viewUserComments = (userId?: string) => {
  if (!userId) return
  filters.userId = userId
  page.value = 1
  loadComments()
}

const viewDetail = async (row: any) => {
  detailData.value = row
  showDetail.value = true
  try {
    const res = await request.get(`/admin/comments/${row.id}`)
    detailData.value = res.data || row
  } catch (e: any) {
    ElMessage.error(e?.message || '详情加载失败')
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
.comment-context,
.comment-post { font-size: 12px; color: #94a3b8; }
.comment-flags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.user-cell { display: flex; align-items: center; gap: 8px; }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 14px; border: 1px solid rgba(255,255,255,0.8); }
.detail-section { padding: 14px 0; border-bottom: 1px solid #e5e7eb; }
.detail-section h4 { margin: 0 0 10px; font-size: 15px; color: #111827; }
.detail-content { white-space: pre-wrap; line-height: 1.7; color: #1f2937; }
.detail-tags,
.risk-line { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; color: #64748b; font-size: 13px; }
.detail-user { display: flex; align-items: center; gap: 10px; }
.detail-actions { display: flex; gap: 8px; margin-top: 10px; }
.muted { color: #94a3b8; font-size: 12px; }
.danger { color: #dc2626; }
.detail-row { font-size: 13px; color: #334155; line-height: 1.9; }
.detail-row span { color: #64748b; }
.context-box { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin-bottom: 8px; }
.context-box p { margin: 6px 0 0; color: #475569; line-height: 1.6; }
.timeline-row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: 13px; color: #475569; }
</style>
