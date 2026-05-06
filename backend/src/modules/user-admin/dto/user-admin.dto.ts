import { IsString, IsInt, IsOptional, IsBoolean, IsNumber, Min, Max, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

// ==================== 用户等级 ====================

export class UserLevelQueryDto {
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 20;
}

export class CreateUserLevelDto {
  @IsOptional() @IsString() regionId?: string;
  @Type(() => Number) @IsInt() @Min(1) levelNumber: number;
  @IsString() levelName: string;
  @IsOptional() @IsString() levelPrefix?: string;
  @Type(() => Number) @IsInt() @Min(0) requiredExp: number = 0;
  @IsOptional() @IsBoolean() isActive?: boolean = true;
  @IsOptional() @IsString() backgroundColor?: string;
  @IsOptional() @IsString() textColor?: string;
  @IsOptional() @IsString() borderColor?: string;
  @IsOptional() @Type(() => Number) @IsInt() borderWidth?: number;
  @IsOptional() @Type(() => Number) @IsInt() borderRadius?: number;
  @IsOptional() @Type(() => Number) @IsInt() fontSize?: number;
  @IsOptional() @IsString() fontWeight?: string;
  @IsOptional() @Type(() => Number) @IsInt() paddingTop?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingBottom?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingLeft?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingRight?: number;
  @IsOptional() @Type(() => Number) @IsInt() prefixFontSize?: number;
  @IsOptional() @IsString() prefixTextColor?: string;
  @IsOptional() @IsString() levelDescription?: string;
  @IsOptional() @IsString() levelBenefits?: string;
}

export class UpdateUserLevelDto {
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) levelNumber?: number;
  @IsOptional() @IsString() levelName?: string;
  @IsOptional() @IsString() levelPrefix?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) requiredExp?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() backgroundColor?: string;
  @IsOptional() @IsString() textColor?: string;
  @IsOptional() @IsString() borderColor?: string;
  @IsOptional() @Type(() => Number) @IsInt() borderWidth?: number;
  @IsOptional() @Type(() => Number) @IsInt() borderRadius?: number;
  @IsOptional() @Type(() => Number) @IsInt() fontSize?: number;
  @IsOptional() @IsString() fontWeight?: string;
  @IsOptional() @Type(() => Number) @IsInt() paddingTop?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingBottom?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingLeft?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingRight?: number;
  @IsOptional() @Type(() => Number) @IsInt() prefixFontSize?: number;
  @IsOptional() @IsString() prefixTextColor?: string;
  @IsOptional() @IsString() levelDescription?: string;
  @IsOptional() @IsString() levelBenefits?: string;
}

// ==================== 用户经验 ====================

export class UserExperienceQueryDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 20;
}

export class CreateUserExperienceDto {
  @IsString() userId: string;
  @Type(() => Number) @IsInt() changeAmount: number;
  @IsOptional() @IsString() reason?: string;
}

// ==================== 用户标签定义 ====================

export class UserTagDefQueryDto {
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 20;
}

export class CreateUserTagDefDto {
  @IsOptional() @IsString() regionId?: string;
  @IsString() tagName: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) tagLevel: number = 1;
  @IsOptional() @IsString() tagColor?: string;
  @IsOptional() @IsString() tagDesc?: string;
  @IsOptional() @IsBoolean() isSystem?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean = true;
  @IsOptional() @Type(() => Number) @IsInt() displayOrder?: number;
  @IsOptional() @IsString() backgroundColor?: string;
  @IsOptional() @IsString() textColor?: string;
  @IsOptional() @IsString() borderColor?: string;
  @IsOptional() @Type(() => Number) @IsInt() borderWidth?: number;
  @IsOptional() @Type(() => Number) @IsInt() borderRadius?: number;
  @IsOptional() @Type(() => Number) @IsInt() fontSize?: number;
  @IsOptional() @IsString() fontWeight?: string;
  @IsOptional() @Type(() => Number) @IsInt() paddingTop?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingBottom?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingLeft?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingRight?: number;
}

export class UpdateUserTagDefDto {
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @IsString() tagName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) tagLevel?: number;
  @IsOptional() @IsString() tagColor?: string;
  @IsOptional() @IsString() tagDesc?: string;
  @IsOptional() @IsBoolean() isSystem?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() displayOrder?: number;
  @IsOptional() @IsString() backgroundColor?: string;
  @IsOptional() @IsString() textColor?: string;
  @IsOptional() @IsString() borderColor?: string;
  @IsOptional() @Type(() => Number) @IsInt() borderWidth?: number;
  @IsOptional() @Type(() => Number) @IsInt() borderRadius?: number;
  @IsOptional() @Type(() => Number) @IsInt() fontSize?: number;
  @IsOptional() @IsString() fontWeight?: string;
  @IsOptional() @Type(() => Number) @IsInt() paddingTop?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingBottom?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingLeft?: number;
  @IsOptional() @Type(() => Number) @IsInt() paddingRight?: number;
}

// ==================== 地址管理 ====================

export class AddressQueryDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 20;
}

// ==================== 用户引导 ====================

export class UserGuidanceQueryDto {
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 20;
}

export class CreateUserGuidanceDto {
  @IsString() regionId: string;
  @IsString() title: string;
  @IsString() content: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isShow?: boolean;
}

export class UpdateUserGuidanceDto {
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isShow?: boolean;
}

// ==================== 余额批量清空 ====================

export class BatchBalanceClearDto {
  @IsArray() @IsString({ each: true }) userIds: string[];
  @IsOptional() @IsString() reason?: string;
}

export class BatchUserBalanceDto {
  @IsArray() @IsString({ each: true }) userIds: string[];
  @Type(() => Number) @IsNumber() amount: number;
  @IsOptional() @IsString() reason?: string;
}
