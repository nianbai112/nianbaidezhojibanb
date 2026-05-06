import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ==================== 分销商管理 DTO ====================

export class DistributorQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) pageSize?: number;
  @IsOptional() @IsString() realName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() levelId?: string;
  @IsOptional() @IsString() regionId?: string;
}

export class DistributorAuditDto {
  @ApiProperty({ description: '审核结果', enum: ['approved', 'rejected'] })
  @IsString()
  status!: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional() @IsString()
  remark?: string;
}

export class UpdateDistributorDto {
  @ApiPropertyOptional({ description: '等级ID' })
  @IsOptional() @IsString()
  levelId?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional() @IsString()
  remark?: string;
}

// ==================== 分销等级 DTO ====================

export class DistributorLevelQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) pageSize?: number;
}

export class CreateDistributorLevelDto {
  @ApiProperty({ description: '等级名称' })
  @IsString()
  name!: string;

  @ApiProperty({ description: '等级序号', example: 1 })
  @IsInt() @Type(() => Number)
  level!: number;

  @ApiProperty({ description: '佣金比例(%)', example: 10 })
  @IsNumber() @Type(() => Number)
  commissionRate!: number;

  @ApiPropertyOptional({ description: '升级所需订单数' })
  @IsOptional() @IsInt() @Type(() => Number)
  conditionOrderCount?: number;

  @ApiPropertyOptional({ description: '升级所需金额' })
  @IsOptional() @IsNumber() @Type(() => Number)
  conditionTotalAmount?: number;

  @ApiPropertyOptional({ description: '图标' })
  @IsOptional() @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: '排序' })
  @IsOptional() @IsInt() @Type(() => Number)
  sortOrder?: number;
}

export class UpdateDistributorLevelDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Type(() => Number) level?: number;
  @IsOptional() @IsNumber() @Type(() => Number) commissionRate?: number;
  @IsOptional() @IsInt() @Type(() => Number) conditionOrderCount?: number;
  @IsOptional() @IsNumber() @Type(() => Number) conditionTotalAmount?: number;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() @Type(() => Number) sortOrder?: number;
}

// ==================== 分销配置 DTO ====================

export class DistributorConfigQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) pageSize?: number;
}

export class UpdateDistributorConfigDto {
  @ApiProperty({ description: '配置值' })
  @IsString()
  value!: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional() @IsString()
  description?: string;
}

// ==================== 佣金记录 DTO ====================

export class DistributorCommissionQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) pageSize?: number;
  @IsOptional() @IsString() distributorId?: string;
  @IsOptional() @IsInt() @Type(() => Number) level?: number;
  @IsOptional() @IsString() status?: string;
}

// ==================== 提现记录 DTO ====================

export class DistributorWithdrawalQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) pageSize?: number;
  @IsOptional() @IsString() distributorId?: string;
  @IsOptional() @IsString() status?: string;
}

export class ProcessWithdrawalDto {
  @ApiProperty({ description: '处理结果', enum: ['processing', 'completed', 'rejected'] })
  @IsString()
  status!: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional() @IsString()
  remark?: string;
}
