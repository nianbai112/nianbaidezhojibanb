<template>
  <div class="map-action-bar">
    <div class="map-title-block">
      <div class="card-title">校园地图</div>
      <div class="form-tip">{{ regionName || '当前区域' }}的小程序地图配置</div>
    </div>
    <div class="map-action-status">
      <span>{{ editorMode === 'amap' ? '高德绘制' : '图片底图' }}</span>
      <span>{{ poiCount }} 点位</span>
      <span>{{ areaCount }} 区域</span>
      <span>{{ routeCount }} 路线</span>
      <span v-if="activeVersion">线上 v{{ activeVersion }}</span>
      <span v-if="draftRevision">草稿 r{{ draftRevision }}</span>
      <span v-if="hasUnsavedChanges" class="warning">有未保存修改</span>
      <span :class="{ warning: !canPublish }">{{ publishSummary }}</span>
    </div>
    <div class="head-actions">
      <button type="button" class="assistant-score-pill" @click="$emit('assistant')">
        <el-icon><MagicStick /></el-icon>
        <strong>{{ assistantScore }}%</strong>
        <span>{{ assistantSummary }}</span>
      </button>
      <el-switch
        :model-value="enabled"
        inline-prompt
        active-text="开启"
        inactive-text="停用"
        @update:model-value="$emit('update:enabled', $event)"
      />
      <el-button :icon="UploadFilled" @click="$emit('import')">导入 CAD</el-button>
      <el-button :icon="RefreshRight" :loading="loading" @click="$emit('refresh')">刷新</el-button>
      <el-button :icon="Setting" @click="$emit('advanced')">高级</el-button>
      <el-button :icon="View" @click="$emit('preview')">预览</el-button>
      <el-button :icon="Warning" @click="$emit('quality')">检查</el-button>
      <el-button :icon="Clock" @click="$emit('versions')">版本历史</el-button>
      <el-button :icon="DocumentChecked" :loading="draftSaving" @click="$emit('save-draft')">保存草稿</el-button>
      <el-button type="danger" plain :icon="Delete" :loading="disabling" @click="$emit('disable')">停用</el-button>
      <el-button type="primary" :icon="Check" :loading="saving" @click="$emit('publish')">发布</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Check,
  Clock,
  Delete,
  DocumentChecked,
  MagicStick,
  RefreshRight,
  Setting,
  UploadFilled,
  View,
  Warning,
} from '@element-plus/icons-vue'

defineProps<{
  regionName?: string
  editorMode: string
  poiCount: number
  areaCount: number
  routeCount: number
  publishSummary: string
  canPublish: boolean
  activeVersion: number
  draftRevision: number
  hasUnsavedChanges: boolean
  assistantScore: number
  assistantSummary: string
  enabled: boolean
  loading: boolean
  saving: boolean
  draftSaving: boolean
  disabling: boolean
}>()

defineEmits<{
  'update:enabled': [value: boolean]
  assistant: []
  import: []
  refresh: []
  advanced: []
  preview: []
  quality: []
  versions: []
  'save-draft': []
  disable: []
  publish: []
}>()
</script>

<style scoped>
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
  color: var(--mx-sub);
  font-size: 12px;
  white-space: nowrap;
}

.map-action-status span {
  border: 1px solid var(--mx-border-strong);
  border-radius: 999px;
  padding: 5px 9px;
  background: var(--mx-soft);
}

.map-action-status .warning {
  border-color: var(--el-color-warning-light-7);
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.assistant-score-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
  padding: 0 10px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary-dark-2);
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

@media (max-width: 1280px) {
  .map-action-bar {
    grid-template-columns: 1fr;
  }

  .map-action-status {
    flex-wrap: wrap;
  }

  .head-actions {
    justify-content: flex-start;
  }
}
</style>
