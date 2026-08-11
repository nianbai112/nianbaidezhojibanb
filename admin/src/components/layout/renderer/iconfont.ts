/**
 * 真机 iconfont 注入：字体 base64 来自 common/iconfont-font.js，
 * 字形 class（.txtIcon / .icon-*:before content）来自 app.wxss。
 * 编译到画布各真机作用域根，id 去重；失败仅 console.warn，emoji/文字回退仍可读。
 */
import { request } from '@/api/request'
import { compileWxss } from '@/utils/wxssCompiler'

/** 画布内所有真机作用域根（与 realWxss.ensureCanvasTheme 保持一致） */
const ICONFONT_SCOPES = ['.web-renderer', '.native-feed', '.native-merchant', '.native-rank', '.npc-home', '.npc-message', '.npc-profile', '.npc-containers']

/** 从 app.wxss 提取 .txtIcon 与全部 .icon-* 相关规则（含 :before/content） */
function extractIconRules(wxss: string): string {
  const cleaned = String(wxss || '').replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: string[] = []
  // 平坦规则匹配（app.wxss 中 icon 规则无嵌套）
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned))) {
    const selector = m[1].trim()
    if (selector.startsWith('@')) continue
    const sels = selector.split(',').map((s) => s.trim())
    if (sels.some((s) => /^\.txtIcon\b/.test(s) || /^\.icon-[a-z0-9_-]+/i.test(s))) {
      rules.push(`${selector} {${m[2]}}`)
    }
  }
  return rules.join('\n')
}

let promise: Promise<void> | null = null

export function ensureIconfont(): Promise<void> {
  if (promise) return promise
  promise = (async () => {
    try {
      const [jsRes, wxssRes]: any[] = await Promise.all([
        request.get('/admin/miniapp/code/source-file', { params: { path: 'common/iconfont-font.js' } }),
        request.get('/admin/miniapp/code/source-file', { params: { path: 'app.wxss' } }),
      ])
      const js = jsRes.data?.content || ''
      const wxss = wxssRes.data?.content || ''
      const m = js.match(/iconfontBase64\s*=\s*"([^"]+)"/)
      if (!m) throw new Error('iconfontBase64 未找到')
      const iconRules = extractIconRules(wxss)
      if (!iconRules) throw new Error('app.wxss 中未提取到 icon 规则')

      const fontFace = `@font-face { font-family: 'iconfont'; src: url(data:font/woff;base64,${m[1]}) format('woff'); font-weight: normal; font-style: normal; }`
      const scoped = ICONFONT_SCOPES.map((scope) => compileWxss(iconRules, scope, 0.5)).join('\n')

      let el = document.getElementById('web-renderer-iconfont') as HTMLStyleElement | null
      if (!el) {
        el = document.createElement('style')
        el.id = 'web-renderer-iconfont'
        document.head.appendChild(el)
      }
      el.textContent = `${fontFace}\n${scoped}`
    } catch (e) {
      promise = null // 允许下次重试
      console.warn('[web-renderer] 真机 iconfont 注入失败，图标回退为文字/emoji', e)
    }
  })()
  return promise
}
