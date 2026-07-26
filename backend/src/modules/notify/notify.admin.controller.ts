import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { NotifyService } from './notify.service';
import { AdminBroadcastDto } from './dto/create-notification.dto';
import {
  WechatMessageLogQueryDto,
  RealtimeSessionQueryDto,
} from './dto/notification-query.dto';

@ApiTags('通知管理')
@Controller('admin')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class NotifyAdminController {
  constructor(private readonly notifyService: NotifyService) {}

  // ==================== 通知群发 ====================

  @Post('notifications/send')
  @RequirePermission('notification:send')
  @ApiOperation({ summary: '发送系统通知（群发）' })
  async sendBroadcast(
    @CurrentUser('sub') adminId: string,
    @Body() dto: AdminBroadcastDto,
  ) {
    return this.notifyService.adminBroadcast(adminId, dto);
  }

  // ==================== 微信发送日志 ====================

  @Get('wechat-message-logs')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '微信消息发送日志' })
  getWechatMessageLogs(@Query() query: WechatMessageLogQueryDto) {
    return this.notifyService.getWechatMessageLogs(query);
  }

  @Post('wechat-message-logs/:id/retry')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '重试发送失败的消息' })
  retryWechatMessage(@Param('id') id: string) {
    return this.notifyService.retryWechatMessage(id);
  }

  // ==================== WebSocket 在线会话 ====================

  @Get('realtime/sessions')
  @RequirePermission('system:config')
  @ApiOperation({ summary: 'WebSocket 在线会话列表' })
  getRealtimeSessions(@Query() query: RealtimeSessionQueryDto) {
    return this.notifyService.getRealtimeSessions(query);
  }

  @Post('realtime/test-push')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '发送官方消息给用户' })
  testPush(
    @Body() body: { userId: string; message: string },
  ) {
    return this.notifyService.testPushToUser(body.userId, body.message);
  }

  @Get('realtime/official-conversations')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '官方消息会话列表' })
  getOfficialConversations(@Query() query: any) {
    return this.notifyService.getOfficialConversations(query);
  }

  @Get('realtime/official-conversations/:id/messages')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '官方消息会话记录' })
  getOfficialConversationMessages(@Param('id') id: string, @Query() query: any) {
    return this.notifyService.getOfficialConversationMessages(id, query);
  }

  @Post('realtime/official-conversations/:id/reply')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '回复官方消息会话' })
  replyOfficialConversation(
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    return this.notifyService.replyOfficialConversation(id, body.content);
  }

  @Post('realtime/broadcast')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '全站广播推送' })
  broadcast(@Body() body: { message: string; title?: string }) {
    return this.notifyService.broadcastToAll({
      event: 'notification',
      type: 'notification',
      data: {
        type: 'system',
        title: body.title || '系统广播',
        content: body.message,
        createdAt: new Date().toISOString(),
      },
    });
  }

  @Post('realtime/push-region')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '按区域推送' })
  pushToRegion(@Body() body: { regionId: string; message: string; title?: string }) {
    return this.notifyService.pushToRegion(body.regionId, {
      event: 'notification',
      type: 'notification',
      data: {
        type: 'system',
        title: body.title || '区域通知',
        content: body.message,
        createdAt: new Date().toISOString(),
      },
    });
  }

  // ==================== 通知总览 ====================

  @Get('notifications/stats')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '通知总览统计' })
  getNotifyStats() {
    return this.notifyService.getNotifyStats();
  }

  // ==================== 订阅授权记录 ====================

  @Get('wechat-subscribe-consents')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '订阅授权记录列表' })
  getSubscribeConsents(@Query() query: any) {
    return this.notifyService.getSubscribeConsents(query);
  }

  // ==================== 公众号绑定管理 ====================

  @Get('wechat/official/bindings')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '公众号绑定列表' })
  getOfficialBindings(@Query() query: any) {
    return this.notifyService.getOfficialBindings(query);
  }

  @Delete('wechat/official/bindings/:id')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '解绑公众号' })
  deleteOfficialBinding(@Param('id') id: string) {
    return this.notifyService.deleteOfficialBinding(id);
  }
}
