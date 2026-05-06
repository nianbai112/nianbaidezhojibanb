import { IsString, IsOptional, IsEnum, IsArray, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PostType } from '@prisma/client';

export class PostQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  topicId?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @IsNumber()
  pageSize?: number = 20;
}

export class CreatePostDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiProperty({ required: false, default: 'TEXT' })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType = PostType.TEXT;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  media?: { type: string; url: string; thumb?: string; width?: number; height?: number; duration?: number }[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  topics?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  voteOptions?: string[];
}

export class CommentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class ReportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  detail?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  images?: string[];
}
