import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CircleService } from './circle.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('圈子')
@Controller()
export class CircleController {
  constructor(private readonly circleService: CircleService) {}

  @Get('circles/region/:regionId')
  getByRegion(@Param('regionId') regionId: string, @Query() query: any) {
    return this.circleService.getByRegion(regionId, query);
  }

  @Get('circles/:circleId')
  getDetail(@Param('circleId') circleId: string) {
    return this.circleService.getDetail(circleId);
  }

  @Post('circles')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  create(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.circleService.create(userId, dto);
  }

  @Put('circles/:circleId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  update(@Param('circleId') circleId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.circleService.update(circleId, userId, dto);
  }

  @Post('circles/:circleId/invite')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  inviteMember(@Param('circleId') circleId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.circleService.inviteMember(circleId, userId, dto);
  }

  @Get('circles/:circleId/group-chat')
  getGroupChat(@Param('circleId') circleId: string, @Query() query: any) {
    return this.circleService.getGroupChat(circleId, query);
  }

  @Post('circles/:circleId/create-group-chat')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  createGroupChat(@Param('circleId') circleId: string, @CurrentUser('sub') userId: string, @Body() dto: any, @Query() query: any) {
    return this.circleService.createGroupChat(circleId, userId, dto, query);
  }

  @Get('circles/:circleId/pending-members')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getPendingMembers(@Param('circleId') circleId: string, @Query() query: any) {
    return this.circleService.getPendingMembers(circleId, query);
  }

  @Put('circles/:circleId/members/:userId/audit')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  auditMember(@Param('circleId') circleId: string, @Param('userId') memberId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.circleService.auditMember(circleId, memberId, userId, dto);
  }

  @Get('circle-members/:circleId/users')
  getMembers(@Param('circleId') circleId: string, @Query() query: any) {
    return this.circleService.getMembers(circleId, query);
  }

  @Post('circle-members/:circleId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  join(@Param('circleId') circleId: string, @CurrentUser('sub') userId: string) {
    return this.circleService.join(circleId, userId);
  }

  @Delete('circle-members/:circleId/:userId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  leave(@Param('circleId') circleId: string, @Param('userId') targetUserId: string, @CurrentUser('sub') userId: string) {
    return this.circleService.leave(circleId, targetUserId, userId);
  }

  @Get('circle-members/check/:circleId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  checkMember(@Param('circleId') circleId: string, @CurrentUser('sub') userId: string) {
    return this.circleService.checkMember(circleId, userId);
  }

  @Get('circles/:circleId/topic-headers')
  getTopicHeaders(@Param('circleId') circleId: string, @Query('include_topics') includeTopics: string) {
    return this.circleService.getTopicHeaders(circleId, includeTopics);
  }

  @Post('circles/:circleId/topic-headers/batch-create')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  batchCreateTopicHeaders(@Param('circleId') circleId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.circleService.batchCreateTopicHeaders(circleId, userId, dto);
  }

  @Put('circles/:circleId/topic-headers/:headerId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateTopicHeader(@Param('circleId') circleId: string, @Param('headerId') headerId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.circleService.updateTopicHeader(circleId, headerId, userId, dto);
  }

  @Delete('circles/:circleId/topic-headers/:headerId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  deleteTopicHeader(@Param('circleId') circleId: string, @Param('headerId') headerId: string, @CurrentUser('sub') userId: string) {
    return this.circleService.deleteTopicHeader(circleId, headerId, userId);
  }

  @Delete('circles/:circleId/topic-headers/:headerId/topics/:topicId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  unbindTopic(@Param('circleId') circleId: string, @Param('headerId') headerId: string, @Param('topicId') topicId: string, @CurrentUser('sub') userId: string) {
    return this.circleService.unbindTopic(circleId, headerId, topicId, userId);
  }

  @Get('circle/search')
  search(@Query() query: any) {
    return this.circleService.search(query);
  }

  @Get('circle/search/hot-keywords')
  getHotKeywords(@Query() query: any) {
    return this.circleService.getHotKeywords(query);
  }
}
