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

  @ApiPropertyOptional({ description: '邀请人需绑定手机号' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  requireInviterPhone?: boolean;

  @ApiPropertyOptional({ description: '被邀请人需绑定手机号' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  requireInviteePhone?: boolean;

  @ApiPropertyOptional({ description: '邀请人需通过学生认证' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  requireInviterStudentVerify?: boolean;

  @ApiPropertyOptional({ description: '被邀请人需通过学生认证' })
  @IsOptional() @IsBoolean() @Type(() => Boolean)
  requireInviteeStudentVerify?: boolean;

  @ApiPropertyOptional({ description: '邀请人账号最小注册天数' })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  minInviterAccountAgeDays?: number;

  @ApiPropertyOptional({ description: '被邀请人账号最小注册分钟数' })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  minInviteeAccountAgeMinutes?: number;

  @ApiPropertyOptional({ description: '邀请冷却分钟' })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  inviteCooldownMinutes?: number;

  @ApiPropertyOptional({ description: '短时间窗口内最多奖励次数' })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  maxRecentInvites?: number;

  @ApiPropertyOptional({ description: '短时间窗口分钟数' })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  recentWindowMinutes?: number;

  @ApiPropertyOptional({ description: '同 IP 每日奖励上限' })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  sameIpDailyLimit?: number;

  @ApiPropertyOptional({ description: '同设备每日奖励上限' })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  sameDeviceDailyLimit?: number;

  @ApiPropertyOptional({ description: '同设备累计奖励上限' })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  sameDeviceTotalLimit?: number;

  @ApiPropertyOptional({ description: '活动总奖励预算' })
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  totalRewardBudget?: number;

  @ApiPropertyOptional({ description: '单人单次奖励封顶' })
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  singleRewardCap?: number;

  @ApiPropertyOptional({ description: '奖励发放方式 immediate/manual/delayed/qualified' })
  @IsOptional() @IsString()
  rewardReleaseMode?: string;

  @ApiPropertyOptional({ description: '延迟发放小时数' })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  rewardDelayHours?: number;

  @ApiPropertyOptional({ description: '邀请人白名单，数组或分隔字符串' })
  @IsOptional()
  inviterWhitelist?: any;

  @ApiPropertyOptional({ description: '邀请人黑名单，数组或分隔字符串' })
  @IsOptional()
  inviterBlacklist?: any;

  @ApiPropertyOptional({ description: '被邀请人黑名单，数组或分隔字符串' })
  @IsOptional()
  inviteeBlacklist?: any;

  @ApiPropertyOptional({ description: '禁止参与的手机号段，数组或分隔字符串' })
  @IsOptional()
  blockedPhonePrefixes?: any;
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
