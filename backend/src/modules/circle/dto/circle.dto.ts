import { IsString, IsOptional, IsEnum, IsNumber, IsNotEmpty, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CircleJoinType } from '@prisma/client';

export class CircleQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @IsNumber()
  pageSize?: number = 20;
}

export class CreateCircleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cover?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiProperty({ required: false, default: 'OPEN' })
  @IsOptional()
  @IsEnum(CircleJoinType)
  joinType?: CircleJoinType = CircleJoinType.OPEN;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  maxMembers?: number;
}

export class JoinCircleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remark?: string;
}
