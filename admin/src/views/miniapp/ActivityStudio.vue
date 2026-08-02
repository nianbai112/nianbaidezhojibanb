<template>
  <div class="activity-studio">
    <!-- ================= 列表视图 ================= -->
    <template v-if="view === 'list'">
      <div class="as-head glass-card">
        <div class="as-head-text">
          <div class="as-title">活动页</div>
          <div class="as-sub">活动页 = 营销/专题页面，做好后放到首页/任意页面的「活动页」块里展示</div>
        </div>
        <el-button type="primary" :icon="Plus" @click="openCreate">+ 新建活动页</el-button>
      </div>

      <div class="as-list-body">
        <div v-if="listLoading" class="as-empty glass-card">加载中…</div>
        <div v-else-if="!pages.length" class="as-empty glass-card">
          <div class="as-empty-emoji">🎪</div>
          <div class="as-empty-title">还没有活动页</div>
          <div class="as-empty-tip">点上方「+ 新建活动页」按钮创建第一个</div>
        </div>
        <div v-else class="as-grid">
          <div v-for="p in pages" :key="p.slug" class="as-card glass-card">
            <div class="as-card-thumb">
              <TmagicItemsView
                :block="thumbBlock(p)"
                :width="160"
                :background="thumbBg(p)"
                empty-text="空页面"
                :placeholder-height="200"
              />
            </div>
            <div class="as-card-body">
              <div class="as-card-slug">{{ p.slug }}</div>
              <div class="as-card-desc">{{ p.desc || '无简述' }}</div>
              <div class="as-card-time">更新于 {{ fmtTime(p.updatedAt) }}</div>
              <div class="as-card-ops">
                <el-button size="small" type="primary" @click="openEdit(p)">编辑</el-button>
                <el-button size="small" @click="copySlug(p.slug)">复制标识</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ================= 编辑视图 ================= -->
    <template v-else-if="view === 'edit'">
      <div class="as-bar glass-card">
        <el-button text @click="backToList">← 返回列表</el-button>
        <span class="as-bar-label">活动页标识（字母/数字/中划线）</span>
        <el-input v-model="slug" class="as-slug" placeholder="如 summer-sale" :disabled="slugLocked" />
        <span class="as-bar-label">页面背景色</span>
        <el-color-picker v-model="pageBg" size="small" />
        <el-button type="primary" :loading="saving" @click="savePage">保存</el-button>
        <el-button text type="primary" @click="openAdvanced">高级模式</el-button>
      </div>

      <!-- 非本工具生成的页面：表单无法反填，引导去高级模式 -->
      <div v-if="foreignPage" class="as-foreign glass-card">
        <div class="as-foreign-emoji">🧩</div>
        <div class="as-foreign-title">「{{ slug }}」是高级模式创建的活动页</div>
        <div class="as-foreign-tip">它的结构不是活动页工厂生成的，表单无法识别，请用高级模式（tmagic 编辑器）编辑。</div>
        <div class="as-foreign-ops">
          <el-button type="primary" @click="openAdvanced">去高级模式编辑</el-button>
          <el-button @click="backToList">返回列表</el-button>
        </div>
      </div>

      <div v-else class="as-workbench">
        <!-- 左：预设包 + 添加组件 -->
        <div class="as-col as-templates glass-card">
          <div class="as-col-title">预设包</div>
          <button
            v-for="t in PRESETS"
            :key="t.key"
            class="as-tpl"
            @click="applyPreset(t)"
          >
            <span class="as-tpl-emoji">{{ t.emoji }}</span>
            <span class="as-tpl-name">{{ t.name }}</span>
            <span class="as-tpl-desc">{{ t.desc }}</span>
          </button>

          <div class="as-col-title as-add-title">组件</div>
          <el-dropdown trigger="click" style="width: 100%" @command="addBlock">
            <el-button style="width: 100%" :icon="Plus">添加组件</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="b in BLOCK_TYPES" :key="b.type" :command="b.type">
                  {{ b.emoji }} {{ b.name }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <div class="as-add-tip">预设包只是起手式，组件可自由增删排序</div>
        </div>

        <!-- 中：页面结构（blocks 手风琴） -->
        <div class="as-col as-form glass-card">
          <div class="as-col-title">页面结构 <span class="as-col-sub">{{ blocks.length }} 个组件，从上到下堆叠</span></div>

          <div v-if="!blocks.length" class="as-blocks-empty">
            还没有组件：左侧选预设包快速开始，或点「+ 添加组件」逐个搭建
          </div>

          <div v-for="(b, i) in blocks" :key="b.id" class="as-blk" :class="{ open: expandedId === b.id }">
            <div class="as-blk-head" @click="toggleExpand(b.id)">
              <span class="as-blk-emoji">{{ blockTypeOf(b.type).emoji }}</span>
              <span class="as-blk-summary">{{ blockSummary(b) }}</span>
              <span class="as-blk-ops" @click.stop>
                <el-icon :class="{ dim: i === 0 }" title="上移" @click="moveBlock(i, -1)"><Top /></el-icon>
                <el-icon :class="{ dim: i === blocks.length - 1 }" title="下移" @click="moveBlock(i, 1)"><Bottom /></el-icon>
                <el-icon class="danger" title="删除" @click="removeBlock(i)"><Delete /></el-icon>
              </span>
            </div>

            <!-- 展开：字段表单 -->
            <div v-if="expandedId === b.id" class="as-blk-body">
              <template v-if="b.type === 'title'">
                <el-form-item label="标题文字">
                  <el-input v-model="b.config.text" maxlength="40" placeholder="如 夏日狂欢节" />
                </el-form-item>
                <el-form-item label="字号">
                  <el-input-number v-model="b.config.fontSize" :min="20" :max="48" />
                </el-form-item>
                <el-form-item label="颜色"><el-color-picker v-model="b.config.color" /></el-form-item>
                <el-form-item label="对齐">
                  <el-select v-model="b.config.align" style="width: 100%">
                    <el-option label="左" value="left" /><el-option label="中" value="center" /><el-option label="右" value="right" />
                  </el-select>
                </el-form-item>
              </template>

              <template v-else-if="b.type === 'text'">
                <el-form-item label="正文内容">
                  <el-input v-model="b.config.text" type="textarea" :rows="3" placeholder="支持换行" />
                </el-form-item>
                <el-form-item label="字号">
                  <el-input-number v-model="b.config.fontSize" :min="12" :max="24" />
                </el-form-item>
                <el-form-item label="颜色"><el-color-picker v-model="b.config.color" /></el-form-item>
                <el-form-item label="对齐">
                  <el-select v-model="b.config.align" style="width: 100%">
                    <el-option label="左" value="left" /><el-option label="中" value="center" /><el-option label="右" value="right" />
                  </el-select>
                </el-form-item>
                <el-form-item label="行高（倍数）">
                  <el-input-number v-model="b.config.lineHeight" :min="1" :max="3" :step="0.1" />
                </el-form-item>
              </template>

              <template v-else-if="b.type === 'image'">
                <el-form-item label="图片">
                  <ImageUploadBox v-model="b.config.src" shape="wide" />
                  <el-input v-model="b.config.src" class="as-img-path" placeholder="或填素材路径：/static/editor/xxx.png 或 http(s)://…" />
                  <div v-if="!b.config.src" class="as-field-tip">图片未填，预览里会显示占位框</div>
                </el-form-item>
                <el-form-item label="高度(px)">
                  <el-input-number v-model="b.config.height" :min="40" :max="667" />
                </el-form-item>
                <el-form-item label="圆角(px)">
                  <el-input-number v-model="b.config.radius" :min="0" :max="40" />
                </el-form-item>
                <el-form-item label="点击动作">
                  <FieldInput :field="linkField" :model="b.config" />
                </el-form-item>
              </template>

              <template v-else-if="b.type === 'button'">
                <el-form-item label="按钮文字">
                  <el-input v-model="b.config.text" maxlength="10" placeholder="如 立即参与" />
                </el-form-item>
                <el-form-item label="背景色"><el-color-picker v-model="b.config.background" /></el-form-item>
                <el-form-item label="文字颜色"><el-color-picker v-model="b.config.color" /></el-form-item>
                <el-form-item label="圆角(px)">
                  <el-input-number v-model="b.config.radius" :min="0" :max="44" />
                </el-form-item>
                <el-form-item label="全宽">
                  <el-switch v-model="b.config.fullWidth" />
                  <span class="as-switch-tip">开启后通栏宽，关闭为 200px 居中</span>
                </el-form-item>
                <el-form-item label="点击动作">
                  <FieldInput :field="linkField" :model="b.config" />
                </el-form-item>
              </template>

              <template v-else-if="b.type === 'divider'">
                <el-form-item label="高度(px)">
                  <el-input-number v-model="b.config.height" :min="1" :max="20" />
                </el-form-item>
                <el-form-item label="颜色"><el-color-picker v-model="b.config.color" /></el-form-item>
                <el-form-item label="左右边距(px)">
                  <el-input-number v-model="b.config.margin" :min="0" :max="100" />
                </el-form-item>
              </template>
            </div>
          </div>
        </div>

        <!-- 右：实时预览 -->
        <div class="as-col as-preview">
          <div class="as-col-title as-preview-title">实时预览</div>
          <div class="as-phone">
            <div class="as-phone-screen">
              <TmagicItemsView
                :block="previewBlock"
                :width="375"
                :background="pageBg"
                empty-text="添加组件后这里实时预览"
                :placeholder-height="667"
              />
            </div>
          </div>
          <div class="as-preview-tip">保存后，去首页装修添加「活动页」块并填标识即可展示</div>
        </div>
      </div>
    </template>

    <!-- ================= 高级模式（tmagic 编辑器） ================= -->
    <template v-else>
      <div class="as-bar glass-card">
        <el-button text @click="backToList">← 返回活动页工厂</el-button>
        <span class="as-bar-tip">高级模式：tmagic 自由编辑器，适合完全自定义的活动页</span>
      </div>
      <TmagicPageEditor class="as-tmagic" :initial-slug="slug" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Top, Bottom, Delete } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import FieldInput from '@/components/layout/FieldInput.vue'
import TmagicItemsView from '@/components/layout/renderer/TmagicItemsView.vue'
import { buildTmagicItems, type TmagicBlock } from '@/components/layout/renderer/normalize'
import type { WidgetField } from '@/views/layout/layoutSchemas'
import TmagicPageEditor from '@/views/miniapp/TmagicPageEditor.vue'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/
const CONFIG_PREFIX = 'tmagic.page.'
/** 本工具生成的 DSL 在 page 上的标记（name + meta） */
const STUDIO_MARK = 'activity-studio'

// ============ 组件模型 ============
type BlockType = 'title' | 'text' | 'image' | 'button' | 'divider'
interface Block {
  id: string
  type: BlockType
  config: Record<string, any>
}

const BLOCK_TYPES: { type: BlockType; name: string; emoji: string }[] = [
  { type: 'title', name: '标题', emoji: '🔤' },
  { type: 'text', name: '正文', emoji: '📄' },
  { type: 'image', name: '图片', emoji: '🖼️' },
  { type: 'button', name: '按钮', emoji: '🔘' },
  { type: 'divider', name: '分割线', emoji: '➖' },
]
const blockTypeOf = (t: BlockType) => BLOCK_TYPES.find((x) => x.type === t) || BLOCK_TYPES[0]

let blockSeq = 0
function newBlock(type: BlockType, config: Record<string, any> = {}): Block {
  const defaults: Record<BlockType, Record<string, any>> = {
    title: { text: '大标题', fontSize: 28, color: '#1D271F', align: 'center' },
    text: { text: '正文内容', fontSize: 15, color: '#5C6370', align: 'left', lineHeight: 1.6 },
    image: { src: '', height: 200, radius: 12, link: '' },
    button: { text: '立即参与', background: '#36A853', color: '#FFFFFF', radius: 22, link: '', fullWidth: false },
    divider: { height: 1, color: '#E3E9F2', margin: 0 },
  }
  return { id: `blk_${Date.now().toString(36)}_${++blockSeq}`, type, config: { ...defaults[type], ...config } }
}

/** 预设包 = 预填的 blocks 组合 + 背景色 */
const PRESETS = [
  {
    key: 'poster', name: '活动海报', desc: '大标题 + 副标题 + 主图 + 按钮', emoji: '📣', pageBg: '#FFFFFF',
    blocks: () => [
      newBlock('title', { text: '', fontSize: 32, align: 'center' }),
      newBlock('text', { text: '', fontSize: 16, color: '#8A9384', align: 'center', lineHeight: 1.5 }),
      newBlock('image', { height: 200, radius: 12 }),
      newBlock('button', { text: '立即参与', background: '#36A853' }),
    ],
  },
  {
    key: 'gift', name: '新人礼包', desc: '礼包标题 + 说明 + 配图 + 领取按钮', emoji: '🎁', pageBg: '#FFF6E8',
    blocks: () => [
      newBlock('title', { text: '', fontSize: 28, color: '#5C3A12', align: 'center' }),
      newBlock('text', { text: '', fontSize: 15, color: '#8A7350', align: 'center', lineHeight: 1.6 }),
      newBlock('image', { height: 200, radius: 12 }),
      newBlock('button', { text: '立即领取', background: '#F97316' }),
    ],
  },
  {
    key: 'image', name: '纯图片页', desc: '一张通栏大图，适合海报导流入页', emoji: '🖼️', pageBg: '#FFFFFF',
    blocks: () => [newBlock('image', { height: 520, radius: 0 })],
  },
]

// ============ 视图状态 ============
type ViewKey = 'list' | 'edit' | 'advanced'
const view = ref<ViewKey>('list')

// ============ 列表 ============
interface ActivityPageItem {
  slug: string
  desc: string
  updatedAt: string
  dsl: any
}
const pages = ref<ActivityPageItem[]>([])
const listLoading = ref(false)

async function loadList() {
  listLoading.value = true
  try {
    const res: any = await request.get('/admin/configs', { params: { group: 'tmagic' } })
    const list: any[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
    pages.value = list
      .filter((c) => typeof c?.key === 'string' && c.key.startsWith(CONFIG_PREFIX))
      .map((c) => ({
        slug: c.key.slice(CONFIG_PREFIX.length),
        desc: c.desc || '',
        updatedAt: c.updatedAt || c.updated_at || c.createdAt || '',
        dsl: c.value,
      }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  } catch (e: any) {
    if (!e?.__silent) ElMessage.error(e?.message || '活动页列表加载失败')
  } finally {
    listLoading.value = false
  }
}

const thumbCache = new WeakMap<object, TmagicBlock>()
function thumbBlock(p: ActivityPageItem): TmagicBlock {
  let b = thumbCache.get(p.dsl)
  if (!b) {
    b = buildTmagicItems(p.dsl)
    thumbCache.set(p.dsl, b)
  }
  return b
}
function thumbBg(p: ActivityPageItem) {
  return p.dsl?.items?.[0]?.style?.background || ''
}
function fmtTime(t: string) {
  if (!t) return '—'
  return String(t).replace('T', ' ').slice(0, 16)
}

// ============ 编辑状态 ============
const blocks = ref<Block[]>([])
const pageBg = ref('#FFFFFF')
const expandedId = ref('')
const slug = ref('')
const slugLocked = ref(false)
const saving = ref(false)
/** 当前编辑的页面不是本工具生成（tmagic 手搓） */
const foreignPage = ref(false)

const linkField: WidgetField = {
  key: 'link',
  label: '点击动作',
  input: 'link',
  desc: '用户点击时的行为，留空为无动作',
}

function blockSummary(b: Block) {
  const c = b.config
  if (b.type === 'title') return (c.text || '标题').slice(0, 12)
  if (b.type === 'text') return (c.text || '正文').slice(0, 12)
  if (b.type === 'image') return `图片 ${c.height ?? 200}px`
  if (b.type === 'button') return (c.text || '按钮').slice(0, 10)
  return `分割线 ${c.height ?? 1}px`
}
function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? '' : id
}
function addBlock(type: BlockType) {
  const b = newBlock(type)
  blocks.value.push(b)
  expandedId.value = b.id
}
function moveBlock(i: number, dir: number) {
  const j = i + dir
  if (j < 0 || j >= blocks.value.length) return
  const arr = [...blocks.value]
  const [m] = arr.splice(i, 1)
  arr.splice(j, 0, m)
  blocks.value = arr
}
function removeBlock(i: number) {
  blocks.value.splice(i, 1)
}

async function applyPreset(t: (typeof PRESETS)[number]) {
  if (blocks.value.length) {
    try {
      await ElMessageBox.confirm('应用预设包将覆盖当前页面内容，确定吗？', '覆盖确认', {
        confirmButtonText: '覆盖',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return
    }
  }
  blocks.value = t.blocks()
  pageBg.value = t.pageBg
  expandedId.value = blocks.value[0]?.id || ''
  ElMessage.success(`已应用预设包「${t.name}」，可继续自由增删组件`)
}

// ============ 新建 / 编辑 / 返回 ============
function genSlug() {
  return `act-${Date.now().toString(36)}`
}
function resetEditor() {
  blocks.value = []
  pageBg.value = '#FFFFFF'
  expandedId.value = ''
  foreignPage.value = false
}

function openCreate() {
  resetEditor()
  slug.value = genSlug()
  slugLocked.value = false
  view.value = 'edit'
}

/** 旧版（固定模板表单）meta → blocks 一次性迁移 */
function migrateOldForm(meta: any): { blocks: Block[]; pageBg: string } {
  const f = meta.form || {}
  const out: Block[] = []
  if (meta.template === 'gift') {
    out.push(newBlock('title', { text: f.title || '', fontSize: 28, color: '#5C3A12', align: 'center' }))
    if (f.subtitle) out.push(newBlock('text', { text: f.subtitle, fontSize: 15, color: '#8A7350', align: 'center', lineHeight: 1.6 }))
    out.push(newBlock('image', { src: f.image || '', height: 200, radius: 12 }))
    out.push(newBlock('button', { text: f.btnText || '立即领取', background: '#F97316', color: '#FFFFFF', radius: 22, link: f.btnLink || '' }))
    return { blocks: out, pageBg: f.bgColor || '#FFF6E8' }
  }
  if (meta.template === 'image') {
    out.push(newBlock('image', { src: f.image || '', height: 520, radius: 0 }))
    return { blocks: out, pageBg: f.bgColor || '#FFFFFF' }
  }
  // 默认按 poster 结构迁移
  out.push(newBlock('title', { text: f.title || '', fontSize: 32, color: '#1D271F', align: 'center' }))
  if (f.subtitle) out.push(newBlock('text', { text: f.subtitle, fontSize: 16, color: '#8A9384', align: 'center', lineHeight: 1.5 }))
  out.push(newBlock('image', { src: f.image || '', height: 200, radius: 12 }))
  out.push(newBlock('button', { text: f.btnText || '立即参与', background: '#36A853', color: '#FFFFFF', radius: 22, link: f.btnLink || '' }))
  return { blocks: out, pageBg: '#FFFFFF' }
}

async function openEdit(p: ActivityPageItem) {
  resetEditor()
  slug.value = p.slug
  slugLocked.value = true
  view.value = 'edit'
  const page = p.dsl?.items?.[0]
  const meta = page?.meta
  if (page?.name !== STUDIO_MARK || !meta) {
    foreignPage.value = true
    return
  }
  if (Array.isArray(meta.form?.blocks)) {
    // 新版组件堆叠结构：直接恢复（补齐 id，防止旧数据缺 id）
    blocks.value = meta.form.blocks.map((b: any) => ({
      id: b.id || `blk_${Date.now().toString(36)}_${++blockSeq}`,
      type: b.type,
      config: { ...(b.config || {}) },
    }))
    pageBg.value = meta.form.pageBg || '#FFFFFF'
    expandedId.value = blocks.value[0]?.id || ''
  } else if (meta.template) {
    // 旧版固定模板结构：一次性迁移成 blocks
    const migrated = migrateOldForm(meta)
    blocks.value = migrated.blocks
    pageBg.value = migrated.pageBg
    expandedId.value = blocks.value[0]?.id || ''
    ElMessage.info('已将旧版模板内容升级为可自由编辑的组件结构，保存后生效')
  } else {
    foreignPage.value = true
  }
}

function backToList() {
  view.value = 'list'
  loadList()
}
function openAdvanced() {
  if (view.value === 'edit' && !validSlug(true)) return
  view.value = 'advanced'
}

// ============ 布局引擎：blocks 堆叠 → 绝对定位 DSL ============
/** 估算正文本行数：按内容宽 335px / 字号估算每行字数 */
function estimateTextLines(text: string, fontSize: number) {
  const perLine = Math.max(1, Math.floor(335 / fontSize))
  return String(text || '')
    .split('\n')
    .reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / perLine)), 0)
}

function blocksToDsl(list: Block[], bg: string) {
  const nodes: any[] = []
  const ts = Date.now().toString(36)
  const MARGIN_X = 20
  const CONTENT_W = 335
  const GAP = 16
  const DIV_GAP = 12
  let y = 28

  list.forEach((b, i) => {
    const c = b.config || {}
    const id = `node_${ts}_${i}`
    const gap = b.type === 'divider' ? DIV_GAP : GAP

    if (b.type === 'title') {
      const fontSize = Number(c.fontSize) || 28
      const height = Math.max(44, Math.round(fontSize * 1.5))
      nodes.push({
        type: 'text', id, name: '标题', text: c.text || '',
        style: { position: 'absolute', left: MARGIN_X, top: y, width: CONTENT_W, height, fontSize, fontWeight: 700, color: c.color || '#1D271F', textAlign: c.align || 'center' },
      })
      y += height + gap
    } else if (b.type === 'text') {
      const fontSize = Number(c.fontSize) || 15
      const lh = Number(c.lineHeight) || 1.6
      const linePx = Math.round(fontSize * lh)
      const height = Math.max(28, estimateTextLines(c.text, fontSize) * linePx)
      nodes.push({
        type: 'text', id, name: '正文', text: c.text || '',
        style: { position: 'absolute', left: MARGIN_X, top: y, width: CONTENT_W, height, fontSize, color: c.color || '#5C6370', textAlign: c.align || 'left', lineHeight: `${linePx}px` },
      })
      y += height + gap
    } else if (b.type === 'image') {
      const height = Number(c.height) || 200
      nodes.push({
        type: 'img', id, name: '图片', src: c.src || '', link: c.link || '',
        style: { position: 'absolute', left: MARGIN_X, top: y, width: CONTENT_W, height, borderRadius: Number(c.radius ?? 12) },
      })
      y += height + gap
    } else if (b.type === 'button') {
      const full = !!c.fullWidth
      const width = full ? CONTENT_W : 200
      const left = full ? MARGIN_X : Math.round((375 - width) / 2)
      nodes.push({
        type: 'button', id, name: '按钮', text: c.text || '按钮', link: c.link || '',
        style: { position: 'absolute', left, top: y, width, height: 44, background: c.background || '#36A853', color: c.color || '#FFFFFF', borderRadius: Number(c.radius ?? 22), fontSize: 16 },
      })
      y += 44 + gap
    } else if (b.type === 'divider') {
      // 分割线用 text 节点实现：height + background，page-renderer 对 text 节点 style 全量透传
      const height = Math.max(1, Number(c.height) || 1)
      const m = Math.min(100, Math.max(0, Number(c.margin) || 0))
      nodes.push({
        type: 'text', id, name: '分割线', text: '',
        style: { position: 'absolute', left: MARGIN_X + m, top: y, width: CONTENT_W - 2 * m, height, background: c.color || '#E3E9F2' },
      })
      y += height + gap
    }
  })

  const firstText = (list.find((b) => b.type === 'title' && b.config.text) || list.find((b) => b.type === 'text' && b.config.text))?.config?.text || ''

  return {
    dsl: {
      type: 'app',
      id: 'app_1',
      items: [
        {
          type: 'page',
          id: 'page_1',
          name: STUDIO_MARK,
          title: firstText || '活动页',
          layout: 'absolute',
          style: { width: 375, height: 667, ...(bg ? { background: bg } : {}) },
          meta: { studio: STUDIO_MARK, template: 'custom', form: { blocks: JSON.parse(JSON.stringify(list)), pageBg: bg } },
          items: nodes,
        },
      ],
    } as any,
    firstText,
  }
}

const previewBlock = computed<TmagicBlock>(() => buildTmagicItems(blocksToDsl(blocks.value, pageBg.value).dsl))

// ============ 保存 ============
function validSlug(silent = false) {
  const s = slug.value.trim()
  if (!SLUG_RE.test(s)) {
    if (!silent) ElMessage.error('页面标识只能是小写字母、数字、中划线，1-32 位')
    return ''
  }
  return s
}

async function savePage() {
  const s = validSlug()
  if (!s) return
  if (!blocks.value.length) {
    ElMessage.error('页面至少需要一个组件')
    return
  }
  if (blocks.value.some((b) => b.type === 'image' && !b.config.src)) {
    ElMessage.warning('有图片组件未填图片，预览里会显示占位框')
  }
  saving.value = true
  try {
    const { dsl, firstText } = blocksToDsl(blocks.value, pageBg.value)
    const desc = `活动页 ${s}${firstText ? ` · ${firstText.slice(0, 20)}` : ''}`
    await request.put('/admin/configs', {
      configs: [{ key: `${CONFIG_PREFIX}${s}`, value: dsl, group: 'tmagic', desc }],
    })
    slugLocked.value = true
    ElMessageBox.confirm(`已保存！去首页装修添加「活动页」块并填 ${s} 即可展示`, '保存成功', {
      confirmButtonText: '复制标识',
      cancelButtonText: '继续编辑',
      type: 'success',
    })
      .then(() => copySlug(s))
      .catch(() => { /* 继续编辑 */ })
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function copySlug(s: string) {
  try {
    await navigator.clipboard.writeText(s)
    ElMessage.success(`已复制标识：${s}`)
  } catch {
    ElMessageBox.alert(s, '活动页标识', { confirmButtonText: '知道了' })
  }
}

onMounted(loadList)
</script>

<style scoped lang="scss">
.activity-studio {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 12px 12px;
}

/* ===== 头部条 ===== */
.as-head,
.as-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-radius: 12px;
}
.as-head-text {
  margin-right: auto;
}
.as-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--mx-text, #1f2329);
}
.as-sub {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--mx-muted, #8b929d);
}
.as-bar-label {
  font-size: 13px;
  color: var(--mx-muted, #8b929d);
  flex-shrink: 0;
}
.as-bar-tip {
  font-size: 12.5px;
  color: var(--mx-muted, #8b929d);
}
.as-slug {
  width: 200px;
}

/* ===== 列表 ===== */
.as-list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.as-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 260px;
  border-radius: 12px;
  color: var(--mx-muted, #8b929d);
  font-size: 13px;
}
.as-empty-emoji {
  font-size: 40px;
}
.as-empty-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--mx-text, #1f2329);
}
.as-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 12px;
}
.as-card {
  display: flex;
  gap: 14px;
  padding: 14px;
  border-radius: 12px;
  align-items: flex-start;
}
.as-card-thumb {
  flex: 0 0 160px;
  border: 1px solid var(--mx-border, #e3e9f2);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  max-height: 220px;
}
.as-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.as-card-slug {
  font-size: 14px;
  font-weight: 700;
  color: var(--mx-text, #1f2329);
  font-family: ui-monospace, monospace;
  word-break: break-all;
}
.as-card-desc {
  font-size: 12.5px;
  color: var(--mx-sub, #5c6370);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.as-card-time {
  font-size: 11.5px;
  color: var(--mx-muted, #8b929d);
}
.as-card-ops {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

/* ===== 编辑视图 ===== */
.as-foreign {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 12px;
}
.as-foreign-emoji {
  font-size: 40px;
}
.as-foreign-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--mx-text, #1f2329);
}
.as-foreign-tip {
  font-size: 13px;
  color: var(--mx-muted, #8b929d);
}
.as-foreign-ops {
  margin-top: 8px;
}

.as-workbench {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 210px minmax(300px, 1fr) auto;
  gap: 12px;
  align-items: stretch;
}
.as-col {
  border-radius: 12px;
  padding: 16px;
  overflow-y: auto;
  min-height: 0;
}
.as-col-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--mx-text, #1f2329);
  margin-bottom: 12px;
}
.as-col-sub {
  margin-left: 6px;
  font-size: 11.5px;
  font-weight: 400;
  color: var(--mx-muted, #8b929d);
}

/* 预设包卡片 */
.as-templates {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.as-tpl {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px;
  border: 2px solid var(--mx-border, #e3e9f2);
  border-radius: 10px;
  background: var(--mx-card, #fff);
  cursor: pointer;
  text-align: left;
  transition: border-color .15s ease, background-color .15s ease;
}
.as-tpl:hover {
  border-color: #34d17b;
  background: #f0fbf4;
}
.as-tpl-emoji {
  font-size: 22px;
}
.as-tpl-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--mx-text, #1f2329);
}
.as-tpl-desc {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--mx-muted, #8b929d);
}
.as-add-title {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--mx-border, #e3e9f2);
}
.as-add-tip {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--mx-muted, #8b929d);
}

/* 页面结构 blocks */
.as-blocks-empty {
  padding: 32px 16px;
  border: 1px dashed var(--mx-border, #e3e9f2);
  border-radius: 10px;
  text-align: center;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--mx-muted, #8b929d);
}
.as-blk {
  border: 1px solid var(--mx-border, #e3e9f2);
  border-radius: 10px;
  margin-bottom: 8px;
  overflow: hidden;
  background: var(--mx-card, #fff);
}
.as-blk.open {
  border-color: #34d17b;
}
.as-blk-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
}
.as-blk-head:hover {
  background: var(--mx-soft, #f7f9fc);
}
.as-blk-emoji {
  font-size: 15px;
}
.as-blk-summary {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--mx-text, #1f2329);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.as-blk-ops {
  display: flex;
  gap: 6px;
  color: var(--mx-muted, #8b929d);
}
.as-blk-ops .el-icon {
  cursor: pointer;
}
.as-blk-ops .el-icon:hover {
  color: var(--mx-text, #1f2329);
}
.as-blk-ops .el-icon.dim {
  opacity: 0.3;
  pointer-events: none;
}
.as-blk-ops .el-icon.danger:hover {
  color: #ef4444;
}
.as-blk-body {
  padding: 4px 12px 12px;
  border-top: 1px dashed var(--mx-border, #e3e9f2);
}
.as-blk-body :deep(.el-form-item) {
  margin-bottom: 10px;
}
.as-blk-body :deep(.el-form-item__label) {
  font-size: 12px;
  color: var(--mx-muted, #8b929d);
  padding-bottom: 2px !important;
}

.as-img-path {
  margin-top: 8px;
}
.as-field-tip {
  margin-top: 6px;
  font-size: 11.5px;
  color: #e6a23c;
}
.as-switch-tip {
  margin-left: 8px;
  font-size: 11.5px;
  color: var(--mx-muted, #8b929d);
}

/* 预览 */
.as-preview {
  background: transparent;
  padding: 0;
  overflow-y: auto;
}
.as-preview-title {
  color: #c9ced6;
  padding-left: 4px;
}
.as-phone {
  width: calc(375px + 24px);
  padding: 12px;
  background: #23262d;
  border-radius: 28px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}
.as-phone-screen {
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
  min-height: 400px;
}
.as-preview-tip {
  margin-top: 10px;
  font-size: 11.5px;
  color: #9aa1ab;
  text-align: center;
}

/* ===== 高级模式 ===== */
.as-tmagic {
  flex: 1;
  min-height: 0;
}
</style>
