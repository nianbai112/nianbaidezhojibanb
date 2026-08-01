<template>
  <div class="campus-map-painter">
    <CampusMapActionBar
      :region-name="regionName"
      :editor-mode="editorMode"
      :poi-count="pois.length"
      :area-count="areas.length"
      :route-count="routes.length"
      :publish-summary="publishReadiness.summary"
      :can-publish="publishReadiness.canPublish"
      :active-version="workflow.activeVersion"
      :draft-revision="workflow.draftRevision"
      :has-unsaved-changes="hasUnsavedChanges"
      :assistant-score="mapAssistantScore"
      :assistant-summary="mapAssistantSummary"
      :enabled="form.enabled"
      :loading="loading"
      :saving="saving"
      :draft-saving="draftSaving"
      :disabling="disabling"
      @update:enabled="form.enabled = $event"
      @assistant="openAssistantDrawer"
      @import="openImportDrawer"
      @refresh="loadMap"
      @advanced="openAdvancedDrawer"
      @preview="openPreviewDrawer"
      @quality="openQualityDrawer"
      @versions="versionDrawerVisible = true"
      @save-draft="saveDraft()"
      @disable="disableMap"
      @publish="publishMap"
    />

    <div class="section-card glass-card painter-shell">
      <div class="map-editor-layout">
        <CampusMapToolRail
          :model-value="toolMode"
          :editor-mode="editorMode"
          :has-vector-base-map="hasVectorBaseMap"
          :has-visual-base-map="hasVisualBaseMap"
          :calibration-point-count="calibratedPointCount"
          :feature-count="drawableFeatureCount"
          :can-publish="publishReadiness.canPublish"
          @update:model-value="setToolMode"
          @import-cad="openImportDrawer"
          @switch-amap="handleEditorModeChange('amap')"
          @open-quality="openQualityDrawer"
        />

        <main class="map-workbench">
          <CampusMapWorkbenchHeader
            :editor-mode="editorMode"
            :tool-mode="toolMode"
            :poi-category="poiCategory"
            :semantic-categories="semanticCategories"
            :undo-count="undoStack.length"
            :redo-count="redoStack.length"
            @update:editor-mode="handleEditorModeChange"
            @update:tool-mode="setToolMode"
            @update:poi-category="poiCategory = $event"
            @undo="undoMapEdit"
            @redo="redoMapEdit"
            @finish-area="finishArea"
            @clear-draft-area="clearDraftArea"
            @finish-route="finishRoute"
            @clear-draft-route="clearDraftRoute"
            @add-poi="addPoiFromSidebar"
            @add-calibration="addCalibrationAtRatio(0.5, 0.5)"
          />

          <div v-show="editorMode === 'amap'" class="amap-workbench">
            <div class="amap-search-bar">
              <el-input
                v-model="amapSearchKeyword"
                clearable
                placeholder="搜索学校、楼栋、校门、食堂..."
                @input="onAmapSearchInput"
                @keyup.enter="searchAmapPlaces()"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
              <el-button :icon="Search" :loading="amapLoading" @click="searchAmapPlaces()">搜索</el-button>
              <el-button @click="addAmapPoiAtCenter">中心点位</el-button>
            </div>
            <div v-if="amapSearchResults.length" class="amap-search-results">
              <button
                v-for="item in amapSearchResults"
                :key="item.id"
                type="button"
                class="amap-search-item"
                @click="selectAmapPlace(item)"
              >
                <span>{{ item.name }}</span>
                <small>{{ item.address || item.district }}</small>
              </button>
            </div>
            <div class="amap-stage">
              <div ref="amapMapRef" class="amap-drawing-map"></div>
              <div v-if="amapLoading" class="amap-loading">加载地图中...</div>
              <div v-if="!amapReady && !amapLoading" class="amap-empty-state">
                <el-icon><MapLocation /></el-icon>
                <strong>{{ amapStatus }}</strong>
                <el-button text @click="openAdvancedDrawer">配置地图信息</el-button>
              </div>
            </div>
          </div>

          <CampusMapCadWorkbench
            v-if="editorMode !== 'amap' && hasVisualBaseMap"
            :pois="pois"
            :areas="areas"
            :routes="routes"
            :calibration-points="calibrationPoints"
            :draft-area-points="draftAreaPoints"
            :draft-route-points="draftRoutePoints"
            :selected-id="selectedId"
            :canvas-style="canvasStyle"
            @canvas-click="handleCanvasPointClick"
            @select-layer-item="selectLayerItem"
          />

          <div v-else-if="editorMode !== 'amap'" class="campus-map-start">
            <button type="button" class="start-card primary" @click="openImportDrawer">
              <el-icon><UploadFilled /></el-icon>
              <strong>导入 CAD / DXF</strong>
              <span>解析后进入 CAD 清理工作台</span>
            </button>
            <div class="start-card upload-card">
              <ImageUploadBox
                v-model="form.imageUrl"
                scene="campus-map-base"
                accept="image/*"
                :max-size="8"
                shape="wide"
                placeholder="上传校园底图"
                tip="支持 PNG/JPG，建议使用完整校园俯视图"
              />
            </div>
          </div>

          <div class="map-status-strip">
            <span>{{ editorMode === 'amap' ? amapStatus : hasVectorBaseMap ? 'CAD 矢量底图已就绪' : form.imageUrl ? '图片底图已就绪' : '等待上传底图' }}</span>
            <span v-if="editorMode === 'amap'">中心 {{ amapDefaults.center[0].toFixed(6) }}, {{ amapDefaults.center[1].toFixed(6) }}</span>
            <el-button v-if="editorMode === 'amap'" text @click="fitAmapOverlays">适配范围</el-button>
          </div>

          <div v-if="editorMode === 'image'" class="image-inline-tools">
            <ImageUploadBox
              v-model="form.imageUrl"
              scene="campus-map-base"
              accept="image/*"
              :max-size="8"
              shape="wide"
              placeholder="替换校园底图"
            />
          </div>
        </main>

        <CampusMapInspector
          :selected-editable-item="selectedEditableItem"
          :semantic-categories="semanticCategories"
          :project-catalog="projectCatalog"
          :editor-mode="editorMode"
          :pois="pois"
          :areas="areas"
          :routes="routes"
          :calibration-points="calibrationPoints"
          :format-lng-lat="formatLngLat"
          @clear-selection="selectedId = ''"
          @sync-semantic="syncSelectedSemantic"
          @assign-project="handleAssignProject"
          @remove-poi="removePoi"
          @remove-area="removeArea"
          @remove-route="removeRoute"
          @remove-calibration="removeCalibration"
          @select-layer-item="selectLayerItem"
        />
      </div>
    </div>

    <CampusMapAssistantDrawer
      v-model="assistantDrawerVisible"
      :assistant-health-level="assistantHealthLevel"
      :map-assistant-score="mapAssistantScore"
      :map-assistant-summary="mapAssistantSummary"
      :assistant-next-action="assistantNextAction"
      :map-assistant-steps="mapAssistantSteps"
      :key-place-coverage="keyPlaceCoverage"
      :assistant-warnings="assistantWarnings"
      @run-action="runAssistantAction"
      @focus-key-place="focusKeyPlace"
    />

    <CampusMapImportDrawer
      v-model="importDrawerVisible"
      :active-import-job="activeImportJob"
      :import-jobs="importJobs"
      :importing="importing"
      :converter-status="converterStatus"
      :import-status-label="importStatusLabel"
      @file-change="handleImportFileChange"
      @apply-draft="applyImportDraft"
      @refresh-job="refreshImportJob"
      @retry-job="retryImportJob"
      @delete-job="deleteImportJob"
      @select-job="activeImportJob = $event"
    />

    <CampusMapPreviewDrawer
      v-model="previewDrawerVisible"
      :markers="miniPreviewMarkers"
      :polylines="miniPreviewPolylines"
      :polygons="miniPreviewPolygons"
    />

    <CampusMapQualityDrawer
      v-model="qualityDrawerVisible"
      :publish-readiness="publishReadiness"
      :checks="mapQualityChecks"
    />

    <CampusMapVersionDrawer
      v-model="versionDrawerVisible"
      :region-id="currentRegionId()"
      :active-version="workflow.activeVersion"
      @restored="handleVersionRestored"
    />

    <el-drawer v-model="advancedDrawerVisible" title="高级设置" size="460px" append-to-body>
      <el-form label-position="top" class="advanced-form">
        <el-form-item label="地图名称">
          <el-input v-model="form.title" maxlength="30" />
        </el-form-item>
        <el-form-item label="地图标识">
          <el-input v-model="form.mapId" />
        </el-form-item>
        <el-form-item label="版本号">
          <el-input v-model="form.version" />
        </el-form-item>
        <template v-if="editorMode === 'image'">
          <div class="form-grid two compact">
            <el-form-item label="地图宽度">
              <el-input-number v-model="form.mapWidth" :min="100" :max="20000" />
            </el-form-item>
            <el-form-item label="地图高度">
              <el-input-number v-model="form.mapHeight" :min="100" :max="20000" />
            </el-form-item>
          </div>
        </template>
      </el-form>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Aim,
  Check,
  Delete,
  EditPen,
  Finished,
  Guide,
  Location,
  MagicStick,
  MapLocation,
  Mouse,
  Place,
  Plus,
  Position,
  RefreshRight,
  Search,
  Setting,
  UploadFilled,
  View,
  Warning,
} from '@element-plus/icons-vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import CampusMapActionBar from './campus-map/CampusMapActionBar.vue'
import CampusMapAssistantDrawer from './campus-map/CampusMapAssistantDrawer.vue'
import CampusMapCadWorkbench from './campus-map/CampusMapCadWorkbench.vue'
import CampusMapImportDrawer from './campus-map/CampusMapImportDrawer.vue'
import CampusMapInspector from './campus-map/CampusMapInspector.vue'
import CampusMapPreviewDrawer from './campus-map/CampusMapPreviewDrawer.vue'
import CampusMapQualityDrawer from './campus-map/CampusMapQualityDrawer.vue'
import CampusMapToolRail from './campus-map/CampusMapToolRail.vue'
import CampusMapVersionDrawer from './campus-map/CampusMapVersionDrawer.vue'
import CampusMapWorkbenchHeader from './campus-map/CampusMapWorkbenchHeader.vue'
import {
  amapPlaceSearch,
  deleteRegionCampusMapImport,
  disableRegionCampusMap,
  fetchCampusMapConverterStatus,
  fetchCampusMapProjectCatalog,
  fetchAmapRuntimeConfig,
  fetchRegionCampusMapImport,
  fetchRegionCampusMapImports,
  fetchRegionCampusMap,
  publishRegionCampusMapDraft,
  retryRegionCampusMapImport,
  saveRegionCampusMapDraft,
  uploadRegionCampusMapImport,
} from '@/api/admin'
import {
  applyCampusProject,
  campusProjectCounts,
  normalizeImportedAreaProject,
  normalizeImportedPoiProject,
  pickCampusProjectMetadata,
} from './campus-map/campusProjectModel.mjs'

type EditorMode = 'amap' | 'image'
type ToolMode = 'select' | 'poi' | 'area' | 'route' | 'calibration'
type RatioPoint = {
  xRatio: number
  yRatio: number
  longitude?: number
  latitude?: number
}
type CampusProjectFields = {
  officialNumber?: number
  officialName?: string
  engineeringAlias?: string
  phase?: 'phase1' | 'future'
  constructionStatus?: 'built' | 'under_construction'
  visibilityScope?: 'phase1_active' | 'phase1_review' | 'future_reference'
  searchable?: boolean
  navigable?: boolean
  geometryStatus?: 'verified_polygon' | 'verified_point' | 'point_only' | 'unmatched'
  sourceConfidence?: 'official_signage_and_cad' | 'official_signage_only'
}
type PoiItem = RatioPoint & CampusProjectFields & {
  id: string
  title: string
  category: string
  semanticType?: string
  icon?: string
  color?: string
  sourceLayer?: string
}
type AreaItem = CampusProjectFields & {
  id: string
  title: string
  category: string
  semanticType?: string
  icon?: string
  color?: string
  sourceLayer?: string
  points: RatioPoint[]
}
type RouteItem = AreaItem
type CalibrationPoint = RatioPoint & {
  id: string
  title: string
  longitude: number
  latitude: number
}
type AmapSearchResult = {
  id: string
  name: string
  address: string
  district: string
  location: { lng: number; lat: number }
}
type QualityCheck = {
  key: string
  label: string
  status: 'pass' | 'warning' | 'error'
  message: string
}
type PreviewMarker = {
  id: string
  title: string
  x: number
  y: number
  color?: string
}
type PreviewShape = {
  id: string
  points: string
}
type EditableKind = 'poi' | 'area' | 'route' | 'calibration'
type SelectedEditableItem = {
  kind: EditableKind
  label: string
  item: any
}
type SemanticCategory = {
  type: string
  label: string
  category: string
  icon: string
  color: string
}
type CampusMapImportJob = {
  id: string
  status: 'queued' | 'processing' | 'draft_ready' | 'needs_converter' | 'failed'
  progress: number
  message: string
  source?: {
    fileName: string
    fileExt: string
    fileSize: number
    url: string
  }
  report?: {
    summary?: string[]
    warnings?: string[]
    layers?: Array<{ name: string; role: string; featureCount: number; importedCount: number }>
  }
  draft?: {
    baseSource?: string
    title?: string
    mapWidth?: number
    mapHeight?: number
    coordinateSystem?: Record<string, any>
    imageMap?: Record<string, any> | null
    pois?: PoiItem[]
    areas?: AreaItem[]
    routes?: RouteItem[]
    semanticCategories?: SemanticCategory[]
  } | null
}
type CampusMapConverterStatus = {
  ready: boolean
  path: string
  source: string
  message: string
  checkedAt: string
  platform: string
  instructions?: string[]
  candidates?: Array<{
    path: string
    source: string
    exists: boolean
    executable: boolean
    reason?: string
  }>
}
type AssistantAction = 'import' | 'poi' | 'area' | 'route' | 'calibration' | 'preview' | 'quality' | 'publish' | ''
type AssistantStep = {
  key: string
  order: number
  label: string
  message: string
  status: 'pass' | 'warning' | 'error'
  action: AssistantAction
  actionLabel: string
}

const props = defineProps<{
  regionId?: string | number
  regionName?: string
}>()

const semanticCategories: SemanticCategory[] = [
  { type: 'library', label: '图书馆', category: 'building', icon: 'book', color: '#2563eb' },
  { type: 'canteen', label: '食堂', category: 'service', icon: 'bowl', color: '#f97316' },
  { type: 'dorm', label: '宿舍', category: 'building', icon: 'bed', color: '#7c3aed' },
  { type: 'teaching', label: '教学楼', category: 'building', icon: 'school', color: '#0f766e' },
  { type: 'office', label: '行政楼', category: 'building', icon: 'briefcase', color: '#475569' },
  { type: 'research', label: '科研楼', category: 'building', icon: 'school', color: '#0369a1' },
  { type: 'museum', label: '校史馆', category: 'building', icon: 'building', color: '#92400e' },
  { type: 'sports', label: '运动场', category: 'service', icon: 'ball', color: '#16a34a' },
  { type: 'gate', label: '校门', category: 'entrance', icon: 'gate', color: '#dc2626' },
  { type: 'express', label: '快递点', category: 'service', icon: 'package', color: '#ca8a04' },
  { type: 'shop', label: '超市商店', category: 'merchant', icon: 'shop', color: '#0891b2' },
  { type: 'clinic', label: '医务室', category: 'service', icon: 'cross', color: '#e11d48' },
  { type: 'toilet', label: '厕所', category: 'service', icon: 'toilet', color: '#64748b' },
  { type: 'parking', label: '停车场', category: 'service', icon: 'parking', color: '#334155' },
  { type: 'bus', label: '公交站', category: 'service', icon: 'bus', color: '#0284c7' },
  { type: 'service', label: '服务点', category: 'service', icon: 'star', color: '#9333ea' },
  { type: 'building', label: '建筑', category: 'building', icon: 'building', color: '#4f6272' },
]
const keyPlaceTargets = [
  { type: 'library', label: '图书馆', important: true },
  { type: 'canteen', label: '食堂', important: true },
  { type: 'dorm', label: '宿舍', important: true },
  { type: 'gate', label: '校门', important: true },
  { type: 'teaching', label: '教学楼', important: false },
  { type: 'sports', label: '运动场', important: false },
  { type: 'express', label: '快递点', important: false },
  { type: 'shop', label: '超市商店', important: false },
  { type: 'clinic', label: '医务室', important: false },
]

const amapMapRef = ref<HTMLElement>()
const loading = ref(false)
const saving = ref(false)
const draftSaving = ref(false)
const disabling = ref(false)
const importing = ref(false)
const amapLoading = ref(false)
const editorMode = ref<EditorMode>('amap')
const toolMode = ref<ToolMode>('poi')
const sideTab = ref('poi')
const selectedId = ref('')
const previewDrawerVisible = ref(false)
const qualityDrawerVisible = ref(false)
const advancedDrawerVisible = ref(false)
const importDrawerVisible = ref(false)
const assistantDrawerVisible = ref(false)
const versionDrawerVisible = ref(false)
const hasUnsavedChanges = ref(false)
const previewOpened = ref(false)
const poiCategory = ref('building')
const amapSearchKeyword = ref('')
const amapSearchResults = ref<AmapSearchResult[]>([])
const amapStatus = ref('正在准备高德绘制工作台')
const amapReady = ref(false)
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const historyLocked = ref(false)
const hasVectorBaseMap = ref(false)
const vectorCoordinateSystem = ref<Record<string, any> | null>(null)
const importJobs = ref<CampusMapImportJob[]>([])
const activeImportJob = ref<CampusMapImportJob | null>(null)
const converterStatus = ref<CampusMapConverterStatus | null>(null)
const projectCatalog = ref<any[]>([])
const calibrationMode = computed(() => toolMode.value === 'calibration')
const pois = ref<PoiItem[]>([])
const areas = ref<AreaItem[]>([])
const routes = ref<RouteItem[]>([])
const calibrationPoints = ref<CalibrationPoint[]>([])
const draftAreaPoints = ref<RatioPoint[]>([])
const draftRoutePoints = ref<RatioPoint[]>([])
const amapDefaults = reactive({
  city: '全国',
  center: [113.264385, 23.129112] as [number, number],
  zoom: 16,
})

let amapSdk: any = null
let amapMap: any = null
let amapClickBound = false
let amapInitSeq = 0
let amapSearchTimer: ReturnType<typeof setTimeout> | null = null
let importPollingTimer: ReturnType<typeof setTimeout> | null = null
let amapSearchSeq = 0
let amapOverlays: any[] = []
let activeAmapEditor: any = null

const form = reactive({
  enabled: true,
  title: '校园地图',
  mapId: '',
  version: '',
  imageUrl: '',
  mapWidth: 1200,
  mapHeight: 800,
  opacity: 1,
})

const workflow = reactive({
  draftRevision: 0,
  activeVersion: 0,
  activeVersionId: '',
})

const hasVisualBaseMap = computed(() => Boolean(form.imageUrl || hasVectorBaseMap.value))

const canvasStyle = computed(() => {
  const width = Math.max(Number(form.mapWidth) || 1200, 100)
  const height = Math.max(Number(form.mapHeight) || 800, 100)
  return {
    aspectRatio: `${width} / ${height}`,
    backgroundImage: form.imageUrl ? `linear-gradient(rgba(255,255,255,.08), rgba(255,255,255,.08)), url("${form.imageUrl}")` : '',
  }
})

const mapQualityChecks = computed<QualityCheck[]>(() => {
  const validPoiCount = pois.value.filter((poi) => editorMode.value === 'amap' ? hasLngLat(poi) : true).length
  const validAreaCount = areas.value.filter((area) => area.points.length >= 3).length
  const validRouteCount = routes.value.filter((route) => route.points.length >= 2).length
  const featureCount = validPoiCount + validAreaCount + validRouteCount
  const unnamedCount = [
    ...pois.value.map((item) => item.title),
    ...areas.value.map((item) => item.title),
    ...routes.value.map((item) => item.title),
  ].filter((title) => !String(title || '').trim()).length
  const checks: QualityCheck[] = [
    {
      key: 'content',
      label: '绘制内容',
      status: featureCount > 0 ? 'pass' : 'error',
      message: featureCount > 0 ? `${featureCount} 个有效对象` : '至少绘制 1 个点位、区域或路线',
    },
    {
      key: 'names',
      label: '名称完整',
      status: unnamedCount ? 'warning' : 'pass',
      message: unnamedCount ? `${unnamedCount} 个对象还没有名称` : '点位、区域、路线名称可读',
    },
    {
      key: 'drafts',
      label: '草稿状态',
      status: draftAreaPoints.value.length || draftRoutePoints.value.length ? 'warning' : 'pass',
      message: draftAreaPoints.value.length || draftRoutePoints.value.length ? '还有未完成的区域或路线草稿' : '没有未完成草稿',
    },
  ]

  const projectItems = [...pois.value, ...areas.value]
  const projectCounts = campusProjectCounts(projectItems)
  const projectNumbers = projectItems
    .map((item) => Number(item.officialNumber))
    .filter((number) => Number.isInteger(number) && number > 0)
  const duplicateNumbers = [...new Set(projectNumbers.filter((number, index) => projectNumbers.indexOf(number) !== index))]
  const futureVisible = projectItems.filter((item) => item.constructionStatus === 'under_construction'
    && (item.visibilityScope !== 'future_reference' || item.searchable || item.navigable))
  const unmatchedActive = projectItems.filter((item) => item.visibilityScope === 'phase1_active' && item.geometryStatus === 'unmatched')
  const projectErrors = duplicateNumbers.length + futureVisible.length + unmatchedActive.length
  checks.push({
    key: 'campus-projects',
    label: '一期项目',
    status: projectErrors ? 'error' : projectCounts.review ? 'warning' : 'pass',
    message: projectErrors
      ? `重复编号 ${duplicateNumbers.length}，未来暴露 ${futureVisible.length}，活动层未匹配 ${unmatchedActive.length}`
      : `活动 ${projectCounts.active}，待确认 ${projectCounts.review}，未来参考 ${projectCounts.future}，未匹配 ${projectCounts.unmatched}`,
  })

  if (editorMode.value === 'image') {
    checks.unshift({
      key: 'image',
      label: hasVectorBaseMap.value ? 'CAD 矢量底图' : '图片底图',
      status: hasVisualBaseMap.value ? 'pass' : 'error',
      message: hasVectorBaseMap.value ? 'CAD 图纸已转为矢量底图' : form.imageUrl ? '已上传底图' : '图片模式必须上传校园底图或导入 CAD',
    })
    checks.push({
      key: 'positioning',
      label: '定位校准',
      status: calibrationPoints.value.filter((point) => point.longitude && point.latitude).length >= 2 ? 'pass' : 'error',
      message: calibrationPoints.value.filter((point) => point.longitude && point.latitude).length >= 2 ? '已配置定位校准' : '图片/CAD 地图发布前必须配置至少 2 个定位校准点',
    })
  } else {
    checks.unshift({
      key: 'amap',
      label: '高德地图',
      status: amapReady.value || featureCount > 0 ? 'pass' : 'warning',
      message: amapReady.value ? '高德工作台已加载' : '高德地图未加载时请先检查 Key',
    })
    checks.push({
      key: 'bounds',
      label: '显示范围',
      status: featureCount > 0 ? 'pass' : 'error',
      message: featureCount > 0 ? '可根据已绘制内容生成范围' : '没有内容时无法生成可靠范围',
    })
  }

  return checks
})

const publishReadiness = computed(() => {
  if (form.enabled === false) {
    return {
      canPublish: true,
      errors: [] as QualityCheck[],
      warnings: [] as QualityCheck[],
      summary: '停用状态可直接保存',
    }
  }
  const errors = mapQualityChecks.value.filter((item) => item.status === 'error')
  const warnings = mapQualityChecks.value.filter((item) => item.status === 'warning')
  return {
    canPublish: errors.length === 0,
    errors,
    warnings,
    summary: errors.length
      ? `${errors.length} 项必须修复`
      : warnings.length
        ? `${warnings.length} 项建议优化`
        : '可以发布',
  }
})

const validPoiCount = computed(() => pois.value.filter((poi) => editorMode.value !== 'amap' || hasLngLat(poi)).length)
const validAreaCount = computed(() => areas.value.filter((area) => area.points.length >= 3).length)
const validRouteCount = computed(() => routes.value.filter((route) => route.points.length >= 2).length)
const drawableFeatureCount = computed(() => validPoiCount.value + validAreaCount.value + validRouteCount.value)
const calibratedPointCount = computed(() => calibrationPoints.value.filter((point) => point.longitude && point.latitude).length)
const unnamedObjectCount = computed(() => [
  ...pois.value.map((item) => item.title),
  ...areas.value.map((item) => item.title),
  ...routes.value.map((item) => item.title),
].filter((title) => !String(title || '').trim()).length)

const keyPlaceCoverage = computed(() => keyPlaceTargets.map((target) => {
  const meta = semanticCategories.find((item) => item.type === target.type) || semanticCategories[semanticCategories.length - 1]
  const count = [...pois.value, ...areas.value].filter((item: any) => {
    const title = String(item.title || '')
    return item.semanticType === target.type || item.category === target.type || title.includes(target.label)
  }).length
  return {
    ...target,
    color: meta.color,
    count,
    done: count > 0,
  }
}))

const importantKeyPlaceCount = computed(() => keyPlaceCoverage.value.filter((item) => item.important && item.done).length)
const totalKeyPlaceCount = computed(() => keyPlaceCoverage.value.filter((item) => item.done).length)

const mapAssistantSteps = computed<AssistantStep[]>(() => {
  const baseReady = editorMode.value === 'amap'
    ? amapReady.value || drawableFeatureCount.value > 0
    : hasVisualBaseMap.value
  const contentReady = drawableFeatureCount.value > 0
  const semanticReady = importantKeyPlaceCount.value >= 3
  const semanticPartial = importantKeyPlaceCount.value >= 1 || totalKeyPlaceCount.value >= 3
  const calibrationReady = editorMode.value === 'amap' || calibratedPointCount.value >= 2
  const previewReady = previewOpened.value
  const publishReady = publishReadiness.value.canPublish
  return [
    {
      key: 'base',
      order: 1,
      label: '准备底图',
      message: baseReady ? (hasVectorBaseMap.value ? 'CAD 矢量底图可用' : editorMode.value === 'amap' ? '高德绘制底图可用' : '图片底图可用') : '先导入 CAD 或上传校园底图',
      status: baseReady ? 'pass' : 'error',
      action: baseReady ? '' : 'import',
      actionLabel: '导入',
    },
    {
      key: 'content',
      order: 2,
      label: '绘制内容',
      message: contentReady ? `${drawableFeatureCount.value} 个对象可展示` : '至少需要建筑、点位或路线',
      status: contentReady ? 'pass' : 'error',
      action: contentReady ? '' : 'poi',
      actionLabel: '绘制',
    },
    {
      key: 'semantic',
      order: 3,
      label: '标记关键地点',
      message: semanticReady ? '核心地点覆盖较完整' : `核心地点已配置 ${importantKeyPlaceCount.value}/4`,
      status: semanticReady ? 'pass' : semanticPartial ? 'warning' : 'error',
      action: semanticReady ? '' : 'poi',
      actionLabel: '补点位',
    },
    {
      key: 'calibration',
      order: 4,
      label: '定位校准',
      message: calibrationReady ? '小程序定位可投射到地图' : `还需要 ${Math.max(0, 2 - calibratedPointCount.value)} 个校准点`,
      status: calibrationReady ? 'pass' : 'warning',
      action: calibrationReady ? '' : 'calibration',
      actionLabel: '校准',
    },
    {
      key: 'preview',
      order: 5,
      label: '小程序预览',
      message: previewReady ? '已经查看过小程序预览' : '发布前建议先看用户端效果',
      status: previewReady ? 'pass' : contentReady ? 'warning' : 'error',
      action: 'preview',
      actionLabel: '预览',
    },
    {
      key: 'publish',
      order: 6,
      label: '发布检查',
      message: publishReady ? publishReadiness.value.summary : publishReadiness.value.errors[0]?.message || publishReadiness.value.summary,
      status: publishReady ? 'pass' : 'error',
      action: publishReady ? 'publish' : 'quality',
      actionLabel: publishReady ? '发布' : '检查',
    },
  ]
})

const mapAssistantScore = computed(() => {
  const scoreMap: Record<AssistantStep['status'], number> = { pass: 1, warning: 0.55, error: 0 }
  const score = mapAssistantSteps.value.reduce((total, step) => total + scoreMap[step.status], 0)
  return Math.round((score / Math.max(1, mapAssistantSteps.value.length)) * 100)
})
const assistantHealthLevel = computed(() => mapAssistantScore.value >= 85 ? 'good' : mapAssistantScore.value >= 55 ? 'medium' : 'low')
const mapAssistantSummary = computed(() => {
  if (mapAssistantScore.value >= 85) return '配置接近完成'
  if (mapAssistantScore.value >= 55) return '还差几步'
  return '需要引导配置'
})
const assistantNextAction = computed(() => {
  const step = mapAssistantSteps.value.find((item) => item.status === 'error' && item.action)
    || mapAssistantSteps.value.find((item) => item.status === 'warning' && item.action)
    || mapAssistantSteps.value.find((item) => item.action === 'publish')
    || mapAssistantSteps.value[mapAssistantSteps.value.length - 1]
  return {
    label: step?.label || '继续配置',
    message: step?.message || '地图配置已经完成',
    action: step?.action || '',
    buttonText: step?.actionLabel || '查看',
  }
})
const assistantWarnings = computed(() => {
  const warnings: string[] = []
  if (!hasVisualBaseMap.value && editorMode.value === 'image') warnings.push('还没有底图，运营者无法判断建筑位置是否准确。')
  if (unnamedObjectCount.value > 0) warnings.push(`${unnamedObjectCount.value} 个对象还没有名称，小程序搜索和点击卡片会不完整。`)
  if (importantKeyPlaceCount.value < 4) {
    const missing = keyPlaceCoverage.value.filter((item) => item.important && !item.done).map((item) => item.label)
    warnings.push(`核心地点缺少：${missing.join('、')}。`)
  }
  if (editorMode.value === 'image' && calibratedPointCount.value < 2) warnings.push('定位校准点不足，用户当前位置和距离只能作为临时参考。')
  if (pois.value.length > 80) warnings.push('点位较多，建议隐藏低频点或按分类展示，避免小程序地图拥挤。')
  if (draftAreaPoints.value.length || draftRoutePoints.value.length) warnings.push('还有未完成的区域或路线草稿，发布前请完成或清空。')
  if (activeImportJob.value?.status === 'needs_converter') warnings.push('DWG 自动转换缺少 ODA 转换器，建议上传 DXF 或安装转换器。')
  if (activeImportJob.value?.status === 'failed') warnings.push('最近一次图纸导入失败，请查看导入任务提示后重新上传。')
  return warnings
})

const miniProgramPreview = computed(() => buildMiniProgramPreview())
const miniPreviewMarkers = computed<PreviewMarker[]>(() => miniProgramPreview.value.markers)
const miniPreviewPolylines = computed<PreviewShape[]>(() => miniProgramPreview.value.polylines)
const miniPreviewPolygons = computed<PreviewShape[]>(() => miniProgramPreview.value.polygons)
const selectedEditableItem = computed<SelectedEditableItem | null>(() => {
  const id = selectedId.value
  if (!id) return null
  const poi = pois.value.find((item) => item.id === id)
  if (poi) return { kind: 'poi', label: '点位', item: poi }
  const area = areas.value.find((item) => item.id === id)
  if (area) return { kind: 'area', label: '区域', item: area }
  const route = routes.value.find((item) => item.id === id)
  if (route) return { kind: 'route', label: '路线', item: route }
  const calibration = calibrationPoints.value.find((item) => item.id === id)
  if (calibration) return { kind: 'calibration', label: '校准点', item: calibration }
  return null
})

watch(() => props.regionId, () => {
  resetDrafts()
  loadProjectCatalog()
  loadMap()
}, { immediate: true })

watch(() => form.imageUrl, (value) => {
  if (value) syncImageSize(value)
})

watch(editorMode, (mode) => {
  resetDrafts()
  if (mode === 'amap') {
    nextTick(() => initAmapWorkbench())
  }
})

watch([pois, areas, routes, calibrationPoints], () => {
  if (editorMode.value === 'amap') refreshAmapOverlays()
  if (!historyLocked.value) hasUnsavedChanges.value = true
}, { deep: true })

watch([form, editorMode, hasVectorBaseMap, vectorCoordinateSystem], () => {
  if (!historyLocked.value) hasUnsavedChanges.value = true
}, { deep: true })

onBeforeUnmount(() => {
  amapInitSeq += 1
  if (amapSearchTimer) clearTimeout(amapSearchTimer)
  if (importPollingTimer) clearTimeout(importPollingTimer)
  clearAmapOverlays()
  if (amapMap) {
    amapMap.destroy?.()
    amapMap = null
    amapReady.value = false
  }
})

function currentRegionId() {
  return props.regionId ? String(props.regionId) : ''
}

function setToolMode(mode: ToolMode) {
  toolMode.value = mode
  if (mode !== 'select') {
    selectedId.value = ''
  }
  if (mode !== 'area' && mode !== 'route') {
    closeAmapEditor()
  }
}

function selectLayerItem(kind: EditableKind, id: string) {
  selectedId.value = id
  sideTab.value = kind
  toolMode.value = 'select'
}

function openPreviewDrawer() {
  previewOpened.value = true
  previewDrawerVisible.value = true
}

function openQualityDrawer() {
  qualityDrawerVisible.value = true
}

function openAdvancedDrawer() {
  advancedDrawerVisible.value = true
}

function openAssistantDrawer() {
  assistantDrawerVisible.value = true
}

async function openImportDrawer() {
  importDrawerVisible.value = true
  await Promise.all([loadImportJobs(), loadConverterStatus()])
}

function focusKeyPlace(type: string) {
  const existing = [...pois.value, ...areas.value].find((item: any) => item.semanticType === type || item.category === type)
  if (existing) {
    selectLayerItem((existing as any).points ? 'area' : 'poi', existing.id)
    assistantDrawerVisible.value = false
    return
  }
  poiCategory.value = type
  toolMode.value = 'poi'
  selectedId.value = ''
  assistantDrawerVisible.value = false
  ElMessage.info('已切到点位工具，请在地图上点击放置这个地点')
}

function runAssistantAction(action: AssistantAction) {
  if (action === 'import') {
    openImportDrawer()
    return
  }
  if (action === 'poi' || action === 'area' || action === 'route' || action === 'calibration') {
    setToolMode(action)
    assistantDrawerVisible.value = false
    if (action === 'calibration') ElMessage.info('请在地图上添加至少 2 个校准点')
    return
  }
  if (action === 'preview') {
    openPreviewDrawer()
    return
  }
  if (action === 'quality') {
    openQualityDrawer()
    return
  }
  if (action === 'publish') {
    publishMap()
  }
}

function semanticMeta(item: any = {}) {
  return semanticCategories.find((category) => category.type === item.semanticType)
    || semanticCategories.find((category) => category.type === item.category)
    || semanticCategories[semanticCategories.length - 1]
}

function applySemanticFields(item: any, semanticType?: string) {
  const meta = semanticCategories.find((category) => category.type === semanticType)
    || semanticCategories.find((category) => category.type === item.semanticType)
    || semanticCategories.find((category) => category.type === item.category)
    || semanticCategories[semanticCategories.length - 1]
  item.semanticType = meta.type
  item.icon = meta.icon
  item.color = meta.color
  if (item.category !== 'walk') item.category = meta.category
  return item
}

function syncSelectedSemantic() {
  if (!selectedEditableItem.value) return
  recordMapHistory()
  applySemanticFields(selectedEditableItem.value.item, selectedEditableItem.value.item.semanticType)
}

function handleAssignProject(officialNumber: number) {
  const selected = selectedEditableItem.value
  if (!selected || (selected.kind !== 'poi' && selected.kind !== 'area')) return
  const project = projectCatalog.value.find((item) => Number(item.officialNumber) === Number(officialNumber))
  if (!project) return
  recordMapHistory()
  Object.assign(selected.item, applyCampusProject(selected.item, project, selected.kind))
  applySemanticFields(selected.item, selected.item.semanticType)
  ElMessage.success(`已分配 #${project.officialNumber} ${project.officialName}`)
}

async function loadProjectCatalog() {
  if (projectCatalog.value.length) return
  try {
    const res: any = await fetchCampusMapProjectCatalog()
    const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
    projectCatalog.value = list
  } catch (error) {
    console.error('校园官方项目目录加载失败:', error)
  }
}

function importStatusLabel(status: CampusMapImportJob['status']) {
  const labels: Record<string, string> = {
    queued: '排队中',
    processing: '转换中',
    draft_ready: '可应用',
    needs_converter: '缺少转换器',
    failed: '失败',
  }
  return labels[status] || '未知'
}

async function loadConverterStatus() {
  try {
    const res: any = await fetchCampusMapConverterStatus()
    converterStatus.value = (res?.data || res) as CampusMapConverterStatus
  } catch (error) {
    console.error('校园地图 DWG 转换器状态加载失败:', error)
  }
}

async function loadImportJobs() {
  if (!currentRegionId()) return
  try {
    const res: any = await fetchRegionCampusMapImports(currentRegionId())
    const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
    importJobs.value = list
    if (!activeImportJob.value && list.length) activeImportJob.value = list[0]
  } catch (error) {
    console.error('校园地图导入任务加载失败:', error)
  }
}

async function retryImportJob(jobId: string) {
  if (!currentRegionId() || !jobId) return
  importing.value = true
  try {
    const res: any = await retryRegionCampusMapImport(currentRegionId(), jobId)
    const job = (res?.data || res) as CampusMapImportJob
    activeImportJob.value = job
    importJobs.value = [job, ...importJobs.value.filter((item) => item.id !== job.id)]
    scheduleImportPolling(job.id)
    ElMessage.success('已重新提交转换任务')
  } catch (error: any) {
    ElMessage.error(error?.message || '重新转换失败')
  } finally {
    importing.value = false
  }
}

async function deleteImportJob(jobId: string) {
  if (!currentRegionId() || !jobId) return
  try {
    await ElMessageBox.confirm('删除后会清理原始图纸和转换草稿；转换中的任务也会被中止。确定删除吗？', '删除导入任务', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    importing.value = true
    await deleteRegionCampusMapImport(currentRegionId(), jobId)
    importJobs.value = importJobs.value.filter((item) => item.id !== jobId)
    activeImportJob.value = activeImportJob.value?.id === jobId ? importJobs.value[0] || null : activeImportJob.value
    ElMessage.success('导入任务已删除')
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '删除导入任务失败')
  } finally {
    importing.value = false
  }
}

async function handleImportFileChange(uploadFile: any) {
  const file = uploadFile?.raw || uploadFile
  if (!currentRegionId()) {
    ElMessage.warning('请先选择区域')
    return false
  }
  if (!file) return false
  importing.value = true
  try {
    const res: any = await uploadRegionCampusMapImport(currentRegionId(), file)
    const job = (res?.data || res) as CampusMapImportJob
    activeImportJob.value = job
    importJobs.value = [job, ...importJobs.value.filter((item) => item.id !== job.id)]
    scheduleImportPolling(job.id)
    ElMessage.success('图纸已上传，正在转换')
  } catch (error: any) {
    ElMessage.error(error?.message || 'CAD 图纸上传失败')
  } finally {
    importing.value = false
  }
  return false
}

function scheduleImportPolling(jobId: string) {
  if (importPollingTimer) clearTimeout(importPollingTimer)
  importPollingTimer = setTimeout(() => {
    refreshImportJob(jobId)
  }, 1200)
}

async function refreshImportJob(jobId: string) {
  if (!currentRegionId() || !jobId) return
  importing.value = true
  try {
    const res: any = await fetchRegionCampusMapImport(currentRegionId(), jobId)
    const job = (res?.data || res) as CampusMapImportJob
    activeImportJob.value = job
    importJobs.value = [job, ...importJobs.value.filter((item) => item.id !== job.id)]
    if (job.status === 'queued' || job.status === 'processing') {
      scheduleImportPolling(job.id)
    } else if (job.status === 'draft_ready') {
      ElMessage.success('CAD 已转换成可编辑地图草稿')
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '导入任务刷新失败')
  } finally {
    importing.value = false
  }
}

function normalizeImportedPoi(item: any, index: number): PoiItem {
  return applySemanticFields({
    id: item.id || createId('poi'),
    title: item.title || `点位 ${index + 1}`,
    category: item.category || item.semanticType || 'building',
    semanticType: item.semanticType || item.category || 'building',
    icon: item.icon,
    color: item.color,
    sourceLayer: item.sourceLayer,
    xRatio: clampRatio(item.xRatio),
    yRatio: clampRatio(item.yRatio),
    ...normalizeImportedPoiProject(item),
  }, item.semanticType || item.category) as PoiItem
}

function normalizeImportedArea(item: any, index: number): AreaItem {
  return applySemanticFields({
    id: item.id || createId('area'),
    title: item.title || `区域 ${index + 1}`,
    category: item.category || item.semanticType || 'teaching',
    semanticType: item.semanticType || item.category || 'teaching',
    icon: item.icon,
    color: item.color,
    sourceLayer: item.sourceLayer,
    points: Array.isArray(item.points) ? item.points.map((point: any) => ({
      xRatio: clampRatio(point.xRatio),
      yRatio: clampRatio(point.yRatio),
    })) : [],
    ...normalizeImportedAreaProject(item),
  }, item.semanticType || item.category) as AreaItem
}

function normalizeImportedRoute(item: any, index: number): RouteItem {
  return {
    id: item.id || createId('route'),
    title: item.title || `路线 ${index + 1}`,
    category: item.category || 'walk',
    semanticType: item.semanticType || 'service',
    icon: item.icon || 'route',
    color: item.color || '#f97316',
    sourceLayer: item.sourceLayer,
    points: Array.isArray(item.points) ? item.points.map((point: any) => ({
      xRatio: clampRatio(point.xRatio),
      yRatio: clampRatio(point.yRatio),
    })) : [],
  }
}

function applyImportDraft(job: CampusMapImportJob) {
  const draft = job?.draft
  if (!draft) {
    ElMessage.warning('导入任务还没有生成草稿')
    return
  }
  recordMapHistory()
  editorMode.value = 'image'
  toolMode.value = 'select'
  hasVectorBaseMap.value = draft.baseSource === 'cad-vector'
  vectorCoordinateSystem.value = draft.coordinateSystem || null
  if (draft.title) form.title = draft.title
  form.imageUrl = draft.imageMap?.imageUrl || ''
  form.mapWidth = Math.max(Number(draft.mapWidth || 1200), 100)
  form.mapHeight = Math.max(Number(draft.mapHeight || 800), 100)
  form.opacity = Number(draft.imageMap?.opacity || form.opacity || 1)
  pois.value = (draft.pois || []).map(normalizeImportedPoi)
  areas.value = (draft.areas || []).map(normalizeImportedArea).filter((item) => item.points.length >= 3)
  routes.value = (draft.routes || []).map(normalizeImportedRoute).filter((item) => item.points.length >= 2)
  selectedId.value = ''
  importDrawerVisible.value = false
  ElMessage.success('已应用为可编辑地图草稿，请检查建筑名称和坐标校准')
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function serializeMapState() {
  return JSON.stringify({
    editorMode: editorMode.value,
    toolMode: toolMode.value,
    sideTab: sideTab.value,
    selectedId: selectedId.value,
    poiCategory: poiCategory.value,
    form: cloneValue(form),
    pois: cloneValue(pois.value),
    areas: cloneValue(areas.value),
    routes: cloneValue(routes.value),
    calibrationPoints: cloneValue(calibrationPoints.value),
    draftAreaPoints: cloneValue(draftAreaPoints.value),
    draftRoutePoints: cloneValue(draftRoutePoints.value),
    amapDefaults: cloneValue(amapDefaults),
    hasVectorBaseMap: hasVectorBaseMap.value,
    vectorCoordinateSystem: cloneValue(vectorCoordinateSystem.value),
  })
}

function applyMapSnapshot(snapshot: string) {
  const state = JSON.parse(snapshot)
  historyLocked.value = true
  editorMode.value = state.editorMode || 'amap'
  toolMode.value = state.toolMode || 'poi'
  sideTab.value = state.sideTab || 'poi'
  selectedId.value = state.selectedId || ''
  poiCategory.value = state.poiCategory || 'building'
  Object.assign(form, state.form || {})
  pois.value = Array.isArray(state.pois) ? state.pois : []
  areas.value = Array.isArray(state.areas) ? state.areas : []
  routes.value = Array.isArray(state.routes) ? state.routes : []
  calibrationPoints.value = Array.isArray(state.calibrationPoints) ? state.calibrationPoints : []
  draftAreaPoints.value = Array.isArray(state.draftAreaPoints) ? state.draftAreaPoints : []
  draftRoutePoints.value = Array.isArray(state.draftRoutePoints) ? state.draftRoutePoints : []
  hasVectorBaseMap.value = Boolean(state.hasVectorBaseMap)
  vectorCoordinateSystem.value = state.vectorCoordinateSystem || null
  if (state.amapDefaults?.center) {
    amapDefaults.center = state.amapDefaults.center
    amapDefaults.zoom = Number(state.amapDefaults.zoom || amapDefaults.zoom)
    amapDefaults.city = String(state.amapDefaults.city || amapDefaults.city || '全国')
  }
  nextTick(() => {
    historyLocked.value = false
    if (editorMode.value === 'amap') {
      initAmapWorkbench()
      refreshAmapOverlays()
      fitAmapOverlays()
    }
  })
}

function recordMapHistory() {
  if (historyLocked.value) return
  const snapshot = serializeMapState()
  if (undoStack.value[undoStack.value.length - 1] === snapshot) return
  undoStack.value.push(snapshot)
  if (undoStack.value.length > 60) undoStack.value.shift()
  redoStack.value = []
}

function undoMapEdit() {
  const snapshot = undoStack.value.pop()
  if (!snapshot) return
  redoStack.value.push(serializeMapState())
  applyMapSnapshot(snapshot)
  hasUnsavedChanges.value = true
}

function redoMapEdit() {
  const snapshot = redoStack.value.pop()
  if (!snapshot) return
  undoStack.value.push(serializeMapState())
  applyMapSnapshot(snapshot)
  hasUnsavedChanges.value = true
}

function roundLngLat(value: number) {
  return Number(Number(value).toFixed(6))
}

function normalizeLocationText(value: any): string {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined && item !== null && String(item).trim())
      .map((item) => String(item).trim())
      .join(' ')
  }
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function escapeHtml(value: any) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function hasLngLat(point: RatioPoint) {
  return Number.isFinite(Number(point.longitude)) && Number.isFinite(Number(point.latitude))
}

function toAmapPath(points: RatioPoint[]) {
  return points
    .filter(hasLngLat)
    .map((point) => [Number(point.longitude), Number(point.latitude)])
}

function toAmapPoint(longitude: number, latitude: number): RatioPoint {
  return {
    xRatio: 0.5,
    yRatio: 0.5,
    longitude: roundLngLat(longitude),
    latitude: roundLngLat(latitude),
  }
}

function formatLngLat(point: RatioPoint) {
  if (!hasLngLat(point)) return '未记录经纬度'
  return `${Number(point.longitude).toFixed(6)}, ${Number(point.latitude).toFixed(6)}`
}

function getAmapEventLngLat(event: any) {
  const lnglat = event?.lnglat || event
  const lng = Number(lnglat?.lng ?? lnglat?.getLng?.())
  const lat = Number(lnglat?.lat ?? lnglat?.getLat?.())
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}

function getAmapCenter() {
  const center = amapMap?.getCenter?.()
  const point = getAmapEventLngLat(center)
  if (point) return point
  return {
    lng: Number(amapDefaults.center[0]),
    lat: Number(amapDefaults.center[1]),
  }
}

function updateAmapDefaults(longitude: number, latitude: number, zoom?: number) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return
  amapDefaults.center = [roundLngLat(longitude), roundLngLat(latitude)]
  if (Number.isFinite(Number(zoom))) amapDefaults.zoom = Number(zoom)
}

function applyAmapSecurityConfig(config: Record<string, any>) {
  const securityJsCode = String(config.securityJsCode || '')
  const serviceHost = String(config.serviceHost || '')
  const browserWindow = window as any
  if (serviceHost) {
    browserWindow._AMapSecurityConfig = { serviceHost }
  } else if (securityJsCode && securityJsCode !== '******' && securityJsCode !== String(config.jsApiKey || '')) {
    browserWindow._AMapSecurityConfig = { securityJsCode }
  }
}

async function initAmapWorkbench() {
  if (editorMode.value !== 'amap') return
  const initSeq = ++amapInitSeq
  const isStale = () => initSeq !== amapInitSeq || editorMode.value !== 'amap' || !amapMapRef.value
  await nextTick()
  if (isStale()) return
  if (amapMap) {
    amapMap.resize?.()
    amapReady.value = true
    refreshAmapOverlays()
    return
  }

  amapLoading.value = true
  amapStatus.value = '正在加载高德地图'
  try {
    const configRes: any = await fetchAmapRuntimeConfig()
    if (isStale()) return
    const config = configRes?.data || configRes || {}
    const jsApiKey = String(config.jsApiKey || '')
    if (!jsApiKey) {
      amapStatus.value = '请先在系统设置里配置高德 JS-API Key'
      amapReady.value = false
      return
    }

    const defaultLng = Number(config.defaultLongitude)
    const defaultLat = Number(config.defaultLatitude)
    if (Number.isFinite(defaultLng) && Number.isFinite(defaultLat) && defaultLng && defaultLat) {
      updateAmapDefaults(defaultLng, defaultLat)
    }
    amapDefaults.city = String(config.defaultCity || amapDefaults.city || '全国')
    applyAmapSecurityConfig(config)

    amapSdk = await AMapLoader.load({
      key: jsApiKey,
      version: '2.0',
      plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.PolygonEditor', 'AMap.PolylineEditor'],
    })
    if (isStale()) return

    amapMap = new amapSdk.Map(amapMapRef.value, {
      zoom: amapDefaults.zoom,
      center: amapDefaults.center,
      resizeEnable: true,
    })
    amapMap.addControl(new amapSdk.Scale())
    amapMap.addControl(new amapSdk.ToolBar())
    if (!amapClickBound) {
      amapMap.on('click', handleAmapClick)
      amapClickBound = true
    }
    amapStatus.value = '点击地图即可绘制当前工具'
    amapReady.value = true
    refreshAmapOverlays()
    fitAmapOverlays()
  } catch (error: any) {
    console.error('高德绘制工作台初始化失败:', error)
    amapStatus.value = error?.message || '高德绘制工作台初始化失败'
    amapReady.value = false
    ElMessage.error('高德绘制工作台初始化失败')
  } finally {
    if (initSeq === amapInitSeq) amapLoading.value = false
  }
}

function handleEditorModeChange(value: EditorMode) {
  editorMode.value = value
  if (value === 'amap') {
    nextTick(() => initAmapWorkbench())
  }
}

function handleAmapClick(event: any) {
  const point = getAmapEventLngLat(event)
  if (!point || toolMode.value === 'select') return
  updateAmapDefaults(point.lng, point.lat, amapMap?.getZoom?.())
  if (toolMode.value === 'poi') {
    addAmapPoiAtLngLat(point.lng, point.lat)
    return
  }
  if (toolMode.value === 'area') {
    recordMapHistory()
    draftAreaPoints.value.push(toAmapPoint(point.lng, point.lat))
    sideTab.value = 'area'
    refreshAmapOverlays()
    return
  }
  if (toolMode.value === 'route') {
    recordMapHistory()
    draftRoutePoints.value.push(toAmapPoint(point.lng, point.lat))
    sideTab.value = 'route'
    refreshAmapOverlays()
    return
  }
  if (calibrationMode.value) {
    addCalibrationAtLngLat(point.lng, point.lat)
  }
}

function addAmapPoiAtLngLat(longitude: number, latitude: number, title?: string) {
  recordMapHistory()
  const point = toAmapPoint(longitude, latitude)
  const item: PoiItem = {
    id: createId('poi'),
    title: title || `点位 ${pois.value.length + 1}`,
    category: poiCategory.value,
    semanticType: poiCategory.value,
    ...point,
  }
  applySemanticFields(item, poiCategory.value)
  pois.value.push(item)
  selectedId.value = item.id
  sideTab.value = 'poi'
  refreshAmapOverlays()
}

function addAmapPoiAtCenter() {
  if (editorMode.value !== 'amap') return addPoiAtRatio(0.5, 0.5)
  const center = getAmapCenter()
  addAmapPoiAtLngLat(center.lng, center.lat)
}

function addPoiFromSidebar() {
  if (editorMode.value === 'amap') {
    addAmapPoiAtCenter()
    return
  }
  addPoiAtRatio(0.5, 0.5)
}

function addCalibrationAtLngLat(longitude: number, latitude: number) {
  recordMapHistory()
  const point = toAmapPoint(longitude, latitude)
  const item: CalibrationPoint = {
    id: createId('calibration'),
    title: `校准点 ${calibrationPoints.value.length + 1}`,
    longitude: Number(point.longitude),
    latitude: Number(point.latitude),
    xRatio: point.xRatio,
    yRatio: point.yRatio,
  }
  calibrationPoints.value.push(item)
  selectedId.value = item.id
  sideTab.value = 'calibration'
}

function clearAmapOverlays() {
  closeAmapEditor()
  if (amapMap && amapOverlays.length) {
    amapMap.remove(amapOverlays)
  }
  amapOverlays = []
}

function closeAmapEditor() {
  if (activeAmapEditor) {
    activeAmapEditor.close?.()
    activeAmapEditor = null
  }
}

function updateAmapPoiPosition(id: string, longitude: number, latitude: number) {
  const target = pois.value.find((poi) => poi.id === id)
  if (!target) return
  target.longitude = roundLngLat(longitude)
  target.latitude = roundLngLat(latitude)
  updateAmapDefaults(longitude, latitude, amapMap?.getZoom?.())
  refreshAmapOverlays()
}

function syncAmapOverlayPath(kind: 'area' | 'route', id: string, path: any[]) {
  const target = kind === 'area'
    ? areas.value.find((item) => item.id === id)
    : routes.value.find((item) => item.id === id)
  if (!target || !Array.isArray(path)) return
  const points = path
    .map((item) => getAmapEventLngLat(item))
    .filter(Boolean)
    .map((item: any) => toAmapPoint(item.lng, item.lat))
  if (kind === 'area' && points.length < 3) return
  if (kind === 'route' && points.length < 2) return
  target.points = points
  refreshAmapOverlays()
}

function enableAmapShapeEditing(overlay: any, kind: 'area' | 'route', id: string) {
  overlay.on?.('dblclick', () => {
    if (!amapSdk || !amapMap) return
    recordMapHistory()
    closeAmapEditor()
    activeAmapEditor = kind === 'area'
      ? new amapSdk.PolygonEditor(amapMap, overlay)
      : new amapSdk.PolylineEditor(amapMap, overlay)
    activeAmapEditor.open?.()
    amapStatus.value = kind === 'area' ? '正在编辑区域节点，双击其他对象可切换' : '正在编辑路线节点，双击其他对象可切换'
    activeAmapEditor.on?.('end', () => {
      syncAmapOverlayPath(kind, id, overlay.getPath?.() || [])
      activeAmapEditor = null
      amapStatus.value = '节点编辑已保存'
    })
  })
}

function drawAmapPoi(poi: PoiItem) {
  if (!amapSdk || !amapMap || !hasLngLat(poi)) return null
  const marker = new amapSdk.Marker({
    position: [Number(poi.longitude), Number(poi.latitude)],
    title: poi.title || '点位',
    anchor: 'bottom-center',
    draggable: true,
    label: {
      content: `<div class="amap-poi-label">${escapeHtml(poi.title || '点位')}</div>`,
      direction: 'right',
    },
  })
  marker.on?.('click', () => {
    selectedId.value = poi.id
    sideTab.value = 'poi'
  })
  marker.on?.('dragstart', () => recordMapHistory())
  marker.on?.('dragend', () => {
    const position = marker.getPosition?.()
    const point = getAmapEventLngLat(position)
    if (point) updateAmapPoiPosition(poi.id, point.lng, point.lat)
  })
  amapMap.add(marker)
  return marker
}

function drawAmapCalibration(point: CalibrationPoint) {
  if (!amapSdk || !amapMap || !hasLngLat(point)) return null
  const marker = new amapSdk.Marker({
    position: [Number(point.longitude), Number(point.latitude)],
    title: point.title || '校准点',
    anchor: 'center',
    content: '<div class="amap-calibration-marker"></div>',
    label: {
      content: `<div class="amap-poi-label">${escapeHtml(point.title || '校准点')}</div>`,
      direction: 'right',
    },
  })
  marker.on?.('click', () => {
    selectedId.value = point.id
    sideTab.value = 'calibration'
  })
  amapMap.add(marker)
  return marker
}

function drawAmapArea(area: AreaItem, draft = false) {
  if (!amapSdk || !amapMap) return null
  const path = toAmapPath(area.points)
  if (path.length < 2) return null
  const polygon = new amapSdk.Polygon({
    path,
    strokeColor: draft ? '#0f766e' : '#2563eb',
    strokeWeight: draft ? 2 : 3,
    strokeOpacity: 0.9,
    strokeStyle: draft ? 'dashed' : 'solid',
    fillColor: draft ? '#14b8a6' : '#2563eb',
    fillOpacity: draft ? 0.08 : 0.16,
    bubble: true,
  })
  polygon.on?.('click', () => {
    selectedId.value = area.id
    sideTab.value = 'area'
  })
  if (!draft) enableAmapShapeEditing(polygon, 'area', area.id)
  amapMap.add(polygon)
  return polygon
}

function drawAmapRoute(route: RouteItem, draft = false) {
  if (!amapSdk || !amapMap) return null
  const path = toAmapPath(route.points)
  if (path.length < 2) return null
  const polyline = new amapSdk.Polyline({
    path,
    strokeColor: draft ? '#0f766e' : '#f97316',
    strokeWeight: draft ? 4 : 5,
    strokeOpacity: 0.9,
    strokeStyle: draft ? 'dashed' : 'solid',
    lineJoin: 'round',
    lineCap: 'round',
    bubble: true,
  })
  polyline.on?.('click', () => {
    selectedId.value = route.id
    sideTab.value = 'route'
  })
  if (!draft) enableAmapShapeEditing(polyline, 'route', route.id)
  amapMap.add(polyline)
  return polyline
}

function refreshAmapOverlays() {
  if (!amapMap || !amapSdk) return
  clearAmapOverlays()
  pois.value.forEach((poi) => {
    const overlay = drawAmapPoi(poi)
    if (overlay) amapOverlays.push(overlay)
  })
  areas.value.forEach((area) => {
    const overlay = drawAmapArea(area)
    if (overlay) amapOverlays.push(overlay)
  })
  routes.value.forEach((route) => {
    const overlay = drawAmapRoute(route)
    if (overlay) amapOverlays.push(overlay)
  })
  calibrationPoints.value.forEach((point) => {
    const overlay = drawAmapCalibration(point)
    if (overlay) amapOverlays.push(overlay)
  })
  if (draftAreaPoints.value.length >= 2) {
    const overlay = drawAmapArea({ id: 'draft_area', title: '区域草稿', category: 'draft', points: draftAreaPoints.value }, true)
    if (overlay) amapOverlays.push(overlay)
  }
  if (draftRoutePoints.value.length >= 2) {
    const overlay = drawAmapRoute({ id: 'draft_route', title: '路线草稿', category: 'draft', points: draftRoutePoints.value }, true)
    if (overlay) amapOverlays.push(overlay)
  }
}

function fitAmapOverlays() {
  if (!amapMap) return
  if (amapOverlays.length) {
    amapMap.setFitView?.(amapOverlays, false, [48, 48, 48, 48])
    return
  }
  amapMap.setZoomAndCenter?.(amapDefaults.zoom, amapDefaults.center)
}

function onAmapSearchInput(value: string) {
  const keyword = String(value || '').trim()
  if (amapSearchTimer) clearTimeout(amapSearchTimer)
  if (!keyword) {
    amapSearchResults.value = []
    return
  }
  const seq = ++amapSearchSeq
  amapSearchTimer = setTimeout(() => {
    searchAmapPlaces(keyword, seq)
  }, 300)
}

async function searchAmapPlaces(keyword = amapSearchKeyword.value, seq = ++amapSearchSeq) {
  const words = String(keyword || '').trim()
  if (!words) {
    amapSearchResults.value = []
    return
  }
  amapLoading.value = true
  try {
    const res: any = await amapPlaceSearch(words, amapDefaults.city || '全国')
    if (seq !== amapSearchSeq) return
    if (res?.success === false) {
      amapSearchResults.value = []
      return
    }
    const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
    amapSearchResults.value = list
      .map((item: any, index: number) => ({
        id: String(item.id || `${item.name || words}_${index}`),
        name: normalizeLocationText(item.name) || words,
        address: normalizeLocationText(item.address),
        district: normalizeLocationText(item.district),
        location: { lng: Number(item.longitude), lat: Number(item.latitude) },
      }))
      .filter((item: AmapSearchResult) => Number.isFinite(item.location.lng) && Number.isFinite(item.location.lat))
    amapStatus.value = amapSearchResults.value.length ? `找到 ${amapSearchResults.value.length} 个地点` : '没有找到匹配地点'
  } catch (error) {
    console.error('高德地点搜索失败:', error)
    amapSearchResults.value = []
    amapStatus.value = '高德地点搜索失败'
  } finally {
    amapLoading.value = false
  }
}

function selectAmapPlace(item: AmapSearchResult) {
  amapSearchKeyword.value = item.name
  amapSearchResults.value = []
  updateAmapDefaults(item.location.lng, item.location.lat, Math.max(amapDefaults.zoom, 17))
  if (amapMap) {
    amapMap.setZoomAndCenter?.(Math.max(amapDefaults.zoom, 17), [item.location.lng, item.location.lat])
  }
  if (toolMode.value === 'poi') {
    addAmapPoiAtLngLat(item.location.lng, item.location.lat, item.name)
  }
  amapStatus.value = `${item.name} 已定位到地图中心`
}

function handleCanvasPointClick(point: RatioPoint) {
  if (!hasVisualBaseMap.value) {
    ElMessage.warning('请先上传校园底图或导入 CAD 图纸')
    return
  }
  if (toolMode.value === 'poi') {
    addPoiAtRatio(point.xRatio, point.yRatio)
    return
  }
  if (toolMode.value === 'area') {
    recordMapHistory()
    draftAreaPoints.value.push(point)
    sideTab.value = 'area'
    return
  }
  if (toolMode.value === 'route') {
    recordMapHistory()
    draftRoutePoints.value.push(point)
    sideTab.value = 'route'
    return
  }
  if (calibrationMode.value) {
    addCalibrationAtRatio(point.xRatio, point.yRatio)
  }
}

function addPoiAtRatio(xRatio: number, yRatio: number) {
  recordMapHistory()
  const item: PoiItem = {
    id: createId('poi'),
    title: `点位 ${pois.value.length + 1}`,
    category: poiCategory.value,
    semanticType: poiCategory.value,
    xRatio: clampRatio(xRatio),
    yRatio: clampRatio(yRatio),
  }
  applySemanticFields(item, poiCategory.value)
  pois.value.push(item)
  selectedId.value = item.id
  sideTab.value = 'poi'
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function addCalibrationAtRatio(xRatio: number, yRatio: number) {
  recordMapHistory()
  const item: CalibrationPoint = {
    id: createId('calibration'),
    title: `校准点 ${calibrationPoints.value.length + 1}`,
    longitude: 0,
    latitude: 0,
    xRatio: clampRatio(xRatio),
    yRatio: clampRatio(yRatio),
  }
  calibrationPoints.value.push(item)
  selectedId.value = item.id
  sideTab.value = 'calibration'
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function finishArea() {
  if (draftAreaPoints.value.length < 3) {
    ElMessage.warning('区域至少需要 3 个点')
    return
  }
  recordMapHistory()
  areas.value.push({
    id: createId('area'),
    title: `区域 ${areas.value.length + 1}`,
    category: 'teaching',
    semanticType: 'teaching',
    icon: 'school',
    color: '#0f766e',
    points: draftAreaPoints.value.map((point) => ({ ...point })),
  })
  draftAreaPoints.value = []
  sideTab.value = 'area'
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function finishRoute() {
  if (draftRoutePoints.value.length < 2) {
    ElMessage.warning('路线至少需要 2 个点')
    return
  }
  recordMapHistory()
  routes.value.push({
    id: createId('route'),
    title: `路线 ${routes.value.length + 1}`,
    category: 'walk',
    semanticType: 'service',
    icon: 'route',
    color: '#f97316',
    points: draftRoutePoints.value.map((point) => ({ ...point })),
  })
  draftRoutePoints.value = []
  sideTab.value = 'route'
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function removePoi(id: string) {
  recordMapHistory()
  pois.value = pois.value.filter((item) => item.id !== id)
  if (selectedId.value === id) selectedId.value = ''
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function removeArea(id: string) {
  recordMapHistory()
  areas.value = areas.value.filter((item) => item.id !== id)
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function removeRoute(id: string) {
  recordMapHistory()
  routes.value = routes.value.filter((item) => item.id !== id)
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function removeCalibration(id: string) {
  recordMapHistory()
  calibrationPoints.value = calibrationPoints.value.filter((item) => item.id !== id)
  if (selectedId.value === id) selectedId.value = ''
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function resetDrafts() {
  draftAreaPoints.value = []
  draftRoutePoints.value = []
  selectedId.value = ''
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function clearDraftArea() {
  if (!draftAreaPoints.value.length) return
  recordMapHistory()
  draftAreaPoints.value = []
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function clearDraftRoute() {
  if (!draftRoutePoints.value.length) return
  recordMapHistory()
  draftRoutePoints.value = []
  if (editorMode.value === 'amap') refreshAmapOverlays()
}

function toMapCoordinate(point: RatioPoint) {
  const width = Math.max(Number(form.mapWidth) || 1200, 100)
  const height = Math.max(Number(form.mapHeight) || 800, 100)
  return [
    Number((clampRatio(point.xRatio) * width).toFixed(2)),
    Number(((1 - clampRatio(point.yRatio)) * height).toFixed(2)),
  ]
}

function toRatioPoint(coordinate: number[]) {
  const width = Math.max(Number(form.mapWidth) || 1200, 100)
  const height = Math.max(Number(form.mapHeight) || 800, 100)
  return {
    xRatio: clampRatio(Number(coordinate?.[0]) / width),
    yRatio: clampRatio(1 - Number(coordinate?.[1]) / height),
  }
}

function buildFeatureCollection(features: any[]) {
  return {
    type: 'FeatureCollection',
    features,
  }
}

function buildPayload() {
  if (editorMode.value === 'amap') return buildAmapPayload()
  const width = Math.max(Number(form.mapWidth) || 1200, 100)
  const height = Math.max(Number(form.mapHeight) || 800, 100)
  const poiFeatures = pois.value.map((poi) => ({
    type: 'Feature',
    properties: {
      id: poi.id,
      title: poi.title || '点位',
      category: poi.category || 'building',
      semanticType: poi.semanticType || semanticMeta(poi).type,
      icon: poi.icon || semanticMeta(poi).icon,
      color: poi.color || semanticMeta(poi).color,
      sourceLayer: poi.sourceLayer || undefined,
      Text: poi.title || '点位',
      ...pickCampusProjectMetadata(poi),
    },
    geometry: {
      type: 'Point',
      coordinates: toMapCoordinate(poi),
    },
  }))
  const areaFeatures = areas.value
    .filter((area) => area.points.length >= 3)
    .map((area) => {
      const ring = area.points.map(toMapCoordinate)
      ring.push([...ring[0]])
      return {
        type: 'Feature',
        properties: {
          id: area.id,
          title: area.title || '区域',
          category: area.category || 'teaching',
          semanticType: area.semanticType || semanticMeta(area).type,
          icon: area.icon || semanticMeta(area).icon,
          color: area.color || semanticMeta(area).color,
          sourceLayer: area.sourceLayer || undefined,
          ...pickCampusProjectMetadata(area),
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      }
    })
  const routeFeatures = routes.value
    .filter((route) => route.points.length >= 2)
    .map((route) => ({
      type: 'Feature',
      properties: {
        id: route.id,
        title: route.title || '路线',
        category: route.category || 'walk',
        semanticType: route.semanticType || 'service',
        icon: route.icon || 'route',
        color: route.color || '#f97316',
        sourceLayer: route.sourceLayer || undefined,
      },
      geometry: {
        type: 'LineString',
        coordinates: route.points.map(toMapCoordinate),
      },
    }))
  const publishedCalibrationPoints = calibrationPoints.value
    .map((point, index) => {
      const [mapX, mapY] = toMapCoordinate(point)
      return {
        id: point.id || `calibration_${index + 1}`,
        title: point.title || `校准点 ${index + 1}`,
        longitude: Number(point.longitude),
        latitude: Number(point.latitude),
        mapX,
        mapY,
      }
    })
    .filter((point) => [point.longitude, point.latitude, point.mapX, point.mapY].every((num) => Number.isFinite(num)) && point.longitude !== 0 && point.latitude !== 0)

  return {
    schemaVersion: 1,
    enabled: form.enabled,
    title: form.title || '校园地图',
    mapId: form.mapId || `campus-map-${currentRegionId() || 'region'}`,
    version: form.version || new Date().toISOString().slice(0, 10),
    coordinateSystem: hasVectorBaseMap.value
      ? {
          ...(vectorCoordinateSystem.value || {}),
          type: 'cad-vector',
          unit: vectorCoordinateSystem.value?.unit || 'meter',
          renderUnit: 'pixel',
        }
      : {
          type: 'image',
          unit: 'pixel',
          origin: 'top-left',
        },
    imageMap: {
      imageUrl: form.imageUrl,
      width,
      height,
      opacity: form.opacity,
    },
    positioning: {
      enabled: publishedCalibrationPoints.length >= 2,
      coordinateType: 'gcj02',
      permissionPurpose: '用于在校园地图中显示你所在的位置，并计算到目标地点的距离',
      calibrationPoints: publishedCalibrationPoints,
    },
    bbox: [0, 0, width, height],
    renderBBox: [0, 0, width, height],
    layers: [
      {
        id: 'operator_areas',
        role: 'area',
        title: '运营绘制区域',
        load: 'inline',
        inlineData: buildFeatureCollection(areaFeatures),
        style: { stroke: '#2563eb', fill: 'rgba(37, 99, 235, 0.14)', width: 1.4 },
      },
      {
        id: 'operator_routes',
        role: 'road',
        title: '运营绘制路线',
        load: 'inline',
        inlineData: buildFeatureCollection(routeFeatures),
        style: { stroke: '#f97316', fill: '', width: 2.4 },
      },
      {
        id: 'operator_pois',
        role: 'poi',
        title: '运营绘制点位',
        load: 'inline',
        inlineData: buildFeatureCollection(poiFeatures),
        style: { stroke: '#2563eb', fill: '#2563eb', width: 1, pointRadius: 5, showLabel: true },
      },
    ],
    recommendedInitialLayers: ['operator_areas', 'operator_routes', 'operator_pois'],
    poiCandidateLayers: ['operator_pois'],
  }
}

function standardizeAmapFeature(kind: 'poi' | 'area' | 'route', item: PoiItem | AreaItem | RouteItem) {
  const properties = {
    id: item.id,
    title: item.title || (kind === 'poi' ? '点位' : kind === 'area' ? '区域' : '路线'),
      category: item.category || (kind === 'poi' ? 'building' : kind === 'area' ? 'teaching' : 'walk'),
      semanticType: (item as any).semanticType || semanticMeta(item).type,
      icon: (item as any).icon || semanticMeta(item).icon,
      color: (item as any).color || semanticMeta(item).color,
      sourceLayer: (item as any).sourceLayer || undefined,
      provider: 'amap',
      ...pickCampusProjectMetadata(item),
    coordinateType: 'gcj02',
    Text: item.title || '',
  }

  if (kind === 'poi') {
    const poi = item as PoiItem
    if (!hasLngLat(poi)) return null
    return {
      type: 'Feature',
      properties,
      geometry: {
        type: 'Point',
        coordinates: [Number(poi.longitude), Number(poi.latitude)],
      },
    }
  }

  const points = toAmapPath((item as AreaItem).points)
  if (kind === 'area') {
    if (points.length < 3) return null
    const ring = points.map((point) => [...point])
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      ring.push([...first])
    }
    return {
      type: 'Feature',
      properties,
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    }
  }

  if (points.length < 2) return null
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'LineString',
      coordinates: points,
    },
  }
}

function collectAmapBounds() {
  const coordinates: number[][] = []
  pois.value.forEach((poi) => {
    if (hasLngLat(poi)) coordinates.push([Number(poi.longitude), Number(poi.latitude)])
  })
  areas.value.forEach((area) => coordinates.push(...toAmapPath(area.points)))
  routes.value.forEach((route) => coordinates.push(...toAmapPath(route.points)))
  if (!coordinates.length) {
    const center = getAmapCenter()
    coordinates.push([center.lng, center.lat])
  }
  const lngs = coordinates.map((point) => point[0])
  const lats = coordinates.map((point) => point[1])
  return [
    roundLngLat(Math.min(...lngs)),
    roundLngLat(Math.min(...lats)),
    roundLngLat(Math.max(...lngs)),
    roundLngLat(Math.max(...lats)),
  ]
}

function buildAmapPayload() {
  const poiFeatures = pois.value
    .map((poi) => standardizeAmapFeature('poi', poi))
    .filter(Boolean)
  const areaFeatures = areas.value
    .map((area) => standardizeAmapFeature('area', area))
    .filter(Boolean)
  const routeFeatures = routes.value
    .map((route) => standardizeAmapFeature('route', route))
    .filter(Boolean)
  const bounds = collectAmapBounds()
  const center = getAmapCenter()
  const publishedCalibrationPoints = calibrationPoints.value
    .map((point, index) => {
      const [mapX, mapY] = toMapCoordinate(point)
      return {
        id: point.id || `calibration_${index + 1}`,
        title: point.title || `校准点 ${index + 1}`,
        longitude: Number(point.longitude),
        latitude: Number(point.latitude),
        mapX,
        mapY,
      }
    })
    .filter((point) => [point.longitude, point.latitude, point.mapX, point.mapY].every((num) => Number.isFinite(num)) && point.longitude !== 0 && point.latitude !== 0)

  return {
    schemaVersion: 1,
    enabled: form.enabled,
    title: form.title || '校园地图',
    mapId: form.mapId || `campus-map-${currentRegionId() || 'region'}`,
    version: form.version || new Date().toISOString().slice(0, 10),
    coordinateSystem: {
      type: 'amap',
      source: 'gcj02',
      unit: 'degree',
    },
    amap: {
      enabled: true,
      provider: 'amap',
      coordinateType: 'gcj02',
      center: [roundLngLat(center.lng), roundLngLat(center.lat)],
      zoom: Number(amapMap?.getZoom?.() || amapDefaults.zoom || 16),
      city: amapDefaults.city || '全国',
      bounds,
    },
    positioning: {
      enabled: true,
      coordinateType: 'gcj02',
      projection: 'amap-gcj02',
      permissionPurpose: '用于在校园地图中显示你所在的位置，并计算到目标地点的距离',
      calibrationPoints: publishedCalibrationPoints,
    },
    bbox: bounds,
    renderBBox: bounds,
    layers: [
      {
        id: 'operator_areas',
        role: 'area',
        title: '运营绘制区域',
        load: 'inline',
        inlineData: buildFeatureCollection(areaFeatures),
        style: { stroke: '#2563eb', fill: 'rgba(37, 99, 235, 0.14)', width: 1.4 },
        featureCount: areaFeatures.length,
      },
      {
        id: 'operator_routes',
        role: 'road',
        title: '运营绘制路线',
        load: 'inline',
        inlineData: buildFeatureCollection(routeFeatures),
        style: { stroke: '#f97316', fill: '', width: 2.4 },
        featureCount: routeFeatures.length,
      },
      {
        id: 'operator_pois',
        role: 'poi',
        title: '运营绘制点位',
        load: 'inline',
        inlineData: buildFeatureCollection(poiFeatures),
        style: { stroke: '#2563eb', fill: '#2563eb', width: 1, pointRadius: 5, showLabel: true },
        featureCount: poiFeatures.length,
      },
    ],
    recommendedInitialLayers: ['operator_areas', 'operator_routes', 'operator_pois'],
    poiCandidateLayers: ['operator_pois'],
  }
}

function percentFromBounds(longitude: number, latitude: number, bounds: number[]) {
  const lngSpan = Math.max(0.000001, bounds[2] - bounds[0])
  const latSpan = Math.max(0.000001, bounds[3] - bounds[1])
  return {
    x: Math.max(0, Math.min(100, ((longitude - bounds[0]) / lngSpan) * 100)),
    y: Math.max(0, Math.min(100, (1 - (latitude - bounds[1]) / latSpan) * 100)),
  }
}

function previewPoint(point: RatioPoint, bounds: number[]) {
  if (editorMode.value === 'amap' && hasLngLat(point)) {
    return percentFromBounds(Number(point.longitude), Number(point.latitude), bounds)
  }
  return {
    x: clampRatio(point.xRatio) * 100,
    y: clampRatio(point.yRatio) * 100,
  }
}

function previewSvgPoints(points: RatioPoint[], bounds: number[]) {
  return points
    .map((point) => previewPoint(point, bounds))
    .map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
    .join(' ')
}

function buildMiniProgramPreview() {
  const bounds = editorMode.value === 'amap' ? collectAmapBounds() : [0, 0, 1, 1]
  return {
    markers: pois.value
      .filter((poi) => editorMode.value !== 'amap' || hasLngLat(poi))
      .slice(0, 24)
      .map((poi) => ({
        id: poi.id,
        title: String(poi.title || '点位').slice(0, 6),
        color: poi.color || semanticMeta(poi).color,
        ...previewPoint(poi, bounds),
      })),
    polygons: areas.value
      .filter((area) => area.points.length >= 3)
      .slice(0, 12)
      .map((area) => ({
        id: area.id,
        points: previewSvgPoints(area.points, bounds),
      })),
    polylines: routes.value
      .filter((route) => route.points.length >= 2)
      .slice(0, 12)
      .map((route) => ({
        id: route.id,
        points: previewSvgPoints(route.points, bounds),
      })),
  }
}

async function validateBeforePublish() {
  if (form.enabled === false) return true
  const readiness = publishReadiness.value
  if (readiness.errors.length) {
    ElMessage.error(readiness.errors.map((item) => item.message).join('；'))
    return false
  }
  if (readiness.warnings.length) {
    try {
      await ElMessageBox.confirm(
        readiness.warnings.map((item) => item.message).join('；'),
        '发布前还有建议优化项',
        {
          confirmButtonText: '继续发布',
          cancelButtonText: '返回修改',
          type: 'warning',
        },
      )
      return true
    } catch {
      return false
    }
  }
  return true
}

async function loadMap() {
  if (!currentRegionId()) return
  loading.value = true
  try {
    const config: any = await fetchRegionCampusMap(currentRegionId())
    applyMapConfig(config?.data || config)
  } catch (error: any) {
    ElMessage.error(error?.message || '校园地图加载失败')
  } finally {
    loading.value = false
  }
}

async function saveDraft(options: { silent?: boolean } = {}) {
  if (!currentRegionId()) {
    ElMessage.warning('请先选择区域')
    return null
  }
  draftSaving.value = true
  try {
    const result: any = await saveRegionCampusMapDraft(
      currentRegionId(),
      buildPayload(),
      workflow.draftRevision,
    )
    const config = result?.data || result || {}
    applyWorkflow(config.workflow)
    hasUnsavedChanges.value = false
    if (!options.silent) ElMessage.success('校园地图草稿已保存，尚未发布到小程序')
    return config
  } catch (error: any) {
    ElMessage.error(error?.message || '校园地图草稿保存失败')
    return null
  } finally {
    draftSaving.value = false
  }
}

async function publishMap() {
  if (!currentRegionId()) {
    ElMessage.warning('请先选择区域')
    return
  }
  if (form.enabled && editorMode.value === 'image' && !hasVisualBaseMap.value) {
    ElMessage.warning('请先上传校园底图或导入 CAD 图纸')
    return
  }
  if (!(await validateBeforePublish())) return
  saving.value = true
  try {
    const draft = await saveDraft({ silent: true })
    if (!draft) return
    const revision = Number(draft.workflow?.draftRevision || workflow.draftRevision)
    const result: any = await publishRegionCampusMapDraft(currentRegionId(), revision)
    const config = result?.data || result || {}
    applyWorkflow(config.workflow)
    hasUnsavedChanges.value = false
    ElMessage.success('校园地图已发布')
  } catch (error: any) {
    ElMessage.error(error?.message || '校园地图发布失败')
  } finally {
    saving.value = false
  }
}

async function disableMap() {
  if (!currentRegionId()) {
    ElMessage.warning('请先选择区域')
    return
  }
  try {
    await ElMessageBox.confirm('停用后优先使用全局已发布地图；没有全局地图时小程序显示“暂未开通”。确定停用吗？', '停用校园地图', {
      confirmButtonText: '停用',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  disabling.value = true
  try {
    const result: any = await disableRegionCampusMap(currentRegionId())
    applyMapConfig(result?.data || result)
    ElMessage.success('校园地图已停用')
  } catch (error: any) {
    ElMessage.error(error?.message || '校园地图停用失败')
  } finally {
    disabling.value = false
  }
}

function applyMapConfig(config: any = {}) {
  historyLocked.value = true
  undoStack.value = []
  redoStack.value = []
  applyWorkflow(config.workflow)
  const imageMap = config.imageMap || {}
  const isAmapConfig = String(config.coordinateSystem?.type || '').toLowerCase() === 'amap' || config.amap?.provider === 'amap'
  const amapConfig = config.amap || {}
  if (Array.isArray(amapConfig.center) && amapConfig.center.length >= 2) {
    const [lng, lat] = amapConfig.center.map((item: any) => Number(item))
    if (Number.isFinite(lng) && Number.isFinite(lat)) updateAmapDefaults(lng, lat, Number(amapConfig.zoom || amapDefaults.zoom))
  }
  if (amapConfig.city) amapDefaults.city = String(amapConfig.city)

  editorMode.value = isAmapConfig ? 'amap' : 'image'
  form.enabled = config.enabled !== false
  form.title = config.title || '校园地图'
  form.mapId = config.mapId || `campus-map-${currentRegionId() || 'region'}`
  form.version = config.version || ''
  form.imageUrl = imageMap.imageUrl || imageMap.url || ''
  form.mapWidth = Number(imageMap.width || config.renderBBox?.[2] || config.bbox?.[2] || 1200)
  form.mapHeight = Number(imageMap.height || config.renderBBox?.[3] || config.bbox?.[3] || 800)
  form.opacity = Number(imageMap.opacity || 1)
  const layers = Array.isArray(config.layers) ? config.layers : []
  const hasLayerFeatures = layers.some((layer: any) => getLayerFeatures(layer).length > 0)
  const coordinateType = String(config.coordinateSystem?.type || '').toLowerCase()
  hasVectorBaseMap.value = !isAmapConfig && !form.imageUrl && (coordinateType === 'cad-vector' || hasLayerFeatures)
  vectorCoordinateSystem.value = hasVectorBaseMap.value ? (config.coordinateSystem || { type: 'cad-vector' }) : null
  pois.value = isAmapConfig
    ? parseAmapPoiLayer(layers.find((layer: any) => layer.id === 'operator_pois'))
    : parsePoiLayer(layers.find((layer: any) => layer.id === 'operator_pois'))
  areas.value = isAmapConfig
    ? parseAmapAreaLayer(layers.find((layer: any) => layer.id === 'operator_areas'))
    : parseAreaLayer(layers.find((layer: any) => layer.id === 'operator_areas'))
  routes.value = isAmapConfig
    ? parseAmapRouteLayer(layers.find((layer: any) => layer.id === 'operator_routes'))
    : parseRouteLayer(layers.find((layer: any) => layer.id === 'operator_routes'))
  calibrationPoints.value = parseCalibrationPoints(config.positioning)
  if (isAmapConfig) {
    nextTick(() => initAmapWorkbench())
  }
  nextTick(() => {
    historyLocked.value = false
    hasUnsavedChanges.value = false
  })
}

function applyWorkflow(value: any = {}) {
  workflow.draftRevision = Number(value.draftRevision || 0)
  workflow.activeVersion = Number(value.activeVersion || 0)
  workflow.activeVersionId = String(value.activeVersionId || '')
}

async function handleVersionRestored() {
  versionDrawerVisible.value = false
  await loadMap()
}

function getLayerFeatures(layer: any) {
  const data = layer?.inlineData || layer?.data || {}
  return Array.isArray(data.features) ? data.features : []
}

function parsePoiLayer(layer: any): PoiItem[] {
  return getLayerFeatures(layer)
    .filter((feature: any) => feature?.geometry?.type === 'Point')
    .map((feature: any, index: number) => {
      const properties = feature.properties || {}
      return applySemanticFields({
        id: String(properties.id || createId('poi')),
        title: String(properties.title || properties.Text || `点位 ${index + 1}`),
        category: String(properties.category || 'building'),
        semanticType: String(properties.semanticType || properties.category || 'building'),
        icon: String(properties.icon || ''),
        color: String(properties.color || ''),
        sourceLayer: String(properties.sourceLayer || ''),
        ...toRatioPoint(feature.geometry.coordinates || [0, 0]),
        ...pickCampusProjectMetadata(properties),
      }, properties.semanticType || properties.category) as PoiItem
    })
}

function parseAmapCoordinate(coordinate: any): RatioPoint | null {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null
  const lng = Number(coordinate[0])
  const lat = Number(coordinate[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return toAmapPoint(lng, lat)
}

function parseAmapPoiLayer(layer: any): PoiItem[] {
  return getLayerFeatures(layer)
    .filter((feature: any) => feature?.geometry?.type === 'Point')
    .map((feature: any, index: number) => {
      const point = parseAmapCoordinate(feature.geometry.coordinates)
      if (!point) return null
      const properties = feature.properties || {}
      return applySemanticFields({
        id: String(properties.id || createId('poi')),
        title: String(properties.title || properties.Text || `点位 ${index + 1}`),
        category: String(properties.category || 'building'),
        semanticType: String(properties.semanticType || properties.category || 'building'),
        icon: String(properties.icon || ''),
        color: String(properties.color || ''),
        sourceLayer: String(properties.sourceLayer || ''),
        ...point,
        ...pickCampusProjectMetadata(properties),
      }, properties.semanticType || properties.category) as PoiItem
    })
    .filter(Boolean) as PoiItem[]
}

function parseAreaLayer(layer: any): AreaItem[] {
  return getLayerFeatures(layer)
    .filter((feature: any) => feature?.geometry?.type === 'Polygon')
    .map((feature: any, index: number) => {
      const properties = feature.properties || {}
      const ring = feature.geometry.coordinates?.[0] || []
      const points = ring.slice(0, -1).map(toRatioPoint)
      return applySemanticFields({
        id: String(properties.id || createId('area')),
        title: String(properties.title || `区域 ${index + 1}`),
        category: String(properties.category || 'teaching'),
        semanticType: String(properties.semanticType || properties.category || 'teaching'),
        icon: String(properties.icon || ''),
        color: String(properties.color || ''),
        sourceLayer: String(properties.sourceLayer || ''),
        points,
        ...pickCampusProjectMetadata(properties),
      }, properties.semanticType || properties.category) as AreaItem
    })
}

function parseAmapAreaLayer(layer: any): AreaItem[] {
  return getLayerFeatures(layer)
    .filter((feature: any) => feature?.geometry?.type === 'Polygon')
    .map((feature: any, index: number) => {
      const properties = feature.properties || {}
      const ring = Array.isArray(feature.geometry.coordinates?.[0]) ? feature.geometry.coordinates[0] : []
      const points = ring
        .slice(0, -1)
        .map(parseAmapCoordinate)
        .filter(Boolean) as RatioPoint[]
      return applySemanticFields({
        id: String(properties.id || createId('area')),
        title: String(properties.title || `区域 ${index + 1}`),
        category: String(properties.category || 'teaching'),
        semanticType: String(properties.semanticType || properties.category || 'teaching'),
        icon: String(properties.icon || ''),
        color: String(properties.color || ''),
        sourceLayer: String(properties.sourceLayer || ''),
        points,
        ...pickCampusProjectMetadata(properties),
      }, properties.semanticType || properties.category) as AreaItem
    })
    .filter((area: AreaItem) => area.points.length >= 3)
}

function parseRouteLayer(layer: any): RouteItem[] {
  return getLayerFeatures(layer)
    .filter((feature: any) => feature?.geometry?.type === 'LineString')
    .map((feature: any, index: number) => {
      const properties = feature.properties || {}
      const points = (feature.geometry.coordinates || []).map(toRatioPoint)
      return {
        id: String(properties.id || createId('route')),
        title: String(properties.title || `路线 ${index + 1}`),
        category: String(properties.category || 'walk'),
        semanticType: String(properties.semanticType || 'service'),
        icon: String(properties.icon || 'route'),
        color: String(properties.color || '#f97316'),
        sourceLayer: String(properties.sourceLayer || ''),
        points,
      }
    })
}

function parseAmapRouteLayer(layer: any): RouteItem[] {
  return getLayerFeatures(layer)
    .filter((feature: any) => feature?.geometry?.type === 'LineString')
    .map((feature: any, index: number) => {
      const properties = feature.properties || {}
      const points = (feature.geometry.coordinates || [])
        .map(parseAmapCoordinate)
        .filter(Boolean) as RatioPoint[]
      return {
        id: String(properties.id || createId('route')),
        title: String(properties.title || `路线 ${index + 1}`),
        category: String(properties.category || 'walk'),
        semanticType: String(properties.semanticType || 'service'),
        icon: String(properties.icon || 'route'),
        color: String(properties.color || '#f97316'),
        sourceLayer: String(properties.sourceLayer || ''),
        points,
      }
    })
    .filter((route: RouteItem) => route.points.length >= 2)
}

function parseCalibrationPoints(positioning: any): CalibrationPoint[] {
  const points = Array.isArray(positioning?.calibrationPoints) ? positioning.calibrationPoints : []
  return points
    .map((point: any, index: number) => {
      const ratio = toRatioPoint([Number(point.mapX), Number(point.mapY)])
      return {
        id: String(point.id || createId('calibration')),
        title: String(point.title || point.name || `校准点 ${index + 1}`),
        longitude: Number(point.longitude || point.lng || 0),
        latitude: Number(point.latitude || point.lat || 0),
        ...ratio,
      }
    })
    .filter((point: CalibrationPoint) => Number.isFinite(point.longitude) && Number.isFinite(point.latitude))
}

function syncImageSize(url: string) {
  const image = new Image()
  image.onload = () => {
    if (image.naturalWidth && image.naturalHeight) {
      form.mapWidth = image.naturalWidth
      form.mapHeight = image.naturalHeight
    }
  }
  image.src = url
}
</script>

<style scoped>
.campus-map-painter {
  display: grid;
  gap: 14px;
  width: 100%;
}

.map-action-bar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto auto;
  gap: 14px;
  align-items: center;
  padding: 16px 18px;
  border: 1px solid rgba(203, 213, 225, .9);
  border-radius: 6px;
  background: rgba(255, 255, 255, .92);
  box-shadow: 0 14px 30px rgba(15, 23, 42, .06);
}

.map-title-block {
  min-width: 0;
}

.map-action-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #475569;
  font-size: 12px;
  white-space: nowrap;
}

.map-action-status span {
  border: 1px solid #dbe4f0;
  border-radius: 999px;
  padding: 5px 9px;
  background: #f8fafc;
}

.map-action-status .warning {
  border-color: #fed7aa;
  background: #fff7ed;
  color: #c2410c;
}

.painter-shell {
  padding: 14px;
  border-color: rgba(203, 213, 225, .88);
  background: linear-gradient(180deg, rgba(255, 255, 255, .96), rgba(248, 250, 252, .94));
}

.head-actions,
.map-top-strip,
.toolbar-left,
.toolbar-right,
.inspector-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.map-editor-layout {
  display: grid;
  grid-template-columns: minmax(190px, 220px) minmax(640px, 1fr) minmax(300px, 360px);
  gap: 14px;
  min-height: 700px;
}

.map-workbench {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

.map-top-strip {
  justify-content: space-between;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.category-select {
  width: 128px;
}

.amap-workbench {
  display: grid;
  gap: 10px;
  min-height: 0;
}

.amap-search-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
}

.amap-search-results {
  display: grid;
  gap: 6px;
  max-height: 150px;
  overflow: auto;
  padding: 6px;
  border: 1px solid #d8e2f0;
  border-radius: 6px;
  background: #fff;
}

.amap-search-item {
  display: grid;
  gap: 3px;
  width: 100%;
  border: 0;
  border-radius: 6px;
  padding: 8px 10px;
  background: transparent;
  color: #1f2937;
  text-align: left;
  cursor: pointer;
}

.amap-search-item:hover {
  background: #f3f7ff;
}

.amap-search-item span {
  font-size: 13px;
  font-weight: 700;
}

.amap-search-item small {
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amap-stage {
  position: relative;
  min-height: 620px;
  overflow: hidden;
  border: 1px solid #d8e1ee;
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(148, 163, 184, .1) 1px, transparent 1px),
    linear-gradient(rgba(148, 163, 184, .1) 1px, transparent 1px),
    #eef4ff;
  background-size: 28px 28px;
}

.amap-drawing-map {
  width: 100%;
  height: clamp(620px, calc(100vh - 300px), 860px);
}

.amap-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, .68);
  color: #1e40af;
  font-weight: 700;
}

.amap-empty-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 24px;
  background:
    linear-gradient(90deg, rgba(148, 163, 184, .13) 1px, transparent 1px),
    linear-gradient(rgba(148, 163, 184, .13) 1px, transparent 1px),
    #eef4ff;
  background-size: 32px 32px;
  color: #475569;
  text-align: center;
}

.amap-empty-state .el-icon {
  color: #2563eb;
  font-size: 34px;
}

.amap-empty-state strong {
  color: #0f172a;
  font-size: 15px;
}

.map-status-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.image-inline-tools {
  max-width: 340px;
}

:global(.amap-poi-label) {
  max-width: 140px;
  overflow: hidden;
  border: 1px solid rgba(37, 99, 235, .2);
  border-radius: 6px;
  padding: 4px 7px;
  background: rgba(255, 255, 255, .94);
  color: #1e40af;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-shadow: 0 8px 18px rgba(15, 23, 42, .12);
}

:global(.amap-calibration-marker) {
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #0d9488;
  box-shadow: 0 2px 8px rgba(15, 23, 42, .35);
}

.campus-map-canvas {
  position: relative;
  width: 100%;
  min-height: 620px;
  max-height: 860px;
  overflow: hidden;
  border: 1px solid #d8e1ee;
  border-radius: 6px;
  background-color: #f8fafc;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .72);
  cursor: crosshair;
}

.campus-map-canvas.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 660px;
  padding: 20px;
}

.canvas-empty {
  width: min(520px, 92%);
}

.campus-map-start {
  display: grid;
  grid-template-columns: repeat(2, minmax(260px, 1fr));
  align-content: center;
  gap: 18px;
  min-height: 620px;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  padding: 24px;
  background: #f8fafc;
}

.start-card {
  min-height: 156px;
  border: 1px solid #dbe4f0;
  border-radius: 6px;
  background: #fff;
}

.start-card.primary {
  display: grid;
  place-items: center;
  gap: 8px;
  padding: 22px;
  color: #1d4ed8;
  cursor: pointer;
}

.start-card.primary .el-icon {
  font-size: 30px;
}

.start-card.primary strong {
  color: #0f172a;
  font-size: 18px;
}

.start-card.primary span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.upload-card {
  display: grid;
  place-items: center;
  padding: 16px;
}

.drawing-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.drawn-area {
  fill: rgba(37, 99, 235, .14);
  stroke: #2563eb;
  stroke-width: .42;
}

.draft-area {
  fill: rgba(20, 184, 166, .14);
  stroke: #0f766e;
  stroke-dasharray: 1.4 1.2;
  stroke-width: .42;
}

.drawn-route,
.draft-route {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: .58;
}

.drawn-route {
  stroke: #f97316;
}

.draft-route {
  stroke: #0f766e;
  stroke-dasharray: 1.4 1.2;
}

.map-marker {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 132px;
  transform: translate(-50%, -100%);
  border: 1px solid rgba(37, 99, 235, .24);
  border-radius: 6px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, .94);
  color: #1e40af;
  font-size: 12px;
  font-weight: 650;
  box-shadow: 0 8px 18px rgba(15, 23, 42, .12);
  cursor: pointer;
}

.map-marker span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-marker.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .16), 0 8px 18px rgba(15, 23, 42, .12);
}

.calibration-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  border: 2px solid #fff;
  border-radius: 999px;
  padding: 4px 8px;
  background: #111827;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(15, 23, 42, .18);
  cursor: pointer;
}

.draft-node {
  position: absolute;
  width: 9px;
  height: 9px;
  transform: translate(-50%, -50%);
  border: 2px solid #fff;
  border-radius: 999px;
  background: #0f766e;
  box-shadow: 0 2px 8px rgba(15, 23, 42, .2);
  pointer-events: none;
}

.draft-node.route {
  background: #f97316;
}

.map-inspector {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
}

.inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 56px;
  padding: 12px 14px;
  border-bottom: 1px solid #e2e8f0;
}

.inspector-head div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.inspector-head strong {
  color: #0f172a;
  font-size: 14px;
}

.inspector-head span {
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-editor,
.empty-inspector {
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.quality-panel,
.mini-preview-panel {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.drawer-panel {
  margin-bottom: 0;
}

.panel-title {
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
}

.quality-summary {
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 12px;
  font-weight: 700;
}

.quality-summary.ready {
  background: #ecfdf5;
  color: #047857;
}

.quality-list {
  display: grid;
  gap: 8px;
}

.quality-item {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
}

.quality-item span {
  color: #0f172a;
  font-size: 12px;
  font-weight: 800;
}

.quality-item small {
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}

.quality-item.pass {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.quality-item.warning {
  border-color: #fed7aa;
  background: #fff7ed;
}

.quality-item.error {
  border-color: #fecaca;
  background: #fef2f2;
}

.mini-preview-map {
  position: relative;
  height: 220px;
  overflow: hidden;
  border: 1px solid #dbe4f0;
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(148, 163, 184, .14) 1px, transparent 1px),
    linear-gradient(rgba(148, 163, 184, .14) 1px, transparent 1px),
    #f8fafc;
  background-size: 28px 28px;
}

.mini-preview-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.mini-preview-area {
  fill: rgba(37, 99, 235, .14);
  stroke: #2563eb;
  stroke-width: .5;
}

.mini-preview-route {
  fill: none;
  stroke: #f97316;
  stroke-linecap: round;
  stroke-width: .7;
}

.mini-preview-marker,
.mini-preview-user {
  position: absolute;
  transform: translate(-50%, -100%);
  max-width: 72px;
  overflow: hidden;
  border-radius: 6px;
  padding: 3px 6px;
  background: #2563eb;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-shadow: 0 8px 18px rgba(15, 23, 42, .14);
}

.mini-preview-user {
  left: 50%;
  top: 54%;
  background: #ef4444;
}

.calibration-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.calibration-grid :deep(.el-input-number) {
  width: 100%;
}

.coordinate-line {
  margin: 4px 0 12px;
  padding: 9px 10px;
  border-radius: 6px;
  background: #f8fafc;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.assistant-score-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 0 10px;
  background: #eff6ff;
  color: #1d4ed8;
  cursor: pointer;
}

.assistant-score-pill strong {
  font-size: 13px;
}

.assistant-score-pill span {
  max-width: 92px;
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assistant-panel {
  display: grid;
  gap: 16px;
}

.assistant-hero {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  padding: 14px;
  border: 1px solid #dbe4f0;
  border-radius: 6px;
  background: #f8fafc;
}

.assistant-hero.good {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.assistant-hero.medium {
  border-color: #fed7aa;
  background: #fff7ed;
}

.assistant-hero.low {
  border-color: #fecaca;
  background: #fef2f2;
}

.assistant-score-ring {
  display: grid;
  place-items: center;
  width: 70px;
  height: 70px;
  border: 6px solid #2563eb;
  border-radius: 50%;
  background: #fff;
  color: #0f172a;
  font-size: 18px;
  font-weight: 900;
}

.assistant-hero-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.assistant-hero-copy strong {
  color: #0f172a;
  font-size: 17px;
}

.assistant-hero-copy span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.assistant-next-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid #dbe4f0;
  border-radius: 6px;
  background: #fff;
}

.assistant-next-card > div {
  display: grid;
  gap: 3px;
}

.assistant-next-card span,
.assistant-section-title {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.assistant-next-card strong {
  color: #0f172a;
  font-size: 14px;
}

.assistant-section {
  display: grid;
  gap: 10px;
}

.assistant-step-list {
  display: grid;
  gap: 8px;
}

.assistant-step {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.assistant-step > span {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #475569;
  font-size: 12px;
  font-weight: 900;
}

.assistant-step.pass {
  border-color: #bbf7d0;
}

.assistant-step.pass > span {
  background: #dcfce7;
  color: #047857;
}

.assistant-step.warning {
  border-color: #fed7aa;
}

.assistant-step.warning > span {
  background: #ffedd5;
  color: #c2410c;
}

.assistant-step.error {
  border-color: #fecaca;
}

.assistant-step.error > span {
  background: #fee2e2;
  color: #dc2626;
}

.assistant-step div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.assistant-step strong {
  color: #0f172a;
  font-size: 13px;
}

.assistant-step small {
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}

.key-place-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.key-place-chip {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px;
  background: #fff;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
}

.key-place-chip.done {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.key-place-chip i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.key-place-chip span,
.key-place-chip small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.key-place-chip span {
  font-size: 12px;
  font-weight: 900;
}

.key-place-chip small {
  grid-column: 2;
  color: #64748b;
  font-size: 11px;
}

.assistant-warning-list {
  display: grid;
  gap: 6px;
}

.assistant-warning-list div,
.assistant-clear-state {
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 12px;
  line-height: 1.45;
}

.assistant-clear-state {
  background: #f0fdf4;
  color: #047857;
}

.semantic-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.semantic-option i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.import-panel {
  display: grid;
  gap: 16px;
}

.import-panel :deep(.el-upload-dragger) {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 180px;
  border-radius: 6px;
  background: #f8fbff;
}

.upload-icon {
  color: #2563eb;
  font-size: 30px;
}

.upload-title {
  color: #0f172a;
  font-size: 15px;
  font-weight: 900;
}

.upload-tip {
  max-width: 360px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.import-job-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #dbe4f0;
  border-radius: 6px;
  background: #fff;
}

.import-job-card.draft_ready {
  border-color: #bbf7d0;
  background: #f8fffb;
}

.import-job-card.failed,
.import-job-card.needs_converter {
  border-color: #fed7aa;
  background: #fffaf4;
}

.import-job-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.import-job-head > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.import-job-head strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-job-head span,
.import-summary,
.import-warnings {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.import-warnings {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff7ed;
  color: #c2410c;
}

.import-layer-list {
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.import-layer-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) 72px 66px;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid #edf2f7;
  color: #475569;
  font-size: 12px;
}

.import-layer-row:first-child {
  border-top: 0;
}

.import-layer-row.head {
  background: #f8fafc;
  color: #0f172a;
  font-weight: 900;
}

.import-layer-row span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.import-history {
  display: grid;
  gap: 8px;
}

.history-title {
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
}

.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 9px 10px;
  background: #fff;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
}

.history-row span {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-row small {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 12px;
}

.layer-summary {
  display: grid;
  gap: 8px;
  max-height: calc(100vh - 330px);
  overflow: auto;
}

.layer-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 9px;
  background: #fff;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
}

.layer-row:hover {
  border-color: #2563eb;
  background: #f8fbff;
}

.layer-row span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
  font-weight: 800;
}

.layer-row strong {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 160px;
  color: #64748b;
  text-align: center;
}

.empty-state .el-icon {
  color: #2563eb;
  font-size: 28px;
}

.form-grid.compact {
  gap: 10px;
}

.advanced-form :deep(.el-input-number),
.inspector-editor :deep(.el-input-number),
.inspector-editor :deep(.el-select) {
  width: 100%;
}

@media (max-width: 1280px) {
  .map-action-bar {
    grid-template-columns: 1fr;
  }

  .map-action-status {
    flex-wrap: wrap;
  }
}

@media (max-width: 1180px) {
  .map-editor-layout {
    grid-template-columns: 1fr;
    min-height: 0;
    gap: 12px;
  }

  .map-inspector {
    grid-template-columns: 1fr;
  }

  .layer-summary {
    max-height: 260px;
  }
}

@media (max-width: 720px) {
  .map-action-bar,
  .painter-shell {
    padding: 12px;
  }
  .amap-search-bar,
  .calibration-grid {
    grid-template-columns: 1fr;
  }

  .key-place-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .amap-stage,
  .campus-map-canvas,
  .campus-map-canvas.empty,
  .campus-map-start {
    min-height: 460px;
  }

  .campus-map-start {
    grid-template-columns: 1fr;
  }

  .amap-drawing-map {
    height: 460px;
  }
}
</style>
