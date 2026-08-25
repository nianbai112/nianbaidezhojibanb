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

  async sendNotificationTemplate(params: {
    userId: string;
    scene?: string | null;
    page?: string;
    data: Record<string, any>;
  }): Promise<{ success: boolean; skipped?: boolean; error?: string; templateType?: string }> {
    const templateType = this.resolveTemplateType(params.scene);
    if (!templateType) {
      return { success: false, skipped: true, error: 'unsupported_scene' };
    }

    const policy = await this.getNotificationPolicy();
    if (!policy.globalEnabled || policy.scenes?.[templateType] !== true) {
      return { success: false, skipped: true, error: 'official_notification_disabled', templateType };
    }

    const antispam = policy.antispam || {};
    if (templateType === 'community_like') {
      let likeCount = Number(params.data?.likeCount ?? params.data?.count ?? 0);
      if (!Number.isFinite(likeCount) || likeCount <= 0) {
        const pendingKey = this.communityLikePendingKey(params.userId);
        likeCount = await this.redis.incr(pendingKey).catch(() => 1);
        if (likeCount === 1) await this.redis.expire(pendingKey, 7 * 24 * 60 * 60).catch(() => undefined);
        params.data.likeCount = likeCount;
      }
      const threshold = this.toPositiveInt(antispam.likeThreshold, 5);
      if (likeCount < threshold) {
        return { success: false, skipped: true, error: 'like_threshold_not_reached', templateType };
      }
    }

    if (templateType.startsWith('community_')) {
      const dailyMax = this.toPositiveInt(antispam.dailyMax, 5);
      const dailyCount = Number(await this.redis.get(this.communityDailyKey(params.userId)).catch(() => '0'));
      if (dailyCount >= dailyMax) {
        return { success: false, skipped: true, error: 'community_daily_limit', templateType };
      }
      if (templateType === 'community_like') {
        const likeDailyMax = this.toPositiveInt(antispam.likeDailyMax, 1);
        const likeCount = Number(await this.redis.get(this.communityLikeDailyKey(params.userId)).catch(() => '0'));
        if (likeCount >= likeDailyMax) {
          return { success: false, skipped: true, error: 'community_like_daily_limit', templateType };
        }
      }
      if (templateType === 'community_reply') {
        const cooldownKey = this.communityReplyCooldownKey(params.userId);
        if (await this.redis.get(cooldownKey).catch(() => null)) {
          return { success: false, skipped: true, error: 'community_reply_rate_limited', templateType };
        }
      }
    }

    const data = this.normalizeNotificationData(params.data, templateType);
    const result = await this.sendTemplateMessage({
      userId: params.userId,
      templateType,
      page: params.page,
      data,
    });

    if (result.success && templateType.startsWith('community_')) {
      await this.incrementDailyCounter(this.communityDailyKey(params.userId));
      if (templateType === 'community_like') {
        await this.incrementDailyCounter(this.communityLikeDailyKey(params.userId));
        await this.redis.del(this.communityLikePendingKey(params.userId)).catch(() => undefined);
      }
      if (templateType === 'community_reply') {
        const cooldownSeconds = this.toPositiveInt(antispam.replyMergeMinutes, 30) * 60;
        await this.redis.set(this.communityReplyCooldownKey(params.userId), '1', cooldownSeconds).catch(() => undefined);
      }
    }

    return { ...result, templateType };
  }

  async sendTemplateMessage(params: {
    userId: string;
    templateType: string;
    page?: string;
    data: Record<string, any>;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, templateType, page, data } = params;
    let templateId = '';
    let openid = '';
    let templateData: Record<string, any> = data;
    try {
      const binding = await this.prisma.wechatOfficialBinding.findUnique({
        where: { userId },
      });
      if (!binding?.officialOpenid || binding.subscribe === false) {
        await this.writeMessageLog({
          userId,
          openid: binding?.officialOpenid,
          templateType,
          templateId,
          page,
          payload: data,
          status: 'failed',
          errorCode: 'unbound',
          errorMessage: '用户未绑定或未关注服务号',
        });
        return { success: false, error: '用户未绑定或未关注服务号' };
      }
      openid = binding.officialOpenid;

      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { regionId: true },
      }).catch(() => null);
      const templates = await this.prisma.wechatTemplateConfig.findMany({
        where: {
          platformType: 'official',
          templateType,
          enabled: true,
          OR: profile?.regionId
            ? [{ regionId: profile.regionId }, { regionId: null }]
            : [{ regionId: null }],
        },
        take: 2,
      });
      const template = templates.find((item) => item.regionId === profile?.regionId)
        || templates.find((item) => !item.regionId);
      if (!template?.templateId) {
        await this.writeMessageLog({
          userId,
          openid,
          templateType,
          templateId,
          page,
          payload: data,
          status: 'failed',
          errorCode: 'template_missing',
          errorMessage: '服务号模板未配置或已停用',
        });
        return { success: false, error: '服务号模板未配置或已停用' };
      }
      templateId = template.templateId;

      const fieldMapping = (template.fieldMapping || {}) as Record<string, string>;
      templateData = {};
      for (const [templateKey, dataKey] of Object.entries(fieldMapping)) {
        const value = data[dataKey];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          templateData[templateKey] = {
            value: this.normalizeTemplateFieldValue(templateKey, value),
          };
        }
      }
      if (!Object.keys(templateData).length) {
        await this.writeMessageLog({
          userId,
          openid,
          templateType,
          templateId,
          page,
          payload: data,
          status: 'failed',
          errorCode: 'mapping_empty',
          errorMessage: '服务号模板字段映射为空或业务数据缺失',
        });
        return { success: false, error: '服务号模板字段映射为空或业务数据缺失' };
      }

      const requestBody: Record<string, any> = {
        touser: openid,
        template_id: templateId,
        data: templateData,
      };
      if (page?.startsWith('http://') || page?.startsWith('https://')) requestBody.url = page;

      const response = await this.postOfficialTemplateMessage(requestBody);
      if (Number(response?.errcode || 0) !== 0) {
        await this.writeMessageLog({
          userId,
          openid,
          templateType,
          templateId,
          page,
          payload: templateData,
          status: 'failed',
          errorCode: String(response?.errcode ?? 'wechat_error'),
          errorMessage: String(response?.errmsg || '微信服务号发送失败'),
        });
        return { success: false, error: String(response?.errmsg || '微信服务号发送失败') };
      }

      await this.writeMessageLog({
        userId,
        openid,
        templateType,
        templateId,
        page,
        payload: templateData,
        status: 'success',
      });
      return { success: true };
    } catch (err: any) {
      this.logger.warn(`发送服务号模板消息失败: ${err.message}`);
      await this.writeMessageLog({
        userId,
        openid,
        templateType,
        templateId,
        page,
        payload: templateData,
        status: 'failed',
        errorCode: 'exception',
        errorMessage: err.message,
      });
      return { success: false, error: err.message };
    }
  }

  async retryTemplateMessage(logId: string): Promise<{ success: boolean; message: string; error?: string }> {
    const log = await this.prisma.wechatMessageLog.findUnique({ where: { id: logId } });
    if (!log) throw new BadRequestException('日志不存在');
    if (log.platformType !== 'official') throw new BadRequestException('不是服务号消息日志');
    if (log.status === 'success') return { success: true, message: '该消息已发送成功' };
    if (!log.openid || !log.templateId || !log.payload || typeof log.payload !== 'object') {
      throw new BadRequestException('原发送数据不完整，无法重试');
    }

    try {
      const requestBody: Record<string, any> = {
        touser: log.openid,
        template_id: log.templateId,
        data: log.payload,
      };
      if (log.page?.startsWith('http://') || log.page?.startsWith('https://')) requestBody.url = log.page;
      const response = await this.postOfficialTemplateMessage(requestBody);
      const success = Number(response?.errcode || 0) === 0;
      await this.prisma.wechatMessageLog.update({
        where: { id: logId },
        data: {
          status: success ? 'success' : 'failed',
          errorCode: success ? null : String(response?.errcode ?? 'wechat_error'),
          errorMessage: success ? null : String(response?.errmsg || '微信服务号发送失败'),
          sentAt: success ? new Date() : null,
        },
      });
      return success
        ? { success: true, message: '服务号消息已重新发送' }
        : { success: false, message: '服务号消息重试失败', error: String(response?.errmsg || '微信服务号发送失败') };
    } catch (err: any) {
      await this.prisma.wechatMessageLog.update({
        where: { id: logId },
        data: { status: 'failed', errorCode: 'exception', errorMessage: err.message, sentAt: null },
      });
      return { success: false, message: '服务号消息重试失败', error: err.message };
    }
  }

  private async getNotificationPolicy(): Promise<Record<string, any>> {
    const saved = await this.prisma.config.findUnique({ where: { key: 'wechat_official_notify' } });
    return saved?.value && typeof saved.value === 'object' ? saved.value as Record<string, any> : {};
  }

  private async postOfficialTemplateMessage(requestBody: Record<string, any>) {
    const send = async (accessToken: string) => {
      const { data } = await axios.post(
        `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
        requestBody,
        { timeout: 10000 },
      );
      return data;
    };

    let accessToken = await this.tokenService.getOfficialAccessToken();
    let response = await send(accessToken);
    if ([40001, 40014, 42001].includes(Number(response?.errcode))) {
      await this.tokenService.clearOfficialTokenCache();
      accessToken = await this.tokenService.getOfficialAccessToken();
      response = await send(accessToken);
    }
    return response;
  }

  private normalizeTemplateFieldValue(templateKey: string, value: unknown) {
    const text = String(value ?? '').trim();
    if (/^thing\d+$/i.test(templateKey)) return text.slice(0, 20);
    if (/^character_string\d+$/i.test(templateKey)) return text.slice(0, 32);
    if (/^time\d+$/i.test(templateKey)) return text.slice(0, 20);
    return text.slice(0, 200);
  }

  private resolveTemplateType(scene?: string | null): string {
    const value = String(scene || '').trim().toLowerCase();
    if (!value) return '';
    if (value.includes('mention') || value.includes('_at')) return 'community_at';
    if (value.includes('reply') || value.includes('comment')) return 'community_reply';
    if (value.includes('like')) return 'community_like';
    if (value.includes('circle') && value.includes('new')) return 'community_circle_new';
    if (value.includes('accepted') || value.includes('rider_status') || value.includes('reassigned')) return 'errand_accepted';
    if (value.includes('picked') || value.includes('pickup')) return 'errand_picked';
    if (value.includes('delivered') || value.includes('delivery_status') || value.includes('auto_received')) return 'errand_delivered';
    if (
      value.includes('abnormal') || value.includes('cancel') || value.includes('delay') ||
      value.includes('refund') || value.includes('appeal')
    ) return 'errand_abnormal';
    return '';
  }

  private normalizeNotificationData(data: Record<string, any>, templateType: string) {
    const source = data || {};
    const nowText = new Date().toLocaleString('zh-CN', { hour12: false });
    const contentActor = String(source.content || '').split(/[：:]/)[0].trim();
    return {
      ...source,
      orderNo: source.orderNo || source.order_no || source.orderId || source.order_id || '',
      riderName: source.riderName || source.rider_name || source.deliveryName || '骑手',
      riderPhone: source.riderPhone || source.rider_phone || '',
      pickupAddress: source.pickupAddress || source.pickup_address || source.content || '',
      deliveryAddress: source.deliveryAddress || source.delivery_address || source.content || '订单服务地点',
      estimatedTime: source.estimatedTime || source.estimated_time || source.time || nowText,
      finishedAt: source.finishedAt || source.finished_at || source.time || nowText,
      abnormalReason: source.abnormalReason || source.reason || source.content || '',
      suggestion: source.suggestion || source.remark || source.content || '',
      remark: source.remark || source.content || source.title || '',
      actionLabel: source.actionLabel || source.title || this.templateTypeLabel(templateType),
      fromNickname: source.fromNickname || source.nickname || source.actorName || contentActor || '用户',
      contentSummary: source.contentSummary || source.content || source.title || '',
      postTitle: source.postTitle || source.title || source.content || '',
      likeCount: source.likeCount ?? source.count ?? '',
      timePeriod: source.timePeriod || source.time || nowText,
    };
  }

  private templateTypeLabel(templateType: string) {
    const labels: Record<string, string> = {
      community_at: '@提醒',
      community_reply: '收到新回复',
      community_like: '收到点赞',
      community_circle_new: '圈子有新内容',
      errand_accepted: '骑手已接单',
      errand_picked: '骑手已取货',
      errand_delivered: '订单已完成',
      errand_abnormal: '订单状态异常',
    };
    return labels[templateType] || '服务通知';
  }

  private toPositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private communityDateKey() {
    return new Date().toISOString().slice(0, 10);
  }

  private communityDailyKey(userId: string) {
    return `wechat:official:community:daily:${this.communityDateKey()}:${userId}`;
  }

  private communityLikeDailyKey(userId: string) {
    return `wechat:official:community:like:${this.communityDateKey()}:${userId}`;
  }

  private communityLikePendingKey(userId: string) {
    return `wechat:official:community:like:pending:${userId}`;
  }

  private communityReplyCooldownKey(userId: string) {
    return `wechat:official:community:reply:${userId}`;
  }

  private async incrementDailyCounter(key: string) {
    const count = await this.redis.incr(key).catch(() => 0);
    if (count === 1) await this.redis.expire(key, 26 * 60 * 60).catch(() => undefined);
  }

  private async writeMessageLog(params: {
    userId?: string;
    openid?: string;
    templateType: string;
    templateId: string;
    page?: string;
    payload: any;
    status: string;
    errorCode?: string;
    errorMessage?: string;
  }) {
    await this.prisma.wechatMessageLog.create({
      data: {
        userId: params.userId || null,
        openid: params.openid || null,
        platformType: 'official',
        templateType: params.templateType,
        templateId: params.templateId,
        page: params.page || null,
        payload: params.payload,
        status: params.status,
        errorCode: params.errorCode || null,
        errorMessage: params.errorMessage || null,
        sentAt: params.status === 'success' ? new Date() : null,
      },
    }).catch((err: any) => {
      this.logger.warn(`写入服务号发送日志失败: ${err.message}`);
    });
  }

  async handleCallback(body: string, query: Record<string, string>): Promise<string> {
    const callbackConfig = await this.getCallbackConfig();
    const token = callbackConfig.token;
    const signature = String(query?.signature || '').trim();
    const msgSignature = String(query?.msg_signature || '').trim();
    const timestamp = String(query?.timestamp || '').trim();
    const nonce = String(query?.nonce || '').trim();

    if (!token || !timestamp || !nonce) {
      this.logger.warn('微信回调缺少 token、timestamp 或 nonce');
      return 'error';
    }

    // GET 请求用于服务器验证
    if (query.echostr) {
      const echostr = String(query.echostr);
      const encrypted = query.encrypt_type === 'aes' || !!msgSignature;
      if (encrypted) {
        if (!msgSignature || !callbackConfig.encodingAESKey || !callbackConfig.appId) {
          this.logger.warn('微信 AES 回调缺少 msg_signature、EncodingAESKey 或 AppID');
          return 'error';
        }
        if (!this.verifySignature(msgSignature, [token, timestamp, nonce, echostr])) {
          this.logger.warn('微信 AES 回调签名验证失败');
          return 'error';
        }
        try {
          return this.decryptOfficialPayload(
            echostr,
            callbackConfig.encodingAESKey,
            callbackConfig.appId,
          );
        } catch (err: any) {
          this.logger.warn(`微信 AES 验证串解密失败: ${err.message}`);
          return 'error';
        }
      }
      if (!signature || !this.verifySignature(signature, [token, timestamp, nonce])) {
        this.logger.warn('微信回调签名验证失败');
        return 'error';
      }
      return query.echostr;
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
      const outerXml = this.xmlParser.parse(body);
      const encryptedPayload = String(outerXml?.xml?.Encrypt || '').trim();
      let msg: Record<string, any> | undefined;

      if (encryptedPayload) {
        if (!msgSignature || !callbackConfig.encodingAESKey || !callbackConfig.appId) {
          this.logger.warn('微信 AES 回调缺少 msg_signature、EncodingAESKey 或 AppID');
          return 'error';
        }
        if (!this.verifySignature(msgSignature, [token, timestamp, nonce, encryptedPayload])) {
          this.logger.warn('微信 AES 回调签名验证失败');
          return 'error';
        }
        const decryptedXml = this.decryptOfficialPayload(
          encryptedPayload,
          callbackConfig.encodingAESKey,
          callbackConfig.appId,
        );
        if (/<!DOCTYPE|<!ENTITY/i.test(decryptedXml)) {
          this.logger.warn('公众号解密 XML 包含不安全的 DOCTYPE/ENTITY，已忽略');
          return 'success';
        }
        msg = this.xmlParser.parse(decryptedXml)?.xml;
      } else {
        if (!signature || !this.verifySignature(signature, [token, timestamp, nonce])) {
          this.logger.warn('微信回调签名验证失败');
          return 'error';
        }
        msg = outerXml?.xml;
      }

      if (!msg) return 'success';

      const event = String(msg.Event || '').toLowerCase();
      const eventKey = String(msg.EventKey || '');
      const fromUser = String(msg.FromUserName || '');

      if ((event === 'subscribe' || event === 'unsubscribe' || event === 'scan') && !fromUser) {
        this.logger.warn(`公众号 ${event} 回调缺少 FromUserName`);
        return 'error';
      }

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
      return 'error';
    }
  }

  private verifySignature(signature: string, parts: string[]): boolean {
    const digest = crypto.createHash('sha1').update([...parts].sort().join('')).digest('hex');
    const expected = Buffer.from(digest, 'utf8');
    const actual = Buffer.from(signature, 'utf8');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  private decryptOfficialPayload(encrypted: string, encodingAESKey: string, appId: string): string {
    if (!/^[A-Za-z0-9+/]{43}$/.test(encodingAESKey)) {
      throw new Error('EncodingAESKey 格式无效');
    }
    const aesKey = Buffer.from(`${encodingAESKey}=`, 'base64');
    if (aesKey.length !== 32) {
      throw new Error('EncodingAESKey 长度无效');
    }

    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16));
    decipher.setAutoPadding(false);
    const decryptedWithPadding = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]);
    if (!decryptedWithPadding.length) {
      throw new Error('AES 解密结果为空');
    }

    const padding = decryptedWithPadding[decryptedWithPadding.length - 1];
    if (padding < 1 || padding > 32) {
      throw new Error('AES 填充无效');
    }
    const paddingBytes = decryptedWithPadding.subarray(decryptedWithPadding.length - padding);
    if (!paddingBytes.every((byte) => byte === padding)) {
      throw new Error('AES 填充校验失败');
    }

    const decrypted = decryptedWithPadding.subarray(0, decryptedWithPadding.length - padding);
    if (decrypted.length < 20) {
      throw new Error('AES 消息长度无效');
    }
    const messageLength = decrypted.readUInt32BE(16);
    const messageEnd = 20 + messageLength;
    if (messageLength < 1 || messageEnd > decrypted.length) {
      throw new Error('AES 消息体长度无效');
    }

    const message = decrypted.subarray(20, messageEnd).toString('utf8');
    const receivedAppId = decrypted.subarray(messageEnd).toString('utf8');
    if (receivedAppId !== appId) {
      throw new Error('AES 消息 AppID 校验失败');
    }
    return message;
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

  private async getCallbackConfig(): Promise<{
    token: string;
    encodingAESKey: string;
    appId: string;
  }> {
    const saved = await this.prisma.config.findUnique({ where: { key: 'wechat_official' } });
    const value = (saved?.value || {}) as Record<string, any>;
    return {
      token: String(value.token || this.config.get('WX_OFFICIAL_TOKEN') || '').trim(),
      encodingAESKey: String(
        value.encodingAESKey ||
        value.encodingAesKey ||
        this.config.get('WX_OFFICIAL_ENCODING_AES_KEY') ||
        '',
      ).trim(),
      appId: String(
        value.appId ||
        value.appid ||
        this.config.get('WX_OFFICIAL_APPID') ||
        '',
      ).trim(),
    };
  }

  private async redis_set(key: string, value: string, ttl: number) {
    await this.redis.set(key, value, ttl);
  }

  private async redis_get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }
}
