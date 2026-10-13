import { Body, Controller, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { RequirePermission, RequirePermissionAny } from '../../decorators/require-permission.decorator';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { JwtGuard } from '../../guards/jwt.guard';
import { WechatMomentsService } from './wechat-moments.service';

@ApiTags('朋友圈同步')
@Controller('admin/wechat-moments')
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth()
export class WechatMomentsAdminController {
  constructor(private readonly service: WechatMomentsService) {}

  // ---------------- 接入配置（含密钥，仅系统配置权限） ----------------

  @Get('settings')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '读取接入配置（密钥打码）' })
  settings() {
    return this.service.getSettings();
  }

  @Put('settings')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '保存接入配置（密钥留空=不修改）' })
  saveSettings(@Body() dto: any) {
    return this.service.saveSettings(dto || {});
  }

  @Get('device/specs')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '可用设备规格' })
  deviceSpecs() {
    return this.service.deviceSpecs();
  }

  @Post('device/init')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '创建设备（得到 device_id 并自动保存）' })
  createDevice(@Body() dto: any) {
    return this.service.createDevice(dto?.specKey ? String(dto.specKey) : undefined);
  }

  @Get('login/qr')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '获取登录二维码（图片）' })
  async loginQr(@Res() res: Response) {
    const result = await this.service.loginQr();
    res.setHeader('Cache-Control', 'no-store');
    if ('imageUrl' in result) {
      res.json({ imageUrl: result.imageUrl });
      return;
    }
    res.setHeader('Content-Type', result.mimeType);
    res.send(result.buffer);
  }

  @Get('login/status')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '查询登录状态（协议原始返回）' })
  loginStatus() {
    return this.service.loginStatus();
  }

  @Post('login/push')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '推送到手机确认登录（免扫码）' })
  loginPush() {
    return this.service.loginPush();
  }

  @Post('login/verify')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '新设备滑块验证 ticket 回传' })
  loginVerify(@Body() dto: any) {
    return this.service.submitVerifyTicket(dto?.ticket);
  }

  @Post('callback')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '把本服务的回调地址登记到协议（用于掉线提醒）' })
  setCallback(@Body() dto: any) {
    return this.service.setCallback(dto?.callbackUrl);
  }

  @Post('cdn/test')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '测试图片上传（只上传一张测试图，不发朋友圈）' })
  testImageUpload() {
    return this.service.testImageUpload();
  }

  @Post('callback/resume')
  @RequirePermission('system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '恢复被协议自动暂停的回调推送' })
  resumeCallback() {
    return this.service.resumeWebhook();
  }

  // ---------------- 运行情况 ----------------

  @Get('status')
  @RequirePermissionAny('content:audit', 'audit:view', 'system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '朋友圈同步状态与队列' })
  status() {
    return this.service.overview();
  }

  @Get('batches')
  @RequirePermissionAny('content:audit', 'audit:view', 'system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '发布批次列表（每批 = 一条朋友圈）' })
  batches(@Query() query: any) {
    return this.service.listBatches(query);
  }

  @Get('failed-items')
  @RequirePermissionAny('content:audit', 'audit:view', 'system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '海报生成失败被跳过的帖子' })
  failedItems() {
    return this.service.listFailedItems();
  }

  @Get('preview/:postId')
  @RequirePermissionAny('content:audit', 'audit:view', 'system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '预览某个帖子的朋友圈海报（不发布）' })
  async preview(@Param('postId') postId: string, @Res() res: Response) {
    const poster = await this.service.renderForPost(postId);
    res.setHeader('Content-Type', poster.mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(poster.buffer);
  }

  @Post('run')
  @RequirePermissionAny('content:audit', 'system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '立即执行一次（不等半点）' })
  run() {
    return this.service.runBatch('manual');
  }

  @Post('resume')
  @RequirePermissionAny('content:audit', 'system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '解除暂停' })
  resume() {
    return this.service.resume();
  }

  @Post('batches/:id/confirm')
  @RequirePermissionAny('content:audit', 'system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '结果未知的批次：核对后确认已发出' })
  confirm(@Param('id') id: string) {
    return this.service.confirmBatch(id);
  }

  @Post('batches/:id/requeue')
  @RequirePermissionAny('content:audit', 'system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '结果未知的批次：核对后确认没发出，重新排队' })
  requeue(@Param('id') id: string) {
    return this.service.requeueBatch(id);
  }

  @Post('items/:id/retry')
  @RequirePermissionAny('content:audit', 'system:config')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '海报生成失败的帖子重新排队' })
  retryItem(@Param('id') id: string) {
    return this.service.retryItem(id);
  }
}
