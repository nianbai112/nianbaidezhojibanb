import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('通知')
@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('notifications/all-details')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getAll(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.notificationService.getAll(userId, query);
  }

  @Put('notifications/mark-read/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  markRead(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.notificationService.markRead(id, userId);
  }

  @Put('notifications/mark-read-all')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.notificationService.markAllRead(userId);
  }

  @Delete('notifications/:notificationId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteNotification(@Param('notificationId') notificationId: string, @CurrentUser('sub') userId: string) {
    return this.notificationService.deleteNotification(notificationId, userId);
  }

  @Get('notifications/unread-count')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getUnreadCount(@CurrentUser('sub') userId: string, @Query('region_id') regionId: string) {
    return this.notificationService.getUnreadCount(userId, regionId);
  }
}
