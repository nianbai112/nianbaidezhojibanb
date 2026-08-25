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

  async listEnabledTemplates(types?: string[]) {
    const templateTypes = (types || []).map((value) => String(value).trim()).filter(Boolean);
    return this.prisma.wechatTemplateConfig.findMany({
      where: {
        platformType: { in: ['miniprogram', 'miniapp'] },
        enabled: true,
        ...(templateTypes.length ? { templateType: { in: templateTypes } } : {}),
      },
      select: { templateType: true, templateId: true },
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
      const template = await this.prisma.wechatTemplateConfig.findFirst({
        where: { templateType, platformType: { in: ['miniprogram', 'miniapp'] }, enabled: true },
      });

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

      if (!consent || consent.status !== 'accept') {
        await this.writeLog({ userId, openid: user.openid, platformType: 'miniprogram', templateType, templateId: template.templateId, page, data, status: 'failed', errorMessage: '用户未授权或授权已使用' });
        return { success: false, error: '用户未授权或授权已使用' };
      }

      // 4. 构建发送数据
      const fieldMapping = (template.fieldMapping || {}) as Record<string, string>;
      const templateData: Record<string, any> = {};
      for (const [templateKey, dataKey] of Object.entries(fieldMapping)) {
        if (data[dataKey] !== undefined) {
          templateData[templateKey] = { value: String(data[dataKey]) };
        }
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
          where: { userId: log.userId, templateType: log.templateType, status: 'accept' },
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
