<template>
  <el-drawer
    :model-value="modelValue"
    title="CAD 图纸导入"
    size="560px"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="import-panel drawer-panel">
      <el-upload
        drag
        action=""
        :auto-upload="false"
        :show-file-list="false"
        accept=".dxf,.dwg,.geojson,.json,.png,.jpg,.jpeg"
        :on-change="handleFileChange"
      >
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-title">上传 CAD / GeoJSON / 校园底图</div>
        <div class="upload-tip">推荐 DXF，DWG 会尝试调用服务器 ODA 转换器；转换后可继续编辑建筑、路线和点位。</div>
      </el-upload>

      <div v-if="converterStatus" class="converter-card" :class="{ ready: converterStatus.ready, missing: !converterStatus.ready }">
        <div class="converter-head">
          <strong>服务器 DWG 转换器</strong>
          <el-tag :type="converterStatus.ready ? 'success' : 'warning'" effect="plain">
            {{ converterStatus.ready ? '已就绪' : '未检测到' }}
          </el-tag>
        </div>
        <p>{{ converterStatus.message }}</p>
        <div v-if="converterStatus.path" class="converter-path">{{ converterStatus.path }}</div>
        <div v-else-if="converterStatus.instructions?.length" class="converter-tips">
          <div v-for="item in converterStatus.instructions.slice(0, 3)" :key="item">{{ item }}</div>
        </div>
      </div>

      <div v-if="activeImportJob" class="import-job-card" :class="activeImportJob.status">
        <div class="import-job-head">
          <div>
            <strong>{{ activeImportJob.source?.fileName || '导入任务' }}</strong>
            <span>{{ activeImportJob.message }}</span>
          </div>
          <el-tag effect="plain">{{ importStatusLabel(activeImportJob.status) }}</el-tag>
        </div>
        <el-progress
          v-if="activeImportJob.status !== 'processing'"
          :percentage="activeImportJob.progress || 0"
          :status="activeImportJob.status === 'failed' ? 'exception' : activeImportJob.status === 'draft_ready' ? 'success' : undefined"
        />
        <div v-else class="processing-note">
          <span>正在转换，转换器不会提供可靠百分比。</span>
          <small>完成或失败后会自动更新；可随时删除任务并中止转换。</small>
        </div>

        <div v-if="activeImportJob.report?.summary?.length" class="import-summary">
          <div v-for="item in activeImportJob.report.summary" :key="item">{{ item }}</div>
        </div>

        <div v-if="activeImportJob.report?.warnings?.length" class="import-warnings">
          <div v-for="item in activeImportJob.report.warnings" :key="item">{{ item }}</div>
        </div>

        <div v-if="activeImportJob.report?.layers?.length" class="import-layer-list">
          <div class="import-layer-row head">
            <span>图层</span>
            <span>类型</span>
            <span>导入</span>
          </div>
          <div
            v-for="layer in activeImportJob.report.layers.slice(0, 8)"
            :key="layer.name"
            class="import-layer-row"
          >
            <span>{{ layer.name }}</span>
            <span>{{ layer.role }}</span>
            <span>{{ layer.importedCount }}/{{ layer.featureCount }}</span>
          </div>
        </div>

        <div class="import-actions">
          <el-button
            type="primary"
            :disabled="activeImportJob.status !== 'draft_ready'"
            @click="$emit('applyDraft', activeImportJob)"
          >
            应用到地图工作台
          </el-button>
          <el-button
            v-if="activeImportJob.status === 'needs_converter' || activeImportJob.status === 'failed'"
            type="warning"
            :loading="importing"
            @click="$emit('retryJob', activeImportJob.id)"
          >
            重新转换
          </el-button>
          <el-button type="danger" plain :loading="importing" @click="$emit('deleteJob', activeImportJob.id)">
            删除任务
          </el-button>
          <el-button :loading="importing" @click="$emit('refreshJob', activeImportJob.id)">刷新状态</el-button>
        </div>
      </div>

      <div v-if="importJobs.length" class="import-history">
        <div class="history-title">最近导入</div>
        <button
          v-for="job in importJobs.slice(0, 5)"
          :key="job.id"
          type="button"
          class="history-row"
          @click="$emit('selectJob', job)"
        >
          <span>{{ job.source?.fileName || job.id }}</span>
          <small>{{ importStatusLabel(job.status) }}</small>
        </button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { UploadFilled } from '@element-plus/icons-vue'

const props = defineProps<{
  modelValue: boolean
  activeImportJob: any | null
  importJobs: any[]
  importing: boolean
  converterStatus: any | null
  importStatusLabel: (status: string) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  fileChange: [uploadFile: any]
  applyDraft: [job: any]
  refreshJob: [jobId: string]
  retryJob: [jobId: string]
  deleteJob: [jobId: string]
  selectJob: [job: any]
}>()

function handleFileChange(uploadFile: any) {
  emit('fileChange', uploadFile)
  return false
}
</script>

<style scoped>
.drawer-panel {
  margin-bottom: 0;
}

.import-panel {
  display: grid;
  gap: 16px;
}

.processing-note {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary-dark-2);
  font-size: 12px;
}

.processing-note small {
  color: var(--mx-sub);
}

.import-panel :deep(.el-upload-dragger) {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 180px;
  border-radius: 6px;
  background: var(--mx-soft);
}

.upload-icon {
  color: var(--el-color-primary);
  font-size: 30px;
}

.upload-title {
  color: var(--mx-text);
  font-size: 15px;
  font-weight: 900;
}

.upload-tip {
  max-width: 360px;
  color: var(--mx-sub);
  font-size: 12px;
  line-height: 1.5;
}

.converter-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--mx-border-strong);
  border-radius: 6px;
  background: var(--mx-soft);
}

.converter-card.ready {
  border-color: var(--el-color-success-light-7);
  background: #f7fef9;
}

.converter-card.missing {
  border-color: var(--el-color-warning-light-7);
  background: #fffaf4;
}

.converter-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.converter-head strong {
  color: var(--mx-text);
  font-size: 13px;
}

.converter-card p,
.converter-tips {
  margin: 0;
  color: var(--mx-sub);
  font-size: 12px;
  line-height: 1.5;
}

.converter-path {
  overflow: hidden;
  padding: 7px 9px;
  border-radius: 6px;
  background: #e8f5ee;
  color: var(--el-color-success-dark-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.converter-tips {
  display: grid;
  gap: 4px;
}

.import-job-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--mx-border-strong);
  border-radius: 6px;
  background: #fff;
}

.import-job-card.draft_ready {
  border-color: var(--el-color-success-light-7);
  background: #f8fffb;
}

.import-job-card.failed,
.import-job-card.needs_converter {
  border-color: var(--el-color-warning-light-7);
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
  color: var(--mx-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-job-head span,
.import-summary,
.import-warnings {
  color: var(--mx-sub);
  font-size: 12px;
  line-height: 1.5;
}

.import-warnings {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
}

.import-layer-list {
  overflow: hidden;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
}

.import-layer-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) 72px 66px;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid #edf2f7;
  color: var(--mx-sub);
  font-size: 12px;
}

.import-layer-row:first-child {
  border-top: 0;
}

.import-layer-row.head {
  background: var(--mx-soft);
  color: var(--mx-text);
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
  color: var(--mx-text);
  font-size: 13px;
  font-weight: 900;
}

.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  padding: 9px 10px;
  background: #fff;
  color: var(--mx-text);
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
  color: var(--mx-sub);
  font-size: 12px;
}
</style>
