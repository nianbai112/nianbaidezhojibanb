import { IsString, IsOptional, IsNumber, IsBoolean, IsDecimal, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CircleAdminQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number = 20;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;
}

export class AdminCreateCircleDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cover?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxMembers?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  paidJoin?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  inviteCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}

export class AdminUpdateCircleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cover?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxMembers?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  paidJoin?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  inviteCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;
}

export class CirclePaymentQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number = 20;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  circleId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class CircleRegionConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxCirclesPerRegion?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxCirclesPerUser?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxCirclesCreated?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  requireAudit?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  allowPublicPost?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notice?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enablePaidJoin?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  inviteCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMin?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMax?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  memberLimit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}
