export type LicenseRuntimeStatusCode =
  | "DISABLED"
  | "UNCONFIGURED"
  | "OK"
  | "GRACE"
  | "EXPIRED"
  | "PAUSED"
  | "REVOKED"
  | "BINDING_MISMATCH"
  | "INVALID_KEY"
  | "SIGNATURE_INVALID"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export type LicenseRuntimeConfig = {
  enabled: boolean;
  server: string;
  licenseKey: string;
  publicKeyBase64: string;
  domain: string;
  apiDomain: string;
  serverIp: string;
  wechatAppId: string;
  product: string;
  component: string;
  version: string;
  cacheDays: number;
};

export type LicenseRuntimeRequestMeta = {
  requestIp?: string;
  origin?: string;
  host?: string;
};

export type LicenseRuntimeStatus = {
  enabled: boolean;
  configured: boolean;
  allowed: boolean;
  writable: boolean;
  code: LicenseRuntimeStatusCode;
  message: string;
  checkedAt?: string | null;
  serverTime?: string | null;
  offlineUntil?: string | null;
  customerName?: string | null;
  expireAt?: string | null;
  maxOfflineDays?: number | null;
  lastError?: string | null;
  modules?: string[];
  binding?: Record<string, unknown> | null;
  observed?: Record<string, unknown> | null;
  update?: Record<string, unknown> | null;
};
