import { Controller, Post, Body, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
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

  /** 后台管理员登录 — 限流防暴力破解（默认 30 次/分钟，可通过 ADMIN_AUTH_THROTTLE_LIMIT 调整） */
  @Post('admin/login')
  @ApiOperation({ summary: '后台管理员登录' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ admin_auth: { ttl: 60000, limit: parseInt(process.env.ADMIN_AUTH_THROTTLE_LIMIT || '30', 10) } })
  async adminLogin(
    @Body() dto: { username: string; password: string },
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = (req.headers['user-agent'] as string) || '';
    return this.authService.adminLogin(dto, ip, ua);
  }

  @Post('admin/refresh')
  @ApiOperation({ summary: '后台刷新 Token' })
  async adminRefreshToken(@Body() dto: { refreshToken: string }) {
    return this.authService.adminRefreshToken(dto.refreshToken);
  }

  @Post('admin/logout')
  @ApiOperation({ summary: '后台退出登录' })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async adminLogout(@CurrentUser('sub') accountId: string) {
    return this.authService.adminLogout(accountId);
  }

  @Get('admin/profile')
  @ApiOperation({ summary: '获取当前管理员信息' })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async getAdminProfile(@CurrentUser('sub') accountId: string) {
    return this.authService.getAdminProfile(accountId);
  }
}
