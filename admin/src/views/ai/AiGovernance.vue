<template>
  <div class="ai-page">
    <div class="page-head">
      <div>
        <div class="breadcrumb">{{ pageMeta.breadcrumb }}</div>
        <h1>{{ pageMeta.title }}</h1>
        <p>{{ pageMeta.desc }}</p>
      </div>
      <div class="head-actions">
        <el-button @click="router.push('/content/audit')">进入人工审核台</el-button>
        <el-button :icon="Refresh" @click="loadActive">刷新</el-button>
      </div>
    </div>

    <div class="governance-nav">
      <button
        v-for="card in governanceCards"
        :key="card.tab"
        class="governance-card"
        :class="[card.tone, { active: activeTab === card.tab }]"
        type="button"
        @click="activateGovernanceTab(card.tab)"
      >
        <span>{{ card.title }}</span>
        <b>{{ card.value }}</b>
        <small>{{ card.unit }}</small>
        <p>{{ card.desc }}</p>
      </button>
    </div>

    <StatGrid :items="statItems" />

    <div class="workbench">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <el-tab-pane label="调用追踪" name="calls">
          <div class="filter-row">
            <el-input v-model="callQuery.keyword" placeholder="搜索 requestId / 提示词 / 错误" clearable />
            <el-select v-model="callQuery.status" placeholder="状态" clearable>
              <el-option label="成功" value="success" />
              <el-option label="失败" value="failed" />
              <el-option label="超时" value="timeout" />
              <el-option label="运行中" value="running" />
            </el-select>
            <el-select v-model="callQuery.purpose" placeholder="用途" clearable>
              <el-option label="内容生成" value="generation" />
              <el-option label="评论生成" value="comment_generate" />
              <el-option label="帖子生成" value="post_generate" />
              <el-option label="内容审核" value="moderation" />
            </el-select>
            <el-button type="primary" :icon="Search" @click="loadCalls">查询</el-button>
          </div>
          <el-table :data="calls" v-loading="loading.calls" empty-text="暂无模型调用记录">
            <el-table-column prop="requestId" label="RequestId" min-width="190" show-overflow-tooltip />
            <el-table-column prop="purpose" label="用途" width="120" />
            <el-table-column label="模型" width="180">
              <template #default="{ row }">{{ row.provider }} / {{ row.model }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'success' ? 'success' : row.status === 'running' ? 'info' : 'danger'" size="small">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Token" width="120">
              <template #default="{ row }">{{ row.totalTokens || 0 }}</template>
            </el-table-column>
            <el-table-column label="成本" width="110">
              <template #default="{ row }">¥{{ money(row.costAmount) }}</template>
            </el-table-column>
            <el-table-column prop="latencyMs" label="耗时(ms)" width="110" />
            <el-table-column label="内容预览" min-width="260" show-overflow-tooltip>
              <template #default="{ row }">{{ row.responsePreview || row.errorMessage || row.promptPreview || '-' }}</template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <Pager v-model:page="callQuery.page" v-model:page-size="callQuery.pageSize" :total="callTotal" @change="loadCalls" />
        </el-tab-pane>

        <el-tab-pane label="笔记/评论审核记录" name="moderation">
          <div class="filter-row">
            <el-select v-model="moderationQuery.targetType" placeholder="内容类型" clearable>
              <el-option label="帖子" value="post" />
              <el-option label="评论" value="comment" />
            </el-select>
            <el-select v-model="moderationQuery.decision" placeholder="AI结论" clearable>
              <el-option label="通过" value="approve" />
              <el-option label="拒绝" value="reject" />
              <el-option label="人工复核" value="manual" />
            </el-select>
            <el-select v-model="moderationQuery.finalStatus" placeholder="最终状态" clearable>
              <el-option label="已通过" value="approved" />
              <el-option label="待审核" value="pending" />
              <el-option label="已拒绝" value="rejected" />
            </el-select>
            <el-button type="primary" :icon="Search" @click="loadModeration">查询</el-button>
          </div>
          <el-table :data="moderations" v-loading="loading.moderation" empty-text="暂无AI审核记录">
            <el-table-column label="内容类型" width="100">
              <template #default="{ row }">{{ targetTypeText(row.targetType) }}</template>
            </el-table-column>
            <el-table-column prop="targetId" label="对象ID" min-width="180" show-overflow-tooltip />
            <el-table-column label="AI结论" width="110">
              <template #default="{ row }">
                <el-tag :type="row.decision === 'approve' ? 'success' : row.decision === 'reject' ? 'danger' : 'warning'" size="small">{{ decisionText(row.decision) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="score" label="风险分" width="90" />
            <el-table-column label="最终状态" width="110">
              <template #default="{ row }">{{ finalStatusText(row.finalStatus) }}</template>
            </el-table-column>
            <el-table-column prop="reason" label="原因" min-width="260" show-overflow-tooltip />
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <Pager v-model:page="moderationQuery.page" v-model:page-size="moderationQuery.pageSize" :total="moderationTotal" @change="loadModeration" />
        </el-tab-pane>

        <el-tab-pane label="成本配额" name="quota">
          <el-table :data="quotas" v-loading="loading.quota" empty-text="暂无成本统计">
            <el-table-column label="日期" width="120">
              <template #default="{ row }">{{ dateText(row.date) }}</template>
            </el-table-column>
            <el-table-column label="模型" min-width="170">
              <template #default="{ row }">{{ row.provider }} / {{ row.model }}</template>
            </el-table-column>
            <el-table-column prop="purpose" label="用途" width="130" />
            <el-table-column prop="scopeKey" label="范围" min-width="170" show-overflow-tooltip />
            <el-table-column prop="callCount" label="调用" width="90" />
            <el-table-column prop="successCount" label="成功" width="90" />
            <el-table-column prop="failedCount" label="失败" width="90" />
            <el-table-column label="Token" width="120">
              <template #default="{ row }">{{ (row.inputTokens || 0) + (row.outputTokens || 0) }}</template>
            </el-table-column>
            <el-table-column label="成本" width="120">
              <template #default="{ row }">¥{{ money(row.costAmount) }}</template>
            </el-table-column>
          </el-table>
          <Pager v-model:page="quotaQuery.page" v-model:page-size="quotaQuery.pageSize" :total="quotaTotal" @change="loadQuota" />
        </el-tab-pane>

        <el-tab-pane label="风险事件" name="risks">
          <el-table :data="risks" v-loading="loading.risks" empty-text="暂无风险事件">
            <el-table-column prop="eventType" label="类型" width="150" />
            <el-table-column label="等级" width="100">
              <template #default="{ row }">
                <el-tag :type="row.level === 'critical' ? 'danger' : row.level === 'warning' ? 'warning' : 'info'" size="small">{{ row.level }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100" />
            <el-table-column prop="taskId" label="任务ID" min-width="170" show-overflow-tooltip />
            <el-table-column label="详情" min-width="260" show-overflow-tooltip>
              <template #default="{ row }">{{ detailText(row.detail) }}</template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <el-button v-if="hasEditPermission && row.status !== 'handled'" size="small" type="primary" link @click="handleRisk(row)">处理</el-button>
                <span v-else>已处理</span>
              </template>
            </el-table-column>
          </el-table>
          <Pager v-model:page="riskQuery.page" v-model:page-size="riskQuery.pageSize" :total="riskTotal" @change="loadRisks" />
        </el-tab-pane>

        <el-tab-pane label="数据修复" name="repair">
          <div class="repair-grid" v-loading="loading.repair">
            <div v-for="item in repairItems" :key="item.action" class="repair-card">
              <div>
                <span>{{ item.label }}</span>
                <b>{{ item.count }}</b>
                <p>{{ item.desc }}</p>
              </div>
              <el-button v-if="hasRepairPermission" type="primary" plain @click="runRepair(item.action, item.label)">一键处理</el-button>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="配置版本" name="versions">
          <el-table :data="versions" v-loading="loading.versions" empty-text="暂无配置版本">
            <el-table-column prop="version" label="版本" width="90" />
            <el-table-column prop="changedBy" label="操作人" width="160" show-overflow-tooltip />
            <el-table-column prop="changeReason" label="说明" min-width="240" show-overflow-tooltip />
            <el-table-column label="配置摘要" min-width="260" show-overflow-tooltip>
              <template #default="{ row }">{{ configSummary(row.maskedValue || row.value) }}</template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <el-button v-if="hasEditPermission" size="small" type="primary" link @click="rollback(row)">回滚</el-button>
              </template>
            </el-table-column>
          </el-table>
          <Pager v-model:page="versionQuery.page" v-model:page-size="versionQuery.pageSize" :total="versionTotal" @change="loadVersions" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElPagination } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import { useAuthStore } from '@/stores/auth'
import StatGrid from '@/components/glass/StatGrid.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('ai:edit'))
const hasRepairPermission = ref(auth.permissions.includes('ai:edit'))

const Pager = defineComponent({
  props: {
    page: { type: Number, required: true },
    pageSize: { type: Number, required: true },
    total: { type: Number, required: true }
  },
  emits: ['update:page', 'update:pageSize', 'change'],
  setup(props, { emit }) {
    return () => h('div', { class: 'pagination-row' }, [
      h('span', `共 ${props.total} 条`),
      h(ElPagination, {
        currentPage: props.page,
        pageSize: props.pageSize,
        total: props.total,
        pageSizes: [10, 20, 50],
        layout: 'sizes, prev, pager, next',
        'onUpdate:currentPage': (value: number) => emit('update:page', value),
        'onUpdate:pageSize': (value: number) => emit('update:pageSize', value),
        onChange: () => emit('change')
      })
    ])
  }
})

const tabs = ['calls', 'moderation', 'quota', 'risks', 'repair', 'versions']
const tabForRoute = () => {
  const queryTab = String(route.query.tab || '')
  if (tabs.includes(queryTab)) return queryTab
  if (route.path.includes('/ai/moderation')) return 'moderation'
  return 'moderation'
}
const pageMeta = computed(() => {
  return {
    breadcrumb: 'AI 运营中心 / AI治理中心',
    title: 'AI治理中心',
    desc: '把 AI 审核、调用追踪、成本配额、风险事件和数据修复归到一个工作台，运营不用在多个相似页面里来回找。'
  }
})
const activeTab = ref(tabForRoute())
const loading = reactive<Record<string, boolean>>({ calls: false, moderation: false, quota: false, risks: false, versions: false, repair: false })

const calls = ref<any[]>([])
const moderations = ref<any[]>([])
const quotas = ref<any[]>([])
const risks = ref<any[]>([])
const versions = ref<any[]>([])
const quotaSummary = ref<any>({})
const repairStats = ref<any>({})
const statItems = computed(() => [
  { label: '调用次数', value: quotaSummary.value.callCount || 0 },
  { label: '成功 / 失败', value: `${quotaSummary.value.successCount || 0} / ${quotaSummary.value.failedCount || 0}` },
  { label: 'Token', value: (quotaSummary.value.inputTokens || 0) + (quotaSummary.value.outputTokens || 0) },
  { label: '预估成本', value: `¥${money(quotaSummary.value.costAmount)}` },
])

const callTotal = ref(0)
const moderationTotal = ref(0)
const quotaTotal = ref(0)
const riskTotal = ref(0)
const versionTotal = ref(0)

const callQuery = reactive<any>({ page: 1, pageSize: 20, keyword: '', status: '', purpose: '' })
const moderationQuery = reactive<any>({ page: 1, pageSize: 20, targetType: '', decision: '', finalStatus: '' })
const quotaQuery = reactive<any>({ page: 1, pageSize: 20 })
const riskQuery = reactive<any>({ page: 1, pageSize: 20 })
const versionQuery = reactive<any>({ page: 1, pageSize: 20 })
const governanceCards = computed(() => [
  {
    tab: 'moderation',
    title: '审核治理',
    value: moderationTotal.value || 0,
    unit: '条审核记录',
    desc: '看 AI 对笔记、帖子和评论的判断，以及最终处理原因。',
    tone: 'blue'
  },
  {
    tab: 'calls',
    title: '调用追踪',
    value: quotaSummary.value.callCount || callTotal.value || 0,
    unit: '次模型调用',
    desc: '排查接口失败、超时、模型返回异常和调用链路。',
    tone: 'green'
  },
  {
    tab: 'quota',
    title: '成本配额',
    value: `¥${money(quotaSummary.value.costAmount)}`,
    unit: '预估成本',
    desc: '看每日 Token、调用次数和费用，控制运营预算。',
    tone: 'amber'
  },
  {
    tab: 'risks',
    title: '风险处置',
    value: riskTotal.value || 0,
    unit: '条风险事件',
    desc: '处理异常任务、失败重试和风控拦截事件。',
    tone: 'red'
  }
])
const repairItems = computed(() => [
  {
    label: '卡死任务',
    action: 'running-tasks',
    count: repairStats.value.staleRunningTasks || 0,
    desc: '超过30分钟仍处于运行中的AI任务，会标记为失败并留下风险记录。'
  },
  {
    label: '评论计数异常',
    action: 'comment-counts',
    count: repairStats.value.commentCountMismatches || 0,
    desc: '重算帖子真实可见评论数，避免列表和详情显示不一致。'
  },
  {
    label: '机器人资料缺失',
    action: 'bot-profiles',
    count: (repairStats.value.botsMissingProfile || 0) + (repairStats.value.botsMissingSettings || 0),
    desc: '补齐机器人用户资料和隐私设置，避免小程序资料页、评论区显示异常。'
  }
])

const pageOf = (res: any) => res?.data || res || {}
const money = (value: any) => Number(value || 0).toFixed(4)
const formatTime = (value: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
const dateText = (value: string) => value ? new Date(value).toLocaleDateString('zh-CN') : '-'
const detailText = (value: any) => !value ? '-' : typeof value === 'string' ? value : (value.message || value.error || JSON.stringify(value))
const statusText = (status: string) => ({ success: '成功', failed: '失败', timeout: '超时', running: '运行中' }[status] || status || '-')
const decisionText = (decision: string) => ({ approve: '通过', reject: '拒绝', manual: '人工复核' }[decision] || decision || '-')
const targetTypeText = (type: string) => ({ post: '帖子/笔记', comment: '评论', image: '图片', qrcode: '二维码' }[type] || type || '-')
const finalStatusText = (status: string) => ({ approved: '已通过', pending: '待人工审核', rejected: '已驳回', active: '已展示', hidden: '已隐藏' }[status] || status || '-')
const configSummary = (value: any) => {
  const v = value || {}
  return `${v.enabled ? '启用' : '关闭'} · ${v.provider || '-'} · ${v.model || '-'} · ${v.reviewBeforePost ? '发帖需复核' : '发帖直接发布'}`
}

const loadCalls = async () => {
  loading.calls = true
  try {
    const res: any = await request.get('/admin/ai/call-logs', { params: callQuery })
    const page = pageOf(res)
    calls.value = page.list || []
    callTotal.value = page.total || 0
  } finally {
    loading.calls = false
  }
}

const loadModeration = async () => {
  loading.moderation = true
  try {
    const res: any = await request.get('/admin/ai/moderation-records', { params: moderationQuery })
    const page = pageOf(res)
    moderations.value = page.list || []
    moderationTotal.value = page.total || 0
  } finally {
    loading.moderation = false
  }
}

const loadQuota = async () => {
  loading.quota = true
  try {
    const res: any = await request.get('/admin/ai/quota-usage', { params: quotaQuery })
    const page = pageOf(res)
    quotas.value = page.list || []
    quotaSummary.value = page.summary || {}
    quotaTotal.value = page.total || 0
  } finally {
    loading.quota = false
  }
}

const loadRisks = async () => {
  loading.risks = true
  try {
    const res: any = await request.get('/admin/ai/risk-events', { params: riskQuery })
    const page = pageOf(res)
    risks.value = page.list || []
    riskTotal.value = page.total || 0
  } finally {
    loading.risks = false
  }
}

const loadVersions = async () => {
  loading.versions = true
  try {
    const res: any = await request.get('/admin/ai/config/versions', { params: versionQuery })
    const page = pageOf(res)
    versions.value = page.list || []
    versionTotal.value = page.total || 0
  } finally {
    loading.versions = false
  }
}

const loadRepairStats = async () => {
  loading.repair = true
  try {
    const res: any = await request.get('/admin/ai/repair/stats')
    repairStats.value = res?.data || res || {}
  } finally {
    loading.repair = false
  }
}

const loadActive = () => {
  if (activeTab.value === 'calls') return loadCalls()
  if (activeTab.value === 'moderation') return loadModeration()
  if (activeTab.value === 'quota') return loadQuota()
  if (activeTab.value === 'risks') return loadRisks()
  if (activeTab.value === 'repair') return loadRepairStats()
  return loadVersions()
}

const activateGovernanceTab = (tab: string) => {
  if (!tabs.includes(tab)) return
  activeTab.value = tab
  const shouldSyncRoute = route.path !== '/ai/governance' || String(route.query.tab || '') !== tab
  if (shouldSyncRoute) {
    router.replace({ path: '/ai/governance', query: { ...route.query, tab } }).catch(() => undefined)
    return
  }
  loadActive()
}

const handleTabChange = (tab: string | number) => activateGovernanceTab(String(tab))

watch(
  () => [route.path, route.query.tab],
  () => {
    activeTab.value = tabForRoute()
    loadActive()
  },
)

const handleRisk = async (row: any) => {
  const { value } = await ElMessageBox.prompt('处理备注', '处理风险事件', {
    confirmButtonText: '确认处理',
    cancelButtonText: '取消',
    inputPlaceholder: '例如：已检查任务，确认无需处理'
  })
  await request.post(`/admin/ai/risk-events/${row.id}/handle`, { remark: value, status: 'handled' })
  ElMessage.success('已处理')
  loadRisks()
}

const rollback = async (row: any) => {
  await ElMessageBox.confirm(`确定回滚到 AI 配置版本 ${row.version} 吗？`, '回滚配置', { type: 'warning' })
  await request.post(`/admin/ai/config/versions/${row.id}/rollback`)
  ElMessage.success('已回滚配置')
  loadVersions()
}

const runRepair = async (action: string, label: string) => {
  await ElMessageBox.confirm(`确定执行「${label}」修复吗？系统会记录本次操作。`, '数据修复', { type: 'warning' })
  const res: any = await request.post(`/admin/ai/repair/${action}`)
  const data = res?.data || {}
  ElMessage.success(`处理完成：${Object.values(data).join(' / ') || 0}`)
  loadRepairStats()
}

onMounted(() => {
  loadQuota()
  loadActive()
  loadRepairStats()
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

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.breadcrumb {
  color: var(--el-color-primary);
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

.governance-nav {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.governance-card {
  min-height: 138px;
  padding: 18px;
  border: 1px solid var(--mx-border-strong);
  border-radius: 14px;
  background: var(--mx-card);
  box-shadow: var(--mx-shadow);
  text-align: left;
  cursor: pointer;
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}

.governance-card:hover,
.governance-card.active {
  transform: translateY(-2px);
  border-color: var(--el-color-primary-light-3);
  box-shadow: 0 20px 46px color-mix(in srgb, var(--el-color-primary) 14%, transparent);
}

.governance-card span,
.governance-card small {
  display: block;
  color: var(--mx-sub);
  font-weight: 800;
}

.governance-card b {
  display: block;
  margin: 8px 0 2px;
  color: var(--mx-text);
  font-size: 28px;
  line-height: 1;
}

.governance-card p {
  margin: 12px 0 0;
  color: var(--mx-sub);
  font-size: 13px;
  line-height: 1.55;
  font-weight: 700;
}

.governance-card.blue.active { background: var(--el-color-primary-light-9); }
.governance-card.green.active { background: var(--el-color-success-light-9); }
.governance-card.amber.active { background: var(--el-color-warning-light-9); }
.governance-card.red.active { background: var(--el-color-danger-light-9); }

.workbench {
  border: 1px solid var(--mx-border-strong);
  border-radius: 14px;
  background: var(--mx-card);
  box-shadow: var(--mx-shadow);
}

.workbench {
  padding: 16px 18px;
}

.filter-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 180px 180px auto;
  gap: 12px;
  margin: 4px 0 16px;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16px;
  padding-top: 14px;
  color: var(--mx-sub);
  font-weight: 700;
}

.repair-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  min-height: 180px;
}

.repair-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  min-height: 170px;
  padding: 18px;
  border: 1px solid var(--mx-border-strong);
  border-radius: 14px;
  background: var(--mx-card);
}

.repair-card span {
  display: block;
  color: var(--mx-sub);
  font-weight: 800;
  margin-bottom: 6px;
}

.repair-card b {
  display: block;
  color: var(--mx-text);
  font-size: 34px;
  line-height: 1;
  margin-bottom: 10px;
}

.repair-card p {
  margin: 0;
  color: var(--mx-sub);
  line-height: 1.7;
  font-weight: 700;
}

@media (max-width: 1100px) {
  .governance-nav,
  .filter-row,
  .repair-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
