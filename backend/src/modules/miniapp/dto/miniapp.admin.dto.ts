import { IsString, IsOptional, IsArray } from 'class-validator';

export class MiniappPagePathDto {
  @IsString()
  name: string;

  @IsString()
  path: string;

  @IsOptional()
  @IsString()
  desc?: string;
}

export class MiniappQrcodeDto {
  @IsString()
  path: string;

  @IsOptional()
  width?: number;

  @IsOptional()
  @IsString()
  envVersion?: string; // release | trial | develop
}

export class MiniappUploadDto {
  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  desc?: string;
}

export class SubscribeMsgTemplateDto {
  @IsString()
  tid: string; // 微信模板库中的模板ID

  @IsOptional()
  @IsArray()
  kidList?: number[]; // 选用的关键词列表
}
