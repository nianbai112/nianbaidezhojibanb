import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BotService } from './bot.service';
import { AiService } from './ai.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('机器人管理')
@Controller()
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth()
export class BotController {
  constructor(
    private readonly botService: BotService,
    private readonly aiService: AiService,
  ) {}

  // --- 机器人运营后台兼容路径（admin 前端使用 /admin/robots/*） ---
  @Get('admin/robots')
  @RequirePermission('robot:view')
  @UseGuards(AdminPermissionGuard)
  robots(@Query() query: any) {
    return this.botService.bots(query);
  }

  @Get('admin/robots/post-tasks')
  @RequirePermission('robot:view')
  @UseGuards(AdminPermissionGuard)
  robotPostTasks(@Query() query: any) {
    return this.botService.tasks({ ...query, type: 'post' });
  }

  @Get('admin/robots/comment-tasks')
  @RequirePermission('robot:view')
  @UseGuards(AdminPermissionGuard)
  robotCommentTasks(@Query() query: any) {
    return this.botService.tasks({ ...query, type: 'comment' });
  }

  @Get('admin/robots/prompt-templates')
  @RequirePermission('robot:view')
  @UseGuards(AdminPermissionGuard)
  promptTemplates(@Query() query: any) {
    return this.botService.promptTemplates(query);
  }

  @Get('admin/robots/:id')
  @RequirePermission('robot:view')
  @UseGuards(AdminPermissionGuard)
  robotDetail(@Param('id') id: string) {
    return this.botService.getBot(id);
  }

  @Post('admin/robots')
  @RequirePermission('robot:post')
  @UseGuards(AdminPermissionGuard)
  createRobot(@Body() dto: any) {
    return this.botService.createBot(dto);
  }

  @Put('admin/robots/:id')
  @RequirePermission('robot:post')
  @UseGuards(AdminPermissionGuard)
  updateRobot(@Param('id') id: string, @Body() dto: any) {
    return this.botService.updateBot(id, dto);
  }

  @Put('admin/robots/:id/status')
  @RequirePermission('robot:post')
  @UseGuards(AdminPermissionGuard)
  updateRobotStatus(@Param('id') id: string, @Body() dto: { status: string | number }) {
    return this.botService.updateBotStatus(id, String(dto.status));
  }

  @Post('admin/robots/ai/generate-post')
  @RequirePermission('robot:post')
  @UseGuards(AdminPermissionGuard)
  async generateRobotPost(@Body() dto: any) {
    if (!this.aiService.isConfigured()) {
      return { code: 501, message: 'AI 未配置，请设置 AI_API_KEY 环境变量' };
    }
    const prompt = `请为本地生活社区生成一篇真实自然的帖子。主题：${dto.topic || dto.prompt || ''}`;
    const content = await this.aiService.generateContent(prompt, 'post');
    return this.botService.formatGeneratedPost(content);
  }

  @Post('admin/robots/ai/generate-comments')
  @RequirePermission('robot:comment')
  @UseGuards(AdminPermissionGuard)
  async generateRobotComments(@Body() dto: any) {
    if (!this.aiService.isConfigured()) {
      return { code: 501, message: 'AI 未配置，请设置 AI_API_KEY 环境变量' };
    }
    const count = Number(dto.count || dto.robotIds?.length || 3);
    const prompt = `请生成 ${count} 条本地生活社区帖子评论，方向：${dto.direction || '自然互动'}。每条一行，不要编号。`;
    const content = await this.aiService.generateContent(prompt, 'comment');
    return this.botService.formatGeneratedComments(content, dto.robotIds || [], count);
  }

  @Post('admin/robots/post-tasks')
  @RequirePermission('robot:post')
  @UseGuards(AdminPermissionGuard)
  createRobotPostTask(@Body() dto: any) {
    return this.botService.createPostTask(dto);
  }

  @Post('admin/robots/comment-tasks')
  @RequirePermission('robot:comment')
  @UseGuards(AdminPermissionGuard)
  createRobotCommentTask(@Body() dto: any) {
    return this.botService.createCommentTask(dto);
  }

  @Put('admin/robots/tasks/:id/cancel')
  @RequirePermission('robot:post')
  @UseGuards(AdminPermissionGuard)
  cancelRobotTask(@Param('id') id: string) {
    return this.botService.cancelTask(id);
  }

  @Post('admin/robots/prompt-templates')
  @RequirePermission('robot:post')
  @UseGuards(AdminPermissionGuard)
  createPromptTemplate(@Body() dto: any) {
    return this.botService.createPromptTemplate(dto);
  }

  @Put('admin/robots/prompt-templates/:id')
  @RequirePermission('robot:post')
  @UseGuards(AdminPermissionGuard)
  updatePromptTemplate(@Param('id') id: string, @Body() dto: any) {
    return this.botService.updatePromptTemplate(id, dto);
  }

  @Delete('admin/robots/prompt-templates/:id')
  @RequirePermission('robot:post')
  @UseGuards(AdminPermissionGuard)
  deletePromptTemplate(@Param('id') id: string) {
    return this.botService.deletePromptTemplate(id);
  }

  @Put('admin/robots/prompt-templates/:id/status')
  @RequirePermission('robot:post')
  @UseGuards(AdminPermissionGuard)
  updatePromptTemplateStatus(@Param('id') id: string, @Body() dto: { status: number }) {
    return this.botService.updatePromptTemplate(id, { isEnabled: dto.status === 1 });
  }

  // --- 机器人账号 ---
  @Get('admin/bots')
  @RequirePermission('bot:view')
  @UseGuards(AdminPermissionGuard)
  bots(@Query() query: any) {
    return this.botService.bots(query);
  }

  @Post('admin/bots')
  @RequirePermission('bot:edit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '创建机器人' })
  createBot(@Body() dto: any) {
    return this.botService.createBot(dto);
  }

  @Put('admin/bots/:id')
  @RequirePermission('bot:edit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '更新机器人' })
  updateBot(@Param('id') id: string, @Body() dto: any) {
    return this.botService.updateBot(id, dto);
  }

  @Put('admin/bots/:id/status')
  @RequirePermission('bot:edit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '切换机器人状态' })
  updateBotStatus(@Param('id') id: string, @Body() dto: { status: string }) {
    return this.botService.updateBotStatus(id, dto.status);
  }

  @Delete('admin/bots/:id')
  @RequirePermission('bot:edit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '删除机器人' })
  deleteBot(@Param('id') id: string) {
    return this.botService.deleteBot(id);
  }

  // --- 人设 ---
  @Get('admin/bot-personas')
  @RequirePermission('bot:view')
  @UseGuards(AdminPermissionGuard)
  personas(@Query() query: any) {
    return this.botService.personas(query);
  }

  @Post('admin/bot-personas')
  @RequirePermission('bot:edit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '创建人设' })
  createPersona(@Body() dto: any) {
    return this.botService.createPersona(dto);
  }

  @Put('admin/bot-personas/:id')
  @RequirePermission('bot:edit')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '更新人设' })
  updatePersona(@Param('id') id: string, @Body() dto: any) {
    return this.botService.updatePersona(id, dto);
  }

  // --- 任务 ---
  @Get('admin/bot-tasks')
  @RequirePermission('bot:task')
  @UseGuards(AdminPermissionGuard)
  tasks(@Query() query: any) {
    return this.botService.tasks(query);
  }

  @Post('admin/bot-tasks')
  @RequirePermission('bot:task')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '创建任务' })
  createTask(@Body() dto: any) {
    return this.botService.createTask(dto);
  }

  @Put('admin/bot-tasks/:id')
  @RequirePermission('bot:task')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '更新任务' })
  updateTask(@Param('id') id: string, @Body() dto: any) {
    return this.botService.updateTask(id, dto);
  }

  @Put('admin/bot-tasks/:id/approve')
  @RequirePermission('bot:task')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '审核任务' })
  approveTask(@Param('id') id: string, @CurrentUser('sub') reviewerId: string) {
    return this.botService.approveTask(id, reviewerId);
  }

  @Put('admin/bot-tasks/:id/run')
  @RequirePermission('bot:task')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: '立即执行任务' })
  runTask(@Param('id') id: string) {
    return this.botService.runTask(id);
  }

  // --- AI ---
  @Post('admin/bot/ai-generate')
  @RequirePermission('bot:task')
  @UseGuards(AdminPermissionGuard)
  @ApiOperation({ summary: 'AI生成内容' })
  async aiGenerate(@Body() dto: { prompt: string; type?: string }) {
    if (!this.aiService.isConfigured()) {
      return { code: 501, message: 'AI 未配置，请设置 AI_API_KEY 环境变量' };
    }
    const content = await this.aiService.generateContent(dto.prompt, dto.type);
    return { success: true, data: { content } };
  }

  // --- 日志 ---
  @Get('admin/bot-action-logs')
  @RequirePermission('bot:view')
  @UseGuards(AdminPermissionGuard)
  actionLogs(@Query() query: any) {
    return this.botService.actionLogs(query);
  }
}
