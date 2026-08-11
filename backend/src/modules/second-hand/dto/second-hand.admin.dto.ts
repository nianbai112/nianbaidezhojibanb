import { IsArray, IsString, IsOptional, IsInt, IsBoolean, IsEnum, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SecondHandStatus } from '@prisma/client';

// ==================== 商品管理 DTO ====================

export class SecondHandProductQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) pageSize?: number;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() deliveryType?: string;
}

export class SecondHandProductStatusDto {
  @ApiProperty({ description: '状态', enum: SecondHandStatus })
  @IsEnum(SecondHandStatus)
  status!: SecondHandStatus;

  @ApiPropertyOptional({ description: '审核/下架原因' })
  @IsOptional() @IsString()
  auditReason?: string;
}

export class SecondHandProductBatchStatusDto extends SecondHandProductStatusDto {
  @ApiProperty({ description: '商品ID列表', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}

// ==================== 订单管理 DTO ====================

export class SecondHandOrderQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) pageSize?: number;
  @IsOptional() @IsString() orderNo?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() deliveryType?: string;
  @IsOptional() @IsString() buyerId?: string;
  @IsOptional() @IsString() sellerId?: string;
}

export class SecondHandOrderStatusDto {
  @ApiProperty({ description: '订单状态' })
  @IsString()
  status!: string;

  @ApiPropertyOptional({ description: '处理原因/备注' })
  @IsOptional() @IsString()
  reason?: string;
}

export class SecondHandReportQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) pageSize?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() regionId?: string;
}

export class SecondHandReportHandleDto {
  @ApiProperty({ description: '处理动作' })
  @IsString()
  action!: string;

  @ApiPropertyOptional({ description: '处理结果/原因' })
  @IsOptional() @IsString()
  result?: string;

  @ApiPropertyOptional({ description: '禁言天数' })
  @IsOptional() @IsInt() @Type(() => Number)
  muteDays?: number;
}

// ==================== 区域配置 DTO ====================

export class SecondHandRegionSettingQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) pageSize?: number;
  @IsOptional() @IsString() regionId?: string;
}

export class UpdateSecondHandRegionSettingDto {
  @ApiPropertyOptional({ description: '开启二手交易' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  enableSecondHand?: boolean;

  @ApiPropertyOptional({ description: '每人最大发布数' })
  @IsOptional() @IsInt() @Type(() => Number)
  maxListings?: number;

  @ApiPropertyOptional({ description: '需要手机号' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  requirePhone?: boolean;

  @ApiPropertyOptional({ description: '需要审核' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  requireAudit?: boolean;

  @ApiPropertyOptional({ description: '开启在线担保支付' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  enableOnlinePayment?: boolean;

  @ApiPropertyOptional({ description: '开启售后/退款处理' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  enableAfterSale?: boolean;

  @ApiPropertyOptional({ description: '开启平台担保说明' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  enablePlatformGuarantee?: boolean;

  @ApiPropertyOptional({ description: '开启自动推荐' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  enableAutoRecommend?: boolean;
}
