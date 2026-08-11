import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission, RequirePermissionAny } from '../../decorators/require-permission.decorator';
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

  @Get('notifications')
  @RequirePermissionAny('notification:view', 'system:config')
  @ApiOperation({ summary: '通知列表' })
  getNotifications(
    @CurrentUser('sub') operatorId: string,
    @Query() query: any,
  ) {
    return this.notifyService.getAdminNotifications(operatorId, query);
  }

  @Post('notifications/send')
  @RequirePermission('notification:send')
  @ApiOperation({ summary: '发送系统通知（群发）' })
  async sendBroadcast(
    @CurrentUser('sub') adminId: string,
    @Body() dto: AdminBroadcastDto,
  ) {
    return this.notifyService.adminBroadcast(adminId, dto);
  }

  @Post('notifications/:id/retry-delivery')
  @RequirePermission('notification:send')
  @ApiOperation({ summary: '重试通知失败的投递渠道' })
  retryNotificationDelivery(@Param('id') id: string, @CurrentUser('sub') operatorId: string) {
    return this.notifyService.retryNotificationDelivery(id, operatorId);
  }

  @Get('official-assistant/messages')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '官方助手消息列表' })
  listOfficialAssistantMessages(@Query() query: any) {
    return this.notifyService.listOfficialAssistantMessages({
      regionId: query.regionId || query.region_id,
      category: query.category,
      status: query.status,
      keyword: query.keyword,
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize || query.page_size ? Number(query.pageSize || query.page_size) : 20,
    });
  }

  @Post('official-assistant/messages')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '创建官方助手消息' })
  createOfficialAssistantMessage(
    @CurrentUser('sub') adminId: string,
    @Body() dto: any,
  ) {
    return this.notifyService.createOfficialAssistantMessage(adminId, dto);
  }

  @Put('official-assistant/messages/:id')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '更新官方助手消息' })
  updateOfficialAssistantMessage(
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.notifyService.updateOfficialAssistantMessage(id, dto);
  }

  @Delete('official-assistant/messages/:id')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '删除官方助手消息' })
  deleteOfficialAssistantMessage(@Param('id') id: string) {
    return this.notifyService.deleteOfficialAssistantMessage(id);
  }

  // ==================== 微信发送日志 ====================

  @Get('wechat-message-logs')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '微信消息发送日志' })
  getWechatMessageLogs(
    @Query() query: WechatMessageLogQueryDto,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.notifyService.getWechatMessageLogs(query, operatorId);
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

  @Get('realtime/status')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '实时通信状态检测' })
  getRealtimeStatus() {
    return this.notifyService.getRealtimeStatus();
  }

  @Get('realtime/ws-test-token')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '生成实时通信 WebSocket 转发测试 token' })
  getRealtimeWsTestToken(@CurrentUser('sub') adminId: string) {
    return this.notifyService.createRealtimeWsTestToken(adminId);
  }

  @Post('realtime/test-push')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '发送官方消息给用户' })
  testPush(
    @CurrentUser('sub') adminId: string,
    @Body() body: { userId: string; message: string },
  ) {
    return this.notifyService.testPushToUser(body.userId, body.message, adminId);
  }

  @Get('realtime/official-conversations')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '官方消息会话列表' })
  getOfficialConversations(@CurrentUser('sub') adminId: string, @Query() query: any) {
    return this.notifyService.getOfficialConversations(adminId, query);
  }

  @Get('realtime/official-conversations/:id/messages')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '官方消息会话记录' })
  getOfficialConversationMessages(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Query() query: any) {
    return this.notifyService.getOfficialConversationMessages(id, query, adminId);
  }

  @Post('realtime/official-conversations/:id/reply')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '回复官方消息会话' })
  replyOfficialConversation(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Body() body: { content: string },
  ) {
    return this.notifyService.replyOfficialConversation(id, body.content, adminId, adminId);
  }

  @Put('realtime/official-conversations/:id/status')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '更新官方消息会话处理状态' })
  updateOfficialConversationStatus(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Body() body: { status: string; content?: string },
  ) {
    return this.notifyService.updateOfficialConversationStatus(id, body.status, adminId, body.content);
  }

  // ==================== 通知总览 ====================

  @Get('notifications/stats')
  @RequirePermissionAny('notification:view', 'system:config')
  @ApiOperation({ summary: '通知总览统计' })
  getNotifyStats(@CurrentUser('sub') operatorId: string) {
    return this.notifyService.getNotifyStats(operatorId);
  }

  // ==================== 订阅授权记录 ====================

  @Get('wechat-subscribe-consents')
  @RequirePermission('notification:view')
  @ApiOperation({ summary: '订阅授权记录列表' })
  getSubscribeConsents(
    @Query() query: any,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.notifyService.getSubscribeConsents(query, operatorId);
  }

  // ==================== 公众号绑定管理 ====================

  @Get('wechat/official/bindings')
  @RequirePermission('notification:view')
  @ApiOperation({ summary: '公众号绑定列表' })
  getOfficialBindings(
    @Query() query: any,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.notifyService.getOfficialBindings(query, operatorId);
  }

  @Delete('wechat/official/bindings/:id')
  @RequirePermission('notification:binding:unbind')
  @ApiOperation({ summary: '解绑公众号' })
  deleteOfficialBinding(
    @Param('id') id: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    return this.notifyService.deleteOfficialBinding(id, operatorId, req.ip);
  }
}
