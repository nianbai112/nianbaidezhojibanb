import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { RedisService } from '../../common/services/redis.service';
import { PrismaService } from '../../common/services/prisma.service';

import {
  MAX_MESSAGE_LENGTH,
  RATE_LIMIT_WINDOW_SEC,
  RATE_LIMIT_MAX_MESSAGES,
  RATE_LIMIT_ADMIN_MAX,
  SENSITIVE_WORD_PATTERN,
} from './ws.constants';

// =============================================================================
// Gateway
// =============================================================================
@WebSocketGateway({
  namespace: '/ws',
  transports: ['websocket'],
})
export class MessageGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MessageGateway.name);
  private allowedOrigins: Set<string> = new Set();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {
    this.loadAllowedOrigins();
  }

  // ===========================================================================
  // Origin 白名单
  // ===========================================================================

  private loadAllowedOrigins() {
    const nodeEnv = this.config.get('NODE_ENV');
    const corsOrigin = this.config.get('CORS_ORIGIN') || '';
    const socketOrigins = this.config.get('SOCKET_ALLOWED_ORIGINS') || corsOrigin;

    if (socketOrigins && socketOrigins !== 'true' && socketOrigins !== '*') {
      socketOrigins.split(',').forEach((o: string) => {
        const trimmed = o.trim();
        if (trimmed) this.allowedOrigins.add(trimmed);
      });
    }

    // 开发环境默认允许 localhost
    if (nodeEnv !== 'production') {
      this.allowedOrigins.add('http://localhost:3001');
      this.allowedOrigins.add('http://localhost:3000');
      this.allowedOrigins.add('http://127.0.0.1:3001');
      this.allowedOrigins.add('http://127.0.0.1:3000');
    }

    // 生产环境: 如果白名单为空,记录警告
    if (nodeEnv === 'production' && this.allowedOrigins.size === 0) {
      this.logger.error(
        '生产环境未配置 CORS_ORIGIN 或 SOCKET_ALLOWED_ORIGINS - 所有 WebSocket 连接将被拒绝!',
      );
    }
  }

  /** 验证连接来源 */
  private validateOrigin(client: Socket): boolean {
    const origin = client.handshake.headers.origin || '';
    const nodeEnv = this.config.get('NODE_ENV');

    if (nodeEnv === 'production') {
      if (this.allowedOrigins.size === 0) return false;
      if (!origin || !this.allowedOrigins.has(origin)) {
        this.logger.warn(`生产环境拒绝非白名单 origin: "${origin}"`);
        return false;
      }
      return true;
    }

    // 开发环境: 有白名单则验证, 无则放行
    if (this.allowedOrigins.size > 0 && origin) {
      return this.allowedOrigins.has(origin);
    }
    return true;
  }

  // ===========================================================================
  // 连接生命周期
  // ===========================================================================

  async handleConnection(client: Socket) {
    try {
      // ── 1. 验证 origin ──
      if (!this.validateOrigin(client)) {
        const origin = client.handshake.headers.origin || '';
        this.logger.warn(`WebSocket 连接被拒绝 (origin: "${origin}")`);
        await this.logSecurity(client, 'connection_rejected', '非法来源', { origin });
        client.disconnect();
        return;
      }

      // ── 2. 提取 token（优先级: auth.token > headers.authorization > query.token）──
      const token =
        (client.handshake.auth.token as string) ||
        this.extractBearerToken(client.handshake.headers.authorization) ||
        (client.handshake.query.token as string);

      if (!token) {
        this.logger.warn(`WebSocket 连接被拒绝 (无 token): ${client.id}`);
        await this.logSecurity(client, 'connection_rejected', '缺少 token', {});
        client.disconnect();
        return;
      }

      // ── 3. 校验 JWT ──
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET'),
      });

      // ── 4. 挂载身份信息 ──
      client.data.userId = payload.sub;
      client.data.isAdmin = payload.isAdmin === true;
      client.data.username = payload.username || '';
      client.data.openid = payload.openid || '';

      // 管理员离开加入管理员房间
      if (client.data.isAdmin) {
        client.join('room:admins');
      }

      client.join(`user:${payload.sub}`);
      this.logger.log(
        `WS connected: socket=${client.id} userId=${payload.sub} isAdmin=${client.data.isAdmin}`,
      );
    } catch (err: any) {
      this.logger.warn(`WebSocket token 校验失败: ${err.message}`);
      await this.logSecurity(client, 'connection_rejected', `token 无效: ${err.message}`, {});
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(
      `WS disconnected: socket=${client.id} userId=${client.data.userId || 'unknown'}`,
    );
  }

  // ===========================================================================
  // 普通用户事件
  // ===========================================================================

  /** 加入会话房间 */
  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.data.userId;
      this.assertAuth(userId);

      // 校验用户属于该会话
      const member = await this.prisma.conversationMember.findFirst({
        where: { conversationId: data.conversationId, userId },
        include: { conversation: { select: { isBlocked: true } } },
      });

      if (!member) {
        throw new WsException('您不是该会话的成员');
      }
      if (member.conversation.isBlocked) {
        throw new WsException('该会话已被封禁');
      }

      client.join(`conv:${data.conversationId}`);
      this.logger.log(`User ${userId} joined conv ${data.conversationId}`);
      return { event: 'joined', data: { conversationId: data.conversationId } };
    } catch (err: any) {
      this.logger.warn(`joinConversation 失败: ${err.message}`);
      throw new WsException(err.message || '加入会话失败');
    }
  }

  /** 离开会话房间 */
  @SubscribeMessage('leaveConversation')
  async handleLeaveConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId;
    this.assertAuth(userId);
    client.leave(`conv:${data.conversationId}`);
    return { event: 'left', data: { conversationId: data.conversationId } };
  }

  /** 发送消息 */
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() data: { conversationId: string; type: string; content: string; extra?: any },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.data.userId;
      this.assertAuth(userId);

      // ── 1. 消息内容校验 ──
      if (!data.content || !data.content.trim()) {
        throw new WsException('消息不能为空');
      }
      if (data.content.length > MAX_MESSAGE_LENGTH) {
        throw new WsException(`消息长度不能超过 ${MAX_MESSAGE_LENGTH} 字符`);
      }

      // ── 2. 频率限制（INCR 后判断，保证并发下计数原子；仅首次设置过期避免窗口被无限顺延）──
      const rateLimitKey = `ws:rate:${userId}`;
      const maxMsg = client.data.isAdmin ? RATE_LIMIT_ADMIN_MAX : RATE_LIMIT_MAX_MESSAGES;
      const msgCount = await this.redis.incr(rateLimitKey);
      if (msgCount === 1) {
        await this.redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SEC);
      }
      if (msgCount > maxMsg) {
        throw new WsException('发送频率过高，请稍后重试');
      }

      // ── 3. 敏感词检测 ──
      if (this.detectSensitiveWords(data.content)) {
        this.logger.warn(`敏感词检测触发: userId=${userId} conv=${data.conversationId}`);
        await this.logSecurity(client, 'sensitive_word', '消息含敏感词', {
          conversationId: data.conversationId,
          contentPreview: data.content.substring(0, 50),
        });
        throw new WsException('消息包含违规内容，无法发送');
      }

      // ── 4. 会话成员资格校验 ──
      const member = await this.prisma.conversationMember.findFirst({
        where: { conversationId: data.conversationId, userId },
        include: { conversation: { select: { isBlocked: true } } },
      });

      if (!member) {
        throw new WsException('您不是该会话的成员');
      }
      if (member.conversation.isBlocked) {
        throw new WsException('该会话已被封禁');
      }
      if (member.isMuted) {
        throw new WsException('您已被禁言，无法发送消息');
      }

      // ── 5. 检查是否被对方拉黑 ──
      const otherMembers = await this.prisma.conversationMember.findMany({
        where: {
          conversationId: data.conversationId,
          userId: { not: userId },
        },
        select: { userId: true },
      });
      for (const om of otherMembers) {
        const block = await this.prisma.block.findFirst({
          where: { userId: om.userId, blockedId: userId },
        });
        if (block) {
          throw new WsException('你已被对方拉黑，无法发送消息');
        }
      }

      // ── 6. 消息持久化 ──
      let msgType: any = 'TEXT';
      if (data.type === 'image') msgType = 'IMAGE';
      else if (data.type === 'video') msgType = 'VIDEO';
      else if (data.type === 'audio') msgType = 'AUDIO';
      else if (data.type === 'location') msgType = 'LOCATION';

      // 消息落库、会话最后消息、其他成员未读数放进同一事务，避免并发下状态不一致
      const saved = await this.prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            conversationId: data.conversationId,
            senderId: userId,
            type: msgType,
            content: data.content,
            extra: data.extra || undefined,
          },
          include: {
            sender: { select: { id: true, nickname: true, avatar: true } },
          },
        });
        await tx.conversation.update({
          where: { id: data.conversationId },
          data: {
            lastMessage: data.content.substring(0, 100),
            lastMsgTime: created.createdAt,
          },
        });
        // 未读数记在接收方成员上（聊天列表读的是 member.unreadCount）
        await tx.conversationMember.updateMany({
          where: { conversationId: data.conversationId, userId: { not: userId } },
          data: { unreadCount: { increment: 1 } },
        });
        return created;
      });

      // ── 7. 广播 ──
      const out = {
        id: saved.id,
        conversationId: saved.conversationId,
        senderId: saved.senderId,
        sender: saved.sender,
        type: saved.type,
        content: saved.content,
        extra: saved.extra,
        createdAt: saved.createdAt?.toISOString(),
      };
      this.server.to(`conv:${data.conversationId}`).emit('newMessage', out);

      return { event: 'messageSent', data: out };
    } catch (err: any) {
      if (err instanceof WsException) throw err;
      this.logger.warn(`sendMessage 失败: ${err.message}`);
      throw new WsException(err.message || '发送消息失败');
    }
  }

  /** 撤回消息 */
  @SubscribeMessage('recallMessage')
  async handleRecallMessage(
    @MessageBody() data: { messageId: string; conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.data.userId;
      this.assertAuth(userId);

      const msg = await this.prisma.message.findUnique({ where: { id: data.messageId } });
      if (!msg) throw new WsException('消息不存在');
      if (msg.senderId !== userId) throw new WsException('只能撤回自己发送的消息');

      await this.prisma.message.update({
        where: { id: data.messageId },
        data: { isRecalled: true, recalledAt: new Date() },
      });

      this.server.to(`conv:${data.conversationId}`).emit('messageRecalled', {
        messageId: data.messageId,
        conversationId: data.conversationId,
      });

      this.logger.log(`Message ${data.messageId} recalled by ${userId}`);
      return { event: 'recalled', data: { messageId: data.messageId } };
    } catch (err: any) {
      if (err instanceof WsException) throw err;
      throw new WsException(err.message || '撤回失败');
    }
  }

  /** 正在输入 */
  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId;
    if (!userId) return;
    client.to(`conv:${data.conversationId}`).emit('userTyping', {
      conversationId: data.conversationId,
      userId,
    });
  }

  // ===========================================================================
  // 管理员事件
  // ===========================================================================

  /** 管理员加入用户会话（监控/审核用途） */
  @SubscribeMessage('adminJoinConversation')
  async handleAdminJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.assertAdmin(client);

      // 校验管理员是否有消息或审核权限
      await this.verifyAdminPermission(client.data.userId, 'message:view');

      const conv = await this.prisma.conversation.findUnique({
        where: { id: data.conversationId },
        select: { id: true },
      });
      if (!conv) throw new WsException('会话不存在');

      client.join(`conv:${data.conversationId}`);
      this.logger.log(
        `Admin ${client.data.userId} joined conv ${data.conversationId} (monitoring)`,
      );
      await this.logSecurity(client, 'admin_join_conv', '管理员查看会话', {
        conversationId: data.conversationId,
      });

      return { event: 'adminJoined', data: { conversationId: data.conversationId } };
    } catch (err: any) {
      if (err instanceof WsException) throw err;
      throw new WsException('管理员加入会话失败');
    }
  }

  /** 管理员撤回他人消息 */
  @SubscribeMessage('adminRecallMessage')
  async handleAdminRecallMessage(
    @MessageBody() data: { messageId: string; conversationId: string; reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.assertAdmin(client);
      await this.verifyAdminPermission(client.data.userId, 'content:manage');

      const msg = await this.prisma.message.findUnique({ where: { id: data.messageId } });
      if (!msg) throw new WsException('消息不存在');

      await this.prisma.message.update({
        where: { id: data.messageId },
        data: { isRecalled: true, recalledAt: new Date() },
      });

      this.server.to(`conv:${data.conversationId}`).emit('messageRecalled', {
        messageId: data.messageId,
        conversationId: data.conversationId,
      });

      await this.logSecurity(client, 'admin_recall_msg', `管理员撤回消息: ${data.reason || '无原因'}`, {
        messageId: data.messageId,
        conversationId: data.conversationId,
      });

      this.logger.log(
        `Admin ${client.data.userId} recalled msg ${data.messageId} in conv ${data.conversationId}`,
      );
      return { event: 'adminRecalled', data: { messageId: data.messageId } };
    } catch (err: any) {
      if (err instanceof WsException) throw err;
      throw new WsException('撤回失败');
    }
  }

  /** 管理员封禁/解封会话 */
  @SubscribeMessage('adminToggleConversation')
  async handleAdminToggleConversation(
    @MessageBody() data: { conversationId: string; blocked: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.assertAdmin(client);
      await this.verifyAdminPermission(client.data.userId, 'content:manage');

      await this.prisma.conversation.update({
        where: { id: data.conversationId },
        data: { isBlocked: data.blocked },
      });

      await this.logSecurity(
        client,
        data.blocked ? 'admin_block_conv' : 'admin_unblock_conv',
        `管理员${data.blocked ? '封禁' : '解封'}会话`,
        { conversationId: data.conversationId },
      );

      // 通知会话中所有用户
      this.server.to(`conv:${data.conversationId}`).emit(
        data.blocked ? 'conversationBlocked' : 'conversationUnblocked',
        { conversationId: data.conversationId },
      );

      return { event: 'conversationToggled', data };
    } catch (err: any) {
      if (err instanceof WsException) throw err;
      throw new WsException('操作失败');
    }
  }

  // ===========================================================================
  // 服务端推送（供其他模块调用）
  // ===========================================================================

  async pushNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  async pushOrderUpdate(userId: string, order: any) {
    this.server.to(`user:${userId}`).emit('orderUpdate', order);
  }

  async pushNewDeliveryOrder(riderId: string, order: any) {
    this.server.to(`user:${riderId}`).emit('newDeliveryOrder', order);
  }

  async pushToAdmins(event: string, data: any) {
    this.server.to('room:admins').emit(event, data);
  }

  // ===========================================================================
  // 私有工具方法
  // ===========================================================================

  private extractBearerToken(header?: string): string | null {
    if (!header) return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
  }

  private assertAuth(userId: any) {
    if (!userId) throw new WsException('未认证，请先登录');
  }

  private assertAdmin(client: Socket) {
    if (!client.data.isAdmin) {
      this.logger.warn(`非管理员尝试调用管理员事件: userId=${client.data.userId}`);
      throw new WsException('需要管理员权限');
    }
  }

  /** 校验管理员是否有指定权限（通过 AdminPermission 表） */
  private async verifyAdminPermission(adminId: string, permCode: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: adminId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                code: true,
                permissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!account) throw new WsException('管理员不存在');

    for (const ar of account.roles) {
      if (ar.role.code === 'super_admin' || ar.role.code === 'SUPER_ADMIN') return;
      for (const rp of ar.role.permissions) {
        if (rp.permission.code === permCode) return;
      }
    }

    throw new WsException(`缺少权限: ${permCode}`);
  }

  /** 敏感词检测（可后续升级为敏感词库检测） */
  private detectSensitiveWords(text: string): boolean {
    return SENSITIVE_WORD_PATTERN.test(text);
  }

  /** 记录安全日志 */
  private async logSecurity(
    client: Socket,
    action: string,
    description: string,
    detail: Record<string, any>,
  ) {
    try {
      const userId = client.data?.userId || '';
      const isAdmin = client.data?.isAdmin || false;
      await this.prisma.serverActionLog.create({
        data: {
          adminId: isAdmin ? userId : '',
          action,
          status: 'warning',
          reason: description,
          detail: {
            userId,
            isAdmin,
            socketId: client.id,
            ip: client.handshake.address || '',
            ...detail,
          },
        },
      });
    } catch {
      // 安全日志写入失败不影响主流程
    }
  }
}