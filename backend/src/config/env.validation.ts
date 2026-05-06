import * as Joi from 'joi';

// ---------------------------------------------------------------------------
// Production guard: reject obvious placeholder / example values for secrets.
// Patterns like "your-secret", "change-me", "your_mchid", etc. are never
// allowed when NODE_ENV=production.
// ---------------------------------------------------------------------------
const PLACEHOLDER_RE = /^(your[-_])|(change[-_]?me)|(super[-_]secret)|(default[-_])|(example[-_])|(test[-_])/i;

const productionPlaceholderCheck = (value: string, helpers: Joi.CustomHelpers) => {
  if (PLACEHOLDER_RE.test(value ?? '')) {
    return helpers.error('any.invalid', {
      message: `placeholder value "${value}" is not allowed in production — set a real secret`,
    });
  }
  return value;
};

const productionJwtSecret = Joi.string()
  .min(32)
  .custom(productionPlaceholderCheck, 'no-placeholder');

const productionCorsOrigin = Joi.string()
  .required()
  .invalid('true', '*')
  .messages({
    'any.required': 'CORS_ORIGIN is required in production',
    'any.invalid': 'CORS_ORIGIN must be a specific origin (e.g. https://yuntingzhe.cn), not "true" or "*"',
  });

// ---------------------------------------------------------------------------
// Minimal schema: used when SETUP_WIZARD=true (first-deploy setup mode).
// It deliberately allows the service to boot before DATABASE_URL/COS/WX values
// exist, so the setup wizard can collect and persist them. After init completes,
// remove SETUP_WIZARD from .env and restart to activate full validation.
// ---------------------------------------------------------------------------
const minimalSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('/api/v1'),
  SETUP_TOKEN: Joi.string().optional().allow('').default(''),
  DATABASE_URL: Joi.string().optional().allow(''),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow('').default(''),
  JWT_SECRET: Joi.string().optional().allow(''), // wizard 阶段允许稍后填写
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('2h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  WX_MINI_APPID: Joi.string().optional().allow(''),
  WX_MINI_SECRET: Joi.string().optional().allow(''),
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
  CORS_ORIGIN: Joi.string().default('true'),
  UPLOAD_IMAGE_MAX_SIZE_MB: Joi.number().default(10),
  UPLOAD_VIDEO_MAX_SIZE_MB: Joi.number().default(100),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
  AUTH_THROTTLE_LIMIT: Joi.number().default(5),
  ADMIN_AUTH_THROTTLE_LIMIT: Joi.number().default(30),
  AI_API_KEY: Joi.string().optional().allow('').default(''),
  OPENAI_API_KEY: Joi.string().optional().allow('').default(''),
  DEEPSEEK_API_KEY: Joi.string().optional().allow('').default(''),
  OPS_RESTART_COMMAND: Joi.string().allow('').default(''),
  OPS_RESTART_COOLDOWN_SECONDS: Joi.number().default(300),
  OPS_LOG_RETENTION_DAYS: Joi.number().default(30),
});

// ---------------------------------------------------------------------------
// Full schema: used after initialization (no SETUP_WIZARD flag).
// Enforces all production-critical variables.
// ---------------------------------------------------------------------------
const fullSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('/api/v1'),
  SETUP_TOKEN: Joi.string().optional().allow('').default(''),

  // Database
  DATABASE_URL: Joi.string().required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow('').default(''),

  // JWT
  JWT_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: productionJwtSecret.required(),
    otherwise: Joi.string().required(),
  }),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('2h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // WeChat Mini Program
  WX_MINI_APPID: Joi.string().required(),
  WX_MINI_SECRET: Joi.string().required(),

  // WeChat Pay
  WX_PAY_MCHID: Joi.string().required(),
  WX_PAY_APIV3_KEY: Joi.string().required(),
  WX_PAY_CERT_SERIAL_NO: Joi.string().required(),
  WX_PAY_PRIVATE_KEY_PATH: Joi.string().required(),
  WX_PAY_PLATFORM_CERT_PATH: Joi.string().required(),
  WX_PAY_NOTIFY_URL: Joi.string().uri().required(),
  WX_PAY_REFUND_NOTIFY_URL: Joi.string().uri().required(),

  // Tencent COS
  COS_SECRET_ID: Joi.string().required(),
  COS_SECRET_KEY: Joi.string().required(),
  COS_BUCKET: Joi.string().required(),
  COS_REGION: Joi.string().required(),
  COS_DOMAIN: Joi.string().uri().required(),

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
  AUTH_THROTTLE_LIMIT: Joi.number().default(5),
  ADMIN_AUTH_THROTTLE_LIMIT: Joi.number().default(30),
  AI_API_KEY: Joi.string().optional().allow('').default(''),
  OPENAI_API_KEY: Joi.string().optional().allow('').default(''),
  DEEPSEEK_API_KEY: Joi.string().optional().allow('').default(''),

  // Ops
  OPS_RESTART_COMMAND: Joi.string().allow('').default(''),
  OPS_RESTART_COOLDOWN_SECONDS: Joi.number().default(300),
  OPS_LOG_RETENTION_DAYS: Joi.number().default(30),
});

// ---------------------------------------------------------------------------
// Public validate function
// ---------------------------------------------------------------------------
export function validate(config: Record<string, unknown>): Record<string, unknown> {
  // SETUP_WIZARD=true → 放宽约束, 仅须最少变量让服务启动
  const isWizard = config.SETUP_WIZARD === 'true' || config.SETUP_WIZARD === true;
  const schema = isWizard ? minimalSchema : fullSchema;

  const { error, value } = schema.validate(config, {
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

  return value;
}
