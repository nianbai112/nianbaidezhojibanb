export interface DriftBottle {
  id: string
  userId: string
  content: string
  images?: string[]
  voice?: string
  isAnonymous: boolean
  throwLat?: number
  throwLng?: number
  pickCount: number
  replyCount: number
  createdAt: string
  user?: { id: string; nickname: string; avatar: string }
}
