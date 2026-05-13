import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MinLength, IsUrl } from 'class-validator';

export class SetupInitDto {
  @IsOptional()
  @IsString()
  siteName?: string;

  @IsOptional()
  @IsString()
  siteLogo?: string;

  @IsString()
  adminUsername: string;

  @IsString()
  @MinLength(12, { message: '密码长度至少 12 位' })
  adminPassword: string;

  @IsOptional()
  @IsString()
  adminPhone?: string;

  @IsOptional()
  @IsString()
  databaseUrl?: string;

  @IsOptional()
  @IsString()
  redisHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  redisPort?: number;

  @IsOptional()
  @IsString()
  redisPassword?: string;

  @IsOptional()
  @IsString()
  jwtSecret?: string;

  @IsOptional()
  @IsString()
  corsOrigin?: string;

  @IsOptional()
  @IsString()
  wxMiniAppid?: string;

  @IsOptional()
  @IsString()
  wxMiniSecret?: string;

  @IsOptional()
  @IsString()
  wxPayMchid?: string;

  @IsOptional()
  @IsString()
  wxPayApiv3Key?: string;

  @IsOptional()
  @IsString()
  wxPayCertSerialNo?: string;

  @IsOptional()
  @IsString()
  wxPayPrivateKeyPath?: string;

  @IsOptional()
  @IsString()
  wxPayPlatformCertPath?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  wxPayNotifyUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  wxPayRefundNotifyUrl?: string;

  @IsOptional()
  @IsString()
  cosSecretId?: string;

  @IsOptional()
  @IsString()
  cosSecretKey?: string;

  @IsOptional()
  @IsString()
  cosBucket?: string;

  @IsOptional()
  @IsString()
  cosRegion?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  cosDomain?: string;
}
