import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MenuItem } from '@/types/auth'

export const useAppStore = defineStore('app', () => {
  // 侧边栏折叠
  const collapsed = ref(false)
  // 面包屑
  const breadcrumbs = ref<{ name: string; path?: string }[]>([])
  // 标签页
  const tabs = ref<{ path: string; name: string; query?: Record<string, any> }[]>([])
  const activeTab = ref('')

  // 动态菜单（根据权限生成）
  const menus = ref<MenuItem[]>([])

  // 全局 loading
  const loading = ref(false)

  function toggleCollapsed() {
    collapsed.value = !collapsed.value
  }

  function setBreadcrumbs(items: { name: string; path?: string }[]) {
    breadcrumbs.value = items
  }

  function addTab(tab: { path: string; name: string; query?: Record<string, any> }) {
    const exists = tabs.value.find((t) => t.path === tab.path)
    if (!exists) {
      tabs.value.push(tab)
    }
    activeTab.value = tab.path
  }

  function removeTab(path: string) {
    const idx = tabs.value.findIndex((t) => t.path === path)
    if (idx > -1) {
      tabs.value.splice(idx, 1)
      if (activeTab.value === path && tabs.value.length > 0) {
        activeTab.value = tabs.value[Math.min(idx, tabs.value.length - 1)].path
      }
    }
  }

  function setMenus(m: MenuItem[]) {
    menus.value = m
  }

  function setLoading(val: boolean) {
    loading.value = val
  }

  return {
    collapsed, breadcrumbs, tabs, activeTab, menus, loading,
    toggleCollapsed, setBreadcrumbs, addTab, removeTab, setMenus, setLoading,
  }
})
