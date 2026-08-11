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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { UploadFileKind, UploadService, UploadScene } from './upload.service';
import { PrismaService } from '../../common/services/prisma.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

const uploadUserLimit = parseInt(process.env.UPLOAD_USER_THROTTLE_LIMIT || '180', 10);
const uploadBatchLimit = parseInt(process.env.UPLOAD_BATCH_THROTTLE_LIMIT || '30', 10);
const uploadVideoLimit = parseInt(process.env.UPLOAD_VIDEO_THROTTLE_LIMIT || '20', 10);
const uploadAdminImageLimit = parseInt(process.env.UPLOAD_ADMIN_IMAGE_THROTTLE_LIMIT || '180', 10);
const uploadAdminVideoLimit = parseInt(process.env.UPLOAD_ADMIN_VIDEO_THROTTLE_LIMIT || '20', 10);
const uploadQrcodeLimit = parseInt(process.env.UPLOAD_QRCODE_THROTTLE_LIMIT || '60', 10);

const skipExceptUserUpload = {
  auth: true,
  admin_auth: true,
  upload_user_batch: true,
  upload_video: true,
  upload_admin_image: true,
  upload_admin_video: true,
  upload_qrcode: true,
};
const skipExceptBatchUpload = {
  auth: true,
  admin_auth: true,
  upload_user: true,
  upload_video: true,
  upload_admin_image: true,
  upload_admin_video: true,
  upload_qrcode: true,
};
const skipExceptVideoUpload = {
  auth: true,
  admin_auth: true,
  upload_user: true,
  upload_user_batch: true,
  upload_admin_image: true,
  upload_admin_video: true,
  upload_qrcode: true,
};
const skipExceptAdminImageUpload = {
  auth: true,
  admin_auth: true,
  upload_user: true,
  upload_user_batch: true,
  upload_video: true,
  upload_admin_video: true,
  upload_qrcode: true,
};
const skipExceptAdminVideoUpload = {
  auth: true,
  admin_auth: true,
  upload_user: true,
  upload_user_batch: true,
  upload_video: true,
  upload_admin_image: true,
  upload_qrcode: true,
};
const skipExceptQrcodeUpload = {
  auth: true,
  admin_auth: true,
  upload_user: true,
  upload_user_batch: true,
  upload_video: true,
  upload_admin_image: true,
  upload_admin_video: true,
};

@ApiTags('文件上传')
@Controller()
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly prisma: PrismaService,
  ) {}

  private resolveUserUploadKind(file: Express.Multer.File): UploadFileKind {
    const mimetype = String(file?.mimetype || '').toLowerCase();
    const ext = String(file?.originalname || '').split('.').pop()?.toLowerCase() || '';
    if (mimetype.startsWith('audio/') || ['mp3', 'aac', 'm4a', 'amr', 'wav'].includes(ext)) return 'audio';
    if (mimetype.startsWith('video/') || ['mp4', 'mov', 'webm'].includes(ext)) return 'video';
    return 'image';
  }

  // ===========================================================================
  // 用户端上传（JwtGuard → 仅需登录）
  // ===========================================================================

  /**
   * 用户上传图片/语音
   * scene: avatar(2MB) | post(10MB) | message(20MB)
   */
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard, ThrottlerGuard)
  @SkipThrottle(skipExceptUserUpload)
  @Throttle({ upload_user: { ttl: 60000, limit: uploadUserLimit } })
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '用户上传图片/语音' })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: string,
    @Body('scene') scene?: UploadScene,
    @Req() req?: Request,
  ) {
    // 用户只能使用 avatar / post / message 场景
    const uploadKind = this.resolveUserUploadKind(file);
    const safeScene = uploadKind === 'audio' || scene === 'message'
      ? 'message'
      : scene === 'avatar'
        ? 'avatar'
        : 'post';
    const folder = this.uploadService.resolveFolder(safeScene, userId);
    const result = await this.uploadService.upload(file, {
      type: uploadKind,
      folder,
      scene: safeScene,
    });
    await this.uploadService.recordUpload(userId, 'user', result, safeScene, req);
    return result;
  }

  /** 用户批量上传图片 */
  @Post('upload/batch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard, ThrottlerGuard)
  @SkipThrottle(skipExceptBatchUpload)
  @Throttle({ upload_user_batch: { ttl: 60000, limit: uploadBatchLimit } })
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
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard, ThrottlerGuard)
  @SkipThrottle(skipExceptVideoUpload)
  @Throttle({ upload_video: { ttl: 60000, limit: uploadVideoLimit } })
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
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard, ThrottlerGuard)
  @RequirePermission('upload:admin:image')
  @SkipThrottle(skipExceptAdminImageUpload)
  @Throttle({ upload_admin_image: { ttl: 60000, limit: uploadAdminImageLimit } })
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
        : ['config', 'ad', 'marketing-popup', 'share-invite'].includes(normalizedScene)
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
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard, ThrottlerGuard)
  @RequirePermission('upload:admin:video')
  @SkipThrottle(skipExceptAdminVideoUpload)
  @Throttle({ upload_admin_video: { ttl: 60000, limit: uploadAdminVideoLimit } })
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
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard, ThrottlerGuard)
  @RequirePermission('upload:admin:qrcode')
  @SkipThrottle(skipExceptQrcodeUpload)
  @Throttle({ upload_qrcode: { ttl: 60000, limit: uploadQrcodeLimit } })
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
    if (keyword) where.fileName = { contains: keyword };

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
  @HttpCode(HttpStatus.OK)
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
