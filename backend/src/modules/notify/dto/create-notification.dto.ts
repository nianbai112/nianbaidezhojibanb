import { IsString, IsOptional, IsBoolean, IsObject, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChannelMaskDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() inApp?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() websocket?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() push?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() wechatSubscribe?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() officialAccount?: boolean;
  // AUD-P1-170: 新增邮件和短信渠道
  @ApiPropertyOptional() @IsOptional() @IsBoolean() email?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sms?: boolean;
}

export class CreateNotificationDto {
  @ApiProperty() @IsString() userId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regionId?: string;
  @ApiProperty() @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scene?: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() data?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsString() linkType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkValue?: string;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => ChannelMaskDto) channelMask?: ChannelMaskDto;
}

export class AdminBroadcastDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['all', 'region', 'user']) targetType?: 'all' | 'region' | 'user';
  @ApiPropertyOptional() @IsOptional() @IsString() linkType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkValue?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() data?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => ChannelMaskDto) channelMask?: ChannelMaskDto;
}
