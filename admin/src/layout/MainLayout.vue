<template>
  <div class="admin-shell" :class="{ 'is-collapsed': railCollapsed, 'is-mobile-open': mobileNavOpen }">
    <div v-if="mobileNavOpen" class="nav-overlay" @click="mobileNavOpen = false"></div>

    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">
          <img v-if="brand.logo" :src="brand.logo" alt="" />
          <span v-else>{{ brandInitial }}</span>
        </div>
        <div class="brand-text">
          <div class="brand-title">{{ brand.title }}</div>
          <div class="brand-sub">{{ brand.subtitle }}</div>
        </div>
      </div>

      <el-scrollbar class="nav-scroll scroll-dark">
        <!-- 展开态：分组手风琴 -->
        <nav v-if="!railCollapsed" class="nav">
          <div v-if="favoriteItems.length" class="fav-block">
            <div class="nav-section-label fav-title">
              <el-icon class="fav-title-icon"><StarFilled /></el-icon>
              <span>我的常用</span>
            </div>
            <router-link
              v-for="item in favoriteItems"
              :key="'fav-' + item.path"
              :to="item.path"
              class="nav-item"
            >
              <el-icon class="nav-icon"><component :is="item.icon || 'Menu'" /></el-icon>
              <span class="nav-label">{{ item.title }}</span>
              <span v-if="badgeFor(item.badge)" class="nav-badge">{{ formatBadge(badgeFor(item.badge)) }}</span>
              <button
                type="button"
                class="fav-star active"
                title="取消收藏"
                @click.prevent.stop="toggleFavorite(item.path)"
              >
                <el-icon><StarFilled /></el-icon>
              </button>
            </router-link>
          </div>

          <template v-for="group in visibleMenuGroups" :key="group.title">
            <button
              type="button"
              class="nav-group-header"
              :class="{ open: expandedGroups.has(group.title) }"
              @click="toggleGroup(group.title)"
            >
              <el-icon class="group-icon"><component :is="group.icon || 'Folder'" /></el-icon>
              <span class="group-name">{{ group.title }}</span>
              <span v-if="groupBadgeCount(group)" class="group-badge">{{ formatBadge(groupBadgeCount(group)) }}</span>
              <el-icon class="group-chevron"><ArrowDown /></el-icon>
            </button>
            <div v-show="expandedGroups.has(group.title)" class="nav-group-children">
              <template v-for="item in group.children" :key="item.path">
                <div v-if="item.section" class="nav-section-label">{{ item.section }}</div>
                <router-link :to="item.path" class="nav-item">
                  <el-icon class="nav-icon"><component :is="item.icon || 'Menu'" /></el-icon>
                  <span class="nav-label">{{ item.title }}</span>
                  <span v-if="badgeFor(item.badge)" class="nav-badge">{{ formatBadge(badgeFor(item.badge)) }}</span>
                  <button
                    type="button"
                    class="fav-star"
                    :class="{ active: isFavorite(item.path) }"
                    :title="isFavorite(item.path) ? '取消收藏' : '设为常用'"
                    @click.prevent.stop="toggleFavorite(item.path)"
                  >
                    <el-icon><StarFilled v-if="isFavorite(item.path)" /><Star v-else /></el-icon>
                  </button>
                </router-link>
              </template>
            </div>
          </template>
        </nav>

        <!-- 折叠态：分组图标 rail + flyout 子菜单 -->
        <nav v-else class="rail">
          <button
            v-if="favoriteItems.length"
            type="button"
            class="rail-item rail-fav"
            :class="{ active: flyout?.key === '__fav' }"
            title="我的常用"
            @click="toggleFlyout('__fav', '我的常用', favoriteItems, $event)"
          >
            <el-icon><StarFilled /></el-icon>
          </button>
          <button
            v-for="group in visibleMenuGroups"
            :key="group.title"
            type="button"
            class="rail-item"
            :class="{ active: flyout?.key === group.title || (!flyout && activeGroupTitle === group.title) }"
            :title="group.title"
            @click="toggleFlyout(group.title, group.title, group.children, $event)"
          >
            <el-icon><component :is="group.icon || 'Folder'" /></el-icon>
            <span v-if="groupBadgeCount(group)" class="rail-badge-dot"></span>
          </button>
        </nav>
      </el-scrollbar>

      <!-- 折叠态 flyout 面板 -->
      <div v-if="flyout" class="flyout-overlay" @click="closeFlyout"></div>
      <div v-if="flyout" class="rail-flyout" :style="{ top: flyout.top + 'px' }">
        <div class="flyout-title">{{ flyout.title }}</div>
        <template v-for="item in flyout.items" :key="'fly-' + item.path">
          <div v-if="item.section" class="nav-section-label">{{ item.section }}</div>
          <router-link :to="item.path" class="nav-item" @click="closeFlyout">
            <el-icon class="nav-icon"><component :is="item.icon || 'Menu'" /></el-icon>
            <span class="nav-label">{{ item.title }}</span>
            <span v-if="badgeFor(item.badge)" class="nav-badge">{{ formatBadge(badgeFor(item.badge)) }}</span>
          </router-link>
        </template>
      </div>

      <div class="sidebar-user">
        <div class="user-dropdown-wrap">
          <el-dropdown trigger="click" placement="top-end" @command="handleUserCommand">
            <button type="button" class="user-card">
              <span class="user-avatar">{{ userInitial }}</span>
              <span class="user-meta">
                <span class="user-name">{{ auth.user.name }}</span>
                <span class="user-role">{{ auth.user.role }}</span>
              </span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                <el-dropdown-item command="license">授权与更新</el-dropdown-item>
                <el-dropdown-item command="miniapp">小程序下载</el-dropdown-item>
                <el-dropdown-item command="logs">操作日志</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <button
          type="button"
          class="collapse-btn"
          :title="sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          <el-icon><Expand v-if="sidebarCollapsed" /><Fold v-else /></el-icon>
        </button>
      </div>
    </aside>

    <section class="main-area">
      <div class="route-progress" :class="{ active: progressActive }" :style="{ width: `${progress}%` }"></div>

      <header class="topbar">
        <button type="button" class="icon-btn nav-toggle" :title="navToggleTitle" @click="handleNavToggle">
          <el-icon><Menu v-if="isMobile" /><Expand v-else-if="railCollapsed" /><Fold v-else /></el-icon>
        </button>

        <nav v-if="currentNav" class="breadcrumb">
          <button type="button" class="crumb-group" :title="`前往「${currentNav.group}」`" @click="goGroupFirst">
            {{ currentNav.group }}
          </button>
          <span class="crumb-sep">/</span>
          <span class="crumb-page">{{ currentNav.item.title }}</span>
        </nav>

        <div class="top-spacer"></div>

        <button type="button" class="search-trigger" @click="openPalette">
          <el-icon class="search-icon"><Search /></el-icon>
          <span class="search-placeholder">搜索菜单，快速跳转</span>
          <kbd class="kbd">⌘K</kbd>
        </button>

        <el-badge :value="unreadMessages" :hidden="unreadMessages <= 0" :max="99">
          <button type="button" class="icon-btn" title="官方消息会话" @click="openMessages">
            <el-icon :size="20"><ChatDotRound /></el-icon>
          </button>
        </el-badge>
        <button type="button" class="icon-btn" title="系统通知投递记录" @click="openNotifications">
          <el-icon :size="20"><Bell /></el-icon>
        </button>

        <span class="top-divider"></span>

        <el-dropdown trigger="click" placement="bottom-end" @command="handleUserCommand">
          <button type="button" class="user-chip">
            <span class="chip-avatar">{{ userInitial }}</span>
            <span class="chip-name">{{ auth.user.name }}</span>
            <el-icon class="chip-caret"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">个人中心</el-dropdown-item>
              <el-dropdown-item command="license">授权与更新</el-dropdown-item>
              <el-dropdown-item command="miniapp">小程序下载</el-dropdown-item>
              <el-dropdown-item command="logs">操作日志</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <main class="content" :class="{ 'content-fullbleed': isDesignerFullBleed }"><router-view /></main>
    </section>

    <CommandPalette ref="paletteRef" :groups="visibleMenuGroups" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, onMounted, onBeforeUnmount } from 'vue'
import { menuGroups } from '@/router/menus'
import { filterMenuGroups, type MenuItem, type MenuGroup } from '@/router/access'
import { ArrowDown, Fold, Expand, Menu, Search, ChatDotRound, Bell, Star, StarFilled } from '@element-plus/icons-vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { request } from '@/api/request'
import { fetchWebsiteInfo, type WebsiteInfo } from '@/api/admin'
import CommandPalette from './CommandPalette.vue'
import { useNavBadges } from './useNavBadges'

const router = useRouter()
const route = useRoute()

/** 设计器工作室全屏沉浸：content 区 padding 置 0（仅 UI 编辑器 designer 模式） */
const isDesignerFullBleed = computed(
  () => route.path === '/region/app-pages' && route.query.mode === 'designer',
)
const auth = useAuthStore()
const unreadMessages = ref(0)
const sidebarCollapsed = ref(false)
const mobileNavOpen = ref(false)
const isMobile = ref(false)
const paletteRef = ref<{ open: () => void } | null>(null)

let mediaQuery: MediaQueryList | undefined
let headerStatsTimer: number | undefined
const progressTimers: number[] = []

const visibleMenuGroups = computed(() => filterMenuGroups(menuGroups, auth.accessContext))

// ── 队列徽章（审核/提现/异常等待办数，60s 轮询）──
const { badgeFor } = useNavBadges()

function formatBadge(n: number) {
  return n > 99 ? '99+' : String(n)
}

function groupBadgeCount(group: MenuGroup) {
  return group.children.reduce((sum, item) => sum + badgeFor(item.badge), 0)
}

// ── 我的常用（localStorage 收藏，km-nav-favs）──
const FAV_KEY = 'km-nav-favs'

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

const favoritePaths = ref<string[]>(loadFavorites())

const favoriteItems = computed<MenuItem[]>(() => {
  const all = visibleMenuGroups.value.flatMap((group) => group.children)
  return favoritePaths.value
    .map((path) => all.find((item) => item.path === path))
    .filter((item): item is MenuItem => Boolean(item))
})

function isFavorite(path: string) {
  return favoritePaths.value.includes(path)
}

function toggleFavorite(path: string) {
  favoritePaths.value = isFavorite(path)
    ? favoritePaths.value.filter((p) => p !== path)
    : [...favoritePaths.value, path]
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(favoritePaths.value))
  } catch {
    // 存储不可用时收藏仅本次会话有效
  }
}

// ── 折叠态 flyout 子菜单 ──
interface FlyoutState {
  key: string
  title: string
  items: MenuItem[]
  top: number
}

const flyout = ref<FlyoutState | null>(null)

function toggleFlyout(key: string, title: string, items: MenuItem[], e: MouseEvent) {
  if (flyout.value?.key === key) {
    flyout.value = null
    return
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const estimatedHeight = Math.min(items.length * 36 + 52, window.innerHeight * 0.7)
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - estimatedHeight - 12))
  flyout.value = { key, title, items, top }
}

function closeFlyout() {
  flyout.value = null
}

// ── 品牌信息加载 ──
const brand = reactive({
  title: '校园本地生活',
  subtitle: '让校园生活更美好',
  logo: '',
  favicon: '',
  browserTitle: '校园本地生活'
})
function normalizeWebsiteInfo(data: WebsiteInfo = {}) {
  const siteLogo = data.siteLogo || data.logo || ''
  return {
    siteName: data.siteName || data.adminTitle || '校园本地生活',
    siteShortName: data.siteShortName || '',
    siteLogo,
    logo: siteLogo,
    favicon: data.favicon || '',
    adminTitle: data.adminTitle || data.siteName || '校园本地生活',
    adminSubtitle: data.adminSubtitle || data.siteShortName || '让校园生活更美好',
    loginSlogan: data.loginSlogan || '面向校园本地生活的真实运营后台',
    browserTitle: data.browserTitle || data.adminTitle || data.siteName || '校园本地生活'
  }
}

function applyWebsiteInfo(data: WebsiteInfo = {}) {
  const normalized = normalizeWebsiteInfo(data)
  brand.title = normalized.adminTitle
  brand.subtitle = normalized.adminSubtitle
  brand.logo = normalized.siteLogo
  brand.favicon = normalized.favicon
  brand.browserTitle = normalized.browserTitle
  document.title = normalized.browserTitle
  updateFavicon(normalized.favicon)
}

function updateFavicon(url?: string) {
  const href = String(url || '').trim()
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = href || 'data:,'
}

async function loadWebsiteInfo() {
  try {
    const data = await fetchWebsiteInfo()
    applyWebsiteInfo(data || {})
  } catch {
    applyWebsiteInfo({})
  }
}

// ── 未读消息 / 通知统计 ──
async function fetchHeaderStats() {
  try {
    const msg: any = await request.get('/admin/messages/unread-stats')
    unreadMessages.value = Number(
      msg?.officialUnreadMessages
      ?? msg?.totalUnread
      ?? msg?.officialUnreadConversations
      ?? msg?.privateUnread
      ?? msg?.unreadMessages
      ?? 0
    )
  } catch {
    unreadMessages.value = 0
  }
}

function openMessages() {
  router.push({ path: '/system/realtime-sessions', query: { official: '1' } })
  window.setTimeout(fetchHeaderStats, 800)
}

function openNotifications() {
  router.push('/marketing/notifications')
}

function handleHeaderStatsRefresh() {
  fetchHeaderStats()
}

// ── 分组折叠（localStorage 记忆展开态）──
const NAV_GROUPS_KEY = 'km-nav-groups'

function loadExpandedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(NAV_GROUPS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((item): item is string => typeof item === 'string'))
    }
  } catch {
    // 存储不可用时退回默认（仅展开当前组）
  }
  return new Set()
}

const expandedGroups = reactive(loadExpandedGroups())

function saveExpandedGroups() {
  try {
    localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify([...expandedGroups]))
  } catch {
    // 存储不可用时折叠记忆失效，不影响导航
  }
}

function toggleGroup(title: string) {
  if (expandedGroups.has(title)) {
    expandedGroups.delete(title)
  } else {
    expandedGroups.add(title)
  }
  saveExpandedGroups()
}

function findGroupByPath(path: string): string | null {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  for (const group of visibleMenuGroups.value) {
    for (const item of group.children) {
      if (cleanPath === item.path || cleanPath.startsWith(item.path + '/')) {
        return group.title
      }
    }
  }
  return null
}

function expandGroupForPath(path: string) {
  const groupTitle = findGroupByPath(path)
  if (groupTitle && !expandedGroups.has(groupTitle)) {
    expandedGroups.add(groupTitle)
    saveExpandedGroups()
  }
}

// 初始展开当前路由所在分组
expandGroupForPath(route.path)

// ── 面包屑（route.path 在 visibleMenuGroups 中反查）──
const currentNav = computed<{ group: string; item: MenuItem } | null>(() => {
  const path = route.path
  for (const group of visibleMenuGroups.value) {
    for (const item of group.children) {
      if (path === item.path || path.startsWith(item.path + '/')) {
        return { group: group.title, item }
      }
    }
  }
  return null
})

function goGroupFirst() {
  const group = visibleMenuGroups.value.find((item) => item.title === currentNav.value?.group)
  const first = group?.children[0]
  if (first) router.push(first.path)
}

// 当前路由所属分组（折叠态 rail 高亮）
const activeGroupTitle = computed(() => findGroupByPath(route.path))

// ── 侧栏开关（≥1100px 折叠 / <1100px 抽屉）──
const railCollapsed = computed(() => sidebarCollapsed.value && !isMobile.value)

const navToggleTitle = computed(() => {
  if (isMobile.value) return mobileNavOpen.value ? '收起导航' : '打开导航'
  return sidebarCollapsed.value ? '展开侧边栏' : '折叠侧边栏'
})

function handleNavToggle() {
  if (isMobile.value) {
    mobileNavOpen.value = !mobileNavOpen.value
  } else {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }
}

function handleMediaChange(e: MediaQueryListEvent) {
  isMobile.value = e.matches
  if (!e.matches) mobileNavOpen.value = false
}

// ── 命令面板 ──
function openPalette() {
  paletteRef.value?.open()
}

// ── 路由进度条（2px 顶部进度，替代旧的整页 loading 遮罩）──
const progress = ref(0)
const progressActive = ref(false)

function startProgress() {
  progressTimers.forEach((timer) => window.clearTimeout(timer))
  progressTimers.length = 0
  progressActive.value = true
  progress.value = 0
  window.requestAnimationFrame(() => {
    progress.value = 80
  })
  progressTimers.push(window.setTimeout(() => { progress.value = 100 }, 320))
  progressTimers.push(window.setTimeout(() => { progressActive.value = false }, 620))
  progressTimers.push(window.setTimeout(() => { progress.value = 0 }, 1000))
}

// 监听路由变化：自动展开分组、收起移动端抽屉、关闭 flyout、推进进度条
watch(() => route.path, (newPath) => {
  expandGroupForPath(newPath)
  mobileNavOpen.value = false
  flyout.value = null
  startProgress()
})

// 展开/折叠切换时关闭 flyout
watch(railCollapsed, () => {
  flyout.value = null
})

// ── 用户信息 ──
const userInitial = computed(() => (auth.user.name || '').trim().charAt(0).toUpperCase() || '管')
const brandInitial = computed(() => (brand.title || '').trim().charAt(0) || '校')

async function handleUserCommand(command: string) {
  if (command === 'logout') {
    await auth.logout()
    ElMessage.success('已退出登录')
    router.replace('/login')
    return
  }
  if (command === 'logs') {
    router.push('/system/operation-logs')
    return
  }
  if (command === 'license') {
    router.push('/system/license-runtime')
    return
  }
  if (command === 'miniapp') {
    router.push('/system/mini-program-download')
    return
  }
  if (command === 'profile') {
    router.push('/system/settings')
    return
  }
}

// ── 生命周期 ──
onMounted(() => {
  mediaQuery = window.matchMedia('(max-width: 1099.98px)')
  isMobile.value = mediaQuery.matches
  mediaQuery.addEventListener('change', handleMediaChange)
  window.addEventListener('admin-header-stats-refresh', handleHeaderStatsRefresh)
  loadWebsiteInfo()
  fetchHeaderStats()
  headerStatsTimer = window.setInterval(fetchHeaderStats, 30000)
})

onBeforeUnmount(() => {
  if (mediaQuery) mediaQuery.removeEventListener('change', handleMediaChange)
  window.removeEventListener('admin-header-stats-refresh', handleHeaderStatsRefresh)
  window.clearInterval(headerStatsTimer)
  progressTimers.forEach((timer) => window.clearTimeout(timer))
})
</script>

<style scoped lang="scss">
.admin-shell {
  display: flex;
  height: 100vh;
  background: var(--mx-bg);
}

/* ── 侧边栏（232px 深色）── */
.sidebar {
  width: 232px;
  flex: 0 0 auto;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--mx-ink);
  border-right: 1px solid var(--mx-ink-3);
  transition: width .22s ease, transform .24s ease;
}

.admin-shell.is-collapsed .sidebar {
  width: 72px;
}

/* 品牌区 */
.brand {
  height: 56px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid var(--mx-ink-3);
}

.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: var(--mx-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  flex: 0 0 auto;
}

.brand-mark img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.brand-text {
  min-width: 0;
}

.brand-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brand-sub {
  margin-top: 1px;
  font-size: 11.5px;
  line-height: 1.3;
  color: var(--mx-ink-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-shell.is-collapsed .brand {
  justify-content: center;
  padding: 0;
}

.admin-shell.is-collapsed .brand-text {
  display: none;
}

/* 菜单区 */
.nav-scroll {
  flex: 1;
  min-height: 0;
}

.nav-scroll :deep(.el-scrollbar__thumb) {
  background: rgba(255, 255, 255, .14);
}

.nav {
  padding: 2px 0 10px;
}

.nav-group-header {
  display: flex;
  align-items: center;
  gap: 9px;
  width: calc(100% - 16px);
  margin: 2px 8px 0;
  padding: 9px 12px;
  border: 0;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .01em;
  color: var(--mx-ink-text-strong);
  user-select: none;
  transition: background-color .15s ease, color .15s ease;
}

.nav-group-header:hover {
  background: rgba(255, 255, 255, .05);
  color: #fff;
}

.group-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.group-icon {
  font-size: 15px;
  flex: 0 0 auto;
}

/* 分组子项区：左侧引导线把"组 → 项"的归属关系画出来 */
.nav-group-children {
  position: relative;
  padding: 2px 0 8px;
}

.nav-group-children::before {
  content: "";
  position: absolute;
  left: 19px;
  top: 2px;
  bottom: 10px;
  width: 1px;
  background: rgba(255, 255, 255, .06);
}

/* 组内二级小标：弱化成小字注释，缩进到菜单项文字列，明显区别于可点项 */
.nav-section-label {
  margin-top: 4px;
  padding: 6px 12px 2px 46px;
  font-size: 10.5px;
  letter-spacing: .08em;
  color: var(--mx-ink-text);
  opacity: .45;
  user-select: none;
}

/* 队列徽章（待办数） */
.nav-badge {
  flex: 0 0 auto;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 10px;
  background: var(--mx-red);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.group-badge {
  flex: 0 0 auto;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 10px;
  background: rgba(239, 68, 68, .18);
  color: #fca5a5;
  font-size: 11px;
  font-weight: 600;
  line-height: 17px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 我的常用 */
.fav-block {
  margin-bottom: 4px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--mx-ink-3);
}

.fav-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 20px;
  opacity: 1;
  color: #fbbf24;
}

.fav-title-icon {
  font-size: 12px;
}

/* 收藏星标（hover 显现，已收藏常显金色） */
.fav-star {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mx-ink-text);
  cursor: pointer;
  opacity: 0;
  transition: opacity .15s ease, color .15s ease;
}

.nav-item:hover .fav-star {
  opacity: 1;
}

.fav-star:hover {
  color: #fbbf24;
}

.fav-star.active {
  opacity: 1;
  color: #fbbf24;
}

.group-chevron {
  font-size: 12px;
  flex: 0 0 auto;
  transform: rotate(-90deg);
  transition: transform .18s ease;
}

.nav-group-header.open .group-chevron {
  transform: rotate(0deg);
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  margin: 1px 8px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--mx-ink-text);
  text-decoration: none;
  transition: background-color .15s ease, color .15s ease;
}

.nav-item:hover {
  background: rgba(255, 255, 255, .05);
  color: var(--mx-ink-text-strong);
}

.nav-icon {
  width: 16px;
  font-size: 16px;
  flex: 0 0 auto;
}

.nav-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-item.router-link-active {
  background: rgba(255, 255, 255, .07);
  color: #fff;
}

.nav-item.router-link-active::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  border-radius: 6px;
  background: var(--mx-primary);
}

/* 折叠态 rail：只显示分组图标，点击弹出 flyout */
.rail {
  padding: 6px 0 10px;
}

.rail-item {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin: 4px auto;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--mx-ink-text);
  font-size: 17px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}

.rail-item:hover {
  background: rgba(255, 255, 255, .06);
  color: #fff;
}

.rail-item.active {
  background: rgba(255, 255, 255, .08);
  color: #fff;
}

.rail-item.rail-fav {
  color: #fbbf24;
}

.rail-badge-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mx-red);
}

/* flyout 子菜单面板 */
.flyout-overlay {
  position: fixed;
  inset: 0;
  z-index: 65;
  background: transparent;
}

.rail-flyout {
  position: fixed;
  left: 78px;
  z-index: 70;
  width: 218px;
  max-height: 70vh;
  overflow-y: auto;
  background: var(--mx-ink-2);
  border: 1px solid var(--mx-ink-3);
  border-radius: 10px;
  box-shadow: 0 18px 44px rgba(4, 10, 24, .5);
  padding: 6px;
}

.flyout-title {
  padding: 8px 12px 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .02em;
  color: #fff;
}

/* 底部用户卡 */
.sidebar-user {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px;
  border-top: 1px solid var(--mx-ink-3);
}

.user-dropdown-wrap {
  flex: 1;
  min-width: 0;
}

.user-dropdown-wrap :deep(.el-dropdown) {
  display: block;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  text-align: left;
  transition: background-color .15s ease;
}

.user-card:hover {
  background: rgba(255, 255, 255, .05);
}

.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--mx-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  flex: 0 0 auto;
}

.user-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--mx-ink-text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 11.5px;
  line-height: 1.35;
  color: var(--mx-ink-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-shell.is-collapsed .sidebar-user {
  flex-direction: column;
  gap: 8px;
}

.admin-shell.is-collapsed .user-dropdown-wrap {
  flex: 0 0 auto;
}

.admin-shell.is-collapsed .user-card {
  width: auto;
  padding: 4px;
}

.admin-shell.is-collapsed .user-meta {
  display: none;
}

.collapse-btn {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mx-ink-text);
  cursor: pointer;
  transition: color .15s ease, background-color .15s ease;
}

.collapse-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, .07);
}

/* ── 主区域 ── */
.main-area {
  flex: 1;
  min-width: 0;
  height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.route-progress {
  position: sticky;
  top: 0;
  z-index: 30;
  height: 2px;
  margin-bottom: -2px;
  background: var(--mx-primary);
  opacity: 0;
  pointer-events: none;
  transition: width .3s ease, opacity .3s ease;
}

.route-progress.active {
  opacity: 1;
}

/* 顶栏（56px 白底 sticky） */
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  height: 56px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid var(--mx-border);
}

.icon-btn {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mx-sub);
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}

.icon-btn:hover {
  background: var(--mx-hover);
  color: var(--mx-text);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13.5px;
}

.crumb-group {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font-size: 13.5px;
  color: var(--mx-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color .15s ease;
}

.crumb-group:hover {
  color: var(--mx-text);
}

.crumb-sep {
  color: var(--mx-muted);
  flex: 0 0 auto;
}

.crumb-page {
  color: var(--mx-primary);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-spacer {
  flex: 1;
}

.search-trigger {
  width: 220px;
  height: 34px;
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #f1f4f9;
  cursor: pointer;
  transition: border-color .15s ease;
}

.search-trigger:hover {
  border-color: var(--mx-primary);
}

.search-icon {
  font-size: 14px;
  color: var(--mx-muted);
  flex: 0 0 auto;
}

.search-placeholder {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 13px;
  color: var(--mx-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-divider {
  width: 1px;
  height: 20px;
  background: var(--mx-border);
  flex: 0 0 auto;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  border: 0;
  border-radius: 999px;
  background: none;
  cursor: pointer;
  transition: background-color .15s ease;
}

.user-chip:hover {
  background: var(--mx-hover);
}

.chip-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--mx-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  flex: 0 0 auto;
}

.chip-name {
  max-width: 120px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--mx-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-caret {
  font-size: 12px;
  color: var(--mx-muted);
}

.content {
  flex: 1;
  padding: 16px 20px 24px;
}

/* 设计器全屏沉浸态：padding 置 0（覆盖下方响应式断点，故用 !important） */
.content.content-fullbleed {
  padding: 0 !important;
}

/* ── 响应式：<1100px 抽屉式侧栏 ── */
@media (max-width: 1099.98px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 40;
    width: 232px;
    transform: translateX(-100%);
  }

  .admin-shell.is-mobile-open .sidebar {
    transform: translateX(0);
  }

  .nav-overlay {
    position: fixed;
    inset: 0;
    z-index: 35;
    background: rgba(12, 19, 34, .45);
  }

  .collapse-btn {
    display: none;
  }

  .topbar {
    padding: 0 16px;
  }

  .content {
    padding: 14px;
  }
}

@media (max-width: 640px) {
  .search-trigger {
    width: 34px;
    padding: 0;
    justify-content: center;
  }

  .search-placeholder,
  .search-trigger .kbd {
    display: none;
  }

  .chip-name,
  .chip-caret {
    display: none;
  }
}
</style>
