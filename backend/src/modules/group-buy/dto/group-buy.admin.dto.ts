import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GroupBuyQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  regionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  keyword?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  merchantId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  orderNo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  rating?: number;
}

export class CreateGroupBuyCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isShow?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  regionId?: string;
}

export class UpdateGroupBuyCategoryDto extends CreateGroupBuyCategoryDto {}

export class CreateGroupBuyPackageDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsString()
  cover?: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  detail?: string;

  @IsOptional()
  @IsString()
  buyNotes?: string;

  @IsOptional()
  @IsString()
  verifyInfo?: string;

  @Type(() => Number)
  @IsNumber()
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  originPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stock?: number;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  commissionRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  regionCommissionRate?: number;
}

export class UpdateGroupBuyPackageDto extends CreateGroupBuyPackageDto {}

export class GroupBuyConfigDto {
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

  @IsOptional()
  @IsBoolean()
  requireAudit?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  commissionRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  regionCommissionRate?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class VerifyOrderDto {
  @IsString()
  code: string;
}

export class RefundOrderDto {
  @IsString()
  reason: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;
}

export class ReplyReviewDto {
  @IsString()
  reply: string;
}

export class ReviewAuditDto {
  @IsString()
  status: string; // 'approved' | 'rejected' | 'hidden'
}
