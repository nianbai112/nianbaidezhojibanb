import { validate } from './env.validation';

const PROD_BASE = {
  NODE_ENV: 'production',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  WX_MINI_APPID: 'wx1234567890abcdef',
  WX_MINI_SECRET: 'abcdef1234567890abcdef1234567890',
  WX_PAY_MCHID: '1234567890',
  WX_PAY_APIV3_KEY: 'abcdef1234567890abcdef1234567890',
  WX_PAY_CERT_SERIAL_NO: 'ABCDEF1234567890',
  WX_PAY_PRIVATE_KEY_PATH: './certs/apiclient_key.pem',
  WX_PAY_PLATFORM_CERT_PATH: './certs/wechatpay_cert.pem',
  WX_PAY_NOTIFY_URL: 'https://example.com/wxpay/notify',
  WX_PAY_REFUND_NOTIFY_URL: 'https://example.com/wxpay/refund-notify',
  COS_SECRET_ID: 'AKID1234567890abcdef',
  COS_SECRET_KEY: 'abcdef1234567890abcdef1234567890',
  COS_BUCKET: 'my-bucket-1250000000',
  COS_REGION: 'ap-guangzhou',
  COS_DOMAIN: 'https://cdn.example.com',
  CORS_ORIGIN: 'https://admin.example.com',
  JWT_ACCESS_EXPIRES_IN: '2h',
  JWT_REFRESH_EXPIRES_IN: '7d',
  UPLOAD_IMAGE_MAX_SIZE_MB: '10',
  UPLOAD_VIDEO_MAX_SIZE_MB: '100',
  THROTTLE_TTL: '60',
  THROTTLE_LIMIT: '100',
  AUTH_THROTTLE_LIMIT: '5',
  OPS_RESTART_COMMAND: '',
  OPS_RESTART_COOLDOWN_SECONDS: '300',
  OPS_LOG_RETENTION_DAYS: '30',
};

const VALID_JWT = 'this-is-a-very-long-secret-key-for-production-use-32chars';

describe('环境变量校验 - 生产安全', () => {
  describe('完整生产模式（无 SETUP_WIZARD）', () => {
    it('使用占位 JWT_SECRET 应失败', () => {
      const config = { ...PROD_BASE, JWT_SECRET: 'your-super-secret-key-change-in-production-now' };
      expect(() => validate(config)).toThrow();
    });

    it('短 JWT_SECRET 应失败', () => {
      const config = { ...PROD_BASE, JWT_SECRET: 'short' };
      expect(() => validate(config)).toThrow();
    });

    it('有效 JWT_SECRET 应成功', () => {
      const config = { ...PROD_BASE, JWT_SECRET: VALID_JWT };
      expect(() => validate(config)).not.toThrow();
    });

    it('CORS_ORIGIN 为 * 应失败', () => {
      const config = { ...PROD_BASE, JWT_SECRET: VALID_JWT, CORS_ORIGIN: '*' };
      expect(() => validate(config)).toThrow();
    });

    it('CORS_ORIGIN 为 true 应失败', () => {
      const config = { ...PROD_BASE, JWT_SECRET: VALID_JWT, CORS_ORIGIN: 'true' };
      expect(() => validate(config)).toThrow();
    });
  });

  describe('SETUP_WIZARD 最小模式', () => {
    it('无业务配置也可启动安装向导', () => {
      const config = {
        NODE_ENV: 'production',
        SETUP_WIZARD: 'true',
      };
      expect(() => validate(config)).not.toThrow();
    });

    it('提供基础配置时可启动', () => {
      const config = {
        NODE_ENV: 'production',
        SETUP_WIZARD: 'true',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        JWT_SECRET: 'minimal-secret-for-wizard-mode',
        WX_MINI_APPID: 'wx123',
        WX_MINI_SECRET: 'secret',
      };
      expect(() => validate(config)).not.toThrow();
    });

    it('SETUP_WIZARD 模式下 WX_PAY/COS 可以不填', () => {
      const config = {
        NODE_ENV: 'production',
        SETUP_WIZARD: 'true',
        DATABASE_URL: 'postgresql://host/db',
        JWT_SECRET: 'any-secret-works-in-wizard-mode',
        WX_MINI_APPID: 'wx',
        WX_MINI_SECRET: 's',
      };
      expect(() => validate(config)).not.toThrow();
    });

    it('SETUP_WIZARD 模式下 JWT_SECRET 无长度限制', () => {
      const config = {
        NODE_ENV: 'production',
        SETUP_WIZARD: 'true',
        DATABASE_URL: 'postgresql://h/d',
        JWT_SECRET: 'short',
        WX_MINI_APPID: 'a',
        WX_MINI_SECRET: 'b',
      };
      expect(() => validate(config)).not.toThrow();
    });

    it('SETUP_WIZARD 模式下 CORS_ORIGIN 可省略', () => {
      const config = {
        NODE_ENV: 'production',
        SETUP_WIZARD: 'true',
        DATABASE_URL: 'postgresql://h/d',
        JWT_SECRET: 'any-key',
        WX_MINI_APPID: 'a',
        WX_MINI_SECRET: 'b',
      };
      expect(() => validate(config)).not.toThrow();
    });
  });
});
