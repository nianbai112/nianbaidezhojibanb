import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AiAdminService } from './ai-admin.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('AI运营中心')
@Controller('admin/ai')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class AiAdminController {
  constructor(private readonly aiAdminService: AiAdminService) {}

  // ==================== 运营工作台 ====================

  @Get('dashboard')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI运营工作台' })
  getDashboard() {
    return this.aiAdminService.getDashboard();
  }

  // ==================== 机器人管理 ====================

  @Get('bots')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: '机器人列表' })
  getBots(@Query() query: any) {
    return this.aiAdminService.getBots(query);
  }

  @Post('bots')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '创建机器人' })
  createBot(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.aiAdminService.createBot(body, operatorId, ip);
  }

  @Put('bots/:id')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '更新机器人' })
  updateBot(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.aiAdminService.updateBot(id, body, operatorId, ip);
  }

  @Put('bots/:id/status')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '更新机器人状态' })
  updateBotStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.aiAdminService.updateBotStatus(id, body.status, operatorId);
  }

  // ==================== 任务管理 ====================

  @Get('tasks')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI任务列表' })
  getTasks(@Query() query: any) {
    return this.aiAdminService.getTasks(query);
  }

  @Post('tasks')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '创建AI任务' })
  createTask(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.aiAdminService.createTask(body, operatorId, ip);
  }

  @Put('tasks/:id')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '更新AI任务' })
  updateTask(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.aiAdminService.updateTask(id, body, operatorId, ip);
  }

  @Put('tasks/:id/status')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '更新任务状态' })
  updateTaskStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.aiAdminService.updateTaskStatus(id, body.status, operatorId);
  }

  @Post('tasks/:id/generate-draft')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '为AI任务生成草稿' })
  generateTaskDraft(
    @Param('id') id: string,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.aiAdminService.generateTaskDraft(id, operatorId);
  }

  @Post('tasks/:id/run')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '立即执行AI任务' })
  runTask(
    @Param('id') id: string,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.aiAdminService.runTask(id, operatorId);
  }

  @Post('tasks/:id/retry')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '重新排队AI任务' })
  retryTask(
    @Param('id') id: string,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.aiAdminService.retryTask(id, operatorId);
  }

  @Post('tasks/:id/cancel')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '取消AI任务' })
  cancelTask(
    @Param('id') id: string,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.aiAdminService.cancelTask(id, operatorId);
  }

  @Get('tasks/:id/timeline')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI任务时间线' })
  getTaskTimeline(@Param('id') id: string) {
    return this.aiAdminService.getTaskTimeline(id);
  }

  // ==================== 日志管理 ====================

  @Get('logs')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI执行日志' })
  getLogs(@Query() query: any) {
    return this.aiAdminService.getLogs(query);
  }

  @Get('call-logs')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI模型调用日志' })
  getCallLogs(@Query() query: any) {
    return this.aiAdminService.getCallLogs(query);
  }

  @Get('moderation-records')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI内容审核记录' })
  getModerationRecords(@Query() query: any) {
    return this.aiAdminService.getModerationRecords(query);
  }

  @Get('quota-usage')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI调用配额和成本' })
  getQuotaUsage(@Query() query: any) {
    return this.aiAdminService.getQuotaUsage(query);
  }

  @Get('risk-events')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI风险事件' })
  getRiskEvents(@Query() query: any) {
    return this.aiAdminService.getRiskEvents(query);
  }

  @Post('risk-events/:id/handle')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '处理AI风险事件' })
  handleRiskEvent(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.aiAdminService.handleRiskEvent(id, body, operatorId);
  }

  // ==================== 数据修复 ====================

  @Get('repair/stats')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI数据修复统计' })
  getRepairStats() {
    return this.aiAdminService.getRepairStats();
  }

  @Post('repair/running-tasks')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '修复卡死的AI任务' })
  repairRunningTasks(@CurrentUser('sub') operatorId: string) {
    return this.aiAdminService.repairRunningTasks(operatorId);
  }

  @Post('repair/comment-counts')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '重算帖子评论数' })
  repairCommentCounts(@CurrentUser('sub') operatorId: string) {
    return this.aiAdminService.repairCommentCounts(operatorId);
  }

  @Post('repair/bot-profiles')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '修复机器人用户资料' })
  repairBotProfiles(@CurrentUser('sub') operatorId: string) {
    return this.aiAdminService.repairBotProfiles(operatorId);
  }

  // ==================== 配置管理 ====================

  @Get('config')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: '获取AI配置' })
  getConfig() {
    return this.aiAdminService.getConfig();
  }

  @Get('config/versions')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI配置版本记录' })
  getConfigVersions(@Query() query: any) {
    return this.aiAdminService.getConfigVersions(query);
  }

  @Post('config/versions/:id/rollback')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '回滚AI配置版本' })
  rollbackConfigVersion(
    @Param('id') id: string,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.aiAdminService.rollbackConfigVersion(id, operatorId);
  }

  @Put('config')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '保存AI配置' })
  saveConfig(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.aiAdminService.saveConfig(body, operatorId, ip);
  }

  @Post('config/test')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: '诊断AI配置' })
  testConfig() {
    return this.aiAdminService.testConfig();
  }

  @Post('config/test-generate')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: '测试AI内容生成' })
  testGenerate() {
    return this.aiAdminService.testGenerate();
  }

  // ==================== 人设管理 ====================

  @Get('personas')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: '机器人人设列表' })
  getPersonas(@Query() query: any) {
    return this.aiAdminService.getPersonas(query);
  }

  @Post('personas')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '创建人设' })
  createPersona(
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.aiAdminService.createPersona(body, operatorId, ip);
  }

  @Put('personas/:id')
  @RequirePermission('ai:edit')
  @ApiOperation({ summary: '更新人设' })
  updatePersona(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.aiAdminService.updatePersona(id, body, operatorId, ip);
  }
}
