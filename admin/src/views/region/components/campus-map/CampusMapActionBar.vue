<template>
  <section class="map-action-bar">
    <div class="cockpit-heading">
      <div class="map-title-block">
        <div class="title-line">
          <div class="card-title">校园地图发布</div>
          <el-tag size="small" effect="plain">画师矢量图</el-tag>
        </div>
        <div class="form-tip">{{ regionName || '当前区域' }} · 先清空阻塞，再把当前批次上线</div>
      </div>

      <div class="release-meta" aria-label="发布状态">
        <span v-if="hasUnsavedChanges" class="warning">未保存</span>
        <span v-if="draftRevision">草稿 r{{ draftRevision }}</span>
        <span v-if="activeVersion" :class="{ warning: !publicationVerified }">线上 v{{ activeVersion }}</span>
        <span :class="{ warning: !publicationVerified }">{{ publishedPlaceCount }} 个公开地点</span>
        <span :class="{ warning: !canPublish }">{{ publishSummary }}</span>
      </div>

      <div class="primary-actions">
        <el-button :icon="OfficeBuilding" @click="$emit('run-action', 'catalog')">补地点</el-button>
        <el-button :icon="Position" @click="$emit('run-action', 'collection')">派采集</el-button>
        <el-button
          :icon="DocumentChecked"
          :loading="draftSaving"
          :disabled="!hasUnsavedChanges"
          @click="$emit('run-action', 'save')"
        >
          保存草稿
        </el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="$emit('run-action', 'publish')">
          发布本批
        </el-button>
        <el-dropdown trigger="click" @command="$emit('operation', $event)">
          <el-button :icon="MoreFilled" aria-label="更多运维操作" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="import">导入 CAD</el-dropdown-item>
              <el-dropdown-item command="catalog">地点档案全量管理</el-dropdown-item>
              <el-dropdown-item command="preview">小程序预览</el-dropdown-item>
              <el-dropdown-item command="versions">版本历史与回滚</el-dropdown-item>
              <el-dropdown-item command="advanced">高级设置</el-dropdown-item>
              <el-dropdown-item command="refresh" :disabled="loading">刷新数据</el-dropdown-item>
              <el-dropdown-item command="disable" divided>停用地图</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="release-stage-list" aria-label="校园地图发布阶段">
      <button
        v-for="stage in releaseCockpit.stages"
        :key="stage.key"
        type="button"
        class="release-stage"
        :class="[stage.status, { active: activeStage === stage.key }]"
        @click="$emit('select-stage', stage.key)"
      >
        <span>{{ stage.label }}</span>
        <strong>{{ stage.completed }}/{{ stage.total }}</strong>
        <small>{{ stage.summary }}</small>
      </button>
    </div>

    <div class="release-focus" :class="releaseCockpit.issues.length ? 'blocked' : 'ready'">
      <span>{{ releaseCockpit.issues.length ? '下一步' : '发布状态' }}</span>
      <div>
        <strong>{{ releaseCockpit.nextAction.label }}</strong>
        <small>{{ releaseCockpit.nextAction.message }}</small>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Check, DocumentChecked, MoreFilled, OfficeBuilding, Position } from '@element-plus/icons-vue'

type ReleaseStage = {
  key: string
  label: string
  completed: number
  total: number
  status: 'pass' | 'warning' | 'error'
  summary: string
}

type ReleaseCockpit = {
  stages: ReleaseStage[]
  issues: any[]
  nextAction: { action: string; label: string; message: string }
}

defineProps<{
  regionName?: string
  releaseCockpit: ReleaseCockpit
  activeStage: string
  publishSummary: string
  canPublish: boolean
  activeVersion: number
  publishedPlaceCount: number
  publicationVerified: boolean
  draftRevision: number
  hasUnsavedChanges: boolean
  loading: boolean
  saving: boolean
  draftSaving: boolean
}>()

defineEmits<{
  'select-stage': [stage: string]
  'run-action': [action: 'catalog' | 'collection' | 'save' | 'publish']
  operation: [command: string]
}>()
</script>

<style scoped>
.map-action-bar {
  display: grid;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid rgba(203, 213, 225, .9);
  border-radius: 10px;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 14px 30px rgba(15, 23, 42, .06);
}

.cockpit-heading {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto auto;
  gap: 16px;
  align-items: center;
}

.map-title-block,
.release-focus div {
  min-width: 0;
}

.title-line,
.release-meta,
.primary-actions {
  display: flex;
  align-items: center;
}

.title-line {
  gap: 9px;
}

.release-meta {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  color: var(--mx-sub);
  font-size: 12px;
}

.release-meta span {
  flex: none;
  border: 1px solid var(--mx-border-strong);
  border-radius: 999px;
  padding: 4px 8px;
  background: var(--mx-soft);
  white-space: nowrap;
}

.release-meta .warning {
  border-color: var(--el-color-warning-light-7);
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
}

.primary-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.release-stage-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.release-stage {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 8px;
  min-width: 0;
  border: 1px solid var(--mx-border);
  border-radius: 8px;
  padding: 10px 11px;
  background: #fff;
  color: var(--mx-text);
  text-align: left;
  cursor: pointer;
}

.release-stage::before {
  position: absolute;
  inset: -1px auto -1px -1px;
  width: 4px;
  border-radius: 8px 0 0 8px;
  background: var(--el-color-danger);
  content: '';
}

.release-stage.pass::before {
  background: var(--el-color-success);
}

.release-stage.warning::before {
  background: var(--el-color-warning);
}

.release-stage.active {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-9);
}

.release-stage span,
.release-stage strong {
  font-size: 13px;
}

.release-stage strong {
  color: var(--el-color-primary-dark-2);
}

.release-stage small {
  grid-column: 1 / -1;
  overflow: hidden;
  color: var(--mx-sub);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.release-focus {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--el-color-danger-light-9);
}

.release-focus.ready {
  background: var(--el-color-success-light-9);
}

.release-focus > span {
  border-radius: 999px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, .8);
  color: var(--el-color-danger-dark-2);
  font-size: 11px;
  font-weight: 700;
}

.release-focus.ready > span {
  color: var(--el-color-success-dark-2);
}

.release-focus div {
  display: grid;
  gap: 2px;
}

.release-focus strong {
  color: var(--mx-text);
  font-size: 13px;
}

.release-focus small {
  overflow: hidden;
  color: var(--mx-sub);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1380px) {
  .cockpit-heading {
    grid-template-columns: minmax(220px, 1fr) auto;
  }

  .release-meta {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: flex-start;
  }
}

@media (max-width: 980px) {
  .cockpit-heading {
    grid-template-columns: 1fr;
  }

  .release-meta,
  .primary-actions {
    grid-column: auto;
    grid-row: auto;
    justify-content: flex-start;
  }

  .release-stage-list {
    grid-template-columns: 1fr;
  }
}
</style>
