import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ActivityService } from './activity.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('活动/社团')
@Controller()
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get(['activity/activities', 'miniapp/activity/activities'])
  getActivities(@Query() query: any) {
    return this.activityService.getActivities(query);
  }

  @Get(['activity/activities/:activityId', 'miniapp/activity/activities/:activityId'])
  getActivityDetail(@Param('activityId') activityId: string) {
    return this.activityService.getActivityDetail(activityId);
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

  @Get('activity/clubs/:clubId')
  getClubDetail(@Param('clubId') clubId: string) {
    return this.activityService.getClubDetail(clubId);
  }

  @Get('activity/clubs/:clubId/members')
  getClubMembers(@Param('clubId') clubId: string, @Query() query: any) {
    return this.activityService.getClubMembers(clubId, query);
  }

  @Get('activity/orders/club/:clubId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getClubOrders(@Param('clubId') clubId: string, @Query() query: any, @CurrentUser('sub') userId: string) {
    return this.activityService.getClubOrders(clubId, query);
  }

  @Get('explosivesel/competitions')
  getCompetitions(@Query() query: any) {
    return this.activityService.getCompetitions(query);
  }

  @Post('explosivesel/competitions')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createCompetition(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.activityService.createCompetition(userId, dto);
  }

  @Get('explosivesel/competitions/:competitionId')
  getCompetitionInfo(@Param('competitionId') competitionId: string) {
    return this.activityService.getCompetitionInfo(competitionId);
  }

  @Post('explosivesel/photos')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  submitPhoto(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.activityService.submitPhoto(userId, dto);
  }

  @Get('explosivesel/photos/competition/:competitionId')
  getCompetitionPhotos(@Param('competitionId') competitionId: string) {
    return this.activityService.getCompetitionPhotos(competitionId);
  }

  @Get('explosivesel/photos/:photoId')
  getPhotoDetail(@Param('photoId') photoId: string) {
    return this.activityService.getPhotoDetail(photoId);
  }

  @Post('explosivesel/votes/:photoId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  voteForPhoto(@Param('photoId') photoId: string, @CurrentUser('sub') userId: string) {
    return this.activityService.voteForPhoto(photoId, userId);
  }

  @Post('explosivesel/ratings/:photoId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  ratePhoto(@Param('photoId') photoId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.activityService.ratePhoto(photoId, userId, dto);
  }

  @Delete('explosivesel/ratings/:ratingId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteRating(@Param('ratingId') ratingId: string, @CurrentUser('sub') userId: string) {
    return this.activityService.deleteRating(ratingId, userId);
  }

  @Get('explosivesel/ratings/photo/:photoId')
  getPhotoRatings(@Param('photoId') photoId: string, @Query() query: any) {
    return this.activityService.getPhotoRatings(photoId, query);
  }
}
