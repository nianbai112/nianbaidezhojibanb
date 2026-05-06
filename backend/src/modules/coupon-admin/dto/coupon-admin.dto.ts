import { IsString, IsOptional, IsNumber, IsEnum, IsDateString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { CouponType } from '@prisma/client'

export class CouponQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  page?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  pageSize?: number

  @ApiProperty({ required: false })
  @IsOptional()
  keyword?: string

  @ApiProperty({ required: false, enum: CouponType })
  @IsOptional()
  type?: CouponType

  @ApiProperty({ required: false })
  @IsOptional()
  status?: string

  @ApiProperty({ required: false })
  @IsOptional()
  regionId?: string
}

export class CreateCouponDto {
  @ApiProperty()
  @IsString()
  name: string

  @ApiProperty({ enum: CouponType })
  @IsEnum(CouponType)
  type: CouponType

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  value: number

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  minAmount?: number

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  totalCount: number

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  limitPerUser?: number

  @ApiProperty()
  @IsDateString()
  startAt: string

  @ApiProperty()
  @IsDateString()
  endAt: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  code?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regionId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  merchantId?: string
}

export class UpdateCouponDto extends CreateCouponDto {}

export class CouponUsageQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  page?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  pageSize?: number

  @ApiProperty({ required: false })
  @IsOptional()
  couponId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  userId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  status?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string
}
