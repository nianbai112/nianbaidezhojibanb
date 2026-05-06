import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ErrandService } from './errand.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { 
  UpdateErrandConfigDto, 
  CreateErrandItemSizeDto, 
  UpdateErrandItemSizeDto, 
  CreateErrandPickupPointDto, 
  UpdateErrandPickupPointDto,
  ErrandQueryDto
} from './dto/errand.admin.dto';

@ApiTags('后台管理-跑腿')
@Controller('admin/errand')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class ErrandAdminController {
  constructor(private readonly errandService: ErrandService) {}

  // ================= 跑腿配置 =================
  @Get('config')
  @ApiOperation({ summary: '获取跑腿配置' })
  @RequirePermission('errand:config:view')
  getAdminConfig(@Query('regionId') regionId: string) {
    return this.errandService.getAdminConfig(regionId);
  }

  @Put('config')
  @ApiOperation({ summary: '更新跑腿配置' })
  @RequirePermission('errand:config:update')
  updateAdminConfig(@Query('regionId') regionId: string, @Body() dto: UpdateErrandConfigDto) {
    return this.errandService.updateAdminConfig(regionId, dto);
  }

  // ================= 物品大小 =================
  @Get('item-sizes')
  @ApiOperation({ summary: '获取物品大小列表' })
  @RequirePermission('errand:item-size:view')
  getAdminItemSizes(@Query() query: ErrandQueryDto) {
    return this.errandService.getAdminItemSizes(query);
  }

  @Post('item-sizes')
  @ApiOperation({ summary: '新增物品大小' })
  @RequirePermission('errand:item-size:create')
  createItemSize(@Body() dto: CreateErrandItemSizeDto) {
    return this.errandService.createItemSize(dto);
  }

  @Put('item-sizes/:id')
  @ApiOperation({ summary: '更新物品大小' })
  @RequirePermission('errand:item-size:update')
  updateItemSize(@Param('id') id: string, @Body() dto: UpdateErrandItemSizeDto) {
    return this.errandService.updateItemSize(id, dto);
  }

  @Delete('item-sizes/:id')
  @ApiOperation({ summary: '删除物品大小' })
  @RequirePermission('errand:item-size:delete')
  deleteItemSize(@Param('id') id: string) {
    return this.errandService.deleteItemSize(id);
  }

  // ================= 取件点 =================
  @Get('pickup-points')
  @ApiOperation({ summary: '获取取件点列表' })
  @RequirePermission('errand:pickup-point:view')
  getAdminPickupPoints(@Query() query: ErrandQueryDto) {
    return this.errandService.getAdminPickupPoints(query);
  }

  @Post('pickup-points')
  @ApiOperation({ summary: '新增取件点' })
  @RequirePermission('errand:pickup-point:create')
  createPickupPoint(@Body() dto: CreateErrandPickupPointDto) {
    return this.errandService.createPickupPoint(dto);
  }

  @Put('pickup-points/:id')
  @ApiOperation({ summary: '更新取件点' })
  @RequirePermission('errand:pickup-point:update')
  updatePickupPoint(@Param('id') id: string, @Body() dto: UpdateErrandPickupPointDto) {
    return this.errandService.updatePickupPoint(id, dto);
  }

  @Delete('pickup-points/:id')
  @ApiOperation({ summary: '删除取件点' })
  @RequirePermission('errand:pickup-point:delete')
  deletePickupPoint(@Param('id') id: string) {
    return this.errandService.deletePickupPoint(id);
  }

  // ================= 统计分析 =================
  @Get('stats')
  @ApiOperation({ summary: '获取配送统计' })
  @RequirePermission('errand:stats:view')
  getAdminStats(@Query('regionId') regionId: string) {
    return this.errandService.getAdminStats(regionId);
  }
}
