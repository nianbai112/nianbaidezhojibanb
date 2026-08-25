<template>
  <div class="page-container">
    <PageHeader title="帖子管理" subtitle="管理所有帖子，支持审核、置顶、精华、删除等操作" icon="Document">
      <template #actions>
        <el-button @click="loadPosts" :loading="loading">刷新</el-button>
        <el-button type="primary" plain @click="router.push('/content/text-cover-templates')">文字封面模板</el-button>
      </template>
    </PageHeader>

    <!-- 指标带：大数字 + 小标签，细分隔线，可点击的项直接联动筛选 -->
    <div class="stats-strip glass-card">
      <div
        v-for="item in statItems"
        :key="item.label"
        class="stat-item"
        :class="{ clickable: !!item.status, active: !!item.status && filters.status === item.status }"
        @click="item.status && applyStatusTab(item.status)"
      >
        <div class="stat-value" :style="item.tone ? { color: item.tone } : {}">{{ fmtNum(item.value) }}</div>
        <div class="stat-label">{{ item.label }}</div>
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

    <div class="glass-card table-card">
      <!-- 二级工具条：状态页签（左）+ 总数（右） -->
      <div class="table-toolbar">
        <div class="status-tabs" role="tablist">
          <button
            v-for="tab in statusTabs"
            :key="tab.label"
            class="status-tab"
            :class="{ active: filters.status === tab.value }"
            role="tab"
            @click="applyStatusTab(tab.value)"
          >{{ tab.label }}</button>
        </div>
        <div class="toolbar-total">共 <b>{{ fmtNum(total) }}</b> 条</div>
      </div>

      <!-- 上下文批量操作条：仅在有选中行时出现 -->
      <transition name="batch-fade">
        <div v-if="selectedRows.length" class="batch-bar">
          <span class="batch-info">已选 <b>{{ selectedRows.length }}</b> 条</span>
          <div class="batch-actions">
            <el-button v-if="hasAuditPermission" size="small" type="success" plain @click="batchApprove">批量通过</el-button>
            <el-button v-if="hasAuditPermission" size="small" type="warning" plain @click="batchReject">批量驳回</el-button>
            <el-button v-if="hasDeletePermission" size="small" type="danger" plain @click="batchDelete">批量删除</el-button>
            <el-button size="small" link @click="clearSelection">清除选择</el-button>
          </div>
        </div>
      </transition>

      <el-table ref="tableRef" :data="posts" v-loading="loading" @selection-change="handleSelectionChange" stripe>
        <el-table-column type="selection" width="46" />
        <el-table-column label="帖子内容" min-width="280">
          <template #default="{ row }">
            <div class="post-cell">
              <div class="post-thumb">
                <el-image v-if="row.images?.length" :src="row.images[0]" fit="cover" :preview-src-list="row.images" :initial-index="0" />
                <span v-else class="thumb-fallback">{{ postTypeText(row.type)[0] }}</span>
                <span v-if="row.images?.length > 1" class="thumb-count">{{ row.images.length }}</span>
              </div>
              <div class="post-body">
                <div class="post-title">{{ row.title || row.content?.slice(0, 60) || '-' }}</div>
                <div class="post-meta">
                  <el-tag v-if="row.isAnonymous" type="warning" size="small">匿名</el-tag>
                  <el-tag v-if="row.isTop" type="danger" size="small">置顶</el-tag>
                  <el-tag v-if="row.isEssence" type="warning" size="small">精华</el-tag>
                  <el-tag size="small" :type="postTypeTag(row.type)">{{ postTypeText(row.type) }}</el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="发布者" width="130">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="26" :src="row.userAvatar">{{ (row.userNickname || '?')[0] }}</el-avatar>
              <span class="user-name">{{ row.userNickname || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="regionName" label="区域" width="90" />
        <el-table-column label="互动" width="200" align="right">
          <template #default="{ row }">
            <div class="engagement-stats">
              <span class="eng-item"><b>{{ fmtNum(row.viewCount) }}</b>浏览</span>
              <span class="eng-item"><b>{{ fmtNum(row.likeCount) }}</b>点赞</span>
              <span class="eng-item"><b>{{ fmtNum(row.commentCount) }}</b>评论</span>
              <span v-if="row.reportCount" class="eng-item danger"><b>{{ fmtNum(row.reportCount) }}</b>举报</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="86">
          <template #default="{ row }">
            <StatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="150">
          <template #default="{ row }">
            <TimeText :time="row.createdAt" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="196" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="viewDetail(row)">详情</el-button>
            <el-button v-if="hasAuditPermission" size="small" link type="success" v-show="row.auditStatus !== 'approved'" @click="approvePost(row)">通过</el-button>
            <el-button v-if="hasAuditPermission" size="small" link type="warning" v-show="row.auditStatus !== 'rejected'" @click="rejectPost(row)">驳回</el-button>
            <el-dropdown v-if="hasDeletePermission || hasTopPermission || hasAuditPermission" trigger="click" @command="(cmd: string) => handleCommand(cmd, row)">
              <el-button size="small" link type="primary">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="copy-id">复制帖子ID</el-dropdown-item>
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
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import TimeText from '@/components/common/TimeText.vue'
import RegionSelector from '@/components/common/RegionSelector.vue'
import { useAuthStore } from '@/stores/auth'
import { formatDateRangeParams } from '@/utils/date'

const router = useRouter()
const route = useRoute()
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
const tableRef = ref()
const filters = reactive({ id: '', userId: '', keyword: '', status: '', type: '', auditStatus: '', regionId: '' })
const stats = reactive({ totalPosts: 0, todayPosts: 0, pendingAudit: 0, reportedPosts: 0 })

const statusTabs = [
  { label: '全部', value: '' },
  { label: '待审核', value: 'PENDING' },
  { label: '已发布', value: 'PUBLISHED' },
  { label: '已驳回', value: 'REJECTED' },
  { label: '已删除', value: 'DELETED' },
]

const statItems = computed(() => [
  { label: '总帖子数', value: stats.totalPosts },
  { label: '今日发帖', value: stats.todayPosts },
  { label: '待审核', value: stats.pendingAudit, status: 'PENDING', tone: stats.pendingAudit > 0 ? '#b45309' : undefined },
  { label: '举报内容', value: stats.reportedPosts, tone: stats.reportedPosts > 0 ? '#dc2626' : undefined },
])

const fmtNum = (value: any) => Number(value || 0).toLocaleString('en-US')

const postTypeText = (value: string) => ({ TEXT: '文本', IMAGE: '图片', VIDEO: '视频', VOTE: '投票', AUDIO: '音频' } as Record<string, string>)[value] || value || '-'
const postTypeTag = (value: string) => ({ TEXT: 'info', IMAGE: 'success', VIDEO: 'warning', VOTE: 'primary', AUDIO: 'danger' } as Record<string, any>)[value] || 'info'
const counterLabel = (value: string | number) => ({ viewCount: '浏览', likeCount: '点赞', commentCount: '评论', favoriteCount: '收藏', reportCount: '举报' } as Record<string, string>)[String(value)] || String(value)
const coStatusText = (value: string) => ({ accepted: '已接受', rejected: '已拒绝', pending: '待确认' } as Record<string, string>)[value] || value || '-'
const reportStatusText = (value: string) => ({ pending: '待处理', processing: '处理中', resolved: '已处理', rejected: '已驳回' } as Record<string, string>)[value] || value || '-'

const applyStatusTab = (value: string) => {
  filters.status = value
  page.value = 1
  loadPosts()
}

const clearSelection = () => {
  tableRef.value?.clearSelection()
}

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
  page.value = 1
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
    if (cmd === 'copy-id') {
      await copyPostId(row.id)
      return
    } else if (cmd === 'top' || cmd === 'untop') {
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

watch(() => route.query.id, (value) => {
  const postId = String(value || '').trim()
  if (!postId || postId === filters.id) return
  filters.id = postId
  autoOpenedPostId.value = ''
  page.value = 1
  loadPosts()
})

onMounted(() => {
  filters.id = String(route.query.id || '').trim()
  loadPosts()
  loadStats()
})
</script>

<style scoped>
.page-container { padding: 24px; }

/* ── 指标带：扁平条 + 细分隔线，大数字小标签 ───────────── */
.stats-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 18px 8px;
  margin: 16px 0;
}
.stat-item {
  text-align: center;
  padding: 2px 12px;
  border-right: 1px solid var(--mx-border);
  transition: background 0.15s ease;
}
.stat-item:last-child { border-right: none; }
.stat-item.clickable { cursor: pointer; border-radius: 8px; }
.stat-item.clickable:hover { background: rgba(37, 99, 235, 0.05); }
.stat-item.active .stat-label { color: var(--mx-primary); font-weight: 600; }
.stat-value {
  font-family: var(--mx-font-display);
  font-size: 26px;
  font-weight: 760;
  line-height: 1.2;
  color: var(--mx-text);
  font-variant-numeric: tabular-nums;
}
.stat-label {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--mx-muted);
  margin-top: 4px;
}

/* ── 表格卡：二级工具条 + 批量条 + 表格 ────────────────── */
.table-card { padding: 0; overflow: hidden; }

.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--mx-border);
}
.status-tabs { display: flex; gap: 22px; }
.status-tab {
  appearance: none;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 4px 0;
  font-family: inherit;
  font-size: 13.5px;
  color: var(--mx-muted);
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.status-tab:hover { opacity: 0.85; }
.status-tab.active {
  opacity: 1;
  color: var(--mx-text);
  font-weight: 600;
  border-bottom-color: var(--mx-primary);
}
.toolbar-total { font-size: 12.5px; color: var(--mx-muted); white-space: nowrap; }
.toolbar-total b {
  font-family: var(--mx-font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--mx-text);
  font-variant-numeric: tabular-nums;
}

.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 20px;
  background: rgba(37, 99, 235, 0.06);
  border-bottom: 1px solid var(--mx-border);
}
.batch-info { font-size: 13px; color: var(--mx-text); }
.batch-info b { font-family: var(--mx-font-mono); font-variant-numeric: tabular-nums; }
.batch-actions { display: flex; align-items: center; gap: 8px; }
.batch-fade-enter-active, .batch-fade-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.batch-fade-enter-from, .batch-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* 表头降权：次级信息用 muted，把视觉重心让给数据行 */
:deep(.el-table__header th) {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--mx-muted);
}

/* 行交错入场：索引 × 35ms 的级联淡入 */
:deep(.el-table__body .el-table__row) { animation: row-in 0.3s cubic-bezier(0.4, 0, 0.2, 1) both; }
:deep(.el-table__body .el-table__row:nth-child(1)) { animation-delay: 0ms; }
:deep(.el-table__body .el-table__row:nth-child(2)) { animation-delay: 35ms; }
:deep(.el-table__body .el-table__row:nth-child(3)) { animation-delay: 70ms; }
:deep(.el-table__body .el-table__row:nth-child(4)) { animation-delay: 105ms; }
:deep(.el-table__body .el-table__row:nth-child(5)) { animation-delay: 140ms; }
:deep(.el-table__body .el-table__row:nth-child(6)) { animation-delay: 175ms; }
:deep(.el-table__body .el-table__row:nth-child(7)) { animation-delay: 210ms; }
:deep(.el-table__body .el-table__row:nth-child(8)) { animation-delay: 245ms; }
:deep(.el-table__body .el-table__row:nth-child(9)) { animation-delay: 280ms; }
:deep(.el-table__body .el-table__row:nth-child(n+10)) { animation-delay: 315ms; }
@keyframes row-in { from { opacity: 0; } to { opacity: 1; } }

/* 帖子内容单元格：左缩略图 + 右标题/标签，行高更紧凑 */
.post-cell { display: flex; align-items: center; gap: 12px; }
.post-thumb {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.05);
}
.post-thumb .el-image { width: 100%; height: 100%; display: block; }
.thumb-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--mx-muted);
}
.thumb-count {
  position: absolute;
  right: 3px;
  bottom: 3px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  font-family: var(--mx-font-mono);
  font-size: 10.5px;
  line-height: 16px;
  text-align: center;
}
.post-body { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.post-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.post-meta { display: flex; gap: 4px; flex-wrap: wrap; }

.user-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.user-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 互动数据：单行、右对齐、等宽数字 */
.engagement-stats {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  white-space: nowrap;
}
.eng-item { font-size: 11.5px; color: var(--mx-muted); }
.eng-item b {
  font-family: var(--mx-font-mono);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--mx-text);
  font-variant-numeric: tabular-nums;
  margin-right: 3px;
}
.eng-item.danger, .eng-item.danger b { color: #dc2626; }

.table-footer { padding: 14px 16px; display: flex; justify-content: flex-end; }

.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 14px; border: 1px solid rgba(255,255,255,0.8); }

/* ── 详情抽屉 ──────────────────────────────────────────── */
.detail-section { margin-bottom: 20px; }
.detail-section h4 { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: var(--mx-text); border-bottom: 1px solid var(--mx-border); padding-bottom: 6px; }
.detail-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; }
.detail-row-id { flex-wrap: wrap; padding: 10px 12px; border: 1px solid #bfdbfe; border-radius: 6px; background: #eff6ff; }
.detail-row-id code { overflow: hidden; color: #1e40af; font-family: var(--mx-font-mono); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; max-width: 320px; }
.detail-row-block { align-items: flex-start; }
.detail-row .label { color: var(--mx-muted); min-width: 80px; }
.audit-reason-card { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 6px; background: #fff7f7; border: 1px solid #fecaca; color: #334155; line-height: 1.6; }
.detail-content { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.detail-images { display: flex; flex-wrap: wrap; gap: 4px; }
.detail-stats { display: flex; gap: 16px; font-size: 14px; color: var(--mx-muted); }
.counter-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.counter-item { border: 1px solid var(--mx-border); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 4px; }
.counter-name { font-size: 12px; color: var(--mx-muted); }
.counter-item strong { color: var(--mx-text); }
.counter-item strong.danger { color: #dc2626; }
.counter-item small { color: #94a3b8; }
.mini-list { display: flex; flex-direction: column; gap: 8px; }
.mini-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px solid var(--mx-border); border-radius: 6px; font-size: 13px; }
.mini-item.report { border-color: #fecaca; background: #fff7f7; }
</style>
