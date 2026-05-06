import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { SystemAdminService } from './system-admin.service';
import {
  EmailConfigDto, EmailTestDto,
  WebsiteInfoDto,
  WechatTemplateQueryDto, CreateWechatTemplateDto, UpdateWechatTemplateDto, BatchToggleTemplateDto,
  MiniappPageQueryDto, CreateMiniappPageDto, UpdateMiniappPageDto,
  UploadFileQueryDto, BatchDeleteFilesDto,
  WechatArticleImageDto,
} from './dto/system-admin.dto';

@ApiTags('系统管理')
@Controller('admin')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class SystemAdminController {
  constructor(private readonly svc: SystemAdminService) {}

  // ==================== 邮箱配置 ====================

  @Get('email-config')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '获取邮箱配置' })
  getEmailConfig() { return this.svc.getEmailConfig(); }

  @Put('email-config')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '保存邮箱配置' })
  saveEmailConfig(@Body() dto: EmailConfigDto) { return this.svc.saveEmailConfig(dto); }

  @Post('email-config/test')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '测试发送邮件' })
  testEmail(@Body() dto: EmailTestDto) { return this.svc.testEmail(dto); }

  // ==================== 网站信息 ====================

  @Get('website-info')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '获取网站信息' })
  getWebsiteInfo() { return this.svc.getWebsiteInfo(); }

  @Put('website-info')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '保存网站信息' })
  saveWebsiteInfo(@Body() dto: WebsiteInfoDto) { return this.svc.saveWebsiteInfo(dto); }

  // ==================== 微信模板消息 ====================

  @Get('wechat-templates')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '模板消息列表' })
  getTemplateList(@Query() q: WechatTemplateQueryDto) { return this.svc.getTemplateList(q); }

  @Post('wechat-templates')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '创建模板消息' })
  createTemplate(@Body() dto: CreateWechatTemplateDto) { return this.svc.createTemplate(dto); }

  @Put('wechat-templates/:id')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '更新模板消息' })
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateWechatTemplateDto) { return this.svc.updateTemplate(id, dto); }

  @Delete('wechat-templates/:id')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '删除模板消息' })
  deleteTemplate(@Param('id') id: string) { return this.svc.deleteTemplate(id); }

  @Put('wechat-templates/batch-toggle')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '批量启用/停用' })
  batchToggleTemplate(@Body() dto: BatchToggleTemplateDto) { return this.svc.batchToggleTemplate(dto); }

  // ==================== 小程序页面路径 ====================

  @Get('miniapp-pages')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '小程序页面列表' })
  getPageList(@Query() q: MiniappPageQueryDto) { return this.svc.getPageList(q); }

  @Post('miniapp-pages')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '新增页面' })
  createPage(@Body() dto: CreateMiniappPageDto) { return this.svc.createPage(dto); }

  @Put('miniapp-pages/:id')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '更新页面' })
  updatePage(@Param('id') id: string, @Body() dto: UpdateMiniappPageDto) { return this.svc.updatePage(id, dto); }

  @Delete('miniapp-pages/:id')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '删除页面' })
  deletePage(@Param('id') id: string) { return this.svc.deletePage(id); }

  // ==================== 文件管理 ====================

  @Get('upload-files')
  @RequirePermission('system:upload')
  @ApiOperation({ summary: '文件列表' })
  getFileList(@Query() q: UploadFileQueryDto) { return this.svc.getFileList(q); }

  @Delete('upload-files/:id')
  @RequirePermission('system:upload')
  @ApiOperation({ summary: '删除文件' })
  deleteFile(@Param('id') id: string) { return this.svc.deleteFile(id); }

  @Post('upload-files/batch-delete')
  @RequirePermission('system:upload')
  @ApiOperation({ summary: '批量删除文件' })
  batchDeleteFiles(@Body() dto: BatchDeleteFilesDto) { return this.svc.batchDeleteFiles(dto); }

  // ==================== 系统配置分组 ====================

  @Get('config-group/:group')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '按分组获取配置' })
  getConfigByGroup(@Param('group') group: string) { return this.svc.getConfigByGroup(group); }

  @Put('config-group/:group')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '按分组保存配置' })
  saveConfigGroup(@Param('group') group: string, @Body() configs: Record<string, any>) {
    return this.svc.saveConfigGroup(group, configs);
  }

  // ==================== 微信文章图片 ====================

  @Post('wechat-article-images')
  @RequirePermission('system:config')
  @ApiOperation({ summary: '提取微信文章图片' })
  extractArticleImages(@Body() dto: WechatArticleImageDto) { return this.svc.extractArticleImages(dto.url); }
}
