import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { DecorVersionService } from './decor-version.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('装修版本')
@Controller('admin/decor-version')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class DecorVersionController {
  constructor(private readonly decorVersionService: DecorVersionService) {}

  @Post('snapshot')
  @RequirePermission('region:edit')
  @ApiOperation({ summary: '保存装修版本快照（编辑器发布成功后由前端调用）' })
  createSnapshot(
    @Body() body: { regionId: string; snapshot: any; note?: string },
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.decorVersionService.createSnapshot(
      body?.regionId,
      body?.snapshot,
      body?.note || '',
      operatorId,
    );
  }

  @Get(':regionId/list')
  @RequirePermission('region:view')
  @ApiOperation({ summary: '装修版本列表（最近 20 个）' })
  listVersions(@Param('regionId') regionId: string) {
    return this.decorVersionService.listVersions(regionId);
  }

  @Get(':regionId/:version')
  @RequirePermission('region:view')
  @ApiOperation({ summary: '获取指定版本快照' })
  getVersion(@Param('regionId') regionId: string, @Param('version') version: string) {
    return this.decorVersionService.getVersion(regionId, parseInt(version, 10));
  }

  @Post(':regionId/rollback')
  @RequirePermission('region:edit')
  @ApiOperation({ summary: '回滚到指定版本（回写 regions + tabbar + layout home）' })
  rollback(
    @Param('regionId') regionId: string,
    @Body() body: { version: number },
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.decorVersionService.rollback(regionId, Number(body?.version), operatorId, ip);
  }
}
