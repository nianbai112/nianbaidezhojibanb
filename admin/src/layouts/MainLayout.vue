<template>
  <a-layout class="main-layout">
    <!-- 侧边栏 -->
      <a-layout-sider
        v-model:collapsed="appStore.collapsed"
        :trigger="null"
        collapsible
        class="layout-sider"
        width="240"
        collapsed-width="72"
      >
      <div class="logo">
        <img src="@/assets/images/logo.svg" alt="logo" class="logo-img" />
        <span v-if="!appStore.collapsed" class="logo-text">灵萌后台</span>
      </div>

      <a-menu
        v-model:selectedKeys="selectedKeys"
        v-model:openKeys="openKeys"
        mode="inline"
        theme="light"
        class="layout-menu"
        :inline-collapsed="appStore.collapsed"
        @click="onMenuClick"
      >
        <template v-for="menu in menus" :key="menu.key">
          <a-sub-menu v-if="menu.children?.length" :key="menu.key">
            <template #title>
              <span class="menu-icon" v-html="menu.iconSvg" v-if="menu.iconSvg"></span>
              <component :is="getIconComp(menu.iconName)" v-else-if="menu.iconName" />
              <span class="menu-label">{{ menu.title }}</span>
            </template>
            <a-menu-item v-for="child in menu.children" :key="child.key">
              <span>{{ child.title }}</span>
            </a-menu-item>
          </a-sub-menu>
          <a-menu-item v-else :key="menu.key">
            <span class="menu-icon" v-html="menu.iconSvg" v-if="menu.iconSvg"></span>
            <component :is="getIconComp(menu.iconName)" v-else-if="menu.iconName" />
            <span class="menu-label">{{ menu.title }}</span>
          </a-menu-item>
        </template>
      </a-menu>
    </a-layout-sider>

    <!-- 右侧主体 -->
    <a-layout>
      <!-- 顶栏 -->
      <a-layout-header class="layout-header">
        <div class="header-left">
          <button class="trigger" type="button" aria-label="切换侧边栏" @click="appStore.toggleCollapsed()">
            <menu-unfold-outlined v-if="appStore.collapsed" />
            <menu-fold-outlined v-else />
          </button>
          <a-breadcrumb class="header-breadcrumb">
            <a-breadcrumb-item v-for="item in breadcrumbs" :key="item.name">
              <router-link v-if="item.path" :to="item.path">{{ item.name }}</router-link>
              <span v-else>{{ item.name }}</span>
            </a-breadcrumb-item>
          </a-breadcrumb>
        </div>
        <div class="header-right">
          <a-dropdown>
            <div class="user-info">
              <a-avatar :size="28" style="background:#3B82F6;font-size:14px">
                {{ (user?.realName || user?.username || 'U').charAt(0) }}
              </a-avatar>
              <span class="user-name">{{ user?.realName || user?.username || '管理员' }}</span>
              <down-outlined style="font-size:10px;color:#999" />
            </div>
            <template #overlay>
              <a-menu @click="onUserMenuClick">
                <a-menu-item key="logout"><logout-outlined /> 退出登录</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </a-layout-header>

      <!-- 内容区 -->
      <a-layout-content class="layout-content">
        <div class="content-shell">
          <router-view v-slot="{ Component }">
            <component :is="Component" />
          </router-view>
        </div>
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  MenuFoldOutlined, MenuUnfoldOutlined, DownOutlined, LogoutOutlined,
  DashboardOutlined, EnvironmentOutlined, TeamOutlined,
  FileTextOutlined, ShopOutlined, CarOutlined, DollarOutlined,
  GiftOutlined, MessageOutlined, SettingOutlined,
  TransactionOutlined, AuditOutlined, RobotOutlined, ControlOutlined,
  ShoppingOutlined, MailOutlined, CloudOutlined, HeartOutlined,
  CommentOutlined, TrophyOutlined, ReadOutlined, PhoneOutlined,
  PrinterOutlined, CrownOutlined, SmileOutlined,
  ToolOutlined,
} from '@ant-design/icons-vue'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import type { RouteRecordRaw } from 'vue-router'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const appStore = useAppStore()

const user = computed(() => userStore.user)

// 图标映射
const iconMap: Record<string, any> = {
  DashboardOutlined, EnvironmentOutlined, TeamOutlined,
  FileTextOutlined, ShopOutlined, CarOutlined, DollarOutlined,
  GiftOutlined, MessageOutlined, SettingOutlined,
  TransactionOutlined, AuditOutlined, RobotOutlined, ControlOutlined,
  ShoppingOutlined, MailOutlined, CloudOutlined, HeartOutlined,
  CommentOutlined, TrophyOutlined, ReadOutlined, PhoneOutlined,
  PrinterOutlined, CrownOutlined, SmileOutlined, ToolOutlined,
}

function getIconComp(name?: string) {
  if (!name) return null
  return iconMap[name] || null
}

// 过滤菜单（根据权限）
interface MenuNode {
  key: string
  title: string
  iconName?: string
  iconSvg?: string
  children?: MenuNode[]
}

const menus = computed<MenuNode[]>(() => {
  const filterMenus = (routes: RouteRecordRaw[], parentPath = ''): MenuNode[] => {
    return routes
      .filter((r) => {
        if (r.meta?.hidden) return false
        const perm = r.meta?.permission as string | undefined
        if (!perm) return true
        return userStore.hasPermission(perm)
      })
      .map((r) => {
        const fullPath = parentPath + '/' + r.path
        return {
          key: fullPath,
          title: (r.meta?.title as string) || r.path,
          iconName: r.meta?.icon as string | undefined,
          children: r.children ? filterMenus(r.children, fullPath) : undefined,
        }
      })
      .filter((r) => {
        // 有子菜单且子菜单不为空，或者没有子菜单
        if (r.children) return r.children.length > 0
        return true
      })
  }

  const mainRoute = router.options.routes.find((r) => r.path === '/')
  return mainRoute?.children ? filterMenus(mainRoute.children, '') : []
})

// 当前菜单选中
const selectedKeys = ref<string[]>([])
const openKeys = ref<string[]>([])

watch(() => route.path, (path) => {
  selectedKeys.value = [path]
  const parts = path.split('/').filter(Boolean)
  if (parts.length >= 2) {
    const parent = '/' + parts.slice(0, parts.length - 1).join('/')
    if (!openKeys.value.includes(parent)) {
      openKeys.value = [...openKeys.value, parent]
    }
  }
}, { immediate: true })

// 面包屑
const breadcrumbs = computed(() => {
  return route.matched
    .filter((r) => r.meta?.title && !r.meta?.hidden)
    .map((r, i, arr) => ({
      name: r.meta.title as string,
      path: i < arr.length - 1 ? r.path : undefined,
    }))
})

function onMenuClick(info: any) {
  router.push(String(info.key))
}

function onUserMenuClick(info: any) {
  if (String(info.key) === 'logout') {
    userStore.logout()
    router.push('/login')
  }
}
</script>

<style lang="less" scoped>
.main-layout {
  height: 100vh;
  min-width: 0;
  background: #f5f7fb;
}

.layout-sider {
  background: #fff;
  box-shadow: 1px 0 0 #e8edf5;
  z-index: 10;
  border-right: 0;

  .logo {
    height: 60px;
    margin: 8px 10px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    background: #fff;
    border-radius: 6px;
    border: 1px solid #eef2f7;
    transition: all .3s cubic-bezier(.4, 0, .2, 1);

    &:hover {
      border-color: #dbeafe;
      background: #f8fbff;
    }

    .logo-img {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      transition: transform .3s ease;

      &:hover { transform: scale(1.05); }
    }

    .logo-text {
      color: #1a1a1a;
      font-size: 16px;
      font-weight: 600;
      white-space: nowrap;
    }
  }
}

.layout-menu {
  height: calc(100vh - 82px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 6px 16px;
  background: transparent;
  border-inline-end: 0 !important;

  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(144, 147, 153, .2), rgba(144, 147, 153, .3));
    border-radius: 3px;
  }

  :deep(.ant-menu-item),
  :deep(.ant-menu-submenu-title) {
    height: 40px;
    line-height: 40px;
    margin: 2px 0;
    border-radius: 6px;
    padding-inline: 14px !important;
    transition: background-color .2s ease, color .2s ease;
  }

  :deep(.ant-menu-item:hover),
  :deep(.ant-menu-submenu-title:hover) {
    background: #f3f7ff !important;
    color: #1d4ed8 !important;
  }

  :deep(.ant-menu-item-selected) {
    background: #eff6ff !important;
    color: #1d4ed8 !important;
    font-weight: 600;
  }

  :deep(.ant-menu-item-selected::after) {
    display: none;
  }

  :deep(.ant-menu-item-selected::before) {
    content: "";
    position: absolute;
    left: 4px;
    top: 50%;
    height: 18px;
    width: 3px;
    transform: translateY(-50%);
    background: #2563eb;
    border-radius: 999px;
  }

  :deep(.ant-menu-sub) {
    margin: 2px 0 6px 10px;
    padding: 3px 0 3px 6px;
    background: transparent !important;
    border-left: 1px solid #e8edf5;
  }

  :deep(.ant-menu-sub .ant-menu-item) {
    height: 36px;
    line-height: 36px;
    margin: 2px 0;
    border-radius: 6px;
    font-size: 13px;
  }
}

.menu-icon {
  display: inline-flex;
  align-items: center;
  margin-right: 8px;
  svg { width: 16px; height: 16px; }
}

.menu-label {
  display: inline-block;
}

.layout-header {
  background: #fff;
  height: 56px;
  line-height: 56px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e8edf5;
  box-shadow: none;
  z-index: 9;

  .header-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .header-right { display: flex; align-items: center; }

  .trigger {
    width: 34px;
    height: 34px;
    border: 0;
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    cursor: pointer;
    color: #666;
    padding: 0;
    border-radius: 6px;
    transition: background-color .2s ease, transform .2s ease;
    &:hover { color: #2563eb; background-color: #eff6ff; }
    &:active { transform: scale(.96); }
  }

  .header-breadcrumb {
    :deep(.ant-breadcrumb-link) { font-size: 13px; }
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 6px;
    transition: background-color .2s ease, transform .2s ease;
    &:hover { background: #f3f7ff; }
    &:active { transform: translateY(.5px) scale(.98); }
    .user-name { font-size: 13px; color: #374151; }
  }
}

.layout-content {
  overflow: auto;
  height: calc(100vh - 56px);
  background: #f5f7fb;
  padding: 18px;
}

.content-shell {
  min-width: 0;
  max-width: 1680px;
  margin: 0 auto;
}

@media (max-width: 900px) {
  .layout-sider {
    position: fixed !important;
    left: 0;
    top: 0;
    bottom: 0;
  }

  .layout-header {
    padding: 0 12px;

    .header-breadcrumb {
      overflow: hidden;
      white-space: nowrap;
    }

    .user-name {
      display: none;
    }
  }

  .layout-content {
    padding: 12px;
  }
}
</style>
