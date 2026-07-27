import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import * as nodemailer from 'nodemailer';

/**
 * AUD-P1-170: 通知渠道服务 - 处理邮件和短信发送
 */
@Injectable()
export class NotificationChannelService {
  private readonly logger = new Logger(NotificationChannelService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 发送邮件通知
   */
  async sendEmail(to: string, subject: string, content: string): Promise<boolean> {
    try {
      const config = await this.getEmailConfig();
      if (!config) {
        this.logger.warn('邮件配置未设置，跳过邮件发送');
        return false;
      }

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });

      await transporter.sendMail({
        from: `"${config.fromName || '灵萌生活'}" <${config.fromEmail || config.user}>`,
        to,
        subject,
        html: content,
      });

      this.logger.log(`邮件已发送至 ${to}`);
      return true;
    } catch (error: any) {
      this.logger.error(`邮件发送失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 发送短信通知
   */
  async sendSms(phone: string, content: string): Promise<boolean> {
    try {
      const smsConfig = await this.getSmsConfig();
      if (!smsConfig?.provider) {
        this.logger.warn('短信配置未设置，跳过短信发送');
        return false;
      }

      if (smsConfig.provider === 'aliyun') {
        return await this.sendAliyunSms(phone, content, smsConfig);
      }

      this.logger.warn(`短信服务商 ${smsConfig.provider} 暂不支持`);
      return false;
    } catch (error: any) {
      this.logger.error(`短信发送失败: ${error.message}`);
      return false;
    }
  }

  async resolveChannelMask<T extends Record<string, boolean | undefined>>(
    mask: T,
    type?: string,
    scene?: string,
  ): Promise<T & { email: boolean; sms: false }> {
    const config = await this.getNotificationConfig();
    const email = mask.email ?? (Boolean(config.emailEnabled) && this.isSceneEnabled(config, type, scene));

    return {
      ...mask,
      email,
      // Operational SMS needs a dedicated approved template and a provider response.
      sms: false,
    } as T & { email: boolean; sms: false };
  }

  /**
   * 获取邮件配置
   */
  private async getEmailConfig(): Promise<any> {
    const config = await this.prisma.config.findUnique({
      where: { key: 'email_config' },
    });
    return config?.value || null;
  }

  private async getNotificationConfig(): Promise<Record<string, any>> {
    const config = await this.prisma.config.findUnique({ where: { key: 'notification' } });
    return (config?.value || {}) as Record<string, any>;
  }

  private isSceneEnabled(config: Record<string, any>, type?: string, scene?: string): boolean {
    const key = `${type || ''} ${scene || ''}`.toUpperCase();
    if (key.includes('ORDER')) return config.orderPaymentNotice !== false;
    if (key.includes('MERCHANT')) return config.merchantJoinNotice !== false;
    if (key.includes('REFUND')) return config.refundNotice !== false;
    if (key.includes('REPORT')) return config.reportNotice !== false;
    if (key.includes('DELIVERY')) return config.deliveryTimeoutNotice !== false;
    if (key.includes('SYSTEM') || key.includes('ADMIN_BROADCAST') || key.includes('ANNOUNCEMENT')) {
      return config.systemAlertNotice !== false;
    }
    return false;
  }

  /**
   * 获取短信配置
   */
  private async getSmsConfig(): Promise<any> {
    const config = await this.prisma.config.findUnique({
      where: { key: 'sms' },
    });
    const value = (config?.value || {}) as Record<string, any>;
    return {
      provider: value.provider || process.env.SMS_PROVIDER || '',
      accessKeyId: value.accessKeyId || process.env.ALIYUN_SMS_ACCESS_KEY_ID || '',
      accessKeySecret: value.accessKeySecret || process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || '',
      signName: value.signName || process.env.ALIYUN_SMS_SIGN_NAME || '',
      templateCode: value.templateCode || process.env.ALIYUN_SMS_TEMPLATE_CODE || '',
      endpoint: value.endpoint || process.env.ALIYUN_SMS_ENDPOINT || 'dysmsapi.aliyuncs.com',
    };
  }

  /**
   * 阿里云短信发送
   */
  private async sendAliyunSms(phone: string, content: string, config: any): Promise<boolean> {
    this.logger.warn(`阿里云运营短信尚未接入，未发送至 ${phone}`);
    return false;
  }

  /**
   * 获取管理员接收人邮箱列表
   */
  async getAdminNotifyEmails(): Promise<string[]> {
    try {
      const config = await this.prisma.config.findUnique({
        where: { key: 'notification' },
      });
      const value = (config?.value || {}) as Record<string, any>;

      if (!value.adminNotifyReceivers) return [];

      // 解析接收人（支持逗号分隔或数组）
      const receivers = Array.isArray(value.adminNotifyReceivers)
        ? value.adminNotifyReceivers
        : String(value.adminNotifyReceivers).split(',').map((s: string) => s.trim()).filter(Boolean);

      // 获取管理员邮箱
      const admins = await this.prisma.adminAccount.findMany({
        where: {
          id: { in: receivers },
          status: 'active',
          deletedAt: null,
        },
        select: { email: true },
      });

      return admins.map(a => a.email).filter((e): e is string => Boolean(e));
    } catch {
      return [];
    }
  }

  /**
   * 检查通知渠道是否启用
   */
  async isChannelEnabled(channel: 'email' | 'sms', type?: string): Promise<boolean> {
    try {
      const value = await this.getNotificationConfig();

      if (channel === 'email') {
        return Boolean(value.emailEnabled);
      }
      if (channel === 'sms') {
        return Boolean(value.smsEnabled);
      }
      return false;
    } catch {
      return false;
    }
  }
}
