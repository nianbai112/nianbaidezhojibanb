<template>
  <div class="ai-dashboard">
    <div class="ai-hero">
      <div>
        <div class="breadcrumb">控制台 / AI 运营中心</div>
        <h1>AI 运营中心</h1>
        <p>统一查看机器人、内容任务、执行日志和模型配置状态，避免 AI 运营变成黑盒。</p>
      </div>
      <div class="hero-actions">
        <el-button :icon="Refresh" :loading="loading" @click="loadDashboard">刷新</el-button>
        <el-button type="primary" :icon="Setting" @click="router.push('/ai/config')">配置 AI</el-button>
      </div>
    </div>

    <div class="health-panel">
      <div class="health-score" :class="healthClass">
        <span>健康分</span>
        <strong>{{ dashboard.stats.healthScore }}</strong>
      </div>
      <div class="health-copy">
        <b>{{ dashboard.config.enabled ? 'AI运营已开启' : 'AI运营未开启' }}</b>
        <span>
          模型 {{ dashboard.config.model || '未配置' }}，
          启用机器人 {{ dashboard.stats.activeBots }} 个，
          今日任务 {{ dashboard.stats.todayTasks }} 个。
        </span>
      </div>
      <div class="health-tags">
        <el-tag :type="dashboard.config.hasApiKey ? 'success' : 'danger'">
          {{ dashboard.config.hasApiKey ? '密钥已配置' : '缺少密钥' }}
        </el-tag>
        <el-tag :type="dashboard.stats.failedTasks ? 'danger' : 'success'">
          {{ dashboard.stats.failedTasks ? `${dashboard.stats.failedTasks} 个失败任务` : '暂无失败任务' }}
        </el-tag>
        <el-tag :type="dashboard.stats.activeBots ? 'success' : 'warning'">
          {{ dashboard.stats.activeBots ? '机器人可用' : '没有可用机器人' }}
        </el-tag>
      </div>
    </div>

    <div class="metric-grid">
      <div v-for="item in metrics" :key="item.label" class="metric-card">
        <div class="metric-icon" :class="item.tone">
          <el-icon><component :is="item.icon" /></el-icon>
        </div>
        <div>
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.hint }}</small>
        </div>
      </div>
    </div>

    <div class="content-grid">
      <section class="panel workbench-panel">
        <div class="panel-head">
          <div>
            <h3>运营风险与下一步</h3>
            <p>这里优先显示会影响自动生成、发布和互动的问题。</p>
          </div>
          <el-button text type="primary" @click="router.push('/ai/tasks')">查看任务</el-button>
        </div>
        <div v-if="dashboard.warnings.length" class="warning-list">
          <div v-for="warning in dashboard.warnings" :key="warning" class="warning-item">
            <el-icon><WarningFilled /></el-icon>
            <span>{{ warning }}</span>
          </div>
        </div>
        <el-empty v-else description="当前 AI 运营状态正常" :image-size="90" />
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>任务状态分布</h3>
            <p>实时看待审、运行、完成和失败任务。</p>
          </div>
        </div>
        <div class="status-bars">
          <div v-for="item in dashboard.taskStatus" :key="item.key" class="status-row">
            <div class="status-label">
              <span>{{ item.label }}</span>
              <b>{{ item.value }}</b>
            </div>
            <div class="bar">
              <i :style="{ width: getBarWidth(item.value) }" :class="item.key"></i>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div class="content-grid wide-left">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>最近任务</h3>
            <p>看机器人正在生成什么、卡在哪里。</p>
          </div>
          <el-button text type="primary" @click="router.push('/ai/tasks')">全部任务</el-button>
        </div>
        <el-table :data="dashboard.recentTasks" v-loading="loading" empty-text="暂无任务">
          <el-table-column label="任务" min-width="220">
            <template #default="{ row }">
              <div class="task-title">{{ row.title }}</div>
              <div class="muted">{{ row.botName }} / {{ row.personaName }}</div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="110">
            <template #default="{ row }">
              <el-tag size="small">{{ typeLabel(row.type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="170">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>机器人工作池</h3>
            <p>当前可用于发帖、评论和冷启动的账号。</p>
          </div>
          <el-button text type="primary" @click="router.push('/ai/bots')">管理机器人</el-button>
        </div>
        <div class="bot-pool">
          <div v-for="bot in dashboard.botPool" :key="bot.id" class="bot-item">
            <el-avatar :src="bot.avatar" :size="38">{{ bot.nickname?.slice(0, 1) }}</el-avatar>
            <div>
              <b>{{ bot.nickname }}</b>
              <span>{{ bot.personaName }} · 日限 {{ bot.dailyLimit }}</span>
            </div>
            <em>{{ bot.taskCount }} 任务</em>
          </div>
          <el-empty v-if="!dashboard.botPool.length" description="暂无启用机器人" :image-size="80" />
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h3>最近执行日志</h3>
          <p>失败日志会影响内容冷启动和自动互动，优先处理。</p>
        </div>
        <el-button text type="primary" @click="router.push('/ai/logs')">全部日志</el-button>
      </div>
      <div class="log-list">
        <div v-for="log in dashboard.recentLogs" :key="log.id" class="log-item">
          <el-avatar :src="log.botAvatar" :size="32">{{ log.botName?.slice(0, 1) }}</el-avatar>
          <div>
            <b>{{ log.botName }} · {{ actionLabel(log.action) }}</b>
            <span>{{ log.message || `${log.targetType || '对象'} ${log.targetId || ''}` }}</span>
          </div>
          <el-tag :type="log.status === 'failed' ? 'danger' : 'success'" size="small">
            {{ log.status === 'failed' ? '失败' : '成功' }}
          </el-tag>
          <time>{{ formatTime(log.createdAt) }}</time>
        </div>
        <el-empty v-if="!dashboard.recentLogs.length" description="暂无执行日志" :image-size="90" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Connection,
  DataAnalysis,
  Document,
  List,
  Refresh,
  Setting,
  User,
  Warning,
  WarningFilled,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const router = useRouter()
const loading = ref(false)

const dashboard = reactive<any>({
  stats: {
    totalBots: 0,
    activeBots: 0,
    pausedBots: 0,
    disabledBots: 0,
    totalPersonas: 0,
    totalTasks: 0,
    pendingTasks: 0,
    approvedTasks: 0,
    runningTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    todayTasks: 0,
    todayLogs: 0,
    healthScore: 0,
  },
  config: {
    enabled: false,
    provider: '',
    model: '',
    hasApiKey: false,
  },
  warnings: [],
  taskStatus: [],
  recentTasks: [],
  recentLogs: [],
  botPool: [],
})

const metrics = computed(() => [
  { label: '机器人总数', value: dashboard.stats.totalBots, hint: `启用 ${dashboard.stats.activeBots} / 暂停 ${dashboard.stats.pausedBots}`, icon: User, tone: 'blue' },
  { label: '人设模板', value: dashboard.stats.totalPersonas, hint: '决定内容口吻与身份', icon: Connection, tone: 'violet' },
  { label: 'AI任务总量', value: dashboard.stats.totalTasks, hint: `今日新增 ${dashboard.stats.todayTasks}`, icon: List, tone: 'green' },
  { label: '待执行任务', value: dashboard.stats.pendingTasks + dashboard.stats.approvedTasks, hint: '需要排队或审核', icon: Document, tone: 'orange' },
  { label: '失败任务', value: dashboard.stats.failedTasks, hint: dashboard.stats.failedTasks ? '需要处理' : '状态正常', icon: Warning, tone: 'red' },
  { label: '今日日志', value: dashboard.stats.todayLogs, hint: '机器人动作记录', icon: DataAnalysis, tone: 'cyan' },
])

const healthClass = computed(() => {
  if (dashboard.stats.healthScore >= 80) return 'good'
  if (dashboard.stats.healthScore >= 55) return 'warn'
  return 'bad'
})

const loadDashboard = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/ai/dashboard')
    const payload = res?.data || res
    Object.assign(dashboard, payload)
  } catch (error: any) {
    ElMessage.error(error?.message || '加载AI运营中心失败')
  } finally {
    loading.value = false
  }
}

const maxTaskValue = computed(() => Math.max(...dashboard.taskStatus.map((item: any) => Number(item.value || 0)), 1))
const getBarWidth = (value: number) => `${Math.max(4, Math.round((Number(value || 0) / maxTaskValue.value) * 100))}%`

const typeLabel = (type: string) => {
  const map: Record<string, string> = { post: '自动发帖', comment: '自动评论', cold_start: '内容冷启动', interaction: '自动互动' }
  return map[type] || type || '-'
}

const statusLabel = (status: string) => {
  const map: Record<string, string> = { pending: '待执行', approved: '已审核', running: '运行中', paused: '已暂停', completed: '已完成', failed: '失败', cancelled: '已取消' }
  return map[status] || status || '-'
}

const statusType = (status: string) => {
  const map: Record<string, string> = { pending: 'info', approved: 'warning', running: 'primary', paused: 'warning', completed: 'success', failed: 'danger', cancelled: 'info' }
  return map[status] || 'info'
}

const actionLabel = (action: string) => {
  const map: Record<string, string> = {
    create_post: '发布笔记',
    create_comment: '发表评论',
    like: '点赞互动',
    login: '登录',
    error: '执行失败',
  }
  return map[action] || action || '动作'
}

const formatTime = (value: string) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

onMounted(loadDashboard)
</script>

<style scoped>
.ai-dashboard {
  min-height: 100%;
  padding: 28px;
  color: #10213d;
}

.ai-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 18px;
}

.breadcrumb {
  color: #6b7d99;
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 8px;
}

.ai-hero h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.15;
  letter-spacing: 0;
}

.ai-hero p {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 15px;
  font-weight: 700;
}

.hero-actions {
  display: flex;
  gap: 10px;
  white-space: nowrap;
}

.health-panel,
.metric-card,
.panel {
  border: 1px solid rgba(190, 207, 230, .72);
  background: rgba(255, 255, 255, .78);
  box-shadow: 0 18px 44px rgba(69, 108, 168, .12);
  backdrop-filter: blur(14px);
}

.health-panel {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 18px;
  padding: 18px;
  border-radius: 18px;
  margin-bottom: 18px;
}

.health-score {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: 24px;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #22c55e);
}

.health-score.warn { background: linear-gradient(135deg, #f59e0b, #2563eb); }
.health-score.bad { background: linear-gradient(135deg, #f43f5e, #f97316); }
.health-score span { font-size: 12px; font-weight: 900; opacity: .9; }
.health-score strong { font-size: 34px; line-height: 1; }

.health-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.health-copy b {
  font-size: 18px;
}

.health-copy span,
.panel-head p,
.muted,
.bot-item span,
.log-item span,
.metric-card small {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.health-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: 16px;
}

.metric-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 15px;
  color: #fff;
  font-size: 22px;
  background: #2563eb;
}

.metric-icon.violet { background: linear-gradient(135deg, #7c3aed, #38bdf8); }
.metric-icon.green { background: linear-gradient(135deg, #16a34a, #22c55e); }
.metric-icon.orange { background: linear-gradient(135deg, #f97316, #facc15); }
.metric-icon.red { background: linear-gradient(135deg, #f43f5e, #fb7185); }
.metric-icon.cyan { background: linear-gradient(135deg, #0891b2, #22d3ee); }

.metric-card span {
  display: block;
  color: #52637d;
  font-size: 13px;
  font-weight: 900;
}

.metric-card strong {
  display: block;
  margin: 2px 0;
  font-size: 26px;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-bottom: 18px;
}

.content-grid.wide-left {
  grid-template-columns: minmax(0, 1.4fr) minmax(360px, .8fr);
}

.panel {
  border-radius: 18px;
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(200, 215, 235, .7);
}

.panel-head h3 {
  margin: 0 0 4px;
  font-size: 17px;
}

.warning-list,
.status-bars,
.bot-pool,
.log-list {
  padding: 18px 20px;
}

.warning-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #fff7ed;
  color: #c2410c;
  font-weight: 900;
}

.warning-item + .warning-item {
  margin-top: 10px;
}

.status-row + .status-row {
  margin-top: 14px;
}

.status-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 7px;
  color: #475569;
  font-weight: 900;
}

.bar {
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8eef7;
}

.bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #2563eb;
}

.bar i.completed { background: #22c55e; }
.bar i.failed { background: #ef4444; }
.bar i.running { background: #06b6d4; }
.bar i.approved { background: #f59e0b; }

.task-title {
  font-weight: 900;
  color: #0f172a;
}

.bot-item,
.log-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #e8eef7;
}

.bot-item:last-child,
.log-item:last-child {
  border-bottom: 0;
}

.bot-item div,
.log-item div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.bot-item b,
.log-item b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bot-item em {
  color: #2563eb;
  font-style: normal;
  font-weight: 900;
}

.log-item {
  grid-template-columns: auto minmax(0, 1fr) auto 170px;
}

.log-item time {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  text-align: right;
}

@media (max-width: 1400px) {
  .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .content-grid,
  .content-grid.wide-left { grid-template-columns: 1fr; }
}

@media (max-width: 900px) {
  .ai-dashboard { padding: 18px; }
  .ai-hero,
  .health-panel { grid-template-columns: 1fr; display: block; }
  .hero-actions,
  .health-tags { margin-top: 14px; justify-content: flex-start; }
  .metric-grid { grid-template-columns: 1fr; }
  .log-item { grid-template-columns: auto 1fr; }
  .log-item time { text-align: left; }
}
</style>
