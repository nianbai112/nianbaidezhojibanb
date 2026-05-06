import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { RedisService } from '../../common/services/redis.service';

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: '*' },
  transports: ['websocket'],
})
export class MessageGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MessageGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token as string;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET'),
      });

      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
      this.logger.log(`Client connected: ${client.id}, user: ${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`conv:${data.conversationId}`);
    return { event: 'joined', data: { conversationId: data.conversationId } };
  }

  @SubscribeMessage('leaveConversation')
  async handleLeaveConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`conv:${data.conversationId}`);
    return { event: 'left', data: { conversationId: data.conversationId } };
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() data: { conversationId: string; type: string; content: string; extra?: any },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId;
    const message = {
      id: `msg_${Date.now()}`,
      conversationId: data.conversationId,
      senderId: userId,
      type: data.type,
      content: data.content,
      extra: data.extra,
      createdAt: new Date().toISOString(),
    };

    // 广播到会话房间
    this.server.to(`conv:${data.conversationId}`).emit('newMessage', message);

    return { event: 'messageSent', data: message };
  }

  @SubscribeMessage('recallMessage')
  async handleRecallMessage(
    @MessageBody() data: { messageId: string; conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.server.to(`conv:${data.conversationId}`).emit('messageRecalled', {
      messageId: data.messageId,
      conversationId: data.conversationId,
    });

    return { event: 'recalled', data: { messageId: data.messageId } };
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.to(`conv:${data.conversationId}`).emit('userTyping', {
      conversationId: data.conversationId,
      userId: client.data.userId,
    });
  }

  // 向用户推送系统通知
  async pushNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  // 向用户推送订单状态变更
  async pushOrderUpdate(userId: string, order: any) {
    this.server.to(`user:${userId}`).emit('orderUpdate', order);
  }

  // 向骑手推送新订单
  async pushNewDeliveryOrder(riderId: string, order: any) {
    this.server.to(`user:${riderId}`).emit('newDeliveryOrder', order);
  }
}
