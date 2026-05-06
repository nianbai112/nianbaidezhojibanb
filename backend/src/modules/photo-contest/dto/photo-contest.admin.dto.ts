import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsDateString, IsIn, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ==================== Contest Query/Create/Update ====================

export class ContestQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: 'draft, active, voting, ended' })
  @IsOptional() @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  keyword?: string;
}

export class CreateContestDto {
  @ApiProperty({ description: '评选标题' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  cover?: string;

  @ApiPropertyOptional()
  @IsOptional()
  rules?: any;

  @ApiPropertyOptional({ description: 'draft, active, voting, ended' })
  @IsOptional() @IsString() @IsIn(['draft', 'active', 'voting', 'ended'])
  status?: string = 'draft';

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  startAt?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  endAt?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  voteEndAt?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  circleId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  createdBy?: string;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  maxVotesPerUser?: number = 3;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  maxVotesPerDay?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  maxVotesPerPhoto?: number = 1;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  allowSelfVote?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  allowAnonymousVote?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  requireCircleMember?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  rewardEnabled?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  rewardType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  rewardDetails?: any;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  adminNote?: string;
}

export class UpdateContestDto extends CreateContestDto {}

// ==================== Entry Query/Audit ====================

export class EntryQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  contestId?: string;

  @ApiPropertyOptional({ description: 'pending, approved, rejected' })
  @IsOptional() @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  userId?: string;
}

export class AuditEntryDto {
  @ApiProperty({ description: 'approved or rejected' })
  @IsString() @IsIn(['approved', 'rejected'])
  status: string;

  @ApiPropertyOptional({ description: '拒绝原因' })
  @IsOptional() @IsString()
  rejectReason?: string;
}

export class BatchAuditDto {
  @ApiProperty({ description: '作品ID数组' })
  @IsArray() @IsString({ each: true })
  ids: string[];

  @ApiProperty({ description: 'approved or rejected' })
  @IsString() @IsIn(['approved', 'rejected'])
  status: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  rejectReason?: string;
}

// ==================== Rating ====================

export class RatingQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  contestId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  entryId?: string;
}

export class AuditRatingDto {
  @ApiProperty({ description: 'approved or hidden' })
  @IsString() @IsIn(['approved', 'hidden'])
  status: string;
}

// ==================== Winner ====================

export class CreateWinnerDto {
  @ApiProperty()
  @IsString()
  entryId: string;

  @ApiProperty()
  @IsString()
  competitionId: string;

  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty({ description: '排名 1, 2, 3...' })
  @Type(() => Number) @IsInt() @Min(1)
  winnerRank: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  prizeName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  prizeDescription?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  prizeValue?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  remark?: string;
}

export class UpdateWinnerDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  prizeName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  prizeDescription?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  prizeValue?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @IsIn(['pending', 'issued', 'failed'])
  rewardStatus?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  remark?: string;
}

// ==================== Region Setting ====================

export class UpdateRegionSettingDto {
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  enableContest?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt()
  maxCompetitionsPerMonth?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  maxPhotosPerUser?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  requirePhotoApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  photoAutoApproval?: boolean;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  maxVotesPerUserDaily?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt()
  maxVotesPerCompetition?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  maxVotesPerPhoto?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  allowSelfVoting?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number)
  votingIntervalHours?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  watermarkEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  watermarkText?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @IsIn(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'])
  watermarkPosition?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  enableRating?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  enableCommenting?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  adminNotificationEmail?: string;
}
