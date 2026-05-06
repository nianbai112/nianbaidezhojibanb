/** 轮播图组 */
export interface CarouselGroup {
  a: string[]
  d: string[]
  h: string  // 播放间隔 e.g. "30s"
}

/** 区域 Tab */
export interface RegionTab {
  id: string
  name: string
  originalName?: string
  enabled: boolean
}

/** 榜单配置项 */
export interface LeaderboardItem {
  type: string       // note / user / topic
  title: string
  enabled: boolean
  order: number
}

/** 首页榜单配置 */
export interface LeaderboardConfig {
  enabled: boolean
  items: LeaderboardItem[]
}

/** 消息图标配置 */
export interface MessageIconConfig {
  icon?: string
  title?: string
  color?: string
}

/** 消息导航卡片 */
export interface MessageNavigationCard {
  id: string
  icon?: string
  img?: string
  type: string
  colors?: { bg?: string; text?: string }
  title: string
  description?: string
  shortText?: string
  action?: { type: string; url: string }
}

/** 消息导航配置 */
export interface MessageNavigationConfig {
  cards: MessageNavigationCard[]
}

/** 我的页面布局模块 */
export interface ProfileLayoutItem {
  title: string
  description?: string
  main_image?: string
  type: string
  url?: string
  order?: number
}

/** 首页导航栏布局配置 */
export interface HomeNavLayoutConfig {
  title: {
    show: boolean
    text: string
    color: string
    fontSize: number
    fontWeight: string
  }
  showLayoutSwitch: boolean
}

/** 区域 */
export interface Area {
  id: number
  name: string
  code: string
  coverImage: string
  description: string
  province: string
  city: string
  district: string
  address: string
  longitude?: number
  latitude?: number
  serviceRadius: number
  status: 0 | 1
  studentOnly: boolean
  distanceLimit: number
  sort: number
  settings?: Record<string, any>
  createdAt: string
  updatedAt?: string
  // 基础信息
  logo?: string
  regionType?: string        // campus / community / other
  isHot?: boolean
  regionCoverMode?: string   // cover / popup
  // 财务配置
  balance?: number
  minWithdraw?: number
  maxWithdraw?: number
  withdrawFee?: number
  withdrawRate?: number
  commissionRate?: number
  selfUnbanFee?: number
  // 显示设置
  showHotList?: boolean
  hotFeaturedDisplay?: string  // none / hot / featured / mixed
  isForceGuidance?: boolean
  privateMessageEnabled?: boolean
  contactsRequireStudentAuth?: boolean
  onlyStudentAuthUsers?: boolean
  groupChatEnabled?: boolean
  enableQrcodeFilter?: boolean
  // 页面布局
  homeNavLayout?: number
  messagePageLayout?: string
  profilePageLayout?: string
  // JSON 配置
  carouselImages?: CarouselGroup[]
  regionTabs?: RegionTab[]
  homeLeaderboard?: LeaderboardConfig
  messageIcons?: Record<string, MessageIconConfig>
  messageNavigation?: MessageNavigationConfig
  profileLayoutItems?: ProfileLayoutItem[]
  homeNavLayoutConfig?: HomeNavLayoutConfig
}

/** 轮播图 */
export interface Banner {
  id: number
  areaId: number
  title: string
  image: string
  linkType: 'url' | 'post' | 'product' | 'topic' | 'none'
  linkValue: string
  sort: number
  status: 0 | 1
  createdAt: string
}

/** 公告 */
export interface Announcement {
  id: number
  areaId: number
  title: string
  content: string
  type: 'text' | 'link' | 'rich'
  linkUrl?: string
  isTop: boolean
  status: 0 | 1
  createdAt: string
}

/** 导航项 */
export interface NavItem {
  id: number
  areaId: number
  name: string
  icon: string
  linkType: string
  linkValue: string
  sort: number
  status: 0 | 1
}

/** TabBar 配置 */
export interface TabBarConfig {
  id: number
  areaId: number
  items: TabBarItem[]
}

export interface TabBarItem {
  name: string
  icon: string
  activeIcon: string
  path: string
}
