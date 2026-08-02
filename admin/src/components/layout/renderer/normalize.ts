/**
 * page-renderer.js normalize() 的 TypeScript 复刻。
 * 输入装修协议组件（{ id, type, enabled, order, config, style }），
 * 输出与小程序 page-renderer 完全一致的 block 视图模型。
 *
 * 与真机的唯一差异：真机内联样式单位是 rpx（750rpx = 屏宽），
 * 画布屏宽 375px，因此所有 rpx 数值在这里统一 ÷2 换成 px。
 * WXSS 部分的换算由 compileWxss(scale = 0.5) 负责。
 */

/** 内容型组件（与 page-renderer.js CONTENT_TYPES 对齐） */
export const CONTENT_TYPES = [
  'navbar', 'search', 'banner', 'grid-menu', 'announcement', 'module-title',
  'filter-tabs', 'text', 'image', 'button', 'divider',
]

/** 业务模块中文名（与 page-renderer.js DYNAMIC_NAMES 对齐） */
export const DYNAMIC_NAMES: Record<string, string> = {
  'hot-posts': '热门精选',
  ranking: '榜单',
  'recommend-merchant': '推荐商家',
  feed: '信息流',
  'private-chat': '私信入口',
  'group-chat': '群聊入口',
  'system-notice': '系统通知',
  'customer-service': '客服入口',
  'official-notice': '官方公告',
  'user-card': '用户卡片',
  wallet: '钱包入口',
  orders: '订单入口',
  certification: '认证入口',
  'merchant-entry': '商家入口',
  'rider-entry': '骑手入口',
  'share-earn': '分享赚',
  'sign-in': '每日签到',
  settings: '设置入口',
}

export interface GridItem {
  text?: string
  name?: string
  icon?: string
  image?: string
  linkUrl?: string
  link_url?: string
  firstLetter: string
}

export interface BlockVM {
  key: string
  type: string
  cfg: any
  isDynamic: boolean
  dynamicName: string
  /** banner */
  bannerImages: any[]
  /** grid-menu */
  columns: number
  gridItems: GridItem[]
  /** announcement */
  notices: any[]
  /** text */
  textStyle: Record<string, string>
  textClamp: boolean
  /** button */
  btnStyle: Record<string, string>
  /** image */
  imageMode: string
  /** module-title */
  mtStyle: Record<string, string>
}

/** rpx → px（750rpx = 375px 画布，÷2） */
const px = (v: any) => `${(Number(v) || 0) / 2}px`

/** buildTextStyle() 复刻：输出 Vue :style 对象，rpx 已换算 px */
export function buildTextStyle(conf: any): Record<string, string> {
  const size = Number(conf.fontSize) || 28
  const style: Record<string, string> = {
    fontSize: px(size),
    color: conf.color || '#1D271F',
    textAlign: conf.align || 'left',
    fontWeight: conf.bold ? '700' : '400',
    lineHeight: String(Number(conf.lineHeight) || 1.6),
  }
  if (conf.italic) style.fontStyle = 'italic'
  let decorations = ''
  if (conf.underline) decorations += ' underline'
  if (conf.strikethrough) decorations += ' line-through'
  if (decorations.trim()) style.textDecoration = decorations.trim()
  const maxLines = Number(conf.maxLines) || 0
  if (maxLines > 0) {
    style.display = '-webkit-box'
    ;(style as any)['-webkit-box-orient'] = 'vertical'
    ;(style as any)['-webkit-line-clamp'] = String(maxLines)
    style.overflow = 'hidden'
    style.textOverflow = 'ellipsis'
  }
  return style
}

/** buildButtonStyle() 复刻 */
export function buildButtonStyle(conf: any): Record<string, string> {
  const bg = conf.background || '#36A853'
  const color = conf.color || '#FFFFFF'
  const radius = conf.radius === 0 || conf.radius ? Number(conf.radius) : 999
  if (conf.outline) {
    return {
      background: 'transparent',
      color: bg,
      border: `1px solid ${bg}`,
      borderRadius: px(radius),
    }
  }
  return { background: bg, color, borderRadius: px(radius) }
}

/** normalize() 单个组件的复刻 */
export function normalizeBlock(c: any, index = 0): BlockVM {
  const conf = c.config || {}
  return {
    key: c.id || `${c.type}_${index}`,
    type: c.type,
    cfg: conf,
    isDynamic: CONTENT_TYPES.indexOf(c.type) < 0,
    dynamicName: DYNAMIC_NAMES[c.type] || c.type,
    bannerImages: Array.isArray(conf.images) ? conf.images : [],
    columns: Math.min(5, Math.max(3, Number(conf.columns) || 4)),
    gridItems: (Array.isArray(conf.items) ? conf.items : []).map((g: any) => ({
      ...g,
      firstLetter: String(g.text || g.name || '?').slice(0, 1),
    })),
    notices: Array.isArray(conf.items) ? conf.items : [],
    textStyle: buildTextStyle(conf),
    textClamp: Number(conf.maxLines) > 0,
    btnStyle: buildButtonStyle(conf),
    imageMode: ['aspectFill', 'aspectFit', 'widthFix'].indexOf(conf.mode) >= 0 ? conf.mode : 'aspectFill',
    mtStyle: { textAlign: conf.align || 'left' },
  }
}

/** 整页 normalize：过滤禁用 + 按 order 排序（与真机一致） */
export function normalizeBlocks(components: any[]): BlockVM[] {
  const list = Array.isArray(components) ? components : []
  return list
    .filter((c) => c && c.enabled !== false)
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((c, i) => normalizeBlock(c, i))
}

/** banner 高度（cfg.height rpx → px） */
export function bannerHeight(cfg: any): string {
  return px(cfg?.height || 280)
}

// ============ tmagic 活动页（page-renderer.js buildTmagicItems 的 web 复刻） ============
// 真机：DSL 375px 画布 → 750rpx 等比（scale=2）输出 rpx；
// web 画布本身就是 375px，直接用 px，无需换算。

export interface TmagicNode {
  key: string
  ttype: 'text' | 'img' | 'button'
  text: string
  src: string
  link: string
  style: Record<string, string>
}

export interface TmagicBlock {
  status: 'loading' | 'empty' | 'ready'
  items: TmagicNode[]
  height: number
}

/** 真机 UNIT_PX 对齐：这些数值键按 px 输出；zIndex/opacity/fontWeight 原样 */
const TMAGIC_UNITLESS = ['zIndex', 'opacity', 'fontWeight']

export function buildTmagicItems(dsl: any): TmagicBlock {
  const page = dsl && Array.isArray(dsl.items) ? dsl.items[0] : null
  const nodes = page && Array.isArray(page.items) ? page.items : []
  // 真机 scale = 750 / pageWidth（rpx）；web 画布宽 375px，等价为 375 / pageWidth
  const pageWidth = Number(page && page.style && page.style.width) || 375
  const scale = 375 / pageWidth
  const toPx = (v: any) => Math.round((Number(v) || 0) * scale * 100) / 100

  const items: TmagicNode[] = []
  let maxBottom = 0
  for (const node of nodes) {
    if (!node || node.visible === false) continue
    const st = node.style || {}
    const left = toPx(st.left)
    const top = toPx(st.top)
    const width = toPx(st.width)
    const height = toPx(st.height)
    const bottom = top + height
    if (bottom > maxBottom) maxBottom = bottom

    const style: Record<string, string> = {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    }
    for (const k of Object.keys(st)) {
      if (['position', 'left', 'top', 'width', 'height'].indexOf(k) >= 0) continue
      const v = st[k]
      if (v === null || v === undefined || v === '') continue
      const prop = k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
      if (TMAGIC_UNITLESS.indexOf(k) >= 0) {
        style[prop] = String(v)
      } else if (typeof v === 'number') {
        style[prop] = `${toPx(v)}px`
      } else {
        style[prop] = String(v)
      }
    }

    let ttype: TmagicNode['ttype'] = node.type === 'img' ? 'img' : node.type
    if (['text', 'img', 'button'].indexOf(ttype) < 0) ttype = 'text'
    items.push({
      key: String(node.id),
      ttype,
      text: node.text || '',
      src: node.src || '',
      link: node.link || '',
      style,
    })
  }

  if (!items.length) return { status: 'empty', items: [], height: 0 }
  return { status: 'ready', items, height: Math.max(Math.round(maxBottom), 1) }
}
