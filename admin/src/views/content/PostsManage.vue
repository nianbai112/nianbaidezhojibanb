<template>
  <div class="page-container">
    <PageHeader title="帖子管理" subtitle="管理所有帖子，支持审核、置顶、精华、删除等操作" icon="Document">
      <template #actions>
        <el-button @click="loadPosts" :loading="loading">刷新</el-button>
        <el-button type="primary" plain @click="router.push('/content/text-cover-templates')">文字封面模板</el-button>
        <el-button v-if="hasDeletePermission" type="danger" :disabled="!selectedRows.length" @click="batchDelete">批量删除</el-button>
        <el-button v-if="hasAuditPermission" type="success" :disabled="!selectedRows.length" @click="batchApprove">批量通过</el-button>
        <el-button v-if="hasAuditPermission" type="warning" :disabled="!selectedRows.length" @click="batchReject">批量驳回</el-button>
      </template>
    </PageHeader>

    <div class="stats-row glass-card">
      <div class="stat-item">
        <div class="stat-value">{{ stats.totalPosts }}</div>
        <div class="stat-label">总帖子数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.todayPosts }}</div>
        <div class="stat-label">今日发帖</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.pendingAudit }}</div>
        <div class="stat-label">待审核</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.reportedPosts }}</div>
        <div class="stat-label">举报内容</div>
      </div>
    </div>

    <SearchPanel @search="loadPosts" @reset="resetFilters">
      <el-input v-model="filters.keyword" placeholder="搜索标题/内容" clearable style="width: 200px" />
      <el-input v-model="filters.id" placeholder="帖子ID" clearable style="width: 180px" />
      <el-input v-model="filters.userId" placeholder="发布者ID" clearable style="width: 180px" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px">
        <el-option label="待审核" value="PENDING" />
        <el-option label="已发布" value="PUBLISHED" />
        <el-option label="已驳回" value="REJECTED" />
        <el-option label="已删除" value="DELETED" />
      </el-select>
      <el-select v-model="filters.type" placeholder="类型" clearable style="width: 120px">
        <el-option label="文本" value="TEXT" />
        <el-option label="图片" value="IMAGE" />
        <el-option label="视频" value="VIDEO" />
        <el-option label="投票" value="VOTE" />
      </el-select>
      <el-select v-model="filters.auditStatus" placeholder="审核状态" clearable style="width: 120px">
        <el-option label="待审核" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已拒绝" value="rejected" />
      </el-select>
      <RegionSelector v-model="filters.regionId" width="160px" />
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 240px" />
    </SearchPanel>

    <div class="glass-card" style="padding: 0;">
      <el-table :data="posts" v-loading="loading" @selection-change="handleSelectionChange" border stripe>
        <el-table-column type="selection" width="55" />
        <el-table-column label="帖子内容" min-width="250">
          <template #default="{ row }">
            <div class="post-cell">
              <div v-if="row.images?.length" class="post-images">
                <el-image v-for="(img, i) in row.images.slice(0, 3)" :key="i" :src="img" style="width: 48px; height: 48px; border-radius: 6px;" fit="cover" :preview-src-list="row.images" :initial-index="i" />
              </div>
              <div class="post-title">{{ row.title || row.content?.slice(0, 60) || '-' }}</div>
              <div class="post-meta">
                <el-tag v-if="row.isAnonymous" type="warning" size="small" style="margin-right: 4px;">匿名</el-tag>
                <el-tag v-if="row.isTop" type="danger" size="small" style="margin-right: 4px;">置顶</el-tag>
                <el-tag v-if="row.isEssence" type="warning" size="small" style="margin-right: 4px;">精华</el-tag>
                <el-tag size="small" :type="postTypeTag(row.type)">{{ postTypeText(row.type) }}</el-tag>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="发布者" width="120">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="28" :src="row.userAvatar">{{ (row.userNickname || '?')[0] }}</el-avatar>
              <span class="user-name">{{ row.userNickname || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="regionName" label="区域" width="100" />
        <el-table-column label="互动" width="150">
          <template #default="{ row }">
            <div class="互动-stats">
              <span>浏览 {{ row.viewCount || 0 }}</span>
              <span>点赞 {{ row.likeCount || 0 }}</span>
              <span>评论 {{ row.commentCount || 0 }}</span>
              <span v-if="row.reportCount" style="color: #f56c6c;">举报 {{ row.reportCount }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="160">
          <template #default="{ row }">
            <TimeText :time="row.createdAt" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="viewDetail(row)">详情</el-button>
            <el-button size="small" link type="primary" @click="copyPostId(row.id)">复制ID</el-button>
            <el-button v-if="hasAuditPermission" size="small" link type="success" v-show="row.auditStatus !== 'approved'" @click="approvePost(row)">通过</el-button>
            <el-button v-if="hasAuditPermission" size="small" link type="warning" v-show="row.auditStatus !== 'rejected'" @click="rejectPost(row)">驳回</el-button>
            <el-dropdown v-if="hasDeletePermission || hasTopPermission" trigger="click" @command="(cmd: string) => handleCommand(cmd, row)">
              <el-button size="small" link type="primary">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="hasAuditPermission" command="ai-comment">创建AI评论任务</el-dropdown-item>
                  <el-dropdown-item v-if="hasTopPermission" :command="row.isTop ? 'untop' : 'top'">{{ row.isTop ? '取消置顶' : '置顶' }}</el-dropdown-item>
                  <el-dropdown-item v-if="hasTopPermission" :command="row.isEssence ? 'unessence' : 'essence'">{{ row.isEssence ? '取消精华' : '精华' }}</el-dropdown-item>
                  <el-dropdown-item v-if="hasDeletePermission" command="delete" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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
          @current-change="loadPosts"
          @size-change="loadPosts"
        />
      </div>
    </div>

    <el-drawer v-model="showDetail" title="帖子详情" size="600px">
      <template v-if="detailData">
        <div class="detail-section">
          <h4>基本信息</h4>
          <div class="detail-row detail-row-id">
            <span class="label">帖子ID：</span>
            <code>{{ detailData.id }}</code>
            <el-button size="small" type="primary" plain @click="copyPostId(detailData.id)">复制ID</el-button>
            <el-button size="small" type="primary" plain @click="openAiCommentTask(detailData)">创建AI评论任务</el-button>
          </div>
          <div class="detail-row"><span class="label">{{ detailData.isAnonymous ? '真实发布者（仅审核权限可见）' : '发布者' }}：</span>{{ detailData.user?.nickname || '-' }}</div>
          <div class="detail-row"><span class="label">区域：</span>{{ detailData.region?.name || '-' }}</div>
          <div class="detail-row"><span class="label">类型：</span>{{ postTypeText(detailData.type) }}</div>
          <div class="detail-row"><span class="label">状态：</span><StatusTag :status="detailData.status" /></div>
          <div class="detail-row"><span class="label">审核状态：</span><StatusTag :status="detailData.auditStatus" /></div>
          <div v-if="detailData.auditReason" class="detail-row detail-row-block">
            <span class="label">审核原因：</span>
            <div class="audit-reason-card">
              <el-tag size="small" :type="detailData.auditStatus === 'rejected' ? 'danger' : detailData.auditStatus === 'pending' ? 'warning' : 'success'">
                {{ detailData.auditStatus === 'rejected' ? '拒绝说明' : detailData.auditStatus === 'pending' ? '待复核说明' : '审核说明' }}
              </el-tag>
              <span>{{ detailData.auditReason }}</span>
            </div>
          </div>
          <div class="detail-row"><span class="label">发布时间：</span>{{ detailData.createdAt }}</div>
        </div>
        <div v-if="detailData.isAnonymous" class="detail-section">
          <h4>匿名溯源</h4>
          <el-alert type="warning" :closable="false" title="小程序只会展示匿名名称和头像；此处为审核追责保留的真实作者。" />
          <div class="detail-row"><span class="label">匿名展示：</span>{{ detailData.anonymousName || '匿名用户' }}</div>
          <div class="detail-row"><span class="label">真实用户 ID：</span><code>{{ detailData.user?.id || '-' }}</code></div>
        </div>
        <div class="detail-section">
          <h4>内容</h4>
          <div class="detail-content">{{ detailData.content }}</div>
        </div>
        <div class="detail-section" v-if="detailData.images?.length">
          <h4>图片/视频</h4>
          <div class="detail-images">
            <el-image v-for="(img, i) in detailData.images" :key="i" :src="img" style="width: 120px; height: 120px; border-radius: 6px; margin: 4px;" fit="cover" :preview-src-list="detailData.images" />
          </div>
        </div>
        <div class="detail-section" v-if="detailData.topics?.length">
          <h4>话题</h4>
          <el-tag v-for="t in detailData.topics" :key="t" style="margin-right: 4px;">{{ t }}</el-tag>
        </div>
        <div class="detail-section" v-if="detailData.votes?.length">
          <h4>投票</h4>
          <div v-for="v in detailData.votes" :key="v.id" style="margin-bottom: 8px;">
            <div style="font-weight: 600;">{{ v.title }}</div>
            <div v-for="opt in v.options" :key="opt.id" style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
              <span>{{ opt.text }}</span>
              <el-progress :percentage="Math.round(opt.count / Math.max(1, v.options.reduce((s: number, o: any) => s + o.count, 0)) * 100)" style="flex: 1;" />
              <span>{{ opt.count }}票</span>
            </div>
          </div>
        </div>
        <div class="detail-section">
          <h4>统计</h4>
          <div class="detail-stats">
            <span>浏览 {{ detailData.viewCount || 0 }}</span>
            <span>点赞 {{ detailData.likeCount || 0 }}</span>
            <span>评论 {{ detailData.commentCount || 0 }}</span>
            <span>收藏 {{ detailData.favoriteCount || 0 }}</span>
            <span>举报 {{ detailData.reportCount || 0 }}</span>
          </div>
        </div>
        <div class="detail-section" v-if="detailData.counterCheck">
          <h4>计数一致性</h4>
          <div class="counter-grid">
            <div class="counter-item" v-for="(item, key) in detailData.counterCheck" :key="key">
              <span class="counter-name">{{ counterLabel(key) }}</span>
              <strong :class="{ danger: item.diff !== 0 }">{{ item.stored }} / {{ item.real }}</strong>
              <small>差异 {{ item.diff }}</small>
            </div>
          </div>
        </div>
        <div class="detail-section" v-if="detailData.collaborators?.length">
          <h4>共创</h4>
          <div class="mini-list">
            <div class="mini-item" v-for="item in detailData.collaborators" :key="item.id">
              <span>{{ item.user?.nickname || item.userId }}</span>
              <el-tag size="small" :type="item.status === 'accepted' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'">{{ coStatusText(item.status) }}</el-tag>
            </div>
          </div>
        </div>
        <div class="detail-section" v-if="detailData.recentLikes?.length">
          <h4>最近点赞</h4>
          <div class="mini-list">
            <div class="mini-item" v-for="item in detailData.recentLikes" :key="item.id">
              <span>{{ item.user?.nickname || item.userId }}</span>
              <TimeText :time="item.createdAt" />
            </div>
          </div>
        </div>
        <div class="detail-section" v-if="detailData.reports?.length">
          <h4>举报</h4>
          <div class="mini-list">
            <div class="mini-item report" v-for="item in detailData.reports" :key="item.id">
              <span>{{ item.reason || '未填写原因' }}</span>
              <el-tag size="small" type="danger">{{ reportStatusText(item.status) }}</el-tag>
            </div>
          </div>
        </div>
        <div class="detail-section" v-if="detailData.mediaHealth">
          <h4>媒体健康</h4>
          <div class="detail-stats">
            <span>资源 {{ detailData.mediaHealth.total || 0 }}</span>
            <span>缺地址 {{ detailData.mediaHealth.missingUrl || 0 }}</span>
            <span>视频无封面 {{ detailData.mediaHealth.videoWithoutCover || 0 }}</span>
            <span>音频 {{ detailData.mediaHealth.audioCount || 0 }}</span>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import TimeText from '@/components/common/TimeText.vue'
import RegionSelector from '@/components/common/RegionSelector.vue'
import { useAuthStore } from '@/stores/auth'
import { formatDateRangeParams } from '@/utils/date'

const router = useRouter()
const auth = useAuthStore()
const hasAuditPermission = ref(auth.permissions.includes('post:audit'))
const hasDeletePermission = ref(auth.permissions.includes('post:delete'))
const hasTopPermission = ref(auth.permissions.includes('post:top'))
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const posts = ref<any[]>([])
const selectedRows = ref<any[]>([])
const dateRange = ref<Date[]>([])
const showDetail = ref(false)
const detailData = ref<any>(null)
const autoOpenedPostId = ref('')
const filters = reactive({ id: '', userId: '', keyword: '', status: '', type: '', auditStatus: '', regionId: '' })
const stats = reactive({ totalPosts: 0, todayPosts: 0, pendingAudit: 0, reportedPosts: 0 })

const postTypeText = (value: string) => ({ TEXT: '文本', IMAGE: '图片', VIDEO: '视频', VOTE: '投票', AUDIO: '音频' } as Record<string, string>)[value] || value || '-'
const postTypeTag = (value: string) => ({ TEXT: 'info', IMAGE: 'success', VIDEO: 'warning', VOTE: 'primary', AUDIO: 'danger' } as Record<string, any>)[value] || 'info'
const counterLabel = (value: string | number) => ({ viewCount: '浏览', likeCount: '点赞', commentCount: '评论', favoriteCount: '收藏', reportCount: '举报' } as Record<string, string>)[String(value)] || String(value)
const coStatusText = (value: string) => ({ accepted: '已接受', rejected: '已拒绝', pending: '待确认' } as Record<string, string>)[value] || value || '-'
const reportStatusText = (value: string) => ({ pending: '待处理', processing: '处理中', resolved: '已处理', rejected: '已驳回' } as Record<string, string>)[value] || value || '-'

const loadPosts = async () => {
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
    const res = await request.get('/admin/posts', { params })
    posts.value = res.data?.list || []
    total.value = res.data?.total || 0
    if (filters.id && autoOpenedPostId.value !== filters.id) {
      autoOpenedPostId.value = filters.id
      await viewDetail({ id: filters.id })
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
    posts.value = []
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const res = await request.get('/admin/posts/stats')
    if (res.data) Object.assign(stats, res.data)
  } catch (e: any) { ElMessage.error(e?.message || '加载统计失败') }
}

const resetFilters = () => {
  filters.id = ''
  filters.userId = ''
  filters.keyword = ''
  filters.status = ''
  filters.type = ''
  filters.auditStatus = ''
  filters.regionId = ''
  dateRange.value = []
  loadPosts()
}

const handleSelectionChange = (rows: any[]) => {
  selectedRows.value = rows
}

const viewDetail = async (row: any) => {
  try {
    const res = await request.get(`/admin/posts/${row.id}`)
    detailData.value = res.data || res
    showDetail.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '获取详情失败')
  }
}

const copyText = async (value: string) => {
  const text = String(value || '').trim()
  if (!text) return
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const copyPostId = async (postId: string) => {
  try {
    await copyText(postId)
    ElMessage.success('帖子ID已复制，可粘贴到AI任务目标帖子ID')
  } catch {
    ElMessage.error('复制失败，请手动选中帖子ID复制')
  }
}

const openAiCommentTask = (post: any) => {
  const query: Record<string, string> = {
    type: 'comment',
    targetPostId: String(post.id || ''),
  }
  const regionId = post.regionId || post.region?.id
  if (regionId) query.regionId = String(regionId)
  router.push({ path: '/ai/tasks', query })
}

const approvePost = async (row: any) => {
  try {
    await request.put(`/admin/posts/${row.id}/audit`, { status: 'approved' })
    ElMessage.success('已通过')
    loadPosts()
    loadStats()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

const rejectPost = async (row: any) => {
  try {
    const { value: reason } = await ElMessageBox.prompt('请输入驳回原因', '驳回', { inputPlaceholder: '驳回原因（可选）' })
    await request.put(`/admin/posts/${row.id}/audit`, { status: 'rejected', reason })
    ElMessage.success('已驳回')
    loadPosts()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

const handleCommand = async (cmd: string, row: any) => {
  try {
    if (cmd === 'top' || cmd === 'untop') {
      await request.put(`/admin/posts/${row.id}/top`)
      ElMessage.success(cmd === 'top' ? '已置顶' : '已取消置顶')
    } else if (cmd === 'essence' || cmd === 'unessence') {
      await request.put(`/admin/posts/${row.id}/essence`)
      ElMessage.success(cmd === 'essence' ? '已设为精华' : '已取消精华')
    } else if (cmd === 'ai-comment') {
      openAiCommentTask(row)
      return
    } else if (cmd === 'delete') {
      await ElMessageBox.confirm('确定删除该帖子？', '确认')
      await request.delete(`/admin/posts/${row.id}`)
      ElMessage.success('已删除')
    }
    loadPosts()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

const batchDelete = async () => {
  if (!selectedRows.value.length) return
  try {
    await ElMessageBox.confirm(`确定删除 ${selectedRows.value.length} 个帖子？`, '确认')
    await request.post('/admin/posts/batch', { ids: selectedRows.value.map(r => r.id), action: 'delete' })
    ElMessage.success('批量删除成功')
    loadPosts()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

const batchApprove = async () => {
  if (!selectedRows.value.length) return
  try {
    await request.post('/admin/posts/batch', { ids: selectedRows.value.map(r => r.id), action: 'audit', value: 'approved' })
    ElMessage.success('批量通过成功')
    loadPosts()
    loadStats()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

const batchReject = async () => {
  if (!selectedRows.value.length) return
  try {
    await request.post('/admin/posts/batch', { ids: selectedRows.value.map(r => r.id), action: 'audit', value: 'rejected' })
    ElMessage.success('批量驳回成功')
    loadPosts()
    loadStats()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

onMounted(() => {
  loadPosts()
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
.post-cell { display: flex; flex-direction: column; gap: 6px; }
.post-images { display: flex; gap: 4px; }
.post-title { font-size: 14px; font-weight: 500; }
.post-meta { display: flex; gap: 4px; }
.detail-row-id code { overflow: hidden; color: #1e40af; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.user-cell { display: flex; align-items: center; gap: 8px; }
.user-name { font-size: 13px; }
.互动-stats { display: flex; flex-direction: column; font-size: 12px; color: #64748b; }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 14px; border: 1px solid rgba(255,255,255,0.8); }
.detail-section { margin-bottom: 20px; }
.detail-section h4 { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
.detail-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; }
.detail-row-id { flex-wrap: wrap; padding: 10px 12px; border: 1px solid #bfdbfe; border-radius: 6px; background: #eff6ff; }
.detail-row-id code { max-width: 320px; }
.detail-row-block { align-items: flex-start; }
.detail-row .label { color: #64748b; min-width: 80px; }
.audit-reason-card { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 6px; background: #fff7f7; border: 1px solid #fecaca; color: #334155; line-height: 1.6; }
.detail-content { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.detail-images { display: flex; flex-wrap: wrap; gap: 4px; }
.detail-stats { display: flex; gap: 16px; font-size: 14px; color: #64748b; }
.counter-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.counter-item { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 4px; }
.counter-name { font-size: 12px; color: #64748b; }
.counter-item strong { color: #1e293b; }
.counter-item strong.danger { color: #dc2626; }
.counter-item small { color: #94a3b8; }
.mini-list { display: flex; flex-direction: column; gap: 8px; }
.mini-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; }
.mini-item.report { border-color: #fecaca; background: #fff7f7; }
</style>
