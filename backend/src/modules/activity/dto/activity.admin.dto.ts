import { IsString, IsOptional, IsNumber, IsBoolean, IsDateString, IsIn, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ==================== Activity Query/Create/Update ====================

export class ActivityQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: 'upcoming, signup, ongoing, ended, cancelled' })
  @IsOptional() @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  typeId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  clubId?: string;
}

export class CreateActivityDto {
  @ApiProperty({ description: '活动标题' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  typeId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  clubId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  cover?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number)
  lng?: number;

  @ApiProperty({ description: '活动开始时间' })
  @IsDateString()
  startAt: string;

  @ApiProperty({ description: '活动结束时间' })
  @IsDateString()
  endAt: string;

  @ApiPropertyOptional({ description: '报名开始时间' })
  @IsOptional() @IsDateString()
  signStartAt?: string;

  @ApiPropertyOptional({ description: '报名结束时间' })
  @IsOptional() @IsDateString()
  signEndAt?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  maxPeople?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number)
  fee?: number;

  @ApiPropertyOptional({ description: '退款策略' })
  @IsOptional() @IsString()
  refundPolicy?: string;

  @ApiPropertyOptional({ description: 'public, private', default: 'public' })
  @IsOptional() @IsString() @IsIn(['public', 'private'])
  visibility?: string = 'public';

  @ApiPropertyOptional({ description: 'upcoming, signup, ongoing, ended, cancelled', default: 'upcoming' })
  @IsOptional() @IsString() @IsIn(['upcoming', 'signup', 'ongoing', 'ended', 'cancelled'])
  status?: string = 'upcoming';

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  organizer?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  contact?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number = 0;
}

export class UpdateActivityDto extends CreateActivityDto {}

// ==================== Activity Type ====================

export class ActivityTypeQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isActive?: boolean;
}

export class CreateActivityTypeDto {
  @ApiProperty({ description: '类型名称' })
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

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number = 0;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean = true;
}

export class UpdateActivityTypeDto extends CreateActivityTypeDto {}

// ==================== Package ====================

export class ActivityPackageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  activityId?: string;
}

export class CreateActivityPackageDto {
  @ApiProperty({ description: '所属活动ID' })
  @IsString()
  activityId: string;

  @ApiProperty({ description: '套餐名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '价格' })
  @Type(() => Number)
  price: number;

  @ApiPropertyOptional({ description: '原价' })
  @IsOptional() @Type(() => Number)
  originalPrice?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt()
  stock?: number = 0;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt()
  availableTickets?: number = 0;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt()
  limitPerUser?: number;

  @ApiPropertyOptional({ default: 'single' })
  @IsOptional() @IsString() @IsIn(['single', 'double', 'group'])
  ticketType?: string = 'single';

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'male, female or null' })
  @IsOptional() @IsString() @IsIn(['male', 'female'])
  genderLimit?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  saleStartAt?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  saleEndAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number = 0;
}

export class UpdateActivityPackageDto extends CreateActivityPackageDto {}

// ==================== Order ====================

export class ActivityOrderQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  activityId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  orderNo?: string;

  @ApiPropertyOptional({ description: 'unpaid, paid, refunded' })
  @IsOptional() @IsString()
  payStatus?: string;

  @ApiPropertyOptional({ description: 'pending, paid, cancelled, completed, refunded' })
  @IsOptional() @IsString()
  orderStatus?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  refundStatus?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  keyword?: string;
}

export class ActivityOrderRefundAuditDto {
  @ApiProperty({ description: 'approved or rejected' })
  @IsString() @IsIn(['approved', 'rejected'])
  status: string;

  @ApiPropertyOptional({ description: '审核原因' })
  @IsOptional() @IsString()
  reason?: string;
}

// ==================== Reward ====================

export class RewardQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  activityId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;
}

export class CreateActivityRewardDto {
  @ApiProperty({ description: '奖励名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  activityId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: 'points, balance, title', default: 'points' })
  @IsOptional() @IsString() @IsIn(['points', 'balance', 'title'])
  rewardType?: string = 'points';

  @ApiPropertyOptional({ description: '奖励值' })
  @IsOptional() @Type(() => Number)
  rewardValue?: number;

  @ApiPropertyOptional({ description: '称号ID（rewardType为title时）' })
  @IsOptional() @IsString()
  titleId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt()
  quantity?: number = 0;
}

export class UpdateActivityRewardDto extends CreateActivityRewardDto {}
