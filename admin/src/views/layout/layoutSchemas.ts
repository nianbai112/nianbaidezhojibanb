/**
 * 页面布局 schema：驱动 LayoutBuilder 的组件库、属性面板和默认值。
 * 新增页面类型 / 组件类型只需在这里加声明，无需改编辑器代码。
 * 与小程序 page-renderer 渲染协议对齐。
 */

export interface WidgetField {
  key: string
  label: string
  input: 'text' | 'textarea' | 'number' | 'switch' | 'color' | 'select' | 'image' | 'items' | 'link'
  min?: number
  max?: number
  step?: number
  options?: { label: string; value: any }[]
  placeholder?: string
  shape?: 'square' | 'wide'
  /** 字段说明文字（显示在表单项下方） */
  desc?: string
  /** input === 'items' 时的子项字段 */
  itemFields?: WidgetField[]
  addText?: string
  itemDefaults?: Record<string, any>
}

export interface WidgetDef {
  type: string
  name: string
  icon: string
  color: string
  bg: string
  group: string
  /** content = 画布高保真渲染；dynamic = 业务模块占位（真实内容在小程序内生效） */
  kind: 'content' | 'dynamic'
  defaults: Record<string, any>
  fields: WidgetField[]
  /** 适用的页面类型，缺省表示全部页面可用 */
  pages?: string[]
  /** 每页唯一（如提交底栏） */
  unique?: boolean
  /** 互斥组：同组组件每页只能有一个（如主 Feed 三选一） */
  mutexGroup?: string
}

export interface PageSchema {
  widgets: WidgetDef[]
  settings: WidgetField[]
}

// ============ 通用样式字段（样式 Tab，作用于组件外壳） ============
export const STYLE_FIELDS: WidgetField[] = [
  { key: 'width', label: '宽度(rpx)', input: 'number', min: 0, max: 750, desc: '0 或留空为自适应；720 + 左右边距 15 可居中留白' },
  { key: 'height', label: '高度(rpx)', input: 'number', min: 0, max: 2000, desc: '0 或留空为 auto；图片、轮播常需指定' },
  { key: 'marginTop', label: '上边距(rpx)', input: 'number', min: 0, max: 200, desc: '与上方模块的间距，推荐 16~30' },
  { key: 'marginBottom', label: '下边距(rpx)', input: 'number', min: 0, max: 200 },
  { key: 'marginX', label: '左右边距(rpx)', input: 'number', min: 0, max: 100, desc: '卡片整体居中：宽度自适应时设 15~24' },
  { key: 'padding', label: '内边距(rpx)', input: 'number', min: 0, max: 100 },
  { key: 'background', label: '背景色', input: 'color' },
  { key: 'backgroundImage', label: '背景图', input: 'text', placeholder: '/static/editor/xxx.png 或图片 URL', desc: '设为透明背景色后叠加背景图' },
  { key: 'backgroundSize', label: '背景图填充', input: 'select', options: [{ label: '铺满裁剪', value: 'cover' }, { label: '完整显示', value: 'contain' }, { label: '拉伸铺满', value: '100% 100%' }] },
  { key: 'borderRadius', label: '圆角(rpx)', input: 'number', min: 0, max: 999, desc: '0 直角 / 16 卡片感 / 999 胶囊' },
  { key: 'borderColor', label: '边框颜色', input: 'color' },
  { key: 'borderWidth', label: '边框宽度(rpx)', input: 'number', min: 0, max: 10 },
  { key: 'opacity', label: '透明度(0~1)', input: 'number', min: 0, max: 1, step: 0.1 },
  { key: 'shadow', label: '阴影', input: 'text', placeholder: '0 4rpx 20rpx rgba(0,0,0,0.08)' },
  { key: 'overflow', label: '溢出', input: 'select', options: [{ label: '默认', value: '' }, { label: '隐藏 hidden', value: 'hidden' }, { label: '显示 visible', value: 'visible' }] },
]

/** 点击动作统一配置（协议前缀字符串，与小程序 navigateToUrl 对齐，共 12 种） */
export const ACTION_TYPES = [
  { label: '无动作', value: 'none' },
  { label: '跳转页面', value: 'internal' },
  { label: '重定向', value: 'redirect' },
  { label: '切换 Tab', value: 'switchtab' },
  { label: '重启应用栈', value: 'relaunch' },
  { label: '打开外链', value: 'web' },
  { label: '打开小程序', value: 'miniapp' },
  { label: '预览图片', value: 'img' },
  { label: '复制文本', value: 'copy' },
  { label: '拨打电话', value: 'tel' },
  { label: '打开地图', value: 'map' },
  { label: '发布弹窗', value: 'publish' },
]

// ============ 通用字段 ============
/** 点击动作：存储为带协议前缀的字符串（与小程序 navigateToUrl 协议对齐：internal路径 / http(s):// / miniapp: / img:） */
const linkField: WidgetField = { key: 'linkUrl', label: '点击动作', input: 'link', desc: '用户点击时的行为，留空为无动作' }

// ============ 首页 ============
const homeWidgets: WidgetDef[] = [
  // 内容组件
  {
    type: 'text', name: '文本', icon: 'Document', color: '#2563eb', bg: '#e9effd', group: '内容组件', kind: 'content',
    defaults: { content: '文本内容', fontSize: 28, color: '#1D271F', align: 'left', bold: false, lineHeight: 1.6, maxLines: 0, italic: false, underline: false, strikethrough: false },
    fields: [
      { key: 'content', label: '内容', input: 'textarea', desc: '支持换行；整块留白请用样式 → 外边距' },
      { key: 'fontSize', label: '字号(rpx)', input: 'number', min: 20, max: 72, desc: '正文推荐 26~30，标题 32~36' },
      { key: 'color', label: '颜色', input: 'color' },
      { key: 'align', label: '对齐', input: 'select', options: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }] },
      { key: 'bold', label: '加粗', input: 'switch' },
      { key: 'lineHeight', label: '行高(倍数)', input: 'number', min: 1, max: 3, step: 0.1, desc: '如 1.4、1.6' },
      { key: 'maxLines', label: '最多行数', input: 'number', min: 0, max: 10, desc: '0 = 不限；2 为两行摘要，超出自动省略' },
      { key: 'italic', label: '斜体', input: 'switch' },
      { key: 'underline', label: '下划线', input: 'switch' },
      { key: 'strikethrough', label: '删除线', input: 'switch' },
    ],
  },
  {
    type: 'module-title', name: '模块标题', icon: 'Menu', color: '#0891b2', bg: '#e0f5fa', group: '内容组件', kind: 'content',
    defaults: { title: '模块标题', icon: '', showMore: false, moreText: '更多', moreLink: '', align: 'left' },
    fields: [
      { key: 'title', label: '标题文本', input: 'text', desc: '如 热门圈子、最新动态' },
      { key: 'icon', label: '左侧图标', input: 'image', shape: 'square' },
      { key: 'align', label: '对齐', input: 'select', options: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }], desc: '居中时不显示「更多」' },
      { key: 'showMore', label: '显示更多', input: 'switch', desc: '有列表详情页时开启' },
      { key: 'moreText', label: '更多文案', input: 'text' },
      { key: 'moreLink', label: '更多点击动作', input: 'link' },
    ],
  },
  {
    type: 'image', name: '图片', icon: 'Picture', color: '#7c3aed', bg: '#f1ebfd', group: '内容组件', kind: 'content',
    defaults: { image: '', linkUrl: '', mode: 'aspectFill', mask: false, maskColor: '#000000', maskOpacity: 0.4, badge: '', badgePosition: 'top-right', preview: false },
    fields: [
      { key: 'image', label: '图片', input: 'image', shape: 'wide' },
      { key: 'mode', label: '显示模式', input: 'select', options: [{ label: '裁剪填充', value: 'aspectFill' }, { label: '完整显示', value: 'aspectFit' }, { label: '宽度撑满', value: 'widthFix' }] },
      linkField,
      { key: 'preview', label: '点击预览', input: 'switch', desc: '与点击动作互斥：设了跳转不再放大预览' },
      { key: 'mask', label: '启用遮罩', input: 'switch', desc: '活动 Banner 上加文字层时使用' },
      { key: 'maskColor', label: '遮罩颜色', input: 'color' },
      { key: 'maskOpacity', label: '遮罩透明度', input: 'number', min: 0, max: 1, step: 0.1 },
      { key: 'badge', label: '角标文字', input: 'text', desc: '如 HOT、新；1~3 个字为宜' },
      { key: 'badgePosition', label: '角标位置', input: 'select', options: [{ label: '右上', value: 'top-right' }, { label: '左上', value: 'top-left' }, { label: '右下', value: 'bottom-right' }, { label: '左下', value: 'bottom-left' }] },
    ],
  },
  {
    type: 'button', name: '按钮', icon: 'Pointer', color: '#0891b2', bg: '#e0f5fa', group: '内容组件', kind: 'content',
    defaults: { text: '按钮', linkUrl: '', background: '#36A853', color: '#FFFFFF', radius: 999, outline: false },
    fields: [
      { key: 'text', label: '按钮文字', input: 'text', desc: '如 立即参与、查看更多' },
      linkField,
      { key: 'background', label: '背景色', input: 'color', desc: '主按钮：深色背景 + 白字 + 大圆角' },
      { key: 'color', label: '文字颜色', input: 'color' },
      { key: 'radius', label: '圆角(rpx)', input: 'number', min: 0, max: 999, desc: '40~50 为胶囊形' },
      { key: 'outline', label: '镂空', input: 'switch', desc: '透明底、保留边框与文字，次要按钮' },
    ],
  },
  {
    type: 'divider', name: '分割线', icon: 'Minus', color: '#64748b', bg: '#f0f1f3', group: '内容组件', kind: 'content',
    defaults: {},
    fields: [],
  },
  // 营销组件
  {
    type: 'banner', name: '轮播图', icon: 'PictureFilled', color: '#ef4444', bg: '#fdecec', group: '营销组件', kind: 'content',
    defaults: { autoplay: true, interval: 3000, height: 280, indicatorDots: true, images: [] },
    fields: [
      { key: 'autoplay', label: '自动播放', input: 'switch' },
      { key: 'interval', label: '播放间隔(ms)', input: 'number', min: 1000, step: 1000 },
      { key: 'height', label: '轮播高度(rpx)', input: 'number', min: 120, max: 750, desc: '默认 280；真机 page-renderer 按 cfg.height 渲染' },
      { key: 'indicatorDots', label: '显示指示点', input: 'switch' },
      {
        key: 'images', label: '轮播图片', input: 'items', addText: '+ 添加图片',
        itemDefaults: { image: '', linkUrl: '' },
        itemFields: [
          { key: 'image', label: '图片', input: 'image', shape: 'wide' },
          { key: 'linkUrl', label: '跳转链接', input: 'text', placeholder: '可选' },
        ],
      },
    ],
  },
  {
    type: 'grid-menu', name: '金刚区', icon: 'Grid', color: '#f59e0b', bg: '#fef5e7', group: '营销组件', kind: 'content',
    defaults: { columns: 4, items: [] },
    fields: [
      { key: 'columns', label: '列数', input: 'number', min: 3, max: 5 },
      {
        key: 'items', label: '菜单项', input: 'items', addText: '+ 添加菜单',
        itemDefaults: { icon: '', text: '', linkUrl: '' },
        itemFields: [
          { key: 'icon', label: '图标', input: 'image', shape: 'square' },
          { key: 'text', label: '名称', input: 'text' },
          { key: 'linkUrl', label: '跳转链接', input: 'text' },
        ],
      },
    ],
  },
  {
    type: 'announcement', name: '公告', icon: 'Bell', color: '#10b981', bg: '#e7f8f2', group: '营销组件', kind: 'content',
    defaults: { interval: 4000, items: [] },
    fields: [
      { key: 'interval', label: '播放间隔(ms)', input: 'number', min: 2000, step: 1000 },
      {
        key: 'items', label: '公告内容', input: 'items', addText: '+ 添加公告',
        itemDefaults: { text: '', linkUrl: '' },
        itemFields: [
          { key: 'text', label: '公告文字', input: 'text' },
          { key: 'linkUrl', label: '跳转链接', input: 'text', placeholder: '可选' },
        ],
      },
    ],
  },
  {
    type: 'countdown', name: '倒计时', icon: 'Timer', color: '#ef4444', bg: '#fdecec', group: '营销组件', kind: 'content',
    defaults: { title: '距离活动结束', endTime: '', titleColor: '#1D271F', numColor: '#FFFFFF', bgColor: '#FF4D4F' },
    fields: [
      { key: 'title', label: '标题', input: 'text', desc: '如 距秒杀结束、活动倒计时' },
      { key: 'endTime', label: '截止时间', input: 'text', placeholder: '2026-12-31 23:59', desc: '格式 YYYY-MM-DD HH:mm；留空画布显示未设置' },
      { key: 'titleColor', label: '标题颜色', input: 'color' },
      { key: 'numColor', label: '数字颜色', input: 'color' },
      { key: 'bgColor', label: '数字方块背景', input: 'color' },
    ],
  },
  {
    type: 'coupon', name: '优惠券', icon: 'Ticket', color: '#f59e0b', bg: '#fef5e7', group: '营销组件', kind: 'content',
    defaults: { amount: '20', condition: '满100元可用', btnText: '立即领取', linkUrl: '', bgColor: '#FF6B35', textColor: '#FFFFFF' },
    fields: [
      { key: 'amount', label: '金额(元)', input: 'text', desc: '只填数字，如 20、5.5' },
      { key: 'condition', label: '条件文案', input: 'text', placeholder: '如 满100元可用 / 无门槛' },
      { key: 'btnText', label: '按钮文字', input: 'text' },
      { key: 'linkUrl', label: '按钮点击动作', input: 'link' },
      { key: 'bgColor', label: '卡片配色', input: 'color' },
      { key: 'textColor', label: '文字颜色', input: 'color' },
    ],
  },
  {
    type: 'activity-banner', name: '活动横幅', icon: 'Flag', color: '#8b5cf6', bg: '#f1ebfd', group: '营销组件', kind: 'content',
    defaults: { title: '夏日狂欢节', subtitle: '全场好物 低至 5 折', background: '', bgColor: '#FF4D4F', bgColor2: '#FF9A3D', btnText: '立即参与', linkUrl: '', textColor: '#FFFFFF' },
    fields: [
      { key: 'title', label: '标题', input: 'text', desc: '大字营销标题' },
      { key: 'subtitle', label: '副标题', input: 'text' },
      { key: 'background', label: '背景图', input: 'image', shape: 'wide', desc: '设了背景图则覆盖渐变底色' },
      { key: 'bgColor', label: '渐变起始色', input: 'color' },
      { key: 'bgColor2', label: '渐变结束色', input: 'color' },
      { key: 'btnText', label: '按钮文字', input: 'text' },
      { key: 'linkUrl', label: '按钮点击动作', input: 'link' },
      { key: 'textColor', label: '文字颜色', input: 'color' },
    ],
  },
  {
    type: 'tmagic-page', name: '活动页', icon: 'MagicStick', color: '#7c3aed', bg: '#f1ebfd', group: '营销组件', kind: 'content',
    defaults: { slug: '' },
    fields: [
      { key: 'slug', label: '活动页标识 (slug)', input: 'text', placeholder: '活动页标识，如 summer-sale', desc: '在「设计器 → 活动页」里创建；画布内实时预览' },
    ],
  },
  // 业务组件
  {
    type: 'navbar', name: '顶部导航', icon: 'House', color: '#2563eb', bg: '#e9effd', group: '业务组件', kind: 'content',
    defaults: { title: '首页', showBack: false },
    fields: [
      { key: 'title', label: '标题', input: 'text' },
      { key: 'showBack', label: '显示返回按钮', input: 'switch' },
    ],
  },
  {
    type: 'search', name: '搜索框', icon: 'Search', color: '#64748b', bg: '#f0f1f3', group: '业务组件', kind: 'content',
    defaults: { placeholder: '搜索校园生活', linkUrl: '' },
    fields: [
      { key: 'placeholder', label: '占位文字', input: 'text' },
      { key: 'linkUrl', label: '跳转链接', input: 'text', placeholder: '可选，点击搜索框跳转' },
    ],
  },
  {
    type: 'filter-tabs', name: '筛选标签', icon: 'Filter', color: '#0ea5e9', bg: '#e0f2fe', group: '业务组件', kind: 'content', unique: true,
    defaults: { filterLinkKey: 'home-feed', items: [{ label: '推荐' }, { label: '最新' }, { label: '视频' }] },
    fields: [
      { key: 'filterLinkKey', label: '联动标识', input: 'text', desc: '须与下方 Feed 列表的联动标识完全一致，切换 Tab 时列表随之刷新' },
      {
        key: 'items', label: '标签项', input: 'items', addText: '+ 添加标签',
        itemDefaults: { label: '' },
        itemFields: [{ key: 'label', label: '显示文字', input: 'text', placeholder: '如 推荐、最新、视频' }],
      },
    ],
  },
  {
    type: 'hot-posts', name: '热门精选', icon: 'TrendCharts', color: '#ef4444', bg: '#fdecec', group: '业务组件', kind: 'dynamic', mutexGroup: 'main-feed',
    defaults: { limit: 5, previewType: 'single', filterLinkKey: '' },
    fields: [
      { key: 'limit', label: '显示数量', input: 'number', min: 1, max: 20 },
      { key: 'previewType', label: '预览示例', input: 'select', desc: '只改画布演示内容，不影响线上数据', options: [{ label: '默认', value: 'default' }, { label: '单图', value: 'single' }, { label: '多图', value: 'multi' }, { label: '视频', value: 'video' }, { label: '音频', value: 'audio' }] },
      { key: 'filterLinkKey', label: '联动标识', input: 'text', desc: '与筛选标签填相同标识时，切换 Tab 会刷新本列表' },
    ],
  },
  {
    type: 'ranking', name: '榜单', icon: 'Trophy', color: '#f59e0b', bg: '#fef5e7', group: '业务组件', kind: 'dynamic', mutexGroup: 'main-feed',
    defaults: { types: ['user', 'post'] },
    fields: [],
  },
  {
    type: 'recommend-merchant', name: '推荐商家', icon: 'Shop', color: '#10b981', bg: '#e7f8f2', group: '业务组件', kind: 'dynamic', mutexGroup: 'main-feed',
    defaults: { limit: 6 },
    fields: [{ key: 'limit', label: '显示数量', input: 'number', min: 1, max: 20 }],
  },
  {
    type: 'feed', name: '信息流', icon: 'List', color: '#2563eb', bg: '#e9effd', group: '业务组件', kind: 'dynamic', mutexGroup: 'main-feed',
    defaults: { style: 'waterfall', previewType: 'single', filterLinkKey: '' },
    fields: [
      { key: 'style', label: '信息流样式', input: 'select', options: [{ label: '瀑布流', value: 'waterfall' }, { label: '列表', value: 'list' }, { label: '双列', value: 'grid' }] },
      { key: 'previewType', label: '预览示例', input: 'select', desc: '只改画布演示内容，不影响线上数据', options: [{ label: '默认', value: 'default' }, { label: '单图', value: 'single' }, { label: '多图', value: 'multi' }, { label: '视频', value: 'video' }, { label: '音频', value: 'audio' }] },
      { key: 'filterLinkKey', label: '联动标识', input: 'text', desc: '与筛选标签填相同标识时，切换 Tab 会刷新本列表' },
    ],
  },
]

// ============ 消息页 ============
const messageWidgets: WidgetDef[] = [
  { type: 'private-chat', name: '私信入口', icon: 'ChatDotRound', color: '#2563eb', bg: '#e9effd', group: '消息模块', kind: 'dynamic', defaults: {}, fields: [] },
  { type: 'group-chat', name: '群聊入口', icon: 'User', color: '#10b981', bg: '#e7f8f2', group: '消息模块', kind: 'dynamic', defaults: {}, fields: [] },
  { type: 'system-notice', name: '系统通知', icon: 'Bell', color: '#f59e0b', bg: '#fef5e7', group: '消息模块', kind: 'dynamic', defaults: {}, fields: [] },
  { type: 'customer-service', name: '客服入口', icon: 'Service', color: '#7c3aed', bg: '#f1ebfd', group: '消息模块', kind: 'dynamic', defaults: {}, fields: [] },
  { type: 'official-notice', name: '官方公告', icon: 'Notification', color: '#ef4444', bg: '#fdecec', group: '消息模块', kind: 'dynamic', defaults: {}, fields: [] },
]

// ============ 我的页 ============
const profileWidgets: WidgetDef[] = [
  {
    type: 'user-card', name: '用户卡片', icon: 'UserFilled', color: '#2563eb', bg: '#e9effd', group: '我的页模块', kind: 'dynamic',
    defaults: { showAvatar: true, showName: true },
    fields: [
      { key: 'showAvatar', label: '显示头像', input: 'switch' },
      { key: 'showName', label: '显示昵称', input: 'switch' },
    ],
  },
  { type: 'wallet', name: '钱包入口', icon: 'Wallet', color: '#f59e0b', bg: '#fef5e7', group: '我的页模块', kind: 'dynamic', defaults: {}, fields: [] },
  { type: 'orders', name: '订单入口', icon: 'Tickets', color: '#2563eb', bg: '#e9effd', group: '我的页模块', kind: 'dynamic', defaults: { types: ['mall', 'errand', 'groupbuy'] }, fields: [] },
  { type: 'certification', name: '认证入口', icon: 'Checked', color: '#10b981', bg: '#e7f8f2', group: '我的页模块', kind: 'dynamic', defaults: {}, fields: [] },
  { type: 'merchant-entry', name: '商家入口', icon: 'Shop', color: '#ef4444', bg: '#fdecec', group: '我的页模块', kind: 'dynamic', defaults: {}, fields: [] },
  { type: 'rider-entry', name: '骑手入口', icon: 'Bicycle', color: '#0891b2', bg: '#e0f5fa', group: '我的页模块', kind: 'dynamic', defaults: {}, fields: [] },
  { type: 'share-earn', name: '分享赚', icon: 'Share', color: '#7c3aed', bg: '#f1ebfd', group: '我的页模块', kind: 'dynamic', defaults: {}, fields: [] },
  { type: 'sign-in', name: '每日签到', icon: 'Calendar', color: '#f59e0b', bg: '#fef5e7', group: '我的页模块', kind: 'dynamic', defaults: {}, fields: [] },
  { type: 'settings', name: '设置入口', icon: 'Setting', color: '#64748b', bg: '#f0f1f3', group: '我的页模块', kind: 'dynamic', defaults: {}, fields: [] },
]

// ============ 容器页（任务大厅）============
/** 任务大厅顶部运营位：复用首页内容型组件（不含信息流类占位） */
const CONTAINER_TYPES = ['navbar', 'search', 'banner', 'grid-menu', 'announcement', 'module-title', 'text', 'image', 'button', 'divider']
const containersWidgets: WidgetDef[] = homeWidgets.filter((w) => CONTAINER_TYPES.includes(w.type))

export const pageSchemas: Record<string, PageSchema> = {
  home: {
    widgets: homeWidgets,
    settings: [
      { key: 'background', label: '页面背景色', input: 'color' },
      { key: 'showAuthGuide', label: '显示认证引导', input: 'switch' },
      { key: 'showDistanceTip', label: '显示距离提示', input: 'switch' },
    ],
  },
  message: {
    widgets: messageWidgets,
    settings: [
      { key: 'showUnreadCount', label: '显示未读消息数', input: 'switch' },
      { key: 'showMessagePreview', label: '显示消息预览', input: 'switch' },
    ],
  },
  profile: {
    widgets: profileWidgets,
    settings: [
      { key: 'showEditProfile', label: '显示编辑资料', input: 'switch' },
      { key: 'showQrcode', label: '显示二维码名片', input: 'switch' },
    ],
  },
  containers: {
    widgets: containersWidgets,
    settings: [
      { key: 'background', label: '页面背景色', input: 'color' },
    ],
  },
}
