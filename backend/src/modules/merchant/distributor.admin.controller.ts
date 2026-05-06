import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DistributorService } from './distributor.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import {
  DistributorQueryDto, DistributorAuditDto, UpdateDistributorDto,
  DistributorLevelQueryDto, CreateDistributorLevelDto, UpdateDistributorLevelDto,
  DistributorConfigQueryDto, UpdateDistributorConfigDto,
  DistributorCommissionQueryDto,
  DistributorWithdrawalQueryDto, ProcessWithdrawalDto,
} from './dto/distributor.admin.dto';

@ApiTags('后台管理-分销管理')
@Controller()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class DistributorAdminController {
  constructor(private readonly distributorService: DistributorService) {}

  // ==================== 分销商管理 ====================

  @Get('admin/distributor/list')
  @ApiOperation({ summary: '分销商列表' })
  @RequirePermission('mall:view')
  getDistributorList(@Query() query: DistributorQueryDto) {
    return this.distributorService.getDistributorList(query);
  }

  @Get('admin/distributor/:id')
  @ApiOperation({ summary: '分销商详情' })
  @RequirePermission('mall:view')
  getDistributorDetail(@Param('id') id: string) {
    return this.distributorService.getDistributorDetail(id);
  }

  @Put('admin/distributor/:id/audit')
  @ApiOperation({ summary: '审核分销商' })
  @RequirePermission('mall:distributor')
  auditDistributor(@Param('id') id: string, @Body() dto: DistributorAuditDto) {
    return this.distributorService.auditDistributor(id, dto);
  }

  @Put('admin/distributor/:id')
  @ApiOperation({ summary: '更新分销商' })
  @RequirePermission('mall:distributor')
  updateDistributor(@Param('id') id: string, @Body() dto: UpdateDistributorDto) {
    return this.distributorService.updateDistributor(id, dto);
  }

  // ==================== 分销等级 ====================

  @Get('admin/distributor/levels/list')
  @ApiOperation({ summary: '分销等级列表' })
  @RequirePermission('mall:view')
  getLevelList(@Query() query: DistributorLevelQueryDto) {
    return this.distributorService.getLevelList(query);
  }

  @Post('admin/distributor/levels')
  @ApiOperation({ summary: '创建分销等级' })
  @RequirePermission('mall:config')
  createLevel(@Body() dto: CreateDistributorLevelDto) {
    return this.distributorService.createLevel(dto);
  }

  @Put('admin/distributor/levels/:id')
  @ApiOperation({ summary: '更新分销等级' })
  @RequirePermission('mall:config')
  updateLevel(@Param('id') id: string, @Body() dto: UpdateDistributorLevelDto) {
    return this.distributorService.updateLevel(id, dto);
  }

  @Delete('admin/distributor/levels/:id')
  @ApiOperation({ summary: '删除分销等级' })
  @RequirePermission('mall:config')
  deleteLevel(@Param('id') id: string) {
    return this.distributorService.deleteLevel(id);
  }

  // ==================== 分销配置 ====================

  @Get('admin/distributor/config/list')
  @ApiOperation({ summary: '分销配置列表' })
  @RequirePermission('mall:view')
  getConfigList(@Query() query: DistributorConfigQueryDto) {
    return this.distributorService.getConfigList(query);
  }

  @Put('admin/distributor/config/:key')
  @ApiOperation({ summary: '更新分销配置' })
  @RequirePermission('mall:config')
  updateConfig(@Param('key') key: string, @Body() dto: UpdateDistributorConfigDto) {
    return this.distributorService.updateConfig(key, dto);
  }

  // ==================== 佣金记录 ====================

  @Get('admin/distributor/commissions/list')
  @ApiOperation({ summary: '佣金记录列表' })
  @RequirePermission('mall:view')
  getCommissionList(@Query() query: DistributorCommissionQueryDto) {
    return this.distributorService.getCommissionList(query);
  }

  // ==================== 提现记录 ====================

  @Get('admin/distributor/withdrawals/list')
  @ApiOperation({ summary: '提现记录列表' })
  @RequirePermission('mall:view')
  getWithdrawalList(@Query() query: DistributorWithdrawalQueryDto) {
    return this.distributorService.getWithdrawalList(query);
  }

  @Put('admin/distributor/withdrawals/:id')
  @ApiOperation({ summary: '处理提现' })
  @RequirePermission('mall:distributor')
  processWithdrawal(@Param('id') id: string, @Body() dto: ProcessWithdrawalDto) {
    return this.distributorService.processWithdrawal(id, dto);
  }
}
