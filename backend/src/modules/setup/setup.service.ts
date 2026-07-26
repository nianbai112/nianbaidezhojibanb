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
import * as fs from "fs";
import * as path from "path";

const SETUP_LOCK_PATH = path.resolve(process.cwd(), "storage", "setup.lock");
const ENV_PATH = path.resolve(process.cwd(), ".env");

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
  "DATABASE_URL",
  "REDIS_HOST",
  "REDIS_PORT",
  "REDIS_PASSWORD",
  "JWT_SECRET",
  "CORS_ORIGIN",
  "WX_MINI_APPID",
  "WX_MINI_SECRET",
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

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 验证 SETUP_TOKEN */
  private validateSetupToken(token: string): void {
    const configuredToken = this.configService.get<string>("SETUP_TOKEN") || "";

    if (!configuredToken) {
      const nodeEnv = this.configService.get<string>("NODE_ENV");
      if (nodeEnv === "production") {
        throw new ForbiddenException(
          "SETUP_TOKEN 未配置：生产环境禁止执行 setup 写操作，仅允许 GET /setup/status",
        );
      }
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
    try {
      await fs.promises.access(SETUP_LOCK_PATH, fs.constants.F_OK);
      return true;
    } catch {
      /* 文件不存在，继续检查 */
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
    return { initialized };
  }

  /** 部署环境检查（未初始化时公开；初始化后 403） */
  async checkEnvironment(token: string) {
    // 验证 SETUP_TOKEN
    this.validateSetupToken(token);

    // 已初始化后禁止通过此端点探测环境配置
    if (await this.isInitialized()) {
      throw new ForbiddenException(
        "系统已初始化，环境检查仅允许在首次部署时使用",
      );
    }
    const checks: any[] = [];
    let overall = "passed";

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

    // NODE_ENV
    const nodeEnv = this.configService.get("NODE_ENV");
    add(
      "NODE_ENV",
      nodeEnv === "production" ? "passed" : "warning",
      nodeEnv || "未设置",
    );

    // DATABASE_URL
    const dbUrl = this.configService.get("DATABASE_URL");
    add(
      "DATABASE_URL",
      dbUrl ? "passed" : "failed",
      dbUrl ? "已配置" : "未配置",
      dbUrl ? { url: maskSecret(dbUrl) } : undefined,
    );

    // 数据库连接
    let dbConnected = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
      add("数据库连接", "passed", "可正常连接");
    } catch (err: any) {
      add("数据库连接", "failed", err.message || "连接失败");
    }

    // Redis 连接
    let redisConnected = false;
    try {
      await this.redis.get("setup:health");
      redisConnected = true;
      add("Redis 连接", "passed", "可正常连接");
    } catch (err: any) {
      add("Redis 连接", "failed", err.message || "连接失败");
    }

    // Prisma migration
    if (dbConnected) {
      try {
        const result = await this.prisma
          .$queryRaw`SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1`;
        const lastMigration =
          Array.isArray(result) && result.length > 0
            ? (result[0] as any).migration_name
            : null;
        add(
          "Prisma Migration",
          lastMigration ? "passed" : "warning",
          lastMigration ? `最新: ${lastMigration}` : "未找到迁移记录",
        );
      } catch {
        add(
          "Prisma Migration",
          "warning",
          "无法读取迁移状态（_prisma_migrations 表可能不存在）",
        );
      }
    } else {
      add("Prisma Migration", "failed", "数据库未连接，无法检查");
    }

    // JWT_SECRET
    const jwtSecret = this.configService.get("JWT_SECRET");
    const jwtCheck = validateJwtSecret(jwtSecret);
    add(
      "JWT_SECRET",
      jwtCheck.valid ? "passed" : "failed",
      jwtCheck.reason || "已配置",
      jwtSecret ? { value: maskSecret(jwtSecret) } : undefined,
    );

    // CORS_ORIGIN
    const corsOrigin = this.configService.get("CORS_ORIGIN");
    add(
      "CORS_ORIGIN",
      corsOrigin && corsOrigin !== "true" && corsOrigin !== "*"
        ? "passed"
        : "warning",
      corsOrigin || "未配置",
    );

    // COS
    const cosItems = [
      "COS_SECRET_ID",
      "COS_SECRET_KEY",
      "COS_BUCKET",
      "COS_REGION",
      "COS_DOMAIN",
    ];
    const cosMissing = cosItems.filter((k) => !this.configService.get(k));
    add(
      "腾讯云 COS",
      cosMissing.length === 0
        ? "passed"
        : cosMissing.length >= 3
          ? "failed"
          : "warning",
      cosMissing.length === 0 ? "配置完整" : `缺少: ${cosMissing.join(", ")}`,
    );

    // 微信小程序
    const wxItems = ["WX_MINI_APPID", "WX_MINI_SECRET"];
    const wxMissing = wxItems.filter((k) => !this.configService.get(k));
    add(
      "微信小程序",
      wxMissing.length === 0 ? "passed" : "failed",
      wxMissing.length === 0 ? "配置完整" : `缺少: ${wxMissing.join(", ")}`,
    );

    // 微信支付
    const wxPayItems = [
      "WX_PAY_MCHID",
      "WX_PAY_APIV3_KEY",
      "WX_PAY_CERT_SERIAL_NO",
      "WX_PAY_PRIVATE_KEY_PATH",
      "WX_PAY_PLATFORM_CERT_PATH",
    ];
    const wxPayMissing = wxPayItems.filter((k) => !this.configService.get(k));
    const wxPayCertPath = this.configService.get("WX_PAY_PRIVATE_KEY_PATH");
    let wxPayCertExists = false;
    if (wxPayCertPath) {
      try {
        await fs.promises.access(wxPayCertPath);
        wxPayCertExists = true;
      } catch {
        /* ignore */
      }
    }
    const wxPayStatus =
      wxPayMissing.length === 0 && wxPayCertExists
        ? "passed"
        : wxPayMissing.length >= 3
          ? "failed"
          : "warning";
    add(
      "微信支付",
      wxPayStatus,
      wxPayMissing.length === 0
        ? wxPayCertExists
          ? "配置完整，证书存在"
          : "配置完整，但证书文件不存在"
        : `缺少: ${wxPayMissing.join(", ")}`,
    );

    // 超级管理员
    let hasSuperAdmin = false;
    let isWeakPassword = false;
    try {
      const superAdmin = await this.prisma.adminAccount.findFirst({
        include: { roles: { select: { role: { select: { code: true } } } } },
      });
      if (superAdmin) {
        hasSuperAdmin = superAdmin.roles.some(
          (r: any) =>
            r.role.code === "super_admin" || r.role.code === "SUPER_ADMIN",
        );
        if (hasSuperAdmin) {
          const bcrypt = await import("bcrypt");
          // 检查是否弱口令（逐一比对弱口令列表）
          for (const pattern of WEAK_PASSWORD_PATTERNS) {
            const testPasswords = ["Admin@123456", "admin@123", "password@123", "12345678"];
            for (const pw of testPasswords) {
              if (await bcrypt.compare(pw, superAdmin.passwordHash)) {
                isWeakPassword = true;
                break;
              }
            }
            if (isWeakPassword) break;
          }
        }
      }
    } catch {
      /* ignore */
    }
    add(
      "超级管理员",
      hasSuperAdmin ? "passed" : "warning",
      hasSuperAdmin ? "已存在" : "尚未创建",
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
      ["DATABASE_URL", "databaseUrl"],
      ["REDIS_HOST", "redisHost"],
      ["REDIS_PORT", "redisPort"],
      ["REDIS_PASSWORD", "redisPassword"],
      ["JWT_SECRET", "jwtSecret"],
      ["CORS_ORIGIN", "corsOrigin"],
      ["WX_MINI_APPID", "wxMiniAppid"],
      ["WX_MINI_SECRET", "wxMiniSecret"],
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
    validateFilePath(ENV_PATH, process.cwd());

    // 生产环境额外警告（但允许初始化时写 .env）
    const nodeEnv = this.configService.get("NODE_ENV");
    if (nodeEnv === "production") {
      this.logger.warn("在生产环境中写入 .env 文件 — 初始化完成后请移除 SETUP_WIZARD=true 并重启服务");
    }

    let content = "";
    try {
      content = await fs.promises.readFile(ENV_PATH, "utf8");
    } catch {
      content = "";
    }

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

    await fs.promises.writeFile(
      ENV_PATH,
      nextLines.join("\n").replace(/\n*$/, "\n"),
    );
    return entries.length;
  }

  private effectiveConfig(
    key: DeployConfigKey,
    updates: Partial<Record<DeployConfigKey, string>>,
  ) {
    return (
      updates[key] ||
      this.configService.get<string>(key) ||
      process.env[key] ||
      ""
    );
  }

  private async getSetupPrisma(databaseUrl: string) {
    if (databaseUrl && databaseUrl !== process.env.DATABASE_URL) {
      const prisma = new PrismaClient({
        datasources: { db: { url: databaseUrl } },
      });
      await prisma.$connect();
      return { prisma, dispose: () => prisma.$disconnect() };
    }
    await this.prisma.$connect();
    return { prisma: this.prisma, dispose: async () => undefined };
  }

  private async getMigrationStatus(prisma: PrismaClient | PrismaService) {
    try {
      const result = await prisma.$queryRaw`
        SELECT migration_name, finished_at
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
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

  /** 系统初始化 */
  async init(dto: SetupInitDto, token: string) {
    // 1. 验证 SETUP_TOKEN
    this.validateSetupToken(token);

    // 2. 检查是否已初始化
    if (await this.isInitialized()) {
      throw new ForbiddenException("系统已初始化，无法重复执行");
    }

    // 3. 生产环境：必须配置 SETUP_TOKEN 才能初始化
    const nodeEnv = this.configService.get("NODE_ENV");
    if (nodeEnv === "production" && !this.configService.get("SETUP_TOKEN")) {
      throw new ForbiddenException(
        "生产环境执行初始化必须设置 SETUP_TOKEN。请先在 .env 中配置 SETUP_TOKEN=<强密码>，然后通过 x-setup-token 头部传入",
      );
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
        "DATABASE_URL 未配置：请在 init 请求中提供 databaseUrl 或确保 .env 中已配置 DATABASE_URL",
      );
    }
    const wxMiniAppid = this.effectiveConfig("WX_MINI_APPID", envUpdates);
    const wxMiniSecret = this.effectiveConfig("WX_MINI_SECRET", envUpdates);
    if (!wxMiniAppid || !wxMiniSecret) {
      throw new BadRequestException(
        "微信小程序 AppID/Secret 未配置：请在 init 请求中填写 wxMiniAppid 和 wxMiniSecret",
      );
    }
    const jwtSecret = this.effectiveConfig("JWT_SECRET", envUpdates);
    if (!jwtSecret) {
      throw new BadRequestException(
        "JWT_SECRET 未配置：请在 init 请求中提供 jwtSecret 或确保 .env 中已配置 JWT_SECRET",
      );
    }
    const jwtCheck = validateJwtSecret(jwtSecret);
    if (!jwtCheck.valid) {
      throw new BadRequestException(`JWT_SECRET 无效: ${jwtCheck.reason}`);
    }

    // 4. 写入 .env（校验通过后才执行写操作）
    const writtenCount = await this.writeEnvUpdates(envUpdates);
    this.logger.log(`Wrote ${writtenCount} env keys to .env`);

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
        await this.redis.set("setup:test", "1", 5);
        await this.redis.del("setup:test");
      } catch (err: any) {
        throw new BadRequestException(`Redis 连接失败: ${err.message}`);
      }

      const migration = await this.getMigrationStatus(prisma);
      if (!migration.ready) {
        return {
          success: false,
          initialized: false,
          requiresMigration: true,
          message:
            "部署配置已写入 .env，但数据库迁移尚未完成。请先执行迁移后重启服务，再重新提交初始化。",
          migration,
          nextSteps: [
            "docker compose run --rm migration",
            "或在服务器执行 npm run db:migrate:deploy",
            "重启后端服务",
            "再次打开 /setup/init 完成管理员和基础数据初始化",
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
            wxMiniAppid: maskSecret(wxMiniAppid),
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
            wxMiniAppid: maskSecret(wxMiniAppid),
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
        next: "/admin/login",
        adminId: adminAccount.id,
        hint: "系统已初始化。请从 .env 中移除 SETUP_WIZARD=true 并重启服务，以激活完整生产环境校验。",
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
      // 漂流瓶
      { code: "driftBottle:list", name: "查看漂流瓶列表", module: "driftBottle", action: "list" },
      { code: "driftBottle:delete", name: "删除漂流瓶", module: "driftBottle", action: "delete" },
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
      // 充值管理
      { code: "topup:package:list", name: "查看充值套餐", module: "topup", action: "package:list" },
      { code: "topup:package:create", name: "创建充值套餐", module: "topup", action: "package:create" },
      { code: "topup:package:update", name: "更新充值套餐", module: "topup", action: "package:update" },
      { code: "topup:package:delete", name: "删除充值套餐", module: "topup", action: "package:delete" },
      { code: "topup:order:list", name: "查看充值订单", module: "topup", action: "order:list" },
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
      // 用户引导
      { code: "userguidance:view", name: "查看用户引导", module: "userguidance", action: "view" },
    ];

    const permIds: string[] = [];
    for (const def of basePermissions) {
      const p = await prisma.adminPermission.upsert({
        where: { code: def.code },
        update: {},
        create: def,
      });
      permIds.push(p.id);
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
