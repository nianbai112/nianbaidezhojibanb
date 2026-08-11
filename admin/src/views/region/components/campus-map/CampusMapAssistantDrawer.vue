<template>
  <el-drawer
    :model-value="modelValue"
    title="地图配置助手"
    size="500px"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="assistant-panel drawer-panel">
      <div class="assistant-hero" :class="assistantHealthLevel">
        <div class="assistant-score-ring">{{ mapAssistantScore }}%</div>
        <div class="assistant-hero-copy">
          <strong>{{ mapAssistantSummary }}</strong>
          <span>{{ assistantNextAction.message }}</span>
        </div>
      </div>

      <div class="assistant-next-card">
        <div>
          <span>下一步</span>
          <strong>{{ assistantNextAction.label }}</strong>
        </div>
        <el-button type="primary" :disabled="!assistantNextAction.action" @click="$emit('runAction', assistantNextAction.action)">
          {{ assistantNextAction.buttonText }}
        </el-button>
      </div>

      <div class="assistant-section">
        <div class="assistant-section-title">配置流程</div>
        <div class="assistant-step-list">
          <div
            v-for="step in mapAssistantSteps"
            :key="step.key"
            class="assistant-step"
            :class="step.status"
          >
            <span>{{ step.order }}</span>
            <div>
              <strong>{{ step.label }}</strong>
              <small>{{ step.message }}</small>
            </div>
            <el-button v-if="step.action" text @click="$emit('runAction', step.action)">{{ step.actionLabel }}</el-button>
          </div>
        </div>
      </div>

      <div class="assistant-section">
        <div class="assistant-section-title">关键地点</div>
        <div class="key-place-grid">
          <button
            v-for="place in keyPlaceCoverage"
            :key="place.type"
            type="button"
            class="key-place-chip"
            :class="{ done: place.done }"
            @click="$emit('focusKeyPlace', place.type)"
          >
            <i :style="{ background: place.color }"></i>
            <span>{{ place.label }}</span>
            <small>{{ place.done ? `${place.count} 个` : '未配置' }}</small>
          </button>
        </div>
      </div>

      <div class="assistant-section">
        <div class="assistant-section-title">风险提醒</div>
        <div v-if="assistantWarnings.length" class="assistant-warning-list">
          <div v-for="warning in assistantWarnings" :key="warning">{{ warning }}</div>
        </div>
        <div v-else class="assistant-clear-state">当前没有明显风险，可以继续预览或发布。</div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  assistantHealthLevel: string
  mapAssistantScore: number
  mapAssistantSummary: string
  assistantNextAction: any
  mapAssistantSteps: any[]
  keyPlaceCoverage: any[]
  assistantWarnings: string[]
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
  runAction: [action: string]
  focusKeyPlace: [type: string]
}>()
</script>

<style scoped>
.drawer-panel {
  margin-bottom: 0;
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
  border: 1px solid var(--mx-border-strong);
  border-radius: 6px;
  background: var(--mx-soft);
}

.assistant-hero.good {
  border-color: var(--el-color-success-light-7);
  background: var(--el-color-success-light-9);
}

.assistant-hero.medium {
  border-color: var(--el-color-warning-light-7);
  background: var(--el-color-warning-light-9);
}

.assistant-hero.low {
  border-color: var(--el-color-danger-light-7);
  background: var(--el-color-danger-light-9);
}

.assistant-score-ring {
  display: grid;
  place-items: center;
  width: 70px;
  height: 70px;
  border: 6px solid var(--el-color-primary);
  border-radius: 50%;
  background: #fff;
  color: var(--mx-text);
  font-size: 18px;
  font-weight: 900;
}

.assistant-hero-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.assistant-hero-copy strong {
  color: var(--mx-text);
  font-size: 17px;
}

.assistant-hero-copy span {
  color: var(--mx-sub);
  font-size: 12px;
  line-height: 1.5;
}

.assistant-next-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--mx-border-strong);
  border-radius: 6px;
  background: #fff;
}

.assistant-next-card > div {
  display: grid;
  gap: 3px;
}

.assistant-next-card span,
.assistant-section-title {
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 800;
}

.assistant-next-card strong {
  color: var(--mx-text);
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
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  background: #fff;
}

.assistant-step > span {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--mx-border);
  color: var(--mx-sub);
  font-size: 12px;
  font-weight: 900;
}

.assistant-step.pass {
  border-color: var(--el-color-success-light-7);
}

.assistant-step.pass > span {
  background: #dcfce7;
  color: var(--el-color-success-dark-2);
}

.assistant-step.warning {
  border-color: var(--el-color-warning-light-7);
}

.assistant-step.warning > span {
  background: #ffedd5;
  color: var(--el-color-warning-dark-2);
}

.assistant-step.error {
  border-color: var(--el-color-danger-light-7);
}

.assistant-step.error > span {
  background: #fee2e2;
  color: var(--el-color-danger);
}

.assistant-step div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.assistant-step strong {
  color: var(--mx-text);
  font-size: 13px;
}

.assistant-step small {
  color: var(--mx-sub);
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
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  padding: 8px;
  background: #fff;
  color: var(--mx-text);
  text-align: left;
  cursor: pointer;
}

.key-place-chip.done {
  border-color: var(--el-color-success-light-7);
  background: var(--el-color-success-light-9);
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
  color: var(--mx-sub);
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
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
  line-height: 1.45;
}

.assistant-clear-state {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success-dark-2);
}

@media (max-width: 720px) {
  .key-place-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
