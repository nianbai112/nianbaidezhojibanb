import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ContentExtService } from './content-ext.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';

@ApiTags('Admin - Content Extension')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/content-ext')
export class ContentExtAdminController {
  constructor(private readonly service: ContentExtService) {}

  // =================== 匿名身份 ===================
  @Get('anonymous-identities')
  @ApiOperation({ summary: '获取匿名身份列表' })
  @RequirePermission('post:audit')
  getAnonymousIdentities(@Query() query: any) {
    return this.service.getAnonymousIdentities(query);
  }

  @Post('anonymous-identities')
  @ApiOperation({ summary: '创建匿名身份' })
  @RequirePermission('post:audit')
  createAnonymousIdentity(@Body() dto: any) {
    return this.service.createAnonymousIdentity(dto);
  }

  @Put('anonymous-identities/:id')
  @ApiOperation({ summary: '更新匿名身份' })
  @RequirePermission('post:audit')
  updateAnonymousIdentity(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateAnonymousIdentity(id, dto);
  }

  @Delete('anonymous-identities/:id')
  @ApiOperation({ summary: '删除匿名身份' })
  @RequirePermission('post:audit')
  deleteAnonymousIdentity(@Param('id') id: string) {
    return this.service.deleteAnonymousIdentity(id);
  }

  // =================== 笔记海报配置 ===================
  @Get('poster-config')
  @ApiOperation({ summary: '获取笔记海报配置' })
  @RequirePermission('post:audit')
  getPosterConfig() {
    return this.service.getPosterConfig();
  }

  @Put('poster-config')
  @ApiOperation({ summary: '更新笔记海报配置' })
  @RequirePermission('system:config')
  updatePosterConfig(@Body() dto: any) {
    return this.service.updatePosterConfig(dto);
  }

  // =================== 奖励设置 ===================
  @Get('reward-config')
  @ApiOperation({ summary: '获取奖励配置' })
  @RequirePermission('system:config')
  getRewardConfig() {
    return this.service.getRewardConfig();
  }

  @Put('reward-config')
  @ApiOperation({ summary: '更新奖励配置' })
  @RequirePermission('system:config')
  updateRewardConfig(@Body() dto: any) {
    return this.service.updateRewardConfig(dto);
  }

  @Get('badges')
  @ApiOperation({ summary: '获取徽章列表' })
  @RequirePermission('post:audit')
  getBadges(@Query() query: any) {
    return this.service.getBadges(query);
  }

  @Post('badges')
  @ApiOperation({ summary: '创建徽章' })
  @RequirePermission('system:config')
  createBadge(@Body() dto: any) {
    return this.service.createBadge(dto);
  }

  @Delete('badges/:id')
  @ApiOperation({ summary: '删除徽章' })
  @RequirePermission('system:config')
  deleteBadge(@Param('id') id: string) {
    return this.service.deleteBadge(id);
  }

  // =================== 通知记录 ===================
  @Get('notifications')
  @ApiOperation({ summary: '获取系统通知记录' })
  @RequirePermission('user:view')
  getNotifications(@Query() query: any) {
    return this.service.getNotifications(query);
  }

  @Delete('notifications/:id')
  @ApiOperation({ summary: '删除通知' })
  @RequirePermission('user:edit')
  deleteNotification(@Param('id') id: string) {
    return this.service.deleteNotification(id);
  }
}
