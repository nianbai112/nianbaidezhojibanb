import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

type UserAction = 'post' | 'comment' | 'like' | 'follow' | 'report' | 'profile';
type StudentProtectedAction = '发布笔记' | '修改笔记' | '评论' | '创建圈子' | '加入圈子' | '邀请圈子成员' | '创建圈子群聊' | '创建圈子话题' | '发送群聊消息' | string;

@Injectable()
export class UserAccessPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private readonly defaultDailyLimits: Record<UserAction, number> = {
    post: 100,
    comment: 500,
    like: 1000,
    follow: 300,
    report: 100,
    profile: 80,
  };

  private formatMuteTime(value: Date) {
    return value.toISOString().replace('T', ' ').slice(0, 16);
  }

  private async loadUser(userId: string) {
    if (!userId) throw new ForbiddenException('请先登录');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, muteEndAt: true, muteReason: true },
    });
    if (!user || user.status === UserStatus.DELETED) throw new NotFoundException('用户不存在');
    return user;
  }

  async assertActiveUser(userId: string, scene = '操作') {
    const user = await this.loadUser(userId);
    if (user.status === UserStatus.BANNED) {
      throw new ForbiddenException(`账号已被封禁，暂不能${scene}`);
    }
    if (user.status === UserStatus.INACTIVE) {
      throw new ForbiddenException(`账号已被禁用，暂不能${scene}`);
    }
    return user;
  }

  async assertCanCreateContent(userId: string, action: Extract<UserAction, 'post' | 'comment'>, scene: string) {
    const user = await this.assertActiveUser(userId, scene);
    if (user.muteEndAt && user.muteEndAt.getTime() > Date.now()) {
      const reason = user.muteReason ? `，原因：${user.muteReason}` : '';
      throw new ForbiddenException(`账号禁言中，${this.formatMuteTime(user.muteEndAt)} 后可继续${scene}${reason}`);
    }
    await this.assertDailyQuota(userId, action, scene);
  }

  async assertStudentProtectedAction(userId: string, regionId?: string | null, scene: StudentProtectedAction = '操作') {
    if (!userId) return;

    // AUD-P1-179: 必须先校验用户为 ACTIVE，再检查学生认证。
    // 此前这个函数会绕过封禁/禁用检查，导致未开启学生认证区域的 BANNED 用户仍可操作。
    await this.assertActiveUser(userId, scene);

    let effectiveRegionId = regionId ? String(regionId) : '';
    if (!effectiveRegionId) {
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { regionId: true },
      }).catch(() => null);
      effectiveRegionId = profile?.regionId || '';
    }
    if (!effectiveRegionId) return;
    const [region, user] = await Promise.all([
      this.prisma.region.findUnique({
        where: { id: effectiveRegionId },
        select: { onlyStudentAuthUsers: true },
      }).catch(() => null),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { studentVerify: { select: { status: true } } },
      }).catch(() => null),
    ]);
    if (!region?.onlyStudentAuthUsers) return;
    const status = String(user?.studentVerify?.status || 'none').toLowerCase();
    if (status === 'approved') return;
    const isPending = status === 'pending';
    throw new ForbiddenException({
      success: false,
      code: 'STUDENT_VERIFICATION_REQUIRED',
      error_code: 'STUDENT_VERIFICATION_REQUIRED',
      student_verification_status: status,
      message: isPending
        ? `学生认证审核中，审核通过后可${scene}`
        : `该区域需通过学生认证后才能${scene}`,
    });
  }

  async assertCurrentRegionStudentProtectedAction(userId: string, scene: StudentProtectedAction = '操作') {
    await this.assertStudentProtectedAction(userId, null, scene);
  }

  async assertCanInteract(userId: string, action: Exclude<UserAction, 'post' | 'comment'>, scene: string) {
    await this.assertActiveUser(userId, scene);
    await this.assertDailyQuota(userId, action, scene);
  }

  async assertNoBlockBetween(userId: string, targetUserId: string, scene = '互动') {
    if (!userId || !targetUserId || userId === targetUserId) return;
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { userId, blockedId: targetUserId },
          { userId: targetUserId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (block) throw new ForbiddenException(`双方存在拉黑关系，无法继续${scene}`);
  }

  private async getDailyLimit(action: UserAction) {
    const config = await this.prisma.config.findUnique({
      where: { key: 'governance_rate_limits' },
      select: { value: true },
    }).catch(() => null);
    const raw = (config?.value as Record<string, any> | undefined)?.[action];
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
    return this.defaultDailyLimits[action];
  }

  private async assertDailyQuota(userId: string, action: UserAction, scene: string) {
    const limit = await this.getDailyLimit(action);
    if (limit <= 0) return;
    const day = new Date().toISOString().slice(0, 10);
    const key = `governance:daily:${action}:${userId}:${day}`;
    const count = await this.redis.incr(key).catch(() => 1);
    if (count === 1) await this.redis.expire(key, 36 * 60 * 60).catch(() => undefined);
    if (count > limit) {
      throw new BadRequestException(`今日${scene}次数已达上限，请明天再试`);
    }
  }
}
