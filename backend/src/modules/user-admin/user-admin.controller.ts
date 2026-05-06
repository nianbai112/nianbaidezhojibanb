import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { UserAdminService } from './user-admin.service';
import {
  UserLevelQueryDto, CreateUserLevelDto, UpdateUserLevelDto,
  UserExperienceQueryDto, CreateUserExperienceDto,
  UserTagDefQueryDto, CreateUserTagDefDto, UpdateUserTagDefDto,
  AddressQueryDto,
  UserGuidanceQueryDto, CreateUserGuidanceDto, UpdateUserGuidanceDto,
  BatchBalanceClearDto, BatchUserBalanceDto,
} from './dto/user-admin.dto';

@ApiTags('用户管理')
@Controller('admin')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class UserAdminController {
  constructor(private readonly svc: UserAdminService) {}

  private getIp(req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket?.remoteAddress;
    return ip?.replace('::ffff:', '') || '127.0.0.1';
  }

  private getAdminId(req: Request): string {
    return (req as any).user?.id || 'system';
  }

  // ==================== 用户等级 ====================

  @Get('user-levels')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '用户等级列表' })
  getLevelList(@Query() q: UserLevelQueryDto) {
    return this.svc.getLevelList(q);
  }

  @Get('user-levels/all')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '获取所有等级' })
  getAllLevels(@Query('regionId') regionId?: string) {
    return this.svc.getAllLevels(regionId);
  }

  @Post('user-levels')
  @RequirePermission('user:edit')
  @ApiOperation({ summary: '创建用户等级' })
  createLevel(@Body() dto: CreateUserLevelDto) {
    return this.svc.createLevel(dto);
  }

  @Put('user-levels/:id')
  @RequirePermission('user:edit')
  @ApiOperation({ summary: '更新用户等级' })
  updateLevel(@Param('id') id: string, @Body() dto: UpdateUserLevelDto) {
    return this.svc.updateLevel(id, dto);
  }

  @Delete('user-levels/:id')
  @RequirePermission('user:edit')
  @ApiOperation({ summary: '删除用户等级' })
  deleteLevel(@Param('id') id: string) {
    return this.svc.deleteLevel(id);
  }

  // ==================== 用户经验 ====================

  @Get('user-experiences')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '用户经验记录' })
  getExperienceList(@Query() q: UserExperienceQueryDto) {
    return this.svc.getExperienceList(q);
  }

  @Post('user-experiences')
  @RequirePermission('user:edit')
  @ApiOperation({ summary: '添加用户经验' })
  addExperience(@Body() dto: CreateUserExperienceDto, @Req() req: Request) {
    return this.svc.addExperience(dto, this.getAdminId(req), this.getIp(req));
  }

  @Get('user-levels-info')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '用户等级查询' })
  getUserLevels(@Query() q: any) {
    return this.svc.getUserLevels(q);
  }

  // ==================== 用户标签定义 ====================

  @Get('user-tag-defs')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '用户标签定义列表' })
  getTagDefList(@Query() q: UserTagDefQueryDto) {
    return this.svc.getTagDefList(q);
  }

  @Get('user-tag-defs/all')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '获取所有标签定义' })
  getAllTagDefs(@Query('regionId') regionId?: string) {
    return this.svc.getAllTagDefs(regionId);
  }

  @Post('user-tag-defs')
  @RequirePermission('user:tag')
  @ApiOperation({ summary: '创建标签定义' })
  createTagDef(@Body() dto: CreateUserTagDefDto) {
    return this.svc.createTagDef(dto);
  }

  @Put('user-tag-defs/:id')
  @RequirePermission('user:tag')
  @ApiOperation({ summary: '更新标签定义' })
  updateTagDef(@Param('id') id: string, @Body() dto: UpdateUserTagDefDto) {
    return this.svc.updateTagDef(id, dto);
  }

  @Delete('user-tag-defs/:id')
  @RequirePermission('user:tag')
  @ApiOperation({ summary: '删除标签定义' })
  deleteTagDef(@Param('id') id: string) {
    return this.svc.deleteTagDef(id);
  }

  // ==================== 地址管理 ====================

  @Get('addresses')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '地址列表' })
  getAddressList(@Query() q: AddressQueryDto) {
    return this.svc.getAddressList(q);
  }

  @Get('addresses/:id')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '地址详情' })
  getAddressDetail(@Param('id') id: string) {
    return this.svc.getAddressDetail(id);
  }

  @Delete('addresses/:id')
  @RequirePermission('user:edit')
  @ApiOperation({ summary: '删除地址' })
  deleteAddress(@Param('id') id: string, @Req() req: Request) {
    return this.svc.deleteAddress(id, this.getAdminId(req), this.getIp(req));
  }

  // ==================== 用户引导 ====================

  @Get('user-guidance')
  @RequirePermission('userguidance:view')
  @ApiOperation({ summary: '引导页列表' })
  getGuidanceList(@Query() q: UserGuidanceQueryDto) {
    return this.svc.getGuidanceList(q);
  }

  @Get('user-guidance/region/:regionId')
  @RequirePermission('userguidance:view')
  @ApiOperation({ summary: '获取区域引导配置' })
  getGuidanceByRegion(@Param('regionId') regionId: string) {
    return this.svc.getGuidanceByRegion(regionId);
  }

  @Post('user-guidance')
  @RequirePermission('userguidance:view')
  @ApiOperation({ summary: '创建引导页' })
  createGuidance(@Body() dto: CreateUserGuidanceDto) {
    return this.svc.createGuidance(dto);
  }

  @Put('user-guidance/:id')
  @RequirePermission('userguidance:view')
  @ApiOperation({ summary: '更新引导页' })
  updateGuidance(@Param('id') id: string, @Body() dto: UpdateUserGuidanceDto) {
    return this.svc.updateGuidance(id, dto);
  }

  @Delete('user-guidance/:id')
  @RequirePermission('userguidance:view')
  @ApiOperation({ summary: '删除引导页' })
  deleteGuidance(@Param('id') id: string) {
    return this.svc.deleteGuidance(id);
  }

  // ==================== 余额批量操作 ====================

  @Post('users/batch-balance-clear')
  @RequirePermission('user:balance')
  @ApiOperation({ summary: '批量清空余额' })
  batchBalanceClear(@Body() dto: BatchBalanceClearDto, @Req() req: Request) {
    return this.svc.batchBalanceClear(dto, this.getAdminId(req), this.getIp(req));
  }

  @Post('users/batch-balance-add')
  @RequirePermission('user:balance')
  @ApiOperation({ summary: '批量增加余额' })
  batchBalanceAdd(@Body() dto: BatchUserBalanceDto, @Req() req: Request) {
    return this.svc.batchBalanceAdd(dto, this.getAdminId(req), this.getIp(req));
  }

  @Post('users/batch-balance-deduct')
  @RequirePermission('user:balance')
  @ApiOperation({ summary: '批量扣减余额' })
  batchBalanceDeduct(@Body() dto: BatchUserBalanceDto, @Req() req: Request) {
    return this.svc.batchBalanceDeduct(dto, this.getAdminId(req), this.getIp(req));
  }

  @Get('balance-logs')
  @RequirePermission('user:balance')
  @ApiOperation({ summary: '余额操作日志' })
  getBalanceLogs(@Query() q: any) {
    return this.svc.getBalanceLogs(q);
  }
}
