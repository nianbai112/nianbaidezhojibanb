<template>
  <div class="preview-tabbar">
    <div class="tabbar-container" :style="tabbarStyle">
      <div
        v-for="(tab, index) in displayTabs"
        :key="index"
        class="tabbar-item"
        :class="{ active: currentIndex === index, disabled: !tab.enabled, publish: tab.isPublish }"
        @click="currentIndex = index"
      >
        <div class="tabbar-icon-wrapper">
          <div class="tabbar-icon" :style="getIconStyle(tab, index)">
            <img v-if="getIcon(tab, index)" :src="getIcon(tab, index)" :alt="tab.name" />
            <svg v-else class="default-icon" viewBox="0 0 24 24" fill="currentColor">
              <path :d="getDefaultIconPath(index)" />
            </svg>
          </div>
          <span v-if="getBadgeCount(tab) > 0" class="badge">{{ getBadgeCount(tab) > 99 ? '99+' : getBadgeCount(tab) }}</span>
        </div>
        <span class="tabbar-text" :style="{ color: getTextColor(tab, index) }">{{ tab.name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  tabs?: any[]
  color?: string
  selectedColor?: string
  backgroundColor?: string
}>()

const currentIndex = ref(0)

const defaultTabs = [
  { name: '首页', iconPath: '', selectedIconPath: '', enabled: true },
  { name: '圈子', iconPath: '', selectedIconPath: '', enabled: true },
  { name: '发布', iconPath: '', selectedIconPath: '', enabled: true, isPublish: true },
  { name: '消息', iconPath: '', selectedIconPath: '', enabled: true, badge: 3 },
  { name: '我的', iconPath: '', selectedIconPath: '', enabled: true }
]

const displayTabs = computed(() => {
  return props.tabs?.length ? props.tabs : defaultTabs
})

const tabbarStyle = computed(() => ({
  backgroundColor: props.backgroundColor || '#ffffff'
}))

const getIcon = (tab: any, index: number) => {
  if (currentIndex.value === index) {
    return tab.selectedIconPath || tab.iconPath || ''
  }
  return tab.iconPath || ''
}

const getIconStyle = (tab: any, index: number) => {
  const isActive = currentIndex.value === index
  if (tab.isPublish) {
    return {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: '50%',
      width: '44px',
      height: '44px',
      marginTop: '-14px',
      boxShadow: '0 2px 8px rgba(102, 126, 234, 0.4)'
    }
  }
  return {}
}

const getTextColor = (tab: any, index: number) => {
  if (!tab.enabled) return '#cccccc'
  if (currentIndex.value === index) {
    return props.selectedColor || '#1677ff'
  }
  return props.color || '#999999'
}

const getBadgeCount = (tab: any) => {
  return tab.badge || 0
}

const getDefaultIconPath = (index: number) => {
  const paths = [
    'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z', // 首页
    'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z', // 圈子
    'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z', // 发布
    'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z', // 消息
    'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' // 我的
  ]
  return paths[index] || paths[0]
}
</script>

<style scoped>
.preview-tabbar {
  background: #ffffff;
  padding: 4px 0 0;
}

.tabbar-container {
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  padding: 4px 0 8px;
}

.tabbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 48px;
  padding: 4px 0;
}

.tabbar-item.disabled {
  opacity: 0.5;
}

.tabbar-icon-wrapper {
  position: relative;
}

.tabbar-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  overflow: hidden;
}

.tabbar-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.default-icon {
  width: 24px;
  height: 24px;
}

.badge {
  position: absolute;
  top: -4px;
  right: -8px;
  padding: 1px 4px;
  background: #ef4444;
  color: #ffffff;
  font-size: 10px;
  font-weight: 600;
  border-radius: 8px;
  min-width: 14px;
  text-align: center;
  line-height: 1.2;
}

.tabbar-text {
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}

.tabbar-item.publish .tabbar-text {
  margin-top: 4px;
}
</style>
