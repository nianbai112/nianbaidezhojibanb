/** 机器人账号 */
export interface RobotAccount {
  id: number
  nickname: string
  avatar: string
  gender: 0 | 1 | 2
  city: string
  tags: string[]
  persona: string
  description: string
  status: 0 | 1
  regionId: number
  regionName: string
  postCount: number
  commentCount: number
  createdAt: string
}

/** AI 发帖任务 */
export interface RobotPostTask {
  id: number
  robotId: number
  robotNickname: string
  regionId: number
  circleId: number
  circleName: string
  topicIds: number[]
  prompt: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  resultTitle: string
  resultContent: string
  resultImages: string[]
  errorMessage: string
  scheduledAt: string
  executedAt: string
  createdAt: string
}

/** AI 评论任务 */
export interface RobotCommentTask {
  id: number
  postId: number
  postTitle: string
  robotIds: number[]
  robotNicknames: string[]
  direction: string
  intervalSeconds: number
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  generatedCount: number
  totalCount: number
  errorMessage: string
  results: RobotCommentResult[]
  scheduledAt: string
  createdAt: string
}

export interface RobotCommentResult {
  robotId: number
  content: string
  status: 'pending' | 'posted' | 'failed'
}

/** AI 提示词模板 */
export interface PromptTemplate {
  id: number
  name: string
  type: 'post' | 'comment' | 'message' | 'audit' | 'merchant'
  content: string
  variables: string[]
  status: 0 | 1
  createdAt: string
}

/** AI 配置 */
export interface AIConfig {
  enabled: boolean
  provider: 'openai' | 'deepseek' | 'zhipu' | 'custom'
  apiKey: string
  apiEndpoint: string
  model: string
  temperature: number
  maxTokens: number
}

/** 机器人运营配置 */
export interface RobotConfig {
  postDailyLimit: number
  commentDailyLimit: number
  defaultInterval: number
  autoAudit: boolean
  enabledRegions: number[]
}
