<template>
  <div class="tmagic-page-editor">
    <!-- 顶部工具条 -->
    <div class="tmagic-toolbar glass-card">
      <span class="toolbar-label">活动页标识（字母/数字/中划线）</span>
      <el-input
        v-model="slug"
        class="slug-input"
        placeholder="如 summer-sale"
        clearable
        @keyup.enter="loadPage"
      />
      <el-button :loading="loading" @click="loadPage">加载</el-button>
      <el-button type="primary" :loading="saving" @click="savePage">保存</el-button>
      <span class="toolbar-tip">
        保存后，在首页装修里添加「活动页」块并填这个标识即可展示
      </span>
    </div>

    <!-- tmagic 编辑器 -->
    <div class="tmagic-canvas glass-card">
      <m-editor
        ref="editorRef"
        :key="editorKey"
        v-model="dsl"
        :runtime-url="runtimeUrl"
        :component-group-list="componentGroupList"
        :props-configs="propsConfigs"
        :props-values="propsValues"
        :sidebar="sidebar"
        :menu="menu"
        :stage-rect="{ width: 375, height: 667 }"
      />

      <!-- 新手引导浮层：只盖画布区，不挡工具条；「知道了」后 localStorage 记住不再显示 -->
      <div v-if="guideVisible" class="tmagic-guide">
        <div class="tmagic-guide-card">
          <div class="tg-title">这是什么？</div>
          <p class="tg-p">
            「活动页」是可以自由拖拽的营销 / 专题页。保存后，在小程序首页（或任意页面）的装修里添加「活动页」块，填入这里的标识，就能展示给用户。
          </p>
          <div class="tg-title">三步上手</div>
          <ol class="tg-steps">
            <li><b>起标识</b>：在上方输入框起个名字，如 summer-sale</li>
            <li><b>拖组件</b>：把左侧的文本 / 图片 / 按钮拖进中间画布</li>
            <li><b>去引用</b>：点「保存」，然后到首页装修添加「活动页」块并填这个标识</li>
          </ol>
          <el-button type="primary" style="width: 100%" @click="dismissGuide">知道了</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { TMagicEditor as MEditor } from '@tmagic/editor'
import '@tmagic/editor/dist/tmagic-editor.css'
import { request } from '@/api/request'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/

/** 空页面 DSL：375x667 绝对定位画布，与小程序端 750rpx 等比（1px = 2rpx） */
function createEmptyDsl() {
  return {
    type: 'app',
    id: 'app_1',
    items: [
      {
        type: 'page',
        id: 'page_1',
        name: '活动页',
        title: '活动页',
        layout: 'absolute',
        style: { width: 375, height: 667 },
        items: [],
      },
    ],
  } as any
}

/** 从活动页工厂「高级模式」进入时带入的初始标识 */
const props = withDefaults(defineProps<{ initialSlug?: string }>(), { initialSlug: '' })

const slug = ref(props.initialSlug || 'campaign')
const loading = ref(false)
const saving = ref(false)
const dsl = ref<any>(createEmptyDsl())
const editorRef = ref<InstanceType<typeof MEditor>>()
/** 加载配置后重建编辑器，保证画布/历史状态干净 */
const editorKey = ref(0)

// ============ 新手引导浮层 ============
const GUIDE_KEY = 'tmagic-guide-v1'
const guideVisible = ref(false)
function dismissGuide() {
  guideVisible.value = false
  try {
    localStorage.setItem(GUIDE_KEY, '1')
  } catch { /* 隐私模式等场景忽略 */ }
}

// ============ 舞台缩放：默认适配视口，让 375px 画布一眼可见 ============
async function fitStageZoom() {
  try {
    const ui = (editorRef.value as any)?.uiService
    if (ui?.calcZoom && ui?.set) ui.set('zoom', await ui.calcZoom())
  } catch { /* 忽略：编辑器顶部 zoom 菜单仍可手动调整 */ }
}

onMounted(() => {
  try {
    guideVisible.value = !localStorage.getItem(GUIDE_KEY)
  } catch {
    guideVisible.value = true
  }
  // 等 tmagic stage 挂载完成后再适配缩放
  setTimeout(fitStageZoom, 400)
  // 高级模式带入标识时自动加载已有页面
  if (props.initialSlug) setTimeout(loadPage, 100)
})
watch(editorKey, () => setTimeout(fitStageZoom, 400))

/** 画布渲染用的自包含静态运行时（public/tmagic-runtime），与后台同源 */
const runtimeUrl = computed(
  () => new URL(`${import.meta.env.BASE_URL || '/'}tmagic-runtime/index.html`, window.location.origin).href,
)

/** 左侧物料图标（tmagic 缺省图标会拉伸失真，这里用小尺寸内联 SVG） */
const svgIcon = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#5c6370" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`)}`
const ICONS = {
  text: svgIcon('<path d="M4 6h16M12 6v12M9 18h6"/>'),
  img: svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 18l5-5 3.5 3.5L17 12l2.5 2.5"/>'),
  button: svgIcon('<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8 12h8"/>'),
}

/** 左侧物料：文本 / 图片 / 按钮 */
const componentGroupList = [
  {
    title: '基础组件',
    items: [
      { text: '文本', type: 'text', icon: ICONS.text },
      { text: '图片', type: 'img', icon: ICONS.img },
      { text: '按钮', type: 'button', icon: ICONS.button },
    ],
  },
]

/** 拖入画布时的默认值（小程序端按 style.left/top/width/height 绝对定位渲染） */
const propsValues = {
  text: { text: '文本内容', style: { width: 200, height: 40, fontSize: 16, color: '#1D271F' } },
  img: { src: '', link: '', style: { width: 200, height: 200 } },
  button: { text: '按钮', link: '', style: { width: 140, height: 44, background: '#36A853', color: '#FFFFFF', borderRadius: 8, fontSize: 16 } },
}

/** 右侧属性面板表单（样式/位置在 tmagic 自带的「样式」页签里调） */
const propsConfigs = {
  text: [{ name: 'text', text: '文本内容', type: 'textarea' }],
  img: [
    { name: 'src', text: '图片地址', type: 'text' },
    { name: 'link', text: '跳转链接（小程序路径）', type: 'text' },
  ],
  button: [
    { name: 'text', text: '按钮文字', type: 'text' },
    { name: 'link', text: '跳转链接（小程序路径）', type: 'text' },
  ],
}

/** 左侧只保留组件列表和组件树，隐藏代码块/数据源 */
const sidebar = { type: 'tabs', status: 'component-list', items: ['component-list', 'layer'] } as any

const menu = { left: [], right: ['/', 'undo', 'redo', 'delete', '/', 'zoom'] } as any

function validSlug() {
  const s = slug.value.trim()
  if (!SLUG_RE.test(s)) {
    ElMessage.error('页面标识只能是小写字母、数字、中划线，1-32 位')
    return ''
  }
  return s
}

function configKey(s: string) {
  return `tmagic.page.${s}`
}

async function savePage() {
  const s = validSlug()
  if (!s) return
  saving.value = true
  try {
    // 以 editorService 内部 DSL 为准（包含编辑器归一化后的 id/结构）
    const editorService = (editorRef.value as any)?.editorService
    const value = editorService?.get?.('root') || dsl.value
    await request.put('/admin/configs', {
      configs: [{ key: configKey(s), value, group: 'tmagic', desc: `tmagic 活动页 ${s}` }],
    })
    ElMessage.success(`已保存到 ${configKey(s)}`)
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function loadPage() {
  const s = validSlug()
  if (!s) return
  loading.value = true
  try {
    const res: any = await request.get(`/admin/configs/${configKey(s)}`)
    const value = res?.data?.value ?? res?.value ?? res?.data ?? res
    if (!value || value.type !== 'app' || !Array.isArray(value.items)) {
      ElMessage.warning(`没有找到 ${configKey(s)} 的配置，已创建空白页`)
      dsl.value = createEmptyDsl()
    } else {
      dsl.value = value
      ElMessage.success('已加载')
    }
    editorKey.value += 1
  } catch (e: any) {
    if (e?.response?.status === 404 || e?.status === 404) {
      ElMessage.warning(`没有找到 ${configKey(s)} 的配置，已创建空白页`)
      dsl.value = createEmptyDsl()
      editorKey.value += 1
    } else {
      ElMessage.error(e?.message || '加载失败')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.tmagic-page-editor {
  display: grid;
  gap: 14px;
}
.tmagic-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
}
.toolbar-label {
  font-size: 13px;
  color: var(--mx-muted);
  flex-shrink: 0;
}
.slug-input {
  width: 220px;
}
.toolbar-tip {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--mx-muted);
  code {
    background: var(--mx-bg, #f5f7fa);
    border-radius: 4px;
    padding: 1px 6px;
  }
}
.tmagic-canvas {
  padding: 0;
  overflow: hidden;
  height: calc(100vh - 240px);
  min-height: 560px;
  border-radius: 10px;
  position: relative;
  :deep(.m-editor) {
    height: 100%;
  }
}

/* ===== 新手引导浮层 ===== */
.tmagic-guide {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 14, 17, 0.45);
  backdrop-filter: blur(2px);
}
.tmagic-guide-card {
  width: 400px;
  max-width: calc(100% - 48px);
  padding: 24px 26px;
  border-radius: 14px;
  background: var(--mx-card, #fff);
  color: var(--mx-text, #1f2329);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
}
.tg-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 6px;
}
.tg-title + .tg-steps,
.tg-p + .tg-title {
  margin-top: 14px;
}
.tg-p {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--mx-sub, #5c6370);
}
.tg-steps {
  margin: 0 0 18px;
  padding-left: 20px;
  font-size: 13px;
  line-height: 2;
  color: var(--mx-sub, #5c6370);
}

/* ===== 左侧物料：一句灰字说明 ===== */
.tmagic-canvas :deep(.ui-component-panel)::after {
  content: '把文本 / 图片 / 按钮直接拖进中间画布';
  display: block;
  margin: 10px 12px 6px;
  padding-top: 10px;
  border-top: 1px dashed var(--mx-border, #e3e9f2);
  font-size: 12px;
  line-height: 1.6;
  color: var(--mx-muted, #8b929d);
}
</style>
