import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MessageService } from './message.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('消息/聊天')
@Controller()
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get('messages/chat-list')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getChatList(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.messageService.getChatList(userId, query);
  }

  @Get('messages/history')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getChatHistory(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.messageService.getChatHistory(userId, query);
  }

  @Get('messages/region/private-chat-enabled')
  getPrivateChatEnabled(@Query('region_id') regionId: string) {
    return this.messageService.getPrivateChatEnabled(regionId);
  }

  @Post('messages/recall-message')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  recallMessage(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.messageService.recallMessage(userId, dto);
  }

  @Delete('messages/delete-chat-history')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  clearChatHistory(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.messageService.clearChatHistory(userId, dto);
  }

  @Get('messages/group/:groupId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getGroupMessages(@Param('groupId') groupId: string, @CurrentUser('sub') userId: string, @Query() query: any) {
    return this.messageService.getGroupMessages(groupId, userId, query);
  }

  @Post('messages/group/:groupId/leave')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  leaveGroup(@Param('groupId') groupId: string, @CurrentUser('sub') userId: string) {
    return this.messageService.leaveGroup(groupId, userId);
  }
}
