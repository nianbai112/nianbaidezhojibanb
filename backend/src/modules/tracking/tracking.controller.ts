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
import { Request } from 'express';
import { TrackingService } from './tracking.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('埋点追踪')
@Controller()
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('api/tracking/events')
  @ApiOperation({ summary: '上报单个事件' })
  trackEvent(@Body() body: any, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = req.headers['user-agent'] || '';
    return this.trackingService.trackEvent({ ...body, ip, ua });
  }

  @Post('api/tracking/batch')
  @ApiOperation({ summary: '批量上报事件' })
  trackBatch(@Body() body: { events: any[] }, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = req.headers['user-agent'] || '';
    return this.trackingService.trackBatch(body.events, ip, ua);
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
