<template>
  <div class="page-container">
    <PageHeader title="审核举报" subtitle="统一审核工作台，管理帖子审核、评论审核、举报处理" icon="Warning">
      <template #actions>
        <el-button @click="loadData" :loading="loading">刷新</el-button>
        <el-button v-if="hasAuditPermission" @click="repairCounters">修复计数</el-button>
        <el-button v-if="hasAiPermission" @click="router.push('/ai/governance?tab=moderation')">AI治理中心</el-button>
        <el-button v-if="hasAuditPermission" type="primary" :disabled="!selectedRows.some(canAiReview)" @click="batchAiReview">AI复审选中</el-button>
        <el-button v-if="hasAuditPermission" type="success" :disabled="!selectedRows.length" @click="batchApprove">批量通过</el-button>
        <el-button v-if="hasAuditPermission" type="warning" :disabled="!selectedRows.length" @click="batchReject">批量驳回</el-button>
      </template>
    </PageHeader>

    <div class="stats-row glass-card">
      <div class="stat-item">
        <div class="stat-value">{{ stats.totalPending }}</div>
        <div class="stat-label">总待审</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.postPending }}</div>
        <div class="stat-label">帖子待审</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.commentPending }}</div>
        <div class="stat-label">评论待审</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.reportPending }}</div>
        <div class="stat-label">举报待处理</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.todayApproved }}</div>
        <div class="stat-label">今日已审</div>
      </div>
    </div>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="全部待审" name="all" />
      <el-tab-pane label="帖子待审" name="post" />
      <el-tab-pane label="评论待审" name="comment" />
      <el-tab-pane label="举报处理" name="report" />
      <el-tab-pane label="已处理" name="handled" />
    </el-tabs>

    <div class="glass-card" style="padding: 0;">
      <el-table :data="items" v-loading="loading" @selection-change="handleSelectionChange" border stripe>
        <el-table-column type="selection" width="55" />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="row.targetType === 'post' ? 'primary' : row.targetType === 'comment' ? 'success' : 'warning'" size="small">
              {{ row.targetType === 'post' ? '帖子' : row.targetType === 'comment' ? '评论' : '举报' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="内容摘要" min-width="250">
          <template #default="{ row }">
            <div class="content-cell">
              <div class="content-text">{{ row.targetTitle || row.content?.slice(0, 80) || row.reason || '-' }}</div>
              <div v-if="row.user" class="content-user">
                <el-avatar :size="20" :src="row.user?.avatar">{{ (row.user?.nickname || '?')[0] }}</el-avatar>
                <span>{{ row.user?.nickname || '-' }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="activeTab === 'report'" label="举报原因" min-width="200">
          <template #default="{ row }">
            <div v-if="row.targetType === 'report'">
              <div>{{ row.reason || '-' }}</div>
              <div v-if="row.detail" style="font-size: 12px; color: #94a3b8;">{{ row.detail }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag :status="row.status || row.auditStatus || 'pending'" />
          </template>
        </el-table-column>
        <el-table-column label="AI建议" min-width="210">
          <template #default="{ row }">
            <div v-if="row.aiModeration" class="ai-cell">
              <div class="ai-line">
                <el-tag :type="aiDecisionType(row.aiModeration.decision)" size="small">{{ aiDecisionText(row.aiModeration.decision) }}</el-tag>
                <span class="ai-score">风险 {{ formatAiScore(row.aiModeration.score) }}</span>
              </div>
              <div class="ai-reason">{{ row.aiModeration.reason || '无原因' }}</div>
            </div>
            <div v-else class="ai-empty">未执行 AI</div>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="160">
          <template #default="{ row }">
            <TimeText :time="row.createdAt" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <template v-if="row.targetType === 'post' || row.targetType === 'comment'">
              <el-button v-if="hasAuditPermission" size="small" link type="primary" @click="runAiReview(row)">AI复审</el-button>
              <el-button v-if="hasAuditPermission" size="small" link type="success" @click="approveItem(row)">通过</el-button>
              <el-button v-if="hasAuditPermission" size="small" link type="warning" @click="rejectItem(row)">驳回</el-button>
              <el-button v-if="hasAuditPermission" size="small" link type="danger" @click="hideItem(row)">隐藏</el-button>
            </template>
            <template v-else-if="row.targetType === 'report'">
              <el-button v-if="hasAuditPermission" size="small" link type="success" @click="resolveReport(row)">已处理</el-button>
              <el-button v-if="hasAuditPermission" size="small" link type="warning" @click="rejectReport(row)">驳回</el-button>
            </template>
            <el-button size="small" link @click="viewDetail(row)">详情</el-button>
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
          @current-change="loadData"
          @size-change="loadData"
        />
      </div>
    </div>

    <el-drawer v-model="showDetail" title="审核详情" size="550px">
      <template v-if="detailData">
        <div class="detail-section">
          <h4>基本信息</h4>
          <div class="detail-row"><span class="label">类型：</span>{{ detailData.targetType === 'post' ? '帖子' : detailData.targetType === 'comment' ? '评论' : '举报' }}</div>
          <div class="detail-row"><span class="label">状态：</span><StatusTag :status="detailData.status || detailData.auditStatus" /></div>
          <div v-if="detailData.auditReason" class="detail-row detail-row-block">
            <span class="label">审核原因：</span>
            <div class="audit-reason-card">{{ detailData.auditReason }}</div>
          </div>
          <div class="detail-row"><span class="label">时间：</span>{{ detailData.createdAt }}</div>
        </div>
        <div class="detail-section" v-if="detailData.user">
          <h4>发布者</h4>
          <div class="detail-row"><span class="label">昵称：</span>{{ detailData.user?.nickname }}</div>
        </div>
        <div class="detail-section">
          <h4>内容</h4>
          <div class="detail-content">{{ detailData.content || detailData.targetTitle || '-' }}</div>
        </div>
        <div class="detail-section" v-if="detailData.aiModeration">
          <h4>AI审核</h4>
          <div class="detail-row">
            <span class="label">建议：</span>
            <el-tag :type="aiDecisionType(detailData.aiModeration.decision)" size="small">{{ aiDecisionText(detailData.aiModeration.decision) }}</el-tag>
            <span class="ai-score">风险 {{ formatAiScore(detailData.aiModeration.score) }}</span>
          </div>
          <div class="detail-row"><span class="label">原因：</span>{{ detailData.aiModeration.reason || '-' }}</div>
          <div class="detail-row"><span class="label">标签：</span>{{ formatAiLabels(detailData.aiModeration.labels) }}</div>
          <div class="detail-row"><span class="label">执行时间：</span>{{ detailData.aiModeration.createdAt || '-' }}</div>
        </div>
        <div class="detail-section" v-if="detailData.images?.length">
          <h4>图片</h4>
          <div class="detail-images">
            <el-image v-for="(img, i) in detailData.images" :key="i" :src="img" style="width: 100px; height: 100px; border-radius: 6px; margin: 4px;" fit="cover" :preview-src-list="detailData.images" />
          </div>
        </div>
        <div class="detail-section" v-if="detailData.targetType === 'report'">
          <h4>举报信息</h4>
          <div class="detail-row"><span class="label">举报原因：</span>{{ detailData.reason || '-' }}</div>
          <div class="detail-row" v-if="detailData.detail"><span class="label">详细描述：</span>{{ detailData.detail }}</div>
          <div class="detail-row" v-if="detailData.reporter"><span class="label">举报人：</span>{{ detailData.reporter?.nickname }}</div>
          <div class="detail-row" v-if="detailData.reported"><span class="label">被举报人：</span>{{ detailData.reported?.nickname }}</div>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="reportDialog.visible" title="举报处置" width="480px">
      <el-form label-width="96px">
        <el-form-item label="处置动作">
          <el-select v-model="reportDialog.action" style="width: 100%;">
            <el-option label="仅记录为已处理" value="none" />
            <el-option label="隐藏被举报内容" value="hide_content" />
            <el-option label="删除被举报内容" value="delete_content" />
            <el-option label="禁言被举报用户" value="mute_user" />
            <el-option label="封禁被举报用户" value="ban_user" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="reportDialog.action === 'mute_user'" label="禁言天数">
          <el-input-number v-model="reportDialog.muteDays" :min="1" :max="365" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="处理备注">
          <el-input v-model="reportDialog.result" type="textarea" :rows="3" placeholder="例如：举报成立，已隐藏内容并记录处理" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reportDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="reportDialog.submitting" @click="submitReportResolve">确认处置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const hasAuditPermission = ref(auth.permissions.includes('content:audit'))
const hasAiPermission = ref(auth.permissions.includes('ai:view'))
const loading = ref(false)
const items = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedRows = ref<any[]>([])
const activeTab = ref('all')
const showDetail = ref(false)
const detailData = ref<any>(null)
const reportDialog = reactive({
  visible: false,
  submitting: false,
  row: null as any,
  action: 'hide_content',
  result: '举报成立，已处理',
  muteDays: 7
})

const stats = reactive({
  totalPending: 0,
  postPending: 0,
  commentPending: 0,
  reportPending: 0,
  todayApproved: 0
})

const loadData = async () => {
  loading.value = true
  try {
    if (activeTab.value === 'report') {
      const res = await request.get('/admin/reports', { params: { page: page.value, pageSize: pageSize.value, status: 'pending' } })
      items.value = (res.data?.list || []).map((r: any) => ({ ...r, targetType: 'report' }))
      total.value = res.data?.total || 0
    } else if (activeTab.value === 'handled') {
      const res = await request.get('/admin/reports', { params: { page: page.value, pageSize: pageSize.value, status: 'resolved' } })
      items.value = (res.data?.list || []).map((r: any) => ({ ...r, targetType: 'report' }))
      total.value = res.data?.total || 0
    } else {
      const params: any = { page: page.value, pageSize: pageSize.value }
      if (activeTab.value !== 'all') params.targetType = activeTab.value
      const res = await request.get('/admin/audit/pending', { params })
      items.value = res.data?.list || []
      total.value = res.data?.total || 0
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
    items.value = []
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const res = await request.get('/admin/audit/stats')
    if (res.data) Object.assign(stats, res.data)
  } catch (e: any) { ElMessage.error(e?.message || '加载统计失败') }
}

const handleTabChange = () => {
  page.value = 1
  selectedRows.value = []
  loadData()
}

const handleSelectionChange = (rows: any[]) => {
  selectedRows.value = rows
}

const canAiReview = (row: any) => row?.targetType === 'post' || row?.targetType === 'comment'

const aiDecisionText = (decision?: string) => {
  const map: Record<string, string> = { approve: '建议通过', reject: '建议驳回', manual: '人工复核' }
  return map[String(decision || '')] || '未知'
}

const aiDecisionType = (decision?: string) => {
  const map: Record<string, string> = { approve: 'success', reject: 'danger', manual: 'warning' }
  return map[String(decision || '')] || 'info'
}

const formatAiScore = (score?: number) => `${Math.round(Number(score || 0) * 100)}%`

const formatAiLabels = (labels?: any[]) => {
  if (!Array.isArray(labels) || !labels.length) return '-'
  return labels.map(item => String(item)).join('、')
}

const runAiReview = async (row: any, silent = false) => {
  if (!canAiReview(row)) return
  try {
    const res: any = await request.post('/admin/audit/ai-review', { type: row.targetType, id: row.id })
    if (!silent) {
      const ai = res.data?.aiModeration || res.aiModeration
      ElMessage.success(`AI复审完成：${aiDecisionText(ai?.decision)}`)
    }
    await loadData()
    await loadStats()
  } catch (e: any) {
    if (!silent) ElMessage.error(e?.message || 'AI复审失败')
    throw e
  }
}

const batchAiReview = async () => {
  const rows = selectedRows.value.filter(canAiReview)
  if (!rows.length) return
  try {
    await ElMessageBox.confirm(`确认让 AI 复审选中的 ${rows.length} 条内容？AI明确通过/驳回会直接更新审核状态，无法判断的会保留待审。`, 'AI复审', { type: 'warning' })
    for (const row of rows) {
      await request.post('/admin/audit/ai-review', { type: row.targetType, id: row.id })
    }
    ElMessage.success('AI复审完成')
    selectedRows.value = []
    loadData()
    loadStats()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || 'AI复审失败')
  }
}

const approveItem = async (row: any) => {
  try {
    if (row.targetType === 'post') {
      await request.put(`/admin/posts/${row.id}/audit`, { status: 'approved' })
    } else if (row.targetType === 'comment') {
      await request.put(`/admin/comments/${row.id}/audit`, { status: 'active' })
    }
    ElMessage.success('已通过')
    loadData()
    loadStats()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

const rejectItem = async (row: any) => {
  try {
    const { value: reason } = await ElMessageBox.prompt('请输入驳回原因', '驳回', { inputPlaceholder: '驳回原因（可选）' })
    if (row.targetType === 'post') {
      await request.put(`/admin/posts/${row.id}/audit`, { status: 'rejected', reason })
    } else if (row.targetType === 'comment') {
      await request.put(`/admin/comments/${row.id}/audit`, { status: 'rejected', reason })
    }
    ElMessage.success('已驳回')
    loadData()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

const hideItem = async (row: any) => {
  try {
    if (row.targetType === 'comment') {
      await request.put(`/admin/comments/${row.id}/audit`, { status: 'hidden' })
      ElMessage.success('已隐藏')
    } else if (row.targetType === 'post') {
      await request.put(`/admin/posts/${row.id}/audit`, { status: 'rejected' })
      ElMessage.success('已隐藏')
    }
    loadData()
    loadStats()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

const resolveReport = async (row: any) => {
  reportDialog.row = row
  reportDialog.action = 'hide_content'
  reportDialog.result = '举报成立，已处理'
  reportDialog.muteDays = 7
  reportDialog.visible = true
}

const submitReportResolve = async () => {
  if (!reportDialog.row) return
  reportDialog.submitting = true
  try {
    await request.put(`/admin/reports/${reportDialog.row.id}/handle`, {
      status: 'resolved',
      action: reportDialog.action,
      result: reportDialog.result || '举报成立，已处理',
      muteDays: reportDialog.muteDays
    })
    ElMessage.success('已处理')
    reportDialog.visible = false
    loadData()
    loadStats()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    reportDialog.submitting = false
  }
}

const rejectReport = async (row: any) => {
  try {
    await request.put(`/admin/reports/${row.id}/handle`, { status: 'rejected', result: '举报不成立' })
    ElMessage.success('已驳回')
    loadData()
    loadStats()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

const viewDetail = async (row: any) => {
  try {
    if (row.targetType === 'post') {
      const res = await request.get(`/admin/posts/${row.id}`)
      detailData.value = { ...(res.data || res), targetType: 'post', aiModeration: row.aiModeration }
    } else if (row.targetType === 'comment') {
      detailData.value = { ...row, targetType: 'comment' }
    } else {
      detailData.value = { ...row, targetType: 'report' }
    }
    showDetail.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '获取详情失败')
  }
}

const batchApprove = async () => {
  if (!selectedRows.value.length) return
  try {
    const posts = selectedRows.value.filter(r => r.targetType === 'post')
    const comments = selectedRows.value.filter(r => r.targetType === 'comment')
    const reports = selectedRows.value.filter(r => r.targetType === 'report')
    if (posts.length) await request.post('/admin/audit/batch', { type: 'post', ids: posts.map(r => r.id), action: 'approve' })
    if (comments.length) await request.post('/admin/audit/batch', { type: 'comment', ids: comments.map(r => r.id), action: 'approve' })
    if (reports.length) {
      await Promise.all(reports.map(r => request.put(`/admin/reports/${r.id}/handle`, { status: 'resolved', result: '批量处理' })))
    }
    ElMessage.success('批量通过成功')
    loadData()
    loadStats()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

const batchReject = async () => {
  if (!selectedRows.value.length) return
  try {
    const posts = selectedRows.value.filter(r => r.targetType === 'post')
    const comments = selectedRows.value.filter(r => r.targetType === 'comment')
    const reports = selectedRows.value.filter(r => r.targetType === 'report')
    if (posts.length) await request.post('/admin/audit/batch', { type: 'post', ids: posts.map(r => r.id), action: 'reject' })
    if (comments.length) await request.post('/admin/audit/batch', { type: 'comment', ids: comments.map(r => r.id), action: 'reject' })
    if (reports.length) {
      await Promise.all(reports.map(r => request.put(`/admin/reports/${r.id}/handle`, { status: 'rejected', result: '批量驳回' })))
    }
    ElMessage.success('批量驳回成功')
    loadData()
    loadStats()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

const repairCounters = async () => {
  try {
    await ElMessageBox.confirm('确认修复帖子点赞、收藏、评论计数？这个操作会按真实明细重新统计。', '修复计数', { type: 'warning' })
    const res: any = await request.post('/admin/content/repair-counters')
    ElMessage.success(`修复完成：检查 ${res.checked || 0} 条，修复 ${res.repaired || 0} 条`)
    loadData()
    loadStats()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '修复失败')
  }
}

const applyRouteQuery = () => {
  const tab = String(route.query.tab || route.query.targetType || '')
  if (['all', 'post', 'comment', 'report', 'handled'].includes(tab)) activeTab.value = tab
}

onMounted(() => {
  applyRouteQuery()
  if (route.query.businessId) ElMessage.info(`已从异常中心进入，业务ID：${route.query.businessId}`)
  loadData()
  loadStats()
})
</script>

<style scoped>
.page-container { padding: 24px; }
.stats-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  padding: 20px;
  margin-bottom: 16px;
}
.stat-item { text-align: center; }
.stat-value { font-size: 24px; font-weight: 700; color: #1e293b; }
.stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }
.content-cell { display: flex; flex-direction: column; gap: 4px; }
.content-text { font-size: 14px; }
.content-user { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8; }
.ai-cell { display: flex; flex-direction: column; gap: 5px; }
.ai-line { display: flex; align-items: center; gap: 8px; }
.ai-score { font-size: 12px; color: #64748b; }
.ai-reason { font-size: 12px; color: #475569; line-height: 1.45; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ai-empty { font-size: 12px; color: #94a3b8; }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 14px; border: 1px solid rgba(255,255,255,0.8); }
.detail-section { margin-bottom: 20px; }
.detail-section h4 { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
.detail-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; }
.detail-row-block { align-items: flex-start; }
.detail-row .label { color: #64748b; min-width: 80px; }
.audit-reason-card { flex: 1; padding: 10px 12px; border-radius: 6px; background: #fff7f7; border: 1px solid #fecaca; color: #334155; line-height: 1.6; }
.detail-content { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.detail-images { display: flex; flex-wrap: wrap; gap: 4px; }
</style>
