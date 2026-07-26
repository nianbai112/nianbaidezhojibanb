import { IsString, IsOptional, IsNumber, IsDateString, IsBoolean, IsObject, IsArray } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'

// ==================== Rider ====================

export class RiderQueryDto {
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

  @ApiProperty({ required: false })
  @IsOptional()
  auditStatus?: string

  @ApiProperty({ required: false, description: 'official | part_time' })
  @IsOptional()
  riderType?: string

  @ApiProperty({ required: false })
  @IsOptional()
  status?: string

  @ApiProperty({ required: false })
  @IsOptional()
  regionId?: string
}

export class AuditRiderDto {
  @ApiProperty({ description: 'approved | rejected' })
  @IsString()
  status: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remark?: string
}

export class RiderStatusDto {
  @ApiProperty({ description: 'offline | online | busy' })
  @IsString()
  status: string
}

// ==================== Order ====================

export class DeliveryOrderQueryDto {
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
  orderNo?: string

  @ApiProperty({ required: false })
  @IsOptional()
  status?: string

  @ApiProperty({ required: false })
  @IsOptional()
  type?: string

  @ApiProperty({ required: false })
  @IsOptional()
  userId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  riderId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  regionId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string
}

export class AssignOrderDto {
  @ApiProperty()
  @IsString()
  riderId: string
}

export class CancelOrderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string
}

// ==================== Fee Config ====================

export class UpdateFeeConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  basePrice?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  distancePrice?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightPrice?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  timePrice?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  nightPrice?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxDistance?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxWeight?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isOpen?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  banners?: any[]

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  bannerJson?: any[]

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  banner_json?: any[]

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  serviceDescriptions?: Record<string, string>

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  service_descriptions?: Record<string, string>

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  baseFees?: Record<string, number>

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  base_fees?: Record<string, number>

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  serviceSwitches?: Record<string, boolean>

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  service_switches?: Record<string, boolean>

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  tipOptions?: any[]

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  customTaskTipOptions?: any[]

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  pageConfig?: Record<string, any>
}

// ==================== Page Config ====================

export class UpdatePageConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notice?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orderTips?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  defaultRiderAvatar?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  servicePhone?: string
}

// ==================== Reward/Punish ====================

export class UpdateRewardPunishDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  timeoutPenalty?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  timeoutMinutes?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  badReviewPenalty?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  goodReviewReward?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  nightReward?: number
}
