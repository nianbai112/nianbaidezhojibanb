import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsNumber } from 'class-validator';
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
}

export class SecondHandProductStatusDto {
  @ApiProperty({ description: '状态', enum: SecondHandStatus })
  @IsEnum(SecondHandStatus)
  status!: SecondHandStatus;
}

// ==================== 订单管理 DTO ====================

export class SecondHandOrderQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) pageSize?: number;
  @IsOptional() @IsString() orderNo?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() buyerId?: string;
  @IsOptional() @IsString() sellerId?: string;
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
}
