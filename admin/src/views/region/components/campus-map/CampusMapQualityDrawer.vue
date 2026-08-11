<template>
  <el-drawer
    :model-value="modelValue"
    title="发布检查"
    size="420px"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="quality-panel drawer-panel">
      <div class="quality-summary" :class="{ ready: publishReadiness.canPublish }">
        {{ publishReadiness.summary }}
      </div>
      <div class="quality-list">
        <div
          v-for="item in checks"
          :key="item.key"
          class="quality-item"
          :class="item.status"
        >
          <span>{{ item.label }}</span>
          <small>{{ item.message }}</small>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  publishReadiness: any
  checks: Array<{ key: string; label: string; status: string; message: string }>
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<style scoped>
.drawer-panel {
  margin-bottom: 0;
}

.quality-panel {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  background: #fff;
}

.quality-summary {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
  font-weight: 700;
}

.quality-summary.ready {
  background: #ecfdf5;
  color: var(--el-color-success-dark-2);
}

.quality-list {
  display: grid;
  gap: 8px;
}

.quality-item {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  background: var(--mx-soft);
}

.quality-item span {
  color: var(--mx-text);
  font-size: 12px;
  font-weight: 800;
}

.quality-item small {
  color: var(--mx-sub);
  font-size: 12px;
  line-height: 1.4;
}

.quality-item.pass {
  border-color: var(--el-color-success-light-7);
  background: var(--el-color-success-light-9);
}

.quality-item.warning {
  border-color: var(--el-color-warning-light-7);
  background: var(--el-color-warning-light-9);
}

.quality-item.error {
  border-color: var(--el-color-danger-light-7);
  background: var(--el-color-danger-light-9);
}
</style>
