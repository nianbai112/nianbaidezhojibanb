<template>
  <div class="page-container">
    <PageHeader title="审核举报" subtitle="统一审核工作台，管理帖子审核、评论审核、举报处理" icon="Warning">
      <template #actions>
        <el-button @click="loadData" :loading="loading">刷新</el-button>
        <el-button type="success" :disabled="!selectedRows.length" @click="batchApprove">批量通过</el-button>
        <el-button type="warning" :disabled="!selectedRows.length" @click="batchReject">批量驳回</el-button>
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
        <el-table-column label="时间" width="160">
          <template #default="{ row }">
            <TimeText :time="row.createdAt" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <template v-if="row.targetType === 'post' || row.targetType === 'comment'">
              <el-button size="small" link type="success" @click="approveItem(row)">通过</el-button>
              <el-button size="small" link type="warning" @click="rejectItem(row)">驳回</el-button>
              <el-button size="small" link type="danger" @click="hideItem(row)">隐藏</el-button>
            </template>
            <template v-else-if="row.targetType === 'report'">
              <el-button size="small" link type="success" @click="resolveReport(row)">已处理</el-button>
              <el-button size="small" link type="warning" @click="rejectReport(row)">驳回</el-button>
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
        <div class="detail-section" v-if="detailData.images?.length">
          <h4>图片</h4>
          <div class="detail-images">
            <el-image v-for="(img, i) in detailData.images" :key="i" :src="img" style="width: 100px; height: 100px; border-radius: 8px; margin: 4px;" fit="cover" :preview-src-list="detailData.images" />
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'

const loading = ref(false)
const items = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedRows = ref<any[]>([])
const activeTab = ref('all')
const showDetail = ref(false)
const detailData = ref<any>(null)

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
  try {
    await request.put(`/admin/reports/${row.id}/handle`, { status: 'resolved', result: '已处理' })
    ElMessage.success('已处理')
    loadData()
    loadStats()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
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
      detailData.value = { ...(res.data || res), targetType: 'post' }
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

onMounted(() => {
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
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 16px; border: 1px solid rgba(255,255,255,0.8); }
.detail-section { margin-bottom: 20px; }
.detail-section h4 { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
.detail-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; }
.detail-row .label { color: #64748b; min-width: 80px; }
.detail-content { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.detail-images { display: flex; flex-wrap: wrap; gap: 4px; }
</style>
