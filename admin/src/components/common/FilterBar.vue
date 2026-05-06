<template>
  <div class="filter-bar">
    <div class="filter-items">
      <slot />
    </div>
    <div class="filter-actions">
      <a-button type="primary" @click="$emit('search')">
        <template #icon><search-outlined /></template>
        搜索
      </a-button>
      <a-button @click="$emit('reset')">
        <template #icon><reload-outlined /></template>
        重置
      </a-button>
      <a-button
        v-if="showExpand"
        type="link"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收起' : '展开' }}
        <down-outlined :class="{ rotated: expanded }" />
      </a-button>
    </div>
  </div>
  <!-- 展开收起区 -->
  <div v-if="showExpand" v-show="expanded" class="filter-bar filter-expand">
    <slot name="expand" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { SearchOutlined, ReloadOutlined, DownOutlined } from '@ant-design/icons-vue'

defineProps<{
  showExpand?: boolean
}>()

defineEmits<{
  (e: 'search'): void
  (e: 'reset'): void
}>()

const expanded = ref(false)
</script>

<style lang="less" scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e8edf5;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .05);
  margin-bottom: 16px;
  align-items: center;

  .filter-items {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .filter-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .rotated {
    transform: rotate(180deg);
    transition: transform 0.2s;
  }
}

.filter-expand {
  margin-top: -12px;
  border-top: 1px solid #f0f0f0;
  border-radius: 0 0 6px 6px;
}

@media (max-width: 768px) {
  .filter-bar {
    padding: 12px;

    .filter-items,
    .filter-actions {
      width: 100%;
    }

    .filter-actions .ant-btn {
      flex: 1;
    }
  }
}
</style>
