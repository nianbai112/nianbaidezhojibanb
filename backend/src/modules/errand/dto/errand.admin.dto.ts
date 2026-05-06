import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
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

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
