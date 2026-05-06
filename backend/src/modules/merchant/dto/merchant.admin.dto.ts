import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsNumber, IsArray, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PriceAdjustmentType, PriceAdjustmentScope } from '@prisma/client';

// ==================== 打印机配置 DTO ====================

export class CreatePrinterConfigDto {
  @ApiProperty({ description: '商家ID' })
  @IsString()
  merchantId!: string;

  @ApiProperty({ description: '打印机名称' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: '品牌', default: 'feie' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ description: '打印机SN编号' })
  @IsString()
  sn!: string;

  @ApiPropertyOptional({ description: '打印机密钥' })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiPropertyOptional({ description: '自动打印' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  autoPrint?: boolean;

  @ApiPropertyOptional({ description: '是否默认' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isDefault?: boolean;
}

export class UpdatePrinterConfigDto {
  @ApiPropertyOptional({ description: '打印机名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '品牌' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'SN编号' })
  @IsOptional()
  @IsString()
  sn?: string;

  @ApiPropertyOptional({ description: '密钥' })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiPropertyOptional({ description: '自动打印' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  autoPrint?: boolean;

  @ApiPropertyOptional({ description: '是否默认' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isDefault?: boolean;

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class TestPrintDto {
  @ApiProperty({ description: '订单ID或打印内容' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: '打印内容' })
  @IsOptional()
  @IsString()
  content?: string;
}

// ==================== 商品加价 DTO ====================

export class CreatePriceAdjustmentDto {
  @ApiProperty({ description: '规则名称' })
  @IsString()
  name!: string;

  @ApiProperty({ description: '类型', enum: PriceAdjustmentType })
  @IsEnum(PriceAdjustmentType)
  type!: PriceAdjustmentType;

  @ApiProperty({ description: '加价值（百分比或固定金额）' })
  @IsNumber()
  @Type(() => Number)
  value!: number;

  @ApiProperty({ description: '适用范围', enum: PriceAdjustmentScope })
  @IsEnum(PriceAdjustmentScope)
  scope!: PriceAdjustmentScope;

  @ApiPropertyOptional({ description: '区域ID（scope=REGION时）' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: '类目ID（scope=CATEGORY时）' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: '商家ID（scope=MERCHANT时）' })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional({ description: '优先级', default: 0 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdatePriceAdjustmentDto {
  @ApiPropertyOptional({ description: '规则名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '类型' })
  @IsOptional()
  @IsEnum(PriceAdjustmentType)
  type?: PriceAdjustmentType;

  @ApiPropertyOptional({ description: '加价值' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  value?: number;

  @ApiPropertyOptional({ description: '适用范围' })
  @IsOptional()
  @IsEnum(PriceAdjustmentScope)
  scope?: PriceAdjustmentScope;

  @ApiPropertyOptional({ description: '区域ID' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: '类目ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: '商家ID' })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional({ description: '优先级' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

// ==================== 商品采集 DTO ====================

export class BatchCollectProductsDto {
  @ApiProperty({ description: '目标商家ID' })
  @IsString()
  targetMerchantId!: string;

  @ApiProperty({ description: '商品ID列表' })
  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}

// ==================== 区域商家设置 DTO ====================

export class UpdateRegionMerchantSettingsDto {
  @ApiPropertyOptional({ description: '自动审核' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  autoAuditEnabled?: boolean;

  @ApiPropertyOptional({ description: '最大商家数' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  maxMerchants?: number;

  @ApiPropertyOptional({ description: '平台抽成比例(%)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  commissionRate?: number;

  @ApiPropertyOptional({ description: '最小提现金额' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minWithdrawAmount?: number;

  @ApiPropertyOptional({ description: '提现手续费率(%)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  withdrawFeeRate?: number;

  @ApiPropertyOptional({ description: '默认配送范围(米)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  defaultDeliveryRange?: number;

  @ApiPropertyOptional({ description: '允许负库存' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowNegativeStock?: boolean;

  @ApiPropertyOptional({ description: '最大商品数' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  maxProductCount?: number;

  @ApiPropertyOptional({ description: '商品需审核' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  requireProductAudit?: boolean;

  @ApiPropertyOptional({ description: '结算周期' })
  @IsOptional()
  @IsString()
  settlementCycle?: string;

  @ApiPropertyOptional({ description: '结算日' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  settlementDay?: number;

  @ApiPropertyOptional({ description: '是否开放' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isOpen?: boolean;
}

// ==================== 查询 DTO ====================

export class PrinterQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class PriceAdjustmentQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  merchantId?: string;
}

export class ProductCollectionQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxPrice?: number;
}

export class RegionSettingsQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  isOpen?: string;
}
