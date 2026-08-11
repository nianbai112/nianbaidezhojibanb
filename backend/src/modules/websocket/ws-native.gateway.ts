import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { Server } from 'http';
import { assertRiderPasswordTokenActive } from '../../common/auth/rider-password-token.util';
import { inferChatMessageType } from '../../common/utils/chat-message.util';
import { PrivateMessagePermissionService } from '../../common/services/private-message-permission.service';
import { RedisService } from '../../common/services/redis.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { RIDER_PASSWORD_WS_PUSH_CHANNEL } from '../rider-app/rider-password-credential.contract';

const NATIVE_CONNECT_WINDOW_SEC = 60;
const NATIVE_CONNECT_MAX_PER_IP = 60;
const NATIVE_SEND_WINDOW_SEC = 10;
const NATIVE_SEND_MAX_PER_USER = 20;
const NATIVE_ADMIN_SEND_MAX_PER_USER = 60;
const NATIVE_OP_WINDOW_SEC = 10;
const NATIVE_OP_MAX_PER_USER = 80;
const NATIVE_MAX_MESSAGE_LENGTH = 5000;
const NATIVE_PONG_TIMEOUT_MS = 75000;

interface NativeClient {
  ws: WebSocket;
  userId: string;
  isAdmin: boolean;
  platform: 'miniapp' | 'rider_app' | 'admin';
  socketId: string;
  regionId?: string;
  lastPongAt: number;
  authSource?: 'rider_password';
  credentialId?: string;
  credentialVersion?: number;
}

export class WsNativeGateway {
  private readonly logger = new Logger(WsNativeGateway.name);
  private wss: WebSocketServer;
  private clients: Map<string, NativeClient> = new Map();
  private userSockets: Map<string, Set<string>> = new Map();
  private groupSockets: Map<string, Set<string>> = new Map();
  private sessionTouchAt: Map<string, number> = new Map();
  private pingInterval: NodeJS.Timeout;
  private readonly instanceId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  private readonly pushChannel = RIDER_PASSWORD_WS_PUSH_CHANNEL;
  private redisSubscriber?: ReturnType<RedisService['getClient']>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly privateMessagePermission: PrivateMessagePermissionService,
    private readonly userAccess: UserAccessPolicyService,
  ) {}

  // ===========================================================================
  // 启动 / 关闭
  // ===========================================================================

  attach(server: Server) {
    if (!this.isSetupWizardMode()) {
      this.prisma.realtimeSession.updateMany({
        where: { online: true },
        data: { online: false },
      }).then((res) => {
        if (res.count > 0) this.logger.log(`Marked ${res.count} stale realtime sessions offline on startup`);
      }).catch((err) => {
        this.logger.warn(`Failed to mark stale realtime sessions offline: ${err.message}`);
      });
    } else {
      this.logger.log('Setup wizard mode detected, skip realtime session cleanup');
    }

    this.wss = new WebSocketServer({ server, path: '/ws-native' });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (err) => {
      this.logger.error(`Native WebSocket server error: ${err.message}`);
    });

    // 心跳检测：30秒一次；连续未响应则主动断开，确保能发布离线状态。
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, socketId) => this.checkClientHeartbeat(socketId, client, now));
    }, 30000);

    this.logger.log('Native WebSocket server attached at /ws-native');
    this.setupRedisSubscriber();
  }

  private async checkClientHeartbeat(socketId: string, client: NativeClient, now: number) {
    if (client.ws.readyState !== WebSocket.OPEN) {
      this.removeClient(socketId).catch(() => {});
      return;
    }
    if (now - client.lastPongAt > NATIVE_PONG_TIMEOUT_MS) {
      this.logger.warn(`Native WS heartbeat timed out: socket=${socketId}`);
      client.ws.terminate();
      this.removeClient(socketId).catch(() => {});
      return;
    }
    if (!(await this.assertPasswordCredentialClient(client))) return;
    client.ws.ping();
  }

  private isSetupWizardMode() {
    const installed = String(this.config.get('DB_IS_INSTALLED') || '').toLowerCase();
    const wizard = String(this.config.get('SETUP_WIZARD') || '').toLowerCase();
    return installed !== '1' || wizard === 'true';
  }

  shutdown() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.redisSubscriber) {
      this.redisSubscriber.disconnect();
      this.redisSubscriber = undefined;
    }
    if (this.wss) {
      this.wss.close(() => {
        this.logger.log('Native WebSocket server closed');
      });
    }
    this.clients.clear();
    this.userSockets.clear();
    this.groupSockets.clear();
  }

  // ===========================================================================
  // 连接处理
  // ===========================================================================

  private async handleConnection(ws: WebSocket, req: any) {
    const socketId = this.generateSocketId();
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || '';
    const ip = this.getClientIp(req) || 'unknown';

    if (await this.isRedisRateLimited(`lm:ws:native:connect:${ip}`, NATIVE_CONNECT_MAX_PER_IP, NATIVE_CONNECT_WINDOW_SEC)) {
      this.logger.warn(`Native WS connection rate limited: ip=${ip}`);
      ws.close(4429, 'Too many connections');
      return;
    }

    if (!token) {
      this.logger.warn(`Native WS connection rejected: no token`);
      ws.close(4001, 'Missing token');
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET'),
      });
      await assertRiderPasswordTokenActive(this.prisma, payload);

      const userId = payload.sub;
      const isAdmin = payload.isAdmin === true;
      let platform: NativeClient['platform'] = isAdmin ? 'admin' : 'miniapp';

      if (!isAdmin) {
        await this.userAccess.assertActiveUser(userId, '连接实时服务');
        if (url.searchParams.get('client') === 'rider_app') {
          const rider = await this.prisma.regionRider.findFirst({
            where: {
              userId,
              verifyStatus: 'approved',
              riderType: 'official',
              regionId: { not: '' },
            },
            select: { id: true, regionId: true },
          });
          const region = rider
            ? await this.prisma.region.findUnique({
                where: { id: rider.regionId },
                select: { id: true },
              })
            : null;
          if (!rider || !region) throw new Error('Official rider required');
          platform = 'rider_app';
        }
      }

      const client: NativeClient = {
        ws,
        userId,
        isAdmin,
        platform,
        socketId,
        lastPongAt: Date.now(),
        ...(payload.authSource === 'rider_password'
          ? {
              authSource: 'rider_password' as const,
              credentialId: String(payload.credentialId || ''),
              credentialVersion: Number(payload.credentialVersion),
            }
          : {}),
      };

      this.clients.set(socketId, client);

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socketId);
      const publishOnline = await this.markPresenceOnline(client, req);

      // 写入在线会话
      try {
        await this.prisma.realtimeSession.create({
          data: {
            userId: isAdmin ? null : userId,
            adminId: isAdmin ? userId : null,
            socketId,
            platform,
            online: true,
            ip: this.getClientIp(req),
            userAgent: req.headers['user-agent'] || '',
          },
        });
      } catch (e: any) {
        this.logger.warn(`Failed to create realtime session: ${e.message}`);
      }
      if (!isAdmin && publishOnline) this.publishUserPresence(userId, true).catch(() => undefined);

      // 发送连接成功消息
      this.send(ws, {
        event: 'connected',
        data: { userId, socketId },
      });

      // 推送当前未读数
      try {
        this.send(ws, {
          event: 'unreadSummary',
          data: await this.getUnreadSummaryForUser(userId),
        });
      } catch {
        // ignore
      }

      ws.on('message', (data) => this.handleMessage(socketId, data));
      ws.on('close', () => this.handleDisconnect(socketId));
      ws.on('error', (err) => {
        this.logger.warn(`Native WS error for ${socketId}: ${err.message}`);
        this.removeClient(socketId);
      });
      ws.on('pong', () => {
        const c = this.clients.get(socketId);
        if (c) {
          c.lastPongAt = Date.now();
          this.touchRedisOnline(c).catch(() => {});
          // 更新最后活跃时间
          this.prisma.realtimeSession.updateMany({
            where: { socketId, online: true },
            data: { lastSeenAt: new Date() },
          }).catch(() => {});
        }
      });

      this.logger.log(`Native WS connected: socket=${socketId} userId=${userId} isAdmin=${isAdmin}`);
    } catch (err: any) {
      this.logger.warn(`Native WS token verification failed: ${err.message}`);
      ws.close(4003, 'Invalid token');
    }
  }

  private async handleMessage(socketId: string, raw: RawData) {
    const client = this.clients.get(socketId);
    if (!client) return;

    try {
      if (!(await this.assertActiveClient(client))) return;
      this.touchSession(socketId);
      const msg = JSON.parse(raw.toString());
      const eventType = msg.event || msg.type;

      if (eventType === 'ping') {
        client.lastPongAt = Date.now();
        this.touchRedisOnline(client).catch(() => {});
        this.send(client.ws, { event: 'pong', data: {} });
      } else if (eventType === 'subscribe') {
        if (await this.isRedisRateLimited(`lm:ws:native:op:${client.userId}`, NATIVE_OP_MAX_PER_USER, NATIVE_OP_WINDOW_SEC)) {
          this.send(client.ws, { event: 'message_error', data: { message: '操作过于频繁，请稍后再试' } });
          return;
        }
        // 订阅特定房间（如区域通知）
        if (msg.data?.regionId) {
          client.regionId = msg.data.regionId;
        }
      } else if (eventType === 'join_group') {
        if (await this.isRedisRateLimited(`lm:ws:native:op:${client.userId}`, NATIVE_OP_MAX_PER_USER, NATIVE_OP_WINDOW_SEC)) {
          this.send(client.ws, { event: 'message_error', data: { message: '操作过于频繁，请稍后再试' } });
          return;
        }
        await this.handleJoinGroup(client, msg);
      } else if (eventType === 'leave_group') {
        if (await this.isRedisRateLimited(`lm:ws:native:op:${client.userId}`, NATIVE_OP_MAX_PER_USER, NATIVE_OP_WINDOW_SEC)) {
          this.send(client.ws, { event: 'message_error', data: { message: '操作过于频繁，请稍后再试' } });
          return;
        }
        this.handleLeaveGroup(client, msg);
      } else if (eventType === 'conversation_read') {
        if (await this.isRedisRateLimited(`lm:ws:native:op:${client.userId}`, NATIVE_OP_MAX_PER_USER, NATIVE_OP_WINDOW_SEC)) {
          this.send(client.ws, { event: 'message_error', data: { message: '操作过于频繁，请稍后再试' } });
          return;
        }
        await this.handleConversationRead(client, msg);
      } else if (eventType === 'typing' || eventType === 'private_typing') {
        if (await this.isRedisRateLimited(`lm:ws:native:typing:${client.userId}`, 30, NATIVE_OP_WINDOW_SEC)) {
          return;
        }
        this.handlePrivateTyping(client, msg);
      } else if (eventType === 'group_message') {
        if (await this.isRedisRateLimited(`lm:ws:native:send:${client.userId}`, client.isAdmin ? NATIVE_ADMIN_SEND_MAX_PER_USER : NATIVE_SEND_MAX_PER_USER, NATIVE_SEND_WINDOW_SEC)) {
          this.send(client.ws, { event: 'message_error', data: { message: '发送太频繁，请稍后再试', clientMessageId: msg.clientMessageId || msg.client_message_id } });
          return;
        }
        await this.handleGroupMessage(client, msg);
      } else if (eventType === 'message' || eventType === 'private_message') {
        if (await this.isRedisRateLimited(`lm:ws:native:send:${client.userId}`, client.isAdmin ? NATIVE_ADMIN_SEND_MAX_PER_USER : NATIVE_SEND_MAX_PER_USER, NATIVE_SEND_WINDOW_SEC)) {
          this.send(client.ws, { event: 'message_error', data: { message: '发送太频繁，请稍后再试', clientMessageId: msg.clientMessageId || msg.client_message_id } });
          return;
        }
        await this.handlePrivateMessage(client, msg);
      }
    } catch (err: any) {
      this.logger.warn(`Native WS message handling failed: ${err.message}`);
    }
  }

  private async assertActiveClient(client: NativeClient): Promise<boolean> {
    if (client.isAdmin) return true;
    if (!(await this.assertPasswordCredentialClient(client))) return false;
    try {
      await this.userAccess.assertActiveUser(client.userId, '使用实时服务');
      return true;
    } catch (error: any) {
      this.send(client.ws, { event: 'message_error', data: { message: error?.message || '账号当前不可用' } });
      client.ws.close(4003, 'Account inactive');
      return false;
    }
  }

  private async assertPasswordCredentialClient(client: NativeClient): Promise<boolean> {
    if (client.authSource !== 'rider_password') return true;
    try {
      await assertRiderPasswordTokenActive(this.prisma, {
        sub: client.userId,
        authSource: client.authSource,
        credentialId: client.credentialId,
        credentialVersion: client.credentialVersion,
      });
      return true;
    } catch (error: any) {
      this.send(client.ws, { event: 'message_error', data: { message: error?.message || '登录状态已失效' } });
      client.ws.close(4003, 'Credential revoked');
      return false;
    }
  }

  private async findOrCreatePrivateConversation(userId: string, receiverId: string, regionId?: string) {
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        type: 'private',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: receiverId } } },
        ],
      },
    });
    if (conversation) return conversation;

    conversation = await this.prisma.conversation.create({
      data: {
        type: 'private',
        regionId: regionId || null,  // AUD-P1-023: 写入区域归属
        members: {
          create: [
            { userId },
            { userId: receiverId },
          ],
        },
      },
    });
    return conversation;
  }

  private async handleConversationRead(client: NativeClient, msg: any) {
    if (client.isAdmin) return;
    const conversationId = String(msg.conversationId || msg.conversation_id || '').trim();
    const targetId = String(msg.receiverId || msg.receiver_id || msg.otherUserId || msg.other_user_id || '').trim();
    let conversation: any = null;

    if (conversationId) {
      conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, members: { some: { userId: client.userId } } },
        include: { members: true },
      });
    } else if (targetId) {
      conversation = await this.prisma.conversation.findFirst({
        where: {
          type: 'private',
          AND: [
            { members: { some: { userId: client.userId } } },
            { members: { some: { userId: targetId } } },
          ],
        },
        include: { members: true },
      });
    }
    if (!conversation) return;

    const latestMessage = await this.prisma.message.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    await this.prisma.conversationMember.updateMany({
      where: { conversationId: conversation.id, userId: client.userId },
      data: {
        unreadCount: 0,
        ...(latestMessage?.id ? { lastReadMsgId: latestMessage.id } : {}),
      },
    });

    if (conversation.type === 'private' && latestMessage?.createdAt) {
      await this.prisma.message.updateMany({
        where: {
          conversationId: conversation.id,
          senderId: { not: client.userId },
          createdAt: { lte: latestMessage.createdAt },
          readCount: { lt: 1 },
        },
        data: { readCount: 1 },
      }).catch(() => undefined);
    }

    const payload = {
      event: 'conversation_read',
      type: 'conversation_read',
      data: {
        conversationId: conversation.id,
        conversation_id: conversation.id,
        readerId: client.userId,
        reader_id: client.userId,
        lastReadMsgId: latestMessage?.id || null,
        last_read_msg_id: latestMessage?.id || null,
        lastReadAt: latestMessage?.createdAt?.toISOString?.() || null,
        last_read_at: latestMessage?.createdAt?.toISOString?.() || null,
      },
    };

    conversation.members
      .filter((member: any) => member.userId !== client.userId)
      .forEach((member: any) => this.pushToUser(member.userId, payload));
    await this.clearUnreadSummaryCache(client.userId);
    this.pushUnreadSummary(client.userId).catch(() => undefined);
  }

  private toClientNotificationType(type?: string) {
    const key = String(type || 'SYSTEM').toUpperCase();
    if (key === 'ADMIN_BROADCAST' || key === 'ANNOUNCEMENT') return 'system';
    if (key === 'REPLY' || key === 'MENTION') return 'comment';
    if (key === 'CIRCLE') return 'message';
    return key.toLowerCase();
  }

  private async clearUnreadSummaryCache(userId: string) {
    await this.redis.delPattern(`notify:unread:${userId}:*`).catch(() => undefined);
  }

  private async getUnreadSummaryForUser(userId: string, regionId?: string) {
    // AUD-P1-023: 构建区域过滤条件
    const notificationWhere: any = { userId, isRead: false };
    if (regionId) {
      notificationWhere.OR = [
        { regionId },
        { regionId: null },
      ];
    }

    const chatWhere: any = { userId, unreadCount: { gt: 0 } };
    if (regionId) {
      chatWhere.conversation = {
        OR: [
          { regionId },
          { regionId: null },
        ],
      };
    }

    const [notifications, chatMembers] = await Promise.all([
      this.prisma.notification.findMany({
        where: notificationWhere,
        select: { type: true },
      }),
      this.prisma.conversationMember.findMany({
        where: chatWhere,
        select: {
          unreadCount: true,
          conversation: { select: { type: true } },
        },
      }),
    ]);
    const counts: Record<string, number> = {
      like: 0,
      comment: 0,
      reply: 0,
      follow: 0,
      squat: 0,
      message: 0,
      privateChat: 0,
      groupChat: 0,
      system: 0,
      order: 0,
      delivery: 0,
      refund: 0,
      certification: 0,
      merchant: 0,
      announcement: 0,
    };
    for (const notification of notifications) {
      const key = this.toClientNotificationType(notification.type);
      if (key in counts) counts[key]++;
      else if (key === 'wallet') counts.system++;
    }
    let chatUnread = 0;
    for (const member of chatMembers) {
      const unread = member.unreadCount || 0;
      chatUnread += unread;
      if (member.conversation?.type === 'group') counts.groupChat += unread;
      else counts.privateChat += unread;
    }
    counts.message += chatUnread;
    const notificationUnread = notifications.length;
    const total = notificationUnread + chatUnread;
    return {
      total,
      unreadCount: total,
      totalUnread: total,
      notificationUnread,
      chatUnread,
      unreadCounts: counts,
    };
  }

  private async pushUnreadSummary(userId: string, regionId?: string) {
    const summary = await this.getUnreadSummaryForUser(userId, regionId);
    this.pushToUser(userId, { event: 'unreadSummary', type: 'unreadSummary', data: summary });
  }

  private redisUserKey(userId: string) {
    return `lm:ws:native:user:${userId}`;
  }

  private redisSocketKey(socketId: string) {
    return `lm:ws:native:socket:${socketId}`;
  }

  private buildRedisClientState(client: NativeClient, req?: any) {
    const now = new Date().toISOString();
    return {
      userId: client.userId,
      socketId: client.socketId,
      isAdmin: client.isAdmin,
      platform: client.platform || (client.isAdmin ? 'admin' : 'miniapp'),
      instanceId: this.instanceId,
      ip: req ? this.getClientIp(req) : undefined,
      userAgent: req?.headers?.['user-agent'] || '',
      connectedAt: now,
      lastSeenAt: now,
    };
  }

  private async markRedisOnline(client: NativeClient, req: any) {
    const state = this.buildRedisClientState(client, req);
    await Promise.all([
      this.redis.hset(this.redisUserKey(client.userId), client.socketId, JSON.stringify(state)),
      this.redis.setJson(this.redisSocketKey(client.socketId), state, 180),
      this.redis.expire(this.redisUserKey(client.userId), 180),
    ]);
  }

  private async touchRedisOnline(client: NativeClient) {
    const state = this.buildRedisClientState(client);
    await Promise.all([
      this.redis.hset(this.redisUserKey(client.userId), client.socketId, JSON.stringify(state)),
      this.redis.setJson(this.redisSocketKey(client.socketId), state, 180),
      this.redis.expire(this.redisUserKey(client.userId), 180),
    ]);
  }

  private async removeRedisOnline(client: NativeClient) {
    await Promise.all([
      this.redis.hdel(this.redisUserKey(client.userId), client.socketId),
      this.redis.del(this.redisSocketKey(client.socketId)),
    ]);
  }

  private async redisUserIsOnline(userId: string) {
    const sockets = await this.redis.hgetall(this.redisUserKey(userId));
    return Object.values(sockets).some((raw) => {
      try {
        return JSON.parse(raw)?.platform !== 'admin';
      } catch {
        return false;
      }
    });
  }

  private async markPresenceOnline(client: NativeClient, req: any) {
    const fallbackWasOnline = this.getLiveSocketCount(client.userId) > 1;
    try {
      const changed = await this.redis.withLock(`lm:ws:native:presence:${client.userId}`, 3, async () => {
        const wasOnline = await this.redisUserIsOnline(client.userId);
        await this.markRedisOnline(client, req);
        return !wasOnline;
      });
      if (changed !== undefined) return changed;
      await this.markRedisOnline(client, req);
      return false;
    } catch (err: any) {
      this.logger.warn(`Failed to coordinate Redis presence: ${err.message}`);
    }
    await this.markRedisOnline(client, req).catch((err) => {
      this.logger.warn(`Failed to write Redis realtime state: ${err.message}`);
    });
    return !fallbackWasOnline;
  }

  private async markPresenceOffline(client: NativeClient, fallbackStillOnline: boolean) {
    try {
      const changed = await this.redis.withLock(`lm:ws:native:presence:${client.userId}`, 3, async () => {
        await this.removeRedisOnline(client);
        return !(await this.redisUserIsOnline(client.userId));
      });
      if (changed !== undefined) return changed;
      await this.removeRedisOnline(client);
      return false;
    } catch (err: any) {
      this.logger.warn(`Failed to coordinate Redis presence cleanup: ${err.message}`);
    }
    await this.removeRedisOnline(client).catch((err) => {
      this.logger.warn(`Failed to clean Redis realtime state: ${err.message}`);
    });
    return !fallbackStillOnline;
  }

  async publishUserPresence(userId: string, isOnline?: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true, settings: { select: { showOnlineStatus: true } } },
    });
    if (!user || user.userType === 4) return;
    const visible = (isOnline ?? await this.redisUserIsOnline(userId)) && user.settings?.showOnlineStatus !== false;
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, conversation: { type: { in: ['private', 'group'] } } },
      select: {
        conversationId: true,
        conversation: { select: { type: true, members: { where: { userId: { not: userId } }, select: { userId: true } } } },
      },
    });
    const userPayload = {
      event: 'presence_update',
      type: 'presence_update',
      userId,
      user_id: userId,
      isOnline: visible,
      is_online: visible,
      online_status: visible ? 'online' : 'offline',
      data: { userId, user_id: userId, isOnline: visible, is_online: visible, online_status: visible ? 'online' : 'offline' },
    };
    for (const membership of memberships as any[]) {
      if (membership.conversation?.type === 'private') {
        membership.conversation.members.forEach((member: any) => this.pushToUser(member.userId, userPayload));
        continue;
      }
      const groupPayload = {
        event: visible ? 'member_online' : 'member_offline',
        type: visible ? 'member_online' : 'member_offline',
        groupId: membership.conversationId,
        group_id: membership.conversationId,
        conversationId: membership.conversationId,
        conversation_id: membership.conversationId,
        userId,
        user_id: userId,
        isOnline: visible,
        is_online: visible,
        data: { groupId: membership.conversationId, group_id: membership.conversationId, userId, user_id: userId, isOnline: visible, is_online: visible },
      };
      membership.conversation.members.forEach((member: any) => this.pushToUser(member.userId, groupPayload));
    }
  }

  private async isRedisRateLimited(key: string, max: number, windowSec: number) {
    if (this.isSetupWizardMode()) return false;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, windowSec);
      }
      return count > max;
    } catch (err: any) {
      this.logger.warn(`Native WS Redis rate limit skipped: ${err.message}`);
      return false;
    }
  }

  private setupRedisSubscriber() {
    if (this.isSetupWizardMode() || this.redisSubscriber) return;
    const subscriber = this.redis.getClient().duplicate();
    this.redisSubscriber = subscriber;
    subscriber.on('message', (_channel, message) => this.handleRedisPushMessage(message));
    subscriber.on('error', (err) => {
      this.logger.warn(`Native WS Redis subscriber error: ${err.message}`);
    });
    subscriber.subscribe(this.pushChannel).then(() => {
      this.logger.log(`Native WS subscribed Redis channel: ${this.pushChannel}`);
    }).catch((err) => {
      this.logger.warn(`Native WS Redis subscribe failed: ${err.message}`);
    });
  }

  private handleRedisPushMessage(message: string) {
    try {
      const event = JSON.parse(message);
      if (!event || event.originInstanceId === this.instanceId) return;
      const payload = event.payload;
      if (event.targetType === 'rider_password_credential' && event.targetId) {
        this.disconnectPasswordCredential(String(event.targetId));
      } else if (event.targetType === 'user' && event.targetId) {
        this.pushToUserLocal(String(event.targetId), payload);
      } else if (event.targetType === 'group' && event.targetId) {
        this.pushToGroupLocal(String(event.targetId), payload);
      } else if (event.targetType === 'region' && event.targetId) {
        this.pushToRegionLocal(String(event.targetId), payload);
      } else if (event.targetType === 'broadcast') {
        this.broadcastLocal(payload);
      }
    } catch (err: any) {
      this.logger.warn(`Native WS Redis push message ignored: ${err.message}`);
    }
  }

  private publishRedisPush(targetType: 'user' | 'group' | 'region' | 'broadcast', targetId: string | null, payload: any) {
    if (this.isSetupWizardMode()) return;
    const message = JSON.stringify({
      targetType,
      targetId,
      payload,
      originInstanceId: this.instanceId,
      createdAt: new Date().toISOString(),
    });
    this.redis.getClient().publish(this.pushChannel, message).catch((err) => {
      this.logger.warn(`Native WS Redis publish failed: ${err.message}`);
    });
  }

  private toMessageType(type?: string, content?: string) {
    const key = String(type || 'text').toLowerCase();
    const map: Record<string, string> = {
      text: 'TEXT',
      image: 'IMAGE',
      video: 'VIDEO',
      audio: 'AUDIO',
      recording: 'AUDIO',
      file: 'FILE',
      location: 'LOCATION',
      system: 'SYSTEM',
    };
    return map[key] || inferChatMessageType(content, type);
  }

  private normalizeMessagePermission(value: any, allowMessage?: boolean) {
    if (allowMessage === false && (value === undefined || value === null || value === '')) return 4;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(Math.floor(parsed), 0), 4);
  }

  private async checkPrivateMessagePermission(
    senderId: string,
    receiver: { id: string; userType?: number | null; settings?: { messagePermission?: number | null; allowMessage?: boolean | null } | null },
  ) {
    return this.privateMessagePermission.check(senderId, receiver);
  }

  private async findExistingClientMessage(senderId: string, clientMessageId: string) {
    if (!clientMessageId) return null;
    return this.prisma.message.findFirst({
      where: { senderId, clientMessageId },
      include: { sender: { select: { id: true, nickname: true, avatar: true } } },
    });
  }

  private async syncOfficialTicketMessage(tx: any, input: {
    userId: string;
    regionId: string;
    content: string;
    clientMessageId: string;
    ticketId?: string;
    startNew?: boolean;
    category?: string;
  }) {
    if (input.clientMessageId) {
      const existingReply = await tx.assistantTicketReply.findFirst({
        where: { senderId: input.userId, clientMessageId: input.clientMessageId },
        select: { ticketId: true },
      });
      if (existingReply) return existingReply.ticketId;
    }
    let ticket = input.ticketId
      ? await tx.assistantTicket.findFirst({ where: { id: input.ticketId, userId: input.userId } })
      : null;
    if (!ticket && !input.startNew) {
      ticket = await tx.assistantTicket.findFirst({
        where: { userId: input.userId, regionId: input.regionId, status: { in: ['pending', 'processing', 'waiting_user'] } },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (!ticket) {
      ticket = await tx.assistantTicket.create({
        data: {
          ticketNo: `CS${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
          userId: input.userId,
          regionId: input.regionId,
          category: ['order', 'account', 'feedback'].includes(String(input.category)) ? input.category : 'other',
          content: input.content,
          latestReply: input.content,
          status: 'pending',
          unreadForUser: false,
        },
      });
    }
    await tx.assistantTicketReply.create({
      data: {
        ticketId: ticket.id,
        senderType: 'user',
        senderId: input.userId,
        clientMessageId: input.clientMessageId || null,
        content: input.content,
      },
    });
    await tx.assistantTicket.update({
      where: { id: ticket.id },
      data: {
        latestReply: input.content,
        unreadForUser: false,
        status: ticket.status === 'waiting_user' ? 'processing' : ticket.status,
      },
    });
    return ticket.id;
  }

  private async handlePrivateMessage(client: NativeClient, msg: any) {
    if (client.isAdmin) return;
    const receiverId = String(msg.receiverId || msg.receiver_id || '').trim();
    const content = String(msg.message || msg.content || '').trim();
    const clientMessageId = String(msg.clientMessageId || msg.client_message_id || '').trim();
    if (!receiverId || !content) return;
    if (content.length > NATIVE_MAX_MESSAGE_LENGTH) {
      this.send(client.ws, {
        event: 'message_error',
        data: { message: `消息长度不能超过 ${NATIVE_MAX_MESSAGE_LENGTH} 字符`, clientMessageId },
      });
      return;
    }

    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: {
        id: true,
        userType: true,
        settings: { select: { messagePermission: true, allowMessage: true } },
      },
    });
    if (!receiver) {
      this.send(client.ws, {
        event: 'message_error',
        data: { message: '接收方不存在', clientMessageId },
      });
      return;
    }
    const permission = await this.checkPrivateMessagePermission(client.userId, receiver);
    if (!permission.allowed) {
      this.send(client.ws, {
        event: 'message_error',
        data: { message: permission.message || '对方当前不允许接收你的私信', clientMessageId },
      });
      return;
    }

    const conversation = await this.findOrCreatePrivateConversation(client.userId, receiverId, client.regionId);
    if (conversation.isBlocked) {
      this.send(client.ws, {
        event: 'message_error',
        data: { message: '该私信会话已被后台屏蔽，暂时不能继续发送消息', clientMessageId },
      });
      return;
    }

    const existing = await this.findExistingClientMessage(client.userId, clientMessageId);
    if (existing) {
      const ticketReply = receiver.userType === 4 && clientMessageId
        ? await (this.prisma as any).assistantTicketReply.findFirst({
            where: { senderId: client.userId, clientMessageId },
            select: { ticketId: true },
          })
        : null;
      this.send(client.ws, {
        event: 'message_sent',
        type: 'message_sent',
        data: {
          conversationId: existing.conversationId,
          messageId: existing.id,
          clientMessageId,
          receiverId,
          assistantTicketId: ticketReply?.ticketId || null,
          duplicated: true,
          timestamp: existing.createdAt.toISOString(),
        },
      });
      return;
    }

    const officialRegionId = receiver.userType === 4 && !conversation.regionId
      ? (await this.prisma.userProfile.findUnique({ where: { userId: client.userId }, select: { regionId: true } }))?.regionId
      : conversation.regionId;
    if (receiver.userType === 4 && !officialRegionId) {
      this.send(client.ws, { event: 'message_error', data: { message: '请选择当前校园后再咨询', clientMessageId } });
      return;
    }
    let result: any;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const saved = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: client.userId,
          type: this.toMessageType(msg.messageType || msg.type, content) as any,
          content,
          clientMessageId: clientMessageId || undefined,
          extra: msg.extra || undefined,
        },
        include: { sender: { select: { id: true, nickname: true, avatar: true } } },
      });
      const assistantTicketId = receiver.userType === 4
        ? await this.syncOfficialTicketMessage(tx, {
            userId: client.userId,
            regionId: String(officialRegionId),
            content,
            clientMessageId,
            ticketId: String(msg.assistantTicketId || msg.assistant_ticket_id || '').trim() || undefined,
            startNew: msg.startNewAssistantTicket === true || msg.start_new_assistant_ticket === true,
            category: msg.assistantCategory || msg.assistant_category,
          })
        : null;
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessage: content, lastMsgTime: saved.createdAt, ...(officialRegionId && !conversation.regionId ? { regionId: officialRegionId } : {}) },
      });
      await tx.conversationMember.updateMany({
        where: { conversationId: conversation.id, userId: receiverId },
        data: { unreadCount: { increment: 1 } },
      });
        return { saved, assistantTicketId };
      });
    } catch (error: any) {
      if (clientMessageId && error?.code === 'P2002') {
        const duplicate = await this.findExistingClientMessage(client.userId, clientMessageId);
        if (duplicate) {
          const ticketReply = receiver.userType === 4
            ? await (this.prisma as any).assistantTicketReply.findFirst({
                where: { senderId: client.userId, clientMessageId }, select: { ticketId: true },
              }).catch(() => null)
            : null;
          this.send(client.ws, {
            event: 'message_sent', type: 'message_sent',
            data: {
              conversationId: duplicate.conversationId, messageId: duplicate.id, clientMessageId,
              receiverId, assistantTicketId: ticketReply?.ticketId || null, duplicated: true,
              timestamp: duplicate.createdAt.toISOString(),
            },
          });
          return;
        }
      }
      throw error;
    }
    const { saved, assistantTicketId } = result;

    const payload = {
      event: 'message',
      type: 'message',
      conversationId: conversation.id,
      messageId: saved.id,
      clientMessageId,
      senderId: client.userId,
      receiverId,
      message: content,
      messageType: String(saved.type).toLowerCase(),
      sender_avatar: saved.sender.avatar,
      sender_nickname: saved.sender.nickname,
      timestamp: saved.createdAt.toISOString(),
    };

    this.pushToUser(receiverId, payload);
    await this.clearUnreadSummaryCache(receiverId);
    this.pushUnreadSummary(receiverId).catch(() => undefined);
    this.send(client.ws, {
      event: 'message_sent',
      type: 'message_sent',
      data: {
        conversationId: conversation.id,
        messageId: saved.id,
        clientMessageId,
        receiverId,
        assistantTicketId,
        timestamp: saved.createdAt.toISOString(),
      },
    });
  }

  private handlePrivateTyping(client: NativeClient, msg: any) {
    if (client.isAdmin) return;
    const receiverId = String(msg.receiverId || msg.receiver_id || '').trim();
    if (!receiverId || receiverId === client.userId) return;
    const isTyping = msg.isTyping === true || msg.is_typing === true || msg.typing === true;
    this.pushToUser(receiverId, {
      event: 'typing',
      type: 'typing',
      conversationType: 'private',
      senderId: client.userId,
      receiverId,
      isTyping,
      timestamp: new Date().toISOString(),
      data: {
        conversationType: 'private',
        senderId: client.userId,
        sender_id: client.userId,
        receiverId,
        receiver_id: receiverId,
        isTyping,
        is_typing: isTyping,
      },
    });
  }

  private async handleJoinGroup(client: NativeClient, msg: any) {
    if (client.isAdmin) return;
    const groupId = String(msg.groupId || msg.group_id || '').trim();
    if (!groupId) return;
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId: client.userId, conversation: { type: 'group' } },
      select: { id: true },
    });
    if (!member) {
      this.send(client.ws, {
        event: 'message_error',
        data: { message: '你不是该群成员，无法加入群聊' },
      });
      return;
    }
    if (!this.groupSockets.has(groupId)) {
      this.groupSockets.set(groupId, new Set());
    }
    this.groupSockets.get(groupId)!.add(client.socketId);
    this.send(client.ws, {
      event: 'joined_group',
      groupId,
      data: { groupId },
    });
  }

  private handleLeaveGroup(client: NativeClient, msg: any) {
    const groupId = String(msg.groupId || msg.group_id || '').trim();
    if (!groupId) return;
    const sockets = this.groupSockets.get(groupId);
    if (sockets) {
      sockets.delete(client.socketId);
      if (sockets.size === 0) this.groupSockets.delete(groupId);
    }
    this.send(client.ws, {
      event: 'left_group',
      groupId,
      data: { groupId },
    });
  }

  private async handleGroupMessage(client: NativeClient, msg: any) {
    if (client.isAdmin) return;
    const groupId = String(msg.groupId || msg.group_id || '').trim();
    const content = String(msg.message || msg.content || '').trim();
    const clientMessageId = String(msg.clientMessageId || msg.client_message_id || '').trim();
    if (!groupId || !content) return;
    if (content.length > NATIVE_MAX_MESSAGE_LENGTH) {
      this.send(client.ws, {
        event: 'message_error',
        data: { message: `消息长度不能超过 ${NATIVE_MAX_MESSAGE_LENGTH} 字符`, clientMessageId },
      });
      return;
    }

    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId: client.userId, conversation: { type: 'group', isBlocked: false } },
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
    });
    if (!member) {
      this.send(client.ws, {
        event: 'message_error',
        data: { message: '你不是该群成员，无法发送群聊消息', clientMessageId },
      });
      return;
    }
    if (member.isMuted) {
      this.send(client.ws, {
        event: 'message_error',
        data: { message: '你已被禁言，暂时不能发送群聊消息', clientMessageId },
      });
      return;
    }
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: groupId },
      select: { type: true, title: true },
    }).catch(() => null);
    if (conversation?.type === 'circle' && conversation.title) {
      const circle = await this.prisma.circle.findUnique({
        where: { id: conversation.title },
        select: { regionId: true },
      }).catch(() => null);
      try {
        await this.userAccess.assertStudentProtectedAction(client.userId, circle?.regionId, '发送群聊消息');
      } catch (error: any) {
        this.send(client.ws, {
          event: 'message_error',
          data: {
            message: error?.response?.message || error?.message || '学生认证审核通过后可发送群聊消息',
            code: error?.response?.code || error?.response?.error_code,
            error_code: error?.response?.error_code,
            student_verification_status: error?.response?.student_verification_status,
            clientMessageId,
          },
        });
        return;
      }
    }

    const existing = await this.findExistingClientMessage(client.userId, clientMessageId);
    if (existing) {
      this.send(client.ws, {
        event: 'message_sent',
        type: 'message_sent',
        data: {
          conversationId: existing.conversationId,
          groupId,
          messageId: existing.id,
          clientMessageId,
          duplicated: true,
          timestamp: existing.createdAt.toISOString(),
        },
      });
      return;
    }

    let saved: any;
    try {
      saved = await this.prisma.message.create({
        data: {
          conversationId: groupId,
          senderId: client.userId,
          type: this.toMessageType(msg.messageType || msg.type, content) as any,
          content,
          clientMessageId: clientMessageId || undefined,
          extra: msg.extra || undefined,
        },
        include: { sender: { select: { id: true, nickname: true, avatar: true } } },
      });
    } catch (error: any) {
      if (clientMessageId && error?.code === 'P2002') {
        const duplicate = await this.findExistingClientMessage(client.userId, clientMessageId);
        if (duplicate) {
          this.send(client.ws, {
            event: 'message_sent', type: 'message_sent',
            data: {
              conversationId: duplicate.conversationId, groupId, messageId: duplicate.id,
              clientMessageId, duplicated: true, timestamp: duplicate.createdAt.toISOString(),
            },
          });
          return;
        }
      }
      throw error;
    }

    const recipients = await this.prisma.conversationMember.findMany({
      where: { conversationId: groupId, userId: { not: client.userId } },
      select: { userId: true },
    });

    await Promise.all([
      this.prisma.conversation.update({
        where: { id: groupId },
        data: { lastMessage: content, lastMsgTime: saved.createdAt },
      }),
      this.prisma.conversationMember.updateMany({
        where: { conversationId: groupId, userId: { not: client.userId } },
        data: { unreadCount: { increment: 1 } },
      }),
    ]);

    const payload = {
      event: 'group_message',
      type: 'group_message',
      conversationId: groupId,
      groupId,
      messageId: saved.id,
      clientMessageId,
      senderId: client.userId,
      sender: {
        id: saved.sender.id,
        nickname: saved.sender.nickname,
        avatar: saved.sender.avatar,
      },
      message: content,
      messageType: String(saved.type).toLowerCase(),
      replyToId: msg.replyToId || msg.reply_to_id || null,
      timestamp: saved.createdAt.toISOString(),
    };

    this.pushToGroup(groupId, payload);
    await Promise.all(recipients.map((member) => this.clearUnreadSummaryCache(member.userId)));
    recipients.forEach((member) => this.pushUnreadSummary(member.userId).catch(() => undefined));
    this.send(client.ws, {
      event: 'message_sent',
      type: 'message_sent',
      data: {
        conversationId: groupId,
        groupId,
        messageId: saved.id,
        clientMessageId,
        timestamp: saved.createdAt.toISOString(),
      },
    });
  }

  private handleDisconnect(socketId: string) {
    this.removeClient(socketId);
    this.logger.log(`Native WS disconnected: socket=${socketId}`);
  }

  private async removeClient(socketId: string) {
    const client = this.clients.get(socketId);
    if (!client) return;

    this.clients.delete(socketId);
    this.sessionTouchAt.delete(socketId);
    this.groupSockets.forEach((sockets, groupId) => {
      sockets.delete(socketId);
      if (sockets.size === 0) this.groupSockets.delete(groupId);
    });

    const userSocketSet = this.userSockets.get(client.userId);
    let stillOnline = false;
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      stillOnline = userSocketSet.size > 0;
      if (userSocketSet.size === 0) {
        this.userSockets.delete(client.userId);
      }
    }

    const publishOffline = await this.markPresenceOffline(client, stillOnline);

    try {
      await this.prisma.realtimeSession.updateMany({
        where: { socketId, online: true },
        data: { online: false },
      });
    } catch {
      // ignore
    }
    if (!client.isAdmin && publishOffline) this.publishUserPresence(client.userId, false).catch(() => undefined);
  }

  private touchSession(socketId: string) {
    const now = Date.now();
    const lastTouch = this.sessionTouchAt.get(socketId) || 0;
    if (now - lastTouch < 10000) return;
    this.sessionTouchAt.set(socketId, now);
    this.prisma.realtimeSession.updateMany({
      where: { socketId, online: true },
      data: { lastSeenAt: new Date(now) },
    }).catch(() => {});
  }

  // ===========================================================================
  // 推送方法（供 NotifyService 调用）
  // ===========================================================================

  private pushToUserLocal(userId: string, payload: any) {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.size === 0) return 0;

    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    let sent = 0;
    for (const sid of socketIds) {
      const client = this.clients.get(sid);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
        sent++;
      }
    }
    return sent;
  }

  pushToUser(userId: string, payload: any) {
    const sent = this.pushToUserLocal(userId, payload);
    this.publishRedisPush('user', userId, payload);
    return sent;
  }

  private pushToRegionLocal(regionId: string, payload: any) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    let sent = 0;
    this.clients.forEach((client) => {
      if (
        client.regionId === regionId &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(data);
        sent++;
      }
    });
    return sent;
  }

  pushToRegion(regionId: string, payload: any) {
    const sent = this.pushToRegionLocal(regionId, payload);
    this.publishRedisPush('region', regionId, payload);
    return sent;
  }

  private pushToGroupLocal(groupId: string, payload: any) {
    const socketIds = this.groupSockets.get(groupId);
    if (!socketIds || socketIds.size === 0) return 0;
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    let sent = 0;
    for (const sid of socketIds) {
      const client = this.clients.get(sid);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
        sent++;
      }
    }
    return sent;
  }

  pushToGroup(groupId: string, payload: any) {
    const sent = this.pushToGroupLocal(groupId, payload);
    this.publishRedisPush('group', groupId, payload);
    return sent;
  }

  private broadcastLocal(payload: any) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    let sent = 0;
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
        sent++;
      }
    });
    return sent;
  }

  broadcast(payload: any) {
    const sent = this.broadcastLocal(payload);
    this.publishRedisPush('broadcast', null, payload);
    return sent;
  }

  getOnlineCount(): number {
    return this.clients.size;
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.userSockets.keys());
  }

  getLiveSocketCount(userId: string): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  /**
   * AUD-P1-181: 断开指定用户的所有 WebSocket 连接。
   * 用于账号注销/删除后主动踢下线。
   */
  disconnectUser(userId: string): number {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.size === 0) return 0;
    let count = 0;
    for (const socketId of socketIds) {
      const client = this.clients.get(socketId);
      if (client) {
        try {
          client.ws.close();
          count++;
        } catch {
          // socket 可能已经断开
        }
      }
    }
    this.logger.log(`Disconnected ${count} socket(s) for userId=${userId}`);
    return count;
  }

  disconnectPasswordCredential(credentialId: string): number {
    let count = 0;
    this.clients.forEach((client) => {
      if (client.authSource !== 'rider_password' || client.credentialId !== credentialId) return;
      try {
        client.ws.close(4003, 'Credential revoked');
        count += 1;
      } catch {
        // Socket may already be closed.
      }
    });
    return count;
  }

  getPushChannel(): string {
    return this.pushChannel;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  isSocketLive(socketId: string): boolean {
    const client = this.clients.get(socketId);
    return client?.ws.readyState === WebSocket.OPEN;
  }

  // ===========================================================================
  // 工具方法
  // ===========================================================================

  private send(ws: WebSocket, payload: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  private generateSocketId(): string {
    return `ns_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private getClientIp(req: any): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || '';
  }
}
