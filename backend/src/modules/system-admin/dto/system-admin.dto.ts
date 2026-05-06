import { IsString, IsInt, IsOptional, IsBoolean, IsNumber, IsArray, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// ==================== 邮箱配置 ====================

export class EmailConfigDto {
  @IsString() host: string;
  @Type(() => Number) @IsInt() port: number;
  @IsBoolean() secure: boolean;
  @IsString() user: string;
  @IsString() pass: string;
  @IsOptional() @IsString() fromEmail?: string;
  @IsOptional() @IsString() fromName?: string;
  @IsOptional() @IsString() subjectPrefix?: string;
  @IsOptional() @IsString() emailSignature?: string;
  @IsOptional() @Type(() => Number) @IsInt() timeout?: number;
}

export class EmailTestDto {
  @IsString() toEmail: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() content?: string;
}

// ==================== 网站信息 ====================

export class WebsiteInfoDto {
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsString() siteShortName?: string;
  @IsOptional() @IsString() siteLogo?: string;
  @IsOptional() @IsString() icpNumber?: string;
  @IsOptional() @IsString() policeNumber?: string;
  @IsOptional() @IsString() policeLink?: string;
  @IsOptional() @IsString() copyright?: string;
}

// ==================== 微信模板消息 ====================

export class WechatTemplateQueryDto {
  @IsOptional() @IsString() platformType?: string;
  @IsOptional() @IsString() templateType?: string;
  @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 20;
}

export class CreateWechatTemplateDto {
  @IsString() platformType: string;
  @IsString() templateType: string;
  @IsString() templateId: string;
  @IsOptional() @IsString() defaultPage?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateWechatTemplateDto {
  @IsOptional() @IsString() platformType?: string;
  @IsOptional() @IsString() templateType?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() defaultPage?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class BatchToggleTemplateDto {
  @IsArray() @IsString({ each: true }) ids: string[];
  @IsBoolean() enabled: boolean;
}

// ==================== 小程序页面路径 ====================

export class MiniappPageQueryDto {
  @IsOptional() @IsString() packageName?: string;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 50;
}

export class CreateMiniappPageDto {
  @IsOptional() @IsString() packageName?: string;
  @IsString() path: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateMiniappPageDto {
  @IsOptional() @IsString() packageName?: string;
  @IsOptional() @IsString() path?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

// ==================== 文件管理 ====================

export class UploadFileQueryDto {
  @IsOptional() @IsString() fileType?: string;
  @IsOptional() @IsString() scene?: string;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number = 20;
}

export class BatchDeleteFilesDto {
  @IsArray() @IsString({ each: true }) ids: string[];
}

// ==================== 小程序 CI ====================

export class WechatCIUploadDto {
  @IsString() version: string;
  @IsOptional() @IsString() desc?: string;
  @IsOptional() @IsString() privateKey?: string;
}

// ==================== 微信文章 ====================

export class WechatArticleImageDto {
  @IsString() url: string;
}
