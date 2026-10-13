import { WechatpadConfig } from './wechatpad.client';

/** 后台“朋友圈同步”页面里填写并保存到 configs 表（key = wechat.moments_config）的内容 */
export interface StoredMomentsSettings {
  enabled?: boolean;
  baseUrl?: string;
  appKey?: string;
  appSecret?: string;
  webhookSecret?: string;
  deviceId?: string;
  cdnBaseUrl?: string;
  cdnToken?: string;
  sharerUserId?: string;
  /** 海报底部品牌名，留空用学校（区域）名 */
  brandName?: string;
}

export interface WechatMomentsConfig {
  enabled: boolean;
  wechatpad: WechatpadConfig;
  webhookSecret: string;
  /** 生成小程序码时记在哪个用户名下；留空则记在作者名下 */
  sharerUserId: string;
  /** 只同步这个时间之后发布的帖子；留空则以第一次运行的时间为准，避免把历史帖子全发一遍 */
  since: string;
  fontFamily: string;
  fontFile: string;
  /** 发朋友圈必需、但还没填的项（给后台展示用的中文名） */
  missing: string[];
}

export const SETTINGS_KEY = 'wechat.moments_config';
export const SECRET_FIELDS = ['appSecret', 'webhookSecret', 'cdnToken'] as const;

/**
 * 后台保存的设置优先；没填的项再看环境变量（兼容用 .env 部署的方式）。
 */
export function loadWechatMomentsConfig(get: (key: string) => unknown, stored: StoredMomentsSettings = {}): WechatMomentsConfig {
  const env = (key: string) => {
    const value = get(key);
    return value === undefined || value === null ? '' : String(value).trim();
  };
  const pick = (value: unknown, envKey: string) => {
    const text = value === undefined || value === null ? '' : String(value).trim();
    return text || env(envKey);
  };
  const baseUrl = pick(stored.baseUrl, 'WECHATPAD_BASE_URL');
  const wechatpad: WechatpadConfig = {
    baseUrl,
    appKey: pick(stored.appKey, 'WECHATPAD_APP_KEY'),
    appSecret: pick(stored.appSecret, 'WECHATPAD_APP_SECRET'),
    deviceId: pick(stored.deviceId, 'WECHATPAD_DEVICE_ID'),
    // 图片上传服务（wxcdnd）。没单独填时先用网关地址，可在后台“测试图片上传”确认是否可用
    cdnBaseUrl: pick(stored.cdnBaseUrl, 'WECHATPAD_CDN_BASE_URL') || baseUrl,
    cdnToken: pick(stored.cdnToken, 'WECHATPAD_CDN_TOKEN'),
    timeoutMs: Number(env('WECHATPAD_TIMEOUT_MS')) || 30000,
  };
  const envEnabled = ['true', '1', 'yes', 'on'].includes(env('WECHAT_MOMENTS_ENABLED').toLowerCase());
  const required: Array<[string, string]> = [
    ['网关地址', wechatpad.baseUrl],
    ['app_key', wechatpad.appKey],
    ['app_secret', wechatpad.appSecret],
    ['设备（请先创建设备并扫码登录）', wechatpad.deviceId],
  ];
  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : envEnabled,
    wechatpad,
    webhookSecret: pick(stored.webhookSecret, 'WECHATPAD_WEBHOOK_SECRET'),
    sharerUserId: pick(stored.sharerUserId, 'WECHAT_MOMENTS_SHARER_USER_ID'),
    since: env('WECHAT_MOMENTS_SINCE'),
    fontFamily: env('WECHAT_MOMENTS_FONT') || 'Noto Sans CJK SC',
    fontFile: env('WECHAT_MOMENTS_FONT_FILE'),
    missing: required.filter(([, value]) => !value).map(([label]) => label),
  };
}

export function maskSecret(value?: string): string {
  const text = String(value || '');
  if (!text) return '';
  return `******${text.slice(-4)}`;
}

/** 后台保存：密钥类字段留空或原样提交打码值时，保留原来的值 */
export function mergeSettings(current: StoredMomentsSettings, input: Record<string, any>): StoredMomentsSettings {
  const next: StoredMomentsSettings = { ...current };
  const text = (value: unknown) => (value === undefined || value === null ? undefined : String(value).trim());
  if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
  for (const key of ['baseUrl', 'appKey', 'cdnBaseUrl', 'sharerUserId', 'deviceId', 'brandName'] as const) {
    const value = text(input[key]);
    if (value !== undefined) next[key] = key === 'baseUrl' || key === 'cdnBaseUrl' ? value.replace(/\/+$/, '') : value;
  }
  for (const key of SECRET_FIELDS) {
    const value = text(input[key]);
    if (value && !value.startsWith('******')) next[key] = value;
  }
  return next;
}
