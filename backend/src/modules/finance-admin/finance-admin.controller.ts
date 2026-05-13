import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
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

  @Post('alipay/transfers/:id/confirm')
  @ApiOperation({ summary: '人工确认支付宝转账已打款（仅 SDK 未配置时使用）' })
  @RequirePermission('finance:transfer')
  manualConfirmAlipayTransfer(
    @Param('id') id: string,
    @Body() dto: { alipayOrderNo: string; reason?: string; evidence?: string },
    @CurrentUser('sub') operatorId?: string,
    @Req() req?: Request,
  ) {
    const ip = (req?.headers?.['x-forwarded-for'] as string) || req?.ip || '';
    return this.financeAdminService.manualConfirmAlipayTransfer(id, dto, operatorId, ip);
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

  // ================= 支付订单查询 =================

  @Get('payment-orders')
  @Get('finance/payment-orders')
  @ApiOperation({ summary: '支付订单列表' })
  @RequirePermission('finance:view')
  getPaymentOrders(@Query() q: any) {
    return this.financeAdminService.getPaymentOrders(q);
  }

  // ================= 退款订单查询 =================

  @Get('refund-orders')
  @Get('finance/refund-orders')
  @ApiOperation({ summary: '退款订单列表' })
  @RequirePermission('finance:view')
  getRefundOrders(@Query() q: any) {
    return this.financeAdminService.getRefundOrders(q);
  }

  // ================= 用户余额流水 =================

  @Get('user-wallet-logs')
  @Get('finance/user-wallet-logs')
  @ApiOperation({ summary: '用户余额流水' })
  @RequirePermission('finance:view')
  getUserWalletLogs(@Query() q: any) {
    return this.financeAdminService.getUserWalletLogs(q);
  }

  // ================= 提现管理 =================

  @Get('withdrawals')
  @Get('finance/withdrawals')
  @ApiOperation({ summary: '提现申请列表' })
  @RequirePermission('finance:view')
  getWithdrawals(@Query() q: any) {
    return this.financeAdminService.getWithdrawals(q);
  }

  @Put('withdrawals/:id/review')
  @Put('finance/withdrawals/:id/review')
  @ApiOperation({ summary: '审核提现' })
  @RequirePermission('finance:withdraw')
  reviewWithdrawal(
    @Param('id') id: string,
    @Body() dto: { approved: boolean; reason?: string },
    @CurrentUser('sub') operatorId?: string,
    @Req() req?: Request,
  ) {
    const ip = (req?.headers?.['x-forwarded-for'] as string) || req?.ip || '';
    return this.financeAdminService.reviewWithdrawal(id, dto, operatorId, ip);
  }

  // ================= 商家结算 =================

  @Get('merchant-settlements')
  @ApiOperation({ summary: '商家结算列表' })
  @RequirePermission('finance:view')
  getMerchantSettlements(@Query() q: any) {
    return this.financeAdminService.getMerchantSettlements(q);
  }

  @Put('merchant-settlements/:id/confirm')
  @ApiOperation({ summary: '确认商家结算' })
  @RequirePermission('finance:settlement')
  confirmMerchantSettlement(
    @Param('id') id: string,
    @Body() dto: { remark?: string },
    @CurrentUser('sub') operatorId?: string,
    @Req() req?: Request,
  ) {
    const ip = (req?.headers?.['x-forwarded-for'] as string) || req?.ip || '';
    return this.financeAdminService.confirmMerchantSettlement(id, dto, operatorId, ip);
  }

  // ================= 骑手结算 =================

  @Get('rider-settlements')
  @ApiOperation({ summary: '骑手结算列表' })
  @RequirePermission('finance:view')
  getRiderSettlements(@Query() q: any) {
    return this.financeAdminService.getRiderSettlements(q);
  }

  @Get('rider-settlements/:id')
  @ApiOperation({ summary: '骑手结算详情' })
  @RequirePermission('finance:view')
  getRiderSettlementDetail(@Param('id') id: string) {
    return this.financeAdminService.getRiderSettlementDetail(id);
  }

  @Post('rider-settlements/generate')
  @ApiOperation({ summary: '生成骑手结算单' })
  @RequirePermission('finance:settlement')
  generateRiderSettlements(
    @Body() dto: any,
    @CurrentUser('sub') operatorId?: string,
  ) {
    return this.financeAdminService.generateRiderSettlements(dto, operatorId);
  }

  @Put('rider-settlements/:id/confirm')
  @ApiOperation({ summary: '确认骑手结算' })
  @RequirePermission('finance:settlement')
  confirmRiderSettlement(
    @Param('id') id: string,
    @Body() dto: { remark?: string },
    @CurrentUser('sub') operatorId?: string,
    @Req() req?: Request,
  ) {
    const ip = (req?.headers?.['x-forwarded-for'] as string) || req?.ip || '';
    return this.financeAdminService.confirmRiderSettlement(id, dto, operatorId, ip);
  }

  @Put('rider-settlements/:id/pay')
  @ApiOperation({ summary: '骑手结算打款' })
  @RequirePermission('finance:settlement')
  payRiderSettlement(
    @Param('id') id: string,
    @Body() dto: { remark?: string },
    @CurrentUser('sub') operatorId?: string,
    @Req() req?: Request,
  ) {
    const ip = (req?.headers?.['x-forwarded-for'] as string) || req?.ip || '';
    return this.financeAdminService.payRiderSettlement(id, dto, operatorId, ip);
  }

  @Put('rider-settlements/:id/reject')
  @ApiOperation({ summary: '驳回骑手结算' })
  @RequirePermission('finance:settlement')
  rejectRiderSettlement(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
    @CurrentUser('sub') operatorId?: string,
    @Req() req?: Request,
  ) {
    const ip = (req?.headers?.['x-forwarded-for'] as string) || req?.ip || '';
    return this.financeAdminService.rejectRiderSettlement(id, dto, operatorId, ip);
  }

  // ================= 对账中心 =================

  @Get('reconciliation')
  @Get('finance/reconciliation')
  @ApiOperation({ summary: '对账数据' })
  @RequirePermission('finance:view')
  getReconciliation(@Query() q: any) {
    return this.financeAdminService.getReconciliation(q);
  }

  // ================= 异常资金单 =================

  @Get('abnormal-orders')
  @Get('finance/abnormal-orders')
  @ApiOperation({ summary: '异常资金单' })
  @RequirePermission('finance:view')
  getAbnormalOrders(@Query() q: any) {
    return this.financeAdminService.getAbnormalOrders(q);
  }
}
