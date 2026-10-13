import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { isAppLoginOpenid, isPhoneLoginOpenid } from '../../common/wechat-identity';

export type VerifiedLoginIdentity = {
  provider: 'mp-weixin' | 'app-weixin' | 'app-apple';
  appId: string;
  subject: string;
  unionId?: string;
  // Set only by server configuration after the App and mini-program are bound
  // to the same WeChat Open Platform account. Never accept this from the client.
  unionScope?: string;
  verifiedPhone?: string;
};

export const loginIdentityKey = (provider: string, appId: string, subject: string): string =>
  createHash('sha256').update(JSON.stringify([provider, appId, subject])).digest('hex');

const conflict = (): never => {
  throw new ConflictException({ code: 'ACCOUNT_IDENTITY_CONFLICT', message: '该登录身份关联了不同账号，请联系平台核查，不能自动合并' });
};
const placeholder = (openid: string): boolean => isAppLoginOpenid(openid) || isPhoneLoginOpenid(openid);
const validIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 191 && value.trim() === value && !/[\u0000-\u0020]/.test(value);

/** Only call with provider-verified identities. No client ID, email or nickname matching. */
export async function resolveLoginIdentity(prisma: PrismaService, identity: VerifiedLoginIdentity,
  finalize?: (tx: any, user: any) => Promise<any>): Promise<any> {
  if (!validIdentifier(identity.appId) || !validIdentifier(identity.subject) ||
    (identity.unionId !== undefined && !validIdentifier(identity.unionId)) ||
    (identity.unionScope !== undefined && !validIdentifier(identity.unionScope))) {
    throw new BadRequestException('登录平台返回的身份不完整，请重新授权');
  }
  if (identity.provider !== 'mp-weixin' && identity.verifiedPhone) throw new BadRequestException('无效的手机号绑定来源');
  if (identity.provider === 'mp-weixin' && placeholder(identity.subject)) throw new BadRequestException('无效的微信身份');
  const key = loginIdentityKey(identity.provider, identity.appId, identity.subject);
  const unionId = identity.provider !== 'app-apple' && identity.unionScope ? identity.unionId : undefined;
  const unionKey = unionId ? loginIdentityKey('wechat-union', identity.unionScope!, unionId) : undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Cast only the new delegate until deployments regenerate their Prisma client.
        // A missing table/client fails; there is no legacy account-creation fallback.
        const identities = (tx as any).userAuthIdentity;
        const channel = await identities.findUnique({ where: { identityKey: key }, include: { user: true } });
        const union = unionKey ? await identities.findUnique({ where: { identityKey: unionKey }, include: { user: true } }) : null;
        if (channel && (channel.provider !== identity.provider || channel.appId !== identity.appId || channel.subject !== identity.subject)) conflict();
        if (union && (union.provider !== 'wechat-union' || union.appId !== identity.unionScope || union.subject !== unionId)) conflict();
        const miniUser = identity.provider === 'mp-weixin'
          ? await tx.user.findUnique({ where: { openid: identity.subject } }) : null;
        // SQL collation may be case-insensitive. Never accept a non-exact match.
        if (miniUser && miniUser.openid !== identity.subject) conflict();
        const legacy = unionId ? await tx.user.findMany({ where: { unionid: unionId }, take: 2 }) : [];
        if (legacy.length > 1 || legacy.some((u) => u.unionid !== unionId)) conflict();
        const phoneUsers = identity.verifiedPhone
          ? await tx.user.findMany({ where: { phone: identity.verifiedPhone, status: { not: 'DELETED' } }, take: 2 }) : [];
        if (phoneUsers.length > 1) conflict();
        const candidates = [channel?.user, union?.user, miniUser, ...legacy, ...phoneUsers].filter(Boolean);
        if (new Set(candidates.map((u) => u.id)).size > 1) conflict();
        let user = candidates[0];
        if (user && !['ACTIVE', 'BANNED'].includes(user.status)) {
          throw new UnauthorizedException(user.status === 'DELETED' ? '账号已注销' : '账号已被禁用，暂无法登录');
        }
        if (user?.unionid && unionId && user.unionid !== unionId) conflict();
        if (user && identity.provider === 'mp-weixin' && !placeholder(user.openid) && user.openid !== identity.subject) conflict();
        if (user && unionKey) {
          const existingUnions = await identities.findMany({ where: { userId: user.id, provider: 'wechat-union' } });
          if (existingUnions.some((entry: any) => entry.identityKey !== unionKey)) conflict();
        }

        if (!user) {
          user = await tx.user.create({ data: {
            openid: identity.provider === 'mp-weixin' ? identity.subject : `app_login_${key}`,
            unionid: unionId || null,
            phone: identity.verifiedPhone || null,
            nickname: '校园用户',
            profile: { create: {} }, settings: { create: {} },
          } });
        } else {
          user = await tx.user.update({ where: { id: user.id }, data: {
            ...(identity.provider === 'mp-weixin' && placeholder(user.openid) ? { openid: identity.subject } : {}),
            ...(unionId && !user.unionid ? { unionid: unionId } : {}),
            ...(identity.verifiedPhone ? { phone: identity.verifiedPhone } : {}),
          } });
        }
        if (!channel) await identities.create({ data: {
          identityKey: key, provider: identity.provider, appId: identity.appId, subject: identity.subject, userId: user.id,
        } });
        if (unionKey && !union) await identities.create({ data: {
          identityKey: unionKey, provider: 'wechat-union', appId: identity.unionScope!, subject: unionId!, userId: user.id,
        } });
        return finalize ? await finalize(tx, user) : user;
      }, { isolationLevel: 'Serializable' });
    } catch (error: any) {
      // Re-evaluate all ownership evidence after a concurrent creation/serialization conflict.
      if (!['P2002', 'P2034'].includes(error?.code)) throw error;
      if (attempt === 3) conflict();
    }
  }
}
