import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShareUserLimit } from '@prisma/client';

// ==================== 分享活动设置 DTO ====================

export class UpdateShareSettingsDto {
  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isEnabled?: boolean;

  @ApiPropertyOptional({ description: '活动标题' })
  @IsOptional()
  @IsString()
  activityTitle?: string;

  @ApiPropertyOptional({ description: '活动图片' })
  @IsOptional()
  @IsString()
  activityImage?: string;

  @ApiPropertyOptional({ description: '活动规则' })
  @IsOptional()
  @IsString()
  activityRules?: string;

  @ApiPropertyOptional({ description: '邀请人奖励' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  inviterReward?: number;

  @ApiPropertyOptional({ description: '被邀请人奖励' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  inviteeReward?: number;

  @ApiPropertyOptional({ description: '用户限制', enum: ShareUserLimit })
  @IsOptional()
  @IsEnum(ShareUserLimit)
  userLimit?: ShareUserLimit;

  @ApiPropertyOptional({ description: '每日邀请上限' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  dailyInviteLimit?: number;

  @ApiPropertyOptional({ description: '总邀请上限' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  totalInviteLimit?: number;

  @ApiPropertyOptional({ description: '活动开始时间' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: '活动结束时间' })
  @IsOptional()
  @IsString()
  endTime?: string;
}

// ==================== 查询 DTO ====================

export class ShareQueryDto {
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

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '区域ID' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: '开始日期' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class ShareInviteQueryDto extends ShareQueryDto {
  @ApiPropertyOptional({ description: '邀请人ID' })
  @IsOptional()
  @IsString()
  inviterId?: string;

  @ApiPropertyOptional({ description: '被邀请人ID' })
  @IsOptional()
  @IsString()
  inviteeId?: string;
}

export class ShareRewardQueryDto extends ShareQueryDto {
  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '类型' })
  @IsOptional()
  @IsString()
  type?: string;
}
