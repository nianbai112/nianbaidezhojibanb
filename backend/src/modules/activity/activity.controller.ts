import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ActivityService } from './activity.service';
import { OptionalAuthGuard } from '../../guards/optional-auth.guard';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('活动/社团')
@Controller()
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get(['activity/activities', 'miniapp/activity/activities'])
  @UseGuards(OptionalAuthGuard)
  getActivities(@Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.activityService.getActivities(query, userId);
  }

  @Get(['activity/activities/:activityId', 'miniapp/activity/activities/:activityId'])
  @UseGuards(OptionalAuthGuard)
  getActivityDetail(@Param('activityId') activityId: string, @CurrentUser('sub') userId?: string) {
    return this.activityService.getActivityDetail(activityId, userId);
  }

  @Get(['activity/activities/:activityId/participants', 'miniapp/activity/activities/:activityId/participants'])
  getParticipants(@Param('activityId') activityId: string, @Query() query: any) {
    return this.activityService.getParticipants(activityId, query);
  }

  @Post('activity/orders/create-with-payment')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createOrderWithPayment(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.activityService.createOrderWithPayment(userId, dto);
  }

  @Post(['activity/activities/:activityId/join', 'miniapp/activity/activities/:activityId/join'])
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  joinFreeActivity(@CurrentUser('sub') userId: string, @Param('activityId') activityId: string) {
    return this.activityService.joinFreeActivity(userId, activityId);
  }

  @Get('activity/orders/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyOrders(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.activityService.getMyOrders(userId, query);
  }

  @Get('activity/tickets/my')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getMyTickets(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.activityService.getMyTickets(userId, query);
  }

  @Get('activity/orders/my/:orderId')
  @UseGuards(JwtGuard)
  getMyOrder(@CurrentUser('sub') userId: string, @Param('orderId') id: string) { return this.activityService.getMyOrder(userId,id); }
  @Post('activity/orders/my/:orderId/pay')
  @UseGuards(JwtGuard)
  continueOrderPayment(@CurrentUser('sub') userId: string, @Param('orderId') id: string) { return this.activityService.continueOrderPayment(userId,id); }
  @Post('activity/orders/my/:orderId/cancel')
  @UseGuards(JwtGuard)
  cancelMyOrder(@CurrentUser('sub') userId: string, @Param('orderId') id: string) { return this.activityService.cancelMyOrder(userId,id); }
  @Post('activity/orders/my/:orderId/refund')
  @UseGuards(JwtGuard)
  refundMyOrder(@CurrentUser('sub') userId: string, @Param('orderId') id: string, @Body() dto: any) { return this.activityService.refundMyOrder(userId,id,dto); }
  @Post('activity/activities/:activityId/check-in')
  @UseGuards(JwtGuard)
  checkInTicket(@CurrentUser('sub') userId: string, @Param('activityId') id: string, @Body() dto: any) { return this.activityService.checkInTicket(userId,id,String(dto?.ticket_code||'')); }

  @Get('activity/clubs/:clubId')
  @UseGuards(OptionalAuthGuard)
  getClubDetail(@Param('clubId') clubId: string, @CurrentUser('sub') userId?: string) {
    return this.activityService.getClubDetail(clubId, userId);
  }

  @Get('activity/clubs/:clubId/members')
  @UseGuards(OptionalAuthGuard)
  getClubMembers(@Param('clubId') clubId: string, @Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.activityService.getClubMembers(clubId, query, userId);
  }

  @Get('activity/orders/club/:clubId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getClubOrders(@Param('clubId') clubId: string, @Query() query: any, @CurrentUser('sub') userId: string) {
    return this.activityService.getClubOrders(clubId, query, userId);
  }

  

  

  

  

  

  

  

  

  

  
}
