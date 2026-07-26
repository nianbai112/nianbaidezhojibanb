import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateErrandConfigDto {
  @IsNumber()
  @IsOptional()
  basePrice?: number;

  @IsNumber()
  @IsOptional()
  distancePrice?: number;

  @IsNumber()
  @IsOptional()
  weightPrice?: number;

  @IsNumber()
  @IsOptional()
  timePrice?: number;

  @IsNumber()
  @IsOptional()
  nightPrice?: number;

  @IsNumber()
  @IsOptional()
  maxDistance?: number;

  @IsNumber()
  @IsOptional()
  maxWeight?: number;

  @IsBoolean()
  @IsOptional()
  isOpen?: boolean;

  @IsArray()
  @IsOptional()
  banners?: any[];

  @IsArray()
  @IsOptional()
  bannerJson?: any[];

  @IsArray()
  @IsOptional()
  banner_json?: any[];

  @IsObject()
  @IsOptional()
  serviceDescriptions?: Record<string, string>;

  @IsObject()
  @IsOptional()
  service_descriptions?: Record<string, string>;

  @IsObject()
  @IsOptional()
  baseFees?: Record<string, number>;

  @IsObject()
  @IsOptional()
  base_fees?: Record<string, number>;

  @IsObject()
  @IsOptional()
  serviceSwitches?: Record<string, boolean>;

  @IsObject()
  @IsOptional()
  service_switches?: Record<string, boolean>;

  @IsArray()
  @IsOptional()
  tipOptions?: any[];

  @IsArray()
  @IsOptional()
  customTaskTipOptions?: any[];

  @IsObject()
  @IsOptional()
  pageConfig?: Record<string, any>;
}

export class CreateErrandItemSizeDto {
  @IsString()
  regionId: string;

  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  weightMin?: number;

  @IsNumber()
  @IsOptional()
  weightMax?: number;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  applyTo?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

export class UpdateErrandItemSizeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  weightMin?: number;

  @IsNumber()
  @IsOptional()
  weightMax?: number;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  applyTo?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

export class CreateErrandPickupPointDto {
  @IsString()
  regionId: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsBoolean()
  @IsOptional()
  isOpen?: boolean;
}

export class UpdateErrandPickupPointDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsBoolean()
  @IsOptional()
  isOpen?: boolean;
}

export class ErrandQueryDto {
  @IsString()
  @IsOptional()
  regionId?: string;

  @IsString()
  @IsOptional()
  keyword?: string;

  @IsString()
  @IsOptional()
  applyTo?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  isOpen?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}
