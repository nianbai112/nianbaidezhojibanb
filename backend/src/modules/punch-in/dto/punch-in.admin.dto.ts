import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PunchInCategoryStatus } from '@prisma/client';

// ==================== 分类 DTO ====================

export class CreatePunchCategoryDto {
  @ApiProperty({ description: '分类名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '图标' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: '排序', default: 0 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '状态', enum: PunchInCategoryStatus })
  @IsOptional()
  @IsEnum(PunchInCategoryStatus)
  status?: PunchInCategoryStatus;
}

export class UpdatePunchCategoryDto {
  @ApiPropertyOptional({ description: '分类名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '图标' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: '排序' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '状态', enum: PunchInCategoryStatus })
  @IsOptional()
  @IsEnum(PunchInCategoryStatus)
  status?: PunchInCategoryStatus;
}

// ==================== 地点 DTO ====================

export class CreatePunchLocationDto {
  @ApiProperty({ description: '区域ID' })
  @IsString()
  regionId: string;

  @ApiPropertyOptional({ description: '分类ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ description: '地点名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '地址' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: '纬度' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional({ description: '经度' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  @ApiPropertyOptional({ description: '封面图' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ description: '图片列表' })
  @IsOptional()
  images?: any;

  @ApiPropertyOptional({ description: '视频列表' })
  @IsOptional()
  videos?: any;

  @ApiPropertyOptional({ description: '状态', enum: ['DRAFT', 'PUBLISHED', 'CLOSED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '是否共享全区' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isShared?: boolean;
}

export class UpdatePunchLocationDto {
  @ApiPropertyOptional({ description: '分类ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: '地点名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '地址' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: '纬度' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional({ description: '经度' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  @ApiPropertyOptional({ description: '封面图' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ description: '图片列表' })
  @IsOptional()
  images?: any;

  @ApiPropertyOptional({ description: '视频列表' })
  @IsOptional()
  videos?: any;

  @ApiPropertyOptional({ description: '状态', enum: ['DRAFT', 'PUBLISHED', 'CLOSED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '是否共享全区' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isShared?: boolean;
}

// ==================== 区域配置 DTO ====================

export class UpdatePunchConfigDto {
  @ApiPropertyOptional({ description: '是否开启打卡' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isEnabled?: boolean;

  @ApiPropertyOptional({ description: '每日最大打卡次数 (1-100)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  maxDailyCheckins?: number;

  @ApiPropertyOptional({ description: '同地点每日最大打卡次数 (1-20)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  maxLocationCheckins?: number;

  @ApiPropertyOptional({ description: '最小打卡间隔(秒, 0-86400)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  @Type(() => Number)
  minCheckinInterval?: number;

  @ApiPropertyOptional({ description: '允许同地点重复打卡' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowDuplicateLocation?: boolean;

  @ApiPropertyOptional({ description: '需要位置验证' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  requireLocationVerify?: boolean;

  @ApiPropertyOptional({ description: '位置验证半径(米, 10-5000)' })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(5000)
  @Type(() => Number)
  locationVerifyRadius?: number;

  @ApiPropertyOptional({ description: '允许上传图片' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowImageUpload?: boolean;

  @ApiPropertyOptional({ description: '最大图片数量 (0-20)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  @Type(() => Number)
  maxImageCount?: number;

  @ApiPropertyOptional({ description: '允许上传视频' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowVideoUpload?: boolean;

  @ApiPropertyOptional({ description: '最大内容长度 (10-2000)' })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(2000)
  @Type(() => Number)
  maxContentLength?: number;

  @ApiPropertyOptional({ description: '必须填写内容' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  requireContent?: boolean;

  @ApiPropertyOptional({ description: '允许评论' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowComment?: boolean;

  @ApiPropertyOptional({ description: '允许回复' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowReply?: boolean;

  @ApiPropertyOptional({ description: '最大评论长度 (10-1000)' })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(1000)
  @Type(() => Number)
  maxCommentLength?: number;

  @ApiPropertyOptional({ description: '启用排行榜' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enableRanking?: boolean;

  @ApiPropertyOptional({ description: '排行榜周期', enum: ['DAILY', 'WEEKLY', 'MONTHLY'] })
  @IsOptional()
  @IsString()
  rankingCycle?: string;

  @ApiPropertyOptional({ description: '启用共享地点' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enableSharedLocations?: boolean;

  @ApiPropertyOptional({ description: '启用用户建议' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enableUserSuggest?: boolean;

  @ApiPropertyOptional({ description: '工作日开始时' })
  @IsOptional()
  @IsString()
  workingHoursStart?: string;

  @ApiPropertyOptional({ description: '工作日结束时间' })
  @IsOptional()
  @IsString()
  workingHoursEnd?: string;

  @ApiPropertyOptional({ description: '周末允许打卡' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  weekendEnabled?: boolean;

  @ApiPropertyOptional({ description: '节假日允许打卡' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  holidayEnabled?: boolean;
}

// ==================== 查询 DTO ====================

export class PunchQueryDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  pageSize?: number;

  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '区域ID' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  status?: string;
}
