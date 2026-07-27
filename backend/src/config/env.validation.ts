import * as Joi from 'joi';
import { normalizeEnvAliases } from './env-loader';

// ---------------------------------------------------------------------------
// Production guard: reject obvious placeholder / example / weak values for secrets.
// Patterns like "your-secret", "change-me", "test123", "demo", etc. are never
// allowed when NODE_ENV=production.
// ---------------------------------------------------------------------------
const PLACEHOLDER_RE =
  /^(your[-_])|(change[-_]?me)|(super[-_]secret)|(default[-_])|(example[-_])|(test[-_])|(demo[-_])|(temp[-_])|(dummy[-_])|(qwerty)|(abc123)|(123456)/i;

const productionPlaceholderCheck = (value: string, helpers: Joi.CustomHelpers) => {
  if (PLACEHOLDER_RE.test(value ?? '')) {
    return helpers.error('any.invalid', {
      message: `placeholder/weak value "${value}" is not allowed in production — set a real secret`,
    });
  }
  if (value && value.length < 16) {
    return helpers.error('string.min', {
      message: 'production secret must be at least 16 characters',
    });
  }
  return value;
};

// JWT_SECRET minimum requirements (all environments)
const validateJwtSecretFormat = (value: string, helpers: Joi.CustomHelpers) => {
  if (!value || value.length === 0) {
    return helpers.error('any.required', { message: 'JWT_SECRET is required' });
  }
  if (value.length < 32) {
    return helpers.error('string.min', { message: 'JWT_SECRET must be at least 32 characters' });
  }
  if (value.length > 512) {
    return helpers.error('string.max', { message: 'JWT_SECRET must not exceed 512 characters' });
  }
  if (PLACEHOLDER_RE.test(value)) {
    return helpers.error('any.invalid', {
      message: `"${value}" is a placeholder — set a real JWT secret`,
    });
  }
  return value;
};

const productionJwtSecret = Joi.string()
  .min(32)
  .custom(productionPlaceholderCheck, 'no-placeholder');

const developmentJwtSecret = Joi.when('NODE_ENV', {
  is: 'production',
  then: productionJwtSecret.required(),
  otherwise: Joi.string().custom(validateJwtSecretFormat, 'jwt-format').required(),
});

const productionCorsOrigin = Joi.string()
  .required()
  .invalid('true', '*')
  .messages({
    'any.required': 'CORS_ORIGIN is required in production',
    'any.invalid': 'CORS_ORIGIN must be a specific origin (e.g. https://yuntingzhe.cn), not "true" or "*"',
  });

// ---------------------------------------------------------------------------
// Minimal schema: used when SETUP_WIZARD=true or DB_IS_INSTALLED=0 (first-deploy setup mode).
// It deliberately allows the service to boot before DATABASE_URL/COS/WX values
// exist, so the setup wizard can collect and persist them. After init completes,
// set DB_IS_INSTALLED=1 and restart to activate full validation.
// ---------------------------------------------------------------------------
const minimalSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('/api/v1'),
  SETUP_WIZARD: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional(),
  SETUP_TOKEN: Joi.string().optional().allow('').default(''),
  DB_PROVIDER: Joi.string().valid('mysql', 'postgresql', 'postgres').default('mysql'),
  DB_HOST: Joi.string().optional().allow(''),
  DB_PORT: Joi.number().default(3306),
  DB_USER: Joi.string().optional().allow(''),
  DB_PASSWORD: Joi.string().optional().allow(''),
  DB_NAME: Joi.string().optional().allow(''),
  DB_SCHEMA: Joi.string().optional().allow('').default('public'),
  DB_CHARSET: Joi.string().optional().allow('').default('utf8mb4'),
  DB_IS_INSTALLED: Joi.number().valid(0, 1).optional(),
  DATABASE_URL: Joi.string().optional().allow(''),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow('').default(''),
  REDIS_DB: Joi.number().default(0),
  JWT_SECRET: Joi.string().optional().allow(''), // wizard 阶段允许稍后填写
  JWT_SECRET_ADMIN: Joi.string().optional().allow(''),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('2h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  WX_MINI_APPID: Joi.string().optional().allow(''),
  WX_MINI_SECRET: Joi.string().optional().allow(''),
  SMS_PROVIDER: Joi.string().optional().allow('').default(''),
  ALIYUN_SMS_ACCESS_KEY_ID: Joi.string().optional().allow('').default(''),
  ALIYUN_SMS_ACCESS_KEY_SECRET: Joi.string().optional().allow('').default(''),
  ALIYUN_SMS_SIGN_NAME: Joi.string().optional().allow('').default(''),
  ALIYUN_SMS_TEMPLATE_CODE: Joi.string().optional().allow('').default(''),
  ALIYUN_SMS_ENDPOINT: Joi.string().optional().allow('').default('dysmsapi.aliyuncs.com'),
  ALIYUN_SMS_REGION_ID: Joi.string().optional().allow('').default('cn-hangzhou'),
  // 以下在 wizard 模式下全部 optional
  WX_PAY_MCHID: Joi.string().optional().allow(''),
  WX_PAY_APIV3_KEY: Joi.string().optional().allow(''),
  WX_PAY_CERT_SERIAL_NO: Joi.string().optional().allow(''),
  WX_PAY_PRIVATE_KEY_PATH: Joi.string().optional().allow(''),
  WX_PAY_PLATFORM_CERT_PATH: Joi.string().optional().allow(''),
  WX_PAY_NOTIFY_URL: Joi.string().uri().optional().allow(''),
  WX_PAY_REFUND_NOTIFY_URL: Joi.string().uri().optional().allow(''),
  COS_SECRET_ID: Joi.string().optional().allow(''),
  COS_SECRET_KEY: Joi.string().optional().allow(''),
  COS_BUCKET: Joi.string().optional().allow(''),
  COS_REGION: Joi.string().optional().allow(''),
  COS_DOMAIN: Joi.string().uri().optional().allow(''),
  // 安装向导阶段允许为空；客户在向导里填写后台访问域名后再写入 CORS_ORIGIN。
  CORS_ORIGIN: Joi.string().optional().allow('').default(''),
  UPLOAD_IMAGE_MAX_SIZE_MB: Joi.number().default(10),
  UPLOAD_VIDEO_MAX_SIZE_MB: Joi.number().default(100),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
  RATE_LIMIT_WINDOW_MS: Joi.number().optional(),
  RATE_LIMIT_MAX: Joi.number().optional(),
  RATE_LIMIT_MESSAGE: Joi.string().optional().allow(''),
  AUTH_THROTTLE_LIMIT: Joi.number().default(5),
  ADMIN_AUTH_THROTTLE_LIMIT: Joi.number().default(30),
  UPLOAD_USER_THROTTLE_LIMIT: Joi.number().default(180),
  UPLOAD_BATCH_THROTTLE_LIMIT: Joi.number().default(30),
  UPLOAD_VIDEO_THROTTLE_LIMIT: Joi.number().default(20),
  UPLOAD_ADMIN_IMAGE_THROTTLE_LIMIT: Joi.number().default(180),
  UPLOAD_ADMIN_VIDEO_THROTTLE_LIMIT: Joi.number().default(20),
  UPLOAD_QRCODE_THROTTLE_LIMIT: Joi.number().default(60),
  AI_API_KEY: Joi.string().optional().allow('').default(''),
  OPENAI_API_KEY: Joi.string().optional().allow('').default(''),
  DEEPSEEK_API_KEY: Joi.string().optional().allow('').default(''),
  OPS_RESTART_COMMAND: Joi.string().allow('').default(''),
  OPS_RESTART_COOLDOWN_SECONDS: Joi.number().default(300),
  OPS_LOG_RETENTION_DAYS: Joi.number().default(30),
  LICENSING_ENABLED: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional(),
  LICENSE_SERVER: Joi.string().optional().allow('').default(''),
  LICENSE_KEY: Joi.string().optional().allow('').default(''),
  LICENSE_PUBLIC_KEY_BASE64: Joi.string().optional().allow('').default(''),
  LICENSE_DOMAIN: Joi.string().optional().allow('').default(''),
  LICENSE_API_DOMAIN: Joi.string().optional().allow('').default(''),
  LICENSE_SERVER_IP: Joi.string().optional().allow('').default(''),
  LICENSE_WECHAT_APPID: Joi.string().optional().allow('').default(''),
  LICENSE_PRODUCT: Joi.string().optional().allow('').default('lingmeng'),
  LICENSE_COMPONENT: Joi.string().optional().allow('').default('full'),
  LICENSE_CACHE_DAYS: Joi.number().default(7),
  APP_VERSION: Joi.string().optional().allow('').default(''),
});

// ---------------------------------------------------------------------------
// Full schema: used after initialization.
// Enforces all production-critical variables.
// ---------------------------------------------------------------------------
const fullSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('/api/v1'),
  SETUP_WIZARD: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional(),
  SETUP_TOKEN: Joi.string().optional().allow('').default(''),

  // Database
  DB_PROVIDER: Joi.string().valid('mysql', 'postgresql', 'postgres').default('mysql'),
  DB_HOST: Joi.string().optional().allow(''),
  DB_PORT: Joi.number().default(3306),
  DB_USER: Joi.string().optional().allow(''),
  DB_PASSWORD: Joi.string().optional().allow(''),
  DB_NAME: Joi.string().optional().allow(''),
  DB_SCHEMA: Joi.string().optional().allow('').default('public'),
  DB_CHARSET: Joi.string().optional().allow('').default('utf8mb4'),
  DB_IS_INSTALLED: Joi.number().valid(0, 1).optional(),
  DATABASE_URL: Joi.string().required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow('').default(''),
  REDIS_DB: Joi.number().default(0),

  // JWT
  JWT_SECRET: developmentJwtSecret,
  JWT_SECRET_ADMIN: Joi.string().optional().allow(''), // 为管理员 JWT 分离预留，暂可选
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('2h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // WeChat Mini Program
  // 小程序 AppID/Secret 可在后台第三方配置里维护，不能阻塞客户首次安装和后台登录。
  WX_MINI_APPID: Joi.string().optional().allow('').default(''),
  WX_MINI_SECRET: Joi.string().optional().allow('').default(''),
  SMS_PROVIDER: Joi.string().optional().allow('').default(''),
  ALIYUN_SMS_ACCESS_KEY_ID: Joi.string().optional().allow('').default(''),
  ALIYUN_SMS_ACCESS_KEY_SECRET: Joi.string().optional().allow('').default(''),
  ALIYUN_SMS_SIGN_NAME: Joi.string().optional().allow('').default(''),
  ALIYUN_SMS_TEMPLATE_CODE: Joi.string().optional().allow('').default(''),
  ALIYUN_SMS_ENDPOINT: Joi.string().optional().allow('').default('dysmsapi.aliyuncs.com'),
  ALIYUN_SMS_REGION_ID: Joi.string().optional().allow('').default('cn-hangzhou'),

  // WeChat Pay
  // 支付配置可由后台「第三方配置」维护，env 仅作为兜底。
  WX_PAY_MCHID: Joi.string().optional().allow(''),
  WX_PAY_APIV3_KEY: Joi.string().optional().allow(''),
  WX_PAY_CERT_SERIAL_NO: Joi.string().optional().allow(''),
  WX_PAY_PRIVATE_KEY_PATH: Joi.string().optional().allow(''),
  WX_PAY_PLATFORM_CERT_PATH: Joi.string().optional().allow(''),
  WX_PAY_NOTIFY_URL: Joi.string().uri().optional().allow(''),
  WX_PAY_REFUND_NOTIFY_URL: Joi.string().uri().optional().allow(''),

  // Tencent COS
  // 对象存储同样属于上线后的业务配置，允许先用安装向导完成基础后台。
  COS_SECRET_ID: Joi.string().optional().allow('').default(''),
  COS_SECRET_KEY: Joi.string().optional().allow('').default(''),
  COS_BUCKET: Joi.string().optional().allow('').default(''),
  COS_REGION: Joi.string().optional().allow('').default(''),
  COS_DOMAIN: Joi.string().uri().optional().allow(''),

  // CORS
  CORS_ORIGIN: Joi.when('NODE_ENV', {
    is: 'production',
    then: productionCorsOrigin,
    otherwise: Joi.string().default('true'),
  }),

  // Upload
  UPLOAD_IMAGE_MAX_SIZE_MB: Joi.number().default(10),
  UPLOAD_VIDEO_MAX_SIZE_MB: Joi.number().default(100),

  // Throttle
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
  RATE_LIMIT_WINDOW_MS: Joi.number().optional(),
  RATE_LIMIT_MAX: Joi.number().optional(),
  RATE_LIMIT_MESSAGE: Joi.string().optional().allow(''),
  AUTH_THROTTLE_LIMIT: Joi.number().default(5),
  ADMIN_AUTH_THROTTLE_LIMIT: Joi.number().default(30),
  UPLOAD_USER_THROTTLE_LIMIT: Joi.number().default(180),
  UPLOAD_BATCH_THROTTLE_LIMIT: Joi.number().default(30),
  UPLOAD_VIDEO_THROTTLE_LIMIT: Joi.number().default(20),
  UPLOAD_ADMIN_IMAGE_THROTTLE_LIMIT: Joi.number().default(180),
  UPLOAD_ADMIN_VIDEO_THROTTLE_LIMIT: Joi.number().default(20),
  UPLOAD_QRCODE_THROTTLE_LIMIT: Joi.number().default(60),
  AI_API_KEY: Joi.string().optional().allow('').default(''),
  OPENAI_API_KEY: Joi.string().optional().allow('').default(''),
  DEEPSEEK_API_KEY: Joi.string().optional().allow('').default(''),

  // Ops
  OPS_RESTART_COMMAND: Joi.string().allow('').default(''),
  OPS_RESTART_COOLDOWN_SECONDS: Joi.number().default(300),
  OPS_LOG_RETENTION_DAYS: Joi.number().default(30),
  LICENSING_ENABLED: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional(),
  LICENSE_SERVER: Joi.string().optional().allow('').default(''),
  LICENSE_KEY: Joi.string().optional().allow('').default(''),
  LICENSE_PUBLIC_KEY_BASE64: Joi.string().optional().allow('').default(''),
  LICENSE_DOMAIN: Joi.string().optional().allow('').default(''),
  LICENSE_API_DOMAIN: Joi.string().optional().allow('').default(''),
  LICENSE_SERVER_IP: Joi.string().optional().allow('').default(''),
  LICENSE_WECHAT_APPID: Joi.string().optional().allow('').default(''),
  LICENSE_PRODUCT: Joi.string().optional().allow('').default('lingmeng'),
  LICENSE_COMPONENT: Joi.string().optional().allow('').default('full'),
  LICENSE_CACHE_DAYS: Joi.number().default(7),
  APP_VERSION: Joi.string().optional().allow('').default(''),
});

// ---------------------------------------------------------------------------
// Public validate function
// ---------------------------------------------------------------------------
export function validate(config: Record<string, unknown>): Record<string, unknown> {
  const normalizedConfig = normalizeEnvAliases(config);
  // SETUP_WIZARD=true 或 DB_IS_INSTALLED=0 → 放宽约束, 仅须最少变量让服务启动
  const isWizard =
    normalizedConfig.SETUP_WIZARD === 'true' ||
    normalizedConfig.SETUP_WIZARD === true;
  const schema = isWizard ? minimalSchema : fullSchema;

  const { error, value } = schema.validate(normalizedConfig, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true,
  });

  if (error) {
    const mode = isWizard ? '（SETUP_WIZARD 最小模式）' : '（完整生产模式）';
    const messages = error.details.map((d) => d.message).join('\n');
    const header =
      `\n╔══════════════════════════════════════════════════════╗\n` +
      `║  ENVIRONMENT VALIDATION FAILED ${mode.padEnd(13)}║\n` +
      `╚══════════════════════════════════════════════════════╝\n`;
    throw new Error(`${header}${messages}\n`);
  }

  if (value.DATABASE_URL) {
    process.env.DATABASE_URL = String(value.DATABASE_URL);
  }
  if (value.SETUP_WIZARD !== undefined) {
    process.env.SETUP_WIZARD = String(value.SETUP_WIZARD);
  }
  if (value.THROTTLE_TTL !== undefined) {
    process.env.THROTTLE_TTL = String(value.THROTTLE_TTL);
  }
  if (value.THROTTLE_LIMIT !== undefined) {
    process.env.THROTTLE_LIMIT = String(value.THROTTLE_LIMIT);
  }

  return value;
}
