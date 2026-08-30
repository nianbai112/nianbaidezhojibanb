<template>
  <div class="map-top-strip">
    <div class="workflow-copy">
      <strong>{{ activeGuide.title }}</strong>
      <span>{{ activeGuide.message }}</span>
    </div>

    <div class="toolbar-left">
      <span class="artwork-surface-badge">画师矢量图工作台</span>
      <el-radio-group :model-value="toolMode" size="small" @change="emitToolMode">
        <el-radio-button v-for="tool in tools" :key="tool.value" :label="tool.value">
          {{ tool.label }}
        </el-radio-button>
      </el-radio-group>
      <el-select
        v-if="toolMode === 'poi'"
        :model-value="poiCategory"
        size="small"
        class="category-select"
        @update:model-value="emitPoiCategory"
      >
        <el-option
          v-for="item in semanticCategories"
          :key="item.type"
          :label="item.label"
          :value="item.type"
        />
      </el-select>
    </div>
    <div class="toolbar-right">
      <el-button-group size="small">
        <el-button :disabled="!undoCount" @click="$emit('undo')">撤销</el-button>
        <el-button :disabled="!redoCount" @click="$emit('redo')">重做</el-button>
      </el-button-group>
      <el-button v-if="toolMode === 'area'" size="small" :icon="Finished" @click="$emit('finishArea')">完成建筑</el-button>
      <el-button v-if="toolMode === 'area'" size="small" text @click="$emit('clearDraftArea')">清空草稿</el-button>
      <el-button v-if="toolMode === 'route'" size="small" :icon="Finished" @click="$emit('finishRoute')">完成路线</el-button>
      <el-button v-if="toolMode === 'route'" size="small" text @click="$emit('clearDraftRoute')">清空草稿</el-button>
      <el-button v-if="toolMode === 'poi'" size="small" :icon="Plus" @click="$emit('addPoi')">标一个地点</el-button>
      <el-button v-if="toolMode === 'calibration'" size="small" :icon="Plus" @click="$emit('addCalibration')">加校准点</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Finished, Plus } from '@element-plus/icons-vue'

const props = defineProps<{
  editorMode: string
  toolMode: string
  poiCategory: string
  semanticCategories: Array<{ type: string; label: string }>
  undoCount: number
  redoCount: number
}>()

const emit = defineEmits<{
  'update:editorMode': [value: string]
  'update:toolMode': [value: string]
  'update:poiCategory': [value: string]
  undo: []
  redo: []
  finishArea: []
  clearDraftArea: []
  finishRoute: []
  clearDraftRoute: []
  addPoi: []
  addCalibration: []
}>()

const guides: Record<string, { title: string; message: string }> = {
  select: {
    title: '查看和整理对象',
    message: '点击图上的点、线、建筑，右侧可以改名、分类或删除。',
  },
  poi: {
    title: '标地点',
    message: '在图上点击添加楼栋、校门、食堂、服务点；右侧可改类型。',
  },
  area: {
    title: '圈建筑或区域',
    message: '沿建筑边界连续点击，完成后点“完成建筑”。',
  },
  route: {
    title: '画路线',
    message: '沿道路或步行路线连续点击，完成后点“完成路线”。',
  },
  calibration: {
    title: '校准真实位置',
    message: '选择 CAD 上的明显点，再填写或用真实地图定位经纬度。',
  },
}

const activeGuide = computed(() => guides[String(props.toolMode)] || guides.select)
const tools = [
  { value: 'select', label: '查看' },
  { value: 'poi', label: '点位' },
  { value: 'area', label: '建筑' },
  { value: 'route', label: '路线' },
  { value: 'calibration', label: '校准' },
]

function emitToolMode(value: string | number | boolean) {
  emit('update:toolMode', String(value))
}

function emitPoiCategory(value: string | number | boolean) {
  emit('update:poiCategory', String(value))
}
</script>

<style scoped>
.map-top-strip {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  background: #fff;
}

.workflow-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.workflow-copy strong {
  overflow: hidden;
  color: var(--mx-text);
  font-size: 14px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-copy span {
  overflow: hidden;
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.category-select {
  width: 128px;
}

.artwork-surface-badge {
  border: 1px solid #86efac;
  border-radius: 999px;
  padding: 5px 10px;
  background: #f0fdf4;
  color: #166534;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .map-top-strip {
    grid-template-columns: 1fr;
  }
}
</style>
