/**
 * region 老预设 → 新布局协议 转换器(纯函数,供各编辑器「导出到代码包」复用)。
 * 产物与 page-renderer / layoutSchemas 协议对齐：
 *   - home: 忠实转换 carousel(轮播) → banner、金刚区 → grid-menu、region_tabs → filter-tabs、热榜 → module-title + hot-posts。
 *   - message: message_navigation.cards 按标题/ID 映射到 5 个消息入口块(私信/群聊/系统通知/客服/官方公告)。
 *   - profile: user-card + 标准功能入口(wallet/orders/certification/merchant-entry/rider-entry/settings)。
 *   - containers: 内容型为主,默认空(由 LayoutBuilder 搭建)。
 */

export interface LayoutBlock {
  id: string
  type: string
  enabled: boolean
  order: number
  config: Record<string, any>
  style?: Record<string, any>
}

export interface LayoutPayload {
  components: LayoutBlock[]
  settings: Record<string, any>
}

const uid = (type: string, order: number) => `${type}_${Date.now().toString(36)}_${order}`

/** 消息入口:布局 type → 用于按标题匹配的关键词 */
const MESSAGE_ENTRIES: Array<{ type: string; match: (title: string, id: string) => boolean }> = [
  { type: 'system-notice', match: (t, id) => id === 'notice' || t.includes('通知') },
  { type: 'customer-service', match: (t) => t.includes('客服') || t.includes('助理') },
  { type: 'official-notice', match: (t) => t.includes('公告') },
  { type: 'private-chat', match: (t) => t.includes('私信') || t.includes('消息') },
  { type: 'group-chat', match: (t) => t.includes('群聊') || t.includes('群') },
]

export function regionPresetToLayout(region: any, pageType: string): LayoutPayload {
  const r = region || {}
  const blocks: LayoutBlock[] = []
  let order = 0
  const push = (type: string, config: Record<string, any>) => {
    blocks.push({ id: uid(type, order), type, enabled: true, order: order++, config })
  }

  if (pageType === 'home') {
    const showCarousel = r.showCarousel ?? r.show_carousel ?? true
    const carousel = Array.isArray(r.carouselImages || r.carousel_images) ? (r.carouselImages || r.carousel_images) : []
    const nonHero = carousel.filter((i: any) => i && i.module_type !== 'hero' && i.enabled !== false)
    if (showCarousel && nonHero.length) {
      push('banner', {
        autoplay: true,
        interval: 3000,
        height: 280,
        indicatorDots: true,
        images: nonHero.map((i: any) => ({ image: i.image || '', linkUrl: i.linkUrl || i.path || '' })),
      })
    }
    const showKingkong = r.showKingkong ?? r.show_kingkong ?? true
    const nav = Array.isArray(r.homeNavLayoutConfig || r.home_nav_layout_config) ? (r.homeNavLayoutConfig || r.home_nav_layout_config) : []
    const navItems = nav.filter((i: any) => i && i.enabled !== false)
    if (showKingkong && navItems.length) {
      push('grid-menu', {
        columns: navItems.length >= 5 ? 5 : 4,
        items: navItems.map((i: any) => ({ icon: i.icon || i.image || '', text: i.name || '', linkUrl: i.linkUrl || i.path || i.page || '' })),
      })
    }
    const tabs = (Array.isArray(r.regionTabs || r.region_tabs) ? (r.regionTabs || r.region_tabs) : []).filter((t: any) => t && t.enabled !== false && t.name)
    if (tabs.length > 1) {
      push('filter-tabs', { filterLinkKey: 'home-feed', items: tabs.map((t: any) => ({ label: t.name || '' })) })
    }
    const showHot = r.showHotList ?? r.show_hot_list ?? false
    const hotDisplay = r.hotFeaturedDisplay || r.hot_featured_display || 'none'
    if (showHot && hotDisplay !== 'none') {
      push('module-title', { title: '热门精选', icon: '', showMore: false, moreText: '更多', moreLink: '', align: 'left' })
      push('hot-posts', { limit: 5 })
    }
    // 默认不含 feed 块:信息流由首页下方 z-paging 承接(见计划 WS B 风险兜底)
  } else if (pageType === 'message') {
    const cards = (r.messageNavigation || r.message_navigation || {}).cards
    if (Array.isArray(cards) && cards.length) {
      const matched = new Set<string>()
      for (const c of cards) {
        const t = String(c.title || c.name || '')
        const id = String(c.id || '')
        for (const entry of MESSAGE_ENTRIES) {
          if (entry.match(t, id)) matched.add(entry.type)
        }
      }
      // 有配置但全部未匹配 → 导出全部(保证页面有入口,避免 strip 隐藏后空白)
      const types = matched.size ? MESSAGE_ENTRIES.filter((e) => matched.has(e.type)).map((e) => e.type) : MESSAGE_ENTRIES.map((e) => e.type)
      for (const type of types) push(type, {})
    } else {
      for (const e of MESSAGE_ENTRIES) push(e.type, {})
    }
  } else if (pageType === 'profile') {
    push('user-card', { showAvatar: true, showName: true })
    for (const type of ['wallet', 'orders', 'certification', 'merchant-entry', 'rider-entry', 'settings']) push(type, {})
  }
  // containers: 默认空

  return { components: blocks, settings: {} }
}
