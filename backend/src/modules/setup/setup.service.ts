import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { SetupInitDto } from "./dto/setup-init.dto";
import Redis from "ioredis";
import * as childProcess from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import { buildDatabaseUrl, resolveProjectRoot } from "../../config/env-loader";

const PROJECT_ROOT = resolveProjectRoot();
const SETUP_LOCK_PATH = path.resolve(PROJECT_ROOT, "storage", "setup.lock");
const LEGACY_SETUP_LOCK_PATH = path.resolve(process.cwd(), "storage", "setup.lock");
const ENV_PATH = path.resolve(PROJECT_ROOT, ".env");
const BACKEND_ENV_PATH = path.resolve(PROJECT_ROOT, "backend", ".env");
const PRISMA_DIR = path.resolve(process.cwd(), "prisma");
const execFileAsync = util.promisify(childProcess.execFile);

// 验证文件路径在项目目录内，防止路径穿越
function validateFilePath(filePath: string, allowedBase: string): void {
  const resolved = path.resolve(filePath);
  const base = path.resolve(allowedBase);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new BadRequestException(`非法文件路径: ${resolved}`);
  }
}

// 弱口令黑名单（常见默认密码及简单组合）
const WEAK_PASSWORD_PATTERNS = [
  /admin/i,
  /password/i,
  /123456/,
  /654321/,
  /qwerty/i,
  /abc123/i,
  /test\d*$/i,
  /demo\d*$/i,
  /lingmeng/i,
  /xiaoyi/i,
  /(.)\1{5,}/, // 重复单字符, eg 111111
  /^\d{6,}$/,   // 纯数字密码
];

/**
 * 统计密码中包含的字符类型数量
 */
function countCharClasses(password: string): number {
  let count = 0;
  if (/[a-z]/.test(password)) count++;
  if (/[A-Z]/.test(password)) count++;
  if (/\d/.test(password)) count++;
  if (/[^a-zA-Z\d]/.test(password)) count++;
  return count;
}

/**
 * 强密码规则:
 * - 至少 12 位
 * - 至少包含大写字母、小写字母、数字、特殊字符中的 3 类
 * - 不包含常见弱词
 */
function isStrongPassword(password: string): { valid: boolean; reason?: string } {
  if (!password || !password.trim()) return { valid: false, reason: "密码不能为空" };
  if (password.length < 12) return { valid: false, reason: "密码长度至少 12 位" };
  if (password.length > 128) return { valid: false, reason: "密码长度不可超过 128 位" };
  if (countCharClasses(password) < 3)
    return { valid: false, reason: "密码必须包含大写字母、小写字母、数字、特殊字符中至少 3 种" };
  for (const p of WEAK_PASSWORD_PATTERNS) {
    if (p.test(password)) return { valid: false, reason: "密码包含常见弱词，请使用更强密码" };
  }
  return { valid: true };
}

function validateJwtSecret(secret: string | undefined): { valid: boolean; reason?: string } {
  if (!secret || !secret.trim()) return { valid: false, reason: "JWT_SECRET 未配置" };
  const s = secret.trim();
  if (s.length < 32) return { valid: false, reason: "JWT_SECRET 长度至少 32 位" };
  if (s.length > 512) return { valid: false, reason: "JWT_SECRET 长度不可超过 512 位" };
  if (/^(change[-_]?me|your[-_].*secret|super[-_]secret|default[-_].*secret|example[-_].*secret|test[-_].*secret)/i.test(s))
    return { valid: false, reason: "JWT_SECRET 不能使用占位值，请随机生成强密钥" };
  return { valid: true };
}

const DEPLOY_CONFIG_KEYS = [
  "DB_PROVIDER",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "DB_SCHEMA",
  "DB_CHARSET",
  "SETUP_WIZARD",
  "DB_IS_INSTALLED",
  "DATABASE_URL",
  "REDIS_HOST",
  "REDIS_PORT",
  "REDIS_PASSWORD",
  "REDIS_DB",
  "JWT_SECRET",
  "JWT_SECRET_ADMIN",
  "CORS_ORIGIN",
  "WX_MINI_APPID",
  "WX_MINI_SECRET",
  "SMS_PROVIDER",
  "ALIYUN_SMS_ACCESS_KEY_ID",
  "ALIYUN_SMS_ACCESS_KEY_SECRET",
  "ALIYUN_SMS_SIGN_NAME",
  "ALIYUN_SMS_TEMPLATE_CODE",
  "ALIYUN_SMS_ENDPOINT",
  "ALIYUN_SMS_REGION_ID",
  "WX_PAY_MCHID",
  "WX_PAY_APIV3_KEY",
  "WX_PAY_CERT_SERIAL_NO",
  "WX_PAY_PRIVATE_KEY_PATH",
  "WX_PAY_PLATFORM_CERT_PATH",
  "WX_PAY_NOTIFY_URL",
  "WX_PAY_REFUND_NOTIFY_URL",
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
  "COS_BUCKET",
  "COS_REGION",
  "COS_DOMAIN",
] as const;

type DeployConfigKey = (typeof DEPLOY_CONFIG_KEYS)[number];

function maskSecret(value?: string): string {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return value.slice(0, 3) + "****" + value.slice(-3);
}

function quoteEnvValue(value: string): string {
  if (/[\s#"'\\]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function generateSecret(bytes = 48): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function compactOutput(output?: string): string {
  return (output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ")
    .slice(0, 220);
}

async function runShellCommand(script: string, timeout = 3000) {
  try {
    const result = await execFileAsync("bash", ["-lc", script], {
      timeout,
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      output: compactOutput(`${result.stdout || ""}${result.stderr || ""}`),
    };
  } catch (err: any) {
    return {
      ok: false,
      output:
        compactOutput(`${err?.stdout || ""}${err?.stderr || ""}`) ||
        err?.message ||
        "命令执行失败",
    };
  }
}

function getNodeMajor(version = process.version): number {
  const match = version.match(/^v?(\d+)/);
  return match ? Number(match[1]) : 0;
}

function getDatabaseProtocol(databaseUrl?: string): string {
  const value = (databaseUrl || "").trim();
  if (!value) return "";
  try {
    return new URL(value).protocol.replace(/:$/, "").toLowerCase();
  } catch {
    const match = value.match(/^([a-z0-9+.-]+):\/\//i);
    return match ? match[1].toLowerCase() : "";
  }
}

function isPostgresDatabaseUrl(databaseUrl?: string): boolean {
  return ["postgresql", "postgres"].includes(getDatabaseProtocol(databaseUrl));
}

function isMysqlDatabaseUrl(databaseUrl?: string): boolean {
  return getDatabaseProtocol(databaseUrl) === "mysql";
}

function isSupportedDatabaseUrl(databaseUrl?: string): boolean {
  return isMysqlDatabaseUrl(databaseUrl) || isPostgresDatabaseUrl(databaseUrl);
}

function databaseName(databaseUrl?: string): string {
  return isMysqlDatabaseUrl(databaseUrl) ? "MySQL" : "PostgreSQL";
}

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private isSetupWizardMode(): boolean {
    const installed = String(
      this.configService.get("DB_IS_INSTALLED") ?? process.env.DB_IS_INSTALLED ?? "",
    ).toLowerCase();
    const wizard = String(
      this.configService.get("SETUP_WIZARD") ?? process.env.SETUP_WIZARD ?? "",
    ).toLowerCase();
    return installed !== "1" || wizard === "true";
  }

  /** 验证 SETUP_TOKEN：生产环境必须配置并校验 token，不再允许无 token 写操作 */
  private validateSetupToken(token: string): void {
    const configuredToken = this.configService.get<string>("SETUP_TOKEN") || "";
    const nodeEnv = this.configService.get<string>("NODE_ENV") || process.env.NODE_ENV || "";

    // AUD-P0-001: 生产环境无论是否安装向导模式，都必须配置 SETUP_TOKEN 并校验
    if (nodeEnv === "production") {
      if (!configuredToken) {
        throw new ForbiddenException(
          "生产环境必须配置 SETUP_TOKEN，禁止在未配置 token 的情况下执行 setup 写操作",
        );
      }
      if (!token || token !== configuredToken) {
        throw new ForbiddenException("x-setup-token 不正确");
      }
      return;
    }

    // 非生产环境：首次安装包允许无 token，安装完成后不再放行
    if (!configuredToken && this.isSetupWizardMode()) {
      return;
    }

    if (!configuredToken) {
      // 非生产环境且未配置 SETUP_TOKEN → 放行（开发/测试兼容）
      return;
    }

    if (!token || token !== configuredToken) {
      throw new ForbiddenException("x-setup-token 不正确");
    }
  }

  /** 判断系统是否已初始化 */
  async isInitialized(): Promise<boolean> {
    // 1. 检查 setup.lock 文件
    for (const lockPath of [...new Set([SETUP_LOCK_PATH, LEGACY_SETUP_LOCK_PATH])]) {
      try {
        await fs.promises.access(lockPath, fs.constants.F_OK);
        return true;
      } catch {
        /* 文件不存在，继续检查 */
      }
    }

    // 2. 检查 Config 表
    try {
      const config = await this.prisma.config.findUnique({
        where: { key: "setup.completed" },
      });
      if (config?.value && (config.value as any) === true) return true;
    } catch {
      /* 数据库可能还没准备好 */
    }

    // 3. 检查是否存在 active 的 super_admin
    try {
      const superAdmin = await this.prisma.adminAccount.findFirst({
        where: {
          status: "active",
          roles: {
            some: { role: { code: { in: ["super_admin", "SUPER_ADMIN"] } } },
          },
        },
      });
      if (superAdmin) return true;
    } catch {
      /* 数据库可能还没准备好 */
    }

    return false;
  }

  /** 创建 setup.lock */
  async createLock(): Promise<void> {
    const dir = path.dirname(SETUP_LOCK_PATH);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      SETUP_LOCK_PATH,
      JSON.stringify({ lockedAt: new Date().toISOString() }, null, 2),
    );
  }

  /** 获取初始化状态 */
  async getStatus() {
    const initialized = await this.isInitialized();
    const setupToken = this.configService.get<string>("SETUP_TOKEN") || "";
    return {
      initialized,
      setupTokenRequired: Boolean(setupToken),
      setupWizardMode: this.isSetupWizardMode(),
    };
  }

  /** 部署环境检查（未初始化时公开；初始化后 403） */
  async checkEnvironment(token: string, dto: Partial<SetupInitDto> = {}) {
    // 验证 SETUP_TOKEN
    this.validateSetupToken(token);

    // 已初始化后禁止通过此端点探测环境配置
    if (await this.isInitialized()) {
      throw new ForbiddenException(
        "系统已初始化，环境检查仅允许在首次部署时使用",
      );
    }
    const checks: any[] = [];
    let overall: "passed" | "warning" | "failed" = "passed";

    const add = (
      name: string,
      status: "passed" | "warning" | "failed",
      message: string,
      detail?: any,
    ) => {
      checks.push({ name, status, message, detail });
      if (status === "failed") overall = "failed";
      if (status === "warning" && overall === "passed") overall = "warning";
    };

    const envUpdates = this.buildEnvUpdates(dto as SetupInitDto);
    const effective = (key: DeployConfigKey) =>
      this.effectiveConfig(key, envUpdates);

    // 安装模式
    const setupWizard = this.configService.get("SETUP_WIZARD");
    add(
      "安装模式",
      setupWizard === "true" ? "passed" : "warning",
      setupWizard === "true"
        ? "DB_IS_INSTALLED=0，允许首次初始化"
        : "建议首次部署时设置 DB_IS_INSTALLED=0，初始化完成后改为 1",
    );

    // NODE_ENV
    const nodeEnv = this.configService.get("NODE_ENV");
    add(
      "NODE_ENV",
      nodeEnv === "production" ? "passed" : "warning",
      nodeEnv || "未设置",
    );

    const nodeMajor = getNodeMajor();
    add(
      "Node.js",
      nodeMajor >= 22 ? "passed" : "failed",
      `${process.version}（要求 >= 22）`,
    );

    const systemChecks = [
      { name: "npm", script: "npm -v", required: true },
      { name: "PM2", script: "pm2 -v", required: true },
      {
        name: "MySQL / PostgreSQL",
        script: "mysql --version || mariadb --version || psql --version || postgres --version || postmaster --version",
        required: true,
      },
      {
        name: "Redis",
        script:
          "redis-cli --version || systemctl is-active redis || systemctl is-active redis-server",
        required: true,
      },
      {
        name: "Nginx",
        script: "nginx -v 2>&1 || /www/server/nginx/sbin/nginx -v 2>&1",
        required: true,
      },
    ];

    const systemResults = await Promise.all(
      systemChecks.map(async (item) => ({
        ...item,
        result: await runShellCommand(item.script),
      })),
    );
    for (const item of systemResults) {
      add(
        item.name,
        item.result.ok ? "passed" : item.required ? "failed" : "warning",
        item.result.ok ? item.result.output || "已安装" : item.result.output,
      );
    }

    // DATABASE_URL：优先检查页面刚填写的值，其次检查 .env 当前值。
    const dbUrl = effective("DATABASE_URL");
    const dbProtocol = getDatabaseProtocol(dbUrl);
    if (!dbUrl) {
      add("DATABASE_URL", "failed", "未填写 MySQL 或 PostgreSQL 数据库连接信息");
    } else if (!isSupportedDatabaseUrl(dbUrl)) {
      add(
        "DATABASE_URL",
        "failed",
        `当前项目支持 MySQL/PostgreSQL，不能使用 ${dbProtocol || "未知"}:// 连接串`,
        { url: maskSecret(dbUrl) },
      );
    } else {
      add("DATABASE_URL", "passed", `已填写 ${databaseName(dbUrl)} 连接串`, {
        url: maskSecret(dbUrl),
      });
    }

    let setupPrisma:
      | { prisma: PrismaClient | PrismaService; dispose: () => Promise<void> }
      | undefined;
    let dbConnected = false;
    if (dbUrl && isSupportedDatabaseUrl(dbUrl)) {
      try {
        const schemaChanged = await this.preparePrismaSchemaForDatabase(dbUrl);
        if (schemaChanged) {
          const generateResult = await runShellCommand("npx prisma generate", 120000);
          if (!generateResult.ok) {
            throw new Error(
              `Prisma Client 生成失败：${generateResult.output || "请检查后端依赖"}`,
            );
          }
          add(
            "Prisma Client",
            "passed",
            `已按 ${databaseName(dbUrl)} 重新生成数据库客户端`,
          );
        }
        setupPrisma = await this.getSetupPrisma(dbUrl);
        await setupPrisma.prisma.$queryRaw`SELECT 1`;
        dbConnected = true;
        add("数据库连接", "passed", "页面填写的数据库账号密码可正常连接");
      } catch (err: any) {
        add("数据库连接", "failed", err.message || "连接失败");
      }
    } else {
      add("数据库连接", "failed", "DATABASE_URL 缺失或格式不正确，无法连接");
    }

    // Redis 连接：如果页面填写了 Redis 字段，按页面值测试；否则用当前服务连接测试。
    try {
      const redisTarget = await this.pingRedisWithConfig(dto);
      add("Redis 连接", "passed", `${redisTarget} 可正常连接`);
    } catch (err: any) {
      add("Redis 连接", "failed", err.message || "连接失败");
    }

    // 发布迁移账本
    if (dbConnected && setupPrisma) {
      const migration = await this.getMigrationStatus(setupPrisma.prisma);
      add(
        "版本数据库迁移",
        migration.ready ? "passed" : "warning",
        migration.ready
          ? `最新: ${migration.latestMigration}`
          : migration.error || "未找到迁移记录，初始化时会自动尝试迁移",
      );
    } else {
      add("Prisma Migration", "failed", "数据库未连接，无法检查");
    }

    // JWT_SECRET
    const jwtSecret = effective("JWT_SECRET");
    const jwtCheck = validateJwtSecret(jwtSecret);
    add(
      "JWT_SECRET",
      !jwtSecret || jwtCheck.valid ? "passed" : "failed",
      !jwtSecret ? "安装时会自动生成，客户无需手写" : jwtCheck.reason || "已配置",
      jwtSecret ? { value: maskSecret(jwtSecret) } : undefined,
    );

    // CORS_ORIGIN
    const corsOrigin = effective("CORS_ORIGIN");
    add(
      "CORS_ORIGIN",
      corsOrigin && corsOrigin !== "true" && corsOrigin !== "*"
        ? "passed"
        : "warning",
      corsOrigin || "未配置",
    );

    add(
      "腾讯云 COS",
      "passed",
      "首次安装不检查；登录后台后在对象存储/上传配置里补齐",
    );

    add(
      "微信小程序",
      "passed",
      "首次安装不检查；登录后台后在第三方配置里补齐 AppID 和 Secret",
    );

    add(
      "微信支付",
      "passed",
      "首次安装不检查；开通支付后在后台支付配置里补齐",
    );

    // 超级管理员
    let hasSuperAdmin = false;
    let isWeakPassword = false;
    if (dbConnected && setupPrisma) {
      try {
        const superAdmin = await setupPrisma.prisma.adminAccount.findFirst({
          include: { roles: { select: { role: { select: { code: true } } } } },
        });
        if (superAdmin) {
          hasSuperAdmin = superAdmin.roles.some(
            (r: any) =>
              r.role.code === "super_admin" || r.role.code === "SUPER_ADMIN",
          );
          if (hasSuperAdmin) {
            const bcrypt = await import("bcrypt");
            const testPasswords = [
              "Admin@123456",
              "admin@123",
              "password@123",
              "12345678",
            ];
            for (const pw of testPasswords) {
              if (await bcrypt.compare(pw, superAdmin.passwordHash)) {
                isWeakPassword = true;
                break;
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    add(
      "超级管理员",
      hasSuperAdmin ? "passed" : "warning",
      dbConnected ? (hasSuperAdmin ? "已存在" : "尚未创建，初始化时会创建") : "数据库未连接，无法检查",
    );

    if (hasSuperAdmin) {
      add(
        "弱口令检查",
        isWeakPassword ? "failed" : "passed",
        isWeakPassword
          ? "超级管理员密码为弱口令，请立即修改"
          : "密码强度合格",
      );
    }

    if (setupPrisma) {
      await setupPrisma.dispose();
    }

    // 目录可写
    const dirsToCheck = ["storage", "logs", "uploads"];
    for (const dirName of dirsToCheck) {
      const dirPath = path.resolve(process.cwd(), dirName);
      try {
        await fs.promises.mkdir(dirPath, { recursive: true });
        const testFile = path.join(dirPath, `.setup-write-test-${Date.now()}`);
        await fs.promises.writeFile(testFile, "ok");
        await fs.promises.unlink(testFile);
        add(`目录可写 (${dirName})`, "passed", "可读写");
      } catch (err: any) {
        add(`目录可写 (${dirName})`, "failed", err.message || "不可写");
      }
    }

    return { overall, checks };
  }

  private buildEnvUpdates(
    dto: SetupInitDto,
  ): Partial<Record<DeployConfigKey, string>> {
    const mapping: Array<[DeployConfigKey, keyof SetupInitDto]> = [
      ["DB_PROVIDER", "databaseProvider"],
      ["DATABASE_URL", "databaseUrl"],
      ["REDIS_HOST", "redisHost"],
      ["REDIS_PORT", "redisPort"],
      ["REDIS_PASSWORD", "redisPassword"],
      ["JWT_SECRET", "jwtSecret"],
      ["CORS_ORIGIN", "corsOrigin"],
      ["WX_MINI_APPID", "wxMiniAppid"],
      ["WX_MINI_SECRET", "wxMiniSecret"],
      ["SMS_PROVIDER", "smsProvider"],
      ["ALIYUN_SMS_ACCESS_KEY_ID", "aliyunSmsAccessKeyId"],
      ["ALIYUN_SMS_ACCESS_KEY_SECRET", "aliyunSmsAccessKeySecret"],
      ["ALIYUN_SMS_SIGN_NAME", "aliyunSmsSignName"],
      ["ALIYUN_SMS_TEMPLATE_CODE", "aliyunSmsTemplateCode"],
      ["ALIYUN_SMS_ENDPOINT", "aliyunSmsEndpoint"],
      ["ALIYUN_SMS_REGION_ID", "aliyunSmsRegionId"],
      ["WX_PAY_MCHID", "wxPayMchid"],
      ["WX_PAY_APIV3_KEY", "wxPayApiv3Key"],
      ["WX_PAY_CERT_SERIAL_NO", "wxPayCertSerialNo"],
      ["WX_PAY_PRIVATE_KEY_PATH", "wxPayPrivateKeyPath"],
      ["WX_PAY_PLATFORM_CERT_PATH", "wxPayPlatformCertPath"],
      ["WX_PAY_NOTIFY_URL", "wxPayNotifyUrl"],
      ["WX_PAY_REFUND_NOTIFY_URL", "wxPayRefundNotifyUrl"],
      ["COS_SECRET_ID", "cosSecretId"],
      ["COS_SECRET_KEY", "cosSecretKey"],
      ["COS_BUCKET", "cosBucket"],
      ["COS_REGION", "cosRegion"],
      ["COS_DOMAIN", "cosDomain"],
    ];

    const updates: Partial<Record<DeployConfigKey, string>> = {};
    for (const [envKey, dtoKey] of mapping) {
      const raw = dto[dtoKey];
      if (raw === undefined || raw === null) continue;
      const value = String(raw).trim();
      if (value !== "") updates[envKey] = value;
    }
    return updates;
  }

  private async writeEnvUpdates(
    updates: Partial<Record<DeployConfigKey, string>>,
  ) {
    const entries = Object.entries(updates).filter(
      ([, value]) => value !== undefined,
    );
    if (entries.length === 0) return 0;

    // 验证 .env 文件路径在项目根目录下，防止路径穿越
    validateFilePath(ENV_PATH, PROJECT_ROOT);

    // 生产环境额外警告（但允许初始化时写 .env）
    const nodeEnv = this.configService.get("NODE_ENV");
    if (nodeEnv === "production") {
      this.logger.warn("在生产环境中写入 .env 文件");
    }

    const updateContent = (content: string) => {
    const lines = content ? content.split(/\r?\n/) : [];
    const seen = new Set<string>();
    const nextLines = lines.map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=/);
      if (!match) return line;
      const key = match[1] as DeployConfigKey;
      if (!DEPLOY_CONFIG_KEYS.includes(key) || updates[key] === undefined)
        return line;
      seen.add(key);
      return `${key}=${quoteEnvValue(String(updates[key]))}`;
    });

    const missing = entries.filter(([key]) => !seen.has(key));
    if (
      missing.length > 0 &&
      nextLines.length > 0 &&
      nextLines[nextLines.length - 1] !== ""
    ) {
      nextLines.push("");
    }
    for (const [key, value] of missing) {
      nextLines.push(`${key}=${quoteEnvValue(String(value))}`);
    }

      return nextLines.join("\n").replace(/\n*$/, "\n");
    };

    let content = "";
    try {
      content = await fs.promises.readFile(ENV_PATH, "utf8");
    } catch {
      content = "";
    }

    await fs.promises.writeFile(
      ENV_PATH,
      updateContent(content),
    );
    for (const [key, value] of entries) {
      process.env[key] = String(value);
    }

    if (BACKEND_ENV_PATH !== ENV_PATH) {
      try {
        validateFilePath(BACKEND_ENV_PATH, PROJECT_ROOT);
        await fs.promises.mkdir(path.dirname(BACKEND_ENV_PATH), { recursive: true });
        let backendContent = "";
        try {
          backendContent = await fs.promises.readFile(BACKEND_ENV_PATH, "utf8");
        } catch {
          backendContent = content;
        }
        await fs.promises.writeFile(BACKEND_ENV_PATH, updateContent(backendContent));
      } catch (err: any) {
        this.logger.warn(`同步 backend/.env 失败: ${err?.message || err}`);
      }
    }
    return entries.length;
  }

  private effectiveConfig(
    key: DeployConfigKey,
    updates: Partial<Record<DeployConfigKey, string>>,
  ) {
    if (key === "DATABASE_URL") {
      return buildDatabaseUrl({
        ...process.env,
        DATABASE_URL:
          updates.DATABASE_URL ||
          this.configService.get<string>("DATABASE_URL") ||
          process.env.DATABASE_URL ||
          "",
      });
    }

    return (
      updates[key] ||
      this.configService.get<string>(key) ||
      process.env[key] ||
      ""
    );
  }

  private async getSetupPrisma(databaseUrl: string) {
    if (databaseUrl) {
      const RuntimePrismaClient = this.loadRuntimePrismaClient();
      const prisma = new RuntimePrismaClient({
        datasources: { db: { url: databaseUrl } },
      });
      try {
        await prisma.$connect();
      } catch (err) {
        await prisma.$disconnect().catch(() => undefined);
        throw err;
      }
      return { prisma, dispose: () => prisma.$disconnect() };
    }
    await this.prisma.$connect();
    return { prisma: this.prisma, dispose: async () => undefined };
  }

  private loadRuntimePrismaClient(): typeof PrismaClient {
    try {
      const cacheKeys = Object.keys(require.cache || {});
      for (const key of cacheKeys) {
        if (
          key.includes(`${path.sep}@prisma${path.sep}client`) ||
          key.includes(`${path.sep}.prisma${path.sep}client`)
        ) {
          delete require.cache[key];
        }
      }
      return require("@prisma/client").PrismaClient || PrismaClient;
    } catch {
      return PrismaClient;
    }
  }

  private async getMigrationStatus(prisma: PrismaClient | PrismaService) {
    try {
      const result = await prisma.$queryRaw`
        SELECT migration_name, finished_at
        FROM lingmeng_schema_migrations
        WHERE status = 'APPLIED' AND finished_at IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 1
      `;
      const latest =
        Array.isArray(result) && result.length > 0 ? (result[0] as any) : null;
      return {
        ready: !!latest,
        latestMigration: latest?.migration_name || null,
      };
    } catch (err: any) {
      return {
        ready: false,
        latestMigration: null,
        error: err?.message || "无法读取 _prisma_migrations",
      };
    }
  }

  private async pingRedisWithConfig(dto: Partial<SetupInitDto> = {}) {
    const redisHost =
      (dto.redisHost || "").trim() ||
      this.configService.get<string>("REDIS_HOST") ||
      "127.0.0.1";
    const redisPort = Number(
      dto.redisPort || this.configService.get<number>("REDIS_PORT") || 6379,
    );
    const redisPassword =
      dto.redisPassword !== undefined
        ? String(dto.redisPassword || "")
        : this.configService.get<string>("REDIS_PASSWORD") || "";
    const hasRedisInput =
      dto.redisHost !== undefined ||
      dto.redisPort !== undefined ||
      dto.redisPassword !== undefined;

    if (hasRedisInput) {
      const redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword || undefined,
        lazyConnect: true,
        connectTimeout: 2000,
        commandTimeout: 2000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      try {
        await redis.connect();
        await redis.ping();
      } finally {
        redis.disconnect();
      }
    } else {
      await this.redis.get("setup:health");
    }

    return `${redisHost}:${redisPort}`;
  }

  private toDatabasePrismaSchema(raw: string, provider: "mysql" | "postgresql") {
    const withoutProvider = raw.replace(
      /provider\s*=\s*"(mysql|postgresql)"/,
      `provider = "${provider}"`,
    );
    if (provider === "mysql") {
      return withoutProvider.replace(
        /^\s*previewFeatures\s*=\s*\[[^\]]*"fullTextSearch"[^\]]*\]\s*\r?\n?/m,
        "",
      );
    }
    return withoutProvider;
  }

  private async ensurePrismaVariantFiles(baseSchema: string) {
    const mysqlPath = path.join(PRISMA_DIR, "schema.mysql.prisma");
    const postgresPath = path.join(PRISMA_DIR, "schema.postgresql.prisma");
    validateFilePath(mysqlPath, PROJECT_ROOT);
    validateFilePath(postgresPath, PROJECT_ROOT);

    try {
      await fs.promises.access(mysqlPath, fs.constants.F_OK);
    } catch {
      await fs.promises.writeFile(
        mysqlPath,
        this.toDatabasePrismaSchema(baseSchema, "mysql"),
      );
    }

    try {
      await fs.promises.access(postgresPath, fs.constants.F_OK);
    } catch {
      await fs.promises.writeFile(
        postgresPath,
        this.toDatabasePrismaSchema(baseSchema, "postgresql"),
      );
    }
  }

  private async preparePrismaSchemaForDatabase(databaseUrl: string) {
    const provider = isMysqlDatabaseUrl(databaseUrl) ? "mysql" : "postgresql";
    const source = path.join(PRISMA_DIR, `schema.${provider}.prisma`);
    const target = path.join(PRISMA_DIR, "schema.prisma");
    validateFilePath(source, PROJECT_ROOT);
    validateFilePath(target, PROJECT_ROOT);
    let baseSchema = "";
    try {
      baseSchema = await fs.promises.readFile(target, "utf8");
    } catch (err: any) {
      throw new BadRequestException(
        `Prisma schema 文件不存在: ${err?.message || err}`,
      );
    }

    await this.ensurePrismaVariantFiles(baseSchema);

    let nextSchema = "";
    try {
      nextSchema = await fs.promises.readFile(source, "utf8");
    } catch {
      nextSchema = this.toDatabasePrismaSchema(baseSchema, provider);
      await fs.promises.writeFile(source, nextSchema);
    }

    const currentSchema = await fs.promises.readFile(target, "utf8");
    if (currentSchema === nextSchema) return false;

    await fs.promises.writeFile(target, nextSchema);
    this.logger.log(`Prisma schema switched to ${provider}`);
    return true;
  }

  private scheduleRestartAfterSetup() {
    const managedByPm2 = Boolean(process.env.pm_id || process.env.PM2_HOME);
    if (!managedByPm2) {
      this.logger.warn("初始化完成后需要手动重启后端服务，当前进程未检测到 PM2 管理");
      return false;
    }

    this.logger.log("初始化完成，准备重启 PM2 后端进程以重新加载 .env");
    setTimeout(() => {
      this.logger.log("执行安装后自重启");
      process.exit(0);
    }, 2000).unref();
    return true;
  }

  /** 系统初始化 */
  async init(dto: SetupInitDto, token: string) {
    // 1. 验证 SETUP_TOKEN
    this.validateSetupToken(token);

    // 2. 检查是否已初始化
    if (await this.isInitialized()) {
      throw new ForbiddenException("系统已初始化，无法重复执行");
    }

    const { siteName, siteLogo, adminUsername, adminPassword, adminPhone } =
      dto;

    // 4. 校验核心必填字段（在写 .env 之前校验，避免写入后才报错）
    if (!adminUsername?.trim()) throw new BadRequestException("管理员账号必填");
    if (!adminPassword?.trim()) throw new BadRequestException("管理员密码必填");

    const passCheck = isStrongPassword(adminPassword);
    if (!passCheck.valid) throw new BadRequestException(passCheck.reason || "密码不符合要求");

    // 构建 envUpdates 并校验核心配置项
    const envUpdates = this.buildEnvUpdates(dto);

    const databaseUrl = this.effectiveConfig("DATABASE_URL", envUpdates);
    if (!databaseUrl) {
      throw new BadRequestException(
        "数据库未配置：请在安装向导里填写数据库地址、账号、密码和库名",
      );
    }
    if (!isSupportedDatabaseUrl(databaseUrl)) {
      throw new BadRequestException(
        "DATABASE_URL 格式不正确：当前项目支持 MySQL 或 PostgreSQL，请填写 mysql:// 或 postgresql:// 开头的连接串",
      );
    }
    let jwtSecret = this.effectiveConfig("JWT_SECRET", envUpdates);
    if (!jwtSecret) {
      jwtSecret = generateSecret();
      envUpdates.JWT_SECRET = jwtSecret;
    }
    if (!this.effectiveConfig("JWT_SECRET_ADMIN", envUpdates)) {
      envUpdates.JWT_SECRET_ADMIN = generateSecret();
    }
    const jwtCheck = validateJwtSecret(jwtSecret);
    if (!jwtCheck.valid) {
      throw new BadRequestException(`JWT_SECRET 无效: ${jwtCheck.reason}`);
    }
    const corsOrigin = this.effectiveConfig("CORS_ORIGIN", envUpdates);
    if (!corsOrigin || corsOrigin === "true" || corsOrigin === "*") {
      throw new BadRequestException(
        "CORS_ORIGIN 未配置：请填写后台访问域名，例如 https://admin.example.com",
      );
    }

    // 4. 写入 .env（校验通过后才执行写操作）
    const writtenCount = await this.writeEnvUpdates(envUpdates);
    this.logger.log(`Wrote ${writtenCount} env keys to .env`);

    await this.preparePrismaSchemaForDatabase(databaseUrl);
    const generateResult = await runShellCommand("npx prisma generate", 120000);
    if (!generateResult.ok) {
      return {
        success: false,
        initialized: false,
        requiresMigration: true,
        message:
          "部署配置已写入 .env，但 Prisma Client 生成失败。请检查服务器依赖后重试。",
        migrateOutput: generateResult.output,
        nextSteps: [
          `确认 ${databaseName(databaseUrl)} 数据库配置正确`,
          "在服务器 backend 目录执行 npx prisma generate",
          "重启后端服务",
          "再次打开 /setup 执行初始化",
        ],
      };
    }

    const { prisma, dispose } = await this.getSetupPrisma(databaseUrl);
    try {
      // 测试数据库连接
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (err: any) {
        throw new BadRequestException(`数据库连接失败: ${err.message}`);
      }

      // 测试 Redis 连接
      try {
        await this.pingRedisWithConfig(dto);
      } catch (err: any) {
        throw new BadRequestException(`Redis 连接失败: ${err.message}`);
      }

      let migration = await this.getMigrationStatus(prisma);
      if (!migration.ready) {
        const command = "node scripts/migrate-release.cjs install && npm run db:generate";
        const migrateResult = await runShellCommand(command, 30 * 60 * 1000);
        if (migrateResult.ok) {
          migration = await this.getMigrationStatus(prisma);
        }
        if (!migrateResult.ok || !migration.ready) {
          this.logger.warn(
            `自动数据库迁移未完成: ${migrateResult.output || migration.error || "unknown"}`,
          );
          return {
            success: false,
            initialized: false,
            requiresMigration: true,
            message:
              "部署配置已写入 .env，但自动数据库迁移未完成。请检查数据库权限后重试，或手动执行迁移命令。",
            migration,
            migrateOutput: migrateResult.output,
            nextSteps: [
              `确认 ${databaseName(databaseUrl)} 数据库、账号、密码正确，且账号有建表权限`,
              "在服务器执行 node scripts/migrate-release.cjs install && npm run db:generate",
              "重启后端服务",
              "再次打开 /setup 执行初始化",
            ],
          };
        }
      }
      if (!migration.ready) {
        return {
          success: false,
          initialized: false,
          requiresMigration: true,
          message:
            "部署配置已写入 .env，但数据库迁移尚未完成。请检查数据库权限后重试。",
          migration,
          nextSteps: [
            "在服务器执行 node scripts/migrate-release.cjs install && npm run db:generate",
            "重启后端服务",
            "再次打开 /setup 完成管理员和基础数据初始化",
          ],
        };
      }

      // Seed 角色、权限、菜单
      await this.seedBaseData(prisma);

      // 创建超级管理员
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      const existing = await prisma.adminAccount.findFirst({
        where: { username: adminUsername },
      });

      let adminAccount;
      if (existing) {
        adminAccount = await prisma.adminAccount.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            realName: adminUsername,
            phone: adminPhone || null,
            status: "active",
          },
        });
      } else {
        adminAccount = await prisma.adminAccount.create({
          data: {
            username: adminUsername,
            passwordHash,
            realName: adminUsername,
            phone: adminPhone || null,
            status: "active",
          },
        });
      }

      // 绑定 super_admin 角色
      const superRole = await prisma.adminRole.findUnique({
        where: { code: "super_admin" },
      });
      if (superRole) {
        const existingRole = await prisma.adminAccountRole.findFirst({
          where: { accountId: adminAccount.id, roleId: superRole.id },
        });
        if (!existingRole) {
          await prisma.adminAccountRole.create({
            data: { accountId: adminAccount.id, roleId: superRole.id },
          });
        }
      }

      // 写入 Config（所有 secret 值已通过 maskSecret 脱敏）
      await prisma.config.upsert({
        where: { key: "setup.completed" },
        update: { value: true, updatedBy: adminAccount.id },
        create: {
          key: "setup.completed",
          value: true,
          group: "system",
          desc: "系统初始化完成标记",
          createdBy: adminAccount.id,
          updatedBy: adminAccount.id,
        },
      });
      await prisma.config.upsert({
        where: { key: "site.name" },
        update: { value: siteName || "灵萌生活" },
        create: {
          key: "site.name",
          value: siteName || "灵萌生活",
          group: "site",
          desc: "站点名称",
        },
      });
      if (siteLogo) {
        await prisma.config.upsert({
          where: { key: "site.logo" },
          update: { value: siteLogo },
          create: {
            key: "site.logo",
            value: siteLogo,
            group: "site",
            desc: "站点 Logo",
          },
        });
      }
      await prisma.config.upsert({
        where: { key: "setup.deployment" },
        update: {
          value: {
            configuredKeys: Object.keys(envUpdates),
            databaseUrl: maskSecret(databaseUrl),
            cosDomain: this.effectiveConfig("COS_DOMAIN", envUpdates) || null,
            wxMiniAppid: maskSecret(this.effectiveConfig("WX_MINI_APPID", envUpdates)),
            updatedAt: new Date().toISOString(),
          },
          updatedBy: adminAccount.id,
        },
        create: {
          key: "setup.deployment",
          value: {
            configuredKeys: Object.keys(envUpdates),
            databaseUrl: maskSecret(databaseUrl),
            cosDomain: this.effectiveConfig("COS_DOMAIN", envUpdates) || null,
            wxMiniAppid: maskSecret(this.effectiveConfig("WX_MINI_APPID", envUpdates)),
            updatedAt: new Date().toISOString(),
          },
          group: "system",
          desc: "安装向导部署配置摘要",
          createdBy: adminAccount.id,
          updatedBy: adminAccount.id,
        },
      });

      // 创建 setup.lock
      await this.createLock();

      await this.writeEnvUpdates({
        DB_IS_INSTALLED: "1",
        SETUP_WIZARD: "false",
      });
      const autoRestart = this.scheduleRestartAfterSetup();

      // 记录日志（仅存脱敏后的摘要值）
      try {
        await prisma.serverActionLog.create({
          data: {
            adminId: adminAccount.id,
            action: "system_init",
            status: "success",
            reason: "首次部署初始化",
            detail: { siteName, adminUsername },
          },
        });
      } catch {
        /* ignore */
      }

      return {
        success: true,
        initialized: true,
        requiresRestart: true,
        autoRestart,
        next: "/admin/login",
        adminId: adminAccount.id,
        hint: autoRestart
          ? "系统已初始化，后端正在自动重启并重新加载配置。稍等片刻后登录后台，并在系统配置里补齐小程序、对象存储、支付等业务配置。"
          : "系统已初始化，已自动写入 DB_IS_INSTALLED=1。请手动重启后端后登录后台，并在系统配置里补齐小程序、对象存储、支付等业务配置。",
      };
    } finally {
      await dispose();
    }
  }

  /** 基础 Seed（角色/权限/菜单） */
  private async seedBaseData(prisma: PrismaClient | PrismaService) {
    // 创建 super_admin 角色
    const superRole = await prisma.adminRole.upsert({
      where: { code: "super_admin" },
      update: {},
      create: {
        name: "超级管理员",
        code: "super_admin",
        description: "系统超级管理员，拥有所有权限",
        isSystem: true,
        sortOrder: 0,
      },
    });

    const regionManagerRole = await prisma.adminRole.upsert({
      where: { code: "region_manager" },
      update: {},
      create: {
        name: "区域负责人",
        code: "region_manager",
        description: "管理指定区域的小程序运营账号",
        isSystem: true,
        sortOrder: 30,
      },
    });

    // 基础权限 — 与 prisma/seed.ts 保持同步
    // 安装向导执行 seed 仅需给 super_admin 分配全量权限，菜单在前端由 menus.ts+权限码控制
    const basePermissions = [
      // 仪表盘
      { code: "dashboard:view", name: "查看仪表盘", module: "dashboard", action: "view" },
      // 用户管理
      { code: "user:view", name: "查看用户", module: "user", action: "view" },
      { code: "user:edit", name: "编辑用户", module: "user", action: "edit" },
      { code: "user:ban", name: "封禁用户", module: "user", action: "ban" },
      { code: "user:delete", name: "删除用户", module: "user", action: "delete" },
      { code: "user:cert", name: "学生认证审核", module: "user", action: "cert" },
      { code: "user:balance", name: "用户余额管理", module: "user", action: "balance" },
      { code: "user:level", name: "用户等级管理", module: "user", action: "level" },
      // 内容管理
      { code: "post:view", name: "查看帖子", module: "post", action: "view" },
      { code: "post:audit", name: "审核帖子", module: "post", action: "audit" },
      { code: "post:delete", name: "删除帖子", module: "post", action: "delete" },
      { code: "post:top", name: "置顶帖子", module: "post", action: "top" },
      // 评论
      { code: "comment:view", name: "查看评论", module: "comment", action: "view" },
      { code: "comment:audit", name: "审核评论", module: "comment", action: "audit" },
      { code: "comment:delete", name: "删除评论", module: "comment", action: "delete" },
      // 举报
      { code: "report:handle", name: "处理举报", module: "report", action: "handle" },
      { code: "circle:manage", name: "圈子管理", module: "circle", action: "manage" },
      { code: "community:view", name: "查看社群管理", module: "community", action: "view" },
      { code: "community:edit", name: "编辑社群", module: "community", action: "edit" },
      { code: "community:config", name: "社群配置", module: "community", action: "config" },
      { code: "topic:manage", name: "话题管理", module: "topic", action: "manage" },
      // 商家/商品
      { code: "merchant:view", name: "查看商家", module: "merchant", action: "view" },
      { code: "merchant:audit", name: "审核商家", module: "merchant", action: "audit" },
      { code: "merchant:batch", name: "批量操作商家", module: "merchant", action: "batch" },
      { code: "merchant:printer", name: "管理打印机配置", module: "merchant", action: "printer" },
      { code: "merchant:price", name: "管理商品加价", module: "merchant", action: "price" },
      { code: "merchant:collection", name: "管理商品采集", module: "merchant", action: "collection" },
      { code: "merchant:config", name: "管理商家配置", module: "merchant", action: "config" },
      { code: "product:view", name: "查看商品", module: "product", action: "view" },
      { code: "product:edit", name: "管理商品", module: "product", action: "edit" },
      { code: "product:batch", name: "批量操作商品", module: "product", action: "batch" },
      // 评价
      { code: "review:manage", name: "评价管理", module: "review", action: "manage" },
      // 促销
      { code: "promotion:manage", name: "促销管理", module: "promotion", action: "manage" },
      // 运费模板
      { code: "freight:manage", name: "运费模板管理", module: "freight", action: "manage" },
      // 订单
      { code: "order:view", name: "查看订单", module: "order", action: "view" },
      { code: "order:refund", name: "退款处理", module: "order", action: "refund" },
      // 财务
      { code: "finance:view", name: "查看财务", module: "finance", action: "view" },
      { code: "finance:balance-adjust", name: "调整用户余额", module: "finance", action: "balance-adjust" },
      { code: "withdraw:view", name: "查看提现", module: "withdraw", action: "view" },
      { code: "withdraw:audit", name: "审核提现", module: "withdraw", action: "audit" },
      { code: "withdraw:complete", name: "打款确认", module: "withdraw", action: "complete" },
      { code: "finance:reconciliation", name: "对账管理", module: "finance", action: "reconciliation" },
      { code: "finance:transfer", name: "支付宝转账", module: "finance", action: "transfer" },
      { code: "finance:withdraw", name: "提现管理", module: "finance", action: "withdraw" },
      // 区域
      { code: "region:view", name: "查看区域", module: "region", action: "view" },
      { code: "region:edit", name: "管理区域", module: "region", action: "edit" },
      // 管理员
      { code: "admin:view", name: "查看管理员", module: "admin", action: "view" },
      { code: "admin:create", name: "创建管理员", module: "admin", action: "create" },
      { code: "admin:edit", name: "编辑管理员", module: "admin", action: "edit" },
      { code: "admin:delete", name: "删除管理员", module: "admin", action: "delete" },
      { code: "admin:forcePasswordReset", name: "强制重置密码", module: "admin", action: "forcePasswordReset" },
      { code: "admin:unlock", name: "解锁账号", module: "admin", action: "unlock" },
      // 系统
      { code: "system:config", name: "系统配置", module: "system", action: "config" },
      { code: "system:logs", name: "查看日志", module: "system", action: "logs" },
      { code: "system:upload", name: "文件管理", module: "system", action: "upload" },
      { code: "system:admin", name: "管理员管理", module: "system", action: "admin" },
      // 城市代理
      { code: "city:view", name: "查看城市代理", module: "city_agent", action: "view" },
      { code: "city:audit", name: "审核城市代理", module: "city_agent", action: "audit" },
      { code: "city:settlement", name: "城市代理结算", module: "city_agent", action: "settlement" },
      // 配送
      { code: "rider:view", name: "查看骑手", module: "rider", action: "view" },
      { code: "rider:audit", name: "审核骑手", module: "rider", action: "audit" },
      { code: "delivery:view", name: "查看配送", module: "delivery", action: "view" },
      { code: "errand:config:view", name: "查看跑腿配置", module: "errand", action: "config:view" },
      { code: "errand:config:update", name: "更新跑腿配置", module: "errand", action: "config:update" },
      { code: "errand:item-size:view", name: "查看物品大小", module: "errand", action: "item-size:view" },
      { code: "errand:item-size:create", name: "创建物品大小", module: "errand", action: "item-size:create" },
      { code: "errand:item-size:update", name: "更新物品大小", module: "errand", action: "item-size:update" },
      { code: "errand:item-size:delete", name: "删除物品大小", module: "errand", action: "item-size:delete" },
      { code: "errand:pickup-point:view", name: "查看取件点", module: "errand", action: "pickup-point:view" },
      { code: "errand:pickup-point:create", name: "创建取件点", module: "errand", action: "pickup-point:create" },
      { code: "errand:pickup-point:update", name: "更新取件点", module: "errand", action: "pickup-point:update" },
      { code: "errand:pickup-point:delete", name: "删除取件点", module: "errand", action: "pickup-point:delete" },
      { code: "errand:stats:view", name: "查看跑腿统计", module: "errand", action: "stats:view" },
      { code: "errand:view", name: "查看跑腿管理", module: "errand", action: "view" },
      { code: "errand:config", name: "配置跑腿管理", module: "errand", action: "config" },
      // 运营
      { code: "coupon:view", name: "查看优惠券", module: "coupon", action: "view" },
      { code: "coupon:edit", name: "管理优惠券", module: "coupon", action: "edit" },
      { code: "coupon:records", name: "查看优惠券使用记录", module: "coupon", action: "records" },
      { code: "coupon:redeem-code:view", name: "查看卡券兑换码", module: "coupon", action: "redeem-code:view" },
      { code: "coupon:redeem-code:create", name: "生成卡券兑换码", module: "coupon", action: "redeem-code:create" },
      { code: "coupon:redeem-code:edit", name: "管理卡券兑换码", module: "coupon", action: "redeem-code:edit" },
      { code: "activity:view", name: "查看活动", module: "activity", action: "view" },
      { code: "activity:edit", name: "管理活动", module: "activity", action: "edit" },
      { code: "activity:audit", name: "审核活动订单", module: "activity", action: "audit" },
      { code: "activity:order", name: "查看活动订单", module: "activity", action: "order" },
      { code: "groupbuy:view", name: "查看团购", module: "groupbuy", action: "view" },
      { code: "groupbuy:edit", name: "管理团购", module: "groupbuy", action: "edit" },
      { code: "groupbuy:order", name: "订单核销退款", module: "groupbuy", action: "order" },
      { code: "groupbuy:config", name: "配置团购", module: "groupbuy", action: "config" },
      // 消息
      { code: "message:view", name: "查看消息", module: "message", action: "view" },
      { code: "message:manage", name: "管理消息(屏蔽/撤回)", module: "message", action: "manage" },
      { code: "content:manage", name: "消息违规管理", module: "content", action: "manage" },
      // 审核中心
      { code: "audit:view", name: "查看审核中心", module: "audit", action: "view" },
      // 内容审核
      { code: "content:view", name: "查看内容", module: "content", action: "view" },
      { code: "content:edit", name: "编辑内容", module: "content", action: "edit" },
      { code: "content:audit", name: "审核内容", module: "content", action: "audit" },
      { code: "content:delete", name: "删除内容", module: "content", action: "delete" },
      // 用户标签
      { code: "user:tag", name: "用户标签管理", module: "user", action: "tag" },
      // 财务结算
      { code: "finance:settlement", name: "结算管理", module: "finance", action: "settlement" },
      // 配置管理
      { code: "config:view", name: "查看配置", module: "config", action: "view" },
      { code: "config:edit", name: "编辑配置", module: "config", action: "edit" },
      // 机器人管理
      { code: "bot:view", name: "查看机器人", module: "bot", action: "view" },
      { code: "bot:edit", name: "编辑机器人", module: "bot", action: "edit" },
      { code: "bot:task", name: "机器人任务", module: "bot", action: "task" },
      { code: "bot:list", name: "查看机器人列表", module: "bot", action: "list" },
      { code: "robot:view", name: "查看机器人运营", module: "robot", action: "view" },
      { code: "robot:post", name: "机器人发帖", module: "robot", action: "post" },
      { code: "robot:comment", name: "机器人评论", module: "robot", action: "comment" },
      // 运维中心
      { code: "ops:view", name: "查看运维中心", module: "ops", action: "view" },
      { code: "ops:restart", name: "重启后端服务", module: "ops", action: "restart" },
      // 二手交易
      { code: "secondhand:view", name: "查看二手交易", module: "secondhand", action: "view" },
      { code: "secondhand:audit", name: "审核二手交易", module: "secondhand", action: "audit" },
      { code: "secondhand:config", name: "二手配置", module: "secondhand", action: "config" },
      // 打卡管理
      { code: "punchIn:location:list", name: "查看打卡点列表", module: "punchIn", action: "location:list" },
      { code: "punchIn:location:create", name: "创建打卡点", module: "punchIn", action: "location:create" },
      { code: "punchIn:location:update", name: "更新打卡点", module: "punchIn", action: "location:update" },
      { code: "punchIn:location:delete", name: "删除打卡点", module: "punchIn", action: "location:delete" },
      { code: "punchIn:record:list", name: "查看打卡记录", module: "punchIn", action: "record:list" },
      { code: "punchIn:list", name: "查看打卡管理列表", module: "punchIn", action: "list" },
      // 评分管理
      { code: "rating:view", name: "查看评分管理", module: "rating", action: "view" },
      { code: "rating:edit", name: "管理评分", module: "rating", action: "edit" },
      { code: "rating:audit", name: "审核评分", module: "rating", action: "audit" },
      { code: "rating:config", name: "评分配置", module: "rating", action: "config" },
      { code: "rating:list", name: "查看评分列表", module: "rating", action: "list" },
      // 商城管理
      { code: "mall:view", name: "查看商城管理", module: "mall", action: "view" },
      { code: "mall:edit", name: "编辑商城管理", module: "mall", action: "edit" },
      { code: "mall:distributor", name: "管理分销", module: "mall", action: "distributor" },
      { code: "mall:config", name: "商城配置", module: "mall", action: "config" },
      { code: "mall:export", name: "导出商城数据", module: "mall", action: "export" },
      { code: "mall:refund", name: "商城退款", module: "mall", action: "refund" },
      // 分享有礼
      { code: "share:view", name: "查看分享有礼", module: "share", action: "view" },
      { code: "share:config", name: "管理分享活动", module: "share", action: "config" },
      { code: "share:reward", name: "管理分享奖励", module: "share", action: "reward" },
      // 网盘资源
      { code: "netdisk:view", name: "查看网盘资源", module: "netdisk", action: "view" },
      { code: "netdisk:edit", name: "编辑网盘资源", module: "netdisk", action: "edit" },
      { code: "netdisk:audit", name: "审核网盘资源", module: "netdisk", action: "audit" },
      { code: "netdisk:config", name: "网盘配置", module: "netdisk", action: "config" },
      { code: "netdisk:list", name: "查看网盘列表", module: "netdisk", action: "list" },
      // 对象匹配
      { code: "dating:view", name: "查看对象匹配", module: "dating", action: "view" },
      { code: "dating:audit", name: "审核对象匹配", module: "dating", action: "audit" },
      { code: "dating:config", name: "配置对象匹配", module: "dating", action: "config" },
      { code: "dating:list", name: "查看对象匹配列表", module: "dating", action: "list" },
      // 笔记付费置顶
      { code: "topup:package:list", name: "查看置顶套餐", module: "topup", action: "package:list" },
      { code: "topup:package:create", name: "创建置顶套餐", module: "topup", action: "package:create" },
      { code: "topup:package:update", name: "更新置顶套餐", module: "topup", action: "package:update" },
      { code: "topup:package:delete", name: "删除置顶套餐", module: "topup", action: "package:delete" },
      { code: "topup:order:list", name: "查看置顶订单", module: "topup", action: "order:list" },
      // 社团管理
      { code: "club:list", name: "查看社团列表", module: "club", action: "list" },
      { code: "club:detail", name: "查看社团详情", module: "club", action: "detail" },
      { code: "club:create", name: "创建社团", module: "club", action: "create" },
      { code: "club:update", name: "更新社团", module: "club", action: "update" },
      { code: "club:audit", name: "审核社团状态", module: "club", action: "audit" },
      { code: "club:delete", name: "删除社团", module: "club", action: "delete" },
      { code: "club:member:list", name: "查看社团成员", module: "club", action: "member:list" },
      { code: "club:member:delete", name: "移除社团成员", module: "club", action: "member:delete" },
      // 评论抽奖
      { code: "lottery:list", name: "查看抽奖列表", module: "lottery", action: "list" },
      { code: "lottery:detail", name: "查看抽奖详情", module: "lottery", action: "detail" },
      { code: "lottery:delete", name: "删除抽奖", module: "lottery", action: "delete" },
      { code: "lottery:draw", name: "开奖", module: "lottery", action: "draw" },
      { code: "lottery:cancel", name: "取消抽奖", module: "lottery", action: "cancel" },
      // 会员 — AUD-P1-072: fresh setup 中缺失的 membership:* 权限
      { code: "membership:list", name: "查看会员列表", module: "membership", action: "list" },
      { code: "membership:plan:list", name: "查看会员套餐", module: "membership", action: "plan:list" },
      { code: "membership:plan:create", name: "创建会员套餐", module: "membership", action: "plan:create" },
      { code: "membership:plan:update", name: "更新会员套餐", module: "membership", action: "plan:update" },
      { code: "membership:plan:delete", name: "删除会员套餐", module: "membership", action: "plan:delete" },
      { code: "membership:order:list", name: "查看会员订单", module: "membership", action: "order:list" },
      { code: "membership:user:list", name: "查看会员用户", module: "membership", action: "user:list" },
      { code: "membership:usage:list", name: "查看权益使用记录", module: "membership", action: "usage:list" },
      { code: "membership:grant", name: "发放/调整会员", module: "membership", action: "grant" },
      { code: "lottery:record:list", name: "查看中奖记录", module: "lottery", action: "record:list" },
      // 排行榜
      { code: "ranking:list", name: "查看排行榜", module: "ranking", action: "list" },
      { code: "ranking:create", name: "创建排行榜", module: "ranking", action: "create" },
      { code: "ranking:update", name: "更新排行榜", module: "ranking", action: "update" },
      { code: "ranking:delete", name: "删除排行榜", module: "ranking", action: "delete" },
      // 用户引导
      { code: "userGuidance:list", name: "查看引导页列表", module: "userGuidance", action: "list" },
      { code: "userGuidance:create", name: "创建引导页", module: "userGuidance", action: "create" },
      { code: "userGuidance:update", name: "更新引导页", module: "userGuidance", action: "update" },
      { code: "userGuidance:delete", name: "删除引导页", module: "userGuidance", action: "delete" },
      // 通讯录
      { code: "contacts:category:list", name: "查看通讯录分类", module: "contacts", action: "category:list" },
      { code: "contacts:category:create", name: "创建通讯录分类", module: "contacts", action: "category:create" },
      { code: "contacts:category:update", name: "更新通讯录分类", module: "contacts", action: "category:update" },
      { code: "contacts:category:delete", name: "删除通讯录分类", module: "contacts", action: "category:delete" },
      { code: "contacts:list", name: "查看联系人列表", module: "contacts", action: "list" },
      { code: "contacts:create", name: "创建联系人", module: "contacts", action: "create" },
      { code: "contacts:update", name: "更新联系人", module: "contacts", action: "update" },
      { code: "contacts:delete", name: "删除联系人", module: "contacts", action: "delete" },
      // 微信文章
      { code: "wechatArticle:list", name: "查看微信文章", module: "wechatArticle", action: "list" },
      { code: "wechatArticle:delete", name: "删除微信文章", module: "wechatArticle", action: "delete" },
      // 打印机
      { code: "printer:list", name: "查看打印机列表", module: "printer", action: "list" },
      { code: "printer:update", name: "更新打印机状态", module: "printer", action: "update" },
      { code: "printer:delete", name: "删除打印机", module: "printer", action: "delete" },
      // 头衔管理
      { code: "userTitle:list", name: "查看头衔列表", module: "userTitle", action: "list" },
      { code: "userTitle:create", name: "创建头衔", module: "userTitle", action: "create" },
      { code: "userTitle:update", name: "更新头衔", module: "userTitle", action: "update" },
      { code: "userTitle:delete", name: "删除头衔", module: "userTitle", action: "delete" },
      { code: "userTitle:code:list", name: "查看兑换码", module: "userTitle", action: "code:list" },
      { code: "userTitle:code:create", name: "生成兑换码", module: "userTitle", action: "code:create" },
      // 贴纸管理
      { code: "sticker:category:list", name: "查看贴纸分类", module: "sticker", action: "category:list" },
      { code: "sticker:category:create", name: "创建贴纸分类", module: "sticker", action: "category:create" },
      { code: "sticker:category:update", name: "更新贴纸分类", module: "sticker", action: "category:update" },
      { code: "sticker:category:delete", name: "删除贴纸分类", module: "sticker", action: "category:delete" },
      { code: "sticker:list", name: "查看贴纸列表", module: "sticker", action: "list" },
      { code: "sticker:update", name: "更新贴纸状态", module: "sticker", action: "update" },
      { code: "sticker:delete", name: "删除贴纸", module: "sticker", action: "delete" },
      // 爆照评选
      { code: "photoContest:view", name: "查看爆照评选", module: "photoContest", action: "view" },
      { code: "photoContest:audit", name: "审核爆照评选", module: "photoContest", action: "audit" },
      { code: "photoContest:config", name: "配置爆照评选", module: "photoContest", action: "config" },
      { code: "photoContest:list", name: "查看爆照评选列表", module: "photoContest", action: "list" },
      // A/B 测试
      { code: "abtest:view", name: "查看A/B测试", module: "abtest", action: "view" },
      { code: "abtest:edit", name: "编辑A/B测试", module: "abtest", action: "edit" },
      // AI
      { code: "ai:view", name: "查看AI配置", module: "ai", action: "view" },
      { code: "ai:edit", name: "编辑AI配置", module: "ai", action: "edit" },
      // 数据分析
      { code: "analytics:view", name: "查看数据分析", module: "analytics", action: "view" },
      // 招聘
      { code: "job:view", name: "查看招聘", module: "job", action: "view" },
      { code: "job:edit", name: "编辑招聘", module: "job", action: "edit" },
      // 页面布局
      { code: "layout:view", name: "查看页面布局", module: "layout", action: "view" },
      { code: "layout:edit", name: "编辑页面布局", module: "layout", action: "edit" },
      { code: "layout:publish", name: "发布页面布局", module: "layout", action: "publish" },
      // 营销
      { code: "marketing:view", name: "查看营销", module: "marketing", action: "view" },
      { code: "marketing:edit", name: "编辑营销", module: "marketing", action: "edit" },
      // 通知
      { code: "notification:send", name: "发送通知", module: "notification", action: "send" },
      { code: "notification:view", name: "查看通知", module: "notification", action: "view" },
      // 公众号解绑独立权限
      { code: "notification:binding:unbind", name: "解绑公众号", module: "notification", action: "binding:unbind" },
      // 打卡
      { code: "punch:view", name: "查看打卡", module: "punch", action: "view" },
      { code: "punch:edit", name: "编辑打卡", module: "punch", action: "edit" },
      { code: "punch:audit", name: "审核打卡", module: "punch", action: "audit" },
      { code: "punch:config", name: "打卡配置", module: "punch", action: "config" },
      // 推荐
      { code: "recommend:view", name: "查看推荐", module: "recommend", action: "view" },
      { code: "recommend:edit", name: "编辑推荐", module: "recommend", action: "edit" },
      // 二手交易
      { code: "secondHand:list", name: "查看二手交易列表", module: "secondHand", action: "list" },
      // 上传管理
      { code: "upload:admin:image", name: "上传管理图片", module: "upload", action: "admin:image" },
      { code: "upload:admin:video", name: "上传管理视频", module: "upload", action: "admin:video" },
      { code: "upload:admin:qrcode", name: "上传管理二维码", module: "upload", action: "admin:qrcode" },
      // 用户引导 — AUD-P1-016: 读写分离
      { code: "userguidance:view", name: "查看用户引导", module: "userguidance", action: "view" },
      { code: "userguidance:edit", name: "编辑用户引导", module: "userguidance", action: "edit" },
    ];

    const permIds: string[] = [];
    const permissionIdByCode = new Map<string, string>();
    for (const def of basePermissions) {
      const p = await prisma.adminPermission.upsert({
        where: { code: def.code },
        update: {},
        create: def,
      });
      permIds.push(p.id);
      permissionIdByCode.set(def.code, p.id);
    }

    // 绑定权限到 super_admin
    for (const pid of permIds) {
      await prisma.adminRolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: superRole.id, permissionId: pid },
        },
        update: {},
        create: { roleId: superRole.id, permissionId: pid },
      });
    }

    const regionManagerPermissionCodes = [
      "dashboard:view",
      "region:view",
      "region:edit",
      "user:view",
      "post:view",
      "post:audit",
      "comment:view",
      "merchant:view",
      "merchant:audit",
      "product:view",
      "order:view",
      "delivery:view",
      "errand:view",
      "errand:config:view",
      "coupon:view",
      "coupon:redeem-code:view",
      "activity:view",
      "message:view",
      "notification:view",
      "notification:send",
      "system:upload",
    ];
    for (const code of regionManagerPermissionCodes) {
      const pid = permissionIdByCode.get(code);
      if (!pid) continue;
      await prisma.adminRolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: regionManagerRole.id, permissionId: pid },
        },
        update: {},
        create: { roleId: regionManagerRole.id, permissionId: pid },
      });
    }

    const menuDefs = [
      {
        name: "工作台",
        icon: "DashboardOutlined",
        path: "/dashboard",
        permission: "dashboard:view",
        sortOrder: 10,
      },
      {
        name: "用户管理",
        icon: "TeamOutlined",
        path: "/user",
        permission: "user:view",
        sortOrder: 20,
      },
      {
        name: "内容管理",
        icon: "FileTextOutlined",
        path: "/content",
        permission: "post:view",
        sortOrder: 30,
      },
      {
        name: "交易管理",
        icon: "TransactionOutlined",
        path: "/transaction",
        permission: "finance:view",
        sortOrder: 40,
      },
      {
        name: "系统设置",
        icon: "SettingOutlined",
        path: "/system",
        permission: "admin:view",
        sortOrder: 90,
      },
      {
        name: "运维中心",
        icon: "ToolOutlined",
        path: "/ops",
        permission: "ops:view",
        sortOrder: 100,
      },
    ];

    for (const def of menuDefs) {
      let menu = await prisma.adminMenu.findFirst({
        where: { path: def.path },
      });
      if (!menu) {
        menu = await prisma.adminMenu.create({
          data: { ...def, type: "menu" },
        });
      }
      await prisma.adminRoleMenu.upsert({
        where: { roleId_menuId: { roleId: superRole.id, menuId: menu.id } },
        update: {},
        create: { roleId: superRole.id, menuId: menu.id },
      });
    }
  }
}
