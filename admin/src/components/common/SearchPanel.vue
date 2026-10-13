<template>
  <form class="search-panel glass-card" role="search" @submit.prevent="$emit('search')">
    <div class="search-fields">
      <slot />
    </div>
    <div class="search-actions">
      <el-button type="primary" native-type="submit">
        <el-icon><Search /></el-icon> 搜索
      </el-button>
      <el-button @click="$emit('reset')">重置</el-button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'

defineEmits<{
  search: []
  reset: []
}>()
</script>

<style scoped>
.search-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  align-items: flex-end;
  padding: 16px 20px;
  margin-bottom: 16px;
  background: var(--mx-card);
  border-radius: var(--mx-radius);
  border: 1px solid var(--mx-border);
}

.search-fields {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1 1 600px;
  min-width: 0;
  align-items: center;
}

.search-fields :deep(> *) { max-width: 100%; }

.search-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}

@media (max-width: 640px) {
  .search-panel { padding: 16px; gap: 12px; }
  .search-fields { flex-basis: 100%; }
  .search-fields :deep(> *) { flex: 1 1 160px; min-width: 0; }
  .search-actions { width: 100%; justify-content: flex-end; }
}
</style>
