import { Controller, Get, Post, Put, Query, UseGuards, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission, RequirePermissionAny } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('审核中心')
@Controller()
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('admin/audit/stats')
  @RequirePermissionAny('content:audit', 'audit:view', 'report:handle', 'post:audit', 'comment:audit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '审核统计' })
  stats() {
    return this.auditService.getPendingStats();
  }

  @Get('admin/audit/pending-counts')
  @RequirePermissionAny('content:audit', 'audit:view', 'report:handle', 'post:audit', 'comment:audit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '各类型待审核数量' })
  pendingCounts() {
    return this.auditService.getPendingCounts();
  }

  @Get('admin/audit/pending')
  @RequirePermissionAny('content:audit', 'audit:view', 'report:handle', 'post:audit', 'comment:audit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '待审核列表' })
  pendingList(@Query() query: any) {
    return this.auditService.getPendingList(query);
  }

  @Post('admin/audit/batch')
  @RequirePermission('content:audit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '批量审核' })
  batchAudit(@Body() dto: any, @CurrentUser('sub') reviewerId: string) {
    return this.auditService.batchAudit(dto, reviewerId);
  }

  @Post('admin/audit/ai-review')
  @RequirePermission('content:audit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: 'AI复审帖子或评论' })
  aiReview(@Body() dto: any, @CurrentUser('sub') reviewerId: string) {
    return this.auditService.aiReview(dto, reviewerId);
  }
}
