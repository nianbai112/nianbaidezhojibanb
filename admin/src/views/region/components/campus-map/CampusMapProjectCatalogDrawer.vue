<template>
  <el-drawer
    :model-value="modelValue"
    :title="`${regionName || '当前学校'} · 地点档案`"
    size="min(460px, 92vw)"
    :modal="false"
    append-to-body
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="catalog-drawer" v-loading="loading">
      <el-alert
        type="info"
        :closable="false"
        title="图上直接绑定"
        description="返回地图工作台，点击蓝色点位或建筑透明命中面，再在右侧选择地点档案。绑定使用稳定 placeId，不需要手工填图形 ID。"
        show-icon
      />
      <div class="catalog-toolbar">
        <div class="catalog-toolbar-left">
          <el-input
            v-model="searchText"
            placeholder="搜索编号或名称"
            clearable
            style="width: 200px"
          />
          <el-select v-model="filterStatus" placeholder="建设状态" clearable style="width: 130px">
            <el-option label="已建" value="built" />
            <el-option label="在建" value="under_construction" />
            <el-option label="改造中" value="renovating" />
            <el-option label="未建" value="planned" />
          </el-select>
        </div>
        <div>
          <el-button @click="loadCatalog">刷新</el-button>
          <el-button type="primary" @click="openForm()">新增建筑</el-button>
        </div>
      </div>

      <div class="catalog-status-legend">
        <span v-for="s in STATUS_LABELS" :key="s.value" class="status-badge" :class="`status-${s.value}`">{{ s.label }}</span>
        <span class="muted">共 {{ filteredProjects.length }} 条</span>
      </div>

      <div class="catalog-list">
        <div
          v-for="project in filteredProjects"
          :key="project.officialNumber"
          class="catalog-row"
          :class="`status-row-${project.constructionStatus}`"
        >
          <div class="catalog-number">#{{ project.officialNumber }}</div>
          <div class="catalog-info">
            <strong>{{ project.officialName }}</strong>
            <span v-if="project.engineeringAlias" class="alias">{{ project.engineeringAlias }}</span>
            <span class="place-id">{{ catalogPlaceId(project, regionId) }}</span>
            <div class="catalog-tags">
              <el-tag size="small" :type="statusTagType(project.constructionStatus)">{{ statusLabel(project.constructionStatus) }}</el-tag>
              <el-tag size="small" :type="publishStatusTagType(project.publishStatus)">{{ publishStatusLabel(project.publishStatus) }}</el-tag>
              <el-tag size="small" type="info">{{ coordinateStatusLabel(project.coordinateStatus) }}</el-tag>
              <el-tag size="small" type="info">{{ semanticLabel(project.semanticType) }}</el-tag>
              <el-tag v-if="publicPlacePhotoUrls(project).length" size="small" type="success">{{ publicPlacePhotoUrls(project).length }} 张公开图片</el-tag>
              <el-tag v-if="featureBindingFor(project)" size="small" type="primary">
                已绑定{{ featureBindingFor(project)?.featureKind === 'area' ? '建筑轮廓' : '蓝色点位' }}
              </el-tag>
              <el-tag v-else size="small" type="danger">未绑定图形</el-tag>
            </div>
          </div>
          <div class="catalog-actions">
            <el-button v-if="featureBindingFor(project)" size="small" text type="primary" @click="$emit('focusPlace', catalogPlaceId(project, regionId))">图上定位</el-button>
            <el-button size="small" @click="openForm(project)">编辑</el-button>
            <el-button
              size="small"
              :type="project.publishStatus === 'hidden' ? 'success' : 'warning'"
              plain
              :loading="projectActionNumber === Number(project.officialNumber)"
              @click="toggleProjectHidden(project)"
            >
              {{ project.publishStatus === 'hidden' ? '取消隐藏' : '隐藏' }}
            </el-button>
            <el-button
              size="small"
              type="danger"
              text
              :loading="projectActionNumber === Number(project.officialNumber)"
              @click="removeProject(project)"
            >
              删除
            </el-button>
          </div>
        </div>
        <el-empty v-if="!filteredProjects.length && !loading" :description="projects.length ? '没有匹配的地点档案' : '当前学校还没有地点档案'">
          <el-button
            v-if="!projects.length && regionId"
            type="primary"
            plain
            :loading="seeding"
            @click="seedCatalog"
          >
            首次初始化官方 1–38 目录
          </el-button>
          <small v-if="!projects.length && regionId" class="seed-help">仅首次初始化使用；已有数据时不会重复写入。</small>
        </el-empty>
      </div>
    </div>

    <!-- 编辑/新增表单 -->
    <el-dialog
      v-model="formVisible"
      :title="editingNumber ? `编辑 #${formData.officialNumber} ${formData.officialName}` : '新增地点档案'"
      width="min(560px, 94vw)"
      append-to-body
    >
      <el-form :model="formData" label-position="top">
        <div class="form-row">
          <el-form-item label="官方编号" required>
            <el-input-number v-model="formData.officialNumber" :min="1" :max="99" :disabled="!!editingNumber" />
          </el-form-item>
          <el-form-item label="正式名称" required style="flex: 1">
            <el-input v-model="formData.officialName" maxlength="30" />
          </el-form-item>
        </div>
        <el-form-item label="工程别名（可选）">
          <el-input v-model="formData.engineeringAlias" maxlength="30" placeholder="CAD 图纸上的名称" />
        </el-form-item>
        <el-form-item label="校内真实地址">
          <el-input v-model="formData.addressDescription" maxlength="120" placeholder="例如：校园北区，学生食堂西侧" />
        </el-form-item>
        <div class="form-row">
          <el-form-item label="建设状态">
            <el-select v-model="formData.constructionStatus">
              <el-option label="已建" value="built" />
              <el-option label="在建" value="under_construction" />
              <el-option label="改造中" value="renovating" />
              <el-option label="未建" value="planned" />
            </el-select>
          </el-form-item>
          <el-form-item label="语义类型">
            <el-select v-model="formData.semanticType">
              <el-option v-for="s in SEMANTIC_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="开放状态">
            <el-select v-model="formData.serviceStatus">
              <el-option label="待确认" value="unknown" />
              <el-option label="已开放" value="open" />
              <el-option label="有限开放" value="limited" />
              <el-option label="未开放" value="unopened" />
              <el-option label="临时关闭" value="temporarily_closed" />
              <el-option label="已关闭" value="closed" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item v-if="formData.serviceStatus !== 'open'" label="用户端不可用说明">
          <el-input
            v-model="formData.unavailableMessage"
            maxlength="120"
            show-word-limit
            placeholder="例如：内部改造中，请从东侧临时入口通行"
          />
          <div class="binding-help">地点不是“已开放”时，这段说明会随下一次地图发布快照展示给用户。</div>
        </el-form-item>
        <div class="form-row">
          <el-form-item label="可见范围">
            <el-select v-model="formData.visibilityScope">
              <el-option label="一期活动" value="phase1_active" />
              <el-option label="一期待审" value="phase1_review" />
              <el-option label="未来参考" value="future_reference" />
            </el-select>
          </el-form-item>
          <el-form-item label="几何状态">
            <el-select v-model="formData.geometryStatus">
              <el-option label="已验证多边形" value="verified_polygon" />
              <el-option label="已验证点位" value="verified_point" />
              <el-option label="仅点位" value="point_only" />
              <el-option label="未匹配" value="unmatched" />
            </el-select>
          </el-form-item>
          <el-form-item label="用户端状态">
            <el-select v-model="formData.publishStatus">
              <el-option label="草稿" value="draft" />
              <el-option label="待复核" value="review" />
              <el-option label="已发布" value="published" />
              <el-option label="已隐藏" value="hidden" />
            </el-select>
          </el-form-item>
        </div>
        <el-alert
          type="warning"
          :closable="false"
          title="只有“已发布”的地点会进入下一次地图发布快照"
          description="保存地点档案不会立即影响用户端，仍需回到地图工作台预览并执行发布。"
          show-icon
          class="publish-help"
        />
        <div class="form-switches">
          <el-form-item label="可搜索"><el-switch v-model="formData.searchable" /></el-form-item>
          <el-form-item label="可导航"><el-switch v-model="formData.navigable" /></el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="坐标状态">
            <el-select v-model="formData.coordinateStatus">
              <el-option label="未采集" value="uncollected" />
              <el-option label="待审核" value="pending_review" />
              <el-option label="已实地核验" value="verified" />
              <el-option label="需要重采" value="resample_required" />
            </el-select>
          </el-form-item>
          <el-form-item label="实地经度（GCJ-02）">
            <el-input-number v-model="formData.longitude" :precision="6" :step="0.000001" controls-position="right" />
          </el-form-item>
          <el-form-item label="实地纬度（GCJ-02）">
            <el-input-number v-model="formData.latitude" :precision="6" :step="0.000001" controls-position="right" />
          </el-form-item>
        </div>
        <el-form-item label="校园入口">
          <div class="entrance-editor">
            <div class="entrance-editor-head">
              <span class="binding-help">入口使用骑手实采的 GCJ-02 坐标；发布后用户导航优先使用主入口。</span>
              <el-button size="small" plain type="primary" @click="addEntrance">添加入口</el-button>
            </div>
            <div v-for="(entrance, index) in formEntrances" :key="entrance.localId" class="entrance-row">
              <div class="entrance-row-title">
                <strong>入口 {{ index + 1 }}</strong>
                <div>
                  <el-checkbox v-model="entrance.isPrimary" @change="setPrimaryEntrance(index)">主入口</el-checkbox>
                  <el-button size="small" text type="danger" @click="removeEntrance(index)">删除</el-button>
                </div>
              </div>
              <div class="form-row">
                <el-form-item label="入口名称" required>
                  <el-input v-model="entrance.name" maxlength="30" placeholder="例如：北门主入口" />
                </el-form-item>
                <el-form-item label="开放状态">
                  <el-select v-model="entrance.serviceStatus">
                    <el-option label="待确认" value="unknown" />
                    <el-option label="已开放" value="open" />
                    <el-option label="有限开放" value="limited" />
                    <el-option label="未开放" value="unopened" />
                    <el-option label="临时关闭" value="temporarily_closed" />
                    <el-option label="已关闭" value="closed" />
                  </el-select>
                </el-form-item>
              </div>
              <div class="form-row">
                <el-form-item label="经度（GCJ-02）" required>
                  <el-input-number v-model="entrance.longitude" :precision="6" :step="0.000001" controls-position="right" />
                </el-form-item>
                <el-form-item label="纬度（GCJ-02）" required>
                  <el-input-number v-model="entrance.latitude" :precision="6" :step="0.000001" controls-position="right" />
                </el-form-item>
                <el-form-item label="定位精度（米）">
                  <el-input-number v-model="entrance.accuracy" :min="0" :precision="1" :step="0.5" controls-position="right" />
                </el-form-item>
              </div>
              <el-input v-model="entrance.addressDescription" maxlength="120" placeholder="入口现场说明，例如：校门东侧人行通道" />
            </div>
            <el-empty v-if="!formEntrances.length" description="尚未配置入口，可由骑手实采后审核写入，也可由运营手动添加" :image-size="54" />
          </div>
        </el-form-item>
        <el-form-item label="矢量图形绑定">
          <el-input v-model="formData.artworkFeatureKey" disabled placeholder="请在地图上点选蓝色点位或建筑轮廓完成绑定" />
          <div class="binding-help">图形键由地图工作台自动维护，防止手工输入导致地点串绑。</div>
        </el-form-item>
        <el-form-item label="用户端公开图片">
          <div class="catalog-photo-grid">
            <div v-for="media in formMedia" :key="media.id || media.url" class="catalog-photo-item">
              <el-image :src="media.url" :preview-src-list="formPhotoUrls" fit="cover" />
              <el-button circle size="small" type="danger" @click="removePhoto(media)">×</el-button>
            </div>
            <label v-if="editingNumber" class="catalog-photo-upload">
              <span>{{ photoUploading ? '上传中…' : '+ 添加现场照片' }}</span>
              <input type="file" accept="image/*" :disabled="photoUploading" @change="uploadPhoto" />
            </label>
            <span v-else class="binding-help">请先保存新地点，再上传图片。</span>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="formData.notes" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  deleteCampusMapProject,
  deleteCampusMapPlaceMedia,
  fetchCampusMapProjectCatalog,
  removeCampusMapProjectPhoto,
  seedCampusMapProjects,
  uploadCampusMapPlaceMedia,
  upsertCampusMapProject,
} from '@/api/admin'
import {
  campusProjectCatalogItems,
  campusProjectAvailabilityError,
  catalogPlaceId,
  publicPlaceMedia,
  publicPlacePhotoUrls,
} from './campusProjectModel.mjs'

const props = defineProps<{
  modelValue: boolean
  regionId: string | number
  regionName?: string
  mapId?: string
  places?: any[]
}>()
const emit = defineEmits<{
  'update:modelValue': [boolean]
  catalogChanged: [projects: any[]]
  focusPlace: [placeId: string]
}>()

const loading = ref(false)
const saving = ref(false)
const seeding = ref(false)
const projectActionNumber = ref<number | null>(null)
const projects = ref<any[]>([])
let catalogLoadSeq = 0
const searchText = ref('')
const filterStatus = ref('')
const formVisible = ref(false)
const editingNumber = ref<number | null>(null)
const editingProject = ref<any | null>(null)
const formMedia = ref<any[]>([])
const formEntrances = ref<any[]>([])
const formPhotoUrls = computed(() => formMedia.value.map((item) => String(item.url)).filter(Boolean))
const photoUploading = ref(false)

const formData = reactive({
  officialNumber: 1,
  officialName: '',
  engineeringAlias: '',
  constructionStatus: 'built',
  serviceStatus: 'unknown',
  unavailableMessage: '',
  publishStatus: 'draft',
  visibilityScope: 'phase1_review',
  semanticType: 'building',
  geometryStatus: 'unmatched',
  searchable: false,
  navigable: false,
  notes: '',
  addressDescription: '',
  longitude: null as number | null,
  latitude: null as number | null,
  artworkFeatureKey: '',
  coordinateStatus: 'uncollected',
})

const STATUS_LABELS = [
  { value: 'built', label: '已建' },
  { value: 'under_construction', label: '在建' },
  { value: 'renovating', label: '改造中' },
  { value: 'planned', label: '未建' },
]

const PUBLISH_STATUS_LABELS = [
  { value: 'draft', label: '草稿' },
  { value: 'review', label: '待复核' },
  { value: 'published', label: '已发布' },
  { value: 'hidden', label: '已隐藏' },
]

const COORDINATE_STATUS_LABELS = [
  { value: 'uncollected', label: '坐标未采集' },
  { value: 'pending_review', label: '坐标待审核' },
  { value: 'verified', label: '坐标已核验' },
  { value: 'resample_required', label: '坐标需重采' },
]

const SEMANTIC_OPTIONS = [
  { value: 'building', label: '建筑' },
  { value: 'teaching', label: '教学楼' },
  { value: 'dorm', label: '宿舍' },
  { value: 'canteen', label: '食堂' },
  { value: 'library', label: '图书馆' },
  { value: 'sports', label: '运动场' },
  { value: 'gate', label: '校门' },
  { value: 'parking', label: '停车场' },
  { value: 'research', label: '科研楼' },
  { value: 'museum', label: '校史馆' },
  { value: 'office', label: '行政楼' },
  { value: 'service', label: '服务点' },
]

const filteredProjects = computed(() => {
  let list = projects.value
  if (filterStatus.value) list = list.filter((p) => p.constructionStatus === filterStatus.value)
  const kw = searchText.value.trim().toLowerCase()
  if (kw) list = list.filter((p) =>
    String(p.officialNumber).includes(kw) ||
    String(p.officialName || '').toLowerCase().includes(kw) ||
    String(p.engineeringAlias || '').toLowerCase().includes(kw),
  )
  return list
})

function featureBindingFor(project: any) {
  const placeId = catalogPlaceId(project, props.regionId)
  return (props.places || []).find((place: any) =>
    ['poi', 'area'].includes(String(place.featureKind || ''))
      && (String(place.placeId || '') === placeId
        || (project.artworkFeatureKey && String(place.featureId || place.id || '') === String(project.artworkFeatureKey))),
  )
}

function statusLabel(v: string) {
  return STATUS_LABELS.find((s) => s.value === v)?.label ?? v
}

function statusTagType(v: string) {
  if (v === 'built') return 'success'
  if (v === 'under_construction' || v === 'renovating') return 'warning'
  return 'info'
}

function publishStatusLabel(v: string) {
  return PUBLISH_STATUS_LABELS.find((item) => item.value === v)?.label ?? '草稿'
}

function publishStatusTagType(v: string) {
  if (v === 'published') return 'success'
  if (v === 'review') return 'warning'
  return 'info'
}

function coordinateStatusLabel(v: string) {
  return COORDINATE_STATUS_LABELS.find((item) => item.value === v)?.label ?? '坐标未采集'
}

function semanticLabel(v: string) {
  return SEMANTIC_OPTIONS.find((s) => s.value === v)?.label ?? v
}

async function loadCatalog() {
  const seq = ++catalogLoadSeq
  const regionId = props.regionId
  const mapId = props.mapId
  if (!regionId) {
    projects.value = []
    return
  }
  loading.value = true
  try {
    const res: any = await fetchCampusMapProjectCatalog(regionId, mapId)
    if (seq === catalogLoadSeq && String(regionId) === String(props.regionId)) {
      projects.value = campusProjectCatalogItems(res)
    }
  } catch (e: any) {
    if (seq === catalogLoadSeq) ElMessage.error(e?.message || '加载失败')
  } finally {
    if (seq === catalogLoadSeq) loading.value = false
  }
}

async function toggleProjectHidden(project: any) {
  const officialNumber = Number(project?.officialNumber)
  if (!Number.isInteger(officialNumber) || projectActionNumber.value !== null) return
  const nextStatus = project.publishStatus === 'hidden' ? 'draft' : 'hidden'
  projectActionNumber.value = officialNumber
  try {
    await upsertCampusMapProject(
      officialNumber,
      { ...project, publishStatus: nextStatus },
      props.regionId,
      props.mapId,
    )
    await loadCatalog()
    emit('catalogChanged', projects.value)
    ElMessage.success(nextStatus === 'hidden' ? '地点已隐藏，不会进入用户端发布快照' : '地点已取消隐藏，当前恢复为草稿')
  } catch (error: any) {
    ElMessage.error(error?.message || '更新隐藏状态失败')
  } finally {
    projectActionNumber.value = null
  }
}

async function removeProject(project: any) {
  const officialNumber = Number(project?.officialNumber)
  if (!Number.isInteger(officialNumber) || projectActionNumber.value !== null) return
  try {
    await ElMessageBox.confirm(
      `确定删除 #${officialNumber} ${project.officialName || ''}？关联了采集任务的地点不能删除，只能隐藏。`,
      '删除地点档案',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  projectActionNumber.value = officialNumber
  try {
    await deleteCampusMapProject(officialNumber, props.regionId, props.mapId)
    await loadCatalog()
    emit('catalogChanged', projects.value)
    ElMessage.success('地点档案及其工作台标注已删除')
  } catch (error: any) {
    ElMessage.error(error?.message || '删除地点失败')
  } finally {
    projectActionNumber.value = null
  }
}

function openForm(project?: any) {
  if (project) {
    editingNumber.value = project.officialNumber
    editingProject.value = project
    Object.assign(formData, {
      officialNumber: project.officialNumber,
      officialName: project.officialName,
      engineeringAlias: project.engineeringAlias || '',
      constructionStatus: project.constructionStatus || 'built',
      serviceStatus: project.serviceStatus || 'unknown',
      unavailableMessage: project.unavailableMessage || '',
      publishStatus: project.publishStatus || 'draft',
      visibilityScope: project.visibilityScope || 'phase1_review',
      semanticType: project.semanticType || 'building',
      geometryStatus: project.geometryStatus || 'unmatched',
      searchable: Boolean(project.searchable),
      navigable: Boolean(project.navigable),
      notes: project.notes || '',
      addressDescription: project.addressDescription || project.address || '',
      longitude: project.longitude !== null && project.longitude !== undefined && project.longitude !== '' && Number.isFinite(Number(project.longitude)) ? Number(project.longitude) : null,
      latitude: project.latitude !== null && project.latitude !== undefined && project.latitude !== '' && Number.isFinite(Number(project.latitude)) ? Number(project.latitude) : null,
      artworkFeatureKey: project.artworkFeatureKey || '',
      coordinateStatus: project.coordinateStatus === 'resample' ? 'resample_required' : (project.coordinateStatus || 'uncollected'),
    })
    formMedia.value = publicPlaceMedia(project)
    formEntrances.value = normalizeEntrances(project.entrances)
  } else {
    editingNumber.value = null
    editingProject.value = null
    Object.assign(formData, {
      officialNumber: (projects.value.length ? Math.max(...projects.value.map((p) => p.officialNumber)) + 1 : 1),
      officialName: '',
      engineeringAlias: '',
      constructionStatus: 'built',
      serviceStatus: 'unknown',
      unavailableMessage: '',
      publishStatus: 'draft',
      visibilityScope: 'phase1_review',
      semanticType: 'building',
      geometryStatus: 'unmatched',
      searchable: false,
      navigable: false,
      notes: '',
      addressDescription: '',
      longitude: null,
      latitude: null,
      artworkFeatureKey: '',
      coordinateStatus: 'uncollected',
    })
    formMedia.value = []
    formEntrances.value = []
  }
  formVisible.value = true
}

function normalizeEntrances(value: unknown) {
  if (!Array.isArray(value)) return []
  let primarySeen = false
  const normalized = value.map((entrance: any, index: number) => {
    const isPrimary = entrance?.isPrimary === true && !primarySeen
    if (isPrimary) primarySeen = true
    return {
      id: String(entrance?.id || '').trim() || undefined,
      localId: String(entrance?.id || `entrance-${Date.now()}-${index}`),
      name: String(entrance?.name || ''),
      longitude: entrance?.longitude !== null && entrance?.longitude !== undefined && Number.isFinite(Number(entrance.longitude)) ? Number(entrance.longitude) : null,
      latitude: entrance?.latitude !== null && entrance?.latitude !== undefined && Number.isFinite(Number(entrance.latitude)) ? Number(entrance.latitude) : null,
      accuracy: entrance?.accuracy !== null && entrance?.accuracy !== undefined && Number.isFinite(Number(entrance.accuracy)) ? Number(entrance.accuracy) : null,
      addressDescription: String(entrance?.addressDescription || entrance?.address || ''),
      serviceStatus: String(entrance?.serviceStatus || 'unknown'),
      isPrimary,
      sourceType: String(entrance?.sourceType || 'admin'),
    }
  })
  if (normalized.length && !primarySeen) normalized[0].isPrimary = true
  return normalized
}

function addEntrance() {
  formEntrances.value.push({
    localId: `entrance-${Date.now()}-${formEntrances.value.length}`,
    name: '',
    longitude: formData.longitude,
    latitude: formData.latitude,
    accuracy: null,
    addressDescription: '',
    serviceStatus: 'unknown',
    isPrimary: formEntrances.value.length === 0,
    sourceType: 'admin',
  })
}

function removeEntrance(index: number) {
  const removedPrimary = formEntrances.value[index]?.isPrimary === true
  formEntrances.value.splice(index, 1)
  if (removedPrimary && formEntrances.value.length) formEntrances.value[0].isPrimary = true
}

function setPrimaryEntrance(index: number) {
  if (!formEntrances.value[index]?.isPrimary) return
  formEntrances.value.forEach((entrance, entranceIndex) => {
    entrance.isPrimary = entranceIndex === index
  })
}

function entrancePayload() {
  const hasPrimary = formEntrances.value.some((entrance) => entrance.isPrimary === true)
  return formEntrances.value.map((entrance, index) => {
    const name = String(entrance.name || '').trim()
    const longitude = Number(entrance.longitude)
    const latitude = Number(entrance.latitude)
    if (!name) throw new Error(`第 ${index + 1} 个入口名称不能为空`)
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error(`第 ${index + 1} 个入口坐标无效`)
    }
    return {
      ...(String(entrance.id || '').trim() ? { id: String(entrance.id).trim() } : {}),
      name,
      longitude,
      latitude,
      accuracy: entrance.accuracy === null || entrance.accuracy === '' ? null : Number(entrance.accuracy),
      addressDescription: String(entrance.addressDescription || '').trim(),
      serviceStatus: String(entrance.serviceStatus || 'unknown'),
      isPrimary: entrance.isPrimary === true || (!hasPrimary && index === 0),
      sourceType: String(entrance.sourceType || 'admin'),
    }
  })
}

async function uploadPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !editingNumber.value) return
  const project = projects.value.find((item) => Number(item.officialNumber) === Number(editingNumber.value))
  const placeId = project ? catalogPlaceId(project, props.regionId) : ''
  if (!placeId) return ElMessage.warning('地点缺少稳定 placeId，请先保存档案')
  photoUploading.value = true
  try {
    await uploadCampusMapPlaceMedia(props.regionId, placeId, file, { mediaType: 'gallery', isPublic: true })
    await loadCatalog()
    const updated = projects.value.find((item) => catalogPlaceId(item, props.regionId) === placeId)
    formMedia.value = publicPlaceMedia(updated || {})
    emit('catalogChanged', projects.value)
    ElMessage.success('公开图片已上传')
  } catch (error: any) {
    ElMessage.error(error?.message || '图片上传失败')
  } finally {
    photoUploading.value = false
    input.value = ''
  }
}

async function removePhoto(media: any) {
  if (!editingNumber.value) return
  const project = projects.value.find((item) => Number(item.officialNumber) === Number(editingNumber.value))
  const placeId = project ? catalogPlaceId(project, props.regionId) : ''
  try {
    if (placeId && media?.id && !String(media.id).startsWith('legacy-photo-')) {
      await deleteCampusMapPlaceMedia(props.regionId, placeId, String(media.id))
    } else {
      await removeCampusMapProjectPhoto(editingNumber.value, String(media?.url || ''), props.regionId, props.mapId)
    }
    await loadCatalog()
    const updated = projects.value.find((item) => catalogPlaceId(item, props.regionId) === placeId)
    formMedia.value = publicPlaceMedia(updated || {})
    emit('catalogChanged', projects.value)
    ElMessage.success('公开图片已移除')
  } catch (error: any) {
    ElMessage.error(error?.message || '图片删除失败')
  }
}

async function saveForm() {
  if (!formData.officialName.trim()) { ElMessage.warning('正式名称不能为空'); return }
  const availabilityError = campusProjectAvailabilityError(formData)
  if (availabilityError) { ElMessage.warning(availabilityError); return }
  let entrances: any[]
  try {
    entrances = entrancePayload()
  } catch (error: any) {
    ElMessage.warning(error?.message || '入口信息不完整')
    return
  }
  saving.value = true
  try {
    await upsertCampusMapProject(
      formData.officialNumber,
      { ...(editingProject.value || {}), ...formData, entrances },
      props.regionId,
      props.mapId,
    )
    ElMessage.success('保存成功')
    formVisible.value = false
    await loadCatalog()
    emit('catalogChanged', projects.value)
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function seedCatalog() {
  if (!props.regionId || projects.value.length) return
  seeding.value = true
  try {
    await seedCampusMapProjects(props.regionId, props.mapId)
    await loadCatalog()
    emit('catalogChanged', projects.value)
    ElMessage.success('官方 1–38 地点目录已初始化，默认保持草稿状态')
  } catch (error: any) {
    ElMessage.error(error?.message || '目录初始化失败')
  } finally {
    seeding.value = false
  }
}

watch(() => [props.regionId, props.mapId], () => {
  projects.value = []
  if (props.modelValue && props.regionId) void loadCatalog()
}, { immediate: true })

watch(() => props.modelValue, (visible) => {
  if (visible && props.regionId) void loadCatalog()
})
</script>

<style scoped>
.catalog-drawer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.catalog-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.catalog-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.catalog-status-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-built { background: #dcfce7; color: #166534; }
.status-under_construction { background: #fef9c3; color: #854d0e; }
.status-renovating { background: #ffedd5; color: #9a3412; }
.status-planned { background: #f1f5f9; color: #475569; }
.muted { color: var(--el-text-color-secondary); }
.seed-help { display: block; margin-top: 8px; color: var(--el-text-color-placeholder); }
.publish-help { margin-bottom: 18px; }

.catalog-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  max-height: calc(100vh - 240px);
}

.catalog-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}

.status-row-built { border-left: 3px solid #16a34a; }
.status-row-under_construction { border-left: 3px solid #ca8a04; }
.status-row-renovating { border-left: 3px solid #ea580c; }
.status-row-planned { border-left: 3px solid #94a3b8; }

.catalog-number {
  width: 40px;
  font-weight: 700;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
}

.catalog-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.catalog-info strong { font-size: 14px; }

.alias {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.place-id {
  overflow: hidden;
  color: var(--el-text-color-placeholder);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.binding-help {
  margin-top: 6px;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  line-height: 1.5;
}

.catalog-photo-grid { display: flex; flex-wrap: wrap; gap: 10px; width: 100%; }
.catalog-photo-item { position: relative; width: 96px; height: 96px; overflow: hidden; border: 1px solid var(--el-border-color-light); border-radius: 8px; }
.catalog-photo-item .el-image { width: 100%; height: 100%; }
.catalog-photo-item .el-button { position: absolute; top: 4px; right: 4px; }
.catalog-photo-upload { display: grid; width: 126px; height: 96px; place-items: center; border: 1px dashed var(--el-color-primary-light-5); border-radius: 8px; color: var(--el-color-primary); cursor: pointer; font-size: 12px; }
.catalog-photo-upload input { display: none; }

.entrance-editor { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.entrance-editor-head, .entrance-row-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.entrance-editor-head .binding-help { margin-top: 0; }
.entrance-row { padding: 12px; border: 1px solid var(--el-border-color-light); border-radius: 8px; background: var(--el-fill-color-extra-light); }
.entrance-row-title { margin-bottom: 10px; }
.entrance-row-title > div { display: flex; align-items: center; gap: 8px; }

.catalog-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.catalog-actions { flex-shrink: 0; }

.form-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.form-row .el-form-item { flex: 1; }

.form-switches {
  display: flex;
  gap: 24px;
}
</style>
