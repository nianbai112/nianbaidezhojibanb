import { ConflictException } from '@nestjs/common';
import { loginIdentityKey } from '../auth/app-identity';

const conflict = (): never => {
  throw new ConflictException({ code: 'ACCOUNT_IDENTITY_CONFLICT', message: '公众号身份归属冲突，请联系平台核查' });
};
const valid = (v: unknown): v is string => typeof v === 'string' && !!v && v.length <= 191 && !/[\u0000-\u0020]/.test(v);

/** Lookup only: a verified callback must never create a new business account. */
export async function bindOfficialSubscriber(prisma: any, input: {
  officialOpenid: string; eventKey: string; userId?: string; unionId?: string; unionScope?: string;
}): Promise<boolean> {
  if (!valid(input.officialOpenid)) return false;
  if (!input.userId && (!valid(input.unionId) || !valid(input.unionScope))) return false;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        let user: any;
        if (input.userId) {
          user = await tx.user.findUnique({ where: { id: input.userId } });
        } else {
          const key = loginIdentityKey('wechat-union', input.unionScope!, input.unionId!);
          const union = await tx.userAuthIdentity.findUnique({ where: { identityKey: key }, include: { user: true } });
          if (union && (union.provider !== 'wechat-union' || union.appId !== input.unionScope || union.subject !== input.unionId)) conflict();
          const legacy = await tx.user.findMany({ where: { unionid: input.unionId }, take: 2 });
          if (legacy.length > 1 || legacy.some((u: any) => u.unionid !== input.unionId)) conflict();
          const candidates = [union?.user, ...legacy].filter(Boolean);
          if (new Set(candidates.map((u: any) => u.id)).size > 1) conflict();
          user = candidates[0];
          if (!user) return false;
          if (user.unionid && user.unionid !== input.unionId) conflict();
          const otherUnions = await tx.userAuthIdentity.findMany({ where: { userId: user.id, provider: 'wechat-union' } });
          if (otherUnions.some((u: any) => u.identityKey !== key)) conflict();
          if (user.status !== 'ACTIVE' || user.deletedAt) return false;
          // Reserve the same unique ownership key used by mini/App login in this transaction.
          if (!union) await tx.userAuthIdentity.create({ data: {
            identityKey: key, provider: 'wechat-union', appId: input.unionScope!, subject: input.unionId!, userId: user.id,
          } });
        }
        if (!user || user.status !== 'ACTIVE' || user.deletedAt) return false;
        const binding = await tx.wechatOfficialBinding.findUnique({ where: { officialOpenid: input.officialOpenid } });
        if (binding && binding.userId !== user.id) conflict();
        await tx.wechatOfficialBinding.upsert({
          where: { userId: user.id },
          create: { userId: user.id, officialOpenid: input.officialOpenid, subscribe: true, subscribeAt: new Date(), qrScene: input.eventKey },
          update: { officialOpenid: input.officialOpenid, subscribe: true, subscribeAt: new Date(), unsubscribedAt: null },
        });
        return true;
      }, { isolationLevel: 'Serializable' });
    } catch (error: any) {
      if (!['P2002', 'P2034'].includes(error?.code)) throw error;
      if (attempt === 3) conflict();
    }
  }
  return false;
}
