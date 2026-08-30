import { Controller, Post, Body, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard } from '../../guards/admin.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('认证')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getClientIp(req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const cfIp = req.headers['cf-connecting-ip'];
    const raw = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded || realIp || cfIp || req.ip || '';
    return String(raw).split(',')[0].trim();
  }

  // ============ 小程序接口 ============

  /** 微信小程序登录 — 严格限流防暴力破解 */
  @Post('wx-auth/wx-mini-login')
  @ApiOperation({ summary: '微信小程序登录' })
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  async wxMiniLogin(@Body() dto: any, @Req() req: Request) {
    const ip = this.getClientIp(req);
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.wxMiniLogin(dto, ip, ua);
  }

  /** 获取微信手机号 — 严格限流 */
  @Post('wx-auth/get-phone-number')
  @ApiOperation({ summary: '获取微信手机号' })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  async getPhoneNumber(@Body() dto: any, @CurrentUser('sub') userId: string) {
    return this.authService.getPhoneNumber(userId, dto);
  }

  /** 微信手机号一键登录 — 小程序端 getPhoneNumber + uni.login */
  @Post('wx-auth/phone-one-tap-login')
  @ApiOperation({ summary: '微信手机号一键登录' })
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  async phoneOneTapLogin(@Body() dto: any, @Req() req: Request) {
    const ip = this.getClientIp(req);
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.phoneOneTapLogin(dto, ip, ua);
  }

  /** 发送手机号登录验证码 */
  @Post('auth/phone/send-code')
  @ApiOperation({ summary: '发送手机号登录验证码' })
  @Throttle({ auth: { ttl: 60000, limit: 5 } })
  async sendPhoneLoginCode(@Body() dto: any, @Req() req: Request) {
    const ip = this.getClientIp(req);
    return this.authService.sendPhoneLoginCode(dto, ip);
  }

  /** 手机号验证码登录 */
  @Post('auth/phone/login')
  @ApiOperation({ summary: '手机号验证码登录' })
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  async phoneLogin(@Body() dto: any, @Req() req: Request) {
    const ip = this.getClientIp(req);
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.phoneLogin(dto, ip, ua);
  }

  /** 刷新 Token — 限流防止滥用 */
  @Post('wx-auth/refresh')
  @ApiOperation({ summary: '刷新 Token' })
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
  @Throttle({ admin_auth: { ttl: 60000, limit: parseInt(process.env.ADMIN_AUTH_THROTTLE_LIMIT || '30', 10) } })
  async adminLogin(
    @Body() dto: { username: string; password: string; captchaId?: string; captcha?: string },
    @Req() req: Request,
  ) {
    const ip = this.getClientIp(req);
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.adminLogin(dto, ip, ua);
  }

  @Post('auth/admin/login')
  @ApiOperation({ summary: '管理员登录（新后台兼容路径）' })
  @Throttle({ admin_auth: { ttl: 60000, limit: 30 } })
  async adminLoginCompat(
    @Body() dto: { username: string; password: string; captchaId?: string; captcha?: string; mfaCode?: string },
    @Req() req: Request,
  ) {
    const ip = this.getClientIp(req);
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
  @UseGuards(JwtGuard, AdminGuard)
  @ApiBearerAuth()
  async adminLogout(@CurrentUser('sub') accountId: string) {
    return this.authService.adminLogout(accountId);
  }

  @Post('auth/admin/logout')
  @ApiOperation({ summary: '后台退出登录（新后台兼容路径）' })
  @UseGuards(JwtGuard, AdminGuard)
  @ApiBearerAuth()
  async adminLogoutCompat(@CurrentUser('sub') accountId: string) {
    return this.authService.adminLogout(accountId);
  }

  @Get('admin/profile')
  @ApiOperation({ summary: '获取当前管理员信息' })
  @UseGuards(JwtGuard, AdminGuard)
  @ApiBearerAuth()
  async getAdminProfile(@CurrentUser('sub') accountId: string) {
    return this.authService.getAdminProfile(accountId);
  }

  @Get('auth/admin/profile')
  @ApiOperation({ summary: '获取当前管理员信息（新后台兼容路径）' })
  @UseGuards(JwtGuard, AdminGuard)
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

  // ===== AUD-P1-165: MFA 管理端点 =====

  @Post('auth/admin/mfa/setup')
  @UseGuards(JwtGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成 MFA 密钥和 QR 码' })
  async setupMfa(@CurrentUser('sub') accountId: string, @CurrentUser('username') username: string) {
    return this.authService.generateMfaSecret(accountId, username);
  }

  @Post('auth/admin/mfa/enable')
  @UseGuards(JwtGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '验证 TOTP 码并启用 MFA' })
  async enableMfa(@CurrentUser('sub') accountId: string, @Body() dto: { code: string }) {
    return this.authService.enableMfa(accountId, dto.code);
  }

  @Post('auth/admin/mfa/disable')
  @UseGuards(JwtGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '验证 TOTP 码并禁用 MFA' })
  async disableMfa(@CurrentUser('sub') accountId: string, @Body() dto: { code: string }) {
    return this.authService.disableMfa(accountId, dto.code);
  }

  @Get('auth/admin/mfa/status')
  @UseGuards(JwtGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取 MFA 启用状态' })
  async getMfaStatus(@CurrentUser('sub') accountId: string) {
    return this.authService.getMfaStatus(accountId);
  }
}
