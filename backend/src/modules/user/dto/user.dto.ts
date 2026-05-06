import { IsString, IsOptional, IsBoolean, IsEnum, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

export class UpdateProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  major?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dormitory?: string;
}

export class UpdateSettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  privacyLevel?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  allowFollow?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  allowComment?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  allowMessage?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyLike?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyComment?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyFollow?: boolean;
}

export class StudentVerifyDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  realName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  schoolName?: string;

  @ApiProperty({ required: false, description: '小程序字段：姓名' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, description: '小程序字段：学号' })
  @IsOptional()
  @IsString()
  student_id?: string;

  @ApiProperty({ required: false, description: '小程序字段：学校' })
  @IsOptional()
  @IsString()
  university?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  major?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cardImage?: string;

  @ApiProperty({ required: false, description: '小程序字段：学生证照片' })
  @IsOptional()
  @IsString()
  photo_url?: string;
}

export class FollowDto {
  @ApiProperty({ description: '目标用户ID' })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiProperty({ description: 'true:关注 false:取消关注' })
  @IsBoolean()
  follow: boolean;
}

export class ListQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @IsNumber()
  pageSize?: number = 20;
}
