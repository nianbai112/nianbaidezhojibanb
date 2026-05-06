import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PhotoContestService } from './photo-contest.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import {
  ContestQueryDto,
  CreateContestDto,
  UpdateContestDto,
  EntryQueryDto,
  AuditEntryDto,
  BatchAuditDto,
  RatingQueryDto,
  AuditRatingDto,
  CreateWinnerDto,
  UpdateWinnerDto,
  UpdateRegionSettingDto,
} from './dto/photo-contest.admin.dto';

@ApiTags('Admin - PhotoContest')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/photo-contests')
export class PhotoContestAdminController {
  constructor(private readonly service: PhotoContestService) {}

  // ==================== Dashboard ====================
  @Get('dashboard/stats')
  @ApiOperation({ summary: '评选仪表盘统计' })
  @RequirePermission('photoContest:view')
  getDashboardStats(@Query('regionId') regionId?: string) {
    return this.service.getDashboardStats(regionId);
  }

  // ==================== 作品管理 (静态路由，必须在:param路由之前) ====================
  @Get('entries/pending')
  @ApiOperation({ summary: '待审核作品列表' })
  @RequirePermission('photoContest:audit')
  getPendingEntries(@Query() query: EntryQueryDto) {
    return this.service.getPendingEntries(query);
  }

  @Post('entries/batch-audit')
  @ApiOperation({ summary: '批量审核作品' })
  @RequirePermission('photoContest:audit')
  batchAuditEntries(@Body() dto: BatchAuditDto) {
    return this.service.batchAuditEntries(dto);
  }

  @Get('entries')
  @ApiOperation({ summary: '作品列表' })
  @RequirePermission('photoContest:view')
  getEntries(@Query() query: EntryQueryDto) {
    return this.service.getEntries(query);
  }

  @Put('entries/:id/audit')
  @ApiOperation({ summary: '审核单个作品' })
  @RequirePermission('photoContest:audit')
  auditEntry(@Param('id') id: string, @Body() dto: AuditEntryDto) {
    return this.service.auditEntry(id, dto);
  }

  @Delete('entries/:id')
  @ApiOperation({ summary: '删除作品' })
  @RequirePermission('photoContest:config')
  deleteEntry(@Param('id') id: string) {
    return this.service.deleteEntry(id);
  }

  // ==================== 评分管理 ====================
  @Get('ratings')
  @ApiOperation({ summary: '评分列表' })
  @RequirePermission('photoContest:view')
  getRatings(@Query() query: RatingQueryDto) {
    return this.service.getRatings(query);
  }

  @Put('ratings/:id/audit')
  @ApiOperation({ summary: '审核评分' })
  @RequirePermission('photoContest:audit')
  auditRating(@Param('id') id: string, @Body() dto: AuditRatingDto) {
    return this.service.auditRating(id, dto);
  }

  // ==================== 区域设置 ====================
  @Get('region-settings')
  @ApiOperation({ summary: '获取区域评选配置' })
  @RequirePermission('photoContest:view')
  getRegionSetting(@Query('regionId') regionId: string) {
    return this.service.getRegionSetting(regionId);
  }

  @Put('region-settings')
  @ApiOperation({ summary: '更新区域评选配置' })
  @RequirePermission('photoContest:config')
  updateRegionSetting(@Query('regionId') regionId: string, @Body() dto: UpdateRegionSettingDto) {
    return this.service.updateRegionSetting(regionId, dto);
  }

  // ==================== 获奖管理 ====================
  @Post('winners')
  @ApiOperation({ summary: '设置获奖者' })
  @RequirePermission('photoContest:config')
  createWinner(@Body() dto: CreateWinnerDto) {
    return this.service.createWinner(dto);
  }

  @Put('winners/:id')
  @ApiOperation({ summary: '更新获奖信息' })
  @RequirePermission('photoContest:config')
  updateWinner(@Param('id') id: string, @Body() dto: UpdateWinnerDto) {
    return this.service.updateWinner(id, dto);
  }

  @Delete('winners/:id')
  @ApiOperation({ summary: '删除获奖记录' })
  @RequirePermission('photoContest:config')
  deleteWinner(@Param('id') id: string) {
    return this.service.deleteWinner(id);
  }

  // ==================== 评选项目 CRUD (根路由) ====================
  @Get()
  @ApiOperation({ summary: '评选项目列表' })
  @RequirePermission('photoContest:view')
  getContests(@Query() query: ContestQueryDto) {
    return this.service.getContests(query);
  }

  @Post()
  @ApiOperation({ summary: '创建评选项目' })
  @RequirePermission('photoContest:config')
  createContest(@Body() dto: CreateContestDto) {
    return this.service.createContest(dto);
  }

  // ==================== 评选项目详情 & 参数化路由 ====================
  @Get(':id')
  @ApiOperation({ summary: '评选项目详情' })
  @RequirePermission('photoContest:view')
  getContestDetail(@Param('id') id: string) {
    return this.service.getContestDetail(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新评选项目' })
  @RequirePermission('photoContest:config')
  updateContest(@Param('id') id: string, @Body() dto: UpdateContestDto) {
    return this.service.updateContest(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除评选项目' })
  @RequirePermission('photoContest:config')
  deleteContest(@Param('id') id: string) {
    return this.service.deleteContest(id);
  }

  // ==================== 投票统计 & 获奖列表 (按评选项目) ====================
  @Get(':contestId/vote-stats')
  @ApiOperation({ summary: '投票统计' })
  @RequirePermission('photoContest:view')
  getVoteStats(@Param('contestId') contestId: string) {
    return this.service.getVoteStats(contestId);
  }

  @Get(':contestId/winners')
  @ApiOperation({ summary: '获奖列表' })
  @RequirePermission('photoContest:view')
  getWinners(@Param('contestId') contestId: string) {
    return this.service.getWinners(contestId);
  }
}
