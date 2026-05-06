import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  Body,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation, ApiBody } from '@nestjs/swagger';
import { UploadService, UploadScene } from './upload.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('文件上传')
@Controller()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * 上传图片
   *
   * scene 可选值（默认为 'post'）:
   *   - 'avatar'  头像上传，最大 2MB
   *   - 'post'    帖子/内容图片，最大 10MB
   *   - 'admin'   后台通用上传
   *   - 'region'  区域封面
   *   - 'config'  系统配置图片（Logo 等）
   *   - 'ad'      广告图片
   */
  @Post('upload')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传图片（支持头像/帖子/后台场景）' })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: string,
    @Body('scene') scene?: UploadScene,
  ) {
    const folder = this.uploadService.resolveFolder(scene || 'post', userId);
    return this.uploadService.upload(file, {
      type: 'image',
      folder,
      scene: scene || 'post',
    });
  }

  @Post('upload/batch')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('files', 20))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '批量上传图片' })
  async uploadBatch(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') userId: string,
    @Body('scene') scene?: UploadScene,
  ) {
    if (!files || files.length === 0) {
      return { urls: [] };
    }
    const folder = this.uploadService.resolveFolder(scene || 'post', userId);
    const results = await Promise.all(
      files.map((file) => this.uploadService.upload(file, {
        type: 'image',
        folder,
        scene: scene || 'post',
      })),
    );
    return { urls: results.map((item) => item.url), files: results };
  }

  /**
   * 上传视频
   */
  @Post('upload/upload-video-with-thumbnail')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传视频' })
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: string,
  ) {
    return this.uploadService.upload(file, {
      type: 'video',
      folder: `users/${userId}`,
    });
  }

  /**
   * 生成小程序码（待接入）
   */
  @Post('upload/unlimited-qrcode')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成微信小程序码' })
  async generateQrcode(@Body() dto: any) {
    return this.uploadService.generateQrcode(dto);
  }
}
