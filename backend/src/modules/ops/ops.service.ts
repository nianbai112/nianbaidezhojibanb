import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import * as os from "os";
import * as childProcess from "child_process";
import * as util from "util";

const execFile = util.promisify(childProcess.execFile);

const ALLOWED_RESTART_COMMANDS = [
  "pm2 restart lingmeng-backend",
  "docker compose restart backend",
  "systemctl restart lingmeng-backend",
];

type OpsConfigStatus = {
  key: string;
  name: string;
  status: "ok" | "warning" | "missing" | "disabled";
  label: string;
  message: string;
  configured: boolean;
};

@Injectable()
export class OpsService {
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private hasConfigValue(value: any): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") {
      const v = value.trim();
      return !!v && v !== "******" && v !== "********";
    }
    if (typeof value === "object") {
      if ("isConfigured" in value) return Boolean(value.isConfigured);
      return Object.values(value).some((item) => this.hasConfigValue(item));
    }
    return Boolean(value);
  }

  private async getConfigValues(keys: string[]) {
    const rows = await this.prisma.config.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    return rows.reduce((acc, row) => {
      acc[row.key] = row.value as any;
      return acc;
    }, {} as Record<string, any>);
  }

  private async getThirdPartyConfigStatus(): Promise<OpsConfigStatus[]> {
    const configs = await this.getConfigValues([
      "miniapp",
      "wechat_official",
      "official",
      "wechat_pay",
      "amap",
      "storage",
      "ai",
      "ai_ops_config",
    ]);

    const miniapp = configs.miniapp || {};
    const miniAppId =
      miniapp.appId ||
      this.configService.get("WX_MINI_APPID") ||
      this.configService.get("WX_APPID");
    const miniSecret =
      miniapp.appSecret ||
      miniapp.secret ||
      this.configService.get("WX_MINI_SECRET") ||
      this.configService.get("WX_SECRET");
    const miniOk = this.hasConfigValue(miniAppId) && this.hasConfigValue(miniSecret);

    const official = configs.wechat_official || configs.official || {};
    const officialOk =
      this.hasConfigValue(official.appId) &&
      this.hasConfigValue(official.appSecret || official.secret);

    const pay = configs.wechat_pay || {};
    const payOk =
      this.hasConfigValue(pay.mchId || this.configService.get("WX_PAY_MCHID")) &&
      this.hasConfigValue(pay.apiV3Key || this.configService.get("WX_PAY_API_V3_KEY"));

    const amap = configs.amap || {};
    const amapOk =
      this.hasConfigValue(amap.webServiceKey) && this.hasConfigValue(amap.jsApiKey);

    const storage = configs.storage || null;
    const provider = storage?.provider || "local";
    let storageStatus: OpsConfigStatus;
    if (!storage) {
      storageStatus = {
        key: "storage",
        name: "存储上传",
        status: "warning",
        label: "默认本地",
        message: "未保存存储配置，当前会使用默认本地 uploads 目录，建议确认访问域名和上传限制",
        configured: false,
      };
    } else if (provider === "local") {
      storageStatus = {
        key: "storage",
        name: "存储上传",
        status: this.hasConfigValue(storage.local?.uploadDir) ? "ok" : "warning",
        label: this.hasConfigValue(storage.local?.uploadDir) ? "本地可用" : "待确认",
        message: this.hasConfigValue(storage.local?.uploadDir)
          ? `本地目录：${storage.local.uploadDir}`
          : "本地存储缺少上传目录",
        configured: this.hasConfigValue(storage.local?.uploadDir),
      };
    } else if (provider === "cos") {
      const cos = storage.cos || {};
      const ok =
        this.hasConfigValue(cos.secretId) &&
        this.hasConfigValue(cos.secretKey) &&
        this.hasConfigValue(cos.bucket) &&
        this.hasConfigValue(cos.region);
      storageStatus = {
        key: "storage",
        name: "存储上传",
        status: ok ? "ok" : "warning",
        label: ok ? "COS 已配置" : "COS 未完整",
        message: ok ? `COS Bucket：${cos.bucket}` : "COS 需要 SecretId、SecretKey、Bucket、Region 都配置",
        configured: ok,
      };
    } else {
      storageStatus = {
        key: "storage",
        name: "存储上传",
        status: "warning",
        label: "未接通",
        message: `${provider} 已选择，但当前后端仅提供本地存储和 COS 的真实连接测试`,
        configured: false,
      };
    }

    const ai = configs.ai_ops_config || configs.ai || {};
    const aiEnabled = Boolean(ai.enabled);
    const aiKey =
      ai.apiKey ||
      this.configService.get("AI_API_KEY") ||
      this.configService.get("OPENAI_API_KEY") ||
      this.configService.get("DEEPSEEK_API_KEY");
    const aiOk = aiEnabled && this.hasConfigValue(aiKey);

    return [
      {
        key: "miniapp",
        name: "微信小程序",
        status: miniOk ? "ok" : "missing",
        label: miniOk ? "已配置" : "未配置",
        message: miniOk ? "AppID 与 AppSecret 已检测到" : "缺少小程序 AppID 或 AppSecret",
        configured: miniOk,
      },
      {
        key: "official",
        name: "微信公众号",
        status: officialOk ? "ok" : "missing",
        label: officialOk ? "已配置" : "未配置",
        message: officialOk ? "公众号 AppID 与 AppSecret 已检测到" : "未配置公众号 AppID/AppSecret",
        configured: officialOk,
      },
      {
        key: "amap",
        name: "高德地图",
        status: amapOk ? "ok" : "missing",
        label: amapOk ? "已配置" : "未配置",
        message: amapOk ? "Web服务 Key 与 JS API Key 已检测到" : "缺少高德 Web服务 Key 或 JS API Key",
        configured: amapOk,
      },
      storageStatus,
      {
        key: "payment",
        name: "微信支付",
        status: payOk ? "ok" : "missing",
        label: payOk ? "已配置" : "未配置",
        message: payOk ? "商户号与 APIv3 密钥已检测到" : "缺少微信支付商户号或 APIv3 密钥",
        configured: payOk,
      },
      {
        key: "ai",
        name: "AI 模型",
        status: aiOk ? "ok" : aiEnabled ? "warning" : "disabled",
        label: aiOk ? "已启用" : aiEnabled ? "缺少密钥" : "未启用",
        message: aiOk
          ? "AI 开关和密钥已检测到"
          : aiEnabled
            ? "AI 已启用但缺少 API Key"
            : "AI 功能未启用，不会执行真实模型调用",
        configured: aiOk,
      },
    ];
  }

  /** 严格校验：仅 super_admin 角色可通过 */
  async ensureSuperAdmin(accountId: string): Promise<void> {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: accountId },
      include: {
        roles: {
          select: {
            role: { select: { code: true } },
          },
        },
      },
    });

    if (!account) {
      throw new UnauthorizedException("管理员不存在");
    }

    const isSuper = account.roles.some(
      (ar) => ar.role.code === "super_admin" || ar.role.code === "SUPER_ADMIN",
    );

    if (!isSuper) {
      throw new ForbiddenException("仅超级管理员可执行此操作");
    }
  }

  async getOverview() {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const [todayErrorCount, todayRequestCount, recentErrors, lastRestart] =
      await Promise.all([
        this.prisma.serverLog.count({
          where: { level: "error", createdAt: { gte: todayStart } },
        }),
        this.prisma.serverLog.count({
          where: { module: "request", createdAt: { gte: todayStart } },
        }),
        this.prisma.serverLog.findMany({
          where: { level: "error" },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            message: true,
            module: true,
            path: true,
            statusCode: true,
            createdAt: true,
          },
        }),
        this.prisma.serverActionLog.findFirst({
          where: { action: "restart_backend", status: "success" },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const health = await this.getHealth();

    const configStatus = await this.getThirdPartyConfigStatus();
    const statusMap = Object.fromEntries(configStatus.map((item) => [item.key, item]));

    return {
      backendStatus: "running",
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      startedAt: new Date(this.startTime).toISOString(),
      cpuUsage: health.cpuUsage,
      memoryUsage: health.memoryUsage,
      diskUsage: health.diskUsage,
      dbStatus: health.dbStatus,
      redisStatus: health.redisStatus,
      todayErrorCount,
      todayRequestCount,
      recentErrors,
      lastRestartAt: lastRestart?.createdAt ?? null,
      version: "1.0.0",
      nodeVersion: process.version,
      environment: this.configService.get("NODE_ENV") || "development",
      configStatus,
      wxConfigured: Boolean(statusMap.miniapp?.configured),
      wxOfficialConfigured: Boolean(statusMap.official?.configured),
      amapConfigured: Boolean(statusMap.amap?.configured),
      storageConfigured: Boolean(statusMap.storage?.configured),
      aiConfigured: Boolean(statusMap.ai?.configured),
      wxPayConfigured: Boolean(statusMap.payment?.configured),
    };
  }

  async getHealth() {
    const cpus = os.cpus();
    const cpuUsage =
      cpus.length > 0
        ? cpus.reduce(
            (acc, cpu) =>
              acc +
              (cpu.times.user + cpu.times.nice + cpu.times.sys) /
                Object.values(cpu.times).reduce((a, b) => a + b, 0),
            0,
          ) / cpus.length
        : 0;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = totalMem > 0 ? (totalMem - freeMem) / totalMem : 0;

    const diskUsage = await this.getDiskUsage();

    let dbStatus = "unknown";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = "healthy";
    } catch {
      dbStatus = "down";
    }

    let redisStatus = "unknown";
    try {
      await this.redis.getClient().ping();
      redisStatus = "healthy";
    } catch {
      redisStatus = "down";
    }

    const status =
      dbStatus === "healthy" && redisStatus === "healthy"
        ? "healthy"
        : "degraded";

    const configStatus = await this.getThirdPartyConfigStatus();
    const statusMap = Object.fromEntries(configStatus.map((item) => [item.key, item]));

    return {
      cpuUsage: Math.round(cpuUsage * 10000) / 100,
      memoryUsage: Math.round(memoryUsage * 10000) / 100,
      diskUsage,
      nodeVersion: process.version,
      platform: `${os.type()} ${os.release()}`,
      processPid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      dbStatus,
      redisStatus,
      status,
      envSecurity: {
        storageConfigured: Boolean(statusMap.storage?.configured),
        cosConfigured: Boolean(statusMap.storage?.configured),
        wxMiniConfigured: Boolean(statusMap.miniapp?.configured),
        wxOfficialConfigured: Boolean(statusMap.official?.configured),
        amapConfigured: Boolean(statusMap.amap?.configured),
        wxPayConfigured: Boolean(statusMap.payment?.configured),
        aiConfigured: Boolean(statusMap.ai?.configured),
      },
      configStatus,
    };
  }

  async getLogs(query: any) {
    const {
      page = 1,
      pageSize = 20,
      level,
      module,
      keyword,
      startTime,
      endTime,
      adminId,
      userId,
      path,
    } = query;
    const where: any = {};

    if (level) where.level = level;
    if (module) where.module = module;
    if (adminId) where.adminId = adminId;
    if (userId) where.userId = userId;
    if (path) where.path = { contains: path };
    if (keyword) {
      where.OR = [
        { message: { contains: keyword } },
        { path: { contains: keyword } },
      ];
    }
    if (startTime || endTime) {
      where.createdAt = {};
      if (startTime) where.createdAt.gte = new Date(startTime);
      if (endTime) where.createdAt.lte = new Date(endTime);
    }

    const [list, total] = await Promise.all([
      this.prisma.serverLog.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.serverLog.count({ where }),
    ]);

    return { list, total, page: +page, pageSize: +pageSize };
  }

  async getActions(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.serverActionLog.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.serverActionLog.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async restart(
    accountId: string,
    dto: { reason: string; confirmText: string },
    ip?: string,
    userAgent?: string,
  ) {
    await this.ensureSuperAdmin(accountId);

    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException("重启原因必填");
    }
    if (dto.confirmText !== "确认重启") {
      throw new BadRequestException("确认文字不正确");
    }

    // 5 分钟冷却
    const cooldownSeconds =
      this.configService.get<number>("OPS_RESTART_COOLDOWN_SECONDS") || 300;
    const cooldownTime = new Date(Date.now() - cooldownSeconds * 1000);
    const recentRestart = await this.prisma.serverActionLog.findFirst({
      where: {
        action: "restart_backend",
        status: { in: ["pending", "success"] },
        createdAt: { gte: cooldownTime },
      },
    });
    if (recentRestart) {
      throw new ForbiddenException(`5 分钟内已有一次重启操作，请稍后重试`);
    }

    const commandStr = this.configService.get<string>("OPS_RESTART_COMMAND");
    if (!commandStr) {
      throw new BadRequestException("OPS_RESTART_COMMAND 未配置，无法执行重启");
    }
    if (!ALLOWED_RESTART_COMMANDS.includes(commandStr.trim())) {
      throw new ForbiddenException("重启命令不在白名单中");
    }

    // 创建 action log
    const actionLog = await this.prisma.serverActionLog.create({
      data: {
        adminId: accountId,
        action: "restart_backend",
        status: "pending",
        reason: dto.reason,
        ip: ip || null,
        userAgent: userAgent || null,
        detail: { command: commandStr },
      },
    });

    // 异步执行重启
    setTimeout(() => {
      void (async () => {
        try {
          const parts = commandStr.trim().split(" ");
          const cmd = parts[0];
          const args = parts.slice(1);
          await execFile(cmd, args);
          await this.prisma.serverActionLog.update({
            where: { id: actionLog.id },
            data: { status: "success", finishedAt: new Date() },
          });
        } catch (err: any) {
          try {
            await this.prisma.serverActionLog.update({
              where: { id: actionLog.id },
              data: {
                status: "failed",
                finishedAt: new Date(),
                detail: { error: err.message },
              },
            });
          } catch (updateErr) {
            console.error("更新重启操作日志失败", updateErr);
          }
        }
      })();
    }, 1000);

    return {
      success: true,
      message: "重启命令已发出，服务将在 1 秒后执行重启",
      actionId: actionLog.id,
    };
  }

  async cleanupLogs(accountId: string, dto: { beforeDays: number }) {
    await this.ensureSuperAdmin(accountId);

    const beforeDays = Number(dto.beforeDays);
    if (!beforeDays || beforeDays < 7) {
      throw new BadRequestException("beforeDays 最小为 7");
    }

    const beforeDate = new Date(Date.now() - beforeDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.serverLog.deleteMany({
      where: { createdAt: { lt: beforeDate } },
    });

    return { success: true, deletedCount: result.count };
  }

  private async getDiskUsage(): Promise<number> {
    if (process.platform === "win32") return 0;

    try {
      const { stdout } = await execFile("df", ["-k", process.cwd()]);
      const lines = stdout.trim().split("\n");
      const parts = lines[lines.length - 1]?.trim().split(/\s+/) || [];
      const percent = parts.find((part) => part.endsWith("%"));
      return percent ? Number(percent.replace("%", "")) : 0;
    } catch {
      return 0;
    }
  }

  async getAlerts(query: any) {
    const { page = 1, pageSize = 20, type, level, status, regionId, startTime, endTime } = query;
    const where: any = {};

    if (type) where.type = type;
    if (level) where.level = level;
    if (status) where.status = status;
    if (regionId) where.regionId = regionId;
    if (startTime || endTime) {
      where.createdAt = {};
      if (startTime) where.createdAt.gte = new Date(startTime);
      if (endTime) where.createdAt.lte = new Date(endTime);
    }

    const [list, total] = await Promise.all([
      this.prisma.systemAlert.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
        include: { region: { select: { id: true, name: true } } },
      }),
      this.prisma.systemAlert.count({ where }),
    ]);

    return { list, total, page: +page, pageSize: +pageSize };
  }

  async getAlertSummary() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      pendingAuditCount,
      pendingRefundCount,
      pendingWithdrawCount,
      abnormalOrderCount,
      aiTaskFailCount,
      errorLogCount,
      pendingAlertCount,
      highRiskAlertCount,
    ] = await Promise.all([
      this.prisma.post.count({ where: { status: "PENDING" } }).catch(() => 0),
      this.prisma.refund.count({ where: { status: "PENDING" } }).catch(() => 0),
      this.prisma.withdraw.count({ where: { status: "PENDING" } }).catch(() => 0),
      this.prisma.order.count({ where: { status: "REFUNDING" } }).catch(() => 0),
      this.prisma.botPostTask.count({ where: { status: "failed" } }).catch(() => 0),
      this.prisma.serverLog.count({ where: { level: "error", createdAt: { gte: todayStart } } }),
      this.prisma.systemAlert.count({ where: { status: "pending" } }),
      this.prisma.systemAlert.count({ where: { level: "high", status: "pending" } }),
    ]);

    return {
      pendingAuditCount,
      pendingRefundCount,
      pendingWithdrawCount,
      abnormalOrderCount,
      aiTaskFailCount,
      errorLogCount,
      pendingAlertCount,
      highRiskAlertCount,
    };
  }

  async resolveAlert(id: string, accountId: string, note?: string) {
    const alert = await this.prisma.systemAlert.findUnique({ where: { id } });
    if (!alert) throw new BadRequestException("异常记录不存在");

    await this.prisma.systemAlert.update({
      where: { id },
      data: { status: "resolved", resolvedBy: accountId, resolvedAt: new Date(), resolveNote: note },
    });

    return { success: true };
  }

  async ignoreAlert(id: string, accountId: string, reason?: string) {
    const alert = await this.prisma.systemAlert.findUnique({ where: { id } });
    if (!alert) throw new BadRequestException("异常记录不存在");

    await this.prisma.systemAlert.update({
      where: { id },
      data: { status: "ignored", resolvedBy: accountId, resolvedAt: new Date(), resolveNote: reason },
    });

    return { success: true };
  }

  async getLaunchCheck() {
    const items: Array<{ key: string; name: string; status: string; message: string; level: string }> = [];

    // 1. 后端服务
    items.push({ key: "backend", name: "后端服务", status: "pass", message: "服务运行中", level: "required" });

    // 2. 数据库
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      items.push({ key: "database", name: "数据库连接", status: "pass", message: "连接正常", level: "required" });
    } catch {
      items.push({ key: "database", name: "数据库连接", status: "failed", message: "连接失败", level: "required" });
    }

    // 3. Redis
    try {
      await this.redis.getClient().ping();
      items.push({ key: "redis", name: "Redis 连接", status: "pass", message: "连接正常", level: "required" });
    } catch {
      items.push({ key: "redis", name: "Redis 连接", status: "failed", message: "连接失败", level: "required" });
    }

    // 4. 第三方/业务配置：从真实 Config 表和环境变量判断，不再用硬编码状态。
    const configStatus = await this.getThirdPartyConfigStatus();
    const levelMap: Record<string, string> = {
      miniapp: "recommended",
      official: "optional",
      amap: "optional",
      storage: "recommended",
      payment: "optional",
      ai: "optional",
    };
    for (const item of configStatus) {
      items.push({
        key: `config_${item.key}`,
        name: `${item.name}配置`,
        status: item.status === "ok" || item.status === "disabled" ? "pass" : "warning",
        message: item.message,
        level: levelMap[item.key] || "optional",
      });
    }

    // 9. 管理员账号
    const adminCount = await this.prisma.adminAccount.count();
    items.push({
      key: "admin", name: "管理员账号", status: adminCount > 0 ? "pass" : "failed",
      message: `共 ${adminCount} 个管理员`, level: "required",
    });

    // 10. 最近 24 小时严重错误
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentErrors = await this.prisma.serverLog.count({
      where: { level: "error", createdAt: { gte: oneDayAgo } },
    });
    items.push({
      key: "recent_errors", name: "最近 24 小时错误", status: recentErrors === 0 ? "pass" : "warning",
      message: `${recentErrors} 条错误`, level: "recommended",
    });

    const failedCount = items.filter((i) => i.status === "failed").length;
    const warningCount = items.filter((i) => i.status === "warning").length;
    const score = Math.max(0, 100 - failedCount * 20 - warningCount * 5);
    const status = failedCount > 0 ? "failed" : warningCount > 2 ? "warning" : "pass";

    return { score, status, items };
  }
}
