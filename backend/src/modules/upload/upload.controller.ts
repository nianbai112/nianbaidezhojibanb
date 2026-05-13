import {
  Controller,
  Post,
  Get,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { UploadService, UploadScene } from './upload.service';
import { PrismaService } from '../../common/services/prisma.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('文件上传')
@Controller()
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly prisma: PrismaService,
  ) {}

  // ===========================================================================
  // 用户端上传（JwtGuard → 仅需登录）
  // ===========================================================================

  /**
   * 用户上传图片
   * scene: avatar(2MB) | post(10MB)
   */
  @Post('upload')
  @UseGuards(JwtGuard, ThrottlerGuard)
  @Throttle({ upload_user: { ttl: 60000, limit: 30 } })
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '用户上传图片' })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: string,
    @Body('scene') scene?: UploadScene,
    @Req() req?: Request,
  ) {
    // 用户只能使用 avatar / post 场景
    const safeScene = scene === 'avatar' ? 'avatar' : 'post';
    const folder = this.uploadService.resolveFolder(safeScene, userId);
    const result = await this.uploadService.upload(file, {
      type: 'image',
      folder,
      scene: safeScene,
    });
    await this.uploadService.recordUpload(userId, 'user', result, safeScene, req);
    return result;
  }

  /** 用户批量上传图片 */
  @Post('upload/batch')
  @UseGuards(JwtGuard, ThrottlerGuard)
  @Throttle({ upload_user_batch: { ttl: 60000, limit: 5 } })
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('files', 20))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '用户批量上传图片' })
  async uploadBatch(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') userId: string,
    @Body('scene') scene?: UploadScene,
    @Req() req?: Request,
  ) {
    if (!files || files.length === 0) return { urls: [] };
    const safeScene = scene === 'avatar' ? 'avatar' : 'post';
    const folder = this.uploadService.resolveFolder(safeScene, userId);
    const results = await Promise.all(
      files.map((file) =>
        this.uploadService.upload(file, { type: 'image', folder, scene: safeScene }),
      ),
    );
    for (const r of results) {
      await this.uploadService.recordUpload(userId, 'user', r, safeScene, req);
    }
    return { urls: results.map((item) => item.url), files: results };
  }

  /** 用户上传视频 */
  @Post('upload/upload-video-with-thumbnail')
  @UseGuards(JwtGuard, ThrottlerGuard)
  @Throttle({ upload_video: { ttl: 60000, limit: 5 } })
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '用户上传视频' })
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: string,
    @Req() req?: Request,
  ) {
    const folder = `users/${userId}`;
    const result = await this.uploadService.upload(file, { type: 'video', folder });
    await this.uploadService.recordUpload(userId, 'user', result, 'post', req);
    return result;
  }

  // ===========================================================================
  // 管理端上传（JwtGuard + AdminGuard + AdminPermissionGuard）
  // ===========================================================================

  /**
   * 管理端上传图片（banner、广告、配置等）
   */
  @Post('admin/upload/image')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard, ThrottlerGuard)
  @RequirePermission('upload:admin:image')
  @Throttle({ upload_admin_image: { ttl: 60000, limit: 20 } })
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '管理端上传图片' })
  async adminUploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') adminId: string,
    @Body('scene') scene?: string,
    @Req() req?: Request,
  ) {
    const normalizedScene = String(scene || '').trim();
    const safeScene = (
      normalizedScene.startsWith('region-') || normalizedScene === 'region'
        ? 'region'
        : ['config', 'ad'].includes(normalizedScene)
          ? normalizedScene
          : 'admin'
    ) as UploadScene;
    const folder = this.uploadService.resolveFolder(safeScene, adminId);
    const result = await this.uploadService.upload(file, {
      type: 'image',
      folder,
      scene: safeScene,
    });
    await this.uploadService.recordUpload(adminId, 'admin', result, safeScene, req);
    return result;
  }

  /** 管理端上传视频 */
  @Post('admin/upload/video')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard, ThrottlerGuard)
  @RequirePermission('upload:admin:video')
  @Throttle({ upload_admin_video: { ttl: 60000, limit: 5 } })
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '管理端上传视频' })
  async adminUploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') adminId: string,
    @Req() req?: Request,
  ) {
    const folder = `admin/videos/${adminId}`;
    const result = await this.uploadService.upload(file, { type: 'video', folder });
    await this.uploadService.recordUpload(adminId, 'admin', result, 'admin', req);
    return result;
  }

  /** 生成小程序码（仅管理员） */
  @Post('admin/upload/qrcode')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard, ThrottlerGuard)
  @RequirePermission('upload:admin:qrcode')
  @Throttle({ upload_qrcode: { ttl: 60000, limit: 10 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成微信小程序码' })
  async generateQrcode(@Body() dto: any, @CurrentUser('sub') adminId: string, @Req() req?: Request) {
    const result = await this.uploadService.generateQrcode(dto);
    await this.uploadService.recordUpload(adminId, 'admin', result, 'qrcode', req);
    return result;
  }

  // ============ 新后台兼容接口 ============

  @Get('upload/files')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('upload:admin:image')
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传文件列表（新后台兼容）' })
  async listFiles(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
  ) {
    const where: any = {};
    if (type) where.fileType = type;
    if (keyword) where.fileName = { contains: keyword, mode: 'insensitive' as const };

    const [list, total] = await Promise.all([
      this.prisma.uploadRecord.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.uploadRecord.count({ where }),
    ]);

    return {
      list: list.map((f) => ({
        id: f.id,
        name: f.fileName,
        url: f.url,
        size: f.fileSize,
        type: f.fileType,
        createdAt: f.createdAt,
      })),
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  @Post('upload/unlimited-qrcode')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @RequirePermission('upload:admin:qrcode')
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成无限小程序码（新后台兼容）' })
  async unlimitedQrcode(@Body() dto: any, @CurrentUser('sub') adminId: string, @Req() req?: Request) {
    const result = await this.uploadService.generateQrcode(dto);
    await this.uploadService.recordUpload(adminId, 'admin', result, 'qrcode', req);
    return result;
  }
}
