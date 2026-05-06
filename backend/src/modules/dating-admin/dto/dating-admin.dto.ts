import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, IsDateString, IsObject } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'

// ==================== Config ====================

export class DatingConfigQueryDto {
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
  regionId?: string
}

export class UpdateDatingConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isOpen?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dailyMatchLimit?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  requireAudit?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  matchRules?: Record<string, any>
}

// ==================== Profile ====================

export class DatingProfileQueryDto {
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

  @ApiProperty({ required: false })
  @IsOptional()
  gender?: string
}

export class AuditDatingProfileDto {
  @ApiProperty({ description: 'approved | rejected' })
  @IsString()
  auditStatus: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  auditRemark?: string
}

// ==================== Match ====================

export class DatingMatchQueryDto {
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
  userId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  status?: string

  @ApiProperty({ required: false })
  @IsOptional()
  matchType?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string
}

// ==================== Package ====================

export class DatingPackageQueryDto {
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
  regionId?: string
}

export class CreateDatingPackageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regionId?: string

  @ApiProperty()
  @IsString()
  name: string

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  price: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  matchCount?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  validDays?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  rights?: Record<string, any>
}

export class UpdateDatingPackageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regionId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  matchCount?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  validDays?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  rights?: Record<string, any>
}

// ==================== Order ====================

export class DatingOrderQueryDto {
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
  status?: string

  @ApiProperty({ required: false })
  @IsOptional()
  userId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  orderNo?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string
}

export class RefundDatingOrderDto {
  @ApiProperty()
  @IsString()
  reason: string
}

// ==================== Report ====================

export class DatingReportQueryDto {
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
  status?: string
}

export class HandleDatingReportDto {
  @ApiProperty({ description: 'resolved | rejected' })
  @IsString()
  status: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  result?: string
}

// ==================== Cache ====================

export class DatingCacheClearDto {
  @ApiProperty({ required: false, description: '留空清除所有 dating:* 缓存' })
  @IsOptional()
  @IsString()
  key?: string
}
