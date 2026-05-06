import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ShareService } from './share.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { UpdateShareSettingsDto, ShareQueryDto, ShareInviteQueryDto, ShareRewardQueryDto } from './dto/share.admin.dto';

@ApiTags('后台管理-分享有礼')
@Controller()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class ShareAdminController {
  constructor(private readonly shareService: ShareService) {}

  // ==================== 分享活动设置 ====================

  @Get('admin/share/settings')
  @ApiOperation({ summary: '分享活动设置列表' })
  @RequirePermission('share:view')
  getSettingsList(@Query() query: ShareQueryDto) {
    return this.shareService.getSettingsList(query);
  }

  @Get('admin/share/settings/:regionId')
  @ApiOperation({ summary: '获取区域分享设置' })
  @RequirePermission('share:view')
  getSettings(@Param('regionId') regionId: string) {
    return this.shareService.getSettings(regionId);
  }

  @Put('admin/share/settings/:regionId')
  @ApiOperation({ summary: '创建/更新区域分享设置' })
  @RequirePermission('share:config')
  upsertSettings(@Param('regionId') regionId: string, @Body() dto: UpdateShareSettingsDto) {
    return this.shareService.upsertSettings(regionId, dto);
  }

  @Delete('admin/share/settings/:regionId')
  @ApiOperation({ summary: '删除区域分享设置' })
  @RequirePermission('share:config')
  deleteSettings(@Param('regionId') regionId: string) {
    return this.shareService.deleteSettings(regionId);
  }

  // ==================== 邀请记录 ====================

  @Get('admin/share/invites')
  @ApiOperation({ summary: '邀请记录列表' })
  @RequirePermission('share:view')
  getInviteList(@Query() query: ShareInviteQueryDto) {
    return this.shareService.getInviteList(query);
  }

  @Get('admin/share/invites/:id')
  @ApiOperation({ summary: '邀请记录详情' })
  @RequirePermission('share:view')
  getInvite(@Param('id') id: string) {
    return this.shareService.getInvite(id);
  }

  // ==================== 奖励记录 ====================

  @Get('admin/share/rewards')
  @ApiOperation({ summary: '奖励记录列表' })
  @RequirePermission('share:reward')
  getRewardList(@Query() query: ShareRewardQueryDto) {
    return this.shareService.getRewardList(query);
  }

  @Post('admin/share/rewards/:id/retry')
  @ApiOperation({ summary: '补发奖励' })
  @RequirePermission('share:reward')
  retryReward(@Param('id') id: string) {
    return this.shareService.retryReward(id);
  }

  // ==================== 统计 ====================

  @Get('admin/share/stats/overview')
  @ApiOperation({ summary: '分享统计总览' })
  @RequirePermission('share:view')
  getStatsOverview() {
    return this.shareService.getStatsOverview();
  }
}
