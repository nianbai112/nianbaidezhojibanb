import {
  Controller, Get, Put, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { WechatTokenService } from './wechat-token.service';
import { WechatOfficialService } from './wechat-official.service';

@ApiTags('微信管理')
@Controller('admin/wechat')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class WechatAdminController {
  constructor(
    private readonly tokenService: WechatTokenService,
    private readonly officialService: WechatOfficialService,
  ) {}

  @Get('official/config')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '获取公众号配置' })
  async getOfficialConfig() {
    // Return config without secrets
    try {
      const creds = await this.tokenService.getOfficialCredentials();
      return { appId: creds.appid, configured: true };
    } catch {
      return { appId: '', configured: false };
    }
  }

  @Post('official/test-token')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '测试公众号 AccessToken' })
  async testOfficialToken() {
    try {
      // 配置可能刚刚保存；先清理旧 token，确保测试的是当前 AppSecret。
      await this.tokenService.clearOfficialTokenCache();
      const token = await this.tokenService.getOfficialAccessToken();
      return { success: true, tokenPreview: token.substring(0, 10) + '...' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @Post('official/generate-bind-qrcode')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '生成绑定二维码（测试用）' })
  async generateBindQrcode(@Body() body: { userId: string }) {
    return this.officialService.generateBindQrcode(body.userId);
  }
}
