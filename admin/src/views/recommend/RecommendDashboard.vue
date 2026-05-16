<template>
  <div class="page-shell recommend-dashboard">
    <GlassPageHeader title="推荐中心" subtitle="查看推荐策略、推荐池健康度、实验状态和可推荐内容规模">
      <template #actions>
        <el-select v-model="rebuildTarget" class="target-select" placeholder="重建类型">
          <el-option v-for="item in targetOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" :loading="rebuilding" @click="rebuildPool">重建推荐池</el-button>
        <el-button :icon="RefreshRight" :loading="loading" @click="loadDashboard(true)">刷新</el-button>
      </template>
    </GlassPageHeader>

    <div class="summary-grid">
      <div v-for="card in summaryCards" :key="card.key" class="summary-card glass-card">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <small>{{ card.hint }}</small>
      </div>
    </div>

    <div class="health-strip glass-card">
      <div v-for="item in healthItems" :key="item.key" class="health-item" :class="{ ok: item.ok }">
        <span class="dot" />
        <div>
          <strong>{{ item.label }}</strong>
          <small>{{ item.ok ? item.okText : item.warnText }}</small>
        </div>
      </div>
    </div>

    <div class="dashboard-layout">
      <div class="glass-card panel-card">
        <div class="panel-head">
          <div>
            <h3>推荐池分布</h3>
            <p>来自 `recommend_pools` 的真实聚合，不再用前端假统计。</p>
          </div>
          <el-button link type="primary" @click="$router.push('/recommend/pool')">查看推荐池</el-button>
        </div>
        <el-table :data="byType" v-loading="loading" stripe>
          <el-table-column prop="label" label="内容类型" min-width="130" />
          <el-table-column prop="count" label="池内数量" width="110" />
          <el-table-column prop="avgScore" label="平均分" width="110" />
          <el-table-column prop="maxScore" label="最高分" width="110" />
        </el-table>
      </div>

      <div class="glass-card panel-card">
        <div class="panel-head">
          <div>
            <h3>可推荐素材</h3>
            <p>从真实业务表统计，帮助判断是不是没有内容可推。</p>
          </div>
        </div>
        <div class="target-list">
          <div v-for="item in targetCounts" :key="item.targetType" class="target-row">
            <span>{{ item.label }}</span>
            <strong>{{ item.count }}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card panel-card">
      <div class="panel-head">
        <div>
          <h3>最近进入推荐池</h3>
          <p>展示目标名称、区域、分数和过期时间，方便发现“有数据但页面看不到”的问题。</p>
        </div>
      </div>
      <el-table :data="recentPool" v-loading="loading" stripe>
        <el-table-column label="推荐目标" min-width="260">
          <template #default="{ row }">
            <div class="target-cell">
              <el-avatar :size="36" :src="row.target?.image">{{ firstChar(row.target?.name) }}</el-avatar>
              <div>
                <strong>{{ row.target?.name || row.targetId }}</strong>
                <small>{{ row.target?.subtitle || row.targetId }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="targetTypeLabel" label="类型" width="110" />
        <el-table-column prop="regionName" label="区域" width="150" show-overflow-tooltip />
        <el-table-column label="分数" width="110">
          <template #default="{ row }">{{ formatScore(row.score) }}</template>
        </el-table-column>
        <el-table-column label="过期时间" width="180">
          <template #default="{ row }">{{ formatTime(row.expireAt) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshRight } from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const rebuilding = ref(false)
const rebuildTarget = ref('post')
const dashboard = ref<any>({
  summary: {},
  byType: [],
  targetCounts: [],
  recentPool: [],
  health: {},
})

const targetOptions = [
  { label: '笔记/帖子', value: 'post' },
  { label: '商家', value: 'merchant' },
  { label: '商品', value: 'product' },
  { label: '话题', value: 'topic' },
  { label: '活动', value: 'activity' },
  { label: '二手', value: 'secondhand' },
]

const summaryCards = computed(() => {
  const s = dashboard.value.summary || {}
  return [
    { key: 'strategies', label: '启用策略', value: `${s.strategiesEnabled || 0}/${s.strategiesTotal || 0}`, hint: '影响推荐算法权重' },
    { key: 'pool', label: '推荐池', value: s.activePoolTotal || 0, hint: `总 ${s.poolTotal || 0}，过期 ${s.expiredPoolTotal || 0}` },
    { key: 'controls', label: '人工干预', value: s.manualControls || 0, hint: '置顶、加权、降权、屏蔽' },
    { key: 'tests', label: '运行实验', value: `${s.runningTests || 0}/${s.allTests || 0}`, hint: 'A/B 测试状态' },
    { key: 'slots', label: '推荐位', value: s.slotsTotal || 0, hint: '首页/详情页推荐位' },
  ]
})
const byType = computed(() => dashboard.value.byType || [])
const targetCounts = computed(() => dashboard.value.targetCounts || [])
const recentPool = computed(() => dashboard.value.recentPool || [])
const healthItems = computed(() => {
  const h = dashboard.value.health || {}
  return [
    { key: 'strategy', label: '推荐策略', ok: !!h.hasStrategy, okText: '已配置启用策略', warnText: '暂无启用策略' },
    { key: 'pool', label: '推荐池', ok: !!h.hasActivePool, okText: '已有可用内容池', warnText: '暂无可用推荐池' },
    { key: 'slots', label: '推荐位', ok: !!h.hasSlots, okText: '推荐位可用', warnText: '推荐位未配置' },
    { key: 'experiment', label: '实验', ok: !!h.hasRunningExperiment, okText: '有实验运行中', warnText: '当前无运行实验' },
  ]
})

function firstChar(value?: string) {
  return (value || '?').slice(0, 1)
}

function formatScore(value: any) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function formatTime(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

async function loadDashboard(showSuccess = false) {
  loading.value = true
  try {
    dashboard.value = await request.get('/admin/recommend/dashboard')
    if (showSuccess) ElMessage.success('推荐中心已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载推荐中心失败')
  } finally {
    loading.value = false
  }
}

async function rebuildPool() {
  const target = targetOptions.find((item) => item.value === rebuildTarget.value)
  await ElMessageBox.confirm(`确定重建「${target?.label || rebuildTarget.value}」推荐池？`, '重建推荐池', { type: 'warning' })
  rebuilding.value = true
  try {
    const res: any = await request.post('/admin/recommend/rebuild', { targetType: rebuildTarget.value })
    ElMessage.success(`推荐池重建完成，写入 ${res?.count || 0} 条`)
    await loadDashboard()
  } catch (e: any) {
    ElMessage.error(e?.message || '重建推荐池失败')
  } finally {
    rebuilding.value = false
  }
}

onMounted(() => loadDashboard())
</script>

<style scoped lang="scss">
.recommend-dashboard {
  display: grid;
  gap: 18px;
}
.target-select {
  width: 150px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}
.summary-card {
  padding: 18px 20px;
  display: grid;
  gap: 6px;
}
.summary-card span,
.summary-card small,
.panel-head p,
.target-cell small,
.health-item small {
  color: #64748b;
  font-weight: 750;
}
.summary-card strong {
  color: #0f172a;
  font-size: 28px;
  font-weight: 950;
}
.health-strip {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.health-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 14px;
  background: rgba(248, 250, 252, .72);
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #f59e0b;
}
.health-item.ok .dot {
  background: #22c55e;
}
.dashboard-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, .7fr);
  gap: 18px;
}
.panel-card {
  padding: 16px;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.panel-head h3 {
  margin: 0 0 4px;
  color: #0f172a;
  font-size: 18px;
}
.panel-head p {
  margin: 0;
  font-size: 12px;
}
.target-list {
  display: grid;
  gap: 10px;
}
.target-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(248, 250, 252, .8);
  color: #334155;
  font-weight: 850;
}
.target-row strong {
  color: #2563eb;
}
.target-cell {
  display: flex;
  gap: 10px;
  align-items: center;
}
.target-cell strong,
.target-cell small {
  display: block;
}
@media (max-width: 1280px) {
  .summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .dashboard-layout { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .summary-grid,
  .health-strip {
    grid-template-columns: 1fr;
  }
}
</style>
