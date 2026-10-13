import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StudentIdentityQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(191) keyword?: string;
  @IsOptional()
  @IsIn(['ACTIVE', 'GRADUATED', 'WITHDRAWN'])
  enrollmentStatus?: string;
  @IsOptional()
  @IsIn(['none', 'pending', 'approved', 'rejected', 'revoked'])
  status?: string;
  @IsOptional() @IsString() @MaxLength(191) schoolId?: string;
}

export class SchoolIdentityPolicyDto {
  @IsIn(['MANUAL', 'ROSTER']) mode: 'MANUAL' | 'ROSTER';
  @IsInt() @Min(0) revision: number;
}

export class ReviewStudentIdentityDto {
  @IsIn(['approved', 'rejected', 'revoked']) status: string;
  @IsString() @MinLength(1) @MaxLength(191) applicationId: string;
  @IsInt() @Min(1) submissionVersion: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(191) correctedStudentId?: string;
  @IsOptional() @IsString() @MaxLength(191) correctedRealName?: string;
}

export class EnrollmentDto {
  @IsIn(['ACTIVE', 'GRADUATED', 'WITHDRAWN']) status: string;
  @IsInt() @Min(1) version: number;
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
}

export class ReleaseStudentBindingDto {
  @IsBoolean() @Equals(true) identityConfirmed: boolean;
  @IsInt() @Min(1) version: number;
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
}
