import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

type ReceiverInput = string | {
  id: string;
  userType?: number | null;
  settings?: { messagePermission?: number | null; allowMessage?: boolean | null } | null;
};

@Injectable()
export class PrivateMessagePermissionService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeMessagePermission(value: any, allowMessage?: boolean | null) {
    if (allowMessage === false && (value === undefined || value === null || value === '')) return 4;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(Math.floor(parsed), 0), 4);
  }

  permissionText(value: any) {
    return ['所有人', '关注我的', '我关注的', '互相关注', '禁止'][this.normalizeMessagePermission(value)] || '关注我的';
  }

  private async resolveReceiver(receiver: ReceiverInput) {
    if (typeof receiver !== 'string') return receiver;
    const receiverId = String(receiver || '').trim();
    if (!receiverId) return null;
    return this.prisma.user.findUnique({
      where: { id: receiverId },
      select: {
        id: true,
        userType: true,
        settings: { select: { messagePermission: true, allowMessage: true } },
      },
    });
  }

  private async checkSenderStudentProtectedPrivateMessage(senderId: string) {
    if (!senderId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: {
        profile: { select: { regionId: true } },
        studentVerify: { select: { status: true } },
      },
    }).catch(() => null);
    const regionId = user?.profile?.regionId;
    if (!regionId) return null;
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { onlyStudentAuthUsers: true },
    }).catch(() => null);
    if (!region?.onlyStudentAuthUsers) return null;
    const status = String(user?.studentVerify?.status || 'none').toLowerCase();
    if (status === 'approved') return null;
    return {
      allowed: false,
      canSend: false,
      reason: 'STUDENT_VERIFICATION_REQUIRED',
      message: status === 'pending'
        ? '学生认证审核中，审核通过后可发送私信'
        : '该区域需通过学生认证后才能发送私信',
      code: 'STUDENT_VERIFICATION_REQUIRED',
      error_code: 'STUDENT_VERIFICATION_REQUIRED',
      student_verification_status: status,
      messagePermission: null,
      messagePermissionText: '',
      relation: {
        followsReceiver: false,
        followedByReceiver: false,
        mutual: false,
      },
    };
  }

  async check(senderId: string, receiverInput: ReceiverInput) {
    const receiver = await this.resolveReceiver(receiverInput);
    if (!receiver) {
      return {
        allowed: false,
        canSend: false,
        reason: '接收方不存在',
        message: '接收方不存在',
        messagePermission: null,
        messagePermissionText: '',
        relation: {
          followsReceiver: false,
          followedByReceiver: false,
          mutual: false,
        },
      };
    }

    const permission = this.normalizeMessagePermission(receiver.settings?.messagePermission, receiver.settings?.allowMessage);
    const base = {
      messagePermission: permission,
      messagePermissionText: this.permissionText(permission),
    };

    if (senderId === receiver.id || receiver.userType === 4) {
      return {
        allowed: true,
        canSend: true,
        reason: '',
        message: '',
        ...base,
        relation: {
          followsReceiver: senderId === receiver.id,
          followedByReceiver: senderId === receiver.id,
          mutual: senderId === receiver.id,
        },
      };
    }

    const studentProtected = await this.checkSenderStudentProtectedPrivateMessage(senderId);
    if (studentProtected) return studentProtected;

    if (permission === 0) {
      return {
        allowed: true,
        canSend: true,
        reason: '',
        message: '',
        ...base,
        relation: {
          followsReceiver: false,
          followedByReceiver: false,
          mutual: false,
        },
      };
    }

    if (permission === 4) {
      return {
        allowed: false,
        canSend: false,
        reason: '对方已关闭私信，暂时无法发送消息',
        message: '对方已关闭私信，暂时无法发送消息',
        ...base,
        relation: {
          followsReceiver: false,
          followedByReceiver: false,
          mutual: false,
        },
      };
    }

    const [senderFollowsReceiver, receiverFollowsSender] = await Promise.all([
      this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: senderId, followingId: receiver.id } },
        select: { id: true },
      }),
      this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: receiver.id, followingId: senderId } },
        select: { id: true },
      }),
    ]);

    const followsReceiver = !!senderFollowsReceiver;
    const followedByReceiver = !!receiverFollowsSender;
    const relation = {
      followsReceiver,
      followedByReceiver,
      mutual: followsReceiver && followedByReceiver,
    };

    if (permission === 1 && !followsReceiver) {
      return {
        allowed: false,
        canSend: false,
        reason: '对方设置了仅粉丝可私信，请先关注对方',
        message: '对方设置了仅粉丝可私信，请先关注对方',
        ...base,
        relation,
      };
    }

    if (permission === 2 && !followedByReceiver) {
      return {
        allowed: false,
        canSend: false,
        reason: '对方设置了仅自己关注的人可私信',
        message: '对方设置了仅自己关注的人可私信',
        ...base,
        relation,
      };
    }

    if (permission === 3 && (!followsReceiver || !followedByReceiver)) {
      return {
        allowed: false,
        canSend: false,
        reason: '对方设置了仅互相关注可私信',
        message: '对方设置了仅互相关注可私信',
        ...base,
        relation,
      };
    }

    return {
      allowed: true,
      canSend: true,
      reason: '',
      message: '',
      ...base,
      relation,
    };
  }
}
