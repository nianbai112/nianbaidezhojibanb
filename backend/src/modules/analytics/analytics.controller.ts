import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';

@ApiTags('数据分析')
@Controller('admin/analytics')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '数据概览' })
  getOverview(@Query() query: any) {
    return this.analyticsService.getOverview(query);
  }

  @Get('users')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '用户分析' })
  getUserAnalytics(@Query() query: any) {
    return this.analyticsService.getUserAnalytics(query);
  }

  @Get('content')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '内容分析' })
  getContentAnalytics(@Query() query: any) {
    return this.analyticsService.getContentAnalytics(query);
  }

  @Get('orders')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '订单分析' })
  getOrderAnalytics(@Query() query: any) {
    return this.analyticsService.getOrderAnalytics(query);
  }

  @Get('finance')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '财务分析' })
  getFinanceAnalytics(@Query() query: any) {
    return this.analyticsService.getFinanceAnalytics(query);
  }

  @Get('regions')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '区域分析' })
  getRegionAnalytics(@Query() query: any) {
    return this.analyticsService.getRegionAnalytics(query);
  }

  @Get('merchants')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '商家分析' })
  getMerchantAnalytics(@Query() query: any) {
    return this.analyticsService.getMerchantAnalytics(query);
  }

  @Get('riders')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '骑手分析' })
  getRiderAnalytics(@Query() query: any) {
    return this.analyticsService.getRiderAnalytics(query);
  }

  @Get('funnel')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '转化漏斗' })
  getFunnelAnalytics(@Query() query: any) {
    return this.analyticsService.getFunnelAnalytics(query);
  }

  @Get('retention')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '留存分析' })
  getRetentionAnalytics(@Query() query: any) {
    return this.analyticsService.getRetentionAnalytics(query);
  }
}
