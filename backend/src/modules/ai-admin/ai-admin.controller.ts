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

  // ==================== 日志管理 ====================

  @Get('logs')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: 'AI执行日志' })
  getLogs(@Query() query: any) {
    return this.aiAdminService.getLogs(query);
  }

  // ==================== 配置管理 ====================

  @Get('config')
  @RequirePermission('ai:view')
  @ApiOperation({ summary: '获取AI配置' })
  getConfig() {
    return this.aiAdminService.getConfig();
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
