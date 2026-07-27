import { IsOptional, IsString, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unreadOnly?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 20;
}

export class MarkAllReadDto {
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regionId?: string;
}

export class SubscribeConsentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceScene?: string;
}

export class WechatMessageLogQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() platformType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 20;
}

export class RealtimeSessionQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() platform?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() online?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regionId?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 50;
}
