/** 系统配置分组 */
export type ConfigGroup =
  | 'basic'           // 小程序基础配置
  | 'home'            // 首页配置
  | 'region'          // 区域配置
  | 'post'            // 发帖配置
  | 'audit'           // 审核配置
  | 'upload'          // 上传配置
  | 'share'           // 分享配置
  | 'ad'              // 广告配置
  | 'ai'              // AI 配置
  | 'robot'           // 机器人配置
  | 'sensitive_word'  // 敏感词配置

/** 配置项 */
export interface ConfigItem {
  id: number
  key: string
  value: string
  type: 'string' | 'number' | 'boolean' | 'json' | 'image' | 'secret'
  group: ConfigGroup
  label: string
  description: string
  sort: number
  regionId: number | null
  isSecret: boolean
  options?: { label: string; value: string }[]
}

/** 配置保存请求 */
export interface ConfigSaveRequest {
  configs: { key: string; value: string }[]
}

/** 敏感词 */
export interface SensitiveWord {
  id: number
  word: string
  category: 'politics' | 'porn' | 'violence' | 'abuse' | 'ad' | 'other'
  level: 'block' | 'audit' | 'replace'
  replaceWord: string
  status: 0 | 1
  createdAt: string
}

/** 广告 */
export interface Advertisement {
  id: number
  name: string
  image: string
  linkType: 'url' | 'post' | 'product' | 'topic' | 'none'
  linkValue: string
  position: 'home_banner' | 'home_popup' | 'feed' | 'detail' | 'splash'
  regionId: number
  startTime: string
  endTime: string
  priority: number
  status: 0 | 1
  viewCount: number
  clickCount: number
  createdAt: string
}
