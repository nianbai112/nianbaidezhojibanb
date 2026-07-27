import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { TrackingService } from './tracking.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { OptionalAuthGuard } from '../../guards/optional-auth.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('埋点追踪')
@Controller()
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('tracking/events')
  @UseGuards(OptionalAuthGuard, ThrottlerGuard)
  @Throttle({ auth: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: '上报单个事件' })
  trackEvent(@Body() body: any, @Req() req: Request, @CurrentUser('sub') userId?: string) {
    return this.handleTrackEvent(body, req, userId);
  }

  @Post('api/tracking/events')
  @UseGuards(OptionalAuthGuard, ThrottlerGuard)
  @Throttle({ auth: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: '上报单个事件（旧路径兼容）' })
  trackEventLegacy(@Body() body: any, @Req() req: Request, @CurrentUser('sub') userId?: string) {
    return this.handleTrackEvent(body, req, userId);
  }

  private handleTrackEvent(body: any, req: Request, userId?: string) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = req.headers['user-agent'] || '';
    const rest = { ...(body || {}) };
    delete rest.userId;
    delete rest.user_id;
    delete rest.regionId;
    delete rest.region_id;
    return this.trackingService.trackEvent({ ...rest, ip, ua }, userId);
  }

  @Post('tracking/batch')
  @UseGuards(OptionalAuthGuard, ThrottlerGuard)
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: '批量上报事件' })
  trackBatch(@Body() body: { events: any[] }, @Req() req: Request, @CurrentUser('sub') userId?: string) {
    return this.handleTrackBatch(body, req, userId);
  }

  @Post('api/tracking/batch')
  @UseGuards(OptionalAuthGuard, ThrottlerGuard)
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: '批量上报事件（旧路径兼容）' })
  trackBatchLegacy(@Body() body: { events: any[] }, @Req() req: Request, @CurrentUser('sub') userId?: string) {
    return this.handleTrackBatch(body, req, userId);
  }

  private handleTrackBatch(body: { events: any[] }, req: Request, userId?: string) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = req.headers['user-agent'] || '';
    return this.trackingService.trackBatch(body?.events, ip, ua, userId);
  }

  @Get('admin/tracking/events')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '查询事件列表' })
  getEvents(@Query() query: any) {
    return this.trackingService.getEvents(query);
  }

  @Get('admin/tracking/funnel')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '漏斗分析' })
  getFunnel(@Query() query: any) {
    return this.trackingService.getFunnel(query);
  }

  @Get('admin/tracking/path-analysis')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '路径分析' })
  getPathAnalysis(@Query() query: any) {
    return this.trackingService.getPathAnalysis(query);
  }

  @Get('admin/tracking/page-heatmap')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '页面热力图' })
  getPageHeatmap(@Query() query: any) {
    return this.trackingService.getPageHeatmap(query);
  }

  @Get('admin/tracking/search-keywords')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '搜索关键词分析' })
  getSearchKeywords(@Query() query: any) {
    return this.trackingService.getSearchKeywords(query);
  }
}
