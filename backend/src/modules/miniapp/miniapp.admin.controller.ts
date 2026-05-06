import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MiniappService } from './miniapp.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { MiniappQrcodeDto, MiniappPagePathDto, SubscribeMsgTemplateDto } from './dto/miniapp.admin.dto';

@ApiTags('Admin - Miniapp')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/miniapp')
export class MiniappAdminController {
  constructor(private readonly miniappService: MiniappService) {}

  // =================== 版本上传记录 ===================
  @Get('version')
  @ApiOperation({ summary: '获取小程序版本信息' })
  @RequirePermission('system:config')
  getVersionInfo() {
    return this.miniappService.getVersionInfo();
  }

  @Post('version/upload')
  @ApiOperation({ summary: '记录版本上传信息' })
  @RequirePermission('system:config')
  recordUpload(@Body() dto: any) {
    return this.miniappService.recordUpload(dto);
  }

  // =================== 小程序码管理 ===================
  @Post('qrcode')
  @ApiOperation({ summary: '生成小程序码' })
  @RequirePermission('system:config')
  generateQrcode(@Body() dto: MiniappQrcodeDto) {
    return this.miniappService.generateQrcode(dto);
  }

  // =================== 页面路径管理 ===================
  @Get('pages')
  @ApiOperation({ summary: '获取页面路径列表' })
  @RequirePermission('system:config')
  getPagePaths() {
    return this.miniappService.getPagePaths();
  }

  @Put('pages')
  @ApiOperation({ summary: '更新页面路径列表' })
  @RequirePermission('system:config')
  updatePagePaths(@Body() body: { paths: any[] }) {
    return this.miniappService.updatePagePaths(body.paths);
  }

  // =================== 订阅消息模板 ===================
  @Get('subscribe-templates')
  @ApiOperation({ summary: '获取订阅消息模板列表' })
  @RequirePermission('system:config')
  getSubscribeTemplates() {
    return this.miniappService.getSubscribeTemplates();
  }

  @Post('subscribe-templates')
  @ApiOperation({ summary: '添加订阅消息模板' })
  @RequirePermission('system:config')
  addSubscribeTemplate(@Body() dto: SubscribeMsgTemplateDto) {
    return this.miniappService.addSubscribeTemplate(dto);
  }

  @Delete('subscribe-templates/:priTmplId')
  @ApiOperation({ summary: '删除订阅消息模板' })
  @RequirePermission('system:config')
  deleteSubscribeTemplate(@Param('priTmplId') priTmplId: string) {
    return this.miniappService.deleteSubscribeTemplate(priTmplId);
  }
}
