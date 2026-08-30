<template>
  <aside class="map-inspector">
    <div class="inspector-head">
      <div>
        <strong>{{ selectedEditableItem ? '地点与图层' : '发布问题' }}</strong>
        <span>{{ selectedEditableItem ? selectedEditableItem.label : activeStageLabel }}</span>
      </div>
      <el-button v-if="selectedEditableItem" text @click="$emit('clearSelection')">取消选择</el-button>
    </div>

    <div v-if="selectedEditableItem" class="inspector-editor" @focusin="$emit('beforeEdit')" @pointerdown="$emit('beforeEdit')">
      <el-form label-position="top">
        <el-form-item label="名称">
          <el-input v-model="selectedEditableItem.item.title" maxlength="30" />
        </el-form-item>

        <template v-if="selectedEditableItem.kind === 'poi' || selectedEditableItem.kind === 'area'">
          <el-form-item label="地点档案绑定">
            <el-select
              :model-value="selectedPlaceId"
              filterable
              clearable
              placeholder="选择地点，点位和建筑轮廓共用同一地点 ID"
              @change="$emit('assignPlace', String($event || ''))"
            >
              <el-option
                v-for="project in projectCatalog"
                :key="catalogPlaceId(project, regionId)"
                :label="`#${project.officialNumber} ${project.officialName}`"
                :value="catalogPlaceId(project, regionId)"
              >
                <span>#{{ project.officialNumber }} {{ project.officialName }}</span>
                <small>{{ project.constructionStatus === 'built' ? '一期已建' : '未来参考' }}</small>
              </el-option>
            </el-select>
          </el-form-item>

          <div v-if="selectedEditableItem.item.officialNumber" class="project-meta-grid">
            <span>正式编号</span><strong>#{{ selectedEditableItem.item.officialNumber }}</strong>
            <span>正式名称</span><strong>{{ selectedEditableItem.item.officialName }}</strong>
            <span>建设状态</span><strong>{{ selectedEditableItem.item.constructionStatus === 'built' ? '已建' : '在建/后续' }}</strong>
            <span>几何状态</span><strong>{{ selectedEditableItem.item.geometryStatus }}</strong>
            <span>地点 ID</span><strong class="mono-value">{{ selectedEditableItem.item.placeId || '--' }}</strong>
            <span>图形绑定</span><strong class="mono-value">{{ selectedEditableItem.item.artworkFeatureKey || selectedEditableItem.item.id }}</strong>
          </div>

          <section class="closure-card" :class="{ ready: selectedProjectPublicReady }">
            <div class="closure-head">
              <div>
                <strong>{{ selectedProjectPublicReady ? '用户端可发布' : '地点闭环未完成' }}</strong>
                <small>{{ selectedProjectPublicReady ? '保存草稿并发布后，小程序会显示该地点' : '按缺失项处理，不再猜测是否已经生效' }}</small>
              </div>
              <el-tag :type="selectedProjectPublicReady ? 'success' : 'warning'" size="small">
                {{ selectedProjectPublicReady ? '就绪' : `${projectGateSteps.filter((step) => !step.done).length} 项未完成` }}
              </el-tag>
            </div>
            <div class="closure-steps">
              <div v-for="step in projectGateSteps" :key="step.key" :class="{ done: step.done }">
                <span>{{ step.done ? '✓' : '!' }}</span>
                <p><strong>{{ step.label }}</strong><small>{{ step.help }}</small></p>
              </div>
            </div>
            <el-button type="primary" plain style="width: 100%" @click="$emit('collectPlace', selectedEditableItem.item)">
              派骑手核验坐标、入口和现场照片
            </el-button>
          </section>

          <div class="project-publish-grid">
            <el-form-item label="用户端状态">
              <el-select v-model="selectedEditableItem.item.publishStatus">
                <el-option label="草稿" value="draft" />
                <el-option label="待复核" value="review" />
                <el-option label="已发布" value="published" />
                <el-option label="已隐藏" value="hidden" />
              </el-select>
            </el-form-item>
            <el-form-item label="可见范围">
              <el-select v-model="selectedEditableItem.item.visibilityScope">
                <el-option label="一期用户可见" value="phase1_active" />
                <el-option label="一期待复核" value="phase1_review" />
                <el-option label="未来参考" value="future_reference" />
              </el-select>
            </el-form-item>
          </div>

          <!-- 建筑照片 -->
          <el-form-item v-if="selectedEditableItem.item.officialNumber" label="建筑照片">
            <div class="building-photos">
              <div
                v-for="media in projectMedia"
                :key="media.id || media.url"
                class="building-photo-item"
              >
                <img :src="media.url" alt="" class="building-photo-thumb" />
                <button type="button" class="building-photo-remove" @click="removeProjectMedia(media)">
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
              <label class="building-photo-upload" :class="{ 'is-uploading': photoUploading }">
                <el-icon v-if="!photoUploading"><Plus /></el-icon>
                <el-icon v-else class="is-loading"><RefreshRight /></el-icon>
                <input
                  type="file"
                  accept="image/*"
                  style="display:none"
                  :disabled="photoUploading"
                  @change="onPhotoFileChange"
                />
              </label>
            </div>
          </el-form-item>

          <section v-if="pendingProjectMedia.length" class="checkin-review-card">
            <div class="checkin-review-head">
              <div>
                <strong>用户打卡待审核</strong>
                <small>通过后才会随下一次正式发布进入小程序</small>
              </div>
              <el-tag type="warning" size="small">{{ pendingProjectMedia.length }} 张</el-tag>
            </div>
            <div
              v-for="media in pendingProjectMedia"
              :key="media.id"
              class="checkin-review-row"
            >
              <img :src="media.url" alt="用户打卡待审核照片" />
              <div>
                <strong>到达打卡</strong>
                <small>{{ media.captureAccuracy ? `定位精度 ${Math.round(media.captureAccuracy)}m` : '定位证据已记录' }}</small>
              </div>
              <div class="checkin-review-actions">
                <el-button
                  size="small"
                  type="success"
                  :loading="reviewingMediaId === media.id"
                  @click="reviewProjectMedia(media, 'approved')"
                >通过</el-button>
                <el-button
                  size="small"
                  :loading="reviewingMediaId === media.id"
                  @click="reviewProjectMedia(media, 'rejected')"
                >不通过</el-button>
              </div>
            </div>
          </section>

          <template v-if="selectedEditableItem.item.constructionStatus !== 'under_construction'">
            <el-form-item label="建筑开放状态">
              <el-radio-group
                :model-value="selectedEditableItem.item.serviceStatus || 'open'"
                @update:model-value="$emit('syncAvailability', $event as 'open' | 'unopened')"
              >
                <el-radio-button value="open">已开放</el-radio-button>
                <el-radio-button value="unopened">未开放</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="selectedEditableItem.item.serviceStatus === 'unopened'" label="未开放说明">
              <el-input
                v-model="selectedEditableItem.item.unavailableMessage"
                type="textarea"
                :rows="3"
                maxlength="120"
                show-word-limit
                placeholder="例如：建筑正在维护，暂不提供导航"
              />
            </el-form-item>
          </template>

          <div class="project-switches">
            <el-form-item label="可搜索">
              <el-switch
                v-model="selectedEditableItem.item.searchable"
                :disabled="selectedEditableItem.item.serviceStatus === 'unopened' || selectedEditableItem.item.constructionStatus === 'under_construction' || selectedEditableItem.item.geometryStatus === 'unmatched'"
              />
            </el-form-item>
            <el-form-item label="可导航">
              <el-switch
                v-model="selectedEditableItem.item.navigable"
                :disabled="selectedEditableItem.item.serviceStatus === 'unopened' || selectedEditableItem.item.constructionStatus === 'under_construction' || selectedEditableItem.item.geometryStatus === 'unmatched'"
              />
            </el-form-item>
          </div>
        </template>

        <el-form-item v-if="selectedEditableItem.kind === 'poi' || selectedEditableItem.kind === 'area'" label="校园标志">
          <el-select v-model="selectedEditableItem.item.semanticType" @change="$emit('syncSemantic')">
            <el-option
              v-for="item in semanticCategories"
              :key="item.type"
              :label="item.label"
              :value="item.type"
            >
              <span class="semantic-option">
                <i :style="{ background: item.color }"></i>
                {{ item.label }}
              </span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item v-if="selectedEditableItem.kind === 'poi'" label="分类">
          <el-select v-model="selectedEditableItem.item.category">
            <el-option label="建筑" value="building" />
            <el-option label="出入口" value="entrance" />
            <el-option label="服务点" value="service" />
            <el-option label="商家" value="merchant" />
          </el-select>
        </el-form-item>

        <el-form-item v-if="selectedEditableItem.kind === 'area'" label="分类">
          <el-select v-model="selectedEditableItem.item.category">
            <el-option label="教学区" value="teaching" />
            <el-option label="生活区" value="living" />
            <el-option label="运动区" value="sports" />
            <el-option label="服务区" value="service" />
          </el-select>
        </el-form-item>

        <el-form-item v-if="selectedEditableItem.kind === 'route'" label="路线类型">
          <el-input v-model="selectedEditableItem.item.category" />
        </el-form-item>

        <section v-if="selectedEditableItem.kind === 'route'" class="closure-card route-card">
          <div class="closure-head">
            <div>
              <strong>道路实采闭环</strong>
              <small>这条路线会在骑手端高亮，审核通过后才写回地图草稿</small>
            </div>
          </div>
          <el-button type="primary" style="width: 100%" @click="$emit('collectRoute', selectedEditableItem.item)">
            派骑手采集这条路线
          </el-button>
        </section>

        <template v-if="selectedEditableItem.kind === 'calibration'">
          <el-form-item label="坐标拾取">
            <el-button :icon="Aim" style="width: 100%" @click="$emit('pickLocation')">
              从高德地图拾取坐标
            </el-button>
          </el-form-item>
          <div class="calibration-grid">
            <el-form-item label="经度">
              <el-input-number v-model="selectedEditableItem.item.longitude" :precision="6" :step="0.000001" />
            </el-form-item>
            <el-form-item label="纬度">
              <el-input-number v-model="selectedEditableItem.item.latitude" :precision="6" :step="0.000001" />
            </el-form-item>
          </div>
        </template>

        <div v-if="editorMode === 'amap' && selectedEditableItem.kind === 'poi'" class="coordinate-line">
          {{ formatLngLat(selectedEditableItem.item) }}
        </div>

        <div class="inspector-actions">
          <el-button
            v-if="selectedEditableItem.kind === 'poi'"
            type="danger"
            plain
            :icon="Delete"
            @click="$emit('removePoi', selectedEditableItem.item.id)"
          >
            删除点位
          </el-button>
          <el-button
            v-else-if="selectedEditableItem.kind === 'area'"
            type="danger"
            plain
            :icon="Delete"
            @click="$emit('removeArea', selectedEditableItem.item.id)"
          >
            删除区域
          </el-button>
          <el-button
            v-else-if="selectedEditableItem.kind === 'route'"
            type="danger"
            plain
            :icon="Delete"
            @click="$emit('removeRoute', selectedEditableItem.item.id)"
          >
            删除路线
          </el-button>
          <el-button
            v-else
            type="danger"
            plain
            :icon="Delete"
            @click="$emit('removeCalibration', selectedEditableItem.item.id)"
          >
            删除校准
          </el-button>
        </div>
      </el-form>
    </div>

    <div v-else class="empty-inspector">
      <section class="issue-queue">
        <div class="issue-queue-head">
          <div>
            <strong>当前阻塞</strong>
            <small>先处理最上面一项</small>
          </div>
          <el-tag size="small" :type="releaseCockpit.issues.length ? 'danger' : 'success'">
            {{ releaseCockpit.issues.length ? `${releaseCockpit.issues.length} 项` : '已清空' }}
          </el-tag>
        </div>
        <button
          v-for="issue in visibleIssues"
          :key="issue.key"
          type="button"
          class="issue-row"
          :class="issue.level"
          @click="$emit('runIssue', issue)"
        >
          <span>{{ issue.level === 'error' ? '必须' : '建议' }}</span>
          <p>
            <strong>{{ issue.title }}</strong>
            <small>{{ issue.message }}</small>
          </p>
          <el-icon><ArrowRight /></el-icon>
        </button>
        <div v-if="!visibleIssues.length" class="issue-clear">
          <el-icon><CircleCheckFilled /></el-icon>
          <strong>当前阶段没有阻塞</strong>
          <small>可以继续检查发布。</small>
        </div>
      </section>

      <el-collapse class="layer-details">
        <el-collapse-item name="layers">
          <template #title>
            <span class="layer-details-title">图层对象</span>
            <small>{{ pois.length + areas.length + routes.length + calibrationPoints.length }} 项</small>
          </template>
          <div class="layer-summary">
            <button
              v-for="poi in pois"
              :key="poi.id"
              type="button"
              class="layer-row"
              @click="$emit('selectLayerItem', 'poi', poi.id)"
            >
              <span>点</span>
              <strong>{{ poi.title || '未命名点位' }}</strong>
            </button>
            <button
              v-for="area in areas"
              :key="area.id"
              type="button"
              class="layer-row"
              @click="$emit('selectLayerItem', 'area', area.id)"
            >
              <span>区</span>
              <strong>{{ area.title || '未命名区域' }}</strong>
            </button>
            <button
              v-for="route in routes"
              :key="route.id"
              type="button"
              class="layer-row"
              @click="$emit('selectLayerItem', 'route', route.id)"
            >
              <span>线</span>
              <strong>{{ route.title || '未命名路线' }}</strong>
            </button>
            <button
              v-for="point in calibrationPoints"
              :key="point.id"
              type="button"
              class="layer-row"
              @click="$emit('selectLayerItem', 'calibration', point.id)"
            >
              <span>准</span>
              <strong>{{ point.title || '校准点' }}</strong>
            </button>
          </div>
          <div v-if="!pois.length && !areas.length && !routes.length && !calibrationPoints.length" class="empty-state">
            <el-icon><EditPen /></el-icon>
            <strong>暂无图层对象</strong>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Aim, ArrowRight, CircleCheckFilled, Delete, EditPen, Plus, RefreshRight } from '@element-plus/icons-vue'
import {
  deleteCampusMapPlaceMedia,
  removeCampusMapProjectPhoto,
  updateCampusMapPlaceMedia,
  uploadCampusMapPlaceMedia,
} from '@/api/admin'
import { catalogPlaceId, publicPlaceMedia } from './campusProjectModel.mjs'

type ReleaseIssue = {
  key: string
  stage: string
  level: 'warning' | 'error'
  title: string
  message: string
  placeId?: string
  featureId?: string
  action: string
}

const props = defineProps<{
  selectedEditableItem: any | null
  regionId: string | number
  mapId?: string
  semanticCategories: Array<{ type: string; label: string; color: string }>
  projectCatalog: any[]
  editorMode: string
  pois: any[]
  areas: any[]
  routes: any[]
  calibrationPoints: any[]
  formatLngLat: (point: any) => string
  activeVersion?: number
  hasUnsavedChanges?: boolean
  releaseCockpit: {
    stages: Array<{ key: string; label: string }>
    issues: ReleaseIssue[]
    nextAction: { action: string; label: string; message: string }
  }
  releaseStage: string
}>()

const emit = defineEmits<{
  clearSelection: []
  beforeEdit: []
  pickLocation: []
  syncSemantic: []
  syncAvailability: [status: 'open' | 'unopened']
  assignPlace: [placeId: string]
  removePoi: [id: string]
  removeArea: [id: string]
  removeRoute: [id: string]
  removeCalibration: [id: string]
  selectLayerItem: [kind: string, id: string]
  removePhoto: [officialNumber: number, url: string]
  photoAdded: [officialNumber: number, url: string]
  projectUpdated: [project: any]
  mediaChanged: []
  collectPlace: [item: any]
  collectRoute: [item: any]
  runIssue: [issue: ReleaseIssue]
}>()

const photoUploading = ref(false)
const reviewingMediaId = ref('')
const activeStageLabel = computed(() => props.releaseCockpit.stages.find((stage) => stage.key === props.releaseStage)?.label || '全部阶段')
const visibleIssues = computed(() => {
  const stageIssues = props.releaseCockpit.issues.filter((issue) => issue.stage === props.releaseStage)
  return stageIssues.length ? stageIssues : props.releaseCockpit.issues
})

const selectedPlaceId = computed(() => {
  const item = props.selectedEditableItem?.item
  if (!item) return ''
  if (item.placeId) return String(item.placeId)
  const project = props.projectCatalog.find((candidate) =>
    candidate.artworkFeatureKey && String(candidate.artworkFeatureKey) === String(item.id),
  )
  return project ? catalogPlaceId(project, props.regionId) : ''
})

const selectedProject = computed(() => {
  const selectedId = selectedPlaceId.value
  if (!selectedId) return null
  return props.projectCatalog.find((p) => catalogPlaceId(p, props.regionId) === selectedId) || null
})
const projectMedia = computed<any[]>(() => publicPlaceMedia(selectedProject.value || {}))
const pendingProjectMedia = computed<any[]>(() => {
  const media = Array.isArray(selectedProject.value?.media) ? selectedProject.value.media : []
  return media.filter((item: any) => String(item?.sourceType || '') === 'user_checkin'
    && String(item?.reviewStatus || '') === 'pending')
})
const projectGateSteps = computed(() => {
  const item = props.selectedEditableItem?.item || {}
  const bound = Boolean(selectedPlaceId.value && item.placeId)
  const geometryReady = bound && String(item.geometryStatus || '') !== 'unmatched'
  const locationReady = String(item.coordinateStatus || '') === 'verified'
  const publicStateReady = String(item.publishStatus || '') === 'published'
    && String(item.visibilityScope || '') === 'phase1_active'
  const serviceReady = String(item.serviceStatus || 'unknown') === 'open'
    || Boolean(String(item.unavailableMessage || '').trim())
  const navigationReady = item.navigable !== true || locationReady
  return [
    { key: 'binding', done: bound, label: '真实绑定地点档案', help: bound ? `稳定 ID：${selectedPlaceId.value}` : '请在上方选择地点档案，不能只靠编号匹配' },
    { key: 'geometry', done: geometryReady, label: '建筑/点位图形已确认', help: geometryReady ? '图形锚点会随草稿写入地点档案' : '需要绑定蓝色点位或建筑轮廓' },
    { key: 'field', done: locationReady, label: '现场坐标已核验', help: locationReady ? '已取得骑手实采 GCJ-02 坐标' : '点击下方按钮派骑手采集' },
    { key: 'availability', done: serviceReady, label: '开放状态可解释', help: serviceReady ? '状态可对用户展示' : '未开放地点必须填写用户端说明' },
    { key: 'publish', done: publicStateReady, label: '地点设为一期已发布', help: publicStateReady ? '地点已进入发布候选' : '需设为“已发布”且“一期用户可见”' },
    { key: 'navigation', done: navigationReady, label: '导航条件满足', help: navigationReady ? '当前导航配置有效' : '开启导航前必须先取得已核验坐标' },
    { key: 'version', done: Number(props.activeVersion || 0) > 0 && !props.hasUnsavedChanges, label: '地图版本已发布', help: props.hasUnsavedChanges ? '当前还有未保存/未发布改动' : `当前线上版本 v${props.activeVersion || 0}` },
  ]
})
const selectedProjectPublicReady = computed(() => projectGateSteps.value.every((step) => step.done))

async function onPhotoFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !props.selectedEditableItem?.item?.officialNumber || !selectedPlaceId.value) return
  photoUploading.value = true
  try {
    await uploadCampusMapPlaceMedia(props.regionId, selectedPlaceId.value, file, {
      mediaType: 'gallery',
      isPublic: true,
    })
    emit('mediaChanged')
    ElMessage.success('照片已上传')
  } catch (error: any) {
    ElMessage.error(error?.message || '照片上传失败')
  } finally {
    photoUploading.value = false
    input.value = ''
  }
}

async function removeProjectMedia(media: any) {
  const officialNumber = Number(props.selectedEditableItem?.item?.officialNumber)
  if (!officialNumber) return
  photoUploading.value = true
  try {
    if (selectedPlaceId.value && media?.id && !String(media.id).startsWith('legacy-photo-')) {
      await deleteCampusMapPlaceMedia(props.regionId, selectedPlaceId.value, String(media.id))
    } else {
      await removeCampusMapProjectPhoto(officialNumber, String(media?.url || ''), props.regionId, props.mapId)
    }
    emit('mediaChanged')
    ElMessage.success('公开图片已移除')
  } catch (error: any) {
    ElMessage.error(error?.message || '图片删除失败')
  } finally {
    photoUploading.value = false
  }
}

async function reviewProjectMedia(media: any, reviewStatus: 'approved' | 'rejected') {
  if (!selectedPlaceId.value || !media?.id) return
  reviewingMediaId.value = String(media.id)
  try {
    await updateCampusMapPlaceMedia(props.regionId, selectedPlaceId.value, String(media.id), { reviewStatus })
    emit('mediaChanged')
    ElMessage.success(reviewStatus === 'approved'
      ? '已通过，下一次正式发布后对用户展示'
      : '已拒绝，照片不会公开')
  } catch (error: any) {
    ElMessage.error(error?.message || '打卡照片审核失败')
  } finally {
    reviewingMediaId.value = ''
  }
}
</script>

<style scoped>
.map-inspector {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  border: 1px solid var(--mx-border);
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
  border-bottom: 1px solid var(--mx-border);
}

.inspector-head div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.inspector-head strong {
  color: var(--mx-text);
  font-size: 14px;
}

.inspector-head span {
  overflow: hidden;
  color: var(--mx-sub);
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

.inspector-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
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

.semantic-option small,
.project-meta-grid span {
  color: var(--mx-sub);
  font-size: 12px;
}

.project-meta-grid {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 7px 12px;
  margin: -2px 0 14px;
  padding: 10px;
  border-radius: 6px;
  background: var(--mx-soft);
}

.project-meta-grid strong {
  color: var(--mx-text);
  font-size: 12px;
}

.project-switches {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.closure-card {
  display: grid;
  gap: 12px;
  margin: 0 0 16px;
  padding: 14px;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  background: #fffaf0;
}

.closure-card.ready {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.closure-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.closure-head > div,
.closure-steps p {
  display: grid;
  gap: 3px;
  margin: 0;
}

.closure-head small,
.closure-steps small {
  color: var(--mx-sub);
  font-size: 11px;
  line-height: 1.45;
}

.closure-steps {
  display: grid;
  gap: 8px;
}

.closure-steps > div {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 8px;
  align-items: flex-start;
}

.closure-steps > div > span {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffedd5;
  color: #c2410c;
  font-size: 11px;
  font-weight: 800;
}

.closure-steps > div.done > span {
  background: #dcfce7;
  color: #15803d;
}

.closure-steps strong {
  color: var(--mx-text);
  font-size: 12px;
}

.project-publish-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.route-card {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.calibration-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.calibration-grid :deep(.el-input-number),
.inspector-editor :deep(.el-input-number),
.inspector-editor :deep(.el-select) {
  width: 100%;
}

.coordinate-line {
  margin: 4px 0 12px;
  padding: 9px 10px;
  border-radius: 6px;
  background: var(--mx-soft);
  color: var(--mx-sub);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.issue-queue {
  display: grid;
  gap: 10px;
}

.issue-queue-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.issue-queue-head > div,
.issue-row p,
.issue-clear {
  display: grid;
  gap: 3px;
  margin: 0;
}

.issue-queue-head strong,
.issue-row strong,
.issue-clear strong {
  color: var(--mx-text);
  font-size: 13px;
}

.issue-queue-head small,
.issue-row small,
.issue-clear small {
  color: var(--mx-sub);
  font-size: 11px;
  line-height: 1.5;
}

.issue-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 9px;
  align-items: flex-start;
  width: 100%;
  border: 1px solid var(--el-color-danger-light-7);
  border-radius: 8px;
  padding: 10px;
  background: var(--el-color-danger-light-9);
  color: var(--mx-text);
  text-align: left;
  cursor: pointer;
}

.issue-row.warning {
  border-color: var(--el-color-warning-light-7);
  background: var(--el-color-warning-light-9);
}

.issue-row > span {
  border-radius: 999px;
  padding: 3px 6px;
  background: rgba(255, 255, 255, .86);
  color: var(--el-color-danger-dark-2);
  font-size: 10px;
  font-weight: 800;
}

.issue-row.warning > span {
  color: var(--el-color-warning-dark-2);
}

.issue-row > .el-icon {
  margin-top: 3px;
  color: var(--mx-sub);
}

.issue-row:hover {
  border-color: var(--el-color-primary);
}

.issue-clear {
  place-items: center;
  min-height: 130px;
  border: 1px dashed var(--el-color-success-light-5);
  border-radius: 8px;
  background: var(--el-color-success-light-9);
  text-align: center;
}

.issue-clear .el-icon {
  color: var(--el-color-success);
  font-size: 26px;
}

.layer-details {
  margin-top: 14px;
  border-top: 1px solid var(--mx-border);
}

.layer-details-title {
  margin-right: 6px;
  color: var(--mx-text);
  font-size: 12px;
  font-weight: 700;
}

.layer-details small {
  color: var(--mx-sub);
  font-size: 11px;
}

.layer-details :deep(.el-collapse-item__content) {
  padding-bottom: 0;
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
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  padding: 9px;
  background: #fff;
  color: var(--mx-text);
  text-align: left;
  cursor: pointer;
}

.layer-row:hover {
  border-color: var(--el-color-primary);
  background: var(--mx-soft);
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
  color: var(--mx-sub);
  text-align: center;
}

.empty-state .el-icon {
  color: var(--el-color-primary);
  font-size: 28px;
}

@media (max-width: 1180px) {
  .map-inspector {
    grid-template-columns: 1fr;
  }

  .layer-summary {
    max-height: 260px;
  }
}

@media (max-width: 720px) {
  .calibration-grid {
    grid-template-columns: 1fr;
  }
}

.building-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.building-photo-item {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-light);
}

.building-photo-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.building-photo-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: rgba(0,0,0,0.55);
  color: #fff;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
}

.building-photo-remove:hover { background: var(--el-color-danger); }

.building-photo-upload {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 6px;
  border: 1px dashed var(--el-border-color);
  color: var(--el-text-color-secondary);
  cursor: pointer;
  font-size: 20px;
  transition: border-color 0.15s, color 0.15s;
}

.building-photo-upload:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.building-photo-upload.is-uploading {
  pointer-events: none;
  opacity: 0.6;
}

.checkin-review-card {
  margin-bottom: 18px;
  padding: 14px;
  border: 1px solid #f3d19e;
  border-radius: 12px;
  background: #fdf6ec;
}

.checkin-review-head,
.checkin-review-row,
.checkin-review-actions {
  display: flex;
  align-items: center;
}

.checkin-review-head {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.checkin-review-head strong,
.checkin-review-head small,
.checkin-review-row strong,
.checkin-review-row small {
  display: block;
}

.checkin-review-head small,
.checkin-review-row small {
  margin-top: 3px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.checkin-review-row {
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  background: #fff;
}

.checkin-review-row + .checkin-review-row {
  margin-top: 8px;
}

.checkin-review-row > img {
  width: 58px;
  height: 58px;
  flex: none;
  border-radius: 8px;
  object-fit: cover;
}

.checkin-review-row > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.checkin-review-actions {
  gap: 6px;
  flex: none;
}
</style>
