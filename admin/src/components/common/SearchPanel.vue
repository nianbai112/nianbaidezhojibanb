<template>
  <div class="search-panel glass-card">
    <div class="search-fields">
      <slot />
    </div>
    <div class="search-actions">
      <el-button type="primary" @click="$emit('search')">
        <el-icon><Search /></el-icon> 搜索
      </el-button>
      <el-button @click="$emit('reset')">重置</el-button>
    </div>
  </div>
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
  justify-content: space-between;
  align-items: flex-end;
  padding: 16px 20px;
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.search-fields {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1;
}

.search-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>
