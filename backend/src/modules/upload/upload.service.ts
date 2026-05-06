import { Injectable, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/services/redis.service';
import { PrismaService } from '../../common/services/prisma.service';
import * as crypto from 'crypto';
import axios from 'axios';

// cos-nodejs-sdk-v5 是 CommonJS 模块，导出为构造函数，需用 require 方式导入
// eslint-disable-next-line @typescript-eslint/no-var-requires
const COS = require('cos-nodejs-sdk-v5');

// =============================================================================
// 类型定义
// =============================================================================

/** 业务场景：决定不同的文件大小限制 */
export type UploadScene = 'avatar' | 'post' | 'admin' | 'region' | 'config' | 'ad';

/** 上传选项 */
interface UploadOptions {
  type: 'image' | 'video';
  folder: string;
  /** 业务场景，默认 'post'。avatar=2MB, post=10MB（可通过配置覆盖） */
  scene?: UploadScene;
}

/** 上传结果 */
export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
  type: 'image' | 'video';
}

/** 小程序码生成参数 */
export interface QrcodeOptions {
  scene: string;
  page?: string;
  width?: number;
  envVersion?: string;
  checkPath?: boolean;
}

/** 微信 access_token 响应 */
interface WxTokenResponse {
  access_token: string;
  expires_in: number;
  errcode?: number;
  errmsg?: string;
}

/** 微信 API 错误响应 */
interface WxErrorResponse {
  errcode: number;
  errmsg: string;
}

// =============================================================================
// 白名单 & 黑名单
// =============================================================================

/** 白名单：允许的图片 MIME 类型 */
const ALLOWED_IMAGE_MIMES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** 白名单：允许的视频 MIME 类型 */
const ALLOWED_VIDEO_MIMES = new Set<string>([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

/** 白名单：允许的图片后缀（不含点） */
const ALLOWED_IMAGE_EXTS = new Set<string>([
  'jpg', 'jpeg', 'png', 'webp', 'gif',
]);

/** 白名单：允许的视频后缀（不含点） */
const ALLOWED_VIDEO_EXTS = new Set<string>([
  'mp4', 'mov', 'webm',
]);

/**
 * MIME → 规范后缀映射（用于交叉校验：确保文件实际后缀与声明的 MIME 一致）
 * 若后缀不在该 MIME 的允许集合中，拒绝上传（防止 MIME 伪造）
 */
const MIME_TO_EXT: Record<string, Set<string>> = {
  'image/jpeg': new Set(['jpg', 'jpeg']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
  'image/gif': new Set(['gif']),
  'video/mp4': new Set(['mp4']),
  'video/quicktime': new Set(['mov']),
  'video/webm': new Set(['webm']),
};

/** 危险类型黑名单：脚本、HTML、可执行文件等 */
const DANGEROUS_MIMES = new Set<string>([
  'text/html', 'text/javascript', 'application/javascript', 'application/x-javascript',
  'application/x-sh', 'application/x-bat', 'application/x-msdos-program',
  'application/x-msi', 'application/x-python-code',
  'application/x-perl', 'application/x-ruby',
  'application/x-php', 'application/x-httpd-php',
  'application/java-archive', 'application/x-java-applet',
  'application/x-msdownload', 'application/vnd.microsoft.portable-executable',
  'application/x-shockwave-flash',
]);

/** 危险后缀黑名单 */
const DANGEROUS_EXTS = new Set<string>([
  'html', 'htm', 'js', 'mjs', 'php', 'phtml', 'php3', 'php4', 'php5',
  'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'rb', 'sh', 'bash', 'zsh',
  'bat', 'cmd', 'ps1', 'vbs', 'vba', 'exe', 'dll', 'so', 'dylib',
  'msi', 'com', 'scr', 'pif', 'jar', 'class', 'war', 'ear',
  'swf', 'hta', 'cpl', 'msc', 'wsf', 'wsh', 'app', 'deb', 'rpm',
]);

// =============================================================================
// 业务场景大小限制（MB）
// =============================================================================

/** 各业务场景的默认最大文件大小（MB）*/
const SCENE_SIZE_LIMITS: Record<UploadScene, number> = {
  avatar: 2,   // 头像：最大 2MB
  post: 10,    // 帖子图片：最大 10MB
  admin: 10,   // 后台通用上传
  region: 10,  // 区域封面
  config: 10,  // 系统配置图片
  ad: 10,      // 广告图片
};

// =============================================================================
// Service
// =============================================================================

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  /** 微信 access_token 缓存 key 前缀 */
  private readonly WX_TOKEN_CACHE_KEY = 'wx:access_token:';

  /** COS 客户端（延迟初始化，确保配置已加载） */
  private _cos: any = null;
  private _cosCredentialKey = '';

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  private async getStorageConfig(): Promise<Record<string, any>> {
    const dbConfig = await this.prisma.config.findUnique({ where: { key: 'storage' } });
    const value = (dbConfig?.value || {}) as Record<string, any>;

    return {
      secretId: value.secretId || value.accessKey || value.COS_SECRET_ID || this.config.get('COS_SECRET_ID'),
      secretKey: value.secretKey || value.COS_SECRET_KEY || this.config.get('COS_SECRET_KEY'),
      bucket: value.bucket || value.COS_BUCKET || this.config.get('COS_BUCKET'),
      region: value.region || value.endpoint || value.COS_REGION || this.config.get('COS_REGION'),
      domain: value.domain || value.cdnDomain || value.COS_DOMAIN || this.config.get('COS_DOMAIN'),
      maxSize: value.maxSize || value.maxUploadMb,
    };
  }

  /** 获取 COS 客户端，配置缺失时抛出 BadRequestException */
  private getCosClient(secretId: string, secretKey: string): any {
    const credentialKey = `${secretId}:${secretKey}`;
    if (this._cos && this._cosCredentialKey === credentialKey) return this._cos;

    if (!secretId || !secretKey) {
      throw new BadRequestException('腾讯云 COS SecretId 或 SecretKey 未配置，请先到后台「系统设置 / 文件存储」填写');
    }

    try {
      this._cos = new COS({ SecretId: secretId, SecretKey: secretKey });
      this._cosCredentialKey = credentialKey;
    } catch (e: any) {
      throw new BadRequestException(`COS 客户端初始化失败: ${e.message}`);
    }

    return this._cos;
  }

  /** 获取 COS Bucket 配置，缺失时抛出 BadRequestException */
  private async getBucketConfig(): Promise<{ secretId: string; secretKey: string; bucket: string; region: string; domain: string; maxSize?: number }> {
    const storage = await this.getStorageConfig();
    const secretId = String(storage.secretId || '');
    const secretKey = String(storage.secretKey || '');
    const bucket = String(storage.bucket || '');
    const region = String(storage.region || '');
    const domain = String(storage.domain || '');

    const missing: string[] = [];
    if (!secretId) missing.push('SecretId');
    if (!secretKey) missing.push('SecretKey');
    if (!bucket) missing.push('存储桶');
    if (!region) missing.push('所属地域');
    if (!domain) missing.push('访问域名');

    if (missing.length > 0) {
      throw new BadRequestException(
        `腾讯云 COS 配置不完整，缺少: ${missing.join('、')}，请先到后台「系统设置 / 文件存储」填写`,
      );
    }

    return { secretId, secretKey, bucket, region, domain, maxSize: Number(storage.maxSize || 0) || undefined };
  }

  // ============ 文件上传 ============

  /**
   * 上传文件到腾讯云 COS
   */
  async upload(file: Express.Multer.File, opts: UploadOptions): Promise<UploadResult> {
    this.validateFileExists(file);
    this.validateFileSecurity(file, opts.type, opts.scene);

    const { secretId, secretKey, bucket, region, domain, maxSize } = await this.getBucketConfig();
    if (maxSize && file.size > maxSize * 1024 * 1024) {
      throw new BadRequestException(`文件大小超过后台配置限制 ${maxSize}MB`);
    }
    const cos = this.getCosClient(secretId, secretKey);
    const key = this.generateSafeKey(file, opts.folder);
    const url = await this.putObject(cos, bucket, region, domain, key, file);

    return {
      url,
      key,
      size: file.size,
      mimeType: file.mimetype,
      type: opts.type,
    };
  }

  // ============ 小程序码生成 ============

  async generateQrcode(dto: QrcodeOptions): Promise<UploadResult> {
    if (!dto.scene || typeof dto.scene !== 'string') {
      throw new BadRequestException('scene 参数必填，且为字符串');
    }
    if (dto.scene.length > 32) {
      throw new BadRequestException('scene 长度不能超过 32 个字符');
    }

    const accessToken = await this.getWxAccessToken();
    const qrcodeBuffer = await this.callWxGetWxaCodeUnlimit(accessToken, dto);

    const { secretId, secretKey, bucket, region, domain } = await this.getBucketConfig();
    const cos = this.getCosClient(secretId, secretKey);

    const randomHex = crypto.randomBytes(16).toString('hex');
    const key = `qrcode/${Date.now()}_${randomHex}.jpg`;

    const url = await this.putBuffer(cos, bucket, region, domain, key, qrcodeBuffer, 'image/jpeg');

    this.logger.log(`小程序码生成成功: scene=${dto.scene}, key=${key}`);

    return {
      url,
      key,
      size: qrcodeBuffer.length,
      mimeType: 'image/jpeg',
      type: 'image',
    };
  }

  private async getWxAccessToken(): Promise<string> {
    const appid = this.config.get('WX_MINI_APPID');
    const secret = this.config.get('WX_MINI_SECRET');

    if (!appid || !secret) {
      throw new BadRequestException(
        '微信小程序配置缺失: WX_MINI_APPID 或 WX_MINI_SECRET 未配置，请检查环境变量',
      );
    }

    const cacheKey = `${this.WX_TOKEN_CACHE_KEY}${appid}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug('access_token 缓存命中');
      return cached;
    }

    this.logger.log('access_token 缓存未命中，请求微信接口');
    const url = 'https://api.weixin.qq.com/cgi-bin/token';
    const params = { grant_type: 'client_credential', appid, secret };

    try {
      const response = await axios.get<WxTokenResponse>(url, { params, timeout: 15000 });
      const data = response.data;

      if (data.errcode) {
        throw new BadRequestException(
          `获取微信 access_token 失败: [${data.errcode}] ${data.errmsg}`,
        );
      }

      if (!data.access_token) {
        throw new InternalServerErrorException('微信返回的 access_token 为空');
      }

      const ttl = Math.max(data.expires_in - 300, 60);
      await this.redis.set(cacheKey, data.access_token, ttl);

      this.logger.log(`access_token 已缓存，TTL=${ttl}s`);
      return data.access_token;
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      const message = error.response?.data?.errmsg
        || error.response?.statusText
        || error.message
        || '未知错误';
      this.logger.error(`请求微信 access_token 网络异常: ${message}`);
      throw new InternalServerErrorException(
        `获取微信 access_token 失败: ${message}`,
      );
    }
  }

  private async callWxGetWxaCodeUnlimit(
    accessToken: string,
    opts: QrcodeOptions,
  ): Promise<Buffer> {
    const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`;

    const body: Record<string, any> = {
      scene: opts.scene,
      width: opts.width ?? 430,
      check_path: opts.checkPath ?? true,
      env_version: opts.envVersion ?? 'release',
    };

    if (opts.page) {
      body.page = opts.page;
    }

    if (body.width < 280 || body.width > 1280) {
      throw new BadRequestException('width 取值范围 280~1280');
    }

    this.logger.debug(`调用 getwxacodeunlimit: scene=${opts.scene}, page=${opts.page || '(默认)'}, width=${body.width}`);

    try {
      const response = await axios.post(url, body, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });

      const responseData = response.data;
      const contentType = String(response.headers['content-type'] || '');

      if (contentType.includes('application/json') || contentType.includes('text/plain')) {
        let jsonStr: string;
        if (typeof responseData === 'string') {
          jsonStr = responseData;
        } else {
          jsonStr = Buffer.from(responseData).toString('utf8');
        }

        try {
          const errObj: WxErrorResponse = JSON.parse(jsonStr);
          if (errObj.errcode && errObj.errcode !== 0) {
            throw new BadRequestException(
              `生成小程序码失败: [${errObj.errcode}] ${this.translateWxError(errObj.errcode, errObj.errmsg)}`,
            );
          }
        } catch (e: any) {
          if (e instanceof BadRequestException) throw e;
          this.logger.error(`微信返回非预期内容: ${jsonStr.slice(0, 200)}`);
          throw new InternalServerErrorException('微信返回了无法识别的响应');
        }
      }

      const buffer = Buffer.isBuffer(responseData) ? responseData : Buffer.from(responseData);

      if (buffer.length < 100) {
        const raw = buffer.toString('utf8').slice(0, 300);
        this.logger.error(`小程序码 buffer 过小 (${buffer.length} bytes): ${raw}`);
        throw new InternalServerErrorException('微信返回的小程序码数据异常');
      }

      return buffer;
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      const errMsg = error.response
        ? `HTTP ${error.response.status} ${error.response.statusText}`
        : error.message;
      this.logger.error(`请求微信 getwxacodeunlimit 失败: ${errMsg}`);
      throw new InternalServerErrorException(
        `生成小程序码失败: ${errMsg}`,
      );
    }
  }

  private translateWxError(errcode: number, defaultMsg: string): string {
    const map: Record<number, string> = {
      40001: 'access_token 无效或已过期，正在自动重试',
      40003: '无效的 openid',
      40013: '无效的 appid',
      40125: '无效的 appsecret',
      40163: 'code 已使用',
      41001: '缺少 access_token 参数',
      41002: '缺少 appid 参数',
      41003: '缺少 refresh_token 参数',
      41030: 'page 页面不存在，请确认已发布',
      43001: '需要 GET 请求',
      44002: 'POST 数据包为空',
      45001: '接口调用超过限额',
      45009: '接口调用频率超限',
      45011: 'API 调用太频繁，请稍候再试',
      47001: 'POST 数据格式不正确',
      48001: 'API 功能未授权',
      85001: '微信号不存在或未关注公众号',
      85074: '小程序未关联该公众号',
      86000: '不是由第三方代小程序调用',
      86001: '不存在第三方代小程序调用',
      86002: '小程序还未设置授权给第三方',
      89249: '该主体未完成 small routine 认证',
    };
    return map[errcode] || `${defaultMsg || '未知错误'} (errcode=${errcode})`;
  }

  // ============ COS 上传 ============

  private putBuffer(
    cos: any,
    bucket: string,
    region: string,
    domain: string,
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      cos.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: key,
          Body: buffer,
          ContentLength: buffer.length,
          ContentType: contentType,
        },
        (err: any, _data: any) => {
          if (err) {
            this.logger.error(`COS putBuffer 失败: key=${key}, error=${err.message || err}`);
            return reject(
              new InternalServerErrorException(
                `小程序码上传失败，请稍后重试${err.code ? ` [${err.code}]` : ''}`,
              ),
            );
          }

          const url = `${domain.replace(/\/$/, '')}/${key}`;
          resolve(url);
        },
      );
    });
  }

  // ===========================================================================
  // 安全校验
  // ===========================================================================

  private validateFileExists(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }
    if (!file.buffer || file.size === 0) {
      throw new BadRequestException('文件内容为空，请重新选择后再上传');
    }
  }

  /**
   * 综合安全校验：
   * 1. 危险类型/后缀黑名单
   * 2. MIME 白名单
   * 3. 后缀白名单
   * 4. MIME ↔ 后缀交叉校验（防 MIME 伪造）
   * 5. 业务场景大小限制
   */
  private validateFileSecurity(
    file: Express.Multer.File,
    type: 'image' | 'video',
    scene?: UploadScene,
  ): void {
    const mimetype = (file.mimetype || '').toLowerCase();
    const ext = (file.originalname?.split('.').pop() || '').toLowerCase();

    // ---- 黑名单检查 ----
    if (DANGEROUS_MIMES.has(mimetype)) {
      throw new BadRequestException(`禁止上传危险文件类型: ${mimetype}`);
    }
    if (DANGEROUS_EXTS.has(ext)) {
      throw new BadRequestException(`禁止上传危险文件后缀: .${ext}`);
    }

    // ---- 白名单 + MIME-后缀一致性 ----
    if (type === 'image') {
      this.validateImage(mimetype, ext, file.size, scene);
    } else if (type === 'video') {
      this.validateVideo(mimetype, ext, file.size);
    }
  }

  private validateImage(
    mimetype: string,
    ext: string,
    size: number,
    scene?: UploadScene,
  ): void {
    // MIME 白名单
    if (!ALLOWED_IMAGE_MIMES.has(mimetype)) {
      throw new BadRequestException(
        `不支持的图片格式: ${mimetype || '未知'}，仅支持 ${Array.from(ALLOWED_IMAGE_MIMES).join(', ')}`,
      );
    }

    // 后缀白名单
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      throw new BadRequestException(
        `不支持的图片后缀: .${ext || '无后缀'}，仅支持 ${Array.from(ALLOWED_IMAGE_EXTS).join(', ')}`,
      );
    }

    // MIME ↔ 后缀交叉校验 — 防止 MIME 伪造攻击
    this.validateMimeExtMatch(mimetype, ext);

    // 业务场景大小限制
    const maxBytes = this.getSceneMaxBytes('image', scene);
    if (size > maxBytes) {
      const maxMB = maxBytes / 1024 / 1024;
      const actualMB = (size / 1024 / 1024).toFixed(2);
      const sceneLabel = scene || 'post';
      throw new BadRequestException(
        `图片大小 ${actualMB}MB 超过「${sceneLabel}」场景限制 ${maxMB}MB`,
      );
    }
  }

  private validateVideo(mimetype: string, ext: string, size: number): void {
    if (!ALLOWED_VIDEO_MIMES.has(mimetype)) {
      throw new BadRequestException(
        `不支持的视频格式: ${mimetype || '未知'}，仅支持 ${Array.from(ALLOWED_VIDEO_MIMES).join(', ')}`,
      );
    }

    if (!ALLOWED_VIDEO_EXTS.has(ext)) {
      throw new BadRequestException(
        `不支持的视频后缀: .${ext || '无后缀'}，仅支持 ${Array.from(ALLOWED_VIDEO_EXTS).join(', ')}`,
      );
    }

    // MIME ↔ 后缀交叉校验
    this.validateMimeExtMatch(mimetype, ext);

    const maxBytes = this.getMaxBytes('UPLOAD_VIDEO_MAX_SIZE_MB', 100);
    if (size > maxBytes) {
      const maxMB = maxBytes / 1024 / 1024;
      const actualMB = (size / 1024 / 1024).toFixed(2);
      throw new BadRequestException(
        `视频大小 ${actualMB}MB 超过限制 ${maxMB}MB`,
      );
    }
  }

  /**
   * MIME ↔ 后缀交叉校验
   *
   * 攻击者可能伪造 MIME（例如把 .html 文件声明为 image/png），
   * 此方法确保文件的实际后缀与声明的 MIME 类型一致。
   * 仅校验在白名单内的 MIME → 后缀映射。
   */
  private validateMimeExtMatch(mimetype: string, ext: string): void {
    const allowedExts = MIME_TO_EXT[mimetype];
    if (!allowedExts) {
      // 不在映射表中的 MIME（理论上不会到这里，因为前面已通过白名单检查）
      throw new BadRequestException(`未定义后缀映射的 MIME 类型: ${mimetype}`);
    }

    if (!allowedExts.has(ext)) {
      throw new BadRequestException(
        `文件后缀 .${ext} 与声明的 MIME 类型 ${mimetype} 不匹配，` +
        `允许的后缀: ${Array.from(allowedExts).map((e) => '.' + e).join(', ')}`,
      );
    }
  }

  /**
   * 获取业务场景对应的最大字节数
   *
   * - 'avatar' 场景：固定 2MB（头像不需要更大）
   * - 'post' 场景：使用 UPLOAD_IMAGE_MAX_SIZE_MB 配置，默认 10MB
   */
  private getSceneMaxBytes(type: 'image' | 'video', scene?: UploadScene): number {
    if (type === 'image' && scene && scene in SCENE_SIZE_LIMITS) {
      return SCENE_SIZE_LIMITS[scene] * 1024 * 1024;
    }
    // 帖子图片或其他未指定场景，使用环境变量配置
    return this.getMaxBytes('UPLOAD_IMAGE_MAX_SIZE_MB', 10);
  }

  /**
   * 根据业务场景解析上传目录
   */
  resolveFolder(scene: UploadScene, userId: string): string {
    switch (scene) {
      case 'avatar':
        return `users/${userId}/avatar`;
      case 'post':
        return `users/${userId}/posts`;
      case 'region':
        return `admin/regions/${userId}`;
      case 'config':
        return `admin/config/${userId}`;
      case 'ad':
        return `admin/ads/${userId}`;
      case 'admin':
      default:
        return `admin/uploads/${userId}`;
    }
  }

  private getMaxBytes(envKey: string, defaultMB: number): number {
    const mb = this.config.get<number>(envKey) ?? defaultMB;
    if (mb <= 0) {
      throw new BadRequestException(`${envKey} 配置值必须大于 0`);
    }
    return mb * 1024 * 1024;
  }

  private generateSafeKey(file: Express.Multer.File, folder: string): string {
    const safeExt = this.inferSafeExt(file.mimetype);
    const randomHex = crypto.randomBytes(16).toString('hex');
    return `${folder}/${Date.now()}_${randomHex}.${safeExt}`;
  }

  private inferSafeExt(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
    };
    return map[mimetype] || 'bin';
  }

  private putObject(
    cos: any,
    bucket: string,
    region: string,
    domain: string,
    key: string,
    file: Express.Multer.File,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      cos.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: key,
          Body: file.buffer,
          ContentLength: file.size,
        },
        (err: any, _data: any) => {
          if (err) {
            this.logger.error(`COS 上传失败: key=${key}, error=${err.message || err}`);
            const code = err?.code || '';
            const cosErrorMap: Record<string, string> = {
              NoSuchBucket: '存储桶不存在或 Bucket 名称填写错误',
              AccessDenied: '密钥权限不足，请确认 CAM 授权包含 COS 访问权限',
              InvalidAccessKeyId: 'SecretId 错误或密钥已被禁用',
              SignatureDoesNotMatch: 'SecretKey 错误，签名校验失败',
              InvalidRegion: '所属地域 Region 填写错误',
            };
            const msg = cosErrorMap[code] || `文件上传失败，请稍后重试${code ? ` [${code}]` : ''}`;
            return reject(new BadRequestException(msg));
          }

          const url = `${domain.replace(/\/$/, '')}/${key}`;
          resolve(url);
        },
      );
    });
  }
}
