import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { WechatTokenService } from './wechat-token.service';
import axios from 'axios';

@Injectable()
export class WechatSubscribeService {
  private readonly logger = new Logger(WechatSubscribeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: WechatTokenService,
  ) {}

  async listEnabledTemplates(types: string[], userId?: string) {
    const templateTypes = [...new Set((types || []).map((value) => String(value).trim()).filter(Boolean))];
    if (!templateTypes.length) return [];

    const templates = await this.prisma.wechatTemplateConfig.findMany({
      where: {
        platformType: { in: ['miniprogram', 'miniapp'] },
        enabled: true,
        templateId: { not: '' },
        templateType: { in: templateTypes },
      },
      select: { templateType: true, templateId: true, regionId: true },
      orderBy: { updatedAt: 'desc' },
    });

    const regions = await Promise.all(
      templateTypes.map((templateType) => this.getUserRegionId(userId, templateType)),
    );
    return templateTypes.flatMap((templateType, index) => {
      const template = this.selectTemplateForRegion(
        templates.filter((item) => item.templateType === templateType),
        regions[index],
      );
      return template ? [{ templateType: template.templateType, templateId: template.templateId }] : [];
    });
  }

  async sendSubscribeMessage(params: {
    userId: string;
    templateType: string;
    page?: string;
    data: Record<string, any>;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, templateType, page, data } = params;

    try {
      // 1. 查询模板配置
      const regionId = await this.getUserRegionId(userId, templateType);
      const templates = await this.prisma.wechatTemplateConfig.findMany({
        where: {
          templateType,
          platformType: { in: ['miniprogram', 'miniapp'] },
          enabled: true,
          templateId: { not: '' },
          ...(regionId ? { OR: [{ regionId }, { regionId: null }] } : { regionId: null }),
        },
        orderBy: { updatedAt: 'desc' },
      });
      const template = this.selectTemplateForRegion(templates, regionId);

      if (!template) {
        await this.writeLog({ userId, platformType: 'miniprogram', templateType, templateId: '', page, data, status: 'failed', errorMessage: '模板未配置或已停用' });
        return { success: false, error: '模板未配置或已停用' };
      }

      // 2. 查询用户 openid
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { openid: true },
      });

      if (!user?.openid) {
        await this.writeLog({ userId, platformType: 'miniprogram', templateType, templateId: template.templateId, page, data, status: 'failed', errorMessage: '用户无 openid' });
        return { success: false, error: '用户无 openid' };
      }

      // 3. 查询用户授权状态
      const consent = await this.prisma.wechatSubscribeConsent.findUnique({
        where: { userId_templateType: { userId, templateType } },
      });

      if (!consent || consent.status !== 'accept' || consent.templateId !== template.templateId) {
        await this.writeLog({ userId, openid: user.openid, platformType: 'miniprogram', templateType, templateId: template.templateId, page, data, status: 'failed', errorMessage: '用户未授权当前模板或授权已使用' });
        return { success: false, error: '用户未授权当前模板或授权已使用' };
      }

      // 4. 构建发送数据
      const fieldMapping = (template.fieldMapping || {}) as Record<string, string>;
      const normalizedData = this.normalizeNotificationData(data);
      const templateData: Record<string, any> = {};
      const missingFields: string[] = [];
      for (const [templateKey, dataKey] of Object.entries(fieldMapping)) {
        const value = this.normalizeTemplateValue(templateKey, normalizedData[dataKey]);
        if (!value) missingFields.push(templateKey);
        else templateData[templateKey] = { value };
      }
      if (!Object.keys(fieldMapping).length || missingFields.length) {
        const errorMessage = !Object.keys(fieldMapping).length
          ? '模板字段映射未配置'
          : `模板字段缺少业务数据: ${missingFields.join(', ')}`;
        await this.writeLog({
          userId, openid: user.openid, platformType: 'miniprogram', templateType,
          templateId: template.templateId, page, data: normalizedData,
          status: 'failed', errorMessage,
        });
        return { success: false, error: errorMessage };
      }

      // 5. 发送
      const accessToken = await this.tokenService.getMiniappAccessToken();
      const targetPage = page || template.pageTemplate || template.defaultPage || '';

      const result = await axios.post(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
        {
          touser: user.openid,
          template_id: template.templateId,
          page: targetPage,
          data: templateData,
        },
      );

      if (result.data.errcode === 0) {
        await this.prisma.wechatSubscribeConsent.update({
          where: { id: consent.id },
          data: { status: 'used' },
        });
        await this.writeLog({ userId, openid: user.openid, platformType: 'miniprogram', templateType, templateId: template.templateId, page: targetPage, data: templateData, status: 'success' });
        return { success: true };
      } else {
        await this.writeLog({
          userId, openid: user.openid, platformType: 'miniprogram', templateType,
          templateId: template.templateId, page: targetPage, data: templateData,
          status: 'failed', errorCode: String(result.data.errcode), errorMessage: result.data.errmsg,
        });
        return { success: false, error: result.data.errmsg };
      }
    } catch (err: any) {
      this.logger.warn(`发送订阅消息失败: ${err.message}`);
      await this.writeLog({
        userId, platformType: 'miniprogram', templateType,
        templateId: '', page, data,
        status: 'failed', errorMessage: err.message,
      });
      return { success: false, error: err.message };
    }
  }

  async retryMessage(logId: string): Promise<{ success: boolean; message: string; error?: string }> {
    const log = await this.prisma.wechatMessageLog.findUnique({ where: { id: logId } });
    if (!log) throw new BadRequestException('日志不存在');
    if (!['miniprogram', 'miniapp'].includes(log.platformType)) {
      throw new BadRequestException('不是小程序订阅消息日志');
    }
    if (log.status === 'success') return { success: true, message: '该消息已发送成功' };
    if (!log.openid || !log.templateId || !log.payload || typeof log.payload !== 'object') {
      throw new BadRequestException('原发送数据不完整，无法重试');
    }

    try {
      const accessToken = await this.tokenService.getMiniappAccessToken();
      const { data: response } = await axios.post(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
        {
          touser: log.openid,
          template_id: log.templateId,
          page: log.page || '',
          data: log.payload,
        },
        { timeout: 10000 },
      );
      const success = Number(response?.errcode || 0) === 0;
      await this.prisma.wechatMessageLog.update({
        where: { id: logId },
        data: {
          status: success ? 'success' : 'failed',
          errorCode: success ? null : String(response?.errcode ?? 'wechat_error'),
          errorMessage: success ? null : String(response?.errmsg || '微信订阅消息发送失败'),
          sentAt: success ? new Date() : null,
        },
      });
      if (success && log.userId) {
        await this.prisma.wechatSubscribeConsent.updateMany({
          where: { userId: log.userId, templateType: log.templateType, templateId: log.templateId, status: 'accept' },
          data: { status: 'used' },
        });
      }
      return success
        ? { success: true, message: '订阅消息已重新发送' }
        : { success: false, message: '订阅消息重试失败', error: String(response?.errmsg || '微信订阅消息发送失败') };
    } catch (err: any) {
      await this.prisma.wechatMessageLog.update({
        where: { id: logId },
        data: { status: 'failed', errorCode: 'exception', errorMessage: err.message, sentAt: null },
      });
      return { success: false, message: '订阅消息重试失败', error: err.message };
    }
  }

  private async getUserRegionId(userId?: string, templateType?: string): Promise<string> {
    if (!userId) return '';
    try {
      if (templateType === 'takeaway_merchant_order') {
        const merchant = (this.prisma as any).merchant;
        if (merchant?.findFirst) {
          const record = await merchant.findFirst({
            where: { userId },
            select: { regionId: true },
            orderBy: { updatedAt: 'desc' },
          });
          if (record?.regionId) return String(record.regionId).trim();
        }
      }
      if (templateType === 'takeaway_rider_order') {
        const regionRider = (this.prisma as any).regionRider;
        if (regionRider?.findUnique) {
          const record = await regionRider.findUnique({ where: { userId }, select: { regionId: true } });
          if (record?.regionId) return String(record.regionId).trim();
        }
      }
      const userProfile = (this.prisma as any).userProfile;
      if (!userProfile?.findUnique) return '';
      const profile = await userProfile.findUnique({ where: { userId }, select: { regionId: true } });
      return String(profile?.regionId || '').trim();
    } catch (err: any) {
      this.logger.warn(`查询订阅模板所属区域失败: ${err.message}`);
      return '';
    }
  }

  private selectTemplateForRegion<T extends { regionId?: string | null }>(templates: T[], regionId: string): T | undefined {
    return (regionId ? templates.find((item) => item.regionId === regionId) : undefined)
      || templates.find((item) => !item.regionId);
  }

  private normalizeNotificationData(data: Record<string, any>): Record<string, any> {
    const source = data || {};
    const nowText = this.formatWechatDateTime(new Date());
    return {
      ...source,
      orderNo: source.orderNo || source.order_no || source.orderId || source.order_id || '',
      riderName: source.riderName || source.rider_name || source.deliveryName || '骑手',
      riderPhone: source.riderPhone || source.rider_phone || '',
      pickupAddress: source.pickupAddress || source.pickup_address || source.content || '请查看订单详情',
      deliveryAddress: source.deliveryAddress || source.delivery_address || source.content || '请查看订单详情',
      estimatedTime: source.estimatedTime || source.estimated_time || source.time || nowText,
      finishedAt: source.finishedAt || source.finished_at || source.time || nowText,
      abnormalReason: source.abnormalReason || source.reason || source.content || '请查看订单详情',
      suggestion: source.suggestion || source.remark || source.content || '请查看订单详情',
      remark: source.remark || source.content || source.title || '请查看详情',
      actionLabel: source.actionLabel || source.title || '新消息提醒',
      fromNickname: source.fromNickname || source.nickname || source.actorName || '用户',
      contentSummary: source.contentSummary || source.content || source.title || '请查看详情',
      postTitle: source.postTitle || source.title || '校园帖子',
      auditResult: source.auditResult || source.title || '请查看审核结果',
      auditReason: source.auditReason || source.reason || source.content || '请查看详情',
      auditTime: source.auditTime || source.time || nowText,
      time: source.time || nowText,
      notificationTime: source.notificationTime || source.time || nowText,
    };
  }

  private normalizeTemplateValue(templateKey: string, value: any): string {
    if (value === undefined || value === null || value === '') return '';
    if (/^time\d+$/i.test(templateKey)) return this.formatWechatDateTime(value).slice(0, 20);
    if (/^date\d+$/i.test(templateKey)) return this.formatWechatDateTime(value).slice(0, 10);
    const text = String(value).trim();
    if (/^thing\d+$/i.test(templateKey)) return text.slice(0, 20);
    if (/^character_string\d+$/i.test(templateKey)) return text.slice(0, 32);
    if (/^phrase\d+$/i.test(templateKey)) return text.slice(0, 5);
    if (/^name\d+$/i.test(templateKey)) return text.slice(0, 10);
    if (/^phone_number\d+$/i.test(templateKey)) return text.slice(0, 17);
    return text.slice(0, 200);
  }

  private formatWechatDateTime(value: any): string {
    if (typeof value === 'string') {
      const matched = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
      if (matched) {
        const [, year, month, day, hour = '00', minute = '00'] = matched;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute}`;
      }
    }
    const date = value instanceof Date ? value : new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(safeDate);
    const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
  }

  private async writeLog(params: {
    userId?: string;
    openid?: string;
    platformType: string;
    templateType: string;
    templateId: string;
    page?: string;
    data: any;
    status: string;
    errorCode?: string;
    errorMessage?: string;
  }) {
    try {
      await this.prisma.wechatMessageLog.create({
        data: {
          userId: params.userId || null,
          openid: params.openid || null,
          platformType: params.platformType,
          templateType: params.templateType,
          templateId: params.templateId,
          page: params.page || null,
          payload: params.data,
          status: params.status,
          errorCode: params.errorCode || null,
          errorMessage: params.errorMessage || null,
          sentAt: params.status === 'success' ? new Date() : null,
        },
      });
    } catch (e: any) {
      this.logger.warn(`写入发送日志失败: ${e.message}`);
    }
  }
}
