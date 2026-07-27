import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MessageService } from './message.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';

@ApiTags('消息/聊天')
@Controller()
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get('admin/private-messages/conversations')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('message:view')
  @ApiBearerAuth()
  getAdminPrivateConversations(@Query() query: any) {
    return this.messageService.getAdminPrivateConversations(query);
  }

  @Get('admin/private-messages/conversations/:conversationId/messages')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('message:view')
  @ApiBearerAuth()
  getAdminPrivateConversationMessages(@Param('conversationId') conversationId: string, @Query() query: any) {
    return this.messageService.getAdminPrivateConversationMessages(conversationId, query);
  }

  @Put('admin/private-messages/conversations/:conversationId/block')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('message:manage')
  @ApiBearerAuth()
  setAdminPrivateConversationBlocked(@Param('conversationId') conversationId: string, @Body() dto: any) {
    return this.messageService.setAdminPrivateConversationBlocked(conversationId, dto?.blocked !== false);
  }

  @Post('admin/private-messages/messages/:messageId/recall')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('message:manage')
  @ApiBearerAuth()
  recallAdminPrivateMessage(@Param('messageId') messageId: string) {
    return this.messageService.recallAdminPrivateMessage(messageId);
  }

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

  @Get('messages/private-permission')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getPrivateMessagePermission(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.messageService.getPrivateMessagePermission(userId, query);
  }

  @Put('messages/read-all')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  markAllConversationsRead(
    @CurrentUser('sub') userId: string,
    @Query('region_id') regionId?: string,
  ) {
    return this.messageService.markAllConversationsRead(userId, regionId);
  }

  @Put('messages/conversation/read')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  markConversationRead(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.messageService.markConversationRead(userId, dto);
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

  @Get('messages/group-messages')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getGroupMessagesByQuery(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.messageService.getGroupMessages(query.group_id, userId, query);
  }

  @Get('messages/group/:groupId/members')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getGroupMembers(@Param('groupId') groupId: string, @CurrentUser('sub') userId: string, @Query() query: any) {
    return this.messageService.getGroupMembers(groupId, userId, query);
  }

  @Get('messages/group/:groupId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getGroupDetail(@Param('groupId') groupId: string, @CurrentUser('sub') userId: string, @Query() query: any) {
    return this.messageService.getGroupDetail(groupId, userId, query);
  }

  @Put('messages/group/:groupId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateGroup(@Param('groupId') groupId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.messageService.updateGroup(groupId, userId, dto);
  }

  @Post('messages/group/:groupId/leave')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  leaveGroup(@Param('groupId') groupId: string, @CurrentUser('sub') userId: string) {
    return this.messageService.leaveGroup(groupId, userId);
  }

  @Delete('messages/group/:groupId/history')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  clearGroupHistory(@Param('groupId') groupId: string, @CurrentUser('sub') userId: string) {
    return this.messageService.clearGroupHistory(groupId, userId);
  }

  @Delete('messages/group/:groupId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  dissolveGroup(@Param('groupId') groupId: string, @CurrentUser('sub') userId: string) {
    return this.messageService.dissolveGroup(groupId, userId);
  }
}
