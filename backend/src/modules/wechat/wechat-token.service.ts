import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import axios from 'axios';

@Injectable()
export class WechatTokenService {
  private readonly logger = new Logger(WechatTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * AUD-P1-169: 获取小程序 access_token，使用 appid 隔离缓存
   */
  async getMiniappAccessToken(): Promise<string> {
    const { appid, secret } = await this.getMiniappCredentials();
    const cacheKey = `wx:miniapp:access_token:${appid}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const { data } = await axios.get(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`,
    );

    if (data.access_token) {
      await this.redis.set(cacheKey, data.access_token, data.expires_in - 60);
      return data.access_token;
    }
    throw new Error(`获取小程序 AccessToken 失败: ${JSON.stringify(data)}`);
  }

  /**
   * AUD-P1-169: 获取公众号 access_token，使用 appid 隔离缓存
   */
  async getOfficialAccessToken(): Promise<string> {
    const { appid, secret } = await this.getOfficialCredentials();
    const cacheKey = `wx:official:access_token:${appid}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const { data } = await axios.post(
      'https://api.weixin.qq.com/cgi-bin/stable_token',
      {
        grant_type: 'client_credential',
        appid,
        secret,
        force_refresh: false,
      },
      { timeout: 10000 },
    );

    if (data.access_token) {
      await this.redis.set(cacheKey, data.access_token, data.expires_in - 60);
      return data.access_token;
    }
    throw new Error(`获取公众号 AccessToken 失败: ${JSON.stringify(data)}`);
  }

  /**
   * AUD-P1-169: 清理小程序 token 缓存（配置变更时调用）
   */
  async clearMiniappTokenCache(): Promise<void> {
    try {
      // 清理旧格式缓存（无 appid）
      await this.redis.del('wx:miniapp:access_token');
      // 尝试清理带 appid 的缓存
      const { appid } = await this.getMiniappCredentials();
      await this.redis.del(`wx:miniapp:access_token:${appid}`);
    } catch {
      // 忽略错误（可能配置未设置）
    }
  }

  /**
   * AUD-P1-169: 清理公众号 token 缓存（配置变更时调用）
   */
  async clearOfficialTokenCache(): Promise<void> {
    try {
      // 清理旧格式缓存（无 appid）
      await this.redis.del('wx:official:access_token');
      // 尝试清理带 appid 的缓存
      const { appid } = await this.getOfficialCredentials();
      await this.redis.del(`wx:official:access_token:${appid}`);
    } catch {
      // 忽略错误（可能配置未设置）
    }
  }

  /**
   * AUD-P1-169: 清理所有微信 token 缓存
   */
  async clearAllTokenCache(): Promise<void> {
    await Promise.all([
      this.clearMiniappTokenCache(),
      this.clearOfficialTokenCache(),
      // 清理旧格式缓存
      this.redis.del('wx:access_token'),
      this.redis.del('wechat:access_token'),
      this.redis.del('wechat_access_token_miniapp'),
      this.redis.del('wechat_access_token_official'),
    ]);
  }

  async getMiniappCredentials(): Promise<{ appid: string; secret: string }> {
    const saved = await this.prisma.config.findUnique({ where: { key: 'miniapp' } });
    const value = (saved?.value || {}) as Record<string, any>;
    const appid = String(value.appId || value.appid || this.config.get('WX_MINI_APPID') || '').trim();
    const secret = String(value.appSecret || value.secret || this.config.get('WX_MINI_SECRET') || '').trim();

    if (!appid || !secret || appid.startsWith('your-') || secret.startsWith('your-')) {
      throw new Error('请先在系统配置中填写微信小程序 AppID 和 AppSecret');
    }

    return { appid, secret };
  }

  async getOfficialCredentials(): Promise<{ appid: string; secret: string }> {
    const saved = await this.prisma.config.findUnique({ where: { key: 'wechat_official' } });
    const value = (saved?.value || {}) as Record<string, any>;
    const appid = String(value.appId || value.appid || this.config.get('WX_OFFICIAL_APPID') || '').trim();
    const secret = String(value.appSecret || value.secret || this.config.get('WX_OFFICIAL_SECRET') || '').trim();

    if (!appid || !secret || appid.startsWith('your-') || secret.startsWith('your-')) {
      throw new Error('请先在系统配置中填写公众号 AppID 和 AppSecret');
    }

    return { appid, secret };
  }
}
