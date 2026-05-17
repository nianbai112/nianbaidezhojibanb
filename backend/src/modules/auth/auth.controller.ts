import { Controller, Post, Body, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('认证')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ============ 小程序接口 ============

  /** 微信小程序登录 — 严格限流防暴力破解 */
  @Post('wx-auth/wx-mini-login')
  @ApiOperation({ summary: '微信小程序登录' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  async wxMiniLogin(@Body() dto: any) {
    return this.authService.wxMiniLogin(dto);
  }

  /** 获取微信手机号 — 严格限流 */
  @Post('wx-auth/get-phone-number')
  @ApiOperation({ summary: '获取微信手机号' })
  @UseGuards(JwtGuard, ThrottlerGuard)
  @ApiBearerAuth()
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  async getPhoneNumber(@Body() dto: any, @CurrentUser('sub') userId: string) {
    return this.authService.getPhoneNumber(userId, dto);
  }

  /** 刷新 Token — 限流防止滥用 */
  @Post('wx-auth/refresh')
  @ApiOperation({ summary: '刷新 Token' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  async refreshToken(@Body() dto: { refreshToken: string }) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  // ============ 后台管理登录（独立 AdminAccount） ============

  /** 获取验证码 */
  @Get('captcha')
  @ApiOperation({ summary: '获取登录验证码' })
  async getCaptcha() {
    return this.authService.generateCaptcha();
  }

  /** 新后台静态 UI 兼容：验证码以图片地址方式加载 */
  @Get('auth/admin/captcha')
  @ApiOperation({ summary: '获取登录验证码图片（新后台兼容）' })
  async getAdminCaptchaImage(@Res({ passthrough: true }) res: Response) {
    const captcha = await this.authService.generateCaptcha();
    const svgBase64 = captcha.image.replace(/^data:image\/svg\+xml;base64,/, '');
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('X-Captcha-Id', captcha.captchaId);
    return Buffer.from(svgBase64, 'base64').toString('utf8');
  }

  /** 后台管理员登录 — 限流防暴力破解（默认 30 次/分钟，可通过 ADMIN_AUTH_THROTTLE_LIMIT 调整） */
  @Post('admin/login')
  @ApiOperation({ summary: '后台管理员登录' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ admin_auth: { ttl: 60000, limit: parseInt(process.env.ADMIN_AUTH_THROTTLE_LIMIT || '30', 10) } })
  async adminLogin(
    @Body() dto: { username: string; password: string; captchaId?: string; captcha?: string },
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.adminLogin(dto, ip, ua);
  }

  @Post('auth/admin/login')
  @ApiOperation({ summary: '后台管理员登录（新后台兼容路径）' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ admin_auth: { ttl: 60000, limit: parseInt(process.env.ADMIN_AUTH_THROTTLE_LIMIT || '30', 10) } })
  async adminLoginCompat(
    @Body() dto: { username: string; password: string; captchaId?: string; captcha?: string },
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.adminLogin(dto, ip, ua);
  }

  @Post('auth/admin/qr/create')
  @ApiOperation({ summary: '创建后台扫码登录二维码票据' })
  async createAdminQrLogin(@Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.createAdminQrLoginSession(ip, ua);
  }

  @Get('auth/admin/qr/status')
  @ApiOperation({ summary: '查询后台扫码登录状态' })
  async getAdminQrLoginStatus(@Query('ticket') ticket: string, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.getAdminQrLoginStatus(ticket, ip, ua);
  }

  @Post('auth/admin/qr/cancel')
  @ApiOperation({ summary: '取消后台扫码登录' })
  async cancelAdminQrLogin(@Body() dto: { ticket: string }) {
    return this.authService.cancelAdminQrLogin(dto.ticket);
  }

  @Post('auth/admin/qr/scan')
  @ApiOperation({ summary: '小程序扫码后台登录二维码' })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async scanAdminQrLogin(@Body() dto: { ticket: string }, @CurrentUser('sub') userId: string, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.scanAdminQrLogin(dto.ticket, userId, ip, ua);
  }

  @Post('auth/admin/qr/confirm')
  @ApiOperation({ summary: '小程序确认后台扫码登录' })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async confirmAdminQrLogin(
    @Body() dto: { ticket: string; username?: string; password?: string },
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.confirmAdminQrLogin(dto, userId, ip, ua);
  }

  @Post('auth/admin/qr/reject')
  @ApiOperation({ summary: '小程序取消后台扫码登录' })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async rejectAdminQrLogin(@Body() dto: { ticket: string }, @CurrentUser('sub') userId: string) {
    return this.authService.rejectAdminQrLogin(dto.ticket, userId);
  }

  @Post('admin/refresh')
  @ApiOperation({ summary: '后台刷新 Token' })
  async adminRefreshToken(@Body() dto: { refreshToken: string }) {
    return this.authService.adminRefreshToken(dto.refreshToken);
  }

  @Post('auth/admin/refresh')
  @ApiOperation({ summary: '后台刷新 Token（新后台兼容路径）' })
  async adminRefreshTokenCompat(@Body() dto: { refreshToken: string }) {
    return this.authService.adminRefreshToken(dto.refreshToken);
  }

  @Post('admin/logout')
  @ApiOperation({ summary: '后台退出登录' })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async adminLogout(@CurrentUser('sub') accountId: string) {
    return this.authService.adminLogout(accountId);
  }

  @Post('auth/admin/logout')
  @ApiOperation({ summary: '后台退出登录（新后台兼容路径）' })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async adminLogoutCompat(@CurrentUser('sub') accountId: string) {
    return this.authService.adminLogout(accountId);
  }

  @Get('admin/profile')
  @ApiOperation({ summary: '获取当前管理员信息' })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async getAdminProfile(@CurrentUser('sub') accountId: string) {
    return this.authService.getAdminProfile(accountId);
  }

  @Get('auth/admin/profile')
  @ApiOperation({ summary: '获取当前管理员信息（新后台兼容路径）' })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async getAdminProfileCompat(@CurrentUser('sub') accountId: string) {
    return this.authService.getAdminProfile(accountId);
  }

  @Post('auth/admin/reset-password')
  @ApiOperation({ summary: '管理员重置密码（新后台兼容路径）' })
  async adminResetPasswordCompat(@Body() dto: { username?: string; email?: string; oldPassword?: string; newPassword?: string }) {
    // 新 UI 忘记密码功能：当前仅做占位，后续可对接邮件发送重置链接
    return { success: true, message: '密码重置功能暂未开放，请联系超级管理员' };
  }
}
