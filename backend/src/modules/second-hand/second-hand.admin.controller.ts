import {
  Controller, Get, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SecondHandAdminService } from './second-hand.admin.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import {
  SecondHandProductQueryDto, SecondHandProductStatusDto,
  SecondHandOrderQueryDto,
  SecondHandRegionSettingQueryDto, UpdateSecondHandRegionSettingDto,
} from './dto/second-hand.admin.dto';

@ApiTags('后台管理-二手交易')
@Controller()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class SecondHandAdminController {
  constructor(private readonly secondHandService: SecondHandAdminService) {}

  // ==================== 商品管理 ====================

  @Get('admin/second-hand/products')
  @ApiOperation({ summary: '二手商品列表' })
  @RequirePermission('secondhand:view')
  getProductList(@Query() query: SecondHandProductQueryDto) {
    return this.secondHandService.getProductList(query);
  }

  @Get('admin/second-hand/products/:id')
  @ApiOperation({ summary: '二手商品详情' })
  @RequirePermission('secondhand:view')
  getProductDetail(@Param('id') id: string) {
    return this.secondHandService.getProductDetail(id);
  }

  @Put('admin/second-hand/products/:id/status')
  @ApiOperation({ summary: '更新二手商品状态' })
  @RequirePermission('secondhand:audit')
  updateProductStatus(@Param('id') id: string, @Body() dto: SecondHandProductStatusDto) {
    return this.secondHandService.updateProductStatus(id, dto);
  }

  @Delete('admin/second-hand/products/:id')
  @ApiOperation({ summary: '删除二手商品' })
  @RequirePermission('secondhand:audit')
  deleteProduct(@Param('id') id: string) {
    return this.secondHandService.deleteProduct(id);
  }

  // ==================== 订单管理 ====================

  @Get('admin/second-hand/orders')
  @ApiOperation({ summary: '二手订单列表' })
  @RequirePermission('secondhand:view')
  getOrderList(@Query() query: SecondHandOrderQueryDto) {
    return this.secondHandService.getOrderList(query);
  }

  @Get('admin/second-hand/orders/:id')
  @ApiOperation({ summary: '二手订单详情' })
  @RequirePermission('secondhand:view')
  getOrderDetail(@Param('id') id: string) {
    return this.secondHandService.getOrderDetail(id);
  }

  // ==================== 区域配置 ====================

  @Get('admin/second-hand/settings')
  @ApiOperation({ summary: '二手区域配置列表' })
  @RequirePermission('secondhand:view')
  getRegionSettingsList(@Query() query: SecondHandRegionSettingQueryDto) {
    return this.secondHandService.getRegionSettingsList(query);
  }

  @Get('admin/second-hand/settings/:regionId')
  @ApiOperation({ summary: '获取区域二手配置' })
  @RequirePermission('secondhand:view')
  getRegionSetting(@Param('regionId') regionId: string) {
    return this.secondHandService.getRegionSetting(regionId);
  }

  @Put('admin/second-hand/settings/:regionId')
  @ApiOperation({ summary: '保存区域二手配置' })
  @RequirePermission('secondhand:config')
  upsertRegionSetting(@Param('regionId') regionId: string, @Body() dto: UpdateSecondHandRegionSettingDto) {
    return this.secondHandService.upsertRegionSetting(regionId, dto);
  }
}
