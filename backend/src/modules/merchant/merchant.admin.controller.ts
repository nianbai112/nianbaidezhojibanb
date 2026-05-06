import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MerchantService } from './merchant.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import {
  CreatePrinterConfigDto, UpdatePrinterConfigDto, TestPrintDto,
  CreatePriceAdjustmentDto, UpdatePriceAdjustmentDto,
  BatchCollectProductsDto, UpdateRegionMerchantSettingsDto,
  PrinterQueryDto, PriceAdjustmentQueryDto, ProductCollectionQueryDto, RegionSettingsQueryDto,
} from './dto/merchant.admin.dto';

@ApiTags('后台管理-商家管理')
@Controller()
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class MerchantAdminController {
  constructor(private readonly merchantService: MerchantService) {}

  // ==================== 打印机配置 ====================

  @Get('admin/merchant/printers')
  @ApiOperation({ summary: '打印机列表' })
  @RequirePermission('merchant:printer')
  getPrinterList(@Query() query: PrinterQueryDto) {
    return this.merchantService.getPrinterList(query);
  }

  @Get('admin/merchant/printers/:id')
  @ApiOperation({ summary: '打印机详情' })
  @RequirePermission('merchant:printer')
  getPrinter(@Param('id') id: string) {
    return this.merchantService.getPrinter(id);
  }

  @Post('admin/merchant/printers')
  @ApiOperation({ summary: '创建打印机' })
  @RequirePermission('merchant:printer')
  createPrinter(@Body() dto: CreatePrinterConfigDto) {
    return this.merchantService.createPrinter(dto);
  }

  @Put('admin/merchant/printers/:id')
  @ApiOperation({ summary: '更新打印机' })
  @RequirePermission('merchant:printer')
  updatePrinter(@Param('id') id: string, @Body() dto: UpdatePrinterConfigDto) {
    return this.merchantService.updatePrinter(id, dto);
  }

  @Delete('admin/merchant/printers/:id')
  @ApiOperation({ summary: '删除打印机' })
  @RequirePermission('merchant:printer')
  deletePrinter(@Param('id') id: string) {
    return this.merchantService.deletePrinter(id);
  }

  @Post('admin/merchant/printers/:id/test-print')
  @ApiOperation({ summary: '测试打印' })
  @RequirePermission('merchant:printer')
  testPrint(@Param('id') id: string, @Body() dto: TestPrintDto) {
    return this.merchantService.testPrint(id, dto);
  }

  // ==================== 商品加价规则 ====================

  @Get('admin/merchant/price-adjustments')
  @ApiOperation({ summary: '商品加价规则列表' })
  @RequirePermission('merchant:price')
  getPriceAdjustments(@Query() query: PriceAdjustmentQueryDto) {
    return this.merchantService.getPriceAdjustments(query);
  }

  @Get('admin/merchant/price-adjustments/:id')
  @ApiOperation({ summary: '加价规则详情' })
  @RequirePermission('merchant:price')
  getPriceAdjustment(@Param('id') id: string) {
    return this.merchantService.getPriceAdjustment(id);
  }

  @Post('admin/merchant/price-adjustments')
  @ApiOperation({ summary: '创建加价规则' })
  @RequirePermission('merchant:price')
  createPriceAdjustment(@Body() dto: CreatePriceAdjustmentDto) {
    return this.merchantService.createPriceAdjustment(dto);
  }

  @Put('admin/merchant/price-adjustments/:id')
  @ApiOperation({ summary: '更新加价规则' })
  @RequirePermission('merchant:price')
  updatePriceAdjustment(@Param('id') id: string, @Body() dto: UpdatePriceAdjustmentDto) {
    return this.merchantService.updatePriceAdjustment(id, dto);
  }

  @Delete('admin/merchant/price-adjustments/:id')
  @ApiOperation({ summary: '删除加价规则' })
  @RequirePermission('merchant:price')
  deletePriceAdjustment(@Param('id') id: string) {
    return this.merchantService.deletePriceAdjustment(id);
  }

  // ==================== 商品采集 ====================

  @Get('admin/merchant/product-collection')
  @ApiOperation({ summary: '商品采集列表' })
  @RequirePermission('merchant:collection')
  getProductCollection(@Query() query: ProductCollectionQueryDto) {
    return this.merchantService.getProductCollection(query);
  }

  @Post('admin/merchant/product-collection/batch')
  @ApiOperation({ summary: '批量采集商品' })
  @RequirePermission('merchant:collection')
  batchCollectProducts(@Body() dto: BatchCollectProductsDto) {
    return this.merchantService.batchCollectProducts(dto);
  }

  @Get('admin/merchant/product-collection/export')
  @ApiOperation({ summary: '导出商品数据' })
  @RequirePermission('merchant:collection')
  exportProducts(@Query() query: ProductCollectionQueryDto) {
    return this.merchantService.exportProducts(query);
  }

  // ==================== 区域商家设置 ====================

  @Get('admin/merchant/region-settings')
  @ApiOperation({ summary: '区域商家设置列表' })
  @RequirePermission('merchant:config')
  getRegionSettingsList(@Query() query: RegionSettingsQueryDto) {
    return this.merchantService.getRegionSettingsList(query);
  }

  @Get('admin/merchant/region-settings/:regionId')
  @ApiOperation({ summary: '获取区域商家设置' })
  @RequirePermission('merchant:config')
  getRegionSettings(@Param('regionId') regionId: string) {
    return this.merchantService.getRegionSettings(regionId);
  }

  @Put('admin/merchant/region-settings/:regionId')
  @ApiOperation({ summary: '保存区域商家设置' })
  @RequirePermission('merchant:config')
  upsertRegionSettings(@Param('regionId') regionId: string, @Body() dto: UpdateRegionMerchantSettingsDto) {
    return this.merchantService.upsertRegionSettings(regionId, dto);
  }
}
