import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { JwtGuard } from '../../guards/jwt.guard';
import { RiderAppService } from './rider-app.service';

@ApiTags('官方骑手 App')
@Controller()
export class RiderAppController {
  constructor(private readonly riderAppService: RiderAppService) {}

  private clientIp(req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.ip || '';
    return String(raw).split(',')[0].trim();
  }

  @Post('rider-app/login/phone/send-code')
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '发送骑手 App 手机验证码' })
  sendPhoneCode(@Body() dto: { phone?: string; mobile?: string }, @Req() req: Request) {
    return this.riderAppService.sendPhoneCode(dto, this.clientIp(req));
  }

  @Post('rider-app/login/phone')
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: '骑手 App 手机验证码登录' })
  loginPhone(
    @Body() dto: { phone?: string; mobile?: string; code?: string },
    @Req() req: Request,
  ) {
    return this.riderAppService.loginPhone(
      dto,
      this.clientIp(req),
      String(req.headers['user-agent'] || ''),
    );
  }

  @Post('rider-app/login/wechat')
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: '骑手 App 微信登录（需开放平台配置）' })
  loginWechat() {
    return this.riderAppService.loginWechat();
  }

  @Get('rider-app/session')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取骑手 App 会话和正式骑手资格' })
  getSession(@CurrentUser('sub') userId: string) {
    return this.riderAppService.getSession(userId);
  }

  @Get('rider-app/orders')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取官方骑手 App 订单列表' })
  getOrders(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.riderAppService.getOrders(userId, query);
  }

  @Get('rider-app/orders/:orderId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取已分配给当前骑手的订单详情' })
  getOrderDetail(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string) {
    return this.riderAppService.getOrderDetail(userId, orderId);
  }

  @Post('rider-app/orders/:orderId/accept')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '官方骑手接单' })
  acceptOrder(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string) {
    return this.riderAppService.acceptOrder(userId, orderId);
  }

  @Put('rider-app/orders/:orderId/status')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '官方骑手更新配送状态' })
  updateOrderStatus(
    @Param('orderId') orderId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: any,
  ) {
    return this.riderAppService.updateOrderStatus(userId, orderId, dto);
  }

  @Post('rider-app/orders/:orderId/confirm-by-code')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '官方骑手凭收货码确认收货' })
  confirmOrderByCode(
    @Param('orderId') orderId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: any,
  ) {
    return this.riderAppService.confirmOrderByCode(userId, orderId, dto?.code);
  }

  @Post('rider-app/orders/:orderId/exceptions')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '官方骑手上报配送异常' })
  reportException(
    @Param('orderId') orderId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: any,
  ) {
    return this.riderAppService.reportException(userId, orderId, dto);
  }

  @Post('rider-app/location')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '官方骑手上传配送位置' })
  updateLocation(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.riderAppService.updateLocation(userId, dto);
  }

  @Post('rider-app/location/batch')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '官方骑手批量补传配送轨迹' })
  updateLocationBatch(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.riderAppService.updateLocationBatch(userId, dto);
  }

  @Get('rider-app/profile')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取官方骑手资料' })
  getProfile(@CurrentUser('sub') userId: string) {
    return this.riderAppService.getProfile(userId);
  }

  @Put('rider-app/profile')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新官方骑手资料和接单状态' })
  updateProfile(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.riderAppService.updateProfile(userId, dto);
  }

  @Get('rider-app/stats')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取官方骑手订单统计' })
  getStats(@CurrentUser('sub') userId: string) {
    return this.riderAppService.getStats(userId);
  }

  @Get('rider-app/income/overview')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取骑手收入总览（余额/冻结/今日/本月/待结算/提现中）' })
  getIncomeOverview(@CurrentUser('sub') userId: string) {
    return this.riderAppService.getRiderIncomeOverview(userId);
  }

  @Get('rider-app/income/transactions')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取骑手钱包流水' })
  getIncomeTransactions(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.riderAppService.getRiderIncomeTransactions(userId, query);
  }

  @Get('rider-app/settlements')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取骑手结算记录' })
  getRiderSettlements(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.riderAppService.getRiderSettlements(userId, query);
  }

  @Get('rider-app/settlements/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取骑手结算详情' })
  getRiderSettlement(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.riderAppService.getRiderSettlementDetail(userId, id);
  }

  @Post('rider-app/settlements/:id/appeal')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交结算申诉' })
  createRiderSettlementAppeal(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: any,
  ) {
    return this.riderAppService.createRiderSettlementAppeal(userId, id, dto);
  }

  @Get('rider-app/withdrawals')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取骑手提现记录' })
  getRiderWithdrawals(@CurrentUser('sub') userId: string, @Query() query: any) {
    return this.riderAppService.getRiderWithdrawals(userId, query);
  }

  @Post('rider-app/withdrawals')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '骑手申请提现' })
  createRiderWithdrawal(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.riderAppService.createRiderWithdrawal(userId, dto);
  }

  @Post('rider-app/push/token')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '上报 uni-push 推送标识' })
  registerPushToken(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.riderAppService.registerPushToken(userId, dto);
  }
}
