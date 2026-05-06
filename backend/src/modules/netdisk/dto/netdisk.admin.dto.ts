import { IsString, IsOptional, IsNumber, IsBoolean, IsDecimal } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ---- 分类 ----
export class NetDiskCategoryQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional() @Type(() => Number) @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional() @Type(() => Number) @IsNumber()
  pageSize?: number = 20;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  regionId?: string;
}

export class CreateNetDiskCategoryDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() icon?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() regionId?: string;
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsNumber() sortOrder?: number;
}

export class UpdateNetDiskCategoryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() icon?: string;
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsNumber() sortOrder?: number;
}

// ---- 平台 ----
export class NetDiskPlatformQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional() @Type(() => Number) @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional() @Type(() => Number) @IsNumber()
  pageSize?: number = 20;
}

export class CreateNetDiskPlatformDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() icon?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() baseUrl?: string;
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsNumber() sortOrder?: number;
}

export class UpdateNetDiskPlatformDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() icon?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() baseUrl?: string;
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsNumber() sortOrder?: number;
}

// ---- 资源 ----
export class NetDiskResourceQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional() @Type(() => Number) @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional() @Type(() => Number) @IsNumber()
  pageSize?: number = 20;

  @ApiProperty({ required: false }) @IsOptional() @IsString() keyword?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() categoryId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() platformId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() status?: string;
}

export class CreateNetDiskResourceDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() cover?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() url: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() extractCode?: string;
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsNumber() price?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() categoryId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() platformId?: string;
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsNumber() size?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() type?: string;
}

export class UpdateNetDiskResourceDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() title?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() cover?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() url?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() extractCode?: string;
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsNumber() price?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() categoryId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() platformId?: string;
}

export class UpdateNetDiskResourceStatusDto {
  @ApiProperty() @IsString() status: string;
}

// ---- 评论 ----
export class NetDiskCommentQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional() @Type(() => Number) @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional() @Type(() => Number) @IsNumber()
  pageSize?: number = 20;

  @ApiProperty({ required: false }) @IsOptional() @IsString() resourceId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() status?: string;
}

export class UpdateNetDiskCommentStatusDto {
  @ApiProperty() @IsString() status: string;
}

// ---- 下载记录 ----
export class NetDiskDownloadQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional() @Type(() => Number) @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional() @Type(() => Number) @IsNumber()
  pageSize?: number = 20;

  @ApiProperty({ required: false }) @IsOptional() @IsString() resourceId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() userId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() paid?: boolean;
}

// ---- 收益配置 ----
export class UpdateNetDiskProfitConfigDto {
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsNumber() platformCommission?: number;
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsNumber() regionCommission?: number;
  @ApiProperty({ required: false }) @IsOptional() @Type(() => Number) @IsNumber() authorShare?: number;
}
