<template>
  <div class="page-header">
    <div class="ph-text">
      <h1>{{ title }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="ph-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
// P2 统一页头：纯排版（标题 + 副标题 + 右侧动作区）。
// icon 保留仅为兼容旧调用，不再渲染渐变图标块。
defineProps<{
  title: string
  subtitle?: string
  icon?: string
}>()
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
}

.ph-text {
  min-width: 0;
}

.ph-text h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--mx-text);
  letter-spacing: 0;
  font-family: var(--mx-font-display);
}

.ph-text p {
  margin: 5px 0 0;
  font-size: 13.5px;
  font-weight: 400;
  line-height: 1.55;
  color: var(--mx-muted);
}

.ph-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .ph-actions {
    justify-content: flex-start;
  }
}
</style>
