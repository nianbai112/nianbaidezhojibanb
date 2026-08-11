<template>
  <div class="page-container">
    <PageHeader title="骑手分析" subtitle="查看跑腿与外卖履约风险，配置专用 AI 大模型生成算法建议。">
      <template #actions>
        <el-select v-model="filters.regionId" clearable filterable placeholder="全部区域" style="width: 180px" @change="loadAll">
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-button :icon="Refresh" :loading="loading" @click="loadAll">刷新</el-button>
        <el-button type="primary" :icon="MagicStick" :loading="running" @click="runAnalysis">手动分析</el-button>
      </template>
    </PageHeader>

    <el-alert
      class="notice"
      type="warning"
      :closable="false"
      show-icon
      title="AI建议，不自动生效"
      description="骑手算法 AI 只基于匿名聚合数据生成建议；跑腿禁运、价值上限、证据要求等硬规则仍由后端规则引擎决定。"
    />

    <StatGrid :items="statItems" />

    <el-tabs v-model="activeTab" class="rider-tabs">
      <el-tab-pane label="总览" name="overview">
        <section class="panel fulfillment-panel">
          <div class="section-head">
            <h3>履约学习指标</h3>
            <span>接单成功率、超时率、取消率、风险事故率</span>
          </div>
          <el-table :data="fulfillmentRows" size="small">
            <el-table-column prop="scene" label="场景" width="90" />
            <el-table-column prop="total_orders" label="订单样本" width="100" />
            <el-table-column label="接单成功率" width="120">
              <template #default="{ row }">{{ rateText(row.acceptance_rate) }}</template>
            </el-table-column>
            <el-table-column label="完成率" width="100">
              <template #default="{ row }">{{ rateText(row.completion_rate) }}</template>
            </el-table-column>
            <el-table-column label="超时率" width="100">
              <template #default="{ row }">{{ rateText(row.timeout_rate) }}</template>
            </el-table-column>
            <el-table-column label="取消率" width="100">
              <template #default="{ row }">{{ rateText(row.cancel_rate) }}</template>
            </el-table-column>
            <el-table-column label="风险事故率" width="120">
              <template #default="{ row }">{{ rateText(row.incident_rate) }}</template>
            </el-table-column>
            <el-table-column label="平均接单" width="110">
              <template #default="{ row }">{{ minuteText(row.average_accept_minutes) }}</template>
            </el-table-column>
            <el-table-column label="平均履约" min-width="110">
              <template #default="{ row }">{{ minuteText(row.average_delivery_minutes) }}</template>
            </el-table-column>
          </el-table>
        </section>
        <div class="two-column">
          <section class="panel">
            <div class="section-head">
              <h3>风险标签排行</h3>
              <span>来自学习快照</span>
            </div>
            <el-table :data="riskTags" size="small">
              <el-table-column prop="tag" label="风险标签" min-width="140" />
              <el-table-column prop="count" label="出现次数" width="110" />
            </el-table>
          </section>
          <section class="panel">
            <div class="section-head">
              <h3>系统建议关注</h3>
              <span>无需 AI 也可生成</span>
            </div>
            <div class="attention-list">
              <div v-for="item in attentionItems" :key="item" class="attention-item">{{ item }}</div>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="跑腿算法" name="errand">
        <section class="panel">
          <div class="section-head">
            <h3>跑腿算法</h3>
            <span>蛋糕、液体、贵重、大件、叠单、推送范围</span>
          </div>
          <div class="algorithm-grid">
            <div class="algorithm-item">
              <b>{{ analytics.errand_algorithm?.active_orders || 0 }}</b>
              <span>活跃跑腿单</span>
            </div>
            <div class="algorithm-item">
              <b>{{ analytics.summary?.high_risk || 0 }}</b>
              <span>高风险样本</span>
            </div>
            <div class="algorithm-item">
              <b>{{ analytics.summary?.blocked || 0 }}</b>
              <span>拦截样本</span>
            </div>
            <div class="algorithm-item">
              <b>{{ analytics.summary?.evidence_required || 0 }}</b>
              <span>需证据样本</span>
            </div>
            <div class="algorithm-item">
              <b>{{ rateText(errandFulfillment.acceptance_rate) }}</b>
              <span>接单成功率</span>
            </div>
            <div class="algorithm-item">
              <b>{{ rateText(errandFulfillment.timeout_rate) }}</b>
              <span>超时率</span>
            </div>
            <div class="algorithm-item">
              <b>{{ rateText(errandFulfillment.cancel_rate) }}</b>
              <span>取消率</span>
            </div>
            <div class="algorithm-item">
              <b>{{ rateText(errandFulfillment.incident_rate) }}</b>
              <span>风险事故率</span>
            </div>
          </div>
          <el-table :data="riskTags" size="small" class="mt">
            <el-table-column prop="tag" label="跑腿风险标签" min-width="180" />
            <el-table-column prop="count" label="样本数" width="120" />
            <el-table-column label="建议动作" min-width="260">
              <template #default="{ row }">
                {{ errandTagSuggestion(row.tag) }}
              </template>
            </el-table-column>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane label="外卖算法" name="takeaway">
        <section class="panel">
          <div class="section-head">
            <h3>外卖算法</h3>
            <span>商家出餐、取餐等待、热食冷食、午高峰</span>
          </div>
          <div class="algorithm-grid">
            <div class="algorithm-item">
              <b>{{ analytics.takeaway_algorithm?.active_orders || 0 }}</b>
              <span>活跃外卖单</span>
            </div>
            <div class="algorithm-item">
              <b>{{ rateText(takeawayFulfillment.acceptance_rate) }}</b>
              <span>接单成功率</span>
            </div>
            <div class="algorithm-item">
              <b>{{ rateText(takeawayFulfillment.timeout_rate) }}</b>
              <span>超时率</span>
            </div>
            <div class="algorithm-item">
              <b>{{ rateText(takeawayFulfillment.cancel_rate) }}</b>
              <span>取消率</span>
            </div>
            <div class="algorithm-item muted">
              <b>沉淀中</b>
              <span>商家等待时间</span>
            </div>
            <div class="algorithm-item muted">
              <b>沉淀中</b>
              <span>午高峰缓冲</span>
            </div>
          </div>
          <div class="attention-list mt">
            <div v-for="item in takeawayItems" :key="item" class="attention-item">{{ item }}</div>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="AI建议配置" name="config">
        <section class="panel">
          <div class="section-head">
            <h3>骑手算法专用 AI 配置</h3>
            <span>独立于 AI运营中心，仅用于骑手跑腿/外卖算法分析</span>
          </div>
          <el-form label-position="top">
            <div class="form-grid">
              <el-form-item label="启用 AI 建议">
                <el-switch v-model="aiConfig.enabled" />
              </el-form-item>
              <el-form-item label="服务商">
                <el-select v-model="aiConfig.provider" style="width: 100%">
                  <el-option label="DeepSeek" value="deepseek" />
                  <el-option label="OpenAI 兼容" value="openai" />
                  <el-option label="通义千问" value="qwen" />
                  <el-option label="自定义" value="custom" />
                </el-select>
              </el-form-item>
              <el-form-item label="API 地址">
                <el-input v-model="aiConfig.apiBaseUrl" placeholder="兼容 OpenAI 的接口地址" />
              </el-form-item>
              <el-form-item label="API Key">
                <el-input v-model="aiConfig.apiKey" type="password" show-password :placeholder="aiConfig.hasApiKey ? '已配置，留空不修改' : '请输入 API Key'" />
              </el-form-item>
              <el-form-item label="模型名称">
                <el-input v-model="aiConfig.model" placeholder="deepseek-chat / gpt-4.1-mini" />
              </el-form-item>
              <el-form-item label="更新周期">
                <el-select v-model="aiConfig.analysisInterval" style="width: 100%">
                  <el-option label="仅手动" value="manual" />
                  <el-option label="每小时" value="hourly" />
                  <el-option label="每 6 小时" value="six_hours" />
                  <el-option label="每天" value="daily" />
                  <el-option label="每周" value="weekly" />
                </el-select>
              </el-form-item>
              <el-form-item label="算法范围">
                <el-select v-model="aiConfig.analysisScope" style="width: 100%">
                  <el-option label="跑腿 + 外卖" value="all" />
                  <el-option label="仅跑腿算法" value="errand" />
                  <el-option label="仅外卖算法" value="takeaway" />
                </el-select>
              </el-form-item>
              <el-form-item label="每日调用上限">
                <el-input-number v-model="aiConfig.dailyCallLimit" :min="0" :max="10000" style="width: 100%" />
              </el-form-item>
              <el-form-item label="每日成本上限">
                <el-input-number v-model="aiConfig.dailyCostLimit" :min="0" :max="100000" :precision="2" style="width: 100%" />
              </el-form-item>
              <el-form-item label="最大 Token">
                <el-input-number v-model="aiConfig.maxTokens" :min="100" :max="32000" style="width: 100%" />
              </el-form-item>
              <el-form-item label="温度">
                <el-input-number v-model="aiConfig.temperature" :min="0" :max="2" :step="0.1" :precision="1" style="width: 100%" />
              </el-form-item>
            </div>
            <div class="form-actions">
              <span>状态：{{ aiConfig.configured ? '已配置' : '未配置' }}；下次更新：{{ aiConfig.nextRunAt || '手动触发' }}</span>
              <el-button type="primary" :icon="Check" :loading="savingConfig" @click="saveConfig">保存配置</el-button>
            </div>
          </el-form>
        </section>
      </el-tab-pane>

      <el-tab-pane label="优化建议" name="suggestions">
        <section class="panel">
          <div class="section-head">
            <h3>AI 优化建议</h3>
            <span>接受后仍需人工应用到规则</span>
          </div>
          <el-table :data="suggestions" size="small">
            <el-table-column prop="title" label="建议" min-width="180" />
            <el-table-column prop="target_algorithm" label="算法" width="100" />
            <el-table-column prop="suggestion_type" label="类型" width="120" />
            <el-table-column prop="confidence" label="置信度" width="90" />
            <el-table-column prop="status" label="状态" width="90" />
            <el-table-column prop="suggested_change" label="建议调整" min-width="280" show-overflow-tooltip />
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="setSuggestion(row, 'accepted')">接受</el-button>
                <el-button link type="danger" size="small" @click="setSuggestion(row, 'dismissed')">忽略</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane label="执行日志" name="logs">
        <section class="panel">
          <div class="section-head">
            <h3>AI 分析执行日志</h3>
            <span>记录手动和定时分析</span>
          </div>
          <el-table :data="runLogs" size="small">
            <el-table-column prop="created_at" label="时间" width="180" />
            <el-table-column prop="trigger_type" label="触发" width="100" />
            <el-table-column prop="scope" label="范围" width="110" />
            <el-table-column prop="provider" label="服务商" width="120" />
            <el-table-column prop="model" label="模型" width="160" />
            <el-table-column prop="status" label="状态" min-width="180" />
            <el-table-column prop="generated_suggestion_count" label="建议数" width="90" />
          </el-table>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Check, MagicStick, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import {
  fetchRegions,
  fetchRiderAnalytics,
  fetchRiderAiConfig,
  fetchRiderAiRunLogs,
  fetchRiderAiSuggestions,
  runRiderAiAnalysis,
  saveRiderAiConfig,
  updateRiderAiSuggestionStatus,
} from '@/api/admin'

const loading = ref(false)
const running = ref(false)
const savingConfig = ref(false)
const activeTab = ref('overview')
const regions = ref<any[]>([])
const analytics = ref<any>({})
const suggestions = ref<any[]>([])
const runLogs = ref<any[]>([])
const filters = reactive({ regionId: '' })
const aiConfig = reactive<any>({
  enabled: false,
  provider: 'deepseek',
  apiBaseUrl: '',
  apiKey: '',
  model: 'deepseek-chat',
  analysisInterval: 'manual',
  analysisScope: 'all',
  dailyCallLimit: 20,
  dailyCostLimit: 20,
  maxTokens: 1200,
  temperature: 0.2,
  configured: false,
  hasApiKey: false,
  nextRunAt: ''
})

const unwrap = (res: any) => res?.data ?? res ?? {}
const riskTags = computed(() => analytics.value.summary?.top_tags || [])
const attentionItems = computed(() => analytics.value.summary?.attention_items || [])
const takeawayItems = computed(() => analytics.value.takeaway_algorithm?.attention_items || [])
const fulfillmentMetrics = computed(() => analytics.value.fulfillment_metrics || {})
const overallFulfillment = computed(() => fulfillmentMetrics.value.overall || {})
const errandFulfillment = computed(() => fulfillmentMetrics.value.errand || {})
const takeawayFulfillment = computed(() => fulfillmentMetrics.value.takeaway || {})
const fulfillmentRows = computed(() => [
  { scene: '跑腿', ...errandFulfillment.value },
  { scene: '外卖', ...takeawayFulfillment.value },
  { scene: '合计', ...overallFulfillment.value },
])

const statItems = computed(() => [
  { label: '骑手总数', value: analytics.value.rider_supply?.total || 0, sub: `在线率 ${analytics.value.rider_supply?.online_rate || 0}%`, icon: 'User', tone: 'blue' as const },
  { label: '在线骑手', value: analytics.value.rider_supply?.online || 0, sub: '当前可服务供给', icon: 'UserFilled', tone: 'green' as const },
  { label: '接单成功率', value: rateText(overallFulfillment.value.acceptance_rate), sub: `${overallFulfillment.value.accepted_orders || 0}/${overallFulfillment.value.total_orders || 0} 单已接`, icon: 'CircleCheck', tone: 'green' as const },
  { label: '超时率', value: rateText(overallFulfillment.value.timeout_rate), sub: `${overallFulfillment.value.timeout_orders || 0} 单超时`, icon: 'Timer', tone: 'orange' as const },
  { label: '取消率', value: rateText(overallFulfillment.value.cancel_rate), sub: `${overallFulfillment.value.cancelled_orders || 0} 单取消`, icon: 'CircleClose', tone: 'red' as const },
  { label: '风险事故率', value: rateText(overallFulfillment.value.incident_rate), sub: `${overallFulfillment.value.incident_orders || 0} 单有事故`, icon: 'WarningFilled', tone: 'red' as const },
  { label: 'AI建议', value: suggestions.value.length, sub: '待处理/已处理建议', icon: 'MagicStick', tone: 'purple' as const },
])

function rateText(value: any) {
  const n = Number(value || 0)
  return `${Number.isFinite(n) ? n.toFixed(2) : '0.00'}%`
}

function minuteText(value: any) {
  const n = Number(value || 0)
  return n > 0 ? `${n.toFixed(1)} 分钟` : '-'
}

function errandTagSuggestion(tag: string) {
  const map: Record<string, string> = {
    cake: '禁止叠单，缩小推送范围，要求取送照片',
    liquid: '限制骑手当前任务量，增加防洒提醒',
    valuable: '检查价值上限和交接证据',
    large: '优先大件能力骑手，增加 ETA 缓冲',
    heavy: '限制步行骑手，建议提高配送费',
    blocked: '前置拦截，减少无效支付和纠纷'
  }
  return map[tag] || '继续观察样本，等待更多数据校准'
}

async function loadRegions() {
  try {
    regions.value = await fetchRegions()
  } catch {
    regions.value = []
  }
}

async function loadAnalytics() {
  const res = await fetchRiderAnalytics({ regionId: filters.regionId || undefined })
  analytics.value = unwrap(res)
}

async function loadConfig() {
  const data = unwrap(await fetchRiderAiConfig())
  Object.assign(aiConfig, data, { apiKey: '' })
}

async function loadSuggestions() {
  const data = unwrap(await fetchRiderAiSuggestions())
  suggestions.value = Array.isArray(data.list) ? data.list : []
}

async function loadRunLogs() {
  const data = unwrap(await fetchRiderAiRunLogs({ limit: 50 }))
  runLogs.value = Array.isArray(data.list) ? data.list : []
}

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([loadAnalytics(), loadConfig(), loadSuggestions(), loadRunLogs()])
  } catch (error: any) {
    ElMessage.error(error?.message || '加载骑手分析失败')
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  savingConfig.value = true
  try {
    const data = unwrap(await saveRiderAiConfig({ ...aiConfig }))
    Object.assign(aiConfig, data, { apiKey: '' })
    ElMessage.success('骑手算法 AI 配置已保存')
  } finally {
    savingConfig.value = false
  }
}

async function runAnalysis() {
  running.value = true
  try {
    await runRiderAiAnalysis({ regionId: filters.regionId || undefined, trigger_type: 'manual' })
    await Promise.all([loadAnalytics(), loadSuggestions(), loadRunLogs(), loadConfig()])
    activeTab.value = 'suggestions'
    ElMessage.success('分析完成，已生成建议')
  } finally {
    running.value = false
  }
}

async function setSuggestion(row: any, status: string) {
  await updateRiderAiSuggestionStatus(row.id, { status })
  await loadSuggestions()
  ElMessage.success(status === 'accepted' ? '建议已接受' : '建议已忽略')
}

onMounted(async () => {
  await loadRegions()
  await loadAll()
})
</script>

<style scoped>
.page-container { display: grid; gap: 16px; }
.notice { border-radius: 6px; }
.panel { background: #fff; border: 1px solid #e5edf8; border-radius: 6px; padding: 16px; }
.rider-tabs { background: transparent; }
.two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.section-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
.section-head h3 { margin: 0; color: #0f172a; font-size: 16px; }
.section-head span { color: #94a3b8; font-size: 12px; }
.attention-list { display: grid; gap: 10px; }
.attention-item { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px; color: #475569; background: #f8fafc; font-size: 13px; }
.algorithm-grid { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 12px; }
.algorithm-item { border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; background: #f8fafc; }
.algorithm-item b { display: block; color: #0f172a; font-size: 22px; }
.algorithm-item span { display: block; margin-top: 6px; color: #64748b; font-size: 12px; }
.algorithm-item.muted b { font-size: 16px; color: #64748b; }
.form-grid { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 12px 16px; }
.form-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #64748b; font-size: 13px; }
.mt { margin-top: 14px; }
@media (max-width: 1200px) {
  .two-column { grid-template-columns: 1fr; }
  .algorithm-grid { grid-template-columns: repeat(2, 1fr); }
  .form-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 720px) {
  .algorithm-grid, .form-grid { grid-template-columns: 1fr; }
  .form-actions { align-items: flex-start; flex-direction: column; }
}
</style>
