/**
 * WXSS → CSS 编译器：把小程序真实样式表转换为网页画布可用的 CSS。
 * - rpx 按画布比例换算（750rpx 全宽 → scale 系数）
 * - 剥离 uni-app 编译产物的 .data-v-xxx 作用域后缀
 * - 所有选择器加上画布作用域前缀，避免污染后台样式
 * - page/:root 选择器映射为作用域自身
 * - @keyframes / @media 内部不做选择器加前缀，但仍做 rpx 换算
 * - mapElements（可选，默认关）：wxml 元素选择器 view/text/image/scroll-view/block
 *   映射为 div/span/img/div/template→div（生成组件已做同名标签转换；默认关以
 *   保持首页等既有注入行为不变）
 */
const ELEMENT_SELECTOR_MAP: Record<string, string> = {
  view: 'div',
  text: 'span',
  image: 'img',
  'scroll-view': 'div',
  block: 'div',
}

export function compileWxss(wxss: string, scope: string, scale = 0.5, mapElements = false): string {
  // 去注释
  let css = String(wxss || '').replace(/\/\*[\s\S]*?\*\//g, '')

  // rpx → px（保留小数位，避免 0.5px 以下被浏览器吞掉）
  css = css.replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_, n) => {
    const v = Math.round(parseFloat(n) * scale * 100) / 100
    return `${v}px`
  })

  const out: string[] = []
  let i = 0
  const len = css.length

  const readBlock = (start: number): [string, number] => {
    let depth = 0
    for (let j = start; j < len; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') {
        depth--
        if (depth === 0) return [css.slice(start, j + 1), j + 1]
      }
    }
    return [css.slice(start), len]
  }

  const scopeSelector = (selector: string): string => {
    return selector
      .split(',')
      .map((raw) => {
        let s = raw.trim()
        if (!s) return ''
        // page / :root → 作用域自身
        if (s === 'page' || s === ':root') return scope
        // 剥离 .data-v-xxxx
        s = s.replace(/\.data-v-[a-z0-9]+/gi, '')
        // wxml 元素选择器 → 转换后的 HTML 标签（仅元素位置，不误伤 .class 与命名中包含关键字的类）
        if (mapElements) {
          s = s.replace(/(^|[\s>+~])(view|text|image|scroll-view|block)(?=[\s>+~.,:#[]|$)/g, (_m, pre, t) => `${pre}${ELEMENT_SELECTOR_MAP[t] || t}`)
        }
        return `${scope} ${s}`
      })
      .filter(Boolean)
      .join(', ')
  }

  while (i < len) {
    // 找到下一个 '{'
    const brace = css.indexOf('{', i)
    if (brace < 0) break
    const header = css.slice(i, brace).trim()
    const [block, next] = readBlock(brace)
    i = next

    const body = block.slice(1, -1)

    if (header.startsWith('@keyframes')) {
      // 动画内部按原样保留
      out.push(`${header} {${body}}`)
      continue
    }
    if (header.startsWith('@media') || header.startsWith('@supports')) {
      // 媒体查询：递归处理内部规则（简化：对内部再做一次选择器加前缀）
      const inner = compileWxss(body, scope, 1, mapElements)
      out.push(`${header} {${inner}}`)
      continue
    }
    if (header.startsWith('@')) {
      out.push(`${header} {${body}}`)
      continue
    }
    // 普通规则
    out.push(`${scopeSelector(header)} {${body}}`)
  }
  return out.join('\n')
}

/** 从后端读取小程序源文件并编译为画布 CSS */
export async function loadRealWxss(
  fetcher: (path: string) => Promise<string>,
  files: Array<{ path: string; scope: string; scale?: number }>,
): Promise<string> {
  const parts: string[] = []
  for (const f of files) {
    try {
      const content = await fetcher(f.path)
      parts.push(compileWxss(content, f.scope, f.scale ?? 0.5))
    } catch {
      // 单个文件失败不阻塞整体
    }
  }
  return parts.join('\n')
}
