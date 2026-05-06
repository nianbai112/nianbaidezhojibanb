import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import {
  EmailConfigDto, EmailTestDto,
  WebsiteInfoDto,
  WechatTemplateQueryDto, CreateWechatTemplateDto, UpdateWechatTemplateDto, BatchToggleTemplateDto,
  MiniappPageQueryDto, CreateMiniappPageDto, UpdateMiniappPageDto,
  UploadFileQueryDto, BatchDeleteFilesDto,
} from './dto/system-admin.dto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class SystemAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ==================== 邮箱配置 ====================

  async getEmailConfig() {
    let cfg = await this.prisma.emailConfig.findFirst();
    if (!cfg) {
      cfg = await this.prisma.emailConfig.create({
        data: { host: 'smtp.qq.com', port: 465, secure: true, user: '', pass: '' },
      });
    }
    return { ...cfg, pass: cfg.pass ? '******' : '' };
  }

  async saveEmailConfig(dto: EmailConfigDto) {
    const existing = await this.prisma.emailConfig.findFirst();
    const pass = dto.pass === '******' && existing ? existing.pass : dto.pass;
    if (existing) {
      return this.prisma.emailConfig.update({ where: { id: existing.id }, data: { ...dto as any, pass } });
    }
    return this.prisma.emailConfig.create({ data: { ...dto as any, pass } });
  }

  async testEmail(dto: EmailTestDto) {
    const cfg = await this.prisma.emailConfig.findFirst();
    if (!cfg || !cfg.user) throw new BadRequestException('请先配置邮箱');

    const transporter = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: cfg.timeout || 10000,
    });

    try {
      const info = await transporter.sendMail({
        from: cfg.fromEmail || cfg.user,
        to: dto.toEmail,
        subject: dto.subject || '测试邮件',
        html: dto.content || `<p>这是一封测试邮件</p>${cfg.emailSignature || ''}`,
      });
      return { success: true, messageId: info.messageId, response: info.response };
    } catch (e: any) {
      throw new BadRequestException(`发送失败: ${e.message}`);
    }
  }

  // ==================== 网站信息 ====================

  async getWebsiteInfo() {
    const cfg = await this.prisma.config.findUnique({ where: { key: 'website_info' } });
    return cfg?.value || {};
  }

  async saveWebsiteInfo(dto: WebsiteInfoDto) {
    await this.prisma.config.upsert({
      where: { key: 'website_info' },
      create: { key: 'website_info', value: dto as any, group: 'system' },
      update: { value: dto as any },
    });
    await this.redis.del('cache:website_info');
    return { success: true };
  }

  // ==================== 微信模板消息 ====================

  async getTemplateList(q: WechatTemplateQueryDto) {
    const page = q.page || 1, pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.platformType) where.platformType = q.platformType;
    if (q.templateType) where.templateType = q.templateType;

    const [list, total] = await Promise.all([
      this.prisma.wechatTemplateConfig.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.wechatTemplateConfig.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async createTemplate(dto: CreateWechatTemplateDto) {
    return this.prisma.wechatTemplateConfig.create({ data: dto as any });
  }

  async updateTemplate(id: string, dto: UpdateWechatTemplateDto) {
    const tpl = await this.prisma.wechatTemplateConfig.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
    return this.prisma.wechatTemplateConfig.update({ where: { id }, data: dto as any });
  }

  async deleteTemplate(id: string) {
    const tpl = await this.prisma.wechatTemplateConfig.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
    return this.prisma.wechatTemplateConfig.delete({ where: { id } });
  }

  async batchToggleTemplate(dto: BatchToggleTemplateDto) {
    await this.prisma.wechatTemplateConfig.updateMany({
      where: { id: { in: dto.ids } },
      data: { enabled: dto.enabled },
    });
    return { success: true };
  }

  // ==================== 小程序页面路径 ====================

  async getPageList(q: MiniappPageQueryDto) {
    const page = q.page || 1, pageSize = q.pageSize || 50;
    const where: any = {};
    if (q.packageName) where.packageName = q.packageName;
    if (q.keyword) where.path = { contains: q.keyword };

    const [list, total] = await Promise.all([
      this.prisma.miniappPage.findMany({ where, orderBy: [{ packageName: 'asc' }, { sortOrder: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.miniappPage.count({ where }),
    ]);

    // Group by package
    const packages: Record<string, any[]> = {};
    for (const p of list) {
      if (!packages[p.packageName]) packages[p.packageName] = [];
      packages[p.packageName].push(p);
    }

    return { list, total, page, pageSize, packages };
  }

  async createPage(dto: CreateMiniappPageDto) {
    return this.prisma.miniappPage.create({ data: dto as any });
  }

  async updatePage(id: string, dto: UpdateMiniappPageDto) {
    const pg = await this.prisma.miniappPage.findUnique({ where: { id } });
    if (!pg) throw new NotFoundException('页面不存在');
    return this.prisma.miniappPage.update({ where: { id }, data: dto as any });
  }

  async deletePage(id: string) {
    const pg = await this.prisma.miniappPage.findUnique({ where: { id } });
    if (!pg) throw new NotFoundException('页面不存在');
    return this.prisma.miniappPage.delete({ where: { id } });
  }

  // ==================== 文件管理 ====================

  async getFileList(q: UploadFileQueryDto) {
    const page = q.page || 1, pageSize = q.pageSize || 20;
    const where: any = {};
    if (q.fileType) where.fileType = q.fileType;
    if (q.scene) where.scene = q.scene;
    if (q.userId) where.userId = q.userId;
    if (q.keyword) where.fileName = { contains: q.keyword };

    const [list, total] = await Promise.all([
      this.prisma.uploadRecord.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.uploadRecord.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async deleteFile(id: string) {
    const f = await this.prisma.uploadRecord.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('文件不存在');
    return this.prisma.uploadRecord.delete({ where: { id } });
  }

  async batchDeleteFiles(dto: BatchDeleteFilesDto) {
    await this.prisma.uploadRecord.deleteMany({ where: { id: { in: dto.ids } } });
    return { success: true };
  }

  // ==================== 系统配置分组 ====================

  async getConfigByGroup(group: string) {
    const configs = await this.prisma.config.findMany({ where: { group } });
    const result: Record<string, any> = {};
    for (const c of configs) {
      let val = c.value;
      // Mask sensitive keys
      if (typeof val === 'object' && val !== null) {
        const masked: any = {};
        for (const [k, v] of Object.entries(val)) {
          masked[k] = /secret|key|password|token|private|cert/i.test(k) ? '******' : v;
        }
        val = masked;
      }
      result[c.key] = val;
    }
    return result;
  }

  async saveConfigGroup(group: string, configs: Record<string, any>) {
    for (const [key, value] of Object.entries(configs)) {
      // Merge secrets for sensitive fields
      if (typeof value === 'object' && value !== null) {
        const existing = await this.prisma.config.findUnique({ where: { key } });
        if (existing?.value) {
          const merged: any = { ...(existing.value as any) };
          for (const [k, v] of Object.entries(value)) {
            if (v === '******') continue;
            merged[k] = v;
          }
          await this.prisma.config.upsert({ where: { key }, create: { key, value: merged, group }, update: { value: merged } });
          continue;
        }
      }
      await this.prisma.config.upsert({ where: { key }, create: { key, value, group }, update: { value } });
    }
    return { success: true };
  }

  // ==================== 微信文章图片提取 ====================

  async extractArticleImages(url: string) {
    try {
      const https = require('https');
      const http = require('http');
      const mod = url.startsWith('https') ? https : http;

      return new Promise((resolve, reject) => {
        mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => data += chunk);
          res.on('end', () => {
            const images: string[] = [];
            const regex = /data-src="([^"]+)"/g;
            let match;
            while ((match = regex.exec(data)) !== null) {
              if (!images.includes(match[1])) images.push(match[1]);
            }
            const titleMatch = data.match(/<title>([^<]+)<\/title>/);
            resolve({ title: titleMatch?.[1] || '', total: images.length, images });
          });
        }).on('error', reject);
      });
    } catch (e: any) {
      throw new BadRequestException('获取文章失败: ' + e.message);
    }
  }
}
