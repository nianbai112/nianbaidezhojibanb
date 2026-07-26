import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SchedulerService } from './scheduler.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('任务调度')
@Controller('admin/jobs')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get()
  @RequirePermission('job:view')
  @ApiOperation({ summary: '任务列表' })
  getJobs(@Query() query: any) {
    return this.schedulerService.getJobs(query);
  }

  @Post()
  @RequirePermission('job:edit')
  @ApiOperation({ summary: '创建任务' })
  createJob(@Body() body: any, @CurrentUser('sub') operatorId: string) {
    return this.schedulerService.createJob(body, operatorId);
  }

  @Put(':id')
  @RequirePermission('job:edit')
  @ApiOperation({ summary: '更新任务' })
  updateJob(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.schedulerService.updateJob(id, body, operatorId);
  }

  @Put(':id/run')
  @RequirePermission('job:edit')
  @ApiOperation({ summary: '立即执行任务' })
  runJob(@Param('id') id: string, @CurrentUser('sub') operatorId: string) {
    return this.schedulerService.runJob(id, operatorId);
  }

  @Put(':id/stop')
  @RequirePermission('job:edit')
  @ApiOperation({ summary: '停止任务' })
  stopJob(@Param('id') id: string, @CurrentUser('sub') operatorId: string) {
    return this.schedulerService.stopJob(id, operatorId);
  }

  @Get(':id/logs')
  @RequirePermission('job:view')
  @ApiOperation({ summary: '任务日志' })
  getJobLogs(@Param('id') id: string, @Query() query: any) {
    return this.schedulerService.getJobLogs(id, query);
  }
}
