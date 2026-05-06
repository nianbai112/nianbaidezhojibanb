import { Controller, Get, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { FinanceAdminService } from './finance-admin.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { CreateAlipayTransferDto, RegionBalanceQueryDto, RegionBalanceAdjustDto } from './dto/finance-admin.dto';

@ApiTags('Admin - Finance')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin')
export class FinanceAdminController {
  constructor(private readonly financeAdminService: FinanceAdminService) {}

  // ================= 支付宝转账 =================

  @Get('alipay/transfers')
  @ApiOperation({ summary: '支付宝转账记录列表' })
  @RequirePermission('finance:view')
  getAlipayTransfers(@Query() q: any) {
    return this.financeAdminService.getAlipayTransfers(q);
  }

  @Get('alipay/transfers/:id')
  @ApiOperation({ summary: '支付宝转账详情' })
  @RequirePermission('finance:view')
  getAlipayTransferDetail(@Param('id') id: string) {
    return this.financeAdminService.getAlipayTransferDetail(id);
  }

  @Post('alipay/transfer')
  @ApiOperation({ summary: '创建支付宝转账（密钥仅服务端持有）' })
  @RequirePermission('finance:transfer')
  createAlipayTransfer(
    @Body() dto: CreateAlipayTransferDto,
    @CurrentUser('sub') operatorId?: string
  ) {
    return this.financeAdminService.createAlipayTransfer(dto, operatorId);
  }

  // ================= 区域余额变动 =================

  @Get('region-balance-logs')
  @ApiOperation({ summary: '区域余额变动列表' })
  @RequirePermission('finance:view')
  getRegionBalanceLogs(@Query() q: RegionBalanceQueryDto) {
    return this.financeAdminService.getRegionBalanceLogs(q);
  }

  @Post('region-balance/adjust')
  @ApiOperation({ summary: '调整区域余额' })
  @RequirePermission('finance:settlement')
  adjustRegionBalance(
    @Body() dto: RegionBalanceAdjustDto,
    @CurrentUser('sub') operatorId?: string
  ) {
    return this.financeAdminService.adjustRegionBalance(dto, operatorId);
  }
}
