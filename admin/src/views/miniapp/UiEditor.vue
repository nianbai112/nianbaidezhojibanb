<template>
  <div class="ui-editor" :class="{ 'ue-designer': mode === 'designer' }">
    <!-- ===== 左侧：控制中心导航（设计器全屏沉浸时隐藏） ===== -->
    <aside v-if="mode !== 'designer'" class="ue-nav glass-card">
      <div class="ue-nav-title">UI 编辑器</div>
      <div v-for="g in navGroups" :key="g.label" class="ue-nav-group">
        <div class="ue-nav-group-label">{{ g.label }}</div>
        <button
          v-for="item in g.items"
          :key="item.key"
          class="ue-nav-item"
          :class="{ active: mode === item.key }"
          @click="switchMode(item.key)"
        >
          <el-icon :size="16"><component :is="item.icon" /></el-icon>
          <span>{{ item.name }}</span>
        </button>
      </div>
    </aside>

    <!-- ===== 右侧：工作区 ===== -->
    <main class="ue-main">
      <div v-if="mode !== 'designer'" class="ue-mode-hint glass-card">
        <b>{{ currentItem?.name }}</b>
        <span>{{ currentItem?.hint }}</span>
      </div>

      <EditorOverview v-if="mode === 'overview'" key="overview" @navigate="switchMode" />
      <DesignerStudio v-else-if="mode === 'designer'" key="designer" />
      <RegionTabbarManager v-else-if="mode === 'tabbar'" key="tabbar" />
      <RegionShareSettings v-else-if="mode === 'share'" key="share" />
      <EditorPublishEntry v-else-if="mode === 'publish-entry'" key="publish-entry" />
      <CodePackage v-else-if="mode === 'code'" key="code" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Odometer, MagicStick, Menu, Share, Aim, Files,
} from '@element-plus/icons-vue'
import RegionTabbarManager from '@/views/region/RegionTabbarManager.vue'
import RegionShareSettings from '@/views/region/RegionShareSettings.vue'
import CodePackage from '@/views/miniapp/CodePackage.vue'
import EditorOverview from '@/views/miniapp/editor/EditorOverview.vue'
import EditorPublishEntry from '@/views/miniapp/editor/EditorPublishEntry.vue'
import DesignerStudio from '@/views/miniapp/designer/DesignerStudio.vue'

const route = useRoute()
const router = useRouter()

const navGroups = [
  {
    label: '总览',
    items: [
      { key: 'overview', name: '总览 · 发布', icon: Odometer, hint: '区域装修完整度、发布检查清单一键发布到小程序' },
    ],
  },
  {
    label: '页面',
    items: [
      { key: 'designer', name: '设计器', icon: MagicStick, hint: '画布就是真实页面：点哪改哪，保存即生效' },
    ],
  },
  {
    label: '导航与触达',
    items: [
      { key: 'tabbar', name: 'TabBar 配置', icon: Menu, hint: '底部导航的图标、文案、跳转与中间发布按钮' },
      { key: 'share', name: '分享配置', icon: Share, hint: '分享首页 / 圈子 / 商品的卡片标题、描述与图' },
      { key: 'publish-entry', name: '发布入口', icon: Aim, hint: '发布弹窗（+ 号）的文案与插画装修' },
    ],
  },
  {
    label: '开发者',
    items: [
      { key: 'code', name: '代码包', icon: Files, hint: 'app.json、API 域名、下载代码包（源码级改动，需开发者工具上传）' },
    ],
  },
]

const allItems = navGroups.flatMap((g) => g.items)
const validKeys = allItems.map((i) => i.key)

/** 旧版独立入口已全部收编进统一设计器 */
const legacyModeMap: Record<string, string> = {
  realtime: 'designer',
  layout: 'designer',
  tmagic: 'designer',
}
const resolveMode = (raw: unknown): string => {
  const key = String(raw || '')
  if (validKeys.includes(key)) return key
  if (legacyModeMap[key]) return legacyModeMap[key]
  return 'overview'
}

// 旧链接 ?mode=tmagic（无 page 参数）直接落到设计器的活动页页签
const rawMode = String(route.query.mode || '')
if (rawMode === 'tmagic' && !route.query.page) {
  router.replace({ query: { ...route.query, mode: 'designer', page: 'tmagic' } })
}

const mode = ref(resolveMode(route.query.mode))
const currentItem = computed(() => allItems.find((i) => i.key === mode.value))

function switchMode(key: string, page?: string) {
  const target = resolveMode(key)
  if (!validKeys.includes(target)) return
  // 总览检查清单可带 page 跳转（designer:home/message/profile）；
  // 旧 key（realtime/layout/tmagic）映射到设计器，tmagic 补 page=tmagic。
  // 注意：mode 与 page 必须在同一次 replace 里写入，且用 skipQuerySync 抑制
  // watch(mode) 的兜底 replace——后者在导航完成前执行会基于旧 query 二次
  // replace，把刚写入的 page 冲掉（去配置跳转丢页签）。
  const query: Record<string, any> = { ...route.query, mode: target }
  if (page) query.page = page
  else if (key === 'tmagic' && !route.query.page) query.page = 'tmagic'
  skipQuerySync = true
  router.replace({ query }).finally(() => { skipQuerySync = false })
  mode.value = target
}

/** switchMode 已一次性同步 query 时，跳过 watch(mode) 的兜底 replace */
let skipQuerySync = false

watch(mode, (v) => {
  if (skipQuerySync) return
  if (route.query.mode !== v) router.replace({ query: { ...route.query, mode: v } })
})
</script>

<style scoped lang="scss">
.ui-editor {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.ue-nav {
  position: sticky;
  top: 0;
  padding: 14px 10px;
  display: grid;
  gap: 12px;
}
.ue-nav-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--mx-text);
  padding: 0 10px;
}
.ue-nav-group { display: grid; gap: 2px; }
.ue-nav-group-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--mx-muted);
  padding: 4px 10px;
  letter-spacing: 0.5px;
}
.ue-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 0;
  border-radius: 9px;
  background: none;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--mx-sub);
  text-align: left;
  transition: background-color .15s ease, color .15s ease;
  &:hover { color: var(--mx-text); background: var(--mx-soft); }
  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-weight: 700;
  }
}

.ue-main { display: grid; gap: 14px; min-width: 0; }

/* ===== 设计器全屏沉浸：去掉壳层间距，深色桌面铺满 ===== */
.ui-editor.ue-designer {
  display: block;
}
.ui-editor.ue-designer .ue-main {
  display: block;
}
.ui-editor.ue-designer :deep(.designer-studio) {
  height: calc(100vh - 56px);
  min-height: 560px;
  border-radius: 0;
}
.ue-mode-hint {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 10px 18px;
  b { font-size: 14.5px; color: var(--mx-text); white-space: nowrap; }
  span { color: var(--mx-muted); font-size: 12.5px; }
}
</style>
