/**
 * 品牌默认配置
 *
 * 后续如果接入后台配置接口，可在此处扩展为异步加载：
 * export async function loadBrandConfig() { ... }
 *
 * 当前为静态默认配置，保证登录页在无网络/无配置时也能正常展示。
 */
export const defaultBrandConfig = {
  /** 应用名称（小程序侧品牌名） */
  appName: '灵萌生活',

  /** 后台系统名称 */
  adminName: '灵萌运营管理后台',

  /** 后台登录页标题 */
  loginTitle: '运营管理后台',

  /** 后台登录页副标题 */
  loginSubtitle: '登录后管理内容、用户、交易与运营配置',

  /** Logo URL，为空时使用文字标识 */
  logo: '',

  /** 品牌主色（hex） */
  primaryColor: '#3B82F6',

  /** 品牌辅助色（hex） */
  accentColor: '#10B981',

  /** 登录页左侧 slogan */
  slogan: '管理内容、用户、交易与运营配置',

  /** 能力点列表（登录页左侧展示） */
  features: [
    { icon: 'FileTextOutlined', title: '内容审核', desc: '帖子、评论、举报一站式处理' },
    { icon: 'TeamOutlined', title: '用户运营', desc: '用户画像、标签、风控管理' },
    { icon: 'SafetyOutlined', title: '交易风控', desc: '订单、支付、提现安全审计' },
  ] as { icon: string; title: string; desc: string }[],
}

/** 当前使用的品牌配置（后续可替换为接口返回） */
export function getBrandConfig() {
  // TODO: 后续可改为从后台配置接口读取
  // const remote = await fetchBrandConfig()
  // return { ...defaultBrandConfig, ...remote }
  return { ...defaultBrandConfig }
}
