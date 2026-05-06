export interface Club {
  id: string
  regionId?: string
  name: string
  cover?: string
  description?: string
  leaderId: string
  memberCount: number
  status: string
  createdAt: string
  members?: ClubMember[]
  _count?: { members: number }
}

export interface ClubMember {
  id: string
  clubId: string
  userId: string
  userName?: string
  userAvatar?: string
  role: string
  createdAt: string
}
