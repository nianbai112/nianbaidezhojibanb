import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CircleService } from './circle.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';

@ApiTags('Admin - Community')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/circles')
export class CircleAdminController {
  constructor(private readonly circleService: CircleService) {}

  // ---- 注意：字面路由必须定义在参数化路由（:circleId）之前，避免被通配捕获 ----

  // ================= 区域配置（字面路由） =================
  @Get('config')
  @ApiOperation({ summary: '获取社群区域配置' })
  @RequirePermission('community:config')
  getAdminCircleConfig(@Query('regionId') regionId: string) {
    return this.circleService.getAdminCircleConfig(regionId);
  }

  @Put('config')
  @ApiOperation({ summary: '更新社群区域配置' })
  @RequirePermission('community:config')
  updateAdminCircleConfig(@Query('regionId') regionId: string, @Body() dto: any) {
    return this.circleService.updateAdminCircleConfig(regionId, dto);
  }

  // ================= 购买记录（字面路由） =================
  @Get('payments')
  @ApiOperation({ summary: '获取购买记录列表' })
  @RequirePermission('community:view')
  getAdminPayments(@Query() query: any) {
    return this.circleService.getAdminCirclePayments(query);
  }

  // ================= 成员管理（字面路由） =================
  @Delete('members/:memberId')
  @ApiOperation({ summary: '踢出成员' })
  @RequirePermission('community:edit')
  adminRemoveMember(@Param('memberId') memberId: string) {
    return this.circleService.adminRemoveMember(memberId);
  }

  // ================= 社群列表 =================
  @Get()
  @ApiOperation({ summary: '获取社群列表（后台）' })
  @RequirePermission('community:view')
  getAdminCircles(@Query() query: any) {
    return this.circleService.getAdminCircles(query);
  }

  @Post()
  @ApiOperation({ summary: '创建社群' })
  @RequirePermission('community:edit')
  adminCreateCircle(@Body() dto: any) {
    return this.circleService.adminCreateCircle(dto);
  }

  // ================= 社群详情/操作（参数化路由） =================
  @Get(':circleId/members')
  @ApiOperation({ summary: '获取社群成员列表' })
  @RequirePermission('community:view')
  getAdminCircleMembers(@Param('circleId') circleId: string, @Query() query: any) {
    return this.circleService.getAdminCircleMembers(circleId, query);
  }

  @Put(':circleId/status')
  @ApiOperation({ summary: '启用/禁用社群' })
  @RequirePermission('community:edit')
  adminUpdateCircleStatus(@Param('circleId') circleId: string, @Body('status') status: string) {
    return this.circleService.adminUpdateCircle(circleId, { status });
  }

  @Put(':circleId/dissolve')
  @ApiOperation({ summary: '解散社群' })
  @RequirePermission('community:edit')
  adminDissolveCircle(@Param('circleId') circleId: string) {
    return this.circleService.adminDissolveCircle(circleId);
  }

  @Put(':circleId')
  @ApiOperation({ summary: '修改社群信息' })
  @RequirePermission('community:edit')
  adminUpdateCircle(@Param('circleId') circleId: string, @Body() dto: any) {
    return this.circleService.adminUpdateCircle(circleId, dto);
  }

  @Delete(':circleId')
  @ApiOperation({ summary: '删除社群' })
  @RequirePermission('community:edit')
  adminDeleteCircle(@Param('circleId') circleId: string) {
    return this.circleService.adminDeleteCircle(circleId);
  }
}
