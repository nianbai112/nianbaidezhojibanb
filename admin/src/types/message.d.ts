/** 会话类型 */
export type ConversationType = 'private' | 'group'

/** 消息类型 */
export type MessageType = 'text' | 'image' | 'voice' | 'video' | 'file' | 'system'

/** 会话 */
export interface Conversation {
  id: number
  type: ConversationType
  name: string            // 群聊名或对方昵称
  avatar: string
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  participants: ConversationUser[]
  status: 0 | 1
}

export interface ConversationUser {
  userId: number
  nickname: string
  avatar: string
  role: 'owner' | 'admin' | 'member'
}

/** 消息 */
export interface Message {
  id: number
  conversationId: number
  senderId: number
  senderNickname: string
  senderAvatar: string
  type: MessageType
  content: string
  imageUrl?: string
  voiceUrl?: string
  videoUrl?: string
  fileUrl?: string
  fileName?: string
  isRevoked: boolean
  isViolation: boolean
  violationReason: string
  createdAt: string
}

/** 违规消息 */
export interface ViolationMessage extends Message {
  reportCount: number
  handledStatus: 'pending' | 'blocked' | 'ignored'
  handlerId: number
  handledAt: string
}

/** 未读统计 */
export interface UnreadStats {
  privateUnread: number
  groupUnread: number
  systemUnread: number
  totalUnread: number
}
