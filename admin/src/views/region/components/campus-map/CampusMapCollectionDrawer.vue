<template>
  <el-drawer
    :model-value="modelValue"
    title="校园地图现场采集"
    size="min(1080px, 92vw)"
    append-to-body
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="collection-drawer" v-loading="loading">
      <el-alert
        type="warning"
        :closable="false"
        title="原始数据不会自动发布到校园地图"
        description="现场轨迹和标记只进入审核区；清洗、路网审核和地图发布仍是后续独立步骤。"
        show-icon
      />

      <el-tabs v-model="activeTab" class="collection-tabs">
        <el-tab-pane label="采集任务" name="tasks">
          <div class="toolbar">
            <div>
              <strong>{{ regionName || '当前学校' }}</strong>
              <span> · {{ taskTotal }} 个采集任务</span>
            </div>
            <div>
              <el-button @click="loadTasks">刷新</el-button>
              <el-button type="primary" @click="openTaskForm()">新建任务</el-button>
            </div>
          </div>

          <div class="task-layout">
            <div class="task-list">
              <button
                v-for="task in tasks"
                :key="task.id"
                type="button"
                class="task-card"
                :class="{ active: selectedTask?.id === task.id }"
                @click="selectTask(task.id)"
              >
                <span class="task-card-head">
                  <strong>{{ task.name }}</strong>
                  <el-tag size="small" :type="taskStatusType(task.status)">{{ taskStatusLabel(task.status) }}</el-tag>
                </span>
                <span>{{ task.assignments?.length || 0 }} 人 · {{ taskSessionCount(task) }} 次会话</span>
                <small>{{ formatDate(task.updatedAt) }}</small>
              </button>
              <el-empty v-if="!tasks.length" description="还没有现场采集任务" />
            </div>

            <section class="task-detail">
              <template v-if="selectedTask">
                <div class="detail-head">
                  <div>
                    <h3>{{ selectedTask.name }}</h3>
                    <p>{{ selectedTask.instructions || '未填写现场采集说明' }}</p>
                  </div>
                  <div>
                    <el-button @click="openTaskForm(selectedTask)">编辑</el-button>
                    <el-button type="primary" @click="viewTaskStatus">查看骑手任务状态</el-button>
                  </div>
                </div>
                <div class="metric-grid">
                  <div><span>任务状态</span><strong>{{ taskStatusLabel(selectedTask.status) }}</strong></div>
                  <div><span>采集人员</span><strong>{{ selectedTask.assignments?.length || 0 }}</strong></div>
                  <div><span>原始会话</span><strong>{{ selectedTask.sessions?.length || 0 }}</strong></div>
                  <div><span>更新时间</span><strong>{{ formatDate(selectedTask.updatedAt) }}</strong></div>
                </div>
                <h4>已分配官方骑手</h4>
                <div class="chip-row">
                  <el-tag v-for="assignment in selectedTask.assignments" :key="assignment.id">
                    {{ collectorLabel(assignment.userId) }}
                  </el-tag>
                  <span v-if="!selectedTask.assignments?.length" class="muted">尚未分配采集人员</span>
                </div>
                <h4>最近原始会话</h4>
                <el-table :data="selectedTask.sessions || []" size="small" @row-click="openSession">
                  <el-table-column prop="clientSessionId" label="会话" min-width="180" show-overflow-tooltip />
                  <el-table-column prop="status" label="状态" width="100" />
                  <el-table-column prop="pointCount" label="点数" width="80" />
                  <el-table-column prop="markerCount" label="标记" width="80" />
                  <el-table-column label="上传" width="90">
                    <template #default="scope">{{ scope.row.uploadComplete ? '完整' : '待补传' }}</template>
                  </el-table-column>
                </el-table>
              </template>
              <el-empty v-else description="选择左侧任务查看详情" />
            </section>
          </div>
        </el-tab-pane>

        <el-tab-pane label="原始会话" name="sessions">
          <el-empty v-if="!selectedTask" description="请先在采集任务中选择一个任务" />
          <div v-else class="session-layout">
            <div class="session-list">
              <button
                v-for="session in selectedTask.sessions || []"
                :key="session.id"
                type="button"
                class="session-card"
                :class="{ active: selectedSession?.id === session.id }"
                @click="openSession(session)"
              >
                <strong>{{ formatDate(session.startedAt) }}</strong>
                <span>{{ session.pointCount }} 点 · {{ session.markerCount }} 标记</span>
                <small>{{ session.uploadComplete ? '上传完整' : '存在待补传数据' }}</small>
              </button>
            </div>
            <section class="session-detail">
              <template v-if="selectedSession">
                <div class="metric-grid session-metrics">
                  <div><span>设备</span><strong>{{ selectedSession.device?.model || '未知设备' }}</strong></div>
                  <div><span>时长</span><strong>{{ formatSessionDuration(selectedSession) }}</strong></div>
                  <div><span>轨迹点</span><strong>{{ selectedSession.points?.length || selectedSession.pointCount }}</strong></div>
                  <div><span>上传完整性</span><strong>{{ selectedSession.uploadComplete ? '完整' : '待补传' }}</strong></div>
                </div>
                <div class="accuracy-row">
                  <span>精度分布</span>
                  <el-tag type="success">良好 {{ accuracyCounts.good }}</el-tag>
                  <el-tag type="warning">需复核 {{ accuracyCounts.review }}</el-tag>
                  <el-tag type="danger">较差 {{ accuracyCounts.poor }}</el-tag>
                </div>
                <div class="raw-map-preview">
                  <svg viewBox="0 0 640 320" preserveAspectRatio="none" aria-label="原始轨迹预览">
                    <polyline v-if="rawSvgPoints" :points="rawSvgPoints" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <span v-if="!rawSvgPoints">当前会话没有可预览的轨迹点</span>
                </div>
                <h4>现场标记</h4>
                <el-table :data="selectedSession.markers || []" size="small">
                  <el-table-column prop="templateLabelSnapshot" label="标记" min-width="150" />
                  <el-table-column prop="behaviorSnapshot" label="系统行为" width="150" />
                  <el-table-column prop="accuracy" label="精度(m)" width="100" />
                  <el-table-column label="绑定" width="90">
                    <template #default="scope">{{ scope.row.bindings?.length || 0 }}</template>
                  </el-table-column>
                  <el-table-column prop="note" label="备注" min-width="180" show-overflow-tooltip />
                </el-table>
              </template>
              <el-empty v-else description="选择一次会话查看原始轨迹" />
            </section>
          </div>
        </el-tab-pane>

        <el-tab-pane label="标注模板" name="templates">
          <div class="toolbar">
            <div><strong>小程序现场快捷标注</strong><span> · 名称可自定义，系统行为保持受控</span></div>
            <el-button type="primary" @click="openTemplateForm()">新增模板</el-button>
          </div>
          <div class="template-grid">
            <button v-for="template in templates" :key="template.id" type="button" class="template-card" @click="openTemplateForm(template)">
              <i :style="{ background: template.color || '#64748b' }"></i>
              <span><strong>{{ template.label }}</strong><small>{{ behaviorLabel(template.behavior) }}</small></span>
              <el-tag size="small" :type="template.enabled ? 'success' : 'info'">{{ template.enabled ? '启用' : '停用' }}</el-tag>
            </button>
          </div>
        </el-tab-pane>

        <el-tab-pane label="对象审核" name="review">
          <div class="toolbar review-toolbar">
            <div class="review-filters">
              <el-select v-model="reviewFilters.reviewStatus" placeholder="审核状态" clearable style="width: 130px" @change="loadObjects">
                <el-option v-for="item in reviewStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-select v-model="reviewFilters.taskId" placeholder="按任务筛选" clearable filterable style="width: 210px" @change="loadObjects">
                <el-option v-for="task in tasks" :key="task.id" :label="task.name" :value="task.id" />
              </el-select>
              <el-select v-model="reviewFilters.objectType" placeholder="采集类型" clearable style="width: 130px" @change="loadObjects">
                <el-option v-for="item in objectTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-button @click="loadObjects">刷新</el-button>
            </div>
            <span class="muted">{{ objectTotal }} 个对象 · 审核决定会回传骑手端，不会直接覆盖正式校园地图</span>
          </div>

          <div class="review-layout">
            <div class="session-list">
              <button
                v-for="item in objects"
                :key="item.id"
                type="button"
                class="session-card object-card"
                :class="{ active: selectedObject?.id === item.id }"
                @click="selectObject(item)"
              >
                <span class="object-card-head">
                  <strong>{{ objectTypeLabel(item.objectType) }} · {{ objectDisplayName(item) }}</strong>
                  <el-tag size="small" :type="reviewStatusType(item.reviewStatus)">{{ reviewStatusLabel(item.reviewStatus) }}</el-tag>
                </span>
                <span>{{ item.session?.task?.name || '未知任务' }} · {{ formatDate(item.recordedAt) }}</span>
                <small>{{ accuracyText(item.accuracy) }} · {{ geometrySummary(item.geometry) }}</small>
              </button>
              <el-empty v-if="!objects.length" description="没有符合条件的采集对象" />
            </div>

            <section class="session-detail">
              <template v-if="selectedObject">
                <div class="metric-grid session-metrics">
                  <div><span>采集类型</span><strong>{{ objectTypeLabel(selectedObject.objectType) }}</strong></div>
                  <div><span>几何</span><strong>{{ geometrySummary(selectedObject.geometry) }}</strong></div>
                  <div><span>定位精度</span><strong>{{ accuracyText(selectedObject.accuracy) }}</strong></div>
                  <div><span>采集时间</span><strong>{{ formatDate(selectedObject.recordedAt) }}</strong></div>
                </div>

                <h4>现场信息</h4>
                <div class="object-props">
                  <div v-for="row in objectPropertiesList(selectedObject.properties)" :key="row.label">
                    <span>{{ row.label }}</span><strong>{{ row.value }}</strong>
                  </div>
                  <div v-if="!objectPropertiesList(selectedObject.properties).length" class="muted">没有填写附加信息</div>
                </div>

                <h4>现场照片</h4>
                <div v-if="photoAttachments.length" class="photo-strip">
                  <el-image
                    v-for="(photo, index) in photoAttachments"
                    :key="photo.url || index"
                    :src="photo.url"
                    :preview-src-list="photoAttachments.map((item) => item.url)"
                    :initial-index="index"
                    fit="cover"
                    class="photo-thumb"
                  />
                </div>
                <div v-else class="muted">没有附件照片</div>

                <template v-if="selectedObject.reviewStatus !== 'pending'">
                  <h4>审核结果</h4>
                  <div class="review-result">
                    <el-tag :type="reviewStatusType(selectedObject.reviewStatus)">{{ reviewStatusLabel(selectedObject.reviewStatus) }}</el-tag>
                    <p>{{ selectedObject.reviewNote || '未填写审核原因' }}</p>
                    <small>审核人 {{ selectedObject.reviewedBy || '--' }} · {{ formatDate(selectedObject.reviewedAt) }}</small>
                  </div>
                </template>

                <div class="review-actions">
                  <span>审核决定：</span>
                  <el-button type="success" @click="openReview('approved')">通过</el-button>
                  <el-button type="warning" @click="openReview('resample')">要求重采</el-button>
                  <el-button type="info" @click="openReview('held')">暂缓</el-button>
                  <el-button type="danger" @click="openReview('void')">作废</el-button>
                </div>
              </template>
              <el-empty v-else description="选择左侧对象查看详情" />
            </section>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="taskDialogVisible" :title="taskForm.id ? '编辑采集任务' : '新建采集任务'" width="560px" append-to-body>
      <el-form label-position="top">
        <el-form-item label="任务名称"><el-input v-model="taskForm.name" maxlength="100" /></el-form-item>
        <el-form-item label="现场说明"><el-input v-model="taskForm.instructions" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="任务状态">
          <el-select v-model="taskForm.status" style="width: 100%">
            <el-option v-for="item in taskStatuses" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="采集端">
          <el-input model-value="官方骑手 App" disabled />
        </el-form-item>
        <el-form-item label="采集对象">
          <el-checkbox-group v-model="taskForm.objectTypes">
            <el-checkbox v-for="item in objectTypeOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="优先级">
            <el-select v-model="taskForm.priority" style="width: 100%">
              <el-option v-for="value in 5" :key="value" :label="`P${value}`" :value="value" />
            </el-select>
          </el-form-item>
          <el-form-item label="完成期限">
            <el-date-picker v-model="taskForm.dueAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.SSSZ" placeholder="可选" style="width: 100%" />
          </el-form-item>
        </div>
        <el-form-item label="官方骑手">
          <el-select
            v-model="taskForm.collectorUserIds"
            multiple
            filterable
            remote
            reserve-keyword
            :remote-method="searchCollectors"
            :loading="collectorLoading"
            placeholder="按姓名、手机号搜索本区域官方骑手"
            style="width: 100%"
          >
            <el-option v-for="item in collectorOptions" :key="item.value" :value="item.value" :label="`${item.label} · UID ${item.uid || '--'}`">
              <div class="collector-option">
                <el-avatar :size="28" :src="item.avatar">{{ item.label.slice(0, 1) }}</el-avatar>
                <span><strong>{{ item.label }}</strong><small>{{ item.phone || '无手机号' }} · UID {{ item.uid || '--' }}</small></span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="taskDialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTask">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="templateDialogVisible" :title="templateForm.id ? '编辑标注模板' : '新增标注模板'" width="640px" append-to-body>
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="模板名称"><el-input v-model="templateForm.label" /></el-form-item>
          <el-form-item label="系统行为">
            <el-select v-model="templateForm.behavior" style="width: 100%">
              <el-option v-for="item in behaviors" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="图标"><el-input v-model="templateForm.icon" placeholder="gate / warning" /></el-form-item>
          <el-form-item label="颜色"><el-color-picker v-model="templateForm.color" /></el-form-item>
        </div>
        <el-form-item label="说明"><el-input v-model="templateForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="自定义字段 JSON">
          <el-input v-model="templateForm.fieldSchemaText" type="textarea" :rows="4" placeholder='[{"key":"door","type":"text","label":"门名称"}]' />
        </el-form-item>
        <el-form-item label="允许绑定对象">
          <el-select v-model="templateForm.targetTypes" multiple style="width: 100%">
            <el-option v-for="item in targetTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="允许绑定关系">
          <el-select v-model="templateForm.relationTypes" multiple style="width: 100%">
            <el-option v-for="item in relationOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <div class="switch-row">
          <el-checkbox v-model="templateForm.pinned">快捷区置顶</el-checkbox>
          <el-checkbox v-model="templateForm.requirePhoto">要求照片</el-checkbox>
          <el-checkbox v-model="templateForm.requireNote">要求备注</el-checkbox>
          <el-checkbox v-model="templateForm.requireStationarySample">要求站定采样</el-checkbox>
          <el-checkbox v-model="templateForm.enabled">启用</el-checkbox>
        </div>
      </el-form>
      <template #footer><el-button @click="templateDialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTemplate">保存</el-button></template>
    </el-dialog>

    <el-dialog
      v-model="reviewDialogVisible"
      :title="reviewDialogTitle"
      width="540px"
      append-to-body
    >
      <div class="review-pick">
        <el-radio-group v-model="reviewForm.decision">
          <el-radio-button v-for="item in reviewDecisionOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </div>
      <el-form label-position="top" class="review-form">
        <el-form-item label="审核原因（必填）">
          <el-input
            v-model="reviewForm.note"
            type="textarea"
            :rows="3"
            maxlength="1000"
            show-word-limit
            placeholder="说明通过、重采、暂缓或作废的理由，会回传给骑手端"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitReview">确认提交</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createCampusMapCollectionTask,
  createCampusMapMarkerTemplate,
  fetchCampusMapCollectionObjects,
  fetchCampusMapCollectionRiders,
  fetchCampusMapCollectionSession,
  fetchCampusMapCollectionTask,
  fetchCampusMapCollectionTasks,
  fetchCampusMapMarkerTemplates,
  reviewCampusMapCollectionObject,
  updateCampusMapCollectionTask,
  updateCampusMapMarkerTemplate,
} from '@/api/admin'
import {
  accuracyBand,
  buildProfessionalTaskPayload,
  formatSessionDuration,
  geometrySummary,
  objectPropertiesList,
  objectTypeLabel,
  reviewStatusLabel,
  reviewStatusType,
  REVIEW_STATUSES,
  taskSessionCount,
  toCollectorOption,
  toRawPolyline,
  toSvgPolyline,
} from './campusMapCollectionModel.mjs'

const props = defineProps<{ modelValue: boolean; regionId: string | number; regionName?: string }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()

const loading = ref(false)
const saving = ref(false)
const activeTab = ref('tasks')
const tasks = ref<any[]>([])
const taskTotal = ref(0)
const templates = ref<any[]>([])
const selectedTask = ref<any>(null)
const selectedSession = ref<any>(null)
const taskDialogVisible = ref(false)
const templateDialogVisible = ref(false)
const objects = ref<any[]>([])
const objectTotal = ref(0)
const selectedObject = ref<any>(null)
const reviewDialogVisible = ref(false)
const reviewFilters = reactive({ reviewStatus: 'pending', taskId: '', objectType: '' })
const reviewForm = reactive({ decision: 'approved', note: '' })
const collectorLoading = ref(false)
const collectorOptions = ref<any[]>([])

const taskForm = reactive({
  id: '', name: '', instructions: '', status: 'draft',
  collectorUserIds: [] as string[], objectTypes: ['road'] as string[],
  priority: 3, dueAt: '' as string | null,
  boundary: null as Record<string, unknown> | null,
})
const templateForm = reactive({
  id: '', label: '', description: '', icon: 'pin', color: '#2563eb', behavior: 'info',
  fieldSchemaText: '[]', targetTypes: [] as string[], relationTypes: [] as string[], pinned: false,
  requirePhoto: false, requireNote: false, requireStationarySample: false, enabled: true,
})

const taskStatuses = [
  { value: 'draft', label: '草稿' }, { value: 'ready', label: '待采集' },
  { value: 'collecting', label: '采集中' }, { value: 'review', label: '待审核' },
  { value: 'completed', label: '已完成' }, { value: 'cancelled', label: '已取消' },
]
const objectTypeOptions = [
  { value: 'road', label: '道路' }, { value: 'building', label: '建筑' },
  { value: 'entrance', label: '入口' }, { value: 'facility', label: '设施' },
  { value: 'issue', label: '异常' },
]
const behaviors = [
  { value: 'info', label: '普通信息' }, { value: 'entrance', label: '入口候选' },
  { value: 'junction', label: '路口候选' }, { value: 'passability_change', label: '通行变化' },
  { value: 'barrier', label: '障碍/封闭' }, { value: 'calibration_point', label: '校准控制点' },
]
const targetTypeOptions = [
  ['building', '建筑'], ['entrance', '入口'], ['road', '道路'], ['road_node', '道路节点'],
  ['road_edge', '道路边'], ['gate', '校门'], ['area', '区域'], ['phase', '建设阶段'],
  ['task', '采集任务'], ['marker', '其他标记'],
].map(([value, label]) => ({ value, label }))
const relationOptions = [
  ['belongs_to', '属于'], ['entrance_of', '入口'], ['connects', '连接'], ['affects', '影响'],
  ['blocks', '封闭'], ['alternative_to', '替代路线'], ['references', '参考位置'],
].map(([value, label]) => ({ value, label }))

const rawSvgPoints = computed(() => toSvgPolyline(toRawPolyline(selectedSession.value?.points || []), 640, 320))
const accuracyCounts = computed(() => (selectedSession.value?.points || []).reduce((result: any, point: any) => {
  result[accuracyBand(point.accuracy).key] += 1
  return result
}, { good: 0, review: 0, poor: 0 }))
const reviewStatusOptions = computed(() => REVIEW_STATUSES)
const reviewDecisionOptions = computed(() => REVIEW_STATUSES.filter((item) => item.value !== 'pending'))
const photoAttachments = computed(() => (selectedObject.value?.attachments || []).filter((item: any) => item.kind !== 'audio'))
const reviewDialogTitle = computed(() => {
  if (!selectedObject.value) return '审核采集对象'
  return `审核：${objectTypeLabel(selectedObject.value.objectType)} · ${objectDisplayName(selectedObject.value)}`
})

watch(() => props.modelValue, (visible) => {
  if (visible) loadAll()
})

async function loadAll() {
  if (!props.regionId) return
  loading.value = true
  try {
    await Promise.all([loadTasks(), loadTemplates(), loadObjects(), searchCollectors()])
  } finally {
    loading.value = false
  }
}

async function loadTasks() {
  const data: any = await fetchCampusMapCollectionTasks(props.regionId, { page: 1, pageSize: 100 })
  tasks.value = data.items || []
  taskTotal.value = Number(data.total || tasks.value.length)
  if (selectedTask.value?.id) await selectTask(selectedTask.value.id)
}

async function loadTemplates() {
  const data: any = await fetchCampusMapMarkerTemplates(props.regionId)
  templates.value = Array.isArray(data) ? data : []
}

async function selectTask(taskId: string) {
  selectedTask.value = await fetchCampusMapCollectionTask(props.regionId, taskId)
  selectedSession.value = null
}

async function openSession(session: any) {
  if (!selectedTask.value) return
  activeTab.value = 'sessions'
  selectedSession.value = await fetchCampusMapCollectionSession(props.regionId, selectedTask.value.id, session.id)
}

function objectDisplayName(item: any) {
  return String(item?.properties?.name || item?.properties?.subtype || '未命名')
}

function accuracyText(accuracy: any) {
  const value = Number(accuracy)
  return Number.isFinite(value) ? `${value.toFixed(1)}m` : '--'
}

async function loadObjects() {
  if (!props.regionId) return
  const data: any = await fetchCampusMapCollectionObjects(props.regionId, {
    reviewStatus: reviewFilters.reviewStatus || undefined,
    taskId: reviewFilters.taskId || undefined,
    objectType: reviewFilters.objectType || undefined,
    page: 1,
    pageSize: 100,
  })
  objects.value = data?.items || []
  objectTotal.value = Number(data?.total || objects.value.length)
}

function selectObject(item: any) {
  selectedObject.value = item
}

function openReview(decision: string) {
  reviewForm.decision = decision
  reviewForm.note = ''
  reviewDialogVisible.value = true
}

async function submitReview() {
  if (!selectedObject.value) return
  if (!reviewForm.note.trim()) return ElMessage.warning('请填写审核原因')
  saving.value = true
  try {
    await reviewCampusMapCollectionObject(props.regionId, selectedObject.value.id, {
      decision: reviewForm.decision,
      note: reviewForm.note.trim(),
    })
    reviewDialogVisible.value = false
    const selectedId = selectedObject.value.id
    await loadObjects()
    selectedObject.value = objects.value.find((item) => item.id === selectedId) || null
    ElMessage.success('审核结果已提交')
  } catch (error: any) {
    if (error?.message) ElMessage.error(error.message)
  } finally {
    saving.value = false
  }
}

function openTaskForm(task?: any) {
  const collectorUserIds = (task?.assignments || []).map((item: any) => String(item.userId))
  const knownOptions = collectorUserIds.map((userId: string) =>
    collectorOptions.value.find((item) => item.value === userId) || {
      value: userId, label: userId, phone: '', uid: '', avatar: '',
    },
  )
  collectorOptions.value = mergeCollectorOptions(knownOptions, collectorOptions.value)
  Object.assign(taskForm, {
    id: task?.id || '', name: task?.name || '', instructions: task?.instructions || '', status: task?.status || 'draft',
    collectorUserIds, objectTypes: [...(task?.objectTypes || ['road'])],
    priority: Number(task?.priority) || 3, dueAt: task?.dueAt || '', boundary: task?.boundary || null,
  })
  taskDialogVisible.value = true
  void searchCollectors('')
}

async function saveTask() {
  const payload = buildProfessionalTaskPayload(taskForm)
  if (!payload.name) return ElMessage.warning('请输入任务名称')
  if (!payload.objectTypes.length) return ElMessage.warning('请至少选择一种采集对象')
  if (payload.status === 'ready' && !payload.collectorUserIds.length) {
    return ElMessage.warning('待采集任务必须分配官方骑手')
  }
  saving.value = true
  try {
    const saved: any = taskForm.id
      ? await updateCampusMapCollectionTask(props.regionId, taskForm.id, payload)
      : await createCampusMapCollectionTask(props.regionId, payload)
    taskDialogVisible.value = false
    await loadTasks()
    await selectTask(saved.id)
    ElMessage.success('采集任务已保存')
  } finally {
    saving.value = false
  }
}

async function searchCollectors(keyword = '') {
  if (!props.regionId) return
  collectorLoading.value = true
  try {
    const data: any = await fetchCampusMapCollectionRiders(props.regionId, keyword)
    const rows = Array.isArray(data) ? data : data?.list || data?.items || []
    const found = rows.map(toCollectorOption).filter((item: any) => item.value)
    const selected = collectorOptions.value.filter((item) => taskForm.collectorUserIds.includes(item.value))
    collectorOptions.value = mergeCollectorOptions(selected, found)
  } catch {
    // The shared request layer already reports real failures and silently cancels rapid duplicate searches.
  } finally {
    collectorLoading.value = false
  }
}

function mergeCollectorOptions(...groups: any[][]) {
  return [...new Map(groups.flat().map((item) => [item.value, item])).values()]
}

function collectorLabel(userId: string) {
  const option = collectorOptions.value.find((item) => item.value === userId)
  if (!option) return userId
  return option.uid ? `${option.label} · UID ${option.uid}` : option.label
}

async function viewTaskStatus() {
  activeTab.value = 'sessions'
  const latestSession = selectedTask.value?.sessions?.[0]
  if (latestSession) await openSession(latestSession)
}

function openTemplateForm(template?: any) {
  Object.assign(templateForm, {
    id: template?.id || '', label: template?.label || '', description: template?.description || '',
    icon: template?.icon || 'pin', color: template?.color || '#2563eb', behavior: template?.behavior || 'info',
    fieldSchemaText: JSON.stringify(template?.fieldSchema || [], null, 2),
    targetTypes: [...(template?.allowedBindings?.targetTypes || [])],
    relationTypes: [...(template?.allowedBindings?.relationTypes || [])], pinned: Boolean(template?.pinned),
    requirePhoto: Boolean(template?.requirePhoto), requireNote: Boolean(template?.requireNote),
    requireStationarySample: Boolean(template?.requireStationarySample), enabled: template?.enabled !== false,
  })
  templateDialogVisible.value = true
}

async function saveTemplate() {
  let fieldSchema: any[]
  try {
    fieldSchema = JSON.parse(templateForm.fieldSchemaText || '[]')
    if (!Array.isArray(fieldSchema)) throw new Error()
  } catch {
    return ElMessage.warning('自定义字段必须是 JSON 数组')
  }
  const payload = {
    label: templateForm.label, description: templateForm.description, icon: templateForm.icon, color: templateForm.color,
    behavior: templateForm.behavior, fieldSchema,
    allowedBindings: { targetTypes: templateForm.targetTypes, relationTypes: templateForm.relationTypes },
    pinned: templateForm.pinned, requirePhoto: templateForm.requirePhoto, requireNote: templateForm.requireNote,
    requireStationarySample: templateForm.requireStationarySample, enabled: templateForm.enabled,
  }
  if (!payload.label.trim()) return ElMessage.warning('请输入模板名称')
  saving.value = true
  try {
    if (templateForm.id) await updateCampusMapMarkerTemplate(props.regionId, templateForm.id, payload)
    else await createCampusMapMarkerTemplate(props.regionId, payload)
    templateDialogVisible.value = false
    await loadTemplates()
    ElMessage.success('标注模板已保存')
  } finally {
    saving.value = false
  }
}

function taskStatusLabel(status: string) { return taskStatuses.find((item) => item.value === status)?.label || status }
function taskStatusType(status: string) { return ({ ready: 'primary', collecting: 'warning', review: 'warning', completed: 'success', cancelled: 'info' } as any)[status] || 'info' }
function behaviorLabel(behavior: string) { return behaviors.find((item) => item.value === behavior)?.label || behavior }
function formatDate(value: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '--' }
</script>

<style scoped>
.collection-drawer { display: grid; gap: 16px; }
.collection-tabs { min-height: 620px; }
.toolbar, .detail-head, .task-card-head, .accuracy-row, .switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toolbar { margin-bottom: 14px; color: #64748b; }
.toolbar strong { color: #0f172a; }
.task-layout, .session-layout, .review-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; }
.task-list, .session-list { display: grid; align-content: start; gap: 10px; max-height: 660px; overflow: auto; }
.task-card, .session-card, .template-card { border: 1px solid #dbe3ee; border-radius: 10px; background: #fff; cursor: pointer; text-align: left; }
.task-card, .session-card { display: grid; gap: 8px; padding: 14px; color: #64748b; }
.task-card.active, .session-card.active { border-color: #2563eb; box-shadow: 0 0 0 2px #dbeafe; }
.task-card strong, .session-card strong, .template-card strong { color: #0f172a; }
.task-card small, .session-card small, .template-card small { color: #94a3b8; }
.task-detail, .session-detail { min-width: 0; border: 1px solid #dbe3ee; border-radius: 12px; padding: 18px; background: #f8fafc; }
.detail-head h3 { margin: 0 0 6px; }
.detail-head p { margin: 0; color: #64748b; }
.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
.metric-grid div { display: grid; gap: 6px; padding: 12px; border-radius: 10px; background: #fff; }
.metric-grid span { color: #64748b; font-size: 12px; }
.chip-row { display: flex; flex-wrap: wrap; gap: 8px; min-height: 32px; }
.muted { color: #94a3b8; }
.accuracy-row { justify-content: flex-start; margin: 14px 0; }
.review-toolbar { flex-wrap: wrap; }
.review-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.object-card { padding: 12px 14px; }
.object-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.object-props { display: grid; gap: 8px; margin-bottom: 16px; }
.object-props > div { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; align-items: baseline; }
.object-props span { color: #64748b; font-size: 12px; }
.object-props strong { font-weight: 600; word-break: break-word; }
.photo-strip { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.photo-thumb { width: 96px; height: 96px; border-radius: 8px; border: 1px solid #dbe3ee; cursor: zoom-in; }
.review-result { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid #dbe3ee; border-radius: 10px; background: #fff; margin-bottom: 16px; }
.review-result p { margin: 0; color: #334155; }
.review-result small { color: #94a3b8; }
.review-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-top: 1px solid #e2e8f0; padding-top: 14px; }
.review-actions > span { color: #64748b; font-size: 13px; }
.review-pick { margin-bottom: 16px; }
.review-pick .el-radio-button { margin-right: 4px; }
.review-form { margin-top: 4px; }
.raw-map-preview { position: relative; height: 320px; border: 1px solid #dbe3ee; border-radius: 12px; background: linear-gradient(135deg, #eef6ff, #f8fafc); overflow: hidden; }
.raw-map-preview svg { width: 100%; height: 100%; }
.raw-map-preview > span { position: absolute; inset: 0; display: grid; place-items: center; color: #94a3b8; }
.template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.template-card { display: grid; grid-template-columns: 12px 1fr auto; align-items: center; gap: 12px; padding: 14px; }
.template-card i { width: 12px; height: 38px; border-radius: 999px; }
.template-card span { display: grid; gap: 4px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
.switch-row { justify-content: flex-start; flex-wrap: wrap; }
.collector-option { display: flex; align-items: center; gap: 10px; }
.collector-option > span { display: grid; line-height: 1.3; }
.collector-option small { color: #94a3b8; }
@media (max-width: 900px) {
  .task-layout, .session-layout, .review-layout { grid-template-columns: 1fr; }
  .metric-grid { grid-template-columns: 1fr 1fr; }
}
</style>
