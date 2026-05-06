import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ==================== Category ====================

export class RatingCategoryQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;
}

export class CreateRatingCategoryDto {
  @ApiProperty({ description: '分类名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isActive?: boolean;
}

export class UpdateRatingCategoryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isActive?: boolean;
}

// ==================== Item ====================

export class RatingItemQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: 'enabled, disabled' })
  @IsOptional() @IsString()
  status?: string;
}

export class CreateRatingItemDto {
  @ApiProperty({ description: '所属分类ID' })
  @IsString()
  categoryId: string;

  @ApiProperty({ description: '项目名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  cover?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'enabled, disabled' })
  @IsOptional() @IsString() @IsIn(['enabled', 'disabled'])
  status?: string;
}

export class UpdateRatingItemDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  cover?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'enabled, disabled' })
  @IsOptional() @IsString() @IsIn(['enabled', 'disabled'])
  status?: string;
}

// ==================== Rating Record ====================

export class RatingRecordQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  itemId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number)
  scoreMin?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number)
  scoreMax?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  keyword?: string;
}

// ==================== Reply ====================

export class RatingReplyQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  ratingId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'approved, pending, rejected' })
  @IsOptional() @IsString() @IsIn(['approved', 'pending', 'rejected'])
  status?: string;
}

export class RatingReplyAuditDto {
  @ApiProperty({ description: 'approved, rejected' })
  @IsString() @IsIn(['approved', 'rejected'])
  status: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  reason?: string;
}

// ==================== Region Settings ====================

export class RatingSettingsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 50;
}

export class UpdateRatingSettingsDto {
  @ApiPropertyOptional()
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  enableRating?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  enableDynamic?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  requireLoginToRate?: boolean;
}
