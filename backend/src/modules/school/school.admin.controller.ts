import {
  Controller, Get, Post, Put, Patch, Delete, Body, Query, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SchoolService } from './school.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import {
  CreateSchoolDto,
  UpdateSchoolDto,
  UpdateSchoolStatusDto,
  BindSchoolsToRegionDto,
  AdminSchoolQueryDto,
} from './dto/school.dto';

@ApiTags('后台-学校管理')
@Controller('admin')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class SchoolAdminController {
  constructor(private readonly schoolService: SchoolService) {}

  @Get('schools')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '学校列表' })
  list(@Query() query: AdminSchoolQueryDto) {
    return this.schoolService.adminList(query);
  }

  @Get('schools/stats')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '学校统计' })
  stats() {
    return this.schoolService.adminStats();
  }

  @Post('schools')
  @RequirePermission('user:edit')
  @ApiOperation({ summary: '新增学校' })
  create(@Body() dto: CreateSchoolDto) {
    return this.schoolService.create(dto);
  }

  @Put('schools/:id')
  @RequirePermission('user:edit')
  @ApiOperation({ summary: '编辑学校' })
  update(@Param('id') id: string, @Body() dto: UpdateSchoolDto) {
    return this.schoolService.update(id, dto);
  }

  @Patch('schools/:id/status')
  @RequirePermission('user:edit')
  @ApiOperation({ summary: '启用/禁用学校' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateSchoolStatusDto) {
    return this.schoolService.updateStatus(id, dto.isEnabled);
  }

  @Delete('schools/:id')
  @RequirePermission('user:edit')
  @ApiOperation({ summary: '删除学校' })
  delete(@Param('id') id: string) {
    return this.schoolService.delete(id);
  }

  @Get('regions/:regionId/schools')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '查询某区域绑定学校' })
  getByRegion(@Param('regionId') regionId: string) {
    return this.schoolService.getByRegion(regionId);
  }

  @Put('regions/:regionId/schools')
  @RequirePermission('user:edit')
  @ApiOperation({ summary: '批量绑定学校到区域' })
  bindToRegion(@Param('regionId') regionId: string, @Body() dto: BindSchoolsToRegionDto) {
    return this.schoolService.bindToRegion(regionId, dto.schoolIds);
  }
}
