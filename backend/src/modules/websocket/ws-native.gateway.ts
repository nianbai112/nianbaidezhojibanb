import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { Server } from 'http';

interface NativeClient {
  ws: WebSocket;
  userId: string;
  isAdmin: boolean;
  socketId: string;
  regionId?: string;
}

export class WsNativeGateway {
  private readonly logger = new Logger(WsNativeGateway.name);
  private wss: WebSocketServer;
  private clients: Map<string, NativeClient> = new Map();
  private userSockets: Map<string, Set<string>> = new Map();
  private pingInterval: NodeJS.Timeout;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ===========================================================================
  // 启动 / 关闭
  // ===========================================================================

  attach(server: Server) {
    this.prisma.realtimeSession.updateMany({
      where: { online: true },
      data: { online: false },
    }).then((res) => {
      if (res.count > 0) this.logger.log(`Marked ${res.count} stale realtime sessions offline on startup`);
    }).catch((err) => {
      this.logger.warn(`Failed to mark stale realtime sessions offline: ${err.message}`);
    });

    this.wss = new WebSocketServer({ server, path: '/ws-native' });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (err) => {
      this.logger.error(`Native WebSocket server error: ${err.message}`);
    });

    // 心跳检测：30秒一次
    this.pingInterval = setInterval(() => {
      this.clients.forEach((client, socketId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        } else {
          this.removeClient(socketId);
        }
      });
    }, 30000);

    this.logger.log('Native WebSocket server attached at /ws-native');
  }

  shutdown() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.wss) {
      this.wss.close(() => {
        this.logger.log('Native WebSocket server closed');
      });
    }
    this.clients.clear();
    this.userSockets.clear();
  }

  // ===========================================================================
  // 连接处理
  // ===========================================================================

  private async handleConnection(ws: WebSocket, req: any) {
    const socketId = this.generateSocketId();
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || '';

    if (!token) {
      this.logger.warn(`Native WS connection rejected: no token`);
      ws.close(4001, 'Missing token');
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET'),
      });

      const userId = payload.sub;
      const isAdmin = payload.isAdmin === true;

      const client: NativeClient = {
        ws,
        userId,
        isAdmin,
        socketId,
      };

      this.clients.set(socketId, client);

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socketId);

      // 写入在线会话
      try {
        await this.prisma.realtimeSession.create({
          data: {
            userId: isAdmin ? null : userId,
            adminId: isAdmin ? userId : null,
            socketId,
            platform: isAdmin ? 'admin' : 'miniapp',
            online: true,
            ip: this.getClientIp(req),
            userAgent: req.headers['user-agent'] || '',
          },
        });
      } catch (e: any) {
        this.logger.warn(`Failed to create realtime session: ${e.message}`);
      }

      // 发送连接成功消息
      this.send(ws, {
        event: 'connected',
        data: { userId, socketId },
      });

      // 推送当前未读数
      try {
        const unread = await this.prisma.notification.count({
          where: { userId, isRead: false },
        });
        this.send(ws, {
          event: 'unreadSummary',
          data: { total: unread, unreadCount: unread },
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
      const msg = JSON.parse(raw.toString());

      if (msg.event === 'ping') {
        this.send(client.ws, { event: 'pong', data: {} });
      } else if (msg.event === 'subscribe') {
        // 订阅特定房间（如区域通知）
        if (msg.data?.regionId) {
          client.regionId = msg.data.regionId;
        }
      } else if (msg.type === 'message' || msg.event === 'message' || msg.event === 'private_message') {
        await this.handlePrivateMessage(client, msg);
      }
    } catch (err: any) {
      this.logger.warn(`Native WS message handling failed: ${err.message}`);
    }
  }

  private async findOrCreatePrivateConversation(userId: string, receiverId: string) {
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

  private toMessageType(type?: string) {
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
    return map[key] || 'TEXT';
  }

  private async handlePrivateMessage(client: NativeClient, msg: any) {
    if (client.isAdmin) return;
    const receiverId = String(msg.receiverId || msg.receiver_id || '').trim();
    const content = String(msg.message || msg.content || '').trim();
    if (!receiverId || !content) return;

    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });
    if (!receiver) {
      this.send(client.ws, {
        event: 'message_error',
        data: { message: '接收方不存在' },
      });
      return;
    }

    const conversation = await this.findOrCreatePrivateConversation(client.userId, receiverId);
    const saved = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: client.userId,
        type: this.toMessageType(msg.messageType || msg.type) as any,
        content,
        extra: msg.extra || undefined,
      },
      include: { sender: { select: { id: true, nickname: true, avatar: true } } },
    });

    await Promise.all([
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessage: content, lastMsgTime: saved.createdAt },
      }),
      this.prisma.conversationMember.updateMany({
        where: { conversationId: conversation.id, userId: receiverId },
        data: { unreadCount: { increment: 1 } },
      }),
    ]);

    const payload = {
      event: 'message',
      type: 'message',
      conversationId: conversation.id,
      messageId: saved.id,
      senderId: client.userId,
      receiverId,
      message: content,
      messageType: String(saved.type).toLowerCase(),
      sender_avatar: saved.sender.avatar,
      sender_nickname: saved.sender.nickname,
      timestamp: saved.createdAt.toISOString(),
    };

    this.pushToUser(receiverId, payload);
    this.send(client.ws, {
      event: 'message_sent',
      type: 'message_sent',
      data: {
        conversationId: conversation.id,
        messageId: saved.id,
        receiverId,
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

    const userSocketSet = this.userSockets.get(client.userId);
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(client.userId);
      }
    }

    try {
      await this.prisma.realtimeSession.updateMany({
        where: { socketId, online: true },
        data: { online: false },
      });
    } catch {
      // ignore
    }
  }

  // ===========================================================================
  // 推送方法（供 NotifyService 调用）
  // ===========================================================================

  pushToUser(userId: string, payload: any) {
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

  pushToRegion(regionId: string, payload: any) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.clients.forEach((client) => {
      if (
        client.regionId === regionId &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(data);
      }
    });
  }

  broadcast(payload: any) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
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
