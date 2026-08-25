import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveAppReviewModeDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  hideDelivery!: boolean;

  @ApiProperty()
  @IsBoolean()
  hideMall!: boolean;

  @ApiProperty()
  @IsBoolean()
  hideErrand!: boolean;

  @ApiProperty()
  @IsBoolean()
  hideWallet!: boolean;

  @ApiProperty()
  @IsBoolean()
  hideTopup!: boolean;

  @ApiProperty()
  @IsBoolean()
  hideVirtualGoods!: boolean;

  @ApiProperty()
  @IsBoolean()
  hideShareInvite!: boolean;

  @ApiProperty()
  @IsBoolean()
  hideDating!: boolean;

  @ApiProperty({ required: false, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  placeholderText?: string;
}
