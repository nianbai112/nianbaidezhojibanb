import { BadRequestException } from '@nestjs/common';

export type RiderAppControlConfig = {
  enabled: boolean;
  maintenance: {
    enabled: boolean;
    title: string;
    message: string;
  };
  version: {
    latest: string;
    minimum: string;
    forceUpdate: boolean;
    releaseNotes: string;
    iosDownloadUrl: string;
    androidDownloadUrl: string;
  };
  notice: {
    enabled: boolean;
    title: string;
    content: string;
  };
  runtime: {
    wsPath: string;
    locationIntervalSeconds: number;
  };
  features: {
    orderPool: boolean;
    chat: boolean;
    income: boolean;
    incentives: boolean;
  };
};

export const DEFAULT_RIDER_APP_CONTROL_CONFIG: RiderAppControlConfig = {
  enabled: true,
  maintenance: {
    enabled: false,
    title: '系统维护中',
    message: '骑手 App 正在维护，请稍后再试。',
  },
  version: {
    latest: '1.0.0',
    minimum: '1.0.0',
    forceUpdate: false,
    releaseNotes: '',
    iosDownloadUrl: '',
    androidDownloadUrl: '',
  },
  notice: {
    enabled: false,
    title: '',
    content: '',
  },
  runtime: {
    wsPath: '/api/ws-native',
    locationIntervalSeconds: 30,
  },
  features: {
    orderPool: true,
    chat: true,
    income: true,
    incentives: true,
  },
};

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function validateVersion(value: string, label: string) {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    throw new BadRequestException(`${label}必须使用 x.y.z 格式`);
  }
}

function validateHttpsUrl(value: string, label: string) {
  if (!value) return;
  try {
    if (new URL(value).protocol !== 'https:') throw new Error('protocol');
  } catch {
    throw new BadRequestException(`${label}必须是 HTTPS 地址`);
  }
}

export function normalizeRiderAppControlConfig(value: unknown): RiderAppControlConfig {
  const raw = record(value);
  const maintenance = record(raw.maintenance);
  const version = record(raw.version);
  const notice = record(raw.notice);
  const runtime = record(raw.runtime);
  const features = record(raw.features);
  const interval = runtime.locationIntervalSeconds === undefined
    ? DEFAULT_RIDER_APP_CONTROL_CONFIG.runtime.locationIntervalSeconds
    : Number(runtime.locationIntervalSeconds);

  const config: RiderAppControlConfig = {
    enabled: boolean(raw.enabled, DEFAULT_RIDER_APP_CONTROL_CONFIG.enabled),
    maintenance: {
      enabled: boolean(maintenance.enabled, DEFAULT_RIDER_APP_CONTROL_CONFIG.maintenance.enabled),
      title: text(maintenance.title, DEFAULT_RIDER_APP_CONTROL_CONFIG.maintenance.title),
      message: text(maintenance.message, DEFAULT_RIDER_APP_CONTROL_CONFIG.maintenance.message),
    },
    version: {
      latest: text(version.latest, DEFAULT_RIDER_APP_CONTROL_CONFIG.version.latest),
      minimum: text(version.minimum, DEFAULT_RIDER_APP_CONTROL_CONFIG.version.minimum),
      forceUpdate: boolean(version.forceUpdate, DEFAULT_RIDER_APP_CONTROL_CONFIG.version.forceUpdate),
      releaseNotes: text(version.releaseNotes),
      iosDownloadUrl: text(version.iosDownloadUrl),
      androidDownloadUrl: text(version.androidDownloadUrl),
    },
    notice: {
      enabled: boolean(notice.enabled, DEFAULT_RIDER_APP_CONTROL_CONFIG.notice.enabled),
      title: text(notice.title),
      content: text(notice.content),
    },
    runtime: {
      wsPath: text(runtime.wsPath, DEFAULT_RIDER_APP_CONTROL_CONFIG.runtime.wsPath),
      locationIntervalSeconds: interval,
    },
    features: {
      orderPool: boolean(features.orderPool, DEFAULT_RIDER_APP_CONTROL_CONFIG.features.orderPool),
      chat: boolean(features.chat, DEFAULT_RIDER_APP_CONTROL_CONFIG.features.chat),
      income: boolean(features.income, DEFAULT_RIDER_APP_CONTROL_CONFIG.features.income),
      incentives: boolean(features.incentives, DEFAULT_RIDER_APP_CONTROL_CONFIG.features.incentives),
    },
  };

  validateVersion(config.version.latest, '最新版本号');
  validateVersion(config.version.minimum, '最低版本号');
  validateHttpsUrl(config.version.iosDownloadUrl, 'iOS 下载地址');
  validateHttpsUrl(config.version.androidDownloadUrl, 'Android 下载地址');
  if (!config.runtime.wsPath.startsWith('/') || config.runtime.wsPath.startsWith('//') || config.runtime.wsPath.includes('://')) {
    throw new BadRequestException('WebSocket 路径必须是站内相对路径');
  }
  if (!Number.isInteger(interval) || interval < 15 || interval > 300) {
    throw new BadRequestException('定位上传间隔必须是 15 至 300 秒的整数');
  }

  return config;
}
