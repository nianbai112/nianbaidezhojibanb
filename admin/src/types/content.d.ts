/** 帖子类型 */
export type PostType = 'text' | 'image' | 'video' | 'vote' | 'cocreate'

/** 审核状态 */
export type AuditStatus = 'pending' | 'approved' | 'rejected'

/** 帖子 */
export interface Post {
  id: number
  userId: number
  userNickname: string
  userAvatar: string
  topicId?: number
  topicName?: string
  type: PostType
  title: string
  content: string
  images: string[]
  videoUrl?: string
  location?: string
  isTop: boolean
  isHot: boolean
  isEssence: boolean
  auditStatus: AuditStatus
  auditRemark: string
  auditBy: number
  auditAt: string
  viewCount: number
  likeCount: number
  commentCount: number
  shareCount: number
  reportCount: number
  status: 0 | 1
  createdAt: string
}

/** 评论 */
export interface Comment {
  id: number
  postId: number
  parentId: number
  userId: number
  userNickname: string
  userAvatar: string
  content: string
  images: string[]
  likeCount: number
  replyCount: number
  auditStatus: AuditStatus
  status: 0 | 1
  createdAt: string
}

/** 话题/圈子 */
export interface Topic {
  id: number
  name: string
  cover: string
  description: string
  category: string
  postCount: number
  memberCount: number
  todayPostCount: number
  isHot: boolean
  isOfficial: boolean
  sort: number
  status: 0 | 1
  createdAt: string
}

/** 圈子 */
export type Circle = Topic

/** 举报 */
export interface Report {
  id: number
  reporterId: number
  reporterName: string
  targetType: 'post' | 'comment' | 'user' | 'topic'
  targetId: number
  targetTitle: string
  reason: string
  description: string
  images: string[]
  status: 'pending' | 'handled' | 'ignored'
  handleResult: string
  handlerId: number
  handledAt: string
  createdAt: string
}

/** 投票选项 */
export interface VoteOption {
  id: number
  text: string
  image?: string
  count: number
}

/** 投票帖 */
export interface VotePost extends Post {
  type: 'vote'
  voteOptions: VoteOption[]
  totalVotes: number
  endTime: string
  isMultiSelect: boolean
}

/** 共创帖 */
export interface CocreatePost extends Post {
  type: 'cocreate'
  contributors: {
    userId: number
    nickname: string
    avatar: string
    content: string
  }[]
}
