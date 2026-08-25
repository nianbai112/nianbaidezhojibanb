<template>
  <div class="wb studio-dark">
    <!-- ===== 顶部工具条 ===== -->
    <div class="wb-toolbar">
      <div class="wb-left">
        <el-segmented v-if="!hidePageTabs" :model-value="currentPage" :options="pageOptions" @change="onPageSelect" />
        <el-select :model-value="selectedRegion" placeholder="选择区域" popper-class="studio-popper" style="width: 160px" @change="onRegionSelect">
          <el-option label="全局配置" value="" />
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-tag v-if="layoutStatus" :type="layoutStatus === 'published' ? 'success' : layoutStatus === 'draft' ? 'warning' : 'info'" size="small" effect="light">
          {{ layoutStatus === 'published' ? '已发布' : layoutStatus === 'draft' ? '草稿' : '默认布局' }}
        </el-tag>
        <el-tag v-if="bundled" type="danger" size="small" effect="light">已内置代码包</el-tag>
        <span class="wb-dirty" :class="{ dirty: dirtyCount > 0 }">
          <i class="wb-dirty-dot" />{{ dirtyCount > 0 ? `${dirtyCount} 处未保存` : autosavedText }}
        </span>
      </div>
      <div class="wb-right">
        <div class="wb-zoom">
          <el-button text :icon="Minus" :disabled="zoom <= 0.6" @click="zoom = Math.max(0.6, +(zoom - 0.15).toFixed(2))" />
          <span class="wb-zoom-val">{{ Math.round(zoom * 100) }}%</span>
          <el-button text :icon="Plus" :disabled="zoom >= 1.05" @click="zoom = Math.min(1.05, +(zoom + 0.15).toFixed(2))" />
        </div>
        <el-dropdown trigger="click" popper-class="studio-popper" @command="onMoreCommand">
          <el-button :icon="MoreFilled" circle text />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="export">导出布局 JSON</el-dropdown-item>
              <el-dropdown-item command="import">导入布局 JSON</el-dropdown-item>
              <el-dropdown-item command="package" divided :disabled="!layout.components.length">
                <el-icon><Box /></el-icon>内置到代码包（开发者）
              </el-dropdown-item>
              <el-dropdown-item v-if="bundled" command="remove-package">移除代码包内置布局</el-dropdown-item>
              <el-dropdown-item command="history" divided>版本历史</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button :icon="RefreshLeft" circle :disabled="!past.length" title="撤销 (Ctrl+Z)" @click="undo" />
        <el-button :icon="RefreshRight" circle :disabled="!future.length" title="重做 (Ctrl+Shift+Z)" @click="redo" />
        <el-button :icon="View" @click="previewVisible = true">预览</el-button>
        <el-button :icon="Document" :loading="saving" @click="saveDraft">保存草稿{{ dirtyCount ? ` (${dirtyCount})` : '' }}</el-button>
        <el-button type="primary" :icon="Promotion" :disabled="!layout.components.length" @click="publishLayout">发布</el-button>
      </div>
    </div>

    <!-- ===== 代码包内置警告条：发布会被内置布局静默压制 ===== -->
    <div v-if="bundled" class="wb-bundled-warn">
      <el-icon :size="14"><WarningFilled /></el-icon>
      <span>当前小程序使用代码包内置布局，发布不会生效——需先在更多菜单移除内置，或重新下载代码包上传</span>
    </div>

    <div class="wb-body">
      <!-- ===== 左侧悬浮岛：工具轨 + 组件面板 ===== -->
      <div class="wb-side">
      <!-- ===== 工具轨 ===== -->
      <div class="wb-rail">
        <button class="rail-btn active">
          <el-icon :size="18"><Grid /></el-icon>
          <span>组件</span>
        </button>
      </div>

      <!-- ===== 组件面板 ===== -->
      <div class="wb-library">
        <div class="lib-search">
          <el-input v-model="widgetSearch" placeholder="搜索组件" :prefix-icon="Search" clearable size="small" />
        </div>
        <div class="lib-scroll">
          <div v-for="group in filteredGroups" :key="group.name" class="lib-group">
            <div class="lib-group-name">{{ group.name }}</div>
            <div
              v-for="comp in group.items"
              :key="comp.type"
              class="lib-item"
              :class="{ unavailable: !isWidgetAvailable(comp) }"
              :draggable="isWidgetAvailable(comp)"
              :title="isWidgetAvailable(comp) ? '' : `该组件不适用于${pageLabel}页面`"
              @dragstart="isWidgetAvailable(comp) && dragStart($event, comp)"
              @click="tryAddWidget(comp)"
            >
              <WidgetThumb :type="comp.type" :icon="iconOf(comp.icon)" :color="comp.color" :bg="comp.bg" />
              <span class="lib-name">{{ comp.name }}</span>
            </div>
          </div>
          <div v-if="!filteredGroups.length" class="lib-none">没有匹配的组件</div>
        </div>
      </div>
      </div>

      <!-- ===== 画布 ===== -->
      <div class="wb-canvas" @dragover.prevent="canvasDragOver" @drop="onCanvasDrop" @click.self="selectedComponent = null">
        <div class="wb-canvas-count">{{ layout.components.length }} 个组件</div>
        <div class="wb-device" :style="deviceStyle">
          <div class="wb-device-speaker" />
          <div class="wb-device-screen" :style="screenStyle">
            <div class="wb-statusbar">
              <span class="wb-statusbar-time">9:41</span>
              <span class="wb-statusbar-icons"><i class="sb-dot" /><i class="sb-dot" /><i class="sb-battery" /></span>
            </div>
            <div class="wb-page">
          <template v-for="(comp, index) in layout.components" :key="comp.id">
            <div v-if="indicatorIndex === index" class="wb-drop-line" />
            <div
              class="wb-item"
              :class="{ selected: selectedComponent?.id === comp.id, disabled: comp.enabled === false }"
              :style="shellStyle(comp)"
              draggable="true"
              @click.stop="selectedComponent = comp"
              @dragstart.stop="itemDragStart($event, index)"
              @dragover.prevent.stop="itemDragOver($event, index)"
              @drop.stop="itemDrop($event, index)"
              @dragleave="itemDragLeave"
            >
              <div class="item-toolbar" :class="{ below: index === 0 }" v-if="selectedComponent?.id === comp.id">
                <span class="item-toolbar-name">{{ nameOf(comp.type) }}</span>
                <el-icon :class="{ dim: index === 0 }" @click.stop="moveComponent(index, -1)"><Top /></el-icon>
                <el-icon :class="{ dim: index === layout.components.length - 1 }" @click.stop="moveComponent(index, 1)"><Bottom /></el-icon>
                <el-icon class="danger" @click.stop="removeComponent(index)"><Delete /></el-icon>
              </div>

              <!-- 真机渲染层：协议组件 1:1 复刻 page-renderer（renderer/WebRenderer.vue） -->
              <WebRenderer :comp="comp" :region-id="selectedRegion || 'global'" />
            </div>
          </template>
          <div v-if="indicatorIndex === layout.components.length && layout.components.length" class="wb-drop-line" />

          <!-- 空态：模板起手 -->
          <div v-if="!layout.components.length" class="wb-templates" @dragover.prevent>
            <div class="wb-templates-title">从模板开始，或从左侧拖入组件</div>
            <div class="wb-templates-grid">
              <button v-for="t in templates" :key="t.name" class="tpl-card" @click="applyTemplate(t)">
                <div class="tpl-card-top">
                  <span class="tpl-emoji">{{ t.emoji }}</span>
                  <span class="tpl-name">{{ t.name }}</span>
                </div>
                <span class="tpl-desc">{{ t.desc }}</span>
              </button>
            </div>
          </div><!-- /wb-templates 内层结束 -->

          <!-- 空态结束 -->

          <!-- 页面内置内容语境（淡化展示，不可编辑） -->
          <NativePageContext :page-type="currentPage" :region-id="selectedRegion || 'global'" />
            </div><!-- /wb-page -->
          </div><!-- /wb-device-screen -->
        </div><!-- /wb-device -->
      </div>

      <!-- ===== 右侧属性 ===== -->
      <div class="wb-props">
        <el-tabs v-model="propTab" stretch>
          <el-tab-pane label="组件" name="widget">
            <div v-if="selectedComponent" class="props-form">
              <div class="props-widget-head">
                <span class="props-widget-icon" :style="{ color: defOf(selectedComponent.type)?.color, background: defOf(selectedComponent.type)?.bg }">
                  <el-icon :size="16"><component :is="iconOf(defOf(selectedComponent.type)?.icon)" /></el-icon>
                </span>
                <div>
                  <div class="props-widget-name">{{ nameOf(selectedComponent.type) }}</div>
                  <div class="props-widget-type">{{ selectedComponent.type }}</div>
                </div>
              </div>
              <div v-if="defOf(selectedComponent.type)?.kind === 'dynamic'" class="props-dynamic-tip">
                该模块在小程序内由内置业务模块渲染，此处仅控制排序与显隐
              </div>
              <el-form label-position="top">
                <el-form-item label="启用状态">
                  <el-switch v-model="selectedComponent.enabled" />
                </el-form-item>
                <el-form-item v-for="f in defOf(selectedComponent.type)?.fields || []" :key="f.key" :label="f.label">
                  <FieldInput :field="f" :model="selectedComponent.config" />
                </el-form-item>
              </el-form>
              <div v-if="!(defOf(selectedComponent.type)?.fields || []).length" class="props-tip">
                该组件没有可配置属性，调整顺序或在页面设置中修改全局样式。
              </div>
            </div>
            <div v-else class="props-none">
              <el-icon :size="26"><Pointer /></el-icon>
              <p>点击画布中的组件进行编辑</p>
            </div>
          </el-tab-pane>
          <el-tab-pane label="样式" name="style">
            <div v-if="selectedComponent" class="props-form">
              <div class="props-tip" style="margin-bottom: 12px">作用于组件外壳：间距、背景、圆角、边框。</div>
              <el-form label-position="top">
                <el-form-item v-for="f in STYLE_FIELDS" :key="f.key" :label="f.label">
                  <FieldInput :field="f" :model="styleOf(selectedComponent)" />
                </el-form-item>
              </el-form>
            </div>
            <div v-else class="props-none">
              <el-icon :size="26"><Pointer /></el-icon>
              <p>点击画布中的组件调整外壳样式</p>
            </div>
          </el-tab-pane>
          <el-tab-pane label="页面" name="page">
            <div class="props-form">
              <el-form label-position="top">
                <el-form-item v-for="f in schema.settings" :key="f.key" :label="f.label">
                  <FieldInput :field="f" :model="layout.settings" />
                </el-form-item>
              </el-form>
              <div class="props-tip">保存草稿后点击「发布」，小程序端立即生效。只有「发布」的配置才会出现在小程序里。</div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- ===== 版本历史抽屉 ===== -->
    <el-drawer v-model="historyVisible" title="版本历史" size="560px">
      <el-table :data="versions" v-loading="loadingVersions">
        <el-table-column label="版本" width="90">
          <template #default="{ row }"><b>{{ row.version ? `v${row.version}` : '草稿' }}</b></template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : row.status === 'draft' ? 'warning' : 'info'" size="small">
              {{ row.status === 'published' ? '当前线上' : row.status === 'draft' ? '草稿' : '历史版本' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="110">
          <template #default="{ row }">{{ row.note || '—' }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110">
          <template #default="{ row }">
            <el-button size="small" @click="rollbackVersion(row)" :disabled="row.status !== 'archived'">回滚到此版</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <!-- ===== 预览说明 ===== -->
    <el-dialog v-model="previewVisible" title="在小程序中预览" width="480px">
      <div class="preview-dialog">
        <p>发布后，在微信开发者工具中打开以下页面路径即可查看装修效果：</p>
        <div class="preview-path">
          <code>{{ decorationPath }}</code>
          <el-button size="small" @click="copyPath">复制</el-button>
        </div>
        <p class="muted-text">首页已接入装修渲染器：发布的组件会直接出现在首页顶部。草稿不会出现在小程序里。</p>
      </div>
    </el-dialog>

    <!-- ===== 导入 ===== -->
    <el-dialog v-model="importVisible" title="导入布局 JSON" width="520px">
      <el-input v-model="importText" type="textarea" :rows="10" placeholder='粘贴导出的布局 JSON（需包含 components 数组）' />
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" @click="importJson">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Top, Bottom, Delete, Plus, Minus, View, Document, Promotion, MoreFilled,
  Search, Grid, Pointer, Box, RefreshLeft, RefreshRight, WarningFilled,
} from '@element-plus/icons-vue'
import * as Icons from '@element-plus/icons-vue'
import { request } from '@/api/request'
import FieldInput from './FieldInput.vue'
import WebRenderer from './renderer/WebRenderer.vue'
import NativePageContext from './renderer/NativePageContext.vue'
import WidgetThumb from './WidgetThumb.vue'
import { pageSchemas, STYLE_FIELDS } from '@/views/layout/layoutSchemas'
import type { PageSchema, WidgetDef } from '@/views/layout/layoutSchemas'

const props = defineProps({
  pageType: { type: String, default: 'home' },
  /** 工作室模式下由外壳统一切换页面，隐藏内部页面 segmented */
  hidePageTabs: { type: Boolean, default: false },
})

const pageOptions = [
  { label: '首页', value: 'home' },
  { label: '容器页', value: 'containers' },
  { label: '消息页', value: 'message' },
  { label: '我的页', value: 'profile' },
]

const currentPage = ref(props.pageType)
watch(() => props.pageType, async (v) => {
  if (v !== currentPage.value) {
    // 注意顺序：先用旧 pageType 兜底保存，再切换，否则会存到新页面的接口上
    await flushPendingSave()
    currentPage.value = v
    onPageChange()
  }
})

/** 工作室/分段器切页：先保存旧页面草稿，再切 currentPage */
const onPageSelect = async (v: string) => {
  if (!v || v === currentPage.value) return
  await flushPendingSave()
  currentPage.value = v
  onPageChange()
}

const schema = computed<PageSchema>(() => pageSchemas[currentPage.value])
const widgets = computed<WidgetDef[]>(() => schema.value.widgets)

const iconOf = (name?: string) => (Icons as any)[name || 'Help'] || (Icons as any).Help

// ============ 状态 ============
const selectedRegion = ref('')
const regions = ref<any[]>([])
const layout = reactive<any>({ components: [], settings: {} })
const layoutStatus = ref('')
const selectedComponent = ref<any>(null)
const versions = ref<any[]>([])
const loadingVersions = ref(false)
const saving = ref(false)
const previewVisible = ref(false)
const importVisible = ref(false)
const importText = ref('')
const historyVisible = ref(false)
const widgetSearch = ref('')
const propTab = ref('widget')
const zoom = ref(0.9)
const indicatorIndex = ref(-1)

const decorationPath = computed(() => `pages/decoration/index?type=${currentPage.value}&region=${selectedRegion.value || 'global'}`)

// ============ 撤销 / 重做（快照栈，深监听 layout 防抖记录） ============
const past = ref<string[]>([])
const future = ref<string[]>([])
let lastSnapshot = ''
let applyingHistory = false

const takeSnapshot = () => JSON.stringify({ c: layout.components, s: layout.settings })

// ============ dirty 追踪 + 3s 防抖自动保存草稿（P0-1） ============
const savedSnapshot = ref('')
const autosavedAt = ref<Date | null>(null)

/** 与上次保存快照的差异条数（按组件逐条 + 页面设置） */
const dirtyCount = computed(() => {
  if (!savedSnapshot.value) return 0
  try {
    const saved = JSON.parse(savedSnapshot.value)
    const savedComps: any[] = saved.c || []
    const cur = layout.components
    let n = 0
    const len = Math.max(cur.length, savedComps.length)
    for (let i = 0; i < len; i++) {
      if (JSON.stringify(cur[i]) !== JSON.stringify(savedComps[i])) n++
    }
    if (JSON.stringify(layout.settings) !== JSON.stringify(saved.s || {})) n++
    return n
  } catch {
    return 0
  }
})

const autosavedText = computed(() => {
  if (!autosavedAt.value) return '已是最新'
  const d = autosavedAt.value
  return `已自动保存 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

let autosaveTimer: ReturnType<typeof setTimeout> | undefined

/** 静默保存草稿（自动保存 / 切页前兜底，不弹 toast） */
const autoSaveDraft = async () => {
  if (!dirtyCount.value) return
  try {
    await request.put(`/admin/layout/${currentPage.value}/${regionIdOf()}`, layout)
    savedSnapshot.value = takeSnapshot()
    autosavedAt.value = new Date()
  } catch (e) {
    console.warn('自动保存草稿失败', e)
  }
}

/** 切换页面/区域前的兜底保存（必须先于 currentPage / selectedRegion 变更调用） */
const flushPendingSave = async () => {
  clearTimeout(autosaveTimer)
  if (dirtyCount.value) await autoSaveDraft()
}

watch(dirtyCount, (v) => {
  clearTimeout(autosaveTimer)
  if (v > 0) autosaveTimer = setTimeout(() => autoSaveDraft(), 3000)
})

let historyTimer: ReturnType<typeof setTimeout> | undefined
watch(layout, () => {
  if (applyingHistory) return
  clearTimeout(historyTimer)
  historyTimer = setTimeout(() => {
    const cur = takeSnapshot()
    if (cur === lastSnapshot) return
    if (lastSnapshot) {
      past.value.push(lastSnapshot)
      if (past.value.length > 50) past.value.shift()
    }
    future.value = []
    lastSnapshot = cur
  }, 400)
}, { deep: true })

function applySnapshot(json: string) {
  const data = JSON.parse(json)
  applyingHistory = true
  layout.components = data.c || []
  layout.settings = data.s || {}
  selectedComponent.value = null
  lastSnapshot = json
  nextTick(() => { applyingHistory = false })
}

function undo() {
  if (!past.value.length) return
  future.value.push(takeSnapshot())
  applySnapshot(past.value.pop()!)
}

function redo() {
  if (!future.value.length) return
  past.value.push(takeSnapshot())
  applySnapshot(future.value.pop()!)
}

/** 加载/切换页面后重置历史（加载本身不可撤销），并以服务端状态作为已保存基线 */
function resetHistory() {
  past.value = []
  future.value = []
  lastSnapshot = takeSnapshot()
  savedSnapshot.value = lastSnapshot
}

function onHistoryKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (mod) {
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
    else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo() }
    else if (key === 'd') { e.preventDefault(); duplicateSelected() }
    return
  }
  if (key === 'delete' || key === 'backspace') {
    if (selectedComponent.value) {
      const idx = layout.components.findIndex((c: any) => c.id === selectedComponent.value.id)
      if (idx >= 0) { e.preventDefault(); removeComponent(idx) }
    }
  } else if (key === 'escape') {
    selectedComponent.value = null
  }
}

/** Ctrl/Cmd+D：复制选中组件到原组件下方并选中（互斥/唯一校验沿用） */
const duplicateSelected = () => {
  const cur = selectedComponent.value
  if (!cur) return
  const idx = layout.components.findIndex((c: any) => c.id === cur.id)
  if (idx < 0) return
  const err = mutexError(cur.type)
  if (err) {
    ElMessage.warning(err)
    return
  }
  const copy = JSON.parse(JSON.stringify(cur))
  copy.id = `${cur.type}_${Date.now()}_${idSeq++}`
  layout.components.splice(idx + 1, 0, copy)
  selectedComponent.value = copy
  syncOrder()
}

/** 设备外壳缩放（transform 作用于整机，屏幕本身不再缩放） */
const deviceStyle = computed(() => ({
  transform: `scale(${zoom.value})`,
}))

/** 手机屏幕底色（含状态栏区域） */
const screenStyle = computed(() => ({
  background: layout.settings?.background || '#F4F7F1',
}))

const widgetGroups = computed(() => {
  const map = new Map<string, WidgetDef[]>()
  for (const w of widgets.value) {
    if (!map.has(w.group)) map.set(w.group, [])
    map.get(w.group)!.push(w)
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }))
})

const filteredGroups = computed(() => {
  const kw = widgetSearch.value.trim()
  if (!kw) return widgetGroups.value
  return widgetGroups.value
    .map((g) => ({ ...g, items: g.items.filter((w) => w.name.includes(kw) || w.type.includes(kw)) }))
    .filter((g) => g.items.length)
})

const defOf = (type: string) => widgets.value.find((w) => w.type === type)
const nameOf = (type: string) => defOf(type)?.name || type
const formatTime = (t: string) => (t ? new Date(t).toLocaleString('zh-CN') : '-')

// ============ 模板 ============
const templates = computed(() => {
  const all = { name: '完整版', emoji: '✨', desc: '全部模块', components: widgets.value.map((w) => w.type) }
  if (currentPage.value === 'home') {
    return [
      { name: '经典校园首页', emoji: '🏫', desc: '导航+搜索+轮播+金刚区+信息流', components: ['navbar', 'search', 'banner', 'grid-menu', 'announcement', 'feed'] },
      { name: '活动推广页', emoji: '🎉', desc: '轮播+图文+按钮引导', components: ['banner', 'text', 'image', 'button'] },
      { name: '极简版', emoji: '🍃', desc: '搜索+金刚区+热门', components: ['search', 'grid-menu', 'hot-posts'] },
    ]
  }
  if (currentPage.value === 'message') {
    return [
      all,
      { name: '常用入口', emoji: '💬', desc: '私信+群聊+系统通知', components: ['private-chat', 'group-chat', 'system-notice'] },
      { name: '极简版', emoji: '🍃', desc: '私信+系统通知', components: ['private-chat', 'system-notice'] },
    ]
  }
  if (currentPage.value === 'profile') {
    return [
      all,
      { name: '校园生活', emoji: '🎓', desc: '用户卡+钱包+订单+签到', components: ['user-card', 'wallet', 'orders', 'sign-in'] },
      { name: '经营工具', emoji: '🛠️', desc: '用户卡+商家+骑手+设置', components: ['user-card', 'merchant-entry', 'rider-entry', 'settings'] },
    ]
  }
  return [all]
})

let idSeq = 0
const buildInstance = (type: string, order = layout.components.length) => ({
  id: `${type}_${Date.now()}_${idSeq++}`,
  type,
  enabled: true,
  order,
  config: JSON.parse(JSON.stringify(defOf(type)?.defaults || {})),
  style: {},
})

// ============ 约束系统（适用页面 / 每页唯一 / 互斥组） ============
const pageLabel = computed(() => pageOptions.find((p) => p.value === currentPage.value)?.label || currentPage.value)
const isWidgetAvailable = (w: WidgetDef) => !w.pages || w.pages.includes(currentPage.value)
/** 校验唯一/互斥，返回错误文案（null 表示可添加） */
const mutexError = (type: string, ignoreId?: string): string | null => {
  const def = defOf(type)
  if (!def) return null
  if (def.unique && layout.components.some((c: any) => c.type === type && c.id !== ignoreId)) {
    return `「${def.name}」每页只能添加一个`
  }
  if (def.mutexGroup) {
    const conflict = layout.components.find((c: any) => c.id !== ignoreId && defOf(c.type)?.mutexGroup === def.mutexGroup)
    if (conflict) {
      return `「${def.name}」与「${nameOf(conflict.type)}」互斥，每页只能保留一种`
    }
  }
  return null
}
const tryAddWidget = (comp: WidgetDef) => {
  if (!isWidgetAvailable(comp)) {
    ElMessage.warning(`「${comp.name}」不适用于${pageLabel.value}页面`)
    return
  }
  const err = mutexError(comp.type)
  if (err) {
    ElMessage.warning(err)
    return
  }
  addWidget(comp.type)
}

/** 组件外壳样式对象（样式 Tab 编辑目标） */
const styleOf = (comp: any) => {
  if (!comp.style) comp.style = {}
  return comp.style
}

/** 画布上的外壳样式实时预览（rpx → px ÷2） */
const shellStyle = (comp: any) => {
  const s = comp.style || {}
  const out: Record<string, string> = {}
  const rpx = (v: any) => `${(Number(v) || 0) / 2}px`
  if (Number(s.width)) out.width = rpx(s.width)
  if (Number(s.height)) out.height = rpx(s.height)
  if (Number(s.marginTop)) out.marginTop = rpx(s.marginTop)
  if (Number(s.marginBottom)) out.marginBottom = rpx(s.marginBottom)
  if (Number(s.marginX)) { out.marginLeft = rpx(s.marginX); out.marginRight = rpx(s.marginX) }
  if (Number(s.padding)) out.padding = rpx(s.padding)
  if (s.background) out.background = s.background
  if (s.backgroundImage) {
    out.backgroundImage = `url(${s.backgroundImage})`
    out.backgroundSize = s.backgroundSize || 'cover'
    out.backgroundRepeat = 'no-repeat'
    out.backgroundPosition = 'center'
  }
  if (Number(s.borderRadius)) out.borderRadius = rpx(s.borderRadius)
  if (s.borderColor && Number(s.borderWidth)) out.border = `${rpx(s.borderWidth)} solid ${s.borderColor}`
  if (Number(s.opacity) > 0 && Number(s.opacity) < 1) out.opacity = String(s.opacity)
  if (s.shadow) out.boxShadow = String(s.shadow).replace(/rpx/g, 'px').replace(/(\d+(?:\.\d+)?)px/g, (m: string) => `${Number(m.replace('px', '')) / 2}px`)
  if (s.overflow) out.overflow = s.overflow
  return out
}

const applyTemplate = (t: any) => {
  layout.components = t.components.map((type: string, i: number) => buildInstance(type, i))
  selectedComponent.value = null
  ElMessage.success(`已应用模板「${t.name}」，可在画布中继续调整`)
}

// ============ 画布交互 ============
const dragStart = (event: DragEvent, comp: WidgetDef) => {
  event.dataTransfer?.setData('component', JSON.stringify({ type: comp.type }))
}

const addWidget = (type: string) => {
  const instance = buildInstance(type)
  layout.components.push(instance)
  selectedComponent.value = instance
  propTab.value = 'widget'
}

const canvasDragOver = () => {
  if (indicatorIndex.value < 0 && layout.components.length) {
    indicatorIndex.value = layout.components.length
  }
}

const onCanvasDrop = (event: DragEvent) => {
  const raw = event.dataTransfer?.getData('component')
  if (!raw) { indicatorIndex.value = -1; return }
  try {
    const comp = JSON.parse(raw)
    const err = mutexError(comp.type)
    if (err) { ElMessage.warning(err); indicatorIndex.value = -1; return }
    const at = indicatorIndex.value >= 0 ? indicatorIndex.value : layout.components.length
    const instance = buildInstance(comp.type, at)
    layout.components.splice(at, 0, instance)
    selectedComponent.value = instance
    syncOrder()
  } catch { /* ignore */ }
  indicatorIndex.value = -1
}

let dragIndex = -1
const itemDragStart = (event: DragEvent, index: number) => {
  dragIndex = index
  event.dataTransfer?.setData('text/plain', String(index))
}
const itemDragOver = (event: DragEvent, index: number) => {
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const before = (event.clientY - rect.top) < rect.height / 2
  indicatorIndex.value = before ? index : index + 1
}
const itemDragLeave = () => { /* 保留指示线到 drop */ }
const itemDrop = (event: DragEvent, index: number) => {
  const raw = event.dataTransfer?.getData('component')
  const at = indicatorIndex.value >= 0 ? indicatorIndex.value : index + 1
  if (raw) {
    try {
      const comp = JSON.parse(raw)
      const err = mutexError(comp.type)
      if (err) { ElMessage.warning(err); indicatorIndex.value = -1; dragIndex = -1; return }
      const instance = buildInstance(comp.type, at)
      layout.components.splice(at, 0, instance)
      selectedComponent.value = instance
      syncOrder()
    } catch { /* ignore */ }
  } else if (dragIndex >= 0 && dragIndex !== at && dragIndex !== at - 1) {
    const moved = layout.components.splice(dragIndex, 1)[0]
    layout.components.splice(dragIndex < at ? at - 1 : at, 0, moved)
    syncOrder()
  }
  dragIndex = -1
  indicatorIndex.value = -1
}

const syncOrder = () => layout.components.forEach((c: any, i: number) => { c.order = i })

const moveComponent = (index: number, direction: number) => {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= layout.components.length) return
  const temp = layout.components[index]
  layout.components[index] = layout.components[newIndex]
  layout.components[newIndex] = temp
  syncOrder()
}

const removeComponent = (index: number) => {
  const removed = layout.components[index]
  layout.components.splice(index, 1)
  if (selectedComponent.value?.id === removed?.id) selectedComponent.value = null
  syncOrder()
}

// ============ 保存到代码包（写入小程序源码，随 zip 打包离线生效） ============
const bundled = ref(false)
const savingToPackage = ref(false)

const loadBundledStatus = async () => {
  try {
    const res: any = await request.get(`/admin/miniapp/code/pages/${currentPage.value}/layout`)
    bundled.value = !!res.data?.bundled
  } catch {
    bundled.value = false
  }
}

const saveToPackage = async () => {
  if (!layout.components.length) {
    ElMessage.warning('画布是空的，先添加组件')
    return
  }
  savingToPackage.value = true
  try {
    await request.put(`/admin/miniapp/code/pages/${currentPage.value}/layout`, {
      layout: { components: layout.components, settings: layout.settings },
    })
    bundled.value = true
    ElMessage.success(`已写入代码包！小程序「${pageLabel.value}」将离线使用该布局，记得到「代码包」下载 zip 上传`)
  } catch (e: any) {
    ElMessage.error(e?.message || '写入代码包失败')
  } finally {
    savingToPackage.value = false
  }
}

const removeFromPackage = async () => {
  try {
    await ElMessageBox.confirm('移除后小程序将回退为远程拉取已发布配置，确定？', '移除内置布局', { type: 'warning' })
  } catch {
    return
  }
  try {
    await request.delete(`/admin/miniapp/code/pages/${currentPage.value}/layout`)
    bundled.value = false
    ElMessage.success('已移除代码包内置布局')
  } catch (e: any) {
    ElMessage.error(e?.message || '移除失败')
  }
}

// ============ 更多菜单 ============
const onMoreCommand = (cmd: string) => {
  if (cmd === 'export') exportJson()
  else if (cmd === 'import') importVisible.value = true
  else if (cmd === 'history') { historyVisible.value = true; loadVersions() }
  else if (cmd === 'package') saveToPackage()
  else if (cmd === 'remove-package') removeFromPackage()
}

const exportJson = () => {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `layout-${currentPage.value}-${selectedRegion.value || 'global'}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('已导出布局 JSON')
}

const importJson = () => {
  try {
    const data = JSON.parse(importText.value)
    if (!Array.isArray(data.components)) throw new Error('bad')
    layout.components = data.components
    layout.settings = data.settings || {}
    syncOrder()
    selectedComponent.value = null
    importVisible.value = false
    importText.value = ''
    ElMessage.success('导入成功，记得保存草稿')
  } catch {
    ElMessage.error('JSON 格式无效：需要包含 components 数组')
  }
}

const copyPath = async () => {
  try {
    await navigator.clipboard.writeText(decorationPath.value)
    ElMessage.success('已复制页面路径')
  } catch {
    ElMessage.info(decorationPath.value)
  }
}

// ============ 数据交互 ============
const regionIdOf = () => selectedRegion.value || 'global'

const loadLayout = async () => {
  try {
    const res: any = await request.get(`/admin/layout/${currentPage.value}/${regionIdOf()}`)
    layoutStatus.value = res.data?.status || ''
    if (res.data?.config) {
      layout.components = Array.isArray(res.data.config.components) ? res.data.config.components : []
      layout.settings = res.data.config.settings || {}
    }
    selectedComponent.value = null
    await loadVersions()
  } catch (error) {
    console.error('加载布局失败', error)
    ElMessage.warning('加载布局数据失败')
  }
}

const onPageChange = () => {
  selectedComponent.value = null
  propTab.value = 'widget'
  loadLayout().finally(() => resetHistory())
  loadBundledStatus()
}

/** 切区域：先兜底保存当前草稿，再切换（模板用 :model-value 延迟赋值保证顺序） */
const onRegionSelect = async (v: string) => {
  if (v === selectedRegion.value) return
  await flushPendingSave()
  selectedRegion.value = v
  loadLayout().finally(() => resetHistory())
}

const saveDraft = async () => {
  saving.value = true
  try {
    await request.put(`/admin/layout/${currentPage.value}/${regionIdOf()}`, layout)
    savedSnapshot.value = takeSnapshot()
    autosavedAt.value = new Date()
    ElMessage.success('草稿已保存')
    await loadVersions()
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const publishLayout = async () => {
  try {
    await ElMessageBox.confirm('发布后小程序端立即生效，确定发布吗？', '确认发布', { type: 'warning' })
    await request.put(`/admin/layout/${currentPage.value}/${regionIdOf()}`, layout)
    await request.post(`/admin/layout/${currentPage.value}/${regionIdOf()}/publish`)
    savedSnapshot.value = takeSnapshot()
    ElMessage.success('布局已发布')
    await loadVersions()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('发布失败')
  }
}

const loadVersions = async () => {
  loadingVersions.value = true
  try {
    const res: any = await request.get(`/admin/layout/${currentPage.value}/${regionIdOf()}/versions`)
    versions.value = res.data?.list || []
  } catch (error) {
    console.error('加载版本失败', error)
  } finally {
    loadingVersions.value = false
  }
}

const rollbackVersion = async (version: any) => {
  try {
    await ElMessageBox.confirm(`确定回滚到 v${version.version} 吗？当前线上配置会被覆盖。`, '确认回滚', { type: 'warning' })
    const res: any = await request.post(`/admin/layout/${currentPage.value}/${regionIdOf()}/rollback`, { versionId: version.id })
    ElMessage.success(res?.message || '已回滚')
    await loadLayout()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('回滚失败')
  }
}

const loadRegions = async () => {
  try {
    const res: any = await request.get('/admin/regions')
    regions.value = res.data?.list || []
  } catch (error) {
    console.error('加载区域失败', error)
  }
}

onMounted(() => {
  loadRegions()
  loadLayout().finally(() => resetHistory())
  loadBundledStatus()
  window.addEventListener('keydown', onHistoryKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onHistoryKeydown)
  clearTimeout(historyTimer)
  clearTimeout(autosaveTimer)
  // 离开编辑器前兜底保存，避免丢稿
  if (dirtyCount.value) autoSaveDraft()
})
</script>

<style scoped lang="scss">
/* ============================================================
   深色工作室主题：面板岛 + 开放画布桌面
   面板岛 rgba(30,33,40,.92)+blur / 文字 #e7eaee #9aa1ab #6b7280 / 强调 #34d17b
   ============================================================ */
$panel-bg: rgba(30, 33, 40, 0.92);
$panel-border: rgba(255, 255, 255, 0.06);
$panel-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
$text-1: #e7eaee;
$text-2: #9aa1ab;
$text-3: #6b7280;
$accent: #34d17b;
$hover-fill: rgba(255, 255, 255, 0.07);

.wb {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 130px);
  min-height: 560px;
  background: #17191d; /* 独立使用时自带深色桌面；DesignerStudio 会覆盖为透明 */
  border-radius: 12px;
  padding: 12px;
  gap: 12px;
}

/* Element Plus 深色变量（只作用于本组件子树；抽屉/弹窗 teleport 到 body 不受影响，保持浅色） */
.studio-dark {
  --el-color-primary: #{$accent};
  --el-color-primary-light-3: #5cdc93;
  --el-color-primary-light-5: #8ae6b2;
  --el-color-primary-light-7: #b6f0d0;
  --el-color-primary-light-8: rgba(52, 209, 123, 0.18);
  --el-color-primary-light-9: rgba(52, 209, 123, 0.12);
  --el-color-primary-dark-2: #2ab569;
  --el-text-color-primary: #{$text-1};
  --el-text-color-regular: #c9cfd8;
  --el-text-color-secondary: #{$text-2};
  --el-text-color-placeholder: #{$text-3};
  --el-border-color: rgba(255, 255, 255, 0.12);
  --el-border-color-light: rgba(255, 255, 255, 0.08);
  --el-border-color-lighter: rgba(255, 255, 255, 0.06);
  --el-border-color-hover: rgba(255, 255, 255, 0.22);
  --el-fill-color: rgba(255, 255, 255, 0.07);
  --el-fill-color-light: rgba(255, 255, 255, 0.05);
  --el-fill-color-lighter: rgba(255, 255, 255, 0.03);
  --el-fill-color-blank: transparent;
  --el-bg-color: #1e2128;
  --el-bg-color-overlay: #22262e;
  --el-disabled-bg-color: rgba(255, 255, 255, 0.04);
  --el-disabled-text-color: #{$text-3};
  --el-disabled-border-color: rgba(255, 255, 255, 0.06);
  --el-switch-off-color: rgba(255, 255, 255, 0.16);
}

/* ===== 顶部悬浮工具岛 ===== */
.wb-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 8px 12px;
  background: $panel-bg;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid $panel-border;
  border-radius: 12px;
  box-shadow: $panel-shadow;
  flex: 0 0 auto;
}
.wb-left, .wb-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 工具条按钮：透明底 + hover 浅填充；图标按钮 32px 方形 */
.wb-toolbar :deep(.el-button) {
  height: 32px;
  border-radius: 8px;
  font-size: 13px;
  background: transparent;
  border-color: transparent;
  color: $text-2;
  transition: background-color .15s ease, color .15s ease;
}
.wb-toolbar :deep(.el-button:hover),
.wb-toolbar :deep(.el-button:focus-visible) {
  background: $hover-fill;
  color: $text-1;
  border-color: transparent;
}
.wb-toolbar :deep(.el-button.is-circle) { width: 32px; padding: 0; }
.wb-toolbar :deep(.el-button [class*="el-icon"]) { font-size: 16px; }
.wb-toolbar :deep(.el-button.is-disabled),
.wb-toolbar :deep(.el-button.is-disabled:hover) {
  background: transparent;
  color: $text-3;
}
/* 主按钮（发布）：品牌绿 */
.wb-toolbar :deep(.el-button--primary) {
  background: $accent;
  border-color: $accent;
  color: #0c0e11;
  font-weight: 700;
}
.wb-toolbar :deep(.el-button--primary:hover) {
  background: #4be08d;
  border-color: #4be08d;
  color: #0c0e11;
}
.wb-toolbar :deep(.el-button--primary.is-disabled),
.wb-toolbar :deep(.el-button--primary.is-disabled:hover) {
  background: rgba(52, 209, 123, 0.22);
  border-color: transparent;
  color: rgba(231, 234, 238, 0.4);
}
/* AI 生成（warning plain） */
.wb-toolbar :deep(.el-button--warning.is-plain) {
  background: rgba(251, 191, 36, 0.1);
  border-color: rgba(251, 191, 36, 0.35);
  color: #fbbf24;
}
.wb-toolbar :deep(.el-button--warning.is-plain:hover) {
  background: rgba(251, 191, 36, 0.18);
  border-color: rgba(251, 191, 36, 0.55);
  color: #fcd34d;
}
/* 保存到代码包（success plain） */
.wb-toolbar :deep(.el-button--success.is-plain) {
  background: rgba(52, 209, 123, 0.1);
  border-color: rgba(52, 209, 123, 0.35);
  color: $accent;
}
.wb-toolbar :deep(.el-button--success.is-plain:hover) {
  background: rgba(52, 209, 123, 0.18);
  border-color: rgba(52, 209, 123, 0.55);
  color: #4be08d;
}

/* 状态 tag 深色适配 */
.wb-toolbar :deep(.el-tag) {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  color: $text-2;
}
.wb-toolbar :deep(.el-tag--success) { background: rgba(52, 209, 123, 0.12); border-color: rgba(52, 209, 123, 0.3); color: $accent; }
.wb-toolbar :deep(.el-tag--warning) { background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.3); color: #fbbf24; }
.wb-toolbar :deep(.el-tag--danger) { background: rgba(248, 113, 113, 0.12); border-color: rgba(248, 113, 113, 0.3); color: #f87171; }

/* 页面 segmented 深色适配 */
.wb-toolbar :deep(.el-segmented) {
  --el-segmented-bg-color: rgba(255, 255, 255, 0.06);
  --el-segmented-item-selected-bg-color: #{$accent};
  --el-segmented-item-selected-color: #0c0e11;
  --el-border-radius-base: 8px;
}
.wb-toolbar :deep(.el-segmented__item) { color: $text-2; transition: color .15s ease; }
.wb-toolbar :deep(.el-segmented__item:hover:not(.is-selected)) { color: $text-1; }
.wb-toolbar :deep(.el-segmented__item.is-selected) { color: #0c0e11; font-weight: 700; }

.wb-zoom {
  display: flex;
  align-items: center;
  gap: 2px;
  border: 1px solid $panel-border;
  border-radius: 8px;
  padding: 0 4px;
  background: rgba(255, 255, 255, 0.03);
}

/* dirty / 自动保存指示 */
.wb-dirty {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: $text-3;
  white-space: nowrap;
}
.wb-dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: $accent;
  flex: 0 0 auto;
}
.wb-dirty.dirty { color: #fbbf24; }
.wb-dirty.dirty .wb-dirty-dot { background: #f59e0b; }

/* 代码包内置警告条（琥珀色工作室风格） */
.wb-bundled-warn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fbbf24;
  font-size: 12.5px;
  line-height: 1.5;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.wb-zoom-val {
  font-size: 12px;
  color: $text-2;
  min-width: 40px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* ===== 主体：开放桌面 + 悬浮岛 ===== */
.wb-body {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

/* 左侧悬浮岛：工具轨 + 组件库 */
.wb-side {
  width: 232px;
  flex: 0 0 auto;
  display: flex;
  min-height: 0;
  background: $panel-bg;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid $panel-border;
  border-radius: 12px;
  box-shadow: $panel-shadow;
  overflow: hidden;
}

/* 工具轨 */
.wb-rail {
  width: 48px;
  border-right: 1px solid $panel-border;
  padding: 10px 5px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 0 0 auto;
}
.rail-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 2px;
  border: 0;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: $text-3;
  transition: background-color .15s ease, color .15s ease;
}
.rail-btn:hover { color: $text-1; background: $hover-fill; }
.rail-btn.active {
  background: rgba(52, 209, 123, 0.12);
  color: $accent;
  font-weight: 600;
}

/* 组件面板 */
.wb-library {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.lib-search { padding: 10px; border-bottom: 1px solid $panel-border; }
.lib-scroll { flex: 1; overflow-y: auto; padding: 10px 10px 16px; }
.lib-group-name {
  font-size: 11px;
  color: $text-3;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  padding: 10px 2px 6px;
}
.lib-item {
  padding: 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  cursor: grab;
  transition: transform .15s ease, border-color .15s ease, background-color .15s ease;
  margin-bottom: 8px;
}
.lib-item:hover {
  transform: translateY(-1px);
  border-color: rgba(52, 209, 123, 0.55);
  background: rgba(255, 255, 255, 0.06);
}
.lib-item.unavailable {
  opacity: .4;
  cursor: not-allowed;
}
.lib-item.unavailable:hover {
  transform: none;
  border-color: transparent;
  background: rgba(255, 255, 255, 0.04);
}
.lib-name {
  display: block;
  margin-top: 6px;
  font-size: 12.5px;
  color: $text-2;
  font-weight: 600;
  text-align: center;
}
.lib-none {
  padding: 30px 0;
  text-align: center;
  color: $text-3;
  font-size: 12.5px;
}

/* ===== 中央开放画布桌面 ===== */
.wb-canvas {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 32px 24px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  /* 点阵背景：让运营者感知到这是设计画布，而非普通表单 */
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
  background-size: 20px 20px;
  background-position: 0 0;
  border-radius: 12px;
}

/* 设备外壳：深色 bezel + 听筒 + 大屏投影 */
.wb-device {
  position: relative;
  flex: 0 0 auto;
  background: #0c0e11;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 11px;
  border-radius: 44px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
  transform-origin: top center;
  transition: transform .12s ease;
}
.wb-device-speaker {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 64px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
}
.wb-device-screen {
  border-radius: 33px;
  overflow: hidden;
  min-height: 640px;
  display: flex;
  flex-direction: column;
}

/* 状态栏（9:41 模拟） */
.wb-statusbar {
  height: 32px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  color: #1d271f;
  user-select: none;
}
.wb-statusbar-time { font-size: 12.5px; font-weight: 700; letter-spacing: .02em; }
.wb-statusbar-icons { display: inline-flex; align-items: center; gap: 5px; }
.sb-dot { width: 14px; height: 8px; border-radius: 2px; background: #1d271f; opacity: .85; display: inline-block; }
.sb-battery { width: 18px; height: 9px; border-radius: 2.5px; border: 1.5px solid #1d271f; display: inline-block; position: relative; }
.sb-battery::after { content: ''; position: absolute; top: 1.5px; bottom: 1.5px; left: 1.5px; right: 30%; background: #1d271f; border-radius: 1px; }

.wb-page {
  width: 375px;
  flex: 1;
  min-height: 608px;
  padding: 10px 0 24px;
}

/* 组件数悬浮徽章 */
.wb-canvas-count {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 6;
  padding: 5px 12px;
  border-radius: 999px;
  background: $panel-bg;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid $panel-border;
  box-shadow: $panel-shadow;
  color: $text-2;
  font-size: 12px;
}

.wb-drop-line {
  height: 3px;
  margin: 2px 12px;
  border-radius: 2px;
  background: $accent;
  box-shadow: 0 0 0 1px rgba(52, 209, 123, 0.35);
}

.wb-item {
  position: relative;
  border: 1.5px dashed transparent;
  border-radius: 10px;
  cursor: pointer;
  margin: 2px 6px;
  transition: box-shadow .12s ease, border-color .12s ease;
}
.wb-item:hover { box-shadow: 0 0 0 2px rgba(52, 209, 123, 0.4); }
.wb-item.selected { box-shadow: 0 0 0 2px #{$accent}; }
.wb-item.disabled { opacity: .45; }

/* 选中工具条：悬浮在组件上方的小黑岛 */
.item-toolbar {
  position: absolute;
  top: -16px;
  right: 4px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(18, 20, 25, 0.95);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 4px 11px;
  color: #fff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}
.item-toolbar-name { font-size: 11px; font-weight: 600; margin-right: 2px; color: $text-1; }
.item-toolbar .el-icon { cursor: pointer; font-size: 13px; color: #fff; }
.item-toolbar .el-icon:hover { color: $accent; }
.item-toolbar .el-icon.dim { opacity: .35; cursor: not-allowed; }
.item-toolbar .el-icon.dim:hover { color: #fff; }
.item-toolbar .el-icon.danger:hover { color: #f87171; }
/* 第一个组件：工具条翻转到下方，避免被屏幕圆角裁切 */
.item-toolbar.below {
  top: auto;
  bottom: -16px;
}

/* 空态模板：落在浅色手机屏内，用浅色友好卡片 */
.wb-templates {
  padding: 40px 16px;
  text-align: center;
}
.wb-templates-title {
  color: #8a9384;
  font-size: 13px;
  margin-bottom: 20px;
}
.wb-templates-grid {
  display: grid;
  gap: 10px;
}
.tpl-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid #e4e9e0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(38, 58, 32, 0.04);
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease;
}
.tpl-card:hover {
  border-color: #34d17b;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(52, 209, 123, 0.14);
}
.tpl-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tpl-emoji { font-size: 20px; }
.tpl-name { font-size: 13px; font-weight: 700; color: #1d271f; }
.tpl-desc { font-size: 11.5px; color: #8a9384; margin-top: 2px; line-height: 1.4; }

/* ===== 右侧属性悬浮岛 ===== */
.wb-props {
  width: 296px;
  flex: 0 0 auto;
  overflow-y: auto;
  background: $panel-bg;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid $panel-border;
  border-radius: 12px;
  box-shadow: $panel-shadow;
}

.wb-props :deep(.el-tabs__nav-wrap::after) { background: $panel-border; height: 1px; }
.wb-props :deep(.el-tabs__item) { color: $text-2; font-size: 13px; height: 42px; }
.wb-props :deep(.el-tabs__item:hover) { color: $text-1; }
.wb-props :deep(.el-tabs__item.is-active) { color: $accent; font-weight: 600; }
.wb-props :deep(.el-tabs__active-bar) { background: $accent; }

.props-form { padding: 12px 16px 16px; }

/* dynamic 模块提示条（P0-4） */
.props-dynamic-tip {
  padding: 10px 12px;
  margin-bottom: 14px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px dashed rgba(245, 158, 11, 0.4);
  border-radius: 10px;
  color: #fbbf24;
  font-size: 12px;
  line-height: 1.6;
}

.wb-props :deep(.el-form-item) { margin-bottom: 16px; }
.wb-props :deep(.el-form-item__label) {
  color: $text-2;
  font-size: 12px;
  padding-bottom: 4px !important;
}

.props-widget-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid $panel-border;
  border-radius: 10px;
  margin-bottom: 14px;
}
.props-widget-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
}
.props-widget-name { font-size: 14px; font-weight: 700; color: $text-1; }
.props-widget-type { font-size: 11px; color: $text-3; font-family: var(--mx-font-mono, monospace); }
.props-none {
  padding: 60px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: $text-3;
  font-size: 12.5px;
}
.props-tip {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid $panel-border;
  border-radius: 10px;
  color: $text-2;
  font-size: 12.5px;
  line-height: 1.7;
}

/* ===== Element 表单控件深色适配（输入 / 下拉 / 数字 / 颜色） ===== */
.studio-dark :deep(.el-input__wrapper),
.studio-dark :deep(.el-select__wrapper),
.studio-dark :deep(.el-textarea__inner) {
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
  border-radius: 8px;
}
.studio-dark :deep(.el-input__wrapper:hover),
.studio-dark :deep(.el-select__wrapper:hover),
.studio-dark :deep(.el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16) inset;
}
.studio-dark :deep(.el-input__wrapper.is-focus),
.studio-dark :deep(.el-select__wrapper.is-focused),
.studio-dark :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px #{$accent} inset;
}
.studio-dark :deep(.el-input__inner),
.studio-dark :deep(.el-textarea__inner) {
  color: $text-1;
  caret-color: $accent;
}
.studio-dark :deep(.el-input__inner::placeholder),
.studio-dark :deep(.el-textarea__inner::placeholder) { color: $text-3; }
.studio-dark :deep(.el-input__prefix .el-icon) { color: $text-3; }
.studio-dark :deep(.el-select__selected-item) { color: $text-1; }
.studio-dark :deep(.el-select__placeholder) { color: $text-1; }
.studio-dark :deep(.el-select__placeholder.is-transparent) { color: $text-3; }
.studio-dark :deep(.el-select__caret) { color: $text-3; }

.studio-dark :deep(.el-input-number__decrease),
.studio-dark :deep(.el-input-number__increase) {
  background: rgba(255, 255, 255, 0.06);
  color: $text-2;
  border-color: rgba(255, 255, 255, 0.08);
}
.studio-dark :deep(.el-input-number__decrease:hover),
.studio-dark :deep(.el-input-number__increase:hover) { color: $accent; }

.studio-dark :deep(.el-color-picker__trigger) {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
}

/* 面板/侧岛内默认按钮深色适配 */
.wb-props :deep(.el-button),
.wb-side :deep(.el-button) {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  color: $text-2;
}
.wb-props :deep(.el-button:hover),
.wb-side :deep(.el-button:hover) {
  background: $hover-fill;
  color: $text-1;
  border-color: rgba(255, 255, 255, 0.18);
}
.wb-props :deep(.el-button--primary) { background: $accent; border-color: $accent; color: #0c0e11; }
.wb-props :deep(.el-button--primary:hover) { background: #4be08d; border-color: #4be08d; color: #0c0e11; }
.wb-props :deep(.el-button--danger.is-circle) {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.35);
  color: #f87171;
}
.wb-props :deep(.el-button--danger.is-circle:hover) {
  background: rgba(248, 113, 113, 0.22);
  color: #fca5a5;
}

/* FieldInput 子项列表深色适配（不改其逻辑，仅覆盖外壳样式） */
.wb-props :deep(.sub-item) {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}
.wb-props :deep(.field-desc) { color: $text-3; }

/* ===== 细滚动条 ===== */
.lib-scroll, .wb-props, .wb-canvas {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
}
.lib-scroll::-webkit-scrollbar, .wb-props::-webkit-scrollbar, .wb-canvas::-webkit-scrollbar { width: 6px; height: 6px; }
.lib-scroll::-webkit-scrollbar-thumb, .wb-props::-webkit-scrollbar-thumb, .wb-canvas::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}
.lib-scroll::-webkit-scrollbar-track, .wb-props::-webkit-scrollbar-track, .wb-canvas::-webkit-scrollbar-track { background: transparent; }

</style>

<style scoped>
.ai-panel { display: flex; flex-direction: column; }
.ai-tip { color: var(--mx-muted, #7d8ba3); font-size: 12.5px; line-height: 1.7; margin-bottom: 12px; }
.ai-result-title { margin-top: 18px; font-size: 13.5px; font-weight: 700; color: var(--mx-text, #0f172a); }
.ai-result-list { margin-top: 10px; display: grid; gap: 8px; }
.ai-result-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--mx-border, #e3e9f2); border-radius: 10px; background: var(--mx-soft, #f7f9fc); font-size: 13px; }
.ai-result-order { width: 20px; height: 20px; border-radius: 6px; background: var(--el-color-warning-light-8, #fdecce); color: var(--el-color-warning, #f59e0b); font-size: 11px; font-weight: 800; display: grid; place-items: center; }
.ai-result-type { margin-left: auto; font-size: 11px; color: var(--mx-muted, #7d8ba3); font-family: var(--mx-font-mono, monospace); }

/* 深色下拉浮层（toolbar 区域选择 / 更多菜单；popper teleport 到 body，故放非 scoped 块） */
.studio-popper.el-popper.is-light {
  background: rgba(30, 33, 40, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}
.studio-popper .el-popper__arrow::before {
  background: rgba(30, 33, 40, 0.97);
  border-color: rgba(255, 255, 255, 0.1);
}
.studio-popper .el-select-dropdown__item { color: #9aa1ab; }
.studio-popper .el-select-dropdown__item.is-hovering,
.studio-popper .el-select-dropdown__item:hover { background: rgba(255, 255, 255, 0.07); color: #e7eaee; }
.studio-popper .el-select-dropdown__item.is-selected { color: #34d17b; font-weight: 600; }
.studio-popper .el-dropdown-menu { background: transparent; border: 0; }
.studio-popper .el-dropdown-menu__item { color: #9aa1ab; }
.studio-popper .el-dropdown-menu__item:hover,
.studio-popper .el-dropdown-menu__item:focus { background: rgba(255, 255, 255, 0.07); color: #e7eaee; }
</style>
