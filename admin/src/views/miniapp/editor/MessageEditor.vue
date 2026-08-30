<template>
  <div class="rte">
    <!-- ===== 顶部工具条 ===== -->
    <div class="rte-toolbar">
      <div class="rte-left">
        <el-select v-model="regionId" placeholder="选择区域" style="width: 180px" @change="loadAll">
          <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <span v-if="dirty.size" class="rte-dirty">{{ dirty.size }} 处未保存</span>
        <span v-else-if="lastSaved" class="rte-clean">已是最新 · {{ lastSaved }}</span>
      </div>
      <div class="rte-right">
        <el-button :icon="Refresh" :loading="loading" @click="loadAll">刷新</el-button>
        <el-tooltip content="版本历史" placement="bottom">
          <el-button :icon="Clock" circle @click="versionPanelVisible = true" />
        </el-tooltip>
        <el-button type="primary" :icon="Promotion" :disabled="!dirty.size" :loading="saving" @click="saveAll">
          保存并发布
        </el-button>
      </div>
    </div>

    <!-- ===== 版本历史（发布安全闭环：快照/对比/一键回滚） ===== -->
    <DecorVersionPanel v-model="versionPanelVisible" :region-id="regionId" :current="buildDecorSnapshot()" @rollback="loadAll()" />

    <div class="rte-body">
      <!-- ===== 画布：真实消息页（1:1 移植 pages/tabbar/news） ===== -->
      <div class="rte-canvas">
        <div class="rte-page" :style="themeStyle">
          <div class="container" :class="{ 'xiaohongshu-style': isXhs }">
            <div class="p-status"><span>9:41</span><span class="p-sig">●●●</span></div>

            <!-- 导航栏（结构/class 由 sync-canvas-blocks.mjs 从 news.wxml 生成，样式经 injectRealWxss 同源注入；点选编辑布局与私信开关） -->
            <section class="blk" :class="{ sel: editing === 'layout' }" @click="startEdit('layout')">
              <span class="blk-tag">导航栏 / 布局</span>
              <RealMessageHeader />
            </section>

            <!-- 分类入口（同源生成：默认布局 nav-tabs 文字 Tab；小红书布局 nav-buttons 分段按钮） -->
            <section class="blk" :class="{ sel: editing === 'tabs' }" @click="startEdit('tabs')">
              <span class="blk-tag">分类入口</span>
              <RealMessageTabs :is-xhs="isXhs" :tabs="mainTabs" :xhs-tabs="enabledCategories" />
            </section>

            <!-- 消息列表 -->
            <div class="message-list chat-list">
              <!-- 系统消息导航卡片（行结构同源生成自 news.wxml 的 navcard message-item） -->
              <section class="blk" :class="{ sel: editing === 'navcards' }" @click="startEdit('navcards')">
                <span class="blk-tag">系统消息导航卡片</span>
                <RealMessageNavCards
                  v-if="enabledNavCards.length"
                  :cards="enabledNavCards"
                  :resolve-asset="resolveAsset"
                  :img-ok="imgOk"
                  :on-img-error="onImgError"
                  :icon-text="cardIconText"
                  :card-bg="cardBg"
                />
                <div v-else class="message-item navcard-empty">
                  <div class="avatar service-avatar"><span class="service-icon-text">🔔</span></div>
                  <div class="message-content">
                    <div class="message-info"><span class="message-title">系统通知</span><span class="message-time" /></div>
                    <div class="message-text">未配置导航卡片，点击编辑添加</div>
                  </div>
                </div>
              </section>

              <div v-if="!isXhs" class="divider" />

              <!-- 会话列表（行结构同源生成自 news.wxml 的会话 message-item；真实会话为登录用户私有数据，画布用示例数据做结构预览） -->
              <section class="blk readonly">
                <span class="blk-tag live">会话列表 · 结构预览（示例数据）</span>
                <RealMessageChatRows
                  :chats="demoChats"
                  :resolve-asset="resolveAsset"
                  :img-ok="imgOk"
                  :on-img-error="onImgError"
                />
                <div class="empty-hint chat-hint">{{ privateMessageEnabled ? '用户发起聊天后在此展示真实会话' : '当前区域已关闭私信' }}</div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 右侧面板 ===== -->
      <div class="rte-props">
        <el-tabs v-model="panelTab" stretch>
          <el-tab-pane label="版块" name="section">
            <!-- 导航栏 / 布局 -->
            <template v-if="editing === 'layout'">
              <div class="pp-title">导航栏与页面布局</div>
              <el-form label-position="top">
                <el-form-item label="消息页布局">
                  <el-select v-model="pageLayout" style="width: 100%" @change="markDirty('layout')">
                    <el-option label="默认布局（文字 Tab）" value="default" />
                    <el-option label="小红书风格（分段按钮）" value="xiaohongshu" />
                  </el-select>
                </el-form-item>
                <el-form-item label="区域私信开关">
                  <el-switch v-model="privateMessageEnabled" active-text="开启" inactive-text="关闭" @change="markDirty('layout')" />
                </el-form-item>
              </el-form>
              <div class="pp-tip">布局影响消息页的导航样式与列表卡片风格；关闭私信后该区域用户无法发起一对一聊天。</div>
            </template>

            <!-- 分类入口 -->
            <template v-else-if="editing === 'tabs'">
              <div class="pp-title">消息分类 <span class="pp-sub">业务键固定，可改名 / 隐藏 / 排序</span></div>
              <div class="pp-list">
                <div v-for="(c, i) in sortedCategories" :key="c.key" class="pp-item">
                  <div class="pp-item-head">
                    <b>{{ c.label }}</b>
                    <div class="pp-item-ops">
                      <el-icon :class="{ dim: i === 0 }" @click="moveCategory(c.key, -1)"><Top /></el-icon>
                      <el-icon :class="{ dim: i === sortedCategories.length - 1 }" @click="moveCategory(c.key, 1)"><Bottom /></el-icon>
                    </div>
                  </div>
                  <el-input v-model="categories[c.key].name" placeholder="分类名称" size="small" @input="markDirty('tabs')" />
                  <el-switch v-model="categories[c.key].enabled" size="small" inline-prompt active-text="显示" inactive-text="隐藏" @change="markDirty('tabs')" />
                  <ImageUploadBox v-model="categories[c.key].icon" shape="square" @update:model-value="markDirty('tabs')" />
                </div>
              </div>
              <div class="pp-tip">「系统/聊天」与「互动」是主入口，其余分类显示在互动内部；图标可选，文字分类始终展示名称。</div>
            </template>

            <!-- 系统消息导航卡片 -->
            <template v-else-if="editing === 'navcards'">
              <div class="pp-title">系统消息导航卡片 <span class="pp-sub">显示在系统/聊天列表顶部</span></div>
              <div class="pp-list">
                <div v-for="(card, i) in navCards" :key="card.id" class="pp-item">
                  <div class="pp-item-head">
                    <b>{{ card.title || `卡片 ${i + 1}` }}</b>
                    <div class="pp-item-ops">
                      <el-icon :class="{ dim: i === 0 }" @click="moveItem(navCards, i, -1, 'navcards')"><Top /></el-icon>
                      <el-icon :class="{ dim: i === navCards.length - 1 }" @click="moveItem(navCards, i, 1, 'navcards')"><Bottom /></el-icon>
                      <el-icon class="danger" @click="navCards.splice(i, 1); markDirty('navcards')"><Delete /></el-icon>
                    </div>
                  </div>
                  <el-input v-model="card.title" placeholder="标题" size="small" @input="markDirty('navcards')" />
                  <el-input v-model="card.subtitle" placeholder="副标题" size="small" @input="markDirty('navcards')" />
                  <el-input v-model="card.icon" placeholder="图标（图片路径 /static/... 或关键字如 notice）" size="small" @input="markDirty('navcards')" />
                  <el-input v-model="card.path" placeholder="跳转路径，如 /pagesA/news/SystemNotification/SystemNotification" size="small" @input="markDirty('navcards')" />
                  <el-switch v-model="card.enabled" size="small" inline-prompt active-text="启用" inactive-text="停用" @change="markDirty('navcards')" />
                </div>
              </div>
              <div class="pp-btns">
                <el-button size="small" style="flex: 1" @click="addNavCard">+ 添加卡片</el-button>
                <el-button size="small" style="flex: 1" @click="resetNavCards">恢复默认</el-button>
              </div>
            </template>

            <template v-else>
              <div class="pp-none">
                <el-icon :size="30"><Pointer /></el-icon>
                <p class="pp-none-title">点击画布中的版块开始编辑</p>
                <p class="pp-none-sub">导航栏/布局、分类入口、系统消息导航卡片都可以直接修改，保存后小程序实时生效；会话列表为用户实时数据，仅做预览。</p>
              </div>
            </template>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Bottom, Clock, Delete, Pointer, Promotion, Refresh, Top } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import { persistRegionEditor } from '@/views/miniapp/editor/editorPersistence.mjs'
import DecorVersionPanel from '@/components/miniapp/DecorVersionPanel.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { compileWxss } from '@/utils/wxssCompiler'
import { sharedGet } from '@/views/miniapp/editor/sharedGet'
import RealMessageHeader from '@/views/miniapp/editor/generated/RealMessageHeader.vue'
import RealMessageTabs from '@/views/miniapp/editor/generated/RealMessageTabs.vue'
import RealMessageNavCards from '@/views/miniapp/editor/generated/RealMessageNavCards.vue'
import RealMessageChatRows from '@/views/miniapp/editor/generated/RealMessageChatRows.vue'

// ============ 状态 ============
const regions = ref<any[]>([])
const regionId = ref('')
const region = ref<any>(null)
const loading = ref(false)
const saving = ref(false)
const editing = ref('')
const panelTab = ref('section')
const dirty = ref(new Set<string>())
const lastSaved = ref('')

const pageLayout = ref('default')
const privateMessageEnabled = ref(true)

interface MsgCategory {
  name: string
  enabled: boolean
  sortOrder: number
  icon: string
}
const CATEGORY_DEFS = [
  { key: 'message', label: '系统/聊天' },
  { key: 'interaction', label: '互动' },
  { key: 'comment', label: '评论/回复' },
  { key: 'like', label: '喜欢' },
  { key: 'follow', label: '关注' },
  { key: 'squat', label: '蹲一蹲' },
]
const defaultCategories = (): Record<string, MsgCategory> =>
  Object.fromEntries(CATEGORY_DEFS.map((d, i) => [d.key, { name: d.label, enabled: true, sortOrder: i, icon: '' }]))
const categories = ref<Record<string, MsgCategory>>(defaultCategories())

const DEFAULT_NAV_CARDS = [
  { id: 'notice', title: '系统通知', subtitle: '平台消息与审核通知', icon: 'notice', path: '/pages/tabbar/news/news', enabled: true, sortOrder: 0 },
]
const navCards = ref<any[]>(JSON.parse(JSON.stringify(DEFAULT_NAV_CARDS)))

// ============ 主题（只读应用，与 HomeEditor 同源） ============
const themeVars = ref<Record<string, string>>({})
const themeStyle = computed(() => themeVars.value)
/** 主题值 rpx → px（画布 0.5 缩放），使注入的真机 wxss 中 var(--fs-*) 等引用可解析 */
const normalizeThemeValue = (v: string) =>
  String(v).replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_, n) => `${Math.round(parseFloat(n) * 50) / 100}px`)
async function loadThemeVars(retryOnDedupe = true) {
  try {
    const res: any = await sharedGet('/admin/miniapp/code/theme')
    const vars = res.data?.vars || []
    const map: Record<string, string> = {}
    for (const v of vars) if (v.name && v.value) map[v.name] = normalizeThemeValue(v.value)
    themeVars.value = map
  } catch (e: any) {
    // request 层 600ms 相同 GET 去重：多编辑器同页挂载时重试一次
    if (retryOnDedupe && e?.code === 'ERR_CANCELED') setTimeout(() => loadThemeVars(false), 700)
  }
}

// ============ 计算 ============
const isXhs = computed(() => pageLayout.value === 'xiaohongshu')
const sortedCategories = computed(() =>
  CATEGORY_DEFS
    .map((d) => ({ key: d.key, label: d.label, ...categories.value[d.key] }))
    .sort((a, b) => a.sortOrder - b.sortOrder),
)
const enabledCategories = computed(() => sortedCategories.value.filter((c) => c.enabled !== false))
/** 默认布局只露「系统/聊天」「互动」两个主入口 */
const mainTabs = computed(() => enabledCategories.value.filter((c) => c.key === 'message' || c.key === 'interaction'))
const enabledNavCards = computed(() => navCards.value.filter((c) => c.enabled !== false))

/** 解析素材地址：http 直用；/static/* 走后端素材代理（真实小程序图标） */
const resolveAsset = (v: string) => {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//.test(s)) return s
  if (s.startsWith('/static/')) return `/miniapp-static/${s.slice('/static/'.length)}`
  if (s.startsWith('static/')) return `/miniapp-static/${s.slice('static/'.length)}`
  return ''
}
/** 已失败的素材地址（加载失败走占位回退，与 HomeEditor 一致） */
const failedAssets = ref(new Set<string>())
const imgOk = (v: string) => {
  const r = resolveAsset(v)
  return !!r && !failedAssets.value.has(r)
}
const onImgError = (e: Event) => {
  const el = e.target as HTMLImageElement
  failedAssets.value.add(el.getAttribute('src') || el.src)
  el.style.display = 'none'
}
const KEYWORD_ICONS: Record<string, string> = { notice: '🔔', message: '💬', service: '🎧', activity: '🎉' }
const cardIconText = (card: any) => KEYWORD_ICONS[String(card.icon || '').trim()] || (card.title || '🔔').slice(0, 1)
const cardBg = (card: any) => (card.backgroundColor ? { background: card.backgroundColor } : {})

/** 会话行结构预览示例数据（真实会话为登录用户私有数据，管理端无公开接口） */
const demoChats = computed(() => [
  { name: '校园小助手', time: '09:41', text: '你的闲置商品有新的询价，点击查看', unread: 2, avatar: '', manager: false },
  { name: '跑腿互助群', time: '昨天', text: '今晚南门拼单夜宵，还差 2 人', unread: 0, avatar: '', manager: false, statusTag: '群聊', statusTone: '' },
])

const markDirty = (key: string) => { dirty.value.add(key); dirty.value = new Set(dirty.value) }
const startEdit = (key: string) => { editing.value = key; panelTab.value = 'section' }
const moveItem = (list: any[], i: number, dir: number, key: string) => {
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const t = list[i]; list[i] = list[j]; list[j] = t
  markDirty(key)
}
/** 分类排序：交换 sortOrder 后重排为连续序号 */
const moveCategory = (key: string, dir: number) => {
  const list = sortedCategories.value
  const i = list.findIndex((c) => c.key === key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  const a = categories.value[list[i].key]
  const b = categories.value[list[j].key]
  const t = a.sortOrder; a.sortOrder = b.sortOrder; b.sortOrder = t
  sortedCategories.value.forEach((c, idx) => { categories.value[c.key].sortOrder = idx })
  markDirty('tabs')
}

const addNavCard = () => {
  navCards.value.push({ id: `card_${Date.now()}`, title: '新卡片', subtitle: '', icon: '', path: '', enabled: true, sortOrder: navCards.value.length })
  markDirty('navcards')
}
const resetNavCards = () => {
  navCards.value = JSON.parse(JSON.stringify(DEFAULT_NAV_CARDS))
  markDirty('navcards')
}

/** 规范化分类：兼容旧字符串图标值与对象结构 */
const normalizeCategories = (raw: any): Record<string, MsgCategory> => {
  const base = defaultCategories()
  if (!raw || typeof raw !== 'object') return base
  for (const d of CATEGORY_DEFS) {
    const v = raw[d.key]
    if (typeof v === 'string') {
      base[d.key].icon = v
    } else if (v && typeof v === 'object') {
      base[d.key] = {
        name: v.name ? String(v.name) : base[d.key].name,
        enabled: v.enabled !== false,
        sortOrder: Number.isFinite(Number(v.sortOrder)) ? Number(v.sortOrder) : base[d.key].sortOrder,
        icon: v.icon || v.image || '',
      }
    }
  }
  return base
}

// ============ 数据加载 ============
async function loadRegions() {
  const res: any = await sharedGet('/admin/regions')
  regions.value = res.data?.list || res.list || []
  if (!regionId.value && regions.value.length) {
    regionId.value = regions.value[0].id || regions.value[0].region_id
  }
}

async function loadAll(retryOnDedupe = true) {
  if (!regionId.value) return
  loading.value = true
  editing.value = ''
  dirty.value = new Set()
  try {
    const res: any = await sharedGet(`/admin/regions/${regionId.value}`)
    region.value = res?.data || res

    pageLayout.value = region.value?.messagePageLayout || region.value?.message_page_layout || 'default'
    privateMessageEnabled.value = region.value?.privateMessageEnabled ?? region.value?.private_message_enabled ?? true
    categories.value = normalizeCategories(region.value?.messageIcons || region.value?.message_icons)

    const nav = region.value?.messageNavigation || region.value?.message_navigation
    navCards.value = Array.isArray(nav?.cards) && nav.cards.length
      ? JSON.parse(JSON.stringify(nav.cards)).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      : JSON.parse(JSON.stringify(DEFAULT_NAV_CARDS))
  } catch (e: any) {
    // request 层 600ms 相同 GET 去重：多编辑器同页挂载时重试一次
    if (retryOnDedupe && e?.code === 'ERR_CANCELED') {
      setTimeout(() => loadAll(false), 700)
      return
    }
    ElMessage.error('加载区域配置失败')
  } finally {
    loading.value = false
  }
}

// ============ 保存 ============
/** dirty key → 版本快照备注里的中文清单 */
const DIRTY_LABELS: Record<string, string> = {
  layout: '导航栏 / 布局',
  tabs: '分类入口',
  navcards: '系统消息导航卡片',
}

// ============ 版本历史（发布安全闭环） ============
const versionPanelVisible = ref(false)
/** 当前完整编辑状态合集（与快照同形）：消息页 regions 字段子集 */
const buildDecorSnapshot = () => {
  const icons: Record<string, any> = {}
  for (const d of CATEGORY_DEFS) {
    const c = categories.value[d.key]
    icons[d.key] = { name: c.name, enabled: c.enabled, sortOrder: c.sortOrder }
    if (c.icon) icons[d.key].icon = c.icon
  }
  return {
    regionPayload: {
      message_page_layout: pageLayout.value,
      private_message_enabled: privateMessageEnabled.value,
      message_icons: icons,
      message_navigation: { cards: navCards.value.map((c, i) => ({ ...c, sortOrder: i })) },
    },
  }
}
/** 发布成功后存一个版本快照（失败不打扰主流程） */
async function snapshotDecorVersion(note: string) {
  try {
    await request.post('/admin/decor-version/snapshot', {
      regionId: regionId.value,
      snapshot: buildDecorSnapshot(),
      note: `发布：${note}`,
    })
  } catch (e) {
    console.warn('[MessageEditor] 版本快照失败：', e)
  }
}

async function saveAll() {
  if (!dirty.value.size) return
  saving.value = true
  // 记录本次要落库的 dirty key（成功后 dirty 清空，快照备注仍需要）
  const savingKeys = new Set(dirty.value)
  try {
    const rid = regionId.value
    const payload: any = {}

    if (dirty.value.has('layout')) {
      payload.message_page_layout = pageLayout.value
      payload.private_message_enabled = privateMessageEnabled.value
    }
    if (dirty.value.has('tabs')) {
      const icons: Record<string, any> = {}
      for (const d of CATEGORY_DEFS) {
        const c = categories.value[d.key]
        icons[d.key] = { name: c.name, enabled: c.enabled, sortOrder: c.sortOrder }
        if (c.icon) icons[d.key].icon = c.icon
      }
      payload.message_icons = icons
    }
    if (dirty.value.has('navcards')) {
      payload.message_navigation = { cards: navCards.value.map((c, i) => ({ ...c, sortOrder: i })) }
    }

    if (Object.keys(payload).length) {
      await persistRegionEditor(request, rid, payload)
    }

    dirty.value = new Set()
    lastSaved.value = new Date().toLocaleTimeString('zh-CN')
    ElMessage.success('已保存并发布，小程序端实时生效')
    // 发布成功后存版本快照（可在「版本历史」中一键回滚）
    snapshotDecorVersion([...savingKeys].map((k) => DIRTY_LABELS[k] || k).join('、'))
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ============ 真实样式编译注入（真实小程序 WXSS → 画布 CSS） ============
const REAL_WXSS_FILES = ['pages/tabbar/news/news.wxss']
async function injectRealWxss() {
  const parts: string[] = []
  for (const path of REAL_WXSS_FILES) {
    try {
      const res: any = await request.get('/admin/miniapp/code/source-file', { params: { path } })
      const content = res.data?.content || ''
      // 第 4 参数：wxss 元素选择器（view/text/image）映射为 div/span/img
      if (content) parts.push(compileWxss(content, '.rte-page', 0.5, true))
    } catch { /* 单文件失败不阻塞，生成组件自带关键布局回退样式 */ }
  }
  const id = 'rte-real-wxss-message'
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = parts.join('\n')
}

async function initData(retryOnDedupe = true) {
  try {
    loadThemeVars()
    await loadRegions()
    await loadAll()
  } catch (e: any) {
    // request 层 600ms 相同 GET 去重：多编辑器同页挂载时重试一次
    if (retryOnDedupe && e?.code === 'ERR_CANCELED') {
      setTimeout(() => initData(false), 700)
      return
    }
    ElMessage.error('加载区域列表失败')
  }
}

onMounted(() => {
  injectRealWxss()
  initData()
})
</script>

<style scoped lang="scss">
.rte { display: flex; flex-direction: column; gap: 14px; }

.rte-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background: var(--mx-card);
  border: 1px solid var(--mx-border);
  border-radius: 12px;
}
.rte-left, .rte-right { display: flex; align-items: center; gap: 10px; }
/* 保存并发布：品牌绿主按钮（对齐 HomeEditor .rte-publish，全编辑器唯一品牌色） */
.rte-toolbar :deep(.el-button--primary) {
  --el-button-bg-color: var(--ds-brand, #16A34A);
  --el-button-border-color: var(--ds-brand, #16A34A);
  --el-button-text-color: #fff;
  --el-button-hover-bg-color: var(--ds-brand-hover, #15803D);
  --el-button-hover-border-color: var(--ds-brand-hover, #15803D);
  --el-button-hover-text-color: #fff;
  --el-button-active-bg-color: var(--ds-brand-hover, #15803D);
  --el-button-active-border-color: var(--ds-brand-hover, #15803D);
  --el-button-disabled-bg-color: #a7d9bb;
  --el-button-disabled-border-color: #a7d9bb;
  --el-button-disabled-text-color: #fff;
}
.rte-dirty { color: var(--ds-warning, #D97706); font-size: var(--ds-fs-label, 12px); font-weight: 500; }
.rte-clean { color: var(--mx-muted); font-size: var(--ds-fs-label, 12px); }

.rte-body {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  align-items: start;
}

/* ===== 画布 ===== */
.rte-canvas {
  background: var(--mx-soft);
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.rte-page {
  width: 375px;
  background: var(--bg-page, #f4f7f1);
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(15, 23, 42, .10);
  overflow: hidden;
  min-height: 480px;
  max-height: 660px;
  overflow-y: auto;
}
.container { min-height: 480px; }

.blk {
  position: relative;
  cursor: pointer;
  border: 2px dashed transparent;
  border-radius: 10px;
  margin: 2px 6px;
  transition: border-color .12s ease;
}
.blk:hover { border-color: var(--brand-light, #87bd6d); }
.blk.sel { border-color: var(--brand, #36a853); }
.blk.readonly { cursor: default; }
.blk.readonly:hover { border-color: transparent; }
.blk-tag {
  position: absolute;
  top: -9px;
  left: 12px;
  z-index: 4;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--brand, #36a853);
  color: #fff;
  opacity: 0;
  transition: opacity .12s ease;
}
.blk:hover .blk-tag, .blk.sel .blk-tag { opacity: 1; }
.blk-tag.live { background: var(--ds-brand, #16A34A); opacity: 1; }

/* ===== 页面元素 ===== */
.p-status { display: flex; justify-content: space-between; padding: 8px 18px 4px; font-size: 11px; font-weight: 700; color: var(--text-primary, #1d271f); }
.p-sig { letter-spacing: 2px; font-size: 8px; }
.p-empty { padding: 22px 0; text-align: center; color: var(--text-tertiary, #8a9384); font-size: 12px; width: 100%; }

/* ===== 导航栏：1:1 移植 news.wxss（rpx→px ÷2） ===== */
.nav-header {
  display: flex;
  width: 100%;
  box-sizing: border-box;
  margin-left: 4px;
  padding: 8px 12px 6px;
  align-items: center;
  justify-content: space-between;
}
.message-nav-title-group { display: flex; align-items: center; min-width: 0; flex-shrink: 0; }
.message-nav-actions { display: flex; align-items: center; margin-left: auto; }
.nav-title { font-size: var(--fs-headline, 17px); font-weight: 700; color: var(--text-primary, #1d271f); }
.clear-icon {
  width: 20px;
  height: 20px;
  padding: 12px;
  box-sizing: content-box;
  background-clip: content-box;
  margin-left: 4px;
  background-color: var(--bg-page, #f4f7f1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.clear-icon-glyph { font-size: 18px; line-height: 20px; color: var(--text-secondary, #55604f); }
.message-nav-search {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  min-width: 71px;
  padding: 0 12px;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-fill, #f0f4ec);
  box-sizing: border-box;
}
.message-nav-search-icon { margin-right: 4px; font-size: 15px; color: var(--text-tertiary, #8a9384); }
.message-nav-search-text { font-size: var(--fs-body-s, 13px); color: var(--text-secondary, #55604f); font-weight: 500; line-height: 1; }

/* 分类 Tab（默认布局） */
.nav-tabs-container { position: relative; width: 100%; min-height: 40px; }
.nav-tabs {
  display: flex;
  padding: 10px;
  gap: 10px;
  background-color: var(--bg-card, #fff);
  width: 100%;
  box-sizing: border-box;
}
.tab-wrapper { position: relative; display: inline-block; }
.tab {
  font-size: var(--fs-caption, 11px);
  color: var(--text-primary, #1d271f);
  padding: 10px 16px;
  border-radius: var(--radius-xl, 10px);
  font-weight: 700;
  background-color: var(--bg-page, #f4f7f1);
}
.tab.active { color: var(--text-inverse, #fff); background-color: var(--brand, #36a853); }

/* 分段按钮（小红书布局） */
.nav-buttons {
  display: flex;
  justify-content: space-between;
  gap: 2px;
  margin: 8px 12px;
  padding: 4px;
  border: 0.5px solid var(--line-hairline, #e4e9e0);
  border-radius: var(--radius-l, 12px);
  background: var(--bg-card, #fff);
  box-shadow: 0 2px 8px rgba(38, 58, 32, .06);
}
.nav-button {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  min-height: 34px;
  padding: 0 2px;
  border-radius: var(--radius-m, 8px);
}
.nav-button.active { background: var(--brand-bg, #e8f3e4); }
.button-content { display: flex; flex-direction: column; align-items: center; width: 100%; justify-content: center; }
.button-text {
  max-width: 64px;
  margin: 0;
  color: var(--text-secondary, #55604f);
  font-size: var(--fs-body-s, 13px);
  line-height: 34px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-button.active .button-text { color: var(--brand-deep, #2e7e3a); }

/* ===== 消息列表：1:1 移植 news.wxss ===== */
.message-list { background-color: var(--bg-card, #fff); padding: 0 10px; }
.message-item {
  display: flex;
  align-items: center;
  margin-top: 4px;
  padding: 10px;
  position: relative;
  border-radius: var(--radius-m, 8px);
  margin-bottom: 4px;
}
.avatar {
  margin-right: 10px;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  position: relative;
}
.service-avatar {
  background: var(--bg-page, #f4f7f1);
  border-radius: var(--radius-m, 8px);
  margin-right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.service-icon-text { font-size: 20px; color: var(--text-primary, #1d271f); }
.nav-icon-image { width: 100%; height: 100%; border-radius: var(--radius-m, 8px); object-fit: contain; }
.message-content { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.message-info { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; }
.message-info .message-time {
  font-size: var(--fs-caption, 11px);
  color: var(--text-tertiary, #8a9384);
  flex-shrink: 0;
  margin-left: 6px;
  line-height: 1;
  margin-bottom: 2px;
}
.message-title { font-size: var(--fs-body, 15px); color: var(--text-primary, #1d271f); font-weight: 700; margin-right: 4px; }
.message-text {
  font-size: var(--fs-body-s, 13px);
  color: var(--text-tertiary, #8a9384);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.divider { height: 1px; background-color: var(--bg-page, #f4f7f1); margin: 10px 0; }
.navcard-empty { opacity: .7; }

/* 空态（会话列表） */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px 48px;
  text-align: center;
}
.empty-icon { font-size: 34px; margin-bottom: 10px; opacity: .55; }
.empty-text { font-size: 14px; font-weight: 600; color: var(--text-secondary, #55604f); margin-bottom: 6px; }
.empty-hint { font-size: 12px; color: var(--text-tertiary, #8a9384); }
.chat-hint { padding: 0 12px 12px; text-align: center; }

/* ===== 小红书风格覆盖：1:1 移植 .xiaohongshu-style ===== */
.xiaohongshu-style .nav-header { margin-left: 0; padding: 8px 95px 4px 12px; }
.xiaohongshu-style .message-nav-title-group { flex: 1; }
.xiaohongshu-style .nav-title { font-size: var(--fs-display, 20px); }
.xiaohongshu-style .clear-icon { width: 24px; height: 24px; margin-left: 6px; background-color: var(--bg-cream, #fff8e8); }
.xiaohongshu-style .clear-icon-glyph { color: var(--accent-sun, #f2c94c); font-size: 17px; }
.xiaohongshu-style .message-list { margin: 4px 0 90px; padding: 0; box-shadow: none; }
.xiaohongshu-style .message-item + .message-item::before {
  content: "";
  position: absolute;
  top: 0;
  left: 80px;
  right: 0;
  height: 0.5px;
  background: var(--line-hairline, #e4e9e0);
}
.xiaohongshu-style .avatar { width: 48px; height: 48px; margin-right: 12px; border-radius: 50%; }
.xiaohongshu-style .service-avatar { border-radius: 50%; background: var(--bg-fill, #f0f4ec); }
.xiaohongshu-style .nav-icon-image { border-radius: 50%; }
.xiaohongshu-style .message-title { font-size: var(--fs-title, 15px); font-weight: 500; }

/* ===== 右栏 ===== */
.rte-props {
  background: var(--mx-card);
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  padding: 12px 16px 16px;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}
.pp-title { font-size: var(--ds-fs-title, 16px); font-weight: 600; color: var(--mx-text); margin-bottom: 12px; }
.pp-sub { font-size: var(--ds-fs-label, 12px); color: var(--mx-muted); font-weight: 400; margin-left: 6px; }
.pp-list { display: grid; gap: 10px; margin-bottom: 12px; }
.pp-item {
  padding: 10px;
  border: 1px solid var(--mx-border);
  border-radius: 10px;
  background: var(--mx-soft);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pp-item-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--mx-text); }
.pp-item-ops { display: flex; gap: 6px; }
.pp-item-ops .el-icon { cursor: pointer; color: var(--mx-muted); }
.pp-item-ops .el-icon:hover { color: var(--mx-text); }
.pp-item-ops .el-icon.dim { opacity: .3; cursor: not-allowed; }
.pp-item-ops .el-icon.danger:hover { color: var(--el-color-danger); }
.pp-btns { display: flex; gap: 8px; }
.pp-tip { padding: 10px 12px; background: var(--mx-soft); border-radius: 10px; color: var(--mx-muted); font-size: 12.5px; line-height: 1.7; }
.pp-none { padding: 70px 10px; text-align: center; color: var(--mx-muted); }
.pp-none-title { margin-top: 12px; font-size: 14px; font-weight: 600; color: var(--mx-sub); }
.pp-none-sub { margin-top: 8px; font-size: 12.5px; line-height: 1.8; }

@media (max-width: 1200px) {
  .rte-body { grid-template-columns: 1fr; }
  .rte-props { position: static; max-height: none; }
}
</style>
