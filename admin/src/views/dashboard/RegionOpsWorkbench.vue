<template>
  <div class="page-shell">
    <GlassPageHeader title="区域运营工作台" subtitle="决策区域上线、监控运营健康、执行今日任务">
      <template #actions>
        <el-select v-model="selectedRegionId" placeholder="选择区域" style="width: 200px" @change="onRegionChange" clearable>
          <el-option label="全部区域概览" value="" />
          <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <el-button :icon="Refresh" :loading="loading" @click="refreshData(true)">刷新</el-button>
      </template>
    </GlassPageHeader>

    <div v-if="!selectedRegionId" class="region-overview">
      <div class="region-grid">
        <div v-for="r in regions" :key="r.id" class="region-card glass-card" @click="selectRegion(r.id)">
          <div class="region-card-header">
            <div class="region-logo" :class="{ 'has-logo': r.logo }">
              <img v-if="r.logo" :src="r.logo" alt="" />
              <span v-else>{{ r.name?.charAt(0) || '?' }}</span>
            </div>
            <div class="region-info">
              <div class="region-name">{{ r.name }}</div>
              <div class="region-code">{{ r.code || r.id }}</div>
            </div>
            <el-tag :type="statusTagType(r.status)" size="small">{{ statusLabel(r.status) }}</el-tag>
          </div>
          <div class="region-stats">
            <div class="stat-item">
              <span class="stat-value">{{ r.userCount || 0 }}</span>
              <span class="stat-label">用户</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ r.merchantCount || 0 }}</span>
              <span class="stat-label">商家</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ r.postCount || 0 }}</span>
              <span class="stat-label">内容</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ r.todayOrders || 0 }}</span>
              <span class="stat-label">今日订单</span>
            </div>
          </div>
          <div class="region-indicators">
            <el-icon v-if="r.hasTabbar" class="indicator success"><Check /></el-icon>
            <el-icon v-else class="indicator warning"><Warning /></el-icon>
            <span class="indicator-text">导航{{ r.hasTabbar ? '已配' : '未配' }}</span>
            <el-icon v-if="r.hasShareSettings" class="indicator success"><Check /></el-icon>
            <el-icon v-else class="indicator warning"><Warning /></el-icon>
            <span class="indicator-text">分享{{ r.hasShareSettings ? '已配' : '未配' }}</span>
          </div>
        </div>
      </div>
      <div v-if="!regions.length && !loading" class="empty-state glass-card">
        <EmptyState description="暂无区域数据，请先创建区域" />
        <el-button type="primary" @click="$router.push('/region/list')">去创建区域</el-button>
      </div>
    </div>

    <div v-else class="region-detail">
      <div class="detail-grid">
        <div class="checklist-section glass-card">
          <div class="card-header">
            <div class="card-title">启动清单</div>
            <div class="completion-rate">
              <el-progress :percentage="checklistData.completionRate || 0" :stroke-width="8" />
              <span class="rate-text">{{ checklistData.completedCount || 0 }}/{{ checklistData.totalCount || 0 }}</span>
            </div>
          </div>
          <div class="card-body checklist-body">
            <div v-for="item in checklistData.checklist" :key="item.id" class="checklist-item">
              <div class="checklist-status">
                <el-icon v-if="item.status === 'completed'" class="status-icon success"><CircleCheck /></el-icon>
                <el-icon v-else-if="item.status === 'warning'" class="status-icon warning"><Warning /></el-icon>
                <el-icon v-else class="status-icon incomplete"><CircleClose /></el-icon>
              </div>
              <div class="checklist-content">
                <div class="checklist-title">{{ item.title }}</div>
                <div class="checklist-desc">{{ item.description }}</div>
              </div>
              <el-button v-if="item.actionRoute" size="small" text type="primary" @click="$router.push(item.actionRoute)">
                {{ item.actionText || '去配置' }}
              </el-button>
            </div>
          </div>
        </div>

        <div class="health-section">
          <div class="health-score-card glass-card">
            <div class="card-header">
              <div class="card-title">健康评分</div>
              <el-tag :type="healthLevelType(healthData.level)" size="small">{{ healthLevelLabel(healthData.level) }}</el-tag>
            </div>
            <div class="card-body health-body">
              <div class="score-display">
                <div class="score-number" :class="healthData.level">{{ healthData.score || 0 }}</div>
                <div class="score-label">综合评分</div>
              </div>
              <div class="score-summary">{{ healthData.summary || '暂无数据' }}</div>
              <div class="dimensions">
                <div v-for="d in healthData.dimensions" :key="d.key" class="dimension-item">
                  <div class="dimension-header">
                    <span class="dimension-name">{{ d.name }}</span>
                    <span class="dimension-score">{{ d.score }}</span>
                  </div>
                  <el-progress :percentage="d.score" :stroke-width="6" :show-text="false" :color="dimensionColor(d.score)" />
                  <div class="dimension-trend">
                    <el-icon v-if="d.trend === 'up'" class="trend up"><Top /></el-icon>
                    <el-icon v-else-if="d.trend === 'down'" class="trend down"><Bottom /></el-icon>
                    <el-icon v-else class="trend stable"><Right /></el-icon>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="tasks-card glass-card">
            <div class="card-header">
              <div class="card-title">运营任务</div>
              <el-button size="small" type="primary" :loading="generatingTasks" @click="handleGenerateTasks">生成任务</el-button>
            </div>
            <div class="card-body tasks-body">
              <div v-if="tasks.length" class="task-list">
                <div v-for="task in tasks" :key="task.id" class="task-item" :class="{ completed: task.status === 'completed' }">
                  <div class="task-priority" :class="task.priority">{{ priorityLabel(task.priority) }}</div>
                  <div class="task-content">
                    <div class="task-title">{{ task.title }}</div>
                    <div class="task-desc">{{ task.description }}</div>
                  </div>
                  <div class="task-actions">
                    <el-button v-if="task.status !== 'completed'" size="small" type="success" text @click="handleCompleteTask(task.id)">
                      完成
                    </el-button>
                    <el-button v-if="task.actionRoute" size="small" type="primary" text @click="$router.push(task.actionRoute)">
                      {{ task.actionText || '查看' }}
                    </el-button>
                  </div>
                </div>
              </div>
              <EmptyState v-else description="暂无运营任务，点击上方按钮生成" :image-size="60" />
            </div>
          </div>
        </div>
      </div>

      <div class="quick-actions glass-card">
        <div class="card-header">
          <div class="card-title">快捷动作</div>
        </div>
        <div class="card-body">
          <div class="actions-grid">
            <el-button v-for="action in quickActions" :key="action.route" @click="$router.push(action.route)">
              <el-icon><component :is="action.icon" /></el-icon>
              {{ action.label }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Refresh, Check, Warning, CircleCheck, CircleClose,
  Top, Bottom, Right, Location, Share, Menu, Cpu, Shop, Document, User, Van
} from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import {
  fetchRegionOpsOverview,
  fetchRegionLaunchChecklist,
  fetchRegionHealthScore,
  fetchRegionOpsTasks,
  completeRegionOpsTask,
  generateRegionOpsTasks
} from '@/api/admin'

const loading = ref(false)
const selectedRegionId = ref('')
const regions = ref<any[]>([])

const checklistData = ref<any>({
  checklist: [],
  completionRate: 0,
  completedCount: 0,
  totalCount: 0
})

const healthData = ref<any>({
  score: 0,
  level: 'critical',
  summary: '暂无数据',
  dimensions: []
})

const tasks = ref<any[]>([])
const generatingTasks = ref(false)

const quickActions = [
  { label: '区域配置中心', route: '/region/config', icon: Location },
  { label: '底部导航管理', route: '/region/tabbar', icon: Menu },
  { label: '分享设置', route: '/region/share-settings', icon: Share },
  { label: 'AI运营配置', route: '/ai/ops-config', icon: Cpu },
  { label: '商家管理', route: '/merchant/list', icon: Shop },
  { label: '内容审核', route: '/content/audit', icon: Document },
  { label: '用户管理', route: '/user/list', icon: User },
  { label: '跑腿管理', route: '/errand/dashboard', icon: Van }
]

function statusTagType(status: string) {
  const map: Record<string, string> = {
    running: 'success',
    pending: 'warning',
    warning: 'warning',
    stopped: 'danger',
    unconfigured: 'info'
  }
  return map[status] || 'info'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    running: '运营中',
    pending: '待启动',
    warning: '预警',
    stopped: '停用',
    unconfigured: '未配置'
  }
  return map[status] || '未知'
}

function healthLevelType(level: string) {
  const map: Record<string, string> = {
    excellent: 'success',
    healthy: 'success',
    warning: 'warning',
    critical: 'danger'
  }
  return map[level] || 'info'
}

function healthLevelLabel(level: string) {
  const map: Record<string, string> = {
    excellent: '优秀',
    healthy: '健康',
    warning: '预警',
    critical: '异常'
  }
  return map[level] || '未知'
}

function dimensionColor(score: number) {
  if (score >= 80) return '#67c23a'
  if (score >= 60) return '#e6a23c'
  return '#f56c6c'
}

function priorityLabel(priority: string) {
  const map: Record<string, string> = { high: '高', medium: '中', low: '低' }
  return map[priority] || '中'
}

function selectRegion(id: string) {
  selectedRegionId.value = id
  onRegionChange()
}

async function onRegionChange() {
  if (!selectedRegionId.value) return
  await loadRegionDetail(selectedRegionId.value)
}

async function loadRegionDetail(regionId: string) {
  try {
    const [checklist, health, tasksData] = await Promise.all([
      fetchRegionLaunchChecklist(regionId),
      fetchRegionHealthScore(regionId),
      fetchRegionOpsTasks(regionId)
    ])
    checklistData.value = checklist || {}
    healthData.value = health || {}
    tasks.value = (tasksData as any)?.tasks || []
  } catch {
    ElMessage.error('加载区域详情失败')
  }
}

async function refreshData(showSuccess = false) {
  loading.value = true
  try {
    if (selectedRegionId.value) {
      await loadRegionDetail(selectedRegionId.value)
    } else {
      const data: any = await fetchRegionOpsOverview()
      regions.value = data?.regions || []
    }
    if (showSuccess) ElMessage.success('区域运营数据已刷新')
  } catch {
    ElMessage.error('刷新数据失败')
  } finally {
    loading.value = false
  }
}

async function handleCompleteTask(taskId: string) {
  try {
    await completeRegionOpsTask(selectedRegionId.value, taskId)
    ElMessage.success('任务已完成')
    const tasksData: any = await fetchRegionOpsTasks(selectedRegionId.value)
    tasks.value = tasksData?.tasks || []
  } catch {
    ElMessage.error('操作失败')
  }
}

async function handleGenerateTasks() {
  generatingTasks.value = true
  try {
    const data: any = await generateRegionOpsTasks(selectedRegionId.value)
    tasks.value = data?.tasks || []
    ElMessage.success(`已生成 ${tasks.value.length} 个任务`)
  } catch {
    ElMessage.error('生成任务失败')
  } finally {
    generatingTasks.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const data: any = await fetchRegionOpsOverview()
    regions.value = data?.regions || []
  } catch {
    ElMessage.error('加载区域概览失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped lang="scss">
.region-overview {
  margin-top: 16px;
}

.region-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.region-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  padding: 16px;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--mx-shadow);
  }
}

.region-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.region-logo {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--mx-purple);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mx-card);
  font-size: 20px;
  font-weight: bold;
  overflow: hidden;

  &.has-logo {
    background: var(--mx-soft);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.region-info {
  flex: 1;
}

.region-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--mx-text);
}

.region-code {
  font-size: 12px;
  color: var(--mx-muted);
  margin-top: 2px;
}

.region-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: var(--mx-text);
}

.stat-label {
  display: block;
  font-size: 12px;
  color: var(--mx-muted);
  margin-top: 2px;
}

.region-indicators {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--mx-border);
}

.indicator {
  font-size: 14px;

  &.success {
    color: var(--el-color-success);
  }

  &.warning {
    color: var(--el-color-warning);
  }
}

.indicator-text {
  font-size: 12px;
  color: var(--mx-muted);
  margin-right: 12px;
}

.empty-state {
  padding: 40px;
  text-align: center;

  .el-button {
    margin-top: 16px;
  }
}

.region-detail {
  margin-top: 16px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.checklist-section {
  grid-row: span 2;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--mx-border);
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--mx-text);
}

.completion-rate {
  display: flex;
  align-items: center;
  gap: 8px;

  .el-progress {
    width: 100px;
  }
}

.rate-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--mx-sub);
}

.card-body {
  padding: 16px 20px;
}

.checklist-body {
  max-height: 500px;
  overflow-y: auto;
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--mx-border);

  &:last-child {
    border-bottom: none;
  }
}

.checklist-status {
  flex-shrink: 0;
}

.status-icon {
  font-size: 20px;

  &.success {
    color: var(--el-color-success);
  }

  &.warning {
    color: var(--el-color-warning);
  }

  &.incomplete {
    color: var(--mx-border-strong);
  }
}

.checklist-content {
  flex: 1;
}

.checklist-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--mx-text);
}

.checklist-desc {
  font-size: 12px;
  color: var(--mx-muted);
  margin-top: 2px;
}

.health-score-card {
  height: 100%;
}

.health-body {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.score-display {
  text-align: center;
  margin-bottom: 16px;
}

.score-number {
  font-size: 48px;
  font-weight: 700;
  line-height: 1;

  &.excellent, &.healthy {
    color: var(--el-color-success);
  }

  &.warning {
    color: var(--el-color-warning);
  }

  &.critical {
    color: var(--el-color-danger);
  }
}

.score-label {
  font-size: 14px;
  color: var(--mx-muted);
  margin-top: 4px;
}

.score-summary {
  font-size: 14px;
  color: var(--mx-sub);
  text-align: center;
  margin-bottom: 20px;
}

.dimensions {
  width: 100%;
}

.dimension-item {
  margin-bottom: 12px;
}

.dimension-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.dimension-name {
  font-size: 13px;
  color: var(--mx-sub);
}

.dimension-score {
  font-size: 13px;
  font-weight: 600;
  color: var(--mx-text);
}

.dimension-trend {
  text-align: right;
  margin-top: 2px;
}

.trend {
  font-size: 12px;

  &.up {
    color: var(--el-color-success);
  }

  &.down {
    color: var(--el-color-danger);
  }

  &.stable {
    color: var(--mx-muted);
  }
}

.tasks-card {
  height: 100%;
}

.tasks-body {
  max-height: 350px;
  overflow-y: auto;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--mx-soft);
  border-radius: 6px;

  &.completed {
    opacity: 0.6;
  }
}

.task-priority {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;

  &.high {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
  }

  &.medium {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
  }

  &.low {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
  }
}

.task-content {
  flex: 1;
}

.task-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--mx-text);
}

.task-desc {
  font-size: 12px;
  color: var(--mx-muted);
  margin-top: 4px;
}

.task-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.quick-actions {
  margin-bottom: 16px;
}

.actions-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.actions-grid .el-button {
  margin: 0;
}

@media (max-width: 1200px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
