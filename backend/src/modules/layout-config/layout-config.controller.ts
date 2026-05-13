import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { LayoutConfigService } from './layout-config.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('页面布局配置')
@Controller('admin/layout')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class LayoutConfigController {
  constructor(private readonly layoutConfigService: LayoutConfigService) {}

  // ==================== 首页布局 ====================

  @Get('home/:regionId')
  @RequirePermission('layout:view')
  @ApiOperation({ summary: '获取首页布局配置' })
  getHomeLayout(@Param('regionId') regionId: string) {
    return this.layoutConfigService.getLayout('home', regionId);
  }

  @Put('home/:regionId')
  @RequirePermission('layout:edit')
  @ApiOperation({ summary: '保存首页布局草稿' })
  saveHomeLayout(
    @Param('regionId') regionId: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.layoutConfigService.saveDraft('home', regionId, body, operatorId, ip);
  }

  @Post('home/:regionId/preview')
  @RequirePermission('layout:edit')
  @ApiOperation({ summary: '预览首页布局' })
  previewHomeLayout(
    @Param('regionId') regionId: string,
    @Body() body: any,
  ) {
    return this.layoutConfigService.preview('home', regionId, body);
  }

  @Post('home/:regionId/publish')
  @RequirePermission('layout:publish')
  @ApiOperation({ summary: '发布首页布局' })
  publishHomeLayout(
    @Param('regionId') regionId: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.layoutConfigService.publish('home', regionId, operatorId, ip);
  }

  @Post('home/:regionId/rollback')
  @RequirePermission('layout:publish')
  @ApiOperation({ summary: '回滚首页布局' })
  rollbackHomeLayout(
    @Param('regionId') regionId: string,
    @Body() body: { versionId: string },
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.layoutConfigService.rollback('home', regionId, body.versionId, operatorId, ip);
  }

  @Get('home/:regionId/versions')
  @RequirePermission('layout:view')
  @ApiOperation({ summary: '获取首页布局版本历史' })
  getHomeVersions(
    @Param('regionId') regionId: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.layoutConfigService.getVersions('home', regionId, page || 1, pageSize || 20);
  }

  // ==================== 消息页布局 ====================

  @Get('message/:regionId')
  @RequirePermission('layout:view')
  @ApiOperation({ summary: '获取消息页布局配置' })
  getMessageLayout(@Param('regionId') regionId: string) {
    return this.layoutConfigService.getLayout('message', regionId);
  }

  @Put('message/:regionId')
  @RequirePermission('layout:edit')
  @ApiOperation({ summary: '保存消息页布局草稿' })
  saveMessageLayout(
    @Param('regionId') regionId: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.layoutConfigService.saveDraft('message', regionId, body, operatorId, ip);
  }

  @Post('message/:regionId/preview')
  @RequirePermission('layout:edit')
  @ApiOperation({ summary: '预览消息页布局' })
  previewMessageLayout(
    @Param('regionId') regionId: string,
    @Body() body: any,
  ) {
    return this.layoutConfigService.preview('message', regionId, body);
  }

  @Post('message/:regionId/publish')
  @RequirePermission('layout:publish')
  @ApiOperation({ summary: '发布消息页布局' })
  publishMessageLayout(
    @Param('regionId') regionId: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.layoutConfigService.publish('message', regionId, operatorId, ip);
  }

  // ==================== 我的页面布局 ====================

  @Get('profile/:regionId')
  @RequirePermission('layout:view')
  @ApiOperation({ summary: '获取我的页面布局配置' })
  getProfileLayout(@Param('regionId') regionId: string) {
    return this.layoutConfigService.getLayout('profile', regionId);
  }

  @Put('profile/:regionId')
  @RequirePermission('layout:edit')
  @ApiOperation({ summary: '保存我的页面布局草稿' })
  saveProfileLayout(
    @Param('regionId') regionId: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.layoutConfigService.saveDraft('profile', regionId, body, operatorId, ip);
  }

  @Post('profile/:regionId/preview')
  @RequirePermission('layout:edit')
  @ApiOperation({ summary: '预览我的页面布局' })
  previewProfileLayout(
    @Param('regionId') regionId: string,
    @Body() body: any,
  ) {
    return this.layoutConfigService.preview('profile', regionId, body);
  }

  @Post('profile/:regionId/publish')
  @RequirePermission('layout:publish')
  @ApiOperation({ summary: '发布我的页面布局' })
  publishProfileLayout(
    @Param('regionId') regionId: string,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.layoutConfigService.publish('profile', regionId, operatorId, ip);
  }
}
