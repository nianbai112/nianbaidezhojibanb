import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { PostService } from '../post/post.service';
import { UploadService } from '../upload/upload.service';
import { ContentExtService } from '../content-ext/content-ext.service';

@Injectable()
export class PostShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postService: PostService,
    private readonly uploadService: UploadService,
    private readonly contentExtService: ContentExtService,
  ) {}

  async createLink(userId: string, postId: string, options: { channel?: string } = {}) {
    const post: any = await this.postService.detail(postId, userId);
    const template: any = await this.contentExtService.getPosterConfig();
    const templateVersion = Number(template?.version || 1);
    const link = await (this.prisma as any).postShareLink.findFirst({
      where: {
        postId: post.id,
        sharerId: userId,
        templateVersion,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (link) {
      return {
        code: link.code,
        postId: link.postId,
        regionId: link.regionId,
        qrcodeUrl: link.qrcodeUrl || '',
        template,
      };
    }

    const channel = String(options.channel || 'wx_friend').trim() || 'wx_friend';
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const code = randomBytes(6).toString('base64url');
    const created = await (this.prisma as any).postShareLink.create({
      data: {
        code,
        postId: post.id,
        sharerId: userId,
        regionId: post.region_id || post.regionId || null,
        channel,
        templateVersion,
        expiresAt,
      },
    });
    const qrcode = await this.uploadService.generateQrcode({
      scene: `s=${code}`,
      page: 'pagesB/post/post',
      width: 430,
      checkPath: true,
    });
    const completed = await (this.prisma as any).postShareLink.update({
      where: { id: created.id },
      data: { qrcodeUrl: qrcode.url },
    });
    return {
      code: completed.code,
      postId: completed.postId,
      regionId: completed.regionId,
      qrcodeUrl: completed.qrcodeUrl || qrcode.url,
      path: `/pagesB/post/post?shareCode=${encodeURIComponent(completed.code)}`,
      template,
    };
  }

  async resolve(code: string, meta: { visitorId?: string; ip?: string; userAgent?: string } = {}) {
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) throw new BadRequestException('缺少分享码');
    const link = await (this.prisma as any).postShareLink.findUnique({ where: { code: normalizedCode } });
    if (!link || link.status !== 'ACTIVE' || new Date(link.expiresAt).getTime() <= Date.now()) {
      throw new NotFoundException('分享链接已失效');
    }
    const visitorId = String(meta.visitorId || '').trim().slice(0, 160);
    if (visitorId) {
      await (this.prisma as any).postShareVisit.upsert({
        where: { linkId_visitorId: { linkId: link.id, visitorId } },
        create: {
          linkId: link.id,
          visitorId,
          ip: String(meta.ip || '').trim().slice(0, 120) || null,
          userAgent: String(meta.userAgent || '').trim().slice(0, 500) || null,
        },
        update: {},
      });
    }
    await (this.prisma as any).postShareLink.updateMany?.({
      where: { id: link.id, openedAt: null },
      data: { openedAt: new Date() },
    });
    return { postId: link.postId, code: link.code, regionId: link.regionId || '' };
  }
}
