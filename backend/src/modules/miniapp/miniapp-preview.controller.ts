import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MiniappPreviewService } from './miniapp-preview.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';

/** 真机预览：驱动微信开发者工具对真实小程序截图 */
@ApiTags('Admin - Miniapp 真机预览')
@ApiBearerAuth()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller('admin/miniapp/preview')
export class MiniappPreviewController {
  constructor(private readonly previewService: MiniappPreviewService) {}

  @Get('status')
  @ApiOperation({ summary: '真机预览状态' })
  @RequirePermission('system:config')
  getStatus() {
    return this.previewService.getStatus();
  }

  @Post('refresh')
  @ApiOperation({ summary: '对真实小程序当前页面截图' })
  @RequirePermission('system:config')
  refresh() {
    return this.previewService.refresh();
  }

  @Post('navigate')
  @ApiOperation({ summary: '真实小程序跳转指定页面' })
  @RequirePermission('system:config')
  navigate(@Body() body: { pagePath: string }) {
    return this.previewService.navigateTo(body?.pagePath || '');
  }

  @Get('frame')
  @ApiOperation({ summary: '获取实时真机画面帧' })
  @RequirePermission('system:config')
  getFrame() {
    return this.previewService.getFrame();
  }

  @Post('tap')
  @ApiOperation({ summary: '真机画布坐标点按' })
  @RequirePermission('system:config')
  tap(@Body() body: { x: number; y: number }) {
    return this.previewService.tap(Number(body?.x) || 0, Number(body?.y) || 0);
  }

  @Post('swipe')
  @ApiOperation({ summary: '真机画布坐标滑动' })
  @RequirePermission('system:config')
  swipe(@Body() body: { x1: number; y1: number; x2: number; y2: number }) {
    return this.previewService.swipe(
      Number(body?.x1) || 0, Number(body?.y1) || 0,
      Number(body?.x2) || 0, Number(body?.y2) || 0,
    );
  }
}
