<template>
  <aside class="map-inspector">
    <div class="inspector-head">
      <div>
        <strong>属性面板</strong>
        <span>{{ selectedEditableItem ? selectedEditableItem.label : '图层总览' }}</span>
      </div>
      <el-button v-if="selectedEditableItem" text @click="$emit('clearSelection')">取消选择</el-button>
    </div>

    <div v-if="selectedEditableItem" class="inspector-editor" @focusin="$emit('beforeEdit')" @pointerdown="$emit('beforeEdit')">
      <el-form label-position="top">
        <el-form-item label="名称">
          <el-input v-model="selectedEditableItem.item.title" maxlength="30" />
        </el-form-item>

        <template v-if="selectedEditableItem.kind === 'poi' || selectedEditableItem.kind === 'area'">
          <el-form-item label="官方项目">
            <el-select
              :model-value="selectedEditableItem.item.officialNumber"
              filterable
              placeholder="选择 1-37 号项目"
              @change="$emit('assignProject', Number($event))"
            >
              <el-option
                v-for="project in projectCatalog"
                :key="project.officialNumber"
                :label="`#${project.officialNumber} ${project.officialName}`"
                :value="project.officialNumber"
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
          </div>

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
        <strong>从左侧工具开始绘制</strong>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Aim, Delete, EditPen } from '@element-plus/icons-vue'

defineProps<{
  selectedEditableItem: any | null
  semanticCategories: Array<{ type: string; label: string; color: string }>
  projectCatalog: any[]
  editorMode: string
  pois: any[]
  areas: any[]
  routes: any[]
  calibrationPoints: any[]
  formatLngLat: (point: any) => string
}>()

defineEmits<{
  clearSelection: []
  beforeEdit: []
  pickLocation: []
  syncSemantic: []
  syncAvailability: [status: 'open' | 'unopened']
  assignProject: [officialNumber: number]
  removePoi: [id: string]
  removeArea: [id: string]
  removeRoute: [id: string]
  removeCalibration: [id: string]
  selectLayerItem: [kind: string, id: string]
}>()
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
</style>
