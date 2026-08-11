import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { WechatTokenService } from './wechat-token.service';
import axios from 'axios';
import * as crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';

@Injectable()
export class WechatOfficialService {
  private readonly logger = new Logger(WechatOfficialService.name);
  private readonly maxCallbackXmlBytes = 64 * 1024;
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly tokenService: WechatTokenService,
  ) {}

  async getBindingStatus(userId: string) {
    const binding = await this.prisma.wechatOfficialBinding.findUnique({
      where: { userId },
    });

    const officialConfig = await this.prisma.config.findUnique({
      where: { key: 'wechat_official' },
    });
    const cfgValue = (officialConfig?.value || {}) as Record<string, any>;

    return {
      isBound: !!binding,
      subscribe: binding?.subscribe || false,
      officialAccountName: cfgValue.name || cfgValue.accountName || '',
      officialAccountQrUrl: cfgValue.qrUrl || '',
      bindUrl: cfgValue.bindUrl || '',
    };
  }

  async generateBindQrcode(userId: string) {
    const scene = `bind_${userId}_${Date.now()}`;

    try {
      const accessToken = await this.tokenService.getOfficialAccessToken();
      const { data } = await axios.post(
        `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${accessToken}`,
        {
          expire_seconds: 2592000,
          action_name: 'QR_STR_SCENE',
          action_info: { scene: { scene_str: scene } },
        },
      );

      if (data.ticket) {
        const qrUrl = `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(data.ticket)}`;

        // 保存 scene 到绑定记录（或临时存储）
        await this.redis_set(`wechat:bind:scene:${scene}`, userId, 2592000);

        return {
          scene,
          qrUrl,
          expireSeconds: data.expire_seconds || 2592000,
        };
      }
      throw new Error(data.errmsg || '生成二维码失败');
    } catch (err: any) {
      this.logger.warn(`生成绑定二维码失败: ${err.message}`);
      throw new BadRequestException(`生成二维码失败: ${err.message}`);
    }
  }

  async handleCallback(body: string, query: Record<string, string>): Promise<string> {
    const token = await this.getCallbackToken();
    const signature = String(query?.signature || '').trim();
    const timestamp = String(query?.timestamp || '').trim();
    const nonce = String(query?.nonce || '').trim();

    // 公众号回调必须验签；缺少配置或任一签名参数时不能继续处理事件。
    if (!token || !signature || !timestamp || !nonce) {
      this.logger.warn('微信回调缺少 token 或签名参数');
      return 'error';
    }
    const hash = crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');
    const expected = Buffer.from(hash);
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      this.logger.warn('微信回调签名验证失败');
      return 'error';
    }

    // GET 请求用于服务器验证
    if (query.echostr) {
      const challenge = String(query.echostr).trim();
      return /^[A-Za-z0-9_-]{1,128}$/.test(challenge) ? challenge : 'error';
    }

    // POST 请求处理事件
    try {
      if (Buffer.byteLength(body || '', 'utf8') > this.maxCallbackXmlBytes) {
        this.logger.warn('公众号回调 XML 过大，已忽略');
        return 'success';
      }
      if (/<!DOCTYPE|<!ENTITY/i.test(body || '')) {
        this.logger.warn('公众号回调 XML 包含不安全的 DOCTYPE/ENTITY，已忽略');
        return 'success';
      }
      const xml = this.xmlParser.parse(body);
      const msg = xml.xml;

      if (!msg) return 'success';

      const event = (msg.Event || '').toLowerCase();
      const eventKey = msg.EventKey || '';
      const fromUser = msg.FromUserName;

      if (event === 'subscribe') {
        await this.handleSubscribe(fromUser, eventKey);
      } else if (event === 'unsubscribe') {
        await this.handleUnsubscribe(fromUser);
      } else if (event === 'scan') {
        await this.handleScan(fromUser, eventKey);
      }

      return 'success';
    } catch (err: any) {
      this.logger.warn(`处理公众号回调失败: ${err.message}`);
      return 'success';
    }
  }

  private async handleSubscribe(openid: string, eventKey: string) {
    this.logger.log(`公众号关注: openid=${openid} eventKey=${eventKey}`);

    // 尝试从 eventKey 中提取 userId
    let userId: string | null = null;
    if (eventKey.startsWith('qrscene_bind_')) {
      const scene = eventKey.replace('qrscene_', '');
      userId = await this.redis_get(`wechat:bind:scene:${scene}`);
    }

    // 通过 unionid 尝试匹配
    if (!userId) {
      // 获取用户信息
      try {
        const accessToken = await this.tokenService.getOfficialAccessToken();
        const { data } = await axios.get(
          `https://api.weixin.qq.com/cgi-bin/user/info?access_token=${accessToken}&openid=${openid}&lang=zh_CN`,
        );
        if (data.unionid) {
          const user = await this.prisma.user.findFirst({
            where: { unionid: data.unionid },
          });
          if (user) userId = user.id;
        }
      } catch {}
    }

    if (userId) {
      await this.prisma.wechatOfficialBinding.upsert({
        where: { userId },
        create: {
          userId,
          officialOpenid: openid,
          subscribe: true,
          subscribeAt: new Date(),
          qrScene: eventKey,
        },
        update: {
          officialOpenid: openid,
          subscribe: true,
          subscribeAt: new Date(),
          unsubscribedAt: null,
        },
      });
    }
  }

  private async handleUnsubscribe(openid: string) {
    this.logger.log(`公众号取消关注: openid=${openid}`);
    await this.prisma.wechatOfficialBinding.updateMany({
      where: { officialOpenid: openid },
      data: { subscribe: false, unsubscribedAt: new Date() },
    });
  }

  private async handleScan(openid: string, eventKey: string) {
    this.logger.log(`公众号扫码: openid=${openid} eventKey=${eventKey}`);

    let userId: string | null = null;
    if (eventKey.startsWith('bind_')) {
      userId = await this.redis_get(`wechat:bind:scene:${eventKey}`);
    }

    if (userId) {
      await this.prisma.wechatOfficialBinding.upsert({
        where: { userId },
        create: {
          userId,
          officialOpenid: openid,
          subscribe: true,
          subscribeAt: new Date(),
          qrScene: eventKey,
        },
        update: {
          officialOpenid: openid,
          subscribe: true,
          subscribeAt: new Date(),
          unsubscribedAt: null,
        },
      });
    }
  }

  private async getCallbackToken(): Promise<string> {
    const saved = await this.prisma.config.findUnique({ where: { key: 'wechat_official' } });
    const value = (saved?.value || {}) as Record<string, any>;
    return String(value.token || this.config.get('WX_OFFICIAL_TOKEN') || '').trim();
  }

  private async redis_set(key: string, value: string, ttl: number) {
    await this.redis.set(key, value, ttl);
  }

  private async redis_get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }
}
