<template>
  <div class="designer-studio">
    <!-- ===== 顶部悬浮页签岛 ===== -->
    <div class="ds-tabs">
      <div class="ds-tabs-island">
        <button
          v-for="p in pages"
          :key="p.value"
          class="ds-tab"
          :class="{ active: activePage === p.value }"
          @click="switchPage(p.value)"
        >
          <el-icon :size="14"><component :is="p.icon" /></el-icon>
          <span>{{ p.label }}</span>
        </button>
      </div>
    </div>

    <!-- ===== 深色画布桌面 ===== -->
    <div class="ds-desktop">
      <!-- 真实页面编辑器：画布即真机页面，点哪改哪（v-show 保留编辑状态） -->
      <div v-show="activePage === 'home'" class="ds-realedit">
        <HomeEditor />
      </div>
      <div v-show="activePage === 'message'" class="ds-realedit">
        <MessageEditor />
      </div>
      <div v-show="activePage === 'profile'" class="ds-realedit">
        <ProfileEditor />
      </div>
      <!-- 容器页：暂无真实页面编辑器，用拖拽布局（v-show 保留状态） -->
      <LayoutBuilder v-show="activePage === 'containers'" page-type="containers" hide-page-tabs />
      <!-- 活动页：活动页工厂（模板化创建；tmagic 编辑器降级为厂内高级模式） -->
      <ActivityStudio v-if="tmagicVisited" v-show="activePage === 'tmagic'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { House, Grid, Bell, User, MagicStick } from '@element-plus/icons-vue'
import LayoutBuilder from '@/components/layout/LayoutBuilder.vue'
import HomeEditor from '@/views/miniapp/editor/HomeEditor.vue'
import MessageEditor from '@/views/miniapp/editor/MessageEditor.vue'
import ProfileEditor from '@/views/miniapp/editor/ProfileEditor.vue'

// 活动页工厂体积较大（高级模式内含 tmagic/monaco），按需加载
const ActivityStudio = defineAsyncComponent(() => import('@/views/miniapp/ActivityStudio.vue'))

const pages = [
  { label: '首页', value: 'home', icon: House },
  { label: '容器页', value: 'containers', icon: Grid },
  { label: '消息页', value: 'message', icon: Bell },
  { label: '我的页', value: 'profile', icon: User },
  { label: '活动页', value: 'tmagic', icon: MagicStick },
] as const

type PageKey = (typeof pages)[number]['value']

const route = useRoute()
const router = useRouter()

const isPageKey = (v: unknown): v is PageKey => pages.some((p) => p.value === v)

const activePage = ref<PageKey>(isPageKey(route.query.page) ? route.query.page : 'home')
const tmagicVisited = ref(activePage.value === 'tmagic')

function switchPage(p: PageKey) {
  if (p === activePage.value) return
  activePage.value = p
  if (p === 'tmagic') tmagicVisited.value = true
  if (route.query.page !== p) router.replace({ query: { ...route.query, page: p } })
}

// 外部 query 变化（如旧 mode=tmagic 兼容跳转）同步页签
watch(
  () => route.query.page,
  (v) => {
    if (isPageKey(v) && v !== activePage.value) {
      activePage.value = v
      if (v === 'tmagic') tmagicVisited.value = true
    }
  },
)
</script>

<style scoped lang="scss">
.designer-studio {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 140px);
  min-height: 600px;
  /* L1 桌面：四级材质最底层 */
  background-color: var(--ds-desktop, #0B0D10);
  background-image: radial-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 24px 24px;
  border-radius: var(--ds-radius-card, 10px);
  overflow: hidden;
  position: relative;
}

/* ===== 顶部悬浮页签岛（顶部区域与外壳统一：透出 L1 桌面，岛为 L2 材质） ===== */
.ds-tabs {
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
  padding: var(--ds-space-3, 12px) 0;
  position: relative;
  z-index: 10;
}
.ds-tabs-island {
  display: flex;
  gap: var(--ds-space-1, 4px);
  padding: var(--ds-space-1, 4px);
  /* L2 面板岛 */
  background: rgba(20, 23, 28, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--ds-line, rgba(255, 255, 255, 0.06));
  border-radius: 999px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}
.ds-tab {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2, 8px);
  height: 32px;
  padding: 0 var(--ds-space-4, 16px);
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ds-ink-dim, #9CA3AF);
  font-size: var(--ds-fs-body, 13px);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--ds-ease, 150ms ease-out), color var(--ds-ease, 150ms ease-out);
  white-space: nowrap;
}
.ds-tab:hover {
  color: var(--ds-ink, #E7EAEE);
  background: var(--ds-line, rgba(255, 255, 255, 0.06));
}
.ds-tab.active {
  background: var(--ds-brand, #16A34A);
  color: #fff;
}
.ds-tab.active:hover {
  background: var(--ds-brand-hover, #15803D);
  color: #fff;
}

/* ===== 桌面 ===== */
.ds-desktop {
  flex: 1;
  min-height: 0;
  position: relative;
  /* 必须是 flex 列容器：否则子级 flex:1 失效，编辑器会被内容撑出视口、面板无法滚动 */
  display: flex;
  flex-direction: column;
}

/* LayoutBuilder：铺满桌面，背景交给工作室的点阵桌面 */
.ds-desktop :deep(.wb) {
  height: 100%;
  min-height: 0;
  background: transparent;
  padding: 0 var(--ds-space-3, 12px) var(--ds-space-3, 12px);
}

/* 真实页面编辑器：宽敞透气——外层留白、面板间隔、圆角分区 */
.ds-realedit {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: var(--ds-space-4, 16px) var(--ds-space-6, 24px);
  background: #eef1f4;
  border-radius: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ds-realedit :deep(.rte) {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-4, 16px);
}
/* 工具条：独立卡片，更高更松 */
.ds-realedit :deep(.rte-toolbar) {
  border-radius: var(--ds-radius-card, 10px);
  padding: var(--ds-space-3, 12px) var(--ds-space-4, 16px);
  flex: 0 0 auto;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.05);
}
.ds-realedit :deep(.rte-body) {
  flex: 1;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: var(--ds-space-4, 16px);
  align-items: stretch;
}
/* 画布区：大圆角卡片，手机屏居中且四周留足空间 */
.ds-realedit :deep(.rte-canvas) {
  border-radius: var(--ds-radius-card, 10px);
  padding: var(--ds-space-6, 24px);
  overflow-y: auto;
  justify-content: flex-start;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
}
.ds-realedit :deep(.rte-page) {
  width: 390px;
  min-height: 600px;
  max-height: none;
  height: calc(100vh - 250px);
  border-radius: var(--ds-radius-phone, 24px) var(--ds-radius-phone, 24px) 0 0;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.16);
  /* 画布放大到可操作比例（Chromium zoom，等比放大内部所有内容与文字） */
  zoom: 1.38;
}
/* 属性面板：独立圆角卡片，内边距加大 */
.ds-realedit :deep(.rte-props) {
  border: 1px solid var(--mx-border, #e3e9f2);
  border-radius: var(--ds-radius-card, 10px);
  max-height: none;
  height: 100%;
  overflow: hidden;
  padding: var(--ds-space-4, 16px) var(--ds-space-6, 24px);
  position: static;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
}
/* 滚动链：tabs 撑满、内容区可滚（面板内容再高也能滑到底） */
.ds-realedit :deep(.rte-props .el-tabs) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.ds-realedit :deep(.rte-props .el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.ds-realedit :deep(.rte-props .el-tab-pane) {
  height: 100%;
}

/* tmagic 编辑器：铺满桌面，外壳卡片深色化 */
.ds-desktop :deep(.tmagic-page-editor) {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3, 12px);
  padding: 0 var(--ds-space-3, 12px) var(--ds-space-3, 12px);
}
.ds-desktop :deep(.tmagic-toolbar) {
  /* L2 面板岛 */
  background: rgba(20, 23, 28, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid var(--ds-line, rgba(255, 255, 255, 0.06));
  border-radius: var(--ds-radius-card, 10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}
.ds-desktop :deep(.tmagic-toolbar .toolbar-label),
.ds-desktop :deep(.tmagic-toolbar .toolbar-tip) {
  color: var(--ds-ink-dim, #9CA3AF);
}
.ds-desktop :deep(.tmagic-toolbar .toolbar-tip code) {
  background: var(--ds-line, rgba(255, 255, 255, 0.06));
  color: var(--ds-ink, #E7EAEE);
}
.ds-desktop :deep(.tmagic-canvas) {
  flex: 1;
  height: auto;
  min-height: 0;
  border-radius: var(--ds-radius-card, 10px);
}

/* tmagic 舞台：手机框暗示，让 375px 画布在桌面中一眼可辨 */
.ds-desktop :deep(.m-editor-stage) {
  border-radius: var(--ds-radius-phone, 24px);
  box-shadow: 0 0 0 10px var(--ds-raised, #1C2026), 0 24px 64px rgba(0, 0, 0, 0.5);
}

/* tmagic 编辑器内部 chrome 深色适配（舞台纸张保持白色）：L2 岛 + L3 控件 */
.ds-desktop :deep(.m-editor-nav-menu),
.ds-desktop :deep(.m-editor-layout-left),
.ds-desktop :deep(.m-editor-framework-left),
.ds-desktop :deep(.m-editor-layer-panel),
.ds-desktop :deep(.magic-editor-content-menu) {
  background: var(--ds-island, #14171C);
  color: var(--ds-ink, #E7EAEE);
  border-color: var(--ds-line, rgba(255, 255, 255, 0.06));
}
.ds-desktop :deep(.m-editor-page-bar),
.ds-desktop :deep(.m-editor-page-bar-item),
.ds-desktop :deep(.m-editor-page-bar-item-icon),
.ds-desktop :deep(.m-editor-page-bar-search) {
  background: var(--ds-raised, #1C2026);
  color: #c9ced6;
  border-color: var(--ds-line, rgba(255, 255, 255, 0.06));
}
.ds-desktop :deep(.m-editor-layout-left) :is(.el-tree, .el-tree-node__content, .el-input__wrapper),
.ds-desktop :deep(.m-editor-framework-left) :is(.el-tree, .el-tree-node__content, .el-input__wrapper) {
  background: transparent;
  color: #c9ced6;
}
.ds-desktop :deep(.m-editor-layout-left) :is(h1, h2, h3, h4, span, div, p),
.ds-desktop :deep(.m-editor-framework-left) :is(h1, h2, h3, h4, span, div, p) {
  color: #c9ced6;
}
.ds-desktop :deep(.m-editor-layout-left .el-input__inner),
.ds-desktop :deep(.m-editor-framework-left .el-input__inner) {
  color: var(--ds-ink, #E7EAEE);
}
.ds-desktop :deep(.m-editor-resizer) {
  background: var(--ds-line, rgba(255, 255, 255, 0.06));
}
</style>
