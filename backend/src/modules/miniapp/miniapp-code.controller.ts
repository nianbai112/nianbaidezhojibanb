import { Controller, Get, Put, Post, Delete, Body, Param, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { MiniappCodeService } from './miniapp-code.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';

/**
 * 小程序源码包管理：信息、打包下载、主题变量、app.json 受限编辑。
 * 直接操作 MINIAPP_SOURCE_DIR（默认 ~/Desktop/前端文件）。
 */
@ApiTags('Admin - Miniapp 代码包')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/miniapp/code')
export class MiniappCodeController {
  constructor(private readonly codeService: MiniappCodeService) {}

  @Get('info')
  @ApiOperation({ summary: '小程序源码包信息' })
  @RequirePermission('system:config')
  getInfo() {
    return this.codeService.getCodeInfo();
  }

  @Get('export')
  @ApiOperation({ summary: '打包下载小程序源码 zip' })
  @RequirePermission('system:config')
  exportZip(@Res() res: Response) {
    return this.codeService.exportZip(res);
  }

  @Get('theme')
  @ApiOperation({ summary: '读取 app.wxss 主题变量' })
  @RequirePermission('system:config')
  getTheme() {
    return this.codeService.getTheme();
  }

  @Put('theme')
  @ApiOperation({ summary: '更新 app.wxss 主题变量（自动备份）' })
  @RequirePermission('system:config')
  updateTheme(@Body() body: { vars: Array<{ name: string; value: string }> }) {
    return this.codeService.updateTheme(body?.vars);
  }

  @Get('app-json')
  @ApiOperation({ summary: '读取 app.json 可编辑字段' })
  @RequirePermission('system:config')
  getAppJson() {
    return this.codeService.getAppJson();
  }

  @Get('source-file')
  @ApiOperation({ summary: '读取小程序源文件（wxml/wxss/js/json，只读，沙盒在源码目录内）' })
  @RequirePermission('system:config')
  getSourceFile(@Query('path') path: string) {
    return this.codeService.getSourceFile(path);
  }
  @Put('app-json')
  @ApiOperation({ summary: '更新 app.json 受限字段（自动备份）' })
  @RequirePermission('system:config')
  updateAppJson(@Body() body: Record<string, any>) {
    return this.codeService.updateAppJson(body);
  }

  // ==================== 代码包素材库（static/editor） ====================

  @Get('assets')
  @ApiOperation({ summary: '列出代码包素材（static/editor）' })
  @RequirePermission('system:config')
  listAssets() {
    return this.codeService.listAssets();
  }

  @Post('assets')
  @ApiOperation({ summary: '上传素材到代码包 static/editor（base64）' })
  @RequirePermission('system:config')
  saveAsset(@Body() body: { name: string; base64: string }) {
    return this.codeService.saveAsset(body?.name, body?.base64);
  }

  @Delete('assets/:name')
  @ApiOperation({ summary: '删除代码包素材' })
  @RequirePermission('system:config')
  deleteAsset(@Param('name') name: string) {
    return this.codeService.deleteAsset(name);
  }
}
