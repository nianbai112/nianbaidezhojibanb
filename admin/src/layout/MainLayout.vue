<template>
  <div class="admin-shell" :class="{ 'is-collapsed': sidebarCollapsed, 'is-switching': pageSwitching }">
    <aside class="sidebar glass-card">
      <div class="brand">
        <div class="brand-mark"><el-icon><School /></el-icon></div>
        <div><div class="brand-title">校园本地生活</div><div class="brand-sub">让校园生活更美好</div></div>
      </div>
      <el-scrollbar class="nav-scroll">
        <template v-for="group in menuGroups" :key="group.title">
          <div class="nav-group-header" :class="{ active: hasActiveChild(group), open: expandedGroups.has(group.title) }" @click="toggleGroup(group.title)">
            <div class="group-main">
              <span class="group-dot"></span>
              <span>{{ group.title }}</span>
            </div>
            <div class="group-meta">
              <span>{{ group.children.length }}</span>
              <el-icon class="group-arrow"><ArrowDown v-if="expandedGroups.has(group.title)" /><ArrowRight v-else /></el-icon>
            </div>
          </div>
          <div v-show="expandedGroups.has(group.title)" class="nav-group-children">
            <router-link v-for="item in group.children" :key="item.path" :to="item.path" class="nav-item">
              <el-icon><component :is="item.icon" /></el-icon><span>{{ item.title }}</span><el-icon class="chev"><ArrowRight /></el-icon>
            </router-link>
          </div>
        </template>
      </el-scrollbar>
      <div class="sidebar-footer">
        <button class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed"><el-icon><ArrowLeft /></el-icon></button>
      </div>
    </aside>
    <section class="main-area">
      <header class="topbar">
        <el-button circle :icon="Fold" @click="sidebarCollapsed = !sidebarCollapsed" />

        <div class="search-wrapper" ref="searchWrapperRef">
          <div class="global-search" :class="{ focused: searchFocused }" @click="focusInput">
            <el-icon><Search /></el-icon>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              placeholder="搜索菜单…"
              @focus="searchFocused = true; filterResults()"
              @input="filterResults"
              @keydown.down.prevent="moveDown"
              @keydown.up.prevent="moveUp"
              @keydown.enter.prevent="goToSelected"
              @keydown.escape.prevent="closeSearch"
            />
            <kbd>⌘K</kbd>
          </div>

          <div v-if="searchFocused && searchQuery.length > 0" class="search-dropdown glass-card">
            <template v-if="filteredResults.length > 0">
              <div
                v-for="(item, idx) in filteredResults"
                :key="item.path"
                class="search-item"
                :class="{ active: idx === activeIndex }"
                @click="goTo(item)"
                @mouseenter="activeIndex = idx"
              >
                <div class="search-item-title">{{ item.title }}</div>
                <div class="search-item-meta">
                  <span class="search-item-group">{{ item.group }}</span>
                  <span class="search-item-path">{{ item.path }}</span>
                </div>
              </div>
            </template>
            <div v-else class="search-empty">未找到相关菜单</div>
          </div>
        </div>

        <div class="top-spacer"></div>
        <el-button class="top-pill" :icon="ChatDotRound" title="官方消息会话" @click="openMessages">消息 <sup v-if="unreadMessages > 0">{{ unreadMessages }}</sup></el-button>
        <el-button class="top-pill" :icon="Bell" @click="router.push('/system/notification-center')">通知 <sup v-if="unreadNotices > 0">{{ unreadNotices }}</sup></el-button>
        <el-button class="top-pill" :icon="QuestionFilled" @click="router.push('/system/launch-check')">帮助</el-button>
        <el-dropdown @command="handleUserCommand">
          <div class="profile"><div class="avatar">管</div><div><b>{{ auth.user.name }}</b><p>{{ auth.user.role }}</p></div><el-icon><ArrowDown /></el-icon></div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">个人中心</el-dropdown-item>
              <el-dropdown-item command="logs">操作日志</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>
      <div class="route-progress" v-show="pageSwitching"></div>
      <main class="content" v-loading="pageSwitching" element-loading-text="正在切换模块"><router-view /></main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, onBeforeUnmount } from 'vue'
import { menuGroups } from '@/router/menus'
import { School, ArrowRight, ArrowLeft, ArrowDown, Fold, Search, ChatDotRound, Bell, QuestionFilled } from '@element-plus/icons-vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { request } from '@/api/request'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const unreadMessages = ref(0)
const unreadNotices = ref(0)
const sidebarCollapsed = ref(false)
const pageSwitching = ref(false)
let switchingTimer: number | undefined
let headerStatsTimer: number | undefined

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
  try {
    const ntf: any = await request.get('/admin/notifications/stats')
    unreadNotices.value = Number(ntf?.unread || ntf?.totalUnread || 0)
  } catch {
    unreadNotices.value = 0
  }
}

function openMessages() {
  router.push({ path: '/system/realtime-sessions', query: { official: '1' } })
  window.setTimeout(fetchHeaderStats, 800)
}

function handleHeaderStatsRefresh() {
  fetchHeaderStats()
}

// ── 分组折叠 ──
const expandedGroups = reactive(new Set<string>())

function toggleGroup(title: string) {
  if (expandedGroups.has(title)) {
    expandedGroups.delete(title)
  } else {
    expandedGroups.add(title)
  }
}

function findGroupByPath(path: string): string | null {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  for (const group of menuGroups) {
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
  if (groupTitle) {
    expandedGroups.add(groupTitle)
  }
}

function hasActiveChild(group: { children: Array<{ path: string }> }) {
  return group.children.some((item) => route.path === item.path || route.path.startsWith(item.path + '/'))
}

// 初始展开当前路由所在分组
expandGroupForPath(route.path)

// 监听路由变化自动展开
watch(() => route.path, (newPath) => {
  expandGroupForPath(newPath)
  pageSwitching.value = true
  window.clearTimeout(switchingTimer)
  switchingTimer = window.setTimeout(() => {
    pageSwitching.value = false
  }, 260)
})

// ── 搜索状态 ──
const searchQuery = ref('')
const searchFocused = ref(false)
const activeIndex = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchWrapperRef = ref<HTMLElement | null>(null)

interface SearchItem { title: string; path: string; group: string }
const filteredResults = ref<SearchItem[]>([])

function buildSearchPool(): SearchItem[] {
  const pool: SearchItem[] = []
  for (const group of menuGroups) {
    for (const item of group.children) {
      pool.push({ title: item.title, path: item.path, group: group.title })
    }
  }
  return pool
}
const searchPool = buildSearchPool()

function filterResults() {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) { filteredResults.value = []; return }
  filteredResults.value = searchPool.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.path.toLowerCase().includes(q)
  ).slice(0, 12)
  activeIndex.value = 0
}

function moveDown() {
  if (filteredResults.value.length === 0) return
  activeIndex.value = (activeIndex.value + 1) % filteredResults.value.length
}
function moveUp() {
  if (filteredResults.value.length === 0) return
  activeIndex.value = (activeIndex.value - 1 + filteredResults.value.length) % filteredResults.value.length
}
function goToSelected() {
  if (filteredResults.value.length === 0) return
  goTo(filteredResults.value[activeIndex.value])
}
function goTo(item: SearchItem) {
  // 自动展开目标分组
  expandedGroups.add(item.group)
  router.push(item.path)
  closeSearch()
}
function closeSearch() {
  searchQuery.value = ''
  searchFocused.value = false
  filteredResults.value = []
  searchInputRef.value?.blur()
}
function focusInput() {
  searchInputRef.value?.focus()
}

function handleOutsideClick(e: MouseEvent) {
  if (searchWrapperRef.value && !searchWrapperRef.value.contains(e.target as Node)) {
    searchFocused.value = false
    filteredResults.value = []
  }
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    focusInput()
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleRefreshFeedback, true)
  window.addEventListener('admin-header-stats-refresh', handleHeaderStatsRefresh)
  fetchHeaderStats()
  headerStatsTimer = window.setInterval(fetchHeaderStats, 30000)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleRefreshFeedback, true)
  window.removeEventListener('admin-header-stats-refresh', handleHeaderStatsRefresh)
  window.clearInterval(headerStatsTimer)
})

function handleRefreshFeedback(e: MouseEvent) {
  const target = e.target as HTMLElement
  const button = target.closest('.el-button') as HTMLElement | null
  if (!button || button.classList.contains('is-loading')) return
  if (!button.textContent?.includes('刷新') && !button.textContent?.includes('查询') && !button.textContent?.includes('搜索')) return
  button.classList.remove('admin-click-feedback')
  window.requestAnimationFrame(() => button.classList.add('admin-click-feedback'))
  window.setTimeout(() => button.classList.remove('admin-click-feedback'), 720)
}

// ── 顶栏操作 ──
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
  if (command === 'profile') {
    router.push('/system/settings')
  }
}
</script>

<style scoped lang="scss">
.admin-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  background: var(--mx-bg);
  transition: grid-template-columns .22s ease;
}

.admin-shell.is-collapsed {
  grid-template-columns: 76px minmax(0, 1fr);
}

.sidebar {
  height: 100vh;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-right: 1px solid var(--mx-border);
  border-radius: 0;
  background: var(--mx-card);
  box-shadow: none;
  backdrop-filter: none;
}

.brand {
  height: 76px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  border-bottom: 1px solid var(--mx-border);
}

.brand-mark {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 22px;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  box-shadow: 0 10px 24px rgba(37, 99, 235, .18);
  flex-shrink: 0;
}

.brand-title {
  font-size: 18px;
  line-height: 1.15;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0;
}

.brand-sub {
  font-size: 12px;
  color: #7a869b;
  margin-top: 4px;
  font-weight: 600;
}

.admin-shell.is-collapsed .brand {
  justify-content: center;
  padding: 0;
}

.admin-shell.is-collapsed .brand-title,
.admin-shell.is-collapsed .brand-sub {
  display: none;
}

.nav-scroll {
  flex: 1;
  padding: 12px 10px 8px;
}

.nav-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 0 10px;
  margin: 2px 0;
  cursor: pointer;
  user-select: none;
  color: #3f4d63;
  font-size: 14.5px;
  font-weight: 650;
  border-radius: 11px;
  transition: color .16s ease, background-color .16s ease, border-color .16s ease;
  border: 1px solid transparent;
}

.nav-group-header:hover {
  color: var(--mx-primary);
  background: #f5f8fd;
}

.nav-group-header.active,
.nav-group-header.open {
  color: #0f172a;
  background: #f0f6ff;
  border-color: #d8e7ff;
}

.group-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.group-main span:last-child {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-dot {
  width: 7px;
  height: 7px;
  border-radius: 99px;
  background: #cfe2ff;
  box-shadow: 0 0 0 5px #edf5ff;
  flex: 0 0 auto;
}

.nav-group-header.active .group-dot,
.nav-group-header.open .group-dot {
  background: var(--mx-primary);
  box-shadow: 0 0 0 5px rgba(37, 99, 235, .11);
}

.group-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 650;
  flex: 0 0 auto;
  margin-left: 8px;
}

.group-meta span {
  min-width: 22px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
}

.group-arrow {
  font-size: 12px;
  transition: transform .2s ease;
}

.nav-group-children {
  padding: 4px 0 8px 15px;
}

.nav-item {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 11px;
  margin: 2px 0;
  border-radius: 10px;
  font-weight: 620;
  font-size: 14.5px;
  color: #3f4d63;
  transition: color .16s ease, background-color .16s ease, box-shadow .16s ease;
  text-decoration: none;
}

.nav-item .el-icon:first-child {
  width: 18px;
  font-size: 16px;
  color: #64748b;
}

.nav-item .chev {
  margin-left: auto;
  opacity: .45;
  font-size: 12px;
}

.nav-item:hover {
  background: #f5f8fd;
  color: var(--mx-primary);
}

.nav-item:hover .el-icon:first-child,
.nav-item.router-link-active .el-icon:first-child {
  color: var(--mx-primary);
}

.nav-item.router-link-active {
  color: var(--mx-primary);
  background: #edf5ff;
  box-shadow: inset 3px 0 0 var(--mx-primary);
}

.sidebar-footer {
  padding: 8px 12px 14px;
  border-top: 1px solid var(--mx-border);
}

.collapse-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  margin: 0 auto;
  background: #fff;
  color: #64748b;
  box-shadow: none;
  cursor: pointer;
  transition: .16s ease;
}

.collapse-btn:hover {
  color: var(--mx-primary);
  border-color: #c7dcff;
  background: #f5f8fd;
}

.admin-shell.is-collapsed .nav-group-header {
  justify-content: center;
  padding: 0;
}

.admin-shell.is-collapsed .group-main {
  justify-content: center;
}

.admin-shell.is-collapsed .group-main span:last-child,
.admin-shell.is-collapsed .group-meta,
.admin-shell.is-collapsed .nav-group-children {
  display: none;
}

.admin-shell.is-collapsed .collapse-btn {
  transform: rotate(180deg);
}

.main-area {
  min-width: 0;
  height: 100vh;
  overflow: auto;
  padding: 20px 24px 28px;
}

.topbar {
  height: 58px;
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  margin-bottom: 22px;
  border-radius: 16px;
  background: rgba(255, 255, 255, .94);
  border: 1px solid var(--mx-border);
  box-shadow: var(--mx-shadow-soft);
  backdrop-filter: blur(14px);
}

.search-wrapper {
  position: relative;
  width: 420px;
  max-width: 42vw;
}

.global-search {
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  background: #f7f9fc;
  border: 1px solid #dde6f2;
  transition: .18s ease;
}

.global-search.focused {
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .12);
  background: #fff;
}

.global-search .el-icon {
  color: #94a3b8;
  flex-shrink: 0;
  font-size: 16px;
}

.global-search input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 14.5px;
  font-weight: 500;
  color: #334155;
  min-width: 0;
}

.global-search input::placeholder {
  color: #94a3b8;
  font-weight: 500;
}

kbd {
  margin-left: auto;
  border: 1px solid #dbeafe;
  background: #fff;
  border-radius: 8px;
  padding: 2px 7px;
  color: #64748b;
  font-size: 12px;
  flex-shrink: 0;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  max-height: 420px;
  overflow-y: auto;
  border-radius: 16px;
  padding: 8px;
  z-index: 100;
  background: #fff;
  border: 1px solid var(--mx-border);
  box-shadow: 0 20px 42px rgba(15, 23, 42, .12);
}

.search-item {
  min-height: 48px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 14px;
  border-radius: 12px;
  cursor: pointer;
  transition: .15s ease;
}

.search-item:hover,
.search-item.active {
  background: #f0f6ff;
}

.search-item-title {
  font-size: 14px;
  font-weight: 650;
  color: #0f172a;
  line-height: 1.2;
}

.search-item-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.search-item-group {
  font-size: 12px;
  color: var(--mx-primary);
  font-weight: 600;
}

.search-item-path {
  font-size: 12px;
  color: #94a3b8;
}

.search-empty {
  height: 64px;
  display: grid;
  place-items: center;
  color: #94a3b8;
  font-size: 14px;
  font-weight: 500;
}

.top-spacer {
  flex: 1;
}

.top-pill {
  position: relative;
  background: #fff !important;
  border-color: #dde6f2 !important;
  font-size: 13px;
  color: #334155 !important;
}

sup {
  color: #fff;
  background: #ef4444;
  border-radius: 999px;
  padding: 1px 5px;
  font-size: 10px;
  position: absolute;
  transform: translate(2px, -11px);
}

.profile {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 132px;
  padding: 4px 6px 4px 4px;
  cursor: pointer;
}

.profile p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #64748b;
}

.content {
  padding: 0;
  transition: opacity .18s ease, transform .18s ease;
}

.is-switching .content {
  opacity: .72;
  transform: translateY(2px);
}

.route-progress {
  height: 3px;
  margin: -12px 12px 9px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(219, 234, 254, .75);
}

.route-progress::before {
  content: "";
  display: block;
  width: 42%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2563eb, #0ea5e9);
  animation: route-progress 1s ease-in-out infinite;
}

@keyframes route-progress {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(260%); }
}

:deep(.admin-click-feedback),
.admin-click-feedback {
  position: relative;
  overflow: hidden;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, .12) !important;
  transform: translateY(-1px);
}

:deep(.admin-click-feedback)::after,
.admin-click-feedback::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .62), transparent);
  animation: button-sheen .7s ease;
  pointer-events: none;
}

@keyframes button-sheen {
  from { transform: translateX(-110%); }
  to { transform: translateX(110%); }
}

@media(max-width: 1100px) {
  .admin-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: none;
  }

  .main-area {
    height: auto;
    min-height: 100vh;
    padding: 14px;
  }

  .search-wrapper {
    width: auto;
    flex: 1;
    max-width: none;
  }

  .top-pill {
    display: none;
  }
}
</style>
