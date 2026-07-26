import { PrismaService } from '../services/prisma.service';

/** 私聊会话去重键，与成员顺序无关 */
export function privatePairKey(userIdA: string, userIdB: string): string {
  return ['private', ...[String(userIdA), String(userIdB)].sort()].join(':');
}

/**
 * 查找两人之间的私聊会话。
 * 优先用 pairKey 唯一键命中；对未回填 pairKey 的存量会话按创建时间取最早
 * 一个，保证并发/重复会话场景下的读取结果稳定。
 */
export async function findPrivateConversation(
  prisma: PrismaService,
  userIdA: string,
  userIdB: string,
) {
  const byKey = await prisma.conversation.findUnique({
    where: { pairKey: privatePairKey(userIdA, userIdB) },
  });
  if (byKey) return byKey;
  return prisma.conversation.findFirst({
    where: {
      type: 'private',
      AND: [
        { members: { some: { userId: userIdA } } },
        { members: { some: { userId: userIdB } } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
}

export interface CreatePrivateConversationOptions {
  /** 创建会话时附加的字段（title/avatar/lastMessage 等） */
  conversationData?: Record<string, any>;
  /** 按 userId 附加的成员字段（role/nickName 等） */
  memberExtras?: Record<string, Record<string, any>>;
}

/**
 * 查找或创建两人之间的私聊会话。
 * 通过 pairKey 唯一约束保证并发下（双方同时发第一条消息、单侧连发）
 * 不会创建出重复会话：创建撞唯一键时回读已存在的会话。
 */
export async function findOrCreatePrivateConversation(
  prisma: PrismaService,
  userIdA: string,
  userIdB: string,
  options: CreatePrivateConversationOptions = {},
) {
  const pairKey = privatePairKey(userIdA, userIdB);

  const existing = await findPrivateConversation(prisma, userIdA, userIdB);
  if (existing) {
    if (!existing.pairKey) {
      // 回填存量会话的 pairKey；撞键说明并发请求已占用，以键上的会话为准
      try {
        return await prisma.conversation.update({
          where: { id: existing.id },
          data: { pairKey },
        });
      } catch {
        const byKey = await prisma.conversation.findUnique({ where: { pairKey } });
        if (byKey) return byKey;
      }
    }
    return existing;
  }

  const memberIds = userIdA === userIdB ? [userIdA] : [userIdA, userIdB];
  try {
    return await prisma.conversation.create({
      data: {
        type: 'private',
        pairKey,
        ...(options.conversationData || {}),
        members: {
          create: memberIds.map((userId) => ({
            userId,
            ...(options.memberExtras?.[userId] || {}),
          })),
        },
      },
    });
  } catch (err: any) {
    // P2002: 并发下另一请求已抢先创建同一 pairKey 的会话
    if (err?.code === 'P2002') {
      const byKey = await prisma.conversation.findUnique({ where: { pairKey } });
      if (byKey) return byKey;
    }
    throw err;
  }
}
