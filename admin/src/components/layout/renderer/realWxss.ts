/**
 * 真机 WXSS 注入器：从后端拉取小程序真实样式表，编译成画布作用域 CSS 注入 <style>。
 * 后端不可用时静默回退（组件自带保底样式），不白屏。
 */
import { request } from '@/api/request'
import { compileWxss } from '@/utils/wxssCompiler'

/** 与真机 app.wxss 对齐的主题变量默认值（rpx 已按 0.5 换算为 px） */
export const DEFAULT_THEME_VARS: Record<string, string> = {
  '--brand': '#36A853',
  '--brand-deep': '#2E7E3A',
  '--brand-forest': '#0D6230',
  '--brand-light': '#87BD6D',
  '--brand-bg': '#E8F3E4',
  '--bg-page': '#F4F7F1',
  '--bg-card': '#FFFFFF',
  '--bg-cream': '#FFF8E8',
  '--bg-fill': '#F0F4EC',
  '--text-primary': '#1D271F',
  '--text-secondary': '#55604F',
  '--text-tertiary': '#8A9384',
  '--text-disabled': '#C4CABE',
  '--text-inverse': '#FFFFFF',
  '--accent-sun': '#F2C94C',
  '--accent-female': '#FF69B4',
  '--danger': '#FA5150',
  '--danger-bg': '#FDECEB',
  '--warning': '#FF9500',
  '--warning-bg': '#FFF4DB',
  '--info': '#4A7FD6',
  '--line-hairline': '#E8EEE4',
  '--radius-s': '4px',
  '--radius-m': '8px',
  '--radius-l': '12px',
  '--radius-xl': '16px',
  '--radius-pill': '499px',
  '--fs-caption': '10px',
  '--fs-body-s': '12px',
  '--fs-body': '14px',
  '--fs-title': '16px',
  '--fs-headline': '19px',
  '--fs-display': '24px',
}

/** 拉取真实主题变量（/admin/miniapp/code/theme），失败回退默认值 */
export async function loadCanvasThemeVars(): Promise<Record<string, string>> {
  const vars: Record<string, string> = { ...DEFAULT_THEME_VARS }
  try {
    const res: any = await request.get('/admin/miniapp/code/theme')
    const list = res.data?.vars || []
    for (const v of list) {
      if (!v.name || !v.value) continue
      let value = String(v.value)
      // rpx 值按画布比例换算
      value = value.replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_: string, n: string) => `${parseFloat(n) / 2}px`)
      vars[v.name] = value
    }
  } catch (e) {
    console.warn('[web-renderer] 主题变量拉取失败，使用默认主题', e)
  }
  return vars
}

/** 主题变量 → scope 根选择器上的 CSS 声明文本 */
export function themeVarsCss(scope: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n')
  return `${scope} {\n${body}\n}`
}

/** 画布内所有真机作用域根（主题变量统一挂在这些根上） */
const CANVAS_SCOPES = [
  '.web-renderer', '.native-feed', '.native-merchant', '.native-rank',
  '.npc-home', '.npc-message', '.npc-profile', '.npc-containers',
]

let themePromise: Promise<void> | null = null

/** 确保画布主题变量已注入（所有真机复刻组件共享，幂等） */
export function ensureCanvasTheme(): Promise<void> {
  if (!themePromise) {
    themePromise = (async () => {
      const vars = await loadCanvasThemeVars()
      const css = CANVAS_SCOPES.map((s) => themeVarsCss(s, vars)).join('\n')
      let el = document.getElementById('web-renderer-theme') as HTMLStyleElement | null
      if (!el) {
        el = document.createElement('style')
        el.id = 'web-renderer-theme'
        document.head.appendChild(el)
      }
      el.textContent = css
    })()
  }
  return themePromise
}

/**
 * 拉取若干小程序源文件（WXSS），编译注入 document.head，按 id 去重（重复调用覆盖内容）。
 * 返回是否至少成功注入了一份真实样式。
 */
export async function injectRealWxss(
  id: string,
  files: Array<{ path: string; scope: string; scale?: number }>,
  extraCss = '',
): Promise<boolean> {
  const parts: string[] = []
  for (const f of files) {
    try {
      const res: any = await request.get('/admin/miniapp/code/source-file', { params: { path: f.path } })
      const content = res.data?.content || ''
      if (content) parts.push(compileWxss(content, f.scope, f.scale ?? 0.5))
    } catch (e) {
      console.warn(`[web-renderer] 真机样式拉取失败: ${f.path}`, e)
    }
  }
  if (extraCss) parts.push(extraCss)
  if (!parts.length) return false
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = parts.join('\n')
  return true
}

/** 生成 deterministic 演示图片（SVG data URI，离线可用） */
export function demoImage(seed: number, w = 300, h = 300, label = ''): string {
  const palettes: Array<[string, string]> = [
    ['#a8d5a2', '#4c9a50'],
    ['#f6d8a8', '#e8934c'],
    ['#a8c8ec', '#4a7fd6'],
    ['#f3b8c8', '#d66a8e'],
    ['#c8bce8', '#7a63c9'],
    ['#b8e3dd', '#3aa79a'],
  ]
  const [c1, c2] = palettes[Math.abs(seed) % palettes.length]
  const text = label
    ? `<text x="50%" y="54%" font-size="${Math.round(h / 6)}" fill="rgba(255,255,255,.9)" text-anchor="middle" font-family="sans-serif">${label}</text>`
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${text}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** 演示头像（圆形底 + 首字） */
export function demoAvatar(seed: number, initial = ''): string {
  return demoImage(seed, 96, 96, initial)
}

/**
 * 真实内容图片池：backend uploads 里已有的真实帖子照片。
 * 真实接口无数据时，演示卡的图片位优先用这些真实图（objectPosition 错位裁剪避免重复感）。
 */
export const REAL_IMAGE_POOL: Array<{ url: string; position?: string }> = [
  { url: '/uploads/users/cmpc0x0ws01d213d89gjbx7y0/posts/1779191126378_0f37c6cf3625c876bdd67e105c28d92c.jpg', position: 'center' },
  { url: '/uploads/users/cmpc0x0ws01d213d89gjbx7y0/posts/1779191126378_0f37c6cf3625c876bdd67e105c28d92c.jpg', position: 'top' },
  { url: '/uploads/users/cmpc0x0ws01d213d89gjbx7y0/posts/1779191126378_0f37c6cf3625c876bdd67e105c28d92c.jpg', position: 'bottom' },
]

export function realImage(seed: number): { url: string; position: string } {
  const item = REAL_IMAGE_POOL[Math.abs(seed) % REAL_IMAGE_POOL.length]
  return { url: item.url, position: item.position || 'center' }
}
