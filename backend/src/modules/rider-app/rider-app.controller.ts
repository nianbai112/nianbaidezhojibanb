import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { JwtGuard } from '../../guards/jwt.guard';
import { RiderAppService } from './rider-app.service';
import { RiderPasswordCredentialService } from './rider-password-credential.service';

@ApiTags('官方骑手 App')
@Controller()
export class RiderAppController {
  constructor(
    private readonly riderAppService: RiderAppService,
    private readonly credentialService: RiderPasswordCredentialService,
  ) {}

  private clientIp(req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.ip || '';
    return String(raw).split(',')[0].trim();
  }

  @Get('admin/rider-app/password-login')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('rider-app:config')
  getPasswordLoginConfig() {
    return this.credentialService.getSafeConfig();
  }

  @Put('admin/rider-app/password-login')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('rider-app:config')
  savePasswordLoginConfig(@Body() dto: any, @CurrentUser('sub') adminId: string, @Req() req: Request) {
    return this.credentialService.saveConfig(dto, adminId, this.clientIp(req));
  }

  @Post('admin/rider-app/password-login/reset-lock')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('rider-app:config')
  resetPasswordLoginLock(@CurrentUser('sub') adminId: string, @Req() req: Request) {
    return this.credentialService.resetLock(adminId, this.clientIp(req));
  }

  @Get('admin/rider-app/password-login/rider-options')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('rider-app:config')
  listPasswordLoginRiders(@Query('keyword') keyword?: string) {
    return this.credentialService.listRiderOptions(keyword);
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

  @Post('rider-app/login/password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '骑手 App 密码登录' })
  loginPassword(
    @Body() dto: { username?: string; password?: string; device?: Record<string, unknown> },
    @Req() req: Request,
  ) {
    return this.riderAppService.loginPassword(
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
}
