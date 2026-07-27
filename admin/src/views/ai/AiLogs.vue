<template>
  <div class="ai-page">
    <div class="page-head">
      <div>
        <div class="breadcrumb">AI 运营中心 / AI 日志</div>
        <h1>AI 日志</h1>
        <p>记录机器人发帖、评论、互动和异常，方便追查为什么没有生成、为什么失败。</p>
      </div>
      <el-button :icon="Refresh" @click="loadLogs">刷新</el-button>
    </div>

    <div class="filter-card">
      <el-select v-model="query.botId" clearable filterable placeholder="机器人">
        <el-option
          v-for="bot in bots"
          :key="bot.botAccountId"
          :label="bot.nickname"
          :value="bot.botAccountId"
        />
      </el-select>
      <el-select v-model="query.action" clearable placeholder="动作">
        <el-option label="生成草稿" value="generate_draft" />
        <el-option label="发布笔记" value="create_post" />
        <el-option label="发表评论" value="create_comment" />
        <el-option label="点赞互动" value="like" />
        <el-option label="任务失败" value="task_failed" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
      />
      <el-button type="primary" :icon="Search" @click="loadLogs">查询</el-button>
      <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
    </div>

    <div class="table-card">
      <el-table :data="logs" v-loading="loading" empty-text="暂无AI日志">
        <el-table-column label="机器人" width="180">
          <template #default="{ row }">
            <div class="bot-cell">
              <el-avatar :size="30">{{ row.botName?.slice(0, 1) }}</el-avatar>
              <b>{{ row.botName || '-' }}</b>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="动作" width="130">
          <template #default="{ row }">
            <el-tag :type="actionTagType(row)" size="small">{{ actionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'failed' ? 'danger' : 'success'" size="small">
              {{ row.status === 'failed' ? '失败' : '成功' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="对象" width="180">
          <template #default="{ row }">
            <div class="target-cell">
              <b>{{ targetTypeLabel(row.targetType) }}</b>
              <small v-if="row.targetId">编号：{{ shortId(row.targetId) }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="日志内容" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ friendlyMessage(row) }}</template>
        </el-table-column>
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <span>共 {{ total }} 条日志</span>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          layout="sizes, prev, pager, next"
          :total="total"
          :page-sizes="[10, 20, 50]"
          @change="loadLogs"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasViewPermission = ref(auth.permissions.includes('ai:view'))
const loading = ref(false)
const logs = ref<any[]>([])
const bots = ref<any[]>([])
const total = ref(0)
const dateRange = ref<string[]>([])

const query = reactive<any>({
  page: 1,
  pageSize: 20,
  botId: '',
  action: '',
  startDate: '',
  endDate: '',
})

const loadLogs = async () => {
  loading.value = true
  try {
    query.startDate = dateRange.value?.[0] || ''
    query.endDate = dateRange.value?.[1] || ''
    const res: any = await request.get('/admin/ai/logs', { params: query })
    const page = res?.data || res
    logs.value = page?.list || []
    total.value = page?.total || 0
  } catch (error: any) {
    ElMessage.error(error?.message || '加载AI日志失败')
  } finally {
    loading.value = false
  }
}

const loadBots = async () => {
  try {
    const res: any = await request.get('/admin/ai/bots', { params: { pageSize: 200 } })
    bots.value = (res?.data || res)?.list || []
  } catch (error: any) {
    ElMessage.warning(error?.message || '加载机器人列表失败')
  }
}

const resetQuery = () => {
  Object.assign(query, { page: 1, botId: '', action: '', startDate: '', endDate: '' })
  dateRange.value = []
  loadLogs()
}

const actionLabel = (action: string) => ({
  generate_draft: '生成草稿',
  create_post: '发布笔记',
  create_comment: '发表评论',
  like: '点赞互动',
  login: '登录',
  error: '执行失败',
  failed: '执行失败',
  task_failed: '任务失败',
}[action] || action || '-')

const actionTagType = (row: any) => {
  const action = String(row?.action || '').toLowerCase()
  if (row?.status === 'failed' || action.includes('fail') || action === 'error') return 'danger'
  if (action === 'generate_draft') return 'info'
  return 'success'
}

const targetTypeLabel = (type: string) => ({
  ai_task: 'AI任务',
  post: '笔记',
  note: '笔记',
  comment: '评论',
  user: '用户',
  bot: '机器人',
}[type] || '业务对象')

const shortId = (value: string) => {
  const text = String(value || '')
  if (!text) return ''
  return text.length > 14 ? `${text.slice(0, 8)}...${text.slice(-4)}` : text
}

const translateTechnicalText = (value: string) => {
  const text = String(value || '').trim()
  const lower = text.toLowerCase()
  if (!text) return ''
  if (lower.includes('fetch failed') || lower.includes('network error')) {
    return 'AI服务连接失败，请检查模型配置、网络或服务商接口状态'
  }
  if (lower.includes('tx.comment.create')) {
    return '发布评论失败：评论数据写入异常，请联系技术处理'
  }
  if (lower.includes('tx.post.create')) {
    return '发布笔记失败：笔记数据写入异常，请联系技术处理'
  }
  if (text.includes('目标帖子不存在')) return '目标帖子不存在，无法发布评论'
  if (lower.includes('api key') || text.includes('密钥')) return 'AI密钥未配置或不可用，请检查AI配置'
  if (lower.includes('timeout') || text.includes('超时')) return 'AI服务响应超时，请稍后重试'
  return text.length > 90 ? `${text.slice(0, 90)}...` : text
}

const stringifyDetail = (detail: any) => {
  if (!detail) return ''
  if (typeof detail === 'string') return translateTechnicalText(detail)
  const text = detail.message || detail.error || detail.content || detail.summary
  return text ? translateTechnicalText(text) : ''
}

const friendlyMessage = (row: any) => {
  if (row?.message) return translateTechnicalText(row.message)
  const action = String(row?.action || '').toLowerCase()
  const detail = row?.detail || {}
  if (action === 'generate_draft') return detail.title ? `已生成草稿：${detail.title}` : '已生成AI草稿'
  if (action === 'create_post') return `已发布 ${Number(detail.createdCount || 1)} 篇笔记`
  if (action === 'create_comment') return `已发布 ${Number(detail.createdCount || 1)} 条评论`
  if (action.includes('fail') || action === 'error') return `任务执行失败：${stringifyDetail(detail) || '请查看任务详情'}`
  return stringifyDetail(detail) || '已记录一次机器人操作'
}

const formatTime = (value: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'

onMounted(() => {
  loadLogs()
  loadBots()
})
</script>

<style scoped>
.ai-page {
  padding: 28px;
  color: var(--mx-text);
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.breadcrumb {
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 8px;
}

.page-head h1 {
  margin: 0;
  font-size: 32px;
}

.page-head p {
  margin: 8px 0 0;
  color: var(--mx-sub);
  font-size: 15px;
  font-weight: 700;
}

.filter-card,
.table-card {
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  background: var(--mx-card);
  box-shadow: var(--mx-shadow);
  backdrop-filter: blur(14px);
}

.filter-card {
  display: grid;
  grid-template-columns: 220px 180px minmax(280px, 1fr) auto auto;
  gap: 12px;
  padding: 16px;
  margin-bottom: 18px;
}

.table-card {
  padding: 16px;
}

.bot-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.target-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.2;
}

.target-cell b {
  color: var(--mx-text);
  font-size: 13px;
}

.target-cell small {
  color: var(--mx-muted);
  font-size: 12px;
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 1100px) {
  .filter-card {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .ai-page { padding: 18px; }
  .page-head { flex-direction: column; }
  .filter-card { grid-template-columns: 1fr; }
}
</style>
