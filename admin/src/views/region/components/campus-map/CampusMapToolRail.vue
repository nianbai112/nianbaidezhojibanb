<template>
  <aside class="map-tool-rail" aria-label="校园地图步骤">
    <div class="workflow-title">
      <strong>地图步骤</strong>
      <span>{{ stageText }}</span>
    </div>

    <div class="workflow-cards">
      <button
        v-for="step in steps"
        :key="step.key"
        type="button"
        class="workflow-card"
        :class="[step.status, { disabled: step.disabled }]"
        :disabled="step.disabled"
        @click="handleStepClick(step.key)"
      >
        <span>{{ step.title }}</span>
        <small>{{ step.subtitle }}</small>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { campusMapWorkflowSteps } from './cadWorkbenchModel.mjs'

const props = defineProps<{
  modelValue: string
  editorMode: string
  hasVectorBaseMap: boolean
  hasVisualBaseMap: boolean
  calibrationPointCount: number
  featureCount: number
  canPublish: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  importCad: []
  switchAmap: []
  openQuality: []
}>()

const steps = computed(() => campusMapWorkflowSteps({
  editorMode: props.editorMode,
  hasVisualBaseMap: props.hasVisualBaseMap,
  hasVectorBaseMap: props.hasVectorBaseMap,
  featureCount: props.featureCount,
  calibrationPointCount: props.calibrationPointCount,
  canPublish: props.canPublish,
}))

const stageText = computed(() => {
  if (!props.hasVisualBaseMap && props.featureCount === 0) return '先准备底图'
  if (props.calibrationPointCount < 3) return '在画师图上管理地点，按需补真实坐标'
  if (!props.canPublish) return '补齐名称和关键点位'
  return '检查通过，准备发布'
})

function handleStepClick(key: string) {
  if (key === 'cad') emit('importCad')
  if (key === 'draw') emit('update:modelValue', 'select')
  if (key === 'amap') emit('switchAmap')
  if (key === 'preview') emit('openQuality')
}
</script>

<style scoped>
.map-tool-rail {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  background: var(--mx-soft);
}

.workflow-title,
.workflow-cards {
  display: grid;
  gap: 10px;
}

.workflow-title strong {
  color: var(--mx-text);
  font-size: 14px;
}

.workflow-title span,
.tool-section > span {
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
}

.workflow-card {
  display: grid;
  gap: 4px;
  width: 100%;
  min-height: 64px;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  padding: 10px;
  background: #fff;
  color: var(--el-text-color-regular);
  text-align: left;
  cursor: pointer;
}

.workflow-card span {
  overflow: hidden;
  color: var(--mx-text);
  font-size: 14px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-card small {
  overflow: hidden;
  color: var(--mx-sub);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-card:hover {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}

.workflow-card.current {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 8px 20px rgba(37, 99, 235, .12);
}

.workflow-card.done {
  border-color: #86efac;
  background: var(--el-color-success-light-9);
}

.workflow-card.disabled {
  opacity: .52;
  cursor: not-allowed;
}

@media (max-width: 1180px) {
  .workflow-cards {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .workflow-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
