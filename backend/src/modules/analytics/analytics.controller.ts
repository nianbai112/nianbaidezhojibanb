import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
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

  @Get('second-hand')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '二手交易分析' })
  getSecondHandAnalytics(@Query() query: any) {
    return this.analyticsService.getSecondHandAnalytics(query);
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

  @Get('riders/algorithm')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '骑手算法分析' })
  getRiderAlgorithmAnalytics(@Query() query: any) {
    return this.analyticsService.getRiderAlgorithmAnalytics(query);
  }

  @Get('riders/ai-config')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '骑手算法 AI 配置' })
  getRiderAiConfig() {
    return this.analyticsService.getRiderAiConfig();
  }

  @Put('riders/ai-config')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '保存骑手算法 AI 配置' })
  saveRiderAiConfig(@Body() dto: any) {
    return this.analyticsService.saveRiderAiConfig(dto);
  }

  @Post('riders/ai-run')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '手动执行骑手算法 AI 分析' })
  runRiderAiAnalysis(@Body() dto: any) {
    return this.analyticsService.runRiderAiAnalysis(dto);
  }

  @Get('riders/ai-suggestions')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '骑手算法 AI 建议列表' })
  getRiderAiSuggestions(@Query() query: any) {
    return this.analyticsService.getRiderAiSuggestions(query);
  }

  @Put('riders/ai-suggestions/:id/status')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '更新骑手算法 AI 建议状态' })
  updateRiderAiSuggestionStatus(@Param('id') id: string, @Body() dto: any) {
    return this.analyticsService.updateRiderAiSuggestionStatus(id, dto);
  }

  @Get('riders/ai-run-logs')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: '骑手算法 AI 执行日志' })
  getRiderAiRunLogs(@Query() query: any) {
    return this.analyticsService.getRiderAiRunLogs(query);
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
