import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WxMiniLoginDto {
  @ApiProperty({ description: 'wx.login 获取的 code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: '用户昵称', required: false })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiProperty({ description: '用户头像', required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({ description: '加密数据', required: false })
  @IsOptional()
  @IsString()
  encryptedData?: string;

  @ApiProperty({ description: '加密算法初始向量', required: false })
  @IsOptional()
  @IsString()
  iv?: string;
}

export class WxPhoneDto {
  @ApiProperty({ description: '获取手机号的 code' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: '刷新令牌' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
