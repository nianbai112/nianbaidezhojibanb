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
import { ABTestService } from './ab-test.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('A/B 测试')
@Controller()
export class ABTestController {
  constructor(private readonly abTestService: ABTestService) {}

  @Get('api/ab-tests/assign')
  @ApiOperation({ summary: '获取用户实验分组' })
  getAssignment(@Query() query: any, @CurrentUser('sub') userId?: string) {
    return this.abTestService.getAssignment(query, userId);
  }

  @Get('admin/ab-tests')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('abtest:view')
  @ApiOperation({ summary: '实验列表' })
  getTests(@Query() query: any) {
    return this.abTestService.getTests(query);
  }

  @Post('admin/ab-tests')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('abtest:edit')
  @ApiOperation({ summary: '创建实验' })
  createTest(@Body() body: any, @CurrentUser('sub') operatorId: string) {
    return this.abTestService.createTest(body, operatorId);
  }

  @Put('admin/ab-tests/:id')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('abtest:edit')
  @ApiOperation({ summary: '更新实验' })
  updateTest(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.abTestService.updateTest(id, body, operatorId);
  }

  @Put('admin/ab-tests/:id/start')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('abtest:edit')
  @ApiOperation({ summary: '启动实验' })
  startTest(@Param('id') id: string, @CurrentUser('sub') operatorId: string) {
    return this.abTestService.startTest(id, operatorId);
  }

  @Put('admin/ab-tests/:id/stop')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('abtest:edit')
  @ApiOperation({ summary: '停止实验' })
  stopTest(@Param('id') id: string, @CurrentUser('sub') operatorId: string) {
    return this.abTestService.stopTest(id, operatorId);
  }

  @Get('admin/ab-tests/:id/results')
  @UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('abtest:view')
  @ApiOperation({ summary: '实验结果' })
  getTestResults(@Param('id') id: string, @Query() query: any) {
    return this.abTestService.getTestResults(id, query);
  }
}
