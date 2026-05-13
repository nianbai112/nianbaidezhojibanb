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

  async getMiniappAccessToken(): Promise<string> {
    const cacheKey = 'wx:miniapp:access_token';
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const { appid, secret } = await this.getMiniappCredentials();
    const { data } = await axios.get(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`,
    );

    if (data.access_token) {
      await this.redis.set(cacheKey, data.access_token, data.expires_in - 60);
      return data.access_token;
    }
    throw new Error(`获取小程序 AccessToken 失败: ${JSON.stringify(data)}`);
  }

  async getOfficialAccessToken(): Promise<string> {
    const cacheKey = 'wx:official:access_token';
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const { appid, secret } = await this.getOfficialCredentials();
    const { data } = await axios.get(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`,
    );

    if (data.access_token) {
      await this.redis.set(cacheKey, data.access_token, data.expires_in - 60);
      return data.access_token;
    }
    throw new Error(`获取公众号 AccessToken 失败: ${JSON.stringify(data)}`);
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
