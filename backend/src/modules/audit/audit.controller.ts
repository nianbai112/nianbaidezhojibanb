import { Controller, Get, Post, Put, Query, UseGuards, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('审核中心')
@Controller()
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('admin/audit/stats')
  @RequirePermission('content:audit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '审核统计' })
  stats() {
    return this.auditService.getPendingStats();
  }

  @Get('admin/audit/pending-counts')
  @RequirePermission('content:audit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '各类型待审核数量' })
  pendingCounts() {
    return this.auditService.getPendingCounts();
  }

  @Get('admin/audit/pending')
  @RequirePermission('content:audit')
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
}
