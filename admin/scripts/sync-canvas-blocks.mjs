#!/usr/bin/env node
/**
 * sync-canvas-blocks.mjs
 *
 * 把真实小程序（uni-app 编译产物）各页面 WXML 中「结构相对静态」的区块
 * 同步为编辑器画布用的 Vue 单文件组件（多页可配置转换）：
 *
 *   输入:  $MINIAPP_SOURCE_DIR 下各页 wxml（默认 /Users/nianbaidediannao/Desktop/前端文件）
 *   输出:  admin/src/views/miniapp/editor/generated/Real*.vue
 *
 * 页面与区块：
 *  - 首页   components/DynamicHomeContent.wxml
 *           → RealHeroBlock.vue（campus-hero）/ RealKingkongBlock.vue（campus-menu-card）
 *  - 消息页 pages/tabbar/news/news.wxml
 *           → RealMessageHeader.vue（nav-header 导航栏）
 *             RealMessageTabs.vue（nav-buttons 小红书分段 / nav-tabs-container 文字 Tab）
 *             RealMessageNavCards.vue（系统消息导航卡片行 message-item/service-avatar）
 *             RealMessageChatRows.vue（会话行 message-item/title-wrapper/unread-badge）
 *  - 我的页 pages/tabbar/auth/PersonalHomepage.wxml
 *           → RealProfileNav.vue（nav-box 自定义导航）
 *             RealProfileUserCard.vue（user-box 用户卡）
 *             RealProfileGrowthCard.vue（image11-growth-card 成长等级卡）
 *             RealProfileStatsCard.vue（image11-stats-card 数据栏）
 *             RealProfileActionPanel.vue（image11-action-panel 服务卡 + 快捷宫格）
 *             RealProfileTabs.vue（bar-box 内容 Tab）
 *
 * 设计：
 *  1. 小型容错解析器把 WXML 解析成 AST，按 class 定位各区块子树（不整页转换；
 *     z-paging、xiaoyi-* 自定义组件、弹层、实时列表等动态区块不转换）。
 *  2. 清洗编译产物：剥离 wx:* / bind:* / catch* / u-i / u-s / u-r / u-p /
 *     data-v-* / hover-class 等 uni 注入属性与作用域 class；
 *     view/text/image → div/span/img；{{[...]}} 动态 class 转 :class 数组。
 *  3. {{ }} 绑定通过每页 FIELD_MAP 映射到编辑器现有数据字段。
 *  4. wx:if / wx:elif / wx:else 链 → v-if / v-else-if / v-else；映射为 'true'
 *     的条件省略、映射为 'false' 的节点丢弃（链头被丢弃时后续 elif/else 自动
 *     提升为新的链头）。
 *  5. 编辑锚点（与真机结构的**有意差异**，在此集中声明）：
 *     通用：
 *     - txtIcon icon-* 图标节点：class 原样保留，内容填 emoji 占位字形
 *       （画布不加载小程序 iconfont）；
 *     - image 节点：src 走 resolveAsset、v-if 走 imgOk、@error 走 onImgError
 *       （失败回退与各编辑器一致）；
 *     - wx:for item：转 Vue 层 v-for（别名 / key 由 FOR_MAP 配置）；
 *     - style="{{...}}" 动态样式默认丢弃（主题变量由 .rte-page :style 提供），
 *       仅 STYLE_MAP 显式声明的保留；
 *     - xiaoyi-* / z-paging / page-renderer 等自定义组件节点丢弃（HTML 注释标记）。
 *     首页：
 *     - campus-hero-title / subtitle / 搜索占位文案：追加 ie 行内编辑锚点；
 *     - 金刚区无图回退用编辑器 MenuFallbackIcon（替代真机字母 campus-menu-letter）；
 *     - campus-template 的 style="{{templateStyle}}" 丢弃；campus-menu-card 的
 *       wx:if="{{hasMenu}}" 条件上提到 HomeEditor（空态走 EmptySlot）。
 *     消息页：
 *     - navcard 头像（avatar.service-avatar）：真机 txtIcon/iconfont 或 image
 *       二选一 → 画布 imgOk(card.icon) ? img : 关键字 emoji（iconText prop），
 *       背景色 :style="cardBg(card)"；行的 background-color 内联样式丢弃；
 *     - 会话行头像（xiaoyi-lazyload）→ img/字母占位；manager-badge 丢弃；
 *     - 未读徽标 unread-badge / 状态标签 status-tag 结构保留，数据走 chats prop
 *       （会话为登录用户实时数据，画布传示例数据做结构预览）；
 *     - tab 选中态（tabItem.o / tab.b）映射为 i === 0（画布固定预览首个选中）；
 *     - nav-tabs / nav-buttons 的 sticky 动态 style（{{h}}/{{i}}/{{j}}）丢弃；
 *     - 空列表提示（p-empty）为画布追加节点（真机由空态页承担）。
 *     我的页：
 *     - profile-visual-image：v-if 合并 visual.enabled && imgOk(visual.image)，
 *       追加 v-else-if 的 profile-visual-empty 占位（编辑器配置提示）；
 *     - 头像 xiaoyi-lazy-image → avatar-letter 占位字形（用户数据只读）；
 *     - add-icon / status-badge / title-img / region-tip / 性别 / 年龄 / 星座 /
 *       uid-tag 等真机动态节点映射为 'false' 丢弃；
 *     - user-btn 出现两次（user-top 默认布局 / user-bottom-container 小红书布局），
 *       按 !isXhs / isXhs 映射（真机为运行时布局标志，画布按布局配置预览）；
 *     - 成长卡 next-line 的 block if/elif（配置不完整/已满级）映射为 'false'，
 *       else 分支提升为无条件文本；进度条 width 固定 40%（STYLE_MAP）；
 *     - 快捷宫格 txtIcon {{item.icon}} → 首字母占位（iconfont 不可用）；
 *     - bar-text 选中态真机走内联 style（颜色/字号）→ 画布 .bar-text.active；
 *     - bar-line opacity 内联 → :style="{ opacity: i === 0 ? 1 : 0 }"；
 *     - content-box 内 user-posts-list / my-comment-list 自定义组件不转换
 *       （编辑器保留手抄 posts 预览）；profileLayoutItems 功能入口卡片真机由
 *       layout-item-popup / 动态注入渲染，本页 wxml 无静态对应——画布侧已并入
 *       image11-action-panel 的服务卡片行（serviceCards prop，ProfileEditor 传入）；
 *     - profile-drawer-menu（侧边栏）为自定义组件，编辑器保留配置预览块。
 *
 * 幂等：重跑直接覆盖 generated/ 下产物。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ADMIN_ROOT = join(__dirname, '..')
const SOURCE_DIR = process.env.MINIAPP_SOURCE_DIR || '/Users/nianbaidediannao/Desktop/前端文件'
const OUT_DIR = join(ADMIN_ROOT, 'src/views/miniapp/editor/generated')

const TAG_MAP = { view: 'div', text: 'span', image: 'img', 'scroll-view': 'div', block: 'template' }

/** uni 注入 / 小程序专有属性，一律剥离 */
const STRIP_ATTR_RE = /^(wx:|bind:?|catch|mut-bind|capture-bind|capture-catch|u-i|u-s|u-r|u-p|data-v-|placeholder-class|confirm-type|maxlength|mode|show-scrollbar|scroll-y|cursor-spacing|adjust-position|hover-)/

// ============ 1. WXML → AST（容错解析器） ============
function parseWxml(src) {
  const root = { tag: '#root', attrs: {}, children: [] }
  const stack = [root]
  let i = 0
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i)
      i = end < 0 ? src.length : end + 3
      continue
    }
    if (src[i] === '<') {
      if (src[i + 1] === '/') {
        const end = src.indexOf('>', i)
        if (end < 0) throw new Error(`WXML 解析失败：未闭合的闭合标签 @${i}`)
        stack.pop()
        i = end + 1
        continue
      }
      let j = i + 1
      while (j < src.length && /[\w:-]/.test(src[j])) j++
      const tag = src.slice(i + 1, j)
      const attrs = {}
      let selfClose = false
      while (j < src.length) {
        while (j < src.length && /\s/.test(src[j])) j++
        if (src.startsWith('/>', j)) { selfClose = true; j += 2; break }
        if (src[j] === '>') { j++; break }
        let k = j
        while (k < src.length && !/[\s=>/]/.test(src[k])) k++
        const name = src.slice(j, k)
        j = k
        while (j < src.length && /\s/.test(src[j])) j++
        if (src[j] === '=') {
          j++
          while (j < src.length && /\s/.test(src[j])) j++
          const q = src[j]
          const end = src.indexOf(q, j + 1)
          if (end < 0) throw new Error(`WXML 解析失败：属性 ${name} 引号未闭合`)
          attrs[name] = src.slice(j + 1, end)
          j = end + 1
        } else if (name) {
          attrs[name] = true
        }
      }
      const node = { tag, attrs, children: [] }
      stack[stack.length - 1].children.push(node)
      if (!selfClose) stack.push(node)
      i = j
    } else {
      let j = i
      while (j < src.length && src[j] !== '<') j++
      const text = src.slice(i, j).trim()
      if (text) stack[stack.length - 1].children.push({ tag: '#text', text })
      i = j
    }
  }
  return root
}

function classTokens(node) {
  return String(node.attrs?.class || '').split(/\s+/).filter(Boolean)
}
function hasClass(node, cls) {
  return classTokens(node).includes(cls)
}
/** class 属性原文包含某 token（兼容 {{[...]}} 动态 class） */
function classRawHas(node, cls) {
  return String(node.attrs?.class || '').includes(cls)
}
/** 深度优先按 class 定位节点 */
function findByClass(node, cls) {
  if (node.tag !== '#text' && classRawHas(node, cls)) return node
  for (const c of node.children || []) {
    const hit = findByClass(c, cls)
    if (hit) return hit
  }
  return null
}

// ============ 2. 清洗：绑定 / class / 属性 ============
/** {{x}} → 映射后的 Vue 表达式；非绑定原样返回 null */
function mapBinding(raw, ctx) {
  const m = /^\{\{(.+)\}\}$/.exec(String(raw).trim())
  if (!m) return null
  const key = m[1].trim()
  return ctx.fieldMap[key] ?? key
}

/** 任意表达式片段 → 映射（供 class 数组项使用） */
function mapExpr(expr, ctx) {
  const key = String(expr).trim()
  return ctx.fieldMap[key] ?? key
}

/** 文本内容中的 {{x}} 片段 → Vue 插值 */
function mapText(text, ctx) {
  return text.replace(/\{\{(.+?)\}\}/g, (_, expr) => `{{ ${mapExpr(expr, ctx)} }}`)
}

/**
 * class 属性 → { static: [], dynamic: [] }
 * 支持三种形态：纯静态、`{{['a', cond && 'b', expr]}}、`a {{expr}} b` 混合。
 * 表达式经 FIELD_MAP 映射；映射为 'true' → 静态 class，'false' / "''" → 丢弃。
 */
function parseClassAttr(node, ctx) {
  const raw = String(node.attrs?.class || '')
  const statics = []
  const dynamics = []
  const pushDynamic = (expr, cls) => {
    const mapped = mapExpr(expr, ctx)
    if (mapped === 'false' || mapped === "''" || mapped === '""') return
    if (mapped === 'true') { if (cls) statics.push(cls); return }
    dynamics.push(cls ? `${mapped} && '${cls}'` : mapped)
  }
  const arr = /^\{\{\[([\s\S]*)\]\}\}$/.exec(raw.trim())
  if (arr) {
    for (const part of arr[1].split(',')) {
      const item = part.trim()
      if (!item) continue
      const quoted = /^'([^']*)'$/.exec(item)
      if (quoted) {
        if (quoted[1] && !quoted[1].startsWith('data-v-')) statics.push(quoted[1])
        continue
      }
      const cond = /^([\s\S]*?)\s*&&\s*'([^']+)'$/.exec(item)
      if (cond) pushDynamic(cond[1], cond[2])
      else pushDynamic(item, null)
    }
  } else {
    for (const token of raw.split(/\s+/).filter(Boolean)) {
      const bind = /^\{\{([\s\S]+)\}\}$/.exec(token)
      if (bind) pushDynamic(bind[1], null)
      else if (!token.startsWith('data-v-')) statics.push(token)
    }
  }
  return { statics, dynamics }
}

// ============ 3. AST → Vue 模板 ============
const pad = (n) => '  '.repeat(n)

/** 渲染子节点序列：处理 wx:if / wx:elif / wx:else 链 */
function renderKids(kids, indent, ctx) {
  const out = []
  let chainOpen = false // 前一个渲染的兄弟携带 v-if / v-else-if
  let chainDropped = false // 当前链头因映射 'false' 被丢弃，后续 elif/else 需提升
  for (const node of kids) {
    if (node.tag === '#text') {
      out.push(renderNode(node, indent, ctx, null))
      chainOpen = false
      chainDropped = false
      continue
    }
    const hasIf = node.attrs?.['wx:if'] !== undefined
    const hasElif = node.attrs?.['wx:elif'] !== undefined
    const hasElse = node.attrs?.['wx:else'] !== undefined
    if (hasIf) {
      const cond = mapBinding(node.attrs['wx:if'], ctx)
      if (cond === 'false') { chainDropped = true; chainOpen = false; continue }
      out.push(renderNode(node, indent, ctx, cond === 'true' ? null : `v-if="${cond}"`))
      chainOpen = true
      chainDropped = false
      continue
    }
    if (hasElif) {
      const cond = mapBinding(node.attrs['wx:elif'], ctx)
      if (chainOpen) {
        // 正常链中：映射 'false' 的中间分支丢弃（后续 else 仍挂在前置 v-if 上）
        if (cond === 'false') continue
        if (cond === 'true') {
          out.push(renderNode(node, indent, ctx, 'v-else'))
          chainOpen = false
        } else {
          out.push(renderNode(node, indent, ctx, `v-else-if="${cond}"`))
          chainOpen = true
        }
      } else {
        // 链头已被丢弃：elif 提升为新链头
        if (cond === 'false') continue
        out.push(renderNode(node, indent, ctx, cond === 'true' ? null : `v-if="${cond}"`))
        chainOpen = true
        chainDropped = false
      }
      continue
    }
    if (hasElse) {
      if (chainOpen) out.push(renderNode(node, indent, ctx, 'v-else'))
      else out.push(renderNode(node, indent, ctx, null)) // 链头丢弃：else 提升为无条件
      chainOpen = false
      chainDropped = false
      continue
    }
    chainOpen = false
    chainDropped = false
    out.push(renderNode(node, indent, ctx, null))
  }
  return out.filter(Boolean)
}

function renderNode(node, indent, ctx, directive) {
  // ---- 文本节点 ----
  if (node.tag === '#text') return `${pad(indent)}${mapText(node.text, ctx)}`

  // ---- 页面 / 区块锚点（有意差异，全在配置里声明） ----
  for (const anchor of ctx.anchors) {
    if (anchor.test(node, ctx)) return anchor.render(node, indent, ctx, directive)
  }

  // ---- 自定义组件（xiaoyi-* / z-paging / page-renderer 等）：丢弃，注释标记 ----
  if (!TAG_MAP[node.tag] && node.tag.includes('-')) {
    return `${pad(indent)}<!-- 省略自定义组件 <${node.tag}>（真机动态节点，见脚本头注释） -->`
  }

  const tag = TAG_MAP[node.tag] || node.tag
  const { statics, dynamics } = parseClassAttr(node, ctx)
  const attrs = []
  if (directive) attrs.push(directive)

  // ---- wx:for → Vue 层 v-for（别名 / key 由 FOR_MAP 配置） ----
  if (node.attrs['wx:for']) {
    const forKey = /^\{\{(.+)\}\}$/.exec(node.attrs['wx:for'].trim())?.[1]?.trim()
    const spec = ctx.forMap[forKey] || { alias: node.attrs['wx:for-item'] || 'item', expr: forKey, key: 'i' }
    attrs.push(`v-for="(${spec.alias}, i) in ${spec.expr}" :key="${spec.key || 'i'}"`)
    ctx.aliasStack.push(spec.alias)
  }

  if (statics.length) attrs.push(`class="${statics.join(' ')}"`)
  if (dynamics.length) attrs.push(`:class="[${dynamics.join(', ')}]"`)

  // ---- 图片：src 走 resolveAsset；v-if 走 imgOk（忽略通用 wx:if 指令） ----
  const srcBind = node.attrs.src !== undefined ? mapBinding(node.attrs.src, ctx) : null
  if (node.tag === 'image' && srcBind !== null) {
    const imgAttrs = attrs.filter((a) => !a.startsWith('v-if="') && a !== 'v-else' && !a.startsWith('v-else-if'))
    imgAttrs.push(`v-if="imgOk(${srcBind})"`)
    imgAttrs.push(`:src="resolveAsset(${srcBind})"`)
    imgAttrs.push('alt=""')
    imgAttrs.push('@error="onImgError"')
    if (node.attrs['wx:for']) ctx.aliasStack.pop()
    return `${pad(indent)}<img ${imgAttrs.join(' ')} />`
  }

  // ---- 其余属性：剥离 uni 注入；{{}} 绑定转 :attr ----
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name === 'class' || name === 'src') continue
    if (STRIP_ATTR_RE.test(name)) continue
    if (value === true) { attrs.push(name); continue }
    const bind = mapBinding(value, ctx)
    if (bind !== null) {
      if (name === 'style') {
        // 动态 style 默认丢弃；STYLE_MAP 显式声明的保留
        const rawExpr = /^\{\{([\s\S]+)\}\}$/.exec(String(value).trim())?.[1]?.trim()
        const mapped = rawExpr ? ctx.styleMap[rawExpr] : null
        if (mapped) attrs.push(`:style="${mapped}"`)
        continue
      }
      attrs.push(`:${name}="${bind}"`)
    } else {
      attrs.push(`${name}="${value}"`)
    }
  }

  // ---- txtIcon 图标：class 原样，填 emoji 占位字形 ----
  const iconToken = statics.find((t) => t.startsWith('icon-'))
  const glyph = iconToken ? (ctx.iconGlyph[iconToken] ?? '') : ''

  const open = `${pad(indent)}<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`
  const kids = node.children || []
  let inner = ''
  if (kids.length) {
    ctx.parentStack.push(node)
    inner = renderKids(kids, indent + 1, ctx).join('\n')
    ctx.parentStack.pop()
  }
  if (node.attrs['wx:for']) ctx.aliasStack.pop()

  // block / template 且无指令：解包只渲染子节点
  if (node.tag === 'block' && !directive) return inner

  if (!inner && !glyph) {
    const voidOk = ['img', 'input', 'br'].includes(tag)
    return voidOk ? `${open} />` : `${open}></${tag}>`
  }
  if (glyph) return `${open}>${glyph}</${tag}>`
  return `${open}>\n${inner}\n${pad(indent)}</${tag}>`
}

// ============ 4. 锚点辅助 ============
/** 行内编辑锚点（文字节点，与 HomeEditor 的 beginInline/commitInline 协议一致） */
function renderEditableSpan(cls, key, expr, applyCode, dirtyKey, multiline, indent) {
  const p = pad(indent)
  return [
    `${p}<span`,
    `${p}  class="${cls} ie"`,
    `${p}  :class="{ 'ie-on': inlineKey === '${key}' }"`,
    `${p}  :contenteditable="inlineKey === '${key}'"`,
    `${p}  @click.stop="beginInline('${key}', (v: string) => { ${applyCode} }, '${dirtyKey}'${multiline ? ', true' : ''})"`,
    `${p}  @blur="commitInline"`,
    `${p}  @keydown="inlineKeydown"`,
    `${p}  @paste="inlinePaste"`,
    `${p}>{{ ${expr} }}</span>`,
  ].join('\n')
}

/** 在 AST 子树中查找并就地修改（注入画布专用空态节点等） */
function injectChild(parent, child) {
  parent.children.push(child)
}

// ============ 5. 页面配置 ============
const PAGES = [
  // ================= 首页 =================
  {
    key: 'home',
    wxml: 'components/DynamicHomeContent.wxml',
    fieldMap: {
      regionName: "region?.name || '加载中…'",
      heroTitle: "hero.title || '今天想在校园里\\n干点啥？'",
      heroSubtitle: "hero.subtitle || '发现校园美好生活'",
      searchPlaceholder: "hero.search_placeholder || '搜索校园生活'",
      mascotImage: 'hero.mascot_image',
      searchKeyword: "''",
      regionSwitchSupported: 'true',
      hasMenu: 'items.length',
      'item.image': 'm.icon',
      'item.title': 'm.name',
      'item.subtitle': 'm.subtitle',
      'item.shortTitle': "(m.name || '').slice(0, 1)",
      'item.hasSubtitle': 'm.subtitle',
    },
    forMap: {
      menuItems: { alias: 'm', expr: 'items', key: 'i' },
    },
    styleMap: {},
    iconGlyph: {
      'icon-dingwei': '📍',
      'icon-arrow-down': '▼',
      'icon-search-1-copy': '🔍',
      'icon-arrow-right': '›',
      'icon-guanbi': '✕',
    },
    anchors: [
      {
        test: (n) => hasClass(n, 'campus-hero-title'),
        render: (n, indent, ctx) =>
          renderEditableSpan('campus-hero-title', 'hero-title', ctx.fieldMap.heroTitle, 'hero.title = v', 'hero', true, indent),
      },
      {
        test: (n) => hasClass(n, 'campus-hero-subtitle'),
        render: (n, indent, ctx) =>
          renderEditableSpan('campus-hero-subtitle', 'hero-subtitle', ctx.fieldMap.heroSubtitle, 'hero.subtitle = v', 'hero', false, indent),
      },
      {
        test: (n) => n.tag === 'input' && hasClass(n, 'campus-search-input'),
        render: (n, indent, ctx) =>
          renderEditableSpan('campus-search-placeholder', 'hero-search', ctx.fieldMap.searchPlaceholder, 'hero.search_placeholder = v', 'hero', false, indent),
      },
      {
        test: (n) => hasClass(n, 'campus-menu-letter') && n.attrs['wx:else'] !== undefined,
        render: (n, indent) => `${pad(indent)}<MenuFallbackIcon v-else :name="m.name" :path="m.path || ''" />`,
      },
    ],
    blocks: [
      {
        out: 'RealHeroBlock.vue',
        build(ast, ctx) {
          const templateNodeWxml = findByClass(ast, 'campus-template')
          const heroNode = findByClass(ast, 'campus-hero')
          if (!templateNodeWxml || !heroNode) throw new Error('未能在 WXML 中定位 campus-template / campus-hero')
          // campus-template 壳 + campus-hero 子树（弹层 / 金刚区 / gift banner 不属于本区块）
          const shell = { tag: 'view', attrs: { class: classTokens(templateNodeWxml).filter((t) => !t.startsWith('data-v-')).join(' ') }, children: [heroNode] }
          return {
            template: renderNode(shell, 1, ctx, null),
            comment: [
              '// 结构 / class 与 components/DynamicHomeContent.wxml 的 campus-hero 子树同源；',
              '// 锚点差异（ie 行内编辑、图标 emoji 占位、图片 resolveAsset/imgOk 回退）见脚本头注释。',
            ],
            imports: [],
            props: `{
  hero: any
  region: any
  inlineKey: string
  resolveAsset: (v: string) => string
  imgOk: (v: string) => boolean
  beginInline: (key: string, apply: (v: string) => void, dirtyKey: string, multiline?: boolean) => void
  commitInline: () => void
  inlineKeydown: (e: KeyboardEvent) => void
  inlinePaste: (e: ClipboardEvent) => void
  onImgError: (e: Event) => void
}`,
          }
        },
      },
      {
        out: 'RealKingkongBlock.vue',
        build(ast, ctx) {
          const menuNode = findByClass(ast, 'campus-menu-card')
          if (!menuNode) throw new Error('未能在 WXML 中定位 campus-menu-card')
          // wx:if="{{hasMenu}}" 条件上提到 HomeEditor（空态走 EmptySlot）
          const menuClean = { ...menuNode, attrs: { ...menuNode.attrs } }
          delete menuClean.attrs['wx:if']
          return {
            template: renderNode(menuClean, 1, ctx, null),
            comment: [
              '// 结构 / class 与 components/DynamicHomeContent.wxml 的 campus-menu-card 子树同源；',
              '// 真机 wx:for 的 item 模板已转为 Vue 层 v-for；无图回退用编辑器 MenuFallbackIcon。',
            ],
            imports: ["import MenuFallbackIcon from '@/views/miniapp/editor/MenuFallbackIcon.vue'"],
            props: `{
  items: any[]
  resolveAsset: (v: string) => string
  imgOk: (v: string) => boolean
  onImgError: (e: Event) => void
}`,
          }
        },
      },
    ],
  },

  // ================= 消息页 =================
  {
    key: 'message',
    wxml: 'pages/tabbar/news/news.wxml',
    fieldMap: {
      // 布局切换 / Tab
      e: 'isXhs',
      'tabItem.o': 'i === 0',
      'tabItem.k': 'true',
      'tabItem.j': 't.name',
      'tabItem.l': 't.badge',
      'tabItem.m': 't.badge',
      'tab.a': 't.name',
      'tab.b': 'i === 0',
      'tab.d': 't.badge',
      'tab.e': 't.badge',
      // 画布注入的空态
      __xhsEmpty: '!xhsTabs.length',
      __tabsEmpty: '!tabs.length',
      // 系统消息导航卡片
      'card.f': "card.title || '未命名卡片'",
      'card.j': "card.time || ''",
      'card.n': "card.subtitle || '暂无副标题'",
      // 会话行
      'chat.x': 'chat.manager',
      'chat.c': 'false',
      'chat.f': 'chat.manager',
      'chat.e': "chat.name || '会话'",
      'chat.B': 'chat.officialTag',
      'chat.g': 'false',
      'chat.h': 'chat.unread',
      'chat.i': 'chat.unread',
      'chat.j': 'chat.time',
      'chat.l': 'chat.manager',
      'chat.k': 'chat.time',
      'chat.m': 'chat.groupStatus',
      'chat.p': 'chat.manager',
      'chat.n': 'chat.members',
      'chat.o': 'chat.online',
      'chat.q': 'chat.statusTag',
      'chat.r': 'chat.statusTone',
      'chat.s': "''",
      'chat.t': "chat.text || ''",
      'chat.v': 'false',
    },
    forMap: {
      f: { alias: 't', expr: 'xhsTabs', key: 't.key || i' },
      g: { alias: 't', expr: 'tabs', key: 't.key || i' },
      n: { alias: 'card', expr: 'cards', key: 'card.id || i' },
      o: { alias: 'chat', expr: 'chats', key: 'i' },
    },
    styleMap: {},
    iconGlyph: {
      'icon-qingli': '🧹',
      'icon-search-1-copy': '🔍',
    },
    anchors: [
      {
        // navcard 头像：真机 txtIcon/iconfont 或 image 二选一 → imgOk ? img : 关键字 emoji
        test: (n) => n.tag === 'view' && hasClass(n, 'avatar') && hasClass(n, 'service-avatar'),
        render: (n, indent) => {
          const p = pad(indent)
          return [
            `${p}<div class="avatar service-avatar" :style="cardBg(card)">`,
            `${p}  <img v-if="imgOk(card.icon)" class="nav-icon-image" :src="resolveAsset(card.icon)" alt="" @error="onImgError" />`,
            `${p}  <span v-else class="txtIcon service-icon-text">{{ iconText(card) }}</span>`,
            `${p}</div>`,
          ].join('\n')
        },
      },
      {
        // 会话行头像：xiaoyi-lazyload → img / 字母占位（manager-badge 一并省略）
        test: (n) => n.tag === 'view' && classRawHas(n, "'avatar'") && !classRawHas(n, 'service-avatar'),
        render: (n, indent) => {
          const p = pad(indent)
          return [
            `${p}<div class="avatar" :class="[chat.manager && 'manager-avatar']">`,
            `${p}  <img v-if="imgOk(chat.avatar)" class="chat-avatar-img" :src="resolveAsset(chat.avatar)" alt="" @error="onImgError" />`,
            `${p}  <span v-else class="avatar-letter">{{ (chat.name || '友').slice(0, 1) }}</span>`,
            `${p}</div>`,
          ].join('\n')
        },
      },
    ],
    blocks: [
      {
        out: 'RealMessageHeader.vue',
        build(ast, ctx) {
          const node = findByClass(ast, 'nav-header')
          if (!node) throw new Error('未能在 news.wxml 中定位 nav-header')
          return {
            template: renderNode(node, 1, ctx, null),
            comment: [
              '// 结构 / class 与 pages/tabbar/news/news.wxml 的 nav-header 子树同源（xiaoyi-navbar 壳省略）；',
              '// 图标为 emoji 占位（真机 iconfont），文案静态（布局/私信开关在右侧面板编辑）。',
            ],
            imports: [],
            props: null,
            css: `/* 关键布局回退：真机 news.wxss 注入失败时保证不白屏（注入后真机样式覆盖此处） */
.rte-page .nav-header { display: flex; width: 100%; box-sizing: border-box; margin-left: 4px; padding: 8px 12px 6px; align-items: center; justify-content: space-between; }
.rte-page .message-nav-title-group { display: flex; align-items: center; min-width: 0; flex-shrink: 0; }
.rte-page .message-nav-actions { display: flex; align-items: center; margin-left: auto; }
.rte-page .nav-title { font-size: var(--fs-headline, 17px); font-weight: 700; color: var(--text-primary, #1d271f); }
.rte-page .clear-icon { width: 20px; height: 20px; padding: 12px; box-sizing: content-box; background-clip: content-box; margin-left: 4px; background-color: var(--bg-page, #f4f7f1); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.rte-page .clear-icon .txtIcon { font-size: 18px; line-height: 20px; color: var(--text-secondary, #55604f); }
.rte-page .message-nav-search { display: flex; align-items: center; justify-content: center; height: 32px; min-width: 71px; padding: 0 12px; border-radius: var(--radius-pill, 999px); background: var(--bg-fill, #f0f4ec); box-sizing: border-box; }
.rte-page .message-nav-search-icon { margin-right: 4px; font-size: 15px; color: var(--text-tertiary, #8a9384); }
.rte-page .message-nav-search-text { font-size: var(--fs-body-s, 13px); color: var(--text-secondary, #55604f); font-weight: 500; line-height: 1; }`,
          }
        },
      },
      {
        out: 'RealMessageTabs.vue',
        build(ast, ctx) {
          const buttons = findByClass(ast, 'nav-buttons')
          const tabsBox = findByClass(ast, 'nav-tabs-container')
          if (!buttons || !tabsBox) throw new Error('未能在 news.wxml 中定位 nav-buttons / nav-tabs-container')
          // 注入画布空态提示（真机由空态页承担）
          injectChild(buttons, { tag: 'view', attrs: { class: 'p-empty', 'wx:if': '{{__xhsEmpty}}' }, children: [{ tag: '#text', text: '所有分类均已隐藏，点击编辑开启' }] })
          const navTabs = findByClass(tabsBox, 'nav-tabs')
          if (navTabs) injectChild(navTabs, { tag: 'view', attrs: { class: 'p-empty', 'wx:if': '{{__tabsEmpty}}' }, children: [{ tag: '#text', text: '主分类已隐藏，点击编辑开启' }] })
          // nav-buttons（wx:if）+ nav-tabs-container（wx:else）作为兄弟链渲染
          const template = renderKids([buttons, tabsBox], 1, ctx).join('\n')
          return {
            template,
            comment: [
              '// 结构 / class 与 pages/tabbar/news/news.wxml 的 nav-buttons / nav-tabs-container 同源；',
              '// tab 选中态固定预览第一项（i === 0）；sticky 动态 style 丢弃；空态提示为画布注入节点。',
            ],
            imports: [],
            props: `{
  isXhs: boolean
  tabs: any[]
  xhsTabs: any[]
}`,
            css: `/* 关键布局回退 + 画布注入的 p-empty */
.rte-page .nav-tabs-container { position: relative; width: 100%; min-height: 40px; }
.rte-page .nav-tabs { display: flex; padding: 10px; gap: 10px; background-color: var(--bg-card, #fff); width: 100%; box-sizing: border-box; }
.rte-page .tab-wrapper { position: relative; display: inline-block; }
.rte-page .tab { font-size: var(--fs-caption, 11px); color: var(--text-primary, #1d271f); padding: 10px 16px; border-radius: var(--radius-xl, 10px); font-weight: 700; background-color: var(--bg-page, #f4f7f1); }
.rte-page .tab.active { color: var(--text-inverse, #fff); background-color: var(--brand, #36a853); }
.rte-page .nav-buttons { display: flex; justify-content: space-between; gap: 2px; margin: 8px 12px; padding: 4px; border: 0.5px solid var(--line-hairline, #e4e9e0); border-radius: var(--radius-l, 12px); background: var(--bg-card, #fff); box-shadow: 0 2px 8px rgba(38, 58, 32, .06); }
.rte-page .nav-button { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; flex: 1; min-width: 0; min-height: 34px; padding: 0 2px; border-radius: var(--radius-m, 8px); }
.rte-page .nav-button.active { background: var(--brand-bg, #e8f3e4); }
.rte-page .button-content { display: flex; flex-direction: column; align-items: center; width: 100%; justify-content: center; }
.rte-page .button-text { max-width: 64px; margin: 0; color: var(--text-secondary, #55604f); font-size: var(--fs-body-s, 13px); line-height: 34px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rte-page .nav-button.active .button-text { color: var(--brand-deep, #2e7e3a); }
.rte-page .p-empty { padding: 22px 0; text-align: center; color: var(--text-tertiary, #8a9384); font-size: 12px; width: 100%; }`,
          }
        },
      },
      {
        out: 'RealMessageNavCards.vue',
        build(ast, ctx) {
          // 定位 wx:for="{{n}}" 的 navcard message-item 模板
          const list = findByClass(ast, 'chat-list')
          if (!list) throw new Error('未能在 news.wxml 中定位 message-list chat-list')
          const row = (list.children || []).find((c) => c.attrs?.['wx:for'] === '{{n}}')
          if (!row) throw new Error('未能在 news.wxml 中定位 navcard message-item（wx:for n）')
          return {
            template: renderNode(row, 1, ctx, null),
            comment: [
              '// 结构 / class 与 pages/tabbar/news/news.wxml 的 navcard message-item（系统消息导航卡片行）同源；',
              '// 头像：imgOk(card.icon) ? img : 关键字 emoji（iconText prop），背景色 cardBg；',
              '// 真机 title/time/text 的内联字号字色 style 与行背景色 style 丢弃（走 news.wxss 同源样式）。',
            ],
            imports: [],
            props: `{
  cards: any[]
  resolveAsset: (v: string) => string
  imgOk: (v: string) => boolean
  onImgError: (e: Event) => void
  iconText: (card: any) => string
  cardBg: (card: any) => any
}`,
            css: `/* 关键布局回退 + 图标占位字形 */
.rte-page .message-item { display: flex; align-items: center; margin-top: 4px; padding: 10px; position: relative; border-radius: var(--radius-m, 8px); margin-bottom: 4px; }
.rte-page .avatar { margin-right: 10px; width: 40px; height: 40px; flex-shrink: 0; position: relative; }
.rte-page .service-avatar { background: var(--bg-page, #f4f7f1); border-radius: var(--radius-m, 8px); margin-right: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.rte-page .service-avatar .service-icon-text { font-size: 20px; color: var(--text-primary, #1d271f); }
.rte-page .nav-icon-image { width: 100%; height: 100%; border-radius: var(--radius-m, 8px); object-fit: contain; }
.rte-page .message-content { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.rte-page .message-info { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; }
.rte-page .message-info .message-time { font-size: var(--fs-caption, 11px); color: var(--text-tertiary, #8a9384); flex-shrink: 0; margin-left: 6px; line-height: 1; margin-bottom: 2px; }
.rte-page .message-title { font-size: var(--fs-body, 15px); color: var(--text-primary, #1d271f); font-weight: 700; margin-right: 4px; }
.rte-page .message-text { font-size: var(--fs-body-s, 13px); color: var(--text-tertiary, #8a9384); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }`,
          }
        },
      },
      {
        out: 'RealMessageChatRows.vue',
        build(ast, ctx) {
          const list = findByClass(ast, 'chat-list')
          if (!list) throw new Error('未能在 news.wxml 中定位 message-list chat-list')
          const row = (list.children || []).find((c) => c.attrs?.['wx:for'] === '{{o}}')
          if (!row) throw new Error('未能在 news.wxml 中定位会话 message-item（wx:for o）')
          return {
            template: renderNode(row, 1, ctx, null),
            comment: [
              '// 结构 / class 与 pages/tabbar/news/news.wxml 的会话 message-item 同源；',
              '// 未读徽标 unread-badge / 群状态 status-tag / 时间 message-time 结构保留；',
              '// 会话为登录用户实时数据，画布由 MessageEditor 传入示例数据（chats prop）做结构预览；',
              '// 头像 xiaoyi-lazyload → img/字母占位；manager-badge / manager-tag 装饰节点省略。',
            ],
            imports: [],
            props: `{
  chats: any[]
  resolveAsset: (v: string) => string
  imgOk: (v: string) => boolean
  onImgError: (e: Event) => void
}`,
            css: `/* 关键布局回退 + 头像占位 */
.rte-page .message-item { display: flex; align-items: center; margin-top: 4px; padding: 10px; position: relative; border-radius: var(--radius-m, 8px); margin-bottom: 4px; }
.rte-page .avatar { margin-right: 10px; width: 40px; height: 40px; flex-shrink: 0; position: relative; }
.rte-page .avatar .chat-avatar-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.rte-page .avatar .avatar-letter { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; background: var(--brand-bg, #e8f3e4); color: var(--brand, #36a853); font-size: 15px; font-weight: 700; }
.rte-page .message-content { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.rte-page .message-info { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; }
.rte-page .title-wrapper { display: flex; align-items: center; flex: 1; min-width: 0; }
.rte-page .message-title { font-size: var(--fs-body, 15px); color: var(--text-primary, #1d271f); font-weight: 700; margin-right: 4px; }
.rte-page .message-time { font-size: var(--fs-caption, 11px); color: var(--text-tertiary, #8a9384); flex-shrink: 0; margin-left: 6px; }
.rte-page .message-preview { display: flex; align-items: center; margin-top: 2px; min-width: 0; }
.rte-page .message-text { font-size: var(--fs-body-s, 13px); color: var(--text-tertiary, #8a9384); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.rte-page .unread-badge { flex-shrink: 0; min-width: 16px; height: 16px; padding: 0 4px; margin-left: 6px; border-radius: 999px; background: var(--danger, #e5534b); color: #fff; font-size: 10px; line-height: 16px; text-align: center; box-sizing: border-box; }
.rte-page .status-tag { flex-shrink: 0; color: var(--text-tertiary, #8a9384); font-size: var(--fs-body-s, 13px); }
.rte-page .official-chat-tag { flex-shrink: 0; margin-left: 4px; padding: 0 4px; border-radius: 4px; background: var(--brand-bg, #e8f3e4); color: var(--brand-deep, #2e7e3a); font-size: 9px; line-height: 14px; }`,
          }
        },
      },
    ],
  },

  // ================= 我的页 =================
  {
    key: 'profile',
    wxml: 'pages/tabbar/auth/PersonalHomepage.wxml',
    fieldMap: {
      // 自定义导航
      c: "''",
      d: "region?.name || '我的'",
      e: 'false',
      // 用户卡
      aA: 'isXhs',
      'profileVisual.enabled && profileVisual.image': 'visual.enabled',
      'profileVisual.image': 'visual.image',
      l: 'false',
      m: 'false',
      o: 'false',
      q: 'isXhs',
      r: "'用户昵称'",
      s: 'false',
      w: 'false',
      B: "'100001'",
      C: "region?.name || '区域'",
      D: 'false',
      I: '!isXhs',
      L: '!isXhs',
      M: "'用户昵称'",
      N: 'false',
      Q: 'false',
      V: "'这个人很懒，还没有填写简介'",
      am: '!isXhs',
      X: 'false',
      aa: 'false',
      ac: 'false',
      ag: "'未知'",
      ah: 'false',
      aj: 'true',
      ak: "region?.name || '区域'",
      az: 'isXhs',
      ao: "'0'",
      aq: "'0'",
      as: "'0'",
      aw: 'isXhs',
      // 成长等级卡
      bt: 'true',
      bu: 'false',
      bw: "'1'",
      bz: "'校园新星'",
      bF: "'40'",
      bG: "'100'",
      '!bK && !growthConfigIncomplete': 'true',
      growthConfigIncomplete: 'false',
      bK: 'false',
      bJ: "'60'",
      bL: "'Lv.2'",
      // 数据栏
      bU: "'0'",
      // 快捷宫格
      'item.tone': "(it.tone || 'green')",
      'item.icon': "''",
      'item.title': 'it.title',
      'item.key': 'it.key',
      __quickEmpty: '!items.length',
      // 内容 Tab
      'item.a': 't',
    },
    forMap: {
      profileQuickActions: { alias: 'it', expr: 'items', key: 'it.key || i' },
      aI: { alias: 't', expr: 'tabs', key: 'i' },
    },
    styleMap: {
      "'width:' + bI": "{ width: '40%' }",
      "'opacity:' + item.d": '{ opacity: i === 0 ? 1 : 0 }',
    },
    iconGlyph: {
      'icon-youjiantou': '›',
      'icon-eye': '👀',
      'icon-dingdan2': '📦',
      'icon-bill': '💰',
    },
    anchors: [
      {
        // 主视觉：v-if 合并开关 + 图片可用性；追加「待配置」占位（编辑器配置提示）
        test: (n) => hasClass(n, 'profile-visual-image'),
        render: (n, indent) => {
          const p = pad(indent)
          return [
            `${p}<img v-if="visual.enabled && imgOk(visual.image)" class="profile-visual-image" :src="resolveAsset(visual.image)" alt="" @error="onImgError" />`,
            `${p}<div v-else-if="visual.enabled" class="profile-visual-empty">主视觉<br />待配置</div>`,
          ].join('\n')
        },
      },
      {
        // 头像容器：xiaoyi-lazy-image → 首字母占位（用户数据只读）
        test: (n) => hasClass(n, 'avatar-container'),
        render: (n, indent) => `${pad(indent)}<div class="avatar-container"><span class="avatar-letter">用</span></div>`,
      },
      {
        // 快捷宫格图标：txtIcon {{item.icon}} → 首字母占位（iconfont 不可用）
        test: (n, ctx) => n.tag === 'text' && classRawHas(n, 'txtIcon') && ctx.parentStack.some((p) => hasClass(p, 'image11-feature-icon')),
        render: (n, indent) => `${pad(indent)}<span class="txtIcon">{{ (it.title || '?').slice(0, 1) }}</span>`,
      },
      {
        // bar-text：真机选中态走内联 style（颜色/字号）→ 画布 .bar-text.active
        test: (n, ctx) => n.tag === 'text' && ctx.parentStack.some((p) => hasClass(p, 'bar-item')),
        render: (n, indent) => `${pad(indent)}<span class="bar-text" :class="{ active: i === 0 }">{{ t }}</span>`,
      },
    ],
    blocks: [
      {
        out: 'RealProfileNav.vue',
        build(ast, ctx) {
          const node = findByClass(ast, 'nav-box')
          if (!node) throw new Error('未能在 PersonalHomepage.wxml 中定位 nav-box')
          return {
            template: renderNode(node, 1, ctx, null),
            comment: [
              '// 结构 / class 与 pages/tabbar/auth/PersonalHomepage.wxml 的 nav-box 子树同源；',
              '// 真机导航左侧 image（src {{c}}）画布无数据源，imgOk 恒 false 不渲染；title-img 省略；',
              '// 状态栏高度 padding-top / 滚动透明度等动态 style 丢弃。',
            ],
            imports: [],
            props: `{
  region: any
  resolveAsset: (v: string) => string
  imgOk: (v: string) => boolean
  onImgError: (e: Event) => void
}`,
            css: `/* 关键布局回退 */
.rte-page .nav-box { background: var(--bg-card, #fff); box-shadow: 0 2px 8px rgba(38, 58, 32, .06); padding-bottom: 10px; text-align: center; }
.rte-page .nav-box .nav-item { display: flex; align-items: center; justify-content: center; }
.rte-page .nav-box .nav-item .ohto { max-width: 160px; margin: 4px auto 0; font-size: 13px; font-weight: 700; color: var(--text-primary, #1d271f); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`,
          }
        },
      },
      {
        out: 'RealProfileUserCard.vue',
        build(ast, ctx) {
          const node = findByClass(ast, 'user-box')
          if (!node) throw new Error('未能在 PersonalHomepage.wxml 中定位 user-box')
          return {
            template: renderNode(node, 1, ctx, null),
            comment: [
              '// 结构 / class 与 pages/tabbar/auth/PersonalHomepage.wxml 的 user-box 子树同源；',
              '// 主视觉：visual.enabled && imgOk(visual.image)，v-else-if 追加「待配置」占位；',
              '// 头像为字母占位（真机 xiaoyi-lazy-image）；昵称/简介/UID/统计为占位值（用户实时数据只读）；',
              '// user-btn 按布局映射（默认 !isXhs 在 user-top / 小红书 isXhs 在 user-bottom-container）；',
              '// add-icon / status-badge / title-img / region-tip / 性别 / 年龄 / uid-tag 等真机动态节点省略。',
            ],
            imports: [],
            props: `{
  region: any
  visual: any
  isXhs: boolean
  resolveAsset: (v: string) => string
  imgOk: (v: string) => boolean
  onImgError: (e: Event) => void
}`,
            css: `/* 关键布局回退 + 锚点占位（头像字母 / 主视觉待配置） */
.rte-page .user-box { position: relative; width: 100%; min-height: 215px; padding: 30px 16px 16px; box-sizing: border-box; color: var(--text-primary, #1d271f); overflow: hidden; background: linear-gradient(180deg, var(--brand-bg, #e8f3e4) 0%, var(--bg-cream, #fff8e8) 62%, var(--bg-page, #f4f7f1) 100%); }
.rte-page .user-info-container { position: relative; z-index: 2; width: 100%; }
.rte-page .user-top { display: flex; align-items: center; position: relative; z-index: 2; width: 100%; justify-content: space-between; min-height: 80px; margin-bottom: 8px; }
.rte-page .avatar-wrapper { position: relative; width: 66px; height: 66px; flex-shrink: 0; }
.rte-page .avatar-container { width: 100%; height: 100%; border-radius: 50%; background: var(--bg-card, #fff); border: 2px solid var(--bg-card, #fff); box-shadow: 0 0 0 0.5px var(--line-hairline, #e6ebdf), 0 4px 10px rgba(38, 58, 32, .12); overflow: hidden; display: grid; place-items: center; }
.rte-page .avatar-container .avatar-letter { color: var(--brand, #36a853); font-size: 24px; font-weight: 800; }
.rte-page .profile-visual-image { position: absolute; right: 14px; top: 58px; width: 94px; height: 80px; z-index: 1; object-fit: contain; pointer-events: none; }
.rte-page .profile-visual-empty { position: absolute; right: 14px; top: 58px; width: 94px; height: 80px; z-index: 1; display: flex; align-items: center; justify-content: center; text-align: center; border: 1px dashed var(--brand-light, #87bd6d); border-radius: 12px; color: var(--text-tertiary, #8a9384); font-size: 10px; line-height: 1.5; pointer-events: none; }
.rte-page .user-info-right { flex: 1; margin-left: 12px; padding-right: 85px; min-height: 66px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; }
.rte-page .user-name { display: flex; align-items: center; gap: 4px; position: relative; z-index: 2; margin: 0 0 6px; width: 100%; font-size: 18px; line-height: 1.18; font-weight: 900; color: var(--text-primary, #1d271f); }
.rte-page .user-info-right .user-name { margin: 0; font-size: 18px; font-weight: 900; }
.rte-page .user-uid { margin-top: 4px; font-size: 13px; color: var(--text-tertiary, #8a9384); }
.rte-page .region-switch { display: flex; align-items: center; margin-top: 8px; padding: 6px 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.76); border: 0.5px solid var(--line-hairline, #e6ebdf); color: var(--text-secondary, #55604f); font-size: 11px; width: fit-content; max-width: 180px; }
.rte-page .region-switch .region-name { max-width: 140px; font-size: 11px; }
.rte-page .user-intro { position: relative; z-index: 2; margin-top: 2px; max-width: 250px; width: 100%; word-break: break-word; }
.rte-page .user-intro span { color: var(--text-secondary, #55604f); font-size: 13px; line-height: 1.45; }
.rte-page .user-tag { position: relative; z-index: 2; margin: 8px 0 0; width: 100%; display: flex; flex-wrap: wrap; gap: 4px; }
.rte-page .tag-item { display: flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.76); border: 0.5px solid var(--line-hairline, #e6ebdf); color: var(--text-secondary, #55604f); font-size: 11px; font-weight: 500; justify-content: center; }
.rte-page .tag-item.region-tag { color: var(--brand-deep, #2e7e3a); background: var(--brand-bg, #e8f3e4); white-space: nowrap; }
.rte-page .user-btn { display: flex; align-items: center; position: absolute; right: 0; bottom: 1px; z-index: 4; margin: 0; }
.rte-page .user-bottom-container .user-btn { position: static; }
.rte-page .btn-item { height: 24px; line-height: 24px; padding: 0 12px; border-radius: 999px; font-size: 13px; font-weight: 700; white-space: nowrap; flex-shrink: 0; box-shadow: 0 2px 6px rgba(38, 58, 32, .08); }
.rte-page .btn-item.bg1 { color: var(--brand-deep, #2e7e3a); background: rgba(255, 255, 255, 0.78); border: 0.5px solid var(--line-hairline, #e6ebdf); }
.rte-page .btn-item.bg2 { margin-left: 6px; color: #fff; background: var(--brand, #36a853); border: 0.5px solid var(--brand-deep, #2e7e3a); }
.rte-page .user-bottom-container { width: 100%; }
.rte-page .user-num { display: flex; align-items: center; }
.rte-page .user-num .num-item { display: flex; align-items: center; gap: 4px; margin-right: 14px; color: var(--text-secondary, #55604f); font-size: 13px; }
.rte-page .user-num .num-item .t1 { color: var(--text-primary, #1d271f); font-size: 15px; font-weight: 700; }
.rte-page .squat-item { display: flex; align-items: center; gap: 4px; color: var(--text-secondary, #55604f); font-size: 13px; }
.rte-page .ohto { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rte-page .df { display: flex; align-items: center; }`,
          }
        },
      },
      {
        out: 'RealProfileGrowthCard.vue',
        build(ast, ctx) {
          const node = findByClass(ast, 'image11-growth-card')
          if (!node) throw new Error('未能在 PersonalHomepage.wxml 中定位 image11-growth-card')
          return {
            template: renderNode(node, 1, ctx, null),
            comment: [
              '// 结构 / class 与 pages/tabbar/auth/PersonalHomepage.wxml 的 image11-growth-card 子树同源；',
              '// 数值为占位（成长数据实时只读）；等级图标 image 省略（走 wx:else 的 Lv pill）；',
              '// next-line 的「配置不完整/已满级」分支省略，保留 else 文案；进度条 width 固定 40%。',
            ],
            imports: [],
            props: null,
            css: `/* 关键布局回退 */
.rte-page .image11-growth-card { position: relative; z-index: 5; width: calc(100% - 24px); margin: -4px 12px 8px; padding: 10px 12px 8px; box-sizing: border-box; border-radius: 12px; border: 0.5px solid var(--line-hairline, #e6ebdf); background: linear-gradient(135deg, var(--bg-cream, #fff8e8) 0%, var(--brand-bg, #e8f3e4) 100%); box-shadow: 0 2px 8px rgba(38, 58, 32, .08); }
.rte-page .image11-growth-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rte-page .image11-growth-left { display: flex; align-items: center; flex: 1; min-width: 0; }
.rte-page .image11-level-pill { min-width: 36px; height: 17px; padding: 0 8px; margin-right: 8px; border-radius: 5px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: 900; background: linear-gradient(135deg, var(--brand, #36a853), var(--brand-light, #87bd6d)); box-sizing: border-box; }
.rte-page .image11-level-name { max-width: 120px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--text-primary, #1d271f); font-size: 13px; font-weight: 800; }
.rte-page .image11-level-star { margin-left: 4px; color: var(--accent-sun, #f2c94c); font-size: 13px; }
.rte-page .image11-growth-entry { height: 23px; padding: 0 8px; display: flex; align-items: center; border-radius: 999px; color: var(--brand-deep, #2e7e3a); background: rgba(255, 255, 255, 0.64); border: 0.5px solid var(--brand-light, #87bd6d); font-size: 13px; font-weight: 800; white-space: nowrap; }
.rte-page .image11-exp-line { display: flex; align-items: center; margin-top: 8px; color: var(--text-secondary, #55604f); font-size: 13px; gap: 4px; }
.rte-page .image11-exp-current { color: var(--brand, #36a853); font-weight: 900; }
.rte-page .image11-progress { width: 68%; height: 4px; margin-top: 6px; overflow: hidden; border-radius: 999px; background: var(--bg-fill, #eef2e8); }
.rte-page .image11-progress-inner { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--brand, #36a853), var(--brand-light, #87bd6d)); }
.rte-page .image11-next-line { margin-top: 4px; color: var(--text-secondary, #55604f); font-size: 13px; }`,
          }
        },
      },
      {
        out: 'RealProfileStatsCard.vue',
        build(ast, ctx) {
          const node = findByClass(ast, 'image11-stats-card')
          if (!node) throw new Error('未能在 PersonalHomepage.wxml 中定位 image11-stats-card')
          return {
            template: renderNode(node, 1, ctx, null),
            comment: [
              '// 结构 / class 与 pages/tabbar/auth/PersonalHomepage.wxml 的 image11-stats-card 子树同源；',
              '// 数值为占位 0（关注/粉丝/获赞/发布为实时数据，只读）。',
            ],
            imports: [],
            props: null,
            css: `/* 关键布局回退 */
.rte-page .image11-stats-card { position: relative; z-index: 4; display: flex; width: calc(100% - 24px); margin: 0 12px 10px; padding: 10px 0; border-radius: 12px; background: var(--bg-card, #fff); box-shadow: 0 2px 8px rgba(38, 58, 32, .08); }
.rte-page .image11-stat { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.rte-page .image11-stat:not(:last-child)::after { content: ""; position: absolute; right: 0; top: 6px; bottom: 6px; width: 0.5px; background: var(--line-hairline, #e6ebdf); }
.rte-page .image11-stat-value { color: var(--text-primary, #1d271f); font-size: 18px; line-height: 1; font-weight: 700; }
.rte-page .image11-stat-label { color: var(--text-tertiary, #8a9384); font-size: 11px; }`,
          }
        },
      },
      {
        out: 'RealProfileActionPanel.vue',
        build(ast, ctx) {
          const node = findByClass(ast, 'image11-action-panel')
          if (!node) throw new Error('未能在 PersonalHomepage.wxml 中定位 image11-action-panel')
          const serviceRow = findByClass(node, 'image11-service-row')
          const grid = findByClass(node, 'image11-feature-grid')
          if (!serviceRow || !grid) throw new Error('image11-action-panel 缺少 service-row / feature-grid 子树')
          if (grid) injectChild(grid, { tag: 'view', attrs: { class: 'p-empty', 'wx:if': '{{__quickEmpty}}' }, children: [{ tag: '#text', text: '{{ emptyText }}' }] })
          // 服务卡片行：真机为静态「我的订单/我的钱包」两张卡 → 画布数据驱动（serviceCards prop）。
          // 数据源为 ProfileEditor 的功能入口卡片（entryItems），画布只渲染一次（去重手抄 pf-entries）；
          // 图片走 resolveAsset/imgOk/onImgError，无图或加载失败回退 MenuFallbackIcon（不出现黑块）。
          // feature-grid 快捷宫格仍走通用渲染管线（wx:for → v-for，items prop）。
          const serviceRowTpl = [
            '<div class="image11-service-row">',
            `  <div v-for="(card, si) in serviceCards" :key="card.id || si" class="image11-service-card" :class="si % 2 ? 'wallet' : 'order'">`,
            `    <div class="image11-service-copy">`,
            `      <span class="image11-service-title">{{ card.title || '入口' }}</span>`,
            `      <span class="image11-service-desc">{{ card.description || '' }}</span>`,
            `      <div class="image11-mini-btn" :class="si % 2 ? 'yellow' : 'green'">去查看 <span>›</span></div>`,
            `    </div>`,
            `    <div class="image11-service-art">`,
            `      <img v-if="imgOk(card.main_image || card.image || card.icon)" :src="resolveAsset(card.main_image || card.image || card.icon)" alt="" @error="onImgError" />`,
            `      <MenuFallbackIcon v-else :name="card.title || ''" :path="card.path || ''" />`,
            `    </div>`,
            `  </div>`,
            `  <div v-if="!serviceCards.length" class="p-empty">{{ serviceEmptyText }}</div>`,
            `</div>`,
          ]
          const template = [
            `${pad(1)}<div class="image11-action-panel">`,
            ...serviceRowTpl.map((l) => pad(2) + l),
            renderNode(grid, 2, ctx, null),
            `${pad(1)}</div>`,
          ].join('\n')
          return {
            template,
            comment: [
              '// 结构 / class 与 pages/tabbar/auth/PersonalHomepage.wxml 的 image11-action-panel 子树同源；',
              '// 服务卡（真机静态「我的订单/我的钱包」）→ 画布数据驱动：serviceCards prop，',
              '// 数据源为功能入口卡片 entryItems（ProfileEditor 传入，未配置时回退真机默认两卡）；',
              '// 服务卡图片 resolveAsset/imgOk/onImgError，无图或失败回退 MenuFallbackIcon；',
              '// 快捷宫格 wx:for → v-for（items prop）；宫格图标为标题首字母占位（真机 iconfont）；',
              '// 空态提示为画布注入节点。',
            ],
            imports: ["import MenuFallbackIcon from '@/views/miniapp/editor/MenuFallbackIcon.vue'"],
            props: `{
  items: any[]
  emptyText: string
  serviceCards: any[]
  serviceEmptyText: string
  resolveAsset: (v: string) => string
  imgOk: (v: string) => boolean
  onImgError: (e: Event) => void
}`,
            css: `/* 关键布局回退 + 画布注入的 p-empty */
.rte-page .image11-action-panel { width: calc(100% - 24px); margin: 0 12px 8px; }
.rte-page .image11-service-row { display: flex; flex-wrap: wrap; gap: 8px; }
.rte-page .image11-service-card { position: relative; flex: 1 1 calc(50% - 4px); min-width: 0; min-height: 88px; padding: 12px 10px; box-sizing: border-box; overflow: hidden; border-radius: 12px; border: 0.5px solid var(--line-hairline, #e6ebdf); background: linear-gradient(135deg, var(--bg-card, #fff) 0%, var(--brand-bg, #e8f3e4) 100%); box-shadow: 0 2px 8px rgba(38, 58, 32, .08); }
.rte-page .image11-service-card.wallet { background: linear-gradient(135deg, var(--bg-card, #fff) 0%, var(--bg-cream, #fff8e8) 100%); }
.rte-page .image11-service-copy { position: relative; z-index: 2; width: 62%; display: flex; flex-direction: column; }
.rte-page .image11-service-title { color: var(--text-primary, #1d271f); font-size: 15px; font-weight: 900; }
.rte-page .image11-service-desc { margin-top: 4px; color: var(--text-tertiary, #8a9384); font-size: 13px; line-height: 1.35; }
.rte-page .image11-mini-btn { height: 21px; margin-top: 8px; padding: 0 8px; display: flex; align-items: center; align-self: flex-start; border-radius: 999px; color: #fff; font-size: 13px; font-weight: 800; }
.rte-page .image11-mini-btn.green { background: var(--brand, #36a853); }
.rte-page .image11-mini-btn.yellow { color: var(--text-primary, #1d271f); background: var(--accent-sun, #f2c94c); }
.rte-page .image11-service-art { position: absolute; right: 9px; bottom: 10px; width: 43px; height: 43px; display: flex; align-items: center; justify-content: center; border-radius: 20px; background: rgba(255, 255, 255, 0.72); box-shadow: 0 2px 8px rgba(38, 58, 32, .08); font-size: 22px; }
.rte-page .image11-feature-grid { display: flex; flex-wrap: wrap; margin-top: 8px; padding: 12px 8px 0; border-radius: 12px; background: var(--bg-card, #fff); box-shadow: 0 2px 8px rgba(38, 58, 32, .08); }
.rte-page .image11-feature { width: 25%; min-width: 0; margin-bottom: 12px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--text-secondary, #55604f); font-size: 13px; }
.rte-page .image11-feature-icon { width: 33px; height: 33px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 15px; font-weight: 800; }
.rte-page .image11-feature-icon.green { color: var(--brand, #36a853); background: var(--brand-bg, #e8f3e4); }
.rte-page .image11-feature-icon.green-soft { color: var(--brand-light, #87bd6d); background: var(--brand-bg, #e8f3e4); }
.rte-page .image11-feature-icon.orange { color: var(--warning, #ff9500); background: var(--bg-cream, #fff8e8); }
.rte-page .image11-feature-icon.blue { color: var(--info, #3b82f6); background: var(--bg-fill, #eef2e8); }
.rte-page .image11-feature-icon.yellow { color: var(--accent-sun, #f2c94c); background: var(--bg-cream, #fff8e8); }
.rte-page .image11-feature-icon.gold { color: var(--accent-sun, #f2c94c); background: var(--bg-cream, #fff8e8); }
.rte-page .image11-feature-icon.purple { color: var(--status-refund, #8b5cf6); background: var(--bg-fill, #eef2e8); }
.rte-page .p-empty { padding: 22px 0; text-align: center; color: var(--text-tertiary, #8a9384); font-size: 12px; width: 100%; }
/* 服务卡图片 / MenuFallbackIcon 回退在 43px 圆形 art 内的适配 */
.rte-page .image11-service-art img { width: 100%; height: 100%; object-fit: cover; border-radius: 20px; }
.rte-page .image11-service-art .menu-fallback-icon { width: 30px; height: 30px; border-radius: 10px; background: rgba(255, 255, 255, 0.92); }
.rte-page .image11-service-art .menu-fallback-icon svg { width: 18px; height: 18px; }`,
          }
        },
      },
      {
        out: 'RealProfileTabs.vue',
        build(ast, ctx) {
          const node = findByClass(ast, 'bar-box')
          if (!node) throw new Error('未能在 PersonalHomepage.wxml 中定位 bar-box')
          return {
            template: renderNode(node, 1, ctx, null),
            comment: [
              '// 结构 / class 与 pages/tabbar/auth/PersonalHomepage.wxml 的 bar-box 子树同源；',
              '// 真机选中态走内联 style（颜色/字号/下划线 opacity）→ 画布 .bar-text.active + :style opacity；',
              '// Tab 内容为用户数据维度（我的发布/收藏/浏览/评论），编辑器传入静态 tabs。',
            ],
            imports: [],
            props: `{
  tabs: string[]
}`,
            css: `/* 关键布局回退 + bar-text（真机为 text 元素选择器 + 内联样式，画布用 class） */
.rte-page .bar-box { display: flex; align-items: center; width: calc(100% - 24px); height: 42px; margin: 0 12px; border-radius: 12px 12px 0 0; overflow: hidden; background: var(--bg-card, #fff); box-shadow: 0 2px 8px rgba(38, 58, 32, .08); }
.rte-page .bar-item { flex: 1; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; height: 100%; }
.rte-page .bar-text { font-weight: 700; font-size: 13px; color: var(--text-tertiary, #8a9384); }
.rte-page .bar-text.active { font-size: 15px; color: var(--text-primary, #1d271f); }
.rte-page .bar-line { position: absolute; bottom: 5px; width: 17px; height: 3px; border-radius: 4px; background: var(--brand, #36a853); }`,
          }
        },
      },
    ],
  },
]

// ============ 6. 生成 SFC ============
const HEADER_COMMENT = '<!-- AUTO-GENERATED by sync-canvas-blocks.mjs, DO NOT EDIT -->'
const HEADER_LINE = '// AUTO-GENERATED by sync-canvas-blocks.mjs, DO NOT EDIT'

function buildSfc(block, built) {
  const scriptParts = [HEADER_LINE, ...built.comment]
  if (built.imports?.length) scriptParts.push(...built.imports)
  if (built.props) {
    // 与既有产物格式一致：有 imports 时 defineProps 前空一行，否则紧随注释
    if (built.imports?.length) scriptParts.push('')
    scriptParts.push(`defineProps<${built.props}>()`)
  }
  let sfc = `${HEADER_COMMENT}\n<template>\n${built.template}\n</template>\n\n<script setup lang="ts">\n${scriptParts.join('\n')}\n</script>\n`
  if (built.css) sfc += `\n<style>\n${built.css}\n</style>\n`
  return sfc
}

// ============ main ============
function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const written = []
  for (const page of PAGES) {
    const wxmlPath = join(SOURCE_DIR, page.wxml)
    console.log(`\n[sync-canvas] ===== 页面 ${page.key}: ${wxmlPath}`)
    const src = readFileSync(wxmlPath, 'utf8')
    const ast = parseWxml(src)
    console.log('[sync-canvas] 绑定映射表（{{ }} → 编辑器字段）:')
    for (const [k, v] of Object.entries(page.fieldMap)) console.log(`  {{ ${k} }}  →  ${v}`)
    for (const block of page.blocks) {
      // 每个区块独立 ctx（aliasStack / parentStack 隔离）
      const ctx = {
        page,
        fieldMap: page.fieldMap,
        forMap: page.forMap,
        styleMap: page.styleMap,
        iconGlyph: page.iconGlyph,
        anchors: page.anchors,
        aliasStack: [],
        parentStack: [],
      }
      // 包装 renderNode 以维护 parentStack
      const built = block.build(ast, ctx)
      const sfc = buildSfc(block, built)
      const outPath = join(OUT_DIR, block.out)
      writeFileSync(outPath, sfc)
      written.push(outPath)
      console.log(`[sync-canvas] 已生成 ${block.out}（${sfc.length} 字节）`)
    }
  }
  console.log(`\n[sync-canvas] 完成，共生成 ${written.length} 个组件:\n  ${written.join('\n  ')}`)
}

main()
