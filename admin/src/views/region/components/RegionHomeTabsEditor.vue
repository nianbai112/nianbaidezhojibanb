<template>
  <div class="section-card glass-card">
    <div class="section-head">
      <div class="card-title">首页选项卡配置</div>
      <el-button size="small" @click="handleReset">恢复默认</el-button>
    </div>
    <div class="form-tip" style="margin-bottom:16px">控制小程序首页顶部的 Tab 栏。拖拽排序，修改名称，启用/禁用。</div>
    <div class="sortable-list">
      <div v-for="(tab, idx) in tabs" :key="tab.id" class="sortable-item">
        <div class="sortable-grip">☰</div>
        <div class="sortable-content">
          <el-input v-model="tab.name" size="small" style="width:140px" />
          <span class="muted">ID: {{ tab.id }}</span>
        </div>
        <el-switch v-model="tab.enabled" size="small" />
        <div class="sortable-actions">
          <el-button size="small" circle :disabled="idx === 0" @click="moveItem(idx, -1)">
            <el-icon><Top /></el-icon>
          </el-button>
          <el-button size="small" circle :disabled="idx === tabs.length - 1" @click="moveItem(idx, 1)">
            <el-icon><Bottom /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Top, Bottom } from '@element-plus/icons-vue'

interface TabItem {
  id: string
  name: string
  enabled: boolean
}

interface Props {
  tabs?: TabItem[]
  defaultTabs?: TabItem[]
}

const props = withDefaults(defineProps<Props>(), {
  tabs: () => [],
  defaultTabs: () => [
    { id: '0', name: '笔记', enabled: true },
    { id: '1', name: '外卖', enabled: true },
    { id: '2', name: '二手', enabled: true },
    { id: '3', name: '活动', enabled: true },
    { id: '4', name: '评分', enabled: true },
    { id: '5', name: '打卡地点', enabled: true }
  ]
})

const emit = defineEmits<{
  'update:tabs': [value: TabItem[]]
}>()

const tabs = computed({
  get: () => props.tabs,
  set: (val) => emit('update:tabs', val)
})

function moveItem(idx: number, dir: number) {
  const target = idx + dir
  if (target < 0 || target >= tabs.value.length) return

  const newTabs = [...tabs.value]
  const tmp = newTabs[idx]
  newTabs[idx] = newTabs[target]
  newTabs[target] = tmp
  tabs.value = newTabs
}

function handleReset() {
  tabs.value = JSON.parse(JSON.stringify(props.defaultTabs))
}
</script>

<style scoped lang="scss">
.section-card {
  padding: 0;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 4px;
}

.form-tip {
  color: var(--mx-muted);
  font-size: 12px;
  margin-top: 4px;
  padding: 0 24px;
}

.sortable-list {
  display: grid;
  gap: 8px;
  padding: 0 24px 24px;
}

.sortable-item {
  display: grid;
  grid-template-columns: 28px 1fr auto 80px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid color-mix(in srgb, var(--mx-border) 60%, transparent);
}

.sortable-grip {
  cursor: grab;
  color: var(--mx-muted);
  font-size: 16px;
  user-select: none;
}

.sortable-content {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.muted {
  color: var(--mx-muted);
  font-size: 12px;
}

.sortable-actions {
  display: flex;
  gap: 4px;
}
</style>
