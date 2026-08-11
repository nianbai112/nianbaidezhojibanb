import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export type InteractionPermissionField =
  | 'commentPermission'
  | 'replyPermission'
  | 'mentionPermission'
  | 'coCreatePermission';

type TargetInput = string | {
  id: string;
  userType?: number | null;
  settings?: Partial<Record<InteractionPermissionField, number | null>> & { allowComment?: boolean | null } | null;
};

@Injectable()
export class InteractionPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  normalizePermission(value: any, fallback = 0) {
    const labels: Record<string, number> = {
      all: 0,
      everyone: 0,
      '所有人': 0,
      followers: 1,
      fans: 1,
      '关注我的': 1,
      following: 2,
      '我关注的': 2,
      mutual: 3,
      '互相关注': 3,
      none: 4,
      disabled: 4,
      '禁止': 4,
    };
    if (typeof value === 'string' && labels[value.trim()] !== undefined) return labels[value.trim()];
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.floor(parsed), 0), 4);
  }

  permissionText(value: any) {
    return ['所有人', '关注我的', '我关注的', '互相关注', '禁止'][this.normalizePermission(value)] || '所有人';
  }

  private async resolveTarget(target: TargetInput) {
    if (typeof target !== 'string') return target;
    const targetId = String(target || '').trim();
    if (!targetId) return null;
    return this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        userType: true,
        settings: {
          select: {
            allowComment: true,
            commentPermission: true,
            replyPermission: true,
            mentionPermission: true,
            coCreatePermission: true,
          },
        },
      },
    });
  }

  async check(actorId: string, targetInput: TargetInput, field: InteractionPermissionField) {
    const target = await this.resolveTarget(targetInput);
    if (!target) {
      return { allowed: false, message: '用户不存在', permission: null, relation: this.emptyRelation() };
    }
    if (actorId === target.id || target.userType === 4) {
      return { allowed: true, message: '', permission: 0, relation: this.selfRelation() };
    }

    const raw = target.settings?.[field];
    const legacyCommentClosed = field === 'commentPermission' && target.settings?.allowComment === false;
    const permission = legacyCommentClosed ? 4 : this.normalizePermission(raw, 0);
    if (permission === 0) {
      return { allowed: true, message: '', permission, relation: this.emptyRelation() };
    }
    if (permission === 4) {
      return { allowed: false, message: '对方已关闭该互动权限', permission, relation: this.emptyRelation() };
    }

    const relation = await this.getRelation(actorId, target.id);
    if (permission === 1 && !relation.followsTarget) {
      return { allowed: false, message: '对方设置了仅粉丝可以互动，请先关注对方', permission, relation };
    }
    if (permission === 2 && !relation.followedByTarget) {
      return { allowed: false, message: '对方设置了仅自己关注的人可以互动', permission, relation };
    }
    if (permission === 3 && !relation.mutual) {
      return { allowed: false, message: '对方设置了仅互相关注可以互动', permission, relation };
    }
    return { allowed: true, message: '', permission, relation };
  }

  async assertAllowed(actorId: string, target: TargetInput, field: InteractionPermissionField, scene: string) {
    const result = await this.check(actorId, target, field);
    if (!result.allowed) throw new ForbiddenException(result.message || `对方暂不允许你${scene}`);
    return result;
  }

  async filterAllowedTargets(actorId: string, targetIds: string[], field: InteractionPermissionField) {
    const ids = [...new Set(targetIds.map((item) => String(item || '').trim()).filter(Boolean))];
    if (!ids.length) return new Set<string>();
    const targets = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        userType: true,
        settings: {
          select: {
            allowComment: true,
            commentPermission: true,
            replyPermission: true,
            mentionPermission: true,
            coCreatePermission: true,
          },
        },
      },
    });
    const allowed = new Set<string>();
    for (const target of targets) {
      const result = await this.check(actorId, target, field);
      if (result.allowed) allowed.add(target.id);
    }
    return allowed;
  }

  private async getRelation(actorId: string, targetId: string) {
    const [actorFollowsTarget, targetFollowsActor] = await Promise.all([
      this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: actorId, followingId: targetId } },
        select: { id: true },
      }),
      this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: targetId, followingId: actorId } },
        select: { id: true },
      }),
    ]);
    const followsTarget = !!actorFollowsTarget;
    const followedByTarget = !!targetFollowsActor;
    return { followsTarget, followedByTarget, mutual: followsTarget && followedByTarget };
  }

  private emptyRelation() {
    return { followsTarget: false, followedByTarget: false, mutual: false };
  }

  private selfRelation() {
    return { followsTarget: true, followedByTarget: true, mutual: true };
  }
}
