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
const DEFAULT_JWT_SECRET =
  "change-me-with-a-real-random-jwt-secret-at-least-32-characters";
const DEFAULT_ADMIN_PASSWORD = "Admin@123456";
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
    if (!jwtSecret) {
      add("JWT_SECRET", "failed", "未配置");
    } else if (jwtSecret === DEFAULT_JWT_SECRET) {
      add("JWT_SECRET", "failed", "仍是默认值，请修改为强密钥");
    } else if (jwtSecret.length < 16) {
      add("JWT_SECRET", "warning", "长度建议 >= 16 位");
    } else {
      add("JWT_SECRET", "passed", "已配置且不是默认值", {
        value: maskSecret(jwtSecret),
      });
    }

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
    let isDefaultPassword = false;
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
          isDefaultPassword = await bcrypt.compare(
            DEFAULT_ADMIN_PASSWORD,
            superAdmin.passwordHash,
          );
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
        "默认密码检查",
        isDefaultPassword ? "failed" : "passed",
        isDefaultPassword
          ? "超级管理员仍在使用默认密码 Admin@123456"
          : "已修改为强密码",
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

    const { siteName, siteLogo, adminUsername, adminPassword, adminPhone } =
      dto;

    // 3. 校验核心必填字段（在写 .env 之前校验，避免写入后才报错）
    if (!adminUsername?.trim()) throw new BadRequestException("管理员账号必填");
    if (!adminPassword?.trim()) throw new BadRequestException("管理员密码必填");
    if (adminPassword.length < 8)
      throw new BadRequestException("密码长度至少 8 位");
    if (!/^(?=.*[a-zA-Z])(?=.*\d).{8,}$/.test(adminPassword)) {
      throw new BadRequestException("密码必须包含字母和数字");
    }

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

    // 基础权限
    const basePermissions = [
      {
        code: "dashboard:view",
        name: "查看仪表盘",
        module: "dashboard",
        action: "view",
      },
      { code: "user:view", name: "查看用户", module: "user", action: "view" },
      { code: "user:edit", name: "编辑用户", module: "user", action: "edit" },
      { code: "user:ban", name: "封禁用户", module: "user", action: "ban" },
      { code: "post:view", name: "查看帖子", module: "post", action: "view" },
      { code: "post:audit", name: "审核帖子", module: "post", action: "audit" },
      {
        code: "merchant:view",
        name: "查看商家",
        module: "merchant",
        action: "view",
      },
      { code: "order:view", name: "查看订单", module: "order", action: "view" },
      {
        code: "finance:view",
        name: "查看财务",
        module: "finance",
        action: "view",
      },
      {
        code: "admin:view",
        name: "查看管理员",
        module: "admin",
        action: "view",
      },
      {
        code: "system:config",
        name: "系统配置",
        module: "system",
        action: "config",
      },
      {
        code: "city:view",
        name: "查看城市代理",
        module: "city_agent",
        action: "view",
      },
      { code: "rider:view", name: "查看骑手", module: "rider", action: "view" },
      {
        code: "delivery:view",
        name: "查看配送",
        module: "delivery",
        action: "view",
      },
      {
        code: "coupon:edit",
        name: "管理优惠券",
        module: "coupon",
        action: "edit",
      },
      {
        code: "activity:edit",
        name: "管理活动",
        module: "activity",
        action: "edit",
      },
      {
        code: "content:manage",
        name: "消息违规管理",
        module: "content",
        action: "manage",
      },
      { code: "ops:view", name: "查看运维中心", module: "ops", action: "view" },
      {
        code: "ops:restart",
        name: "重启后端服务",
        module: "ops",
        action: "restart",
      },
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
