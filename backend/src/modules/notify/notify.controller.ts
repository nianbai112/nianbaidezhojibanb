import {
  Controller, Get, Put, Delete, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotifyService } from './notify.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import {
  NotificationQueryDto,
  MarkAllReadDto,
  SubscribeConsentDto,
} from './dto/notification-query.dto';

@ApiTags('通知中心')
@Controller()
export class NotifyController {
  constructor(private readonly notifyService: NotifyService) {}

  // ==================== 新接口 ====================

  @Get('notifications/center')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取通知中心列表' })
  getCenterList(
    @CurrentUser('sub') userId: string,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notifyService.getCenterList(userId, query);
  }

  @Get('notifications/unread-summary')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取未读汇总' })
  getUnreadSummary(
    @CurrentUser('sub') userId: string,
    @Query('regionId') regionId?: string,
  ) {
    return this.notifyService.getUnreadSummary(userId, regionId);
  }

  @Post('notifications/batch-action')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量标记已读或从用户列表隐藏' })
  batchAction(
    @CurrentUser('sub') userId: string,
    @Body() body: { ids?: string[]; action?: 'read' | 'hide' },
  ) {
    return this.notifyService.batchAction(userId, body.ids, body.action);
  }

  @Put('notifications/:id/read')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '标记单条已读' })
  markRead(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.notifyService.markRead(userId, id);
  }

  @Put('notifications/read-all')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '全部标记已读' })
  markAllRead(
    @CurrentUser('sub') userId: string,
    @Query() query: MarkAllReadDto,
  ) {
    return this.notifyService.markAllRead(userId, query);
  }

  @Delete('notifications/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除通知' })
  deleteNotification(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.notifyService.deleteNotification(userId, id);
  }

  @Post('notifications/subscribe-consent')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '订阅消息授权上报' })
  subscribeConsent(
    @CurrentUser('sub') userId: string,
    @Body() dto: SubscribeConsentDto,
  ) {
    return this.notifyService.recordSubscribeConsent({
      userId,
      templateType: dto.templateType || '',
      templateId: dto.templateId || '',
      status: dto.status || 'unknown',
      sourceScene: dto.sourceScene,
    });
  }

  @Get('official-assistant/messages')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取官方助手消息时间线' })
  getOfficialAssistantTimeline(
    @CurrentUser('sub') userId: string,
    @Query() query: any,
  ) {
    return this.notifyService.getOfficialAssistantTimeline(userId, {
      regionId: query.region_id || query.regionId,
      category: query.category,
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize || query.page_size ? Number(query.pageSize || query.page_size) : 20,
    });
  }

  @Post('notifications/:id/review')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '审核通知关联内容（旧小程序兼容）' })
  reviewNotificationLegacy(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: { action?: string },
  ) {
    return this.notifyService.reviewNotification(userId, id, dto?.action || '');
  }

  // ==================== 旧接口兼容 ====================

  @Get('notifications/all-details')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取通知列表（旧接口兼容）' })
  getAllDetails(
    @CurrentUser('sub') userId: string,
    @Query() query: any,
  ) {
    const normalizedQuery: NotificationQueryDto = {
      type: query.type,
      regionId: query.region_id || query.regionId,
      unreadOnly: query.unreadOnly || query.unread_only,
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 10,
    };
    return this.notifyService.getCenterList(userId, normalizedQuery);
  }

  @Get('notifications/unread-count')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取未读数（旧接口兼容）' })
  getUnreadCount(
    @CurrentUser('sub') userId: string,
    @Query('region_id') regionId?: string,
  ) {
    return this.notifyService.getUnreadSummary(userId, regionId);
  }

  @Put('notifications/mark-read/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '标记已读（旧接口兼容）' })
  markReadLegacy(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.notifyService.markRead(userId, id);
  }

  @Put('notifications/mark-read-all')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '全部标记已读（旧接口兼容）' })
  markAllReadLegacy(@CurrentUser('sub') userId: string, @Query('region_id') regionId?: string) {
    // AUD-P1-020: 旧接口支持下传 regionId，防止跨区域清空未读
    return this.notifyService.markAllRead(userId, { regionId: regionId || '' });
  }
}
