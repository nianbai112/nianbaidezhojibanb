import { BadGatewayException, BadRequestException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import axios from "axios";
import { spawn } from "child_process";
import { createHash, createHmac, randomUUID, timingSafeEqual, verify } from "crypto";
import * as fs from "fs";
import { promises as fsp } from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import { PrismaService } from "../../common/services/prisma.service";
import { canonicalJson } from "../../common/utils/canonical-json";
import { isModuleEnabled, normalizeLicenseModules } from "./license-runtime.modules";
import { reconcileApplyStatus } from "./license-runtime.apply-status";
import type { LicenseRuntimeConfig, LicenseRuntimeRequestMeta, LicenseRuntimeStatus } from "./license-runtime.types";

const CONFIG_KEY = "license.runtime.config";
const STATUS_KEY = "license.runtime.status";
const UPDATE_KEY = "license.runtime.update";
const DOWNLOAD_KEY = "license.runtime.download";
const MINIAPP_UPDATE_KEY = "license.runtime.miniapp.update";
const MINIAPP_DOWNLOAD_KEY = "license.runtime.miniapp.download";
const DEFAULT_PRODUCT = "lingmeng";
const DEFAULT_COMPONENT = "full";
const MINIAPP_COMPONENT = "miniapp";
const DEFAULT_CACHE_DAYS = 7;
const MINIAPP_DOWNLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;
const UPDATE_TRANSFER_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const APPLY_HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;

type SignedPayload = Record<string, any> & { signature?: string };

@Injectable()
export class LicenseRuntimeService implements OnModuleInit {
  private readonly logger = new Logger(LicenseRuntimeService.name);
  private memoryStatus: LicenseRuntimeStatus | null = null;
  private checking: Promise<LicenseRuntimeStatus> | null = null;
  private downloading: Promise<void> | null = null;
  private reportingUpdate = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    void this.bootstrapCheck();
  }

  @Interval(6 * 60 * 60 * 1000)
  async scheduledCheck() {
    const cfg = await this.loadRuntimeConfig();
    if (!cfg.enabled || !this.isConfigComplete(cfg)) return;
    await this.checkLicenseNow().catch((err) => {
      this.logger.warn(`定时授权校验失败：${err?.message || err}`);
    });
  }

  async getRuntimeStatus(): Promise<LicenseRuntimeStatus> {
    const cfg = await this.loadRuntimeConfig();
    if (!cfg.enabled) return this.disabledStatus();
    if (!this.isConfigComplete(cfg)) return this.unconfiguredStatus(this.missingConfigMessage(cfg));

    if (this.memoryStatus) return this.memoryStatus;
    const cached = await this.readJsonConfig<LicenseRuntimeStatus>(STATUS_KEY);
    if (cached) {
      this.memoryStatus = cached;
      return cached;
    }
    return this.unconfiguredStatus("尚未完成授权校验");
  }

  async getAdminStatus() {
    const [config, status, update, download, miniappUpdate, miniappDownload, applyStatus] = await Promise.all([
      this.loadRuntimeConfig(),
      this.getRuntimeStatus(),
      this.readJsonConfig<Record<string, unknown>>(UPDATE_KEY),
      this.readJsonConfig<Record<string, unknown>>(DOWNLOAD_KEY),
      this.readJsonConfig<Record<string, unknown>>(MINIAPP_UPDATE_KEY),
      this.readJsonConfig<Record<string, unknown>>(MINIAPP_DOWNLOAD_KEY),
      this.getApplyStatus(),
    ]);

    const systemUpdateState = await this.normalizeSystemUpdateState(update, download, applyStatus);

    return {
      config: this.maskConfig(config),
      status,
      update: systemUpdateState.update,
      download: systemUpdateState.download,
      miniappUpdate: miniappUpdate || null,
      miniappDownload: this.withMiniProgramDownloadLink(miniappDownload),
      applyStatus: systemUpdateState.applyStatus,
      paths: {
        updateDir: this.updateRoot(),
        pendingManifest: path.join(this.updateRoot(), "pending-update.json"),
        miniappDir: this.miniappDownloadRoot(),
      },
      tips: [
        "授权异常时不会删除数据，只会限制新增、修改、下单、支付、发布等写操作",
        "授权中心短暂不可用时，会按授权返回的离线天数继续运行",
        "更新包下载后会先验签和校验 SHA256，一键更新会自动备份、替换、迁移并重启",
        "业务模块接口会按授权模块清单统一校验，当前授权默认开放全部模块",
      ],
    };
  }

  async saveRuntimeConfig(body: Record<string, unknown>) {
    const current = await this.loadRuntimeConfig();
    const next: LicenseRuntimeConfig = {
      ...current,
      enabled: current.enabled,
      licenseKey: this.cleanSecretInput(body.licenseKey) || current.licenseKey,
    };

    await this.writeJsonConfig(CONFIG_KEY, next, "license");
    this.memoryStatus = null;
    return {
      success: true,
      message: "授权配置已保存",
      config: this.maskConfig(next),
      status: await this.getRuntimeStatus(),
    };
  }

  async checkLicenseNow(meta: LicenseRuntimeRequestMeta = {}): Promise<LicenseRuntimeStatus> {
    if (this.checking) return this.checking;
    this.checking = this.doCheckLicense(meta).finally(() => {
      this.checking = null;
    });
    return this.checking;
  }

  async checkUpdate(component = DEFAULT_COMPONENT, meta: LicenseRuntimeRequestMeta = {}) {
    return this.checkUpdateInternal(component, meta, undefined, UPDATE_KEY);
  }

  async getLatestMiniProgramPackage(meta: LicenseRuntimeRequestMeta = {}) {
    const result = await this.checkUpdateInternal(MINIAPP_COMPONENT, meta, "0.0.0", MINIAPP_UPDATE_KEY);
    if (!result.update && result.message === "当前已是最新版本") {
      result.message = "服务商还没有发布小程序包，暂时不能下载";
      await this.writeJsonConfig(MINIAPP_UPDATE_KEY, result, "license");
    }
    return result;
  }

  private async checkUpdateInternal(
    component = DEFAULT_COMPONENT,
    meta: LicenseRuntimeRequestMeta = {},
    currentVersionOverride?: string,
    storageKey = UPDATE_KEY,
  ) {
    const cfg = await this.loadRuntimeConfig();
    if (!cfg.enabled || !this.isConfigComplete(cfg)) {
      throw new BadRequestException(this.missingConfigMessage(cfg));
    }

    const status = await this.getRuntimeStatus();
    if (!status.writable) {
      throw new BadRequestException(`授权不可用，不能检查更新：${status.message}`);
    }

    const binding = this.resolveClientBinding(cfg, meta);
    const payload = {
      licenseKey: cfg.licenseKey,
      product: cfg.product || DEFAULT_PRODUCT,
      component: component || cfg.component || DEFAULT_COMPONENT,
      currentVersion: currentVersionOverride || cfg.version || this.currentVersion(),
      domain: binding.domain,
      apiDomain: binding.apiDomain,
      serverIp: binding.serverIp,
      wechatAppId: binding.wechatAppId,
    };

    const { data } = await this.requestSignedUpdateCheck(cfg, payload);
    this.assertSigned(data, cfg.publicKeyBase64);

    const result = {
      checkedAt: new Date().toISOString(),
      allowed: Boolean(data.allowed),
      hasUpdate: Boolean(data.hasUpdate),
      code: String(data.code || "UNKNOWN"),
      message: String(data.message || ""),
      update: data.update || null,
    };
    await this.writeJsonConfig(storageKey, result, "license");
    if (storageKey === UPDATE_KEY) {
      await this.clearStaleSystemUpdateState(result).catch((err) => {
        this.logger.warn(`清理过期更新状态失败：${err?.message || err}`);
      });
    }
    return result;
  }

  private async requestSignedUpdateCheck(cfg: LicenseRuntimeConfig, payload: Record<string, unknown>) {
    try {
      return await axios.post<SignedPayload>(this.serverUrl(cfg.server, "/updates/check"), payload, {
        timeout: 12000,
      });
    } catch (error: any) {
      const rawMessage = String(error?.message || "");
      const isTimeout = error?.code === "ECONNABORTED" || rawMessage.toLowerCase().includes("timeout");
      if (isTimeout) {
        throw new ServiceUnavailableException("授权中心响应超时，请稍后重试；如果反复出现，请检查客户服务器到授权中心的网络");
      }
      if (axios.isAxiosError(error)) {
        throw new BadGatewayException(`授权中心连接失败：${rawMessage || "请求异常"}`);
      }
      throw error;
    }
  }

  async downloadUpdatePackage(updateInput?: Record<string, unknown>) {
    const cfg = await this.loadRuntimeConfig();
    const cached = await this.readJsonConfig<any>(UPDATE_KEY);
    const update = updateInput || cached?.update;
    if (!update?.packageUrl || !update?.packageSha256) {
      throw new BadRequestException("没有可下载的更新包，请先检查更新");
    }

    if (update.packageSign) {
      this.verifyPackageSignature(update, cfg.publicKeyBase64);
    }

    const targetVersion = String(update.version || "unknown");
    const current = await this.readJsonConfig<any>(DOWNLOAD_KEY);
    if (this.downloading && current?.status === "downloading" && this.isSameUpdateRelease(update, current.update || {})) {
      return current;
    }

    await this.cleanupSystemUpdateWorkspace(targetVersion);
    await this.clearApplyStatusState();
    const state = {
      status: "downloading",
      message: "下载任务已启动，页面可安全关闭或刷新",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      update,
    };
    await this.writeJsonConfig(DOWNLOAD_KEY, state, "license");
    this.downloading = this.performSystemUpdateDownload(update, cfg.server)
      .catch((error) => this.writeJsonConfig(DOWNLOAD_KEY, {
        ...state,
        status: "failed",
        message: String(error?.message || error).slice(0, 500),
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, "license").then(() => undefined))
      .finally(() => {
        this.downloading = null;
      });
    return state;
  }

  async getDownloadStatus() {
    return this.readJsonConfig<Record<string, unknown>>(DOWNLOAD_KEY);
  }

  private async performSystemUpdateDownload(update: Record<string, any>, licenseServer: string) {
    const targetVersion = String(update.version || "unknown");
    const targetDir = path.join(this.updateRoot(), targetVersion);
    await fsp.mkdir(targetDir, { recursive: true });
    const packageUrl = this.trustedPackageUrl(update.packageUrl, licenseServer);
    const fileName = this.safeFileName(new URL(packageUrl).pathname.split("/").pop() || `lingmeng-${targetVersion}.zip`);
    const filePath = path.join(targetDir, fileName);
    const partPath = `${filePath}.part`;
    const offset = (await fsp.stat(partPath).catch(() => null))?.size || 0;
    const response = await axios.get<NodeJS.ReadableStream>(packageUrl, {
      responseType: "stream",
      timeout: UPDATE_TRANSFER_TIMEOUT_MS,
      headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
      maxContentLength: 1024 * 1024 * 1024,
      maxBodyLength: 1024 * 1024 * 1024,
      maxRedirects: 0,
    });
    const resumed = offset > 0 && response.status === 206;
    await pipeline(response.data, fs.createWriteStream(partPath, { flags: resumed ? "a" : "w" }));
    const sha256 = await this.sha256File(partPath);
    if (sha256 !== String(update.packageSha256)) {
      await fsp.rm(partPath, { force: true }).catch(() => undefined);
      throw new Error("更新包 SHA256 校验失败，已删除不完整文件");
    }
    await fsp.rename(partPath, filePath);
    const packageSize = (await fsp.stat(filePath)).size;
    const manifest = {
      status: "success",
      message: "更新包已下载并通过 SHA256 校验",
      downloadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileName,
      filePath,
      sha256,
      packageSize,
      update,
      nextStep: "可启动一键更新；更新将在独立任务中备份、迁移、重启和校验。",
    };
    await fsp.writeFile(path.join(this.updateRoot(), "pending-update.json"), JSON.stringify(manifest, null, 2), "utf8");
    await this.writeJsonConfig(DOWNLOAD_KEY, manifest, "license");
  }

  async downloadMiniProgramPackage(updateInput?: Record<string, unknown>) {
    const cfg = await this.loadRuntimeConfig();
    const cached = await this.readJsonConfig<any>(MINIAPP_UPDATE_KEY);
    const update = updateInput || cached?.update;
    if (!update?.packageUrl || !update?.packageSha256) {
      throw new BadRequestException("没有可下载的小程序包，请先获取最新小程序版本");
    }

    if (update.packageSign) {
      this.verifyPackageSignature(update, cfg.publicKeyBase64);
    }

    const targetDir = path.join(this.miniappDownloadRoot(), String(update.version || "unknown"));
    await fsp.mkdir(targetDir, { recursive: true });
    const packageUrl = this.trustedPackageUrl(update.packageUrl, cfg.server);
    const fileName = this.safeFileName(new URL(packageUrl).pathname.split("/").pop() || `lingmeng-miniapp-${update.version}.zip`);
    const filePath = path.join(targetDir, fileName);

    const response = await axios.get<ArrayBuffer>(packageUrl, {
      responseType: "arraybuffer",
      timeout: UPDATE_TRANSFER_TIMEOUT_MS,
      maxContentLength: 1024 * 1024 * 1024,
      maxBodyLength: 1024 * 1024 * 1024,
      maxRedirects: 0,
    });
    const buffer = Buffer.from(response.data);
    await fsp.writeFile(filePath, buffer);

    const sha256 = this.sha256Buffer(buffer);
    if (sha256 !== String(update.packageSha256)) {
      await fsp.rm(filePath, { force: true }).catch(() => undefined);
      throw new BadRequestException("小程序包 SHA256 校验失败，已拒绝保存");
    }

    const manifest = {
      downloadedAt: new Date().toISOString(),
      fileName,
      filePath,
      sha256,
      packageSize: buffer.length,
      update,
      nextStep: "小程序包已下载并校验完成。请下载到本机，用微信开发者工具打开后上传审核。",
    };
    await fsp.writeFile(path.join(this.miniappDownloadRoot(), "latest-miniapp.json"), JSON.stringify(manifest, null, 2), "utf8");
    await this.writeJsonConfig(MINIAPP_DOWNLOAD_KEY, manifest, "license");
    const result = this.withMiniProgramDownloadLink(manifest);
    return {
      success: true,
      message: "小程序包已下载并通过校验",
      ...result,
    };
  }

  async getMiniProgramDownloadFile(token?: string) {
    const cached = await this.readJsonConfig<any>(MINIAPP_DOWNLOAD_KEY);
    const filePath = cached?.filePath ? String(cached.filePath) : "";
    if (!filePath || !fs.existsSync(filePath)) {
      throw new BadRequestException("还没有可下载的小程序包，请先点击下载小程序包");
    }
    if (!this.verifyMiniProgramDownloadToken(cached, token)) {
      throw new BadRequestException("小程序下载链接已失效，请回到后台重新点击下载");
    }
    return {
      filePath,
      fileName: this.safeFileName(String(cached.fileName || path.basename(filePath))),
    };
  }

  async applyDownloadedUpdate() {
    const download = await this.readJsonConfig<any>(DOWNLOAD_KEY);
    if (!download?.filePath || !download?.update) {
      throw new BadRequestException("没有已下载并校验的更新包，请先下载更新包");
    }
    if (!fs.existsSync(download.filePath)) {
      throw new BadRequestException("更新包文件不存在，请重新下载");
    }

    const running = await this.getApplyStatus();
    if (running?.status === "running") {
      return running;
    }

    const update = download.update;
    const taskId = randomUUID();
    await this.cleanupSystemUpdateWorkspace(String(update.version || ""));
    const status = {
      status: "running",
      message: "更新任务已启动，正在备份和替换文件",
      startedAt: new Date().toISOString(),
      targetVersion: update.version || "",
      releaseId: update.id || "",
      component: update.component || DEFAULT_COMPONENT,
      fileName: download.fileName,
      taskId,
    };
    await this.writeApplyStatus(status);

    const runnerSource = path.join(this.projectRoot(), "backend", "scripts", "update-runner.sh");
    if (!fs.existsSync(runnerSource)) {
      await this.writeApplyStatus({ ...status, status: "failed", message: "当前运行包缺少统一更新器，已拒绝执行" });
      throw new BadRequestException("当前运行包缺少 backend/scripts/update-runner.sh");
    }

    const runner = path.join(this.updateRoot(), `update-runner-${taskId}.sh`);
    await fsp.copyFile(runnerSource, runner);
    await fsp.chmod(runner, 0o755);

    try {
      const child = spawn(
        "/bin/bash",
        [
          runner,
          this.projectRoot(),
          String(download.filePath),
          this.applyStatusPath(),
          String(update.version || ""),
          String(update.id || ""),
          String(update.component || DEFAULT_COMPONENT),
          taskId,
        ],
        {
          cwd: this.updateRoot(),
          detached: true,
          stdio: "ignore",
        },
      );
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      child.unref();
    } catch (error: any) {
      await this.writeApplyStatus({ ...status, status: "failed", message: `更新任务启动失败：${error?.message || error}` });
      throw new BadRequestException("更新任务启动失败，请查看更新日志");
    }
    return status;
  }

  async getApplyStatus(): Promise<Record<string, any> | null> {
    const fileStatus = await this.readApplyStatusFile();
    const runnerPid = Number(fileStatus?.runnerPid || 0);
    const runnerAlive = runnerPid > 0 ? this.isProcessAlive(runnerPid) : null;
    const status = reconcileApplyStatus(fileStatus || null, {
      now: Date.now(),
      staleAfterMs: APPLY_HEARTBEAT_TIMEOUT_MS,
      runnerAlive,
      currentVersion: this.currentVersion(),
      deployedVersion: this.deployedVersion(),
    });
    if (status?.recovered && status.updatedAt !== fileStatus?.updatedAt) {
      await this.writeApplyStatus(status);
      if (runnerAlive !== true) {
        await fsp.rm(path.join(this.updateRoot(), "apply.lock"), { recursive: true, force: true }).catch(() => undefined);
      }
    }
    if (status && ["success", "failed", "rolled_back"].includes(String(status.status)) && !status.reported && !this.reportingUpdate) {
      this.reportingUpdate = true;
      try {
        await this.reportUpdate({
          result: status.status === "success" ? "SUCCESS" : status.status === "rolled_back" ? "ROLLBACK" : "FAILED",
          message: status.message || "客户后台一键更新结果回传",
          releaseId: status.releaseId,
          targetVersion: status.targetVersion,
        }).catch(() => undefined);
      } finally {
        this.reportingUpdate = false;
      }
      const reported = { ...status, reported: true, reportedAt: new Date().toISOString() };
      await fsp.writeFile(this.applyStatusPath(), JSON.stringify(reported, null, 2), "utf8").catch(() => undefined);
      return reported;
    }
    return status;
  }

  async clearApplyStatus() {
    const status = await this.getApplyStatus();
    const runnerPid = Number(status?.runnerPid || 0);
    if (String(status?.status || "") === "running" || (runnerPid > 0 && this.isProcessAlive(runnerPid))) {
      throw new BadRequestException("更新任务仍在运行，不能清除活动状态");
    }
    await this.clearApplyStatusState();
    await fsp.rm(path.join(this.updateRoot(), "apply.lock"), { recursive: true, force: true }).catch(() => undefined);
    return { success: true, message: "更新状态记录已清除" };
  }

  private async normalizeSystemUpdateState(
    update: Record<string, unknown> | null,
    download: Record<string, unknown> | null,
    applyStatus: Record<string, unknown> | null,
  ) {
    const visibleDownload = this.isDownloadedUpdateStillCurrent(update, download) ? download : null;
    const visibleApplyStatus = this.isApplyStatusStillCurrent(update, visibleDownload || download, applyStatus)
      ? applyStatus
      : null;

    if (download && !visibleDownload) {
      await this.clearDownloadedUpdateState(download).catch((err) => {
        this.logger.warn(`清理过期下载包状态失败：${err?.message || err}`);
      });
    }
    if (applyStatus && !visibleApplyStatus) {
      await this.clearApplyStatusState().catch((err) => {
        this.logger.warn(`清理过期一键更新状态失败：${err?.message || err}`);
      });
    }

    return {
      update: update || null,
      download: visibleDownload,
      applyStatus: visibleApplyStatus,
    };
  }

  private async clearStaleSystemUpdateState(update: Record<string, unknown> | null) {
    const [download, applyStatus] = await Promise.all([
      this.readJsonConfig<Record<string, unknown>>(DOWNLOAD_KEY),
      this.getApplyStatus(),
    ]);
    await this.normalizeSystemUpdateState(update, download, applyStatus);
  }

  private isDownloadedUpdateStillCurrent(update: Record<string, unknown> | null, download: Record<string, unknown> | null) {
    if (!update?.hasUpdate || !update.update || !download?.update) return false;
    if (!["downloading", "failed"].includes(String(download.status || "")) && !download.filePath) return false;
    return this.isSameUpdateRelease(update.update as Record<string, unknown>, download.update as Record<string, unknown>);
  }

  private isApplyStatusStillCurrent(
    update: Record<string, unknown> | null,
    download: Record<string, unknown> | null,
    applyStatus: Record<string, unknown> | null,
  ) {
    if (!applyStatus) return false;
    if (String(applyStatus.status || "") === "running") return true;
    if (!update?.hasUpdate || !update.update) return false;

    const statusRelease = {
      id: applyStatus.releaseId,
      version: applyStatus.targetVersion,
      component: applyStatus.component || (download?.update as Record<string, unknown> | undefined)?.component,
    };
    return this.isSameUpdateRelease(update.update as Record<string, unknown>, statusRelease);
  }

  private isSameUpdateRelease(left: Record<string, unknown>, right: Record<string, unknown>) {
    const leftId = this.clean(left.id);
    const rightId = this.clean(right.id);
    if (leftId && rightId) return leftId === rightId;

    const leftVersion = this.clean(left.version);
    const rightVersion = this.clean(right.version);
    if (!leftVersion || !rightVersion || leftVersion !== rightVersion) return false;

    const leftComponent = this.clean(left.component);
    const rightComponent = this.clean(right.component);
    if (leftComponent && rightComponent && leftComponent !== rightComponent) return false;

    const leftSha = this.clean(left.packageSha256);
    const rightSha = this.clean(right.packageSha256);
    if (leftSha && rightSha && leftSha !== rightSha) return false;

    return true;
  }

  private async clearDownloadedUpdateState(download?: Record<string, unknown> | null) {
    await this.deleteJsonConfig(DOWNLOAD_KEY);
    await fsp.rm(path.join(this.updateRoot(), "pending-update.json"), { force: true }).catch(() => undefined);

    const filePath = this.resolvePathInside(this.updateRoot(), download?.filePath);
    if (filePath) {
      await fsp.rm(filePath, { force: true }).catch(() => undefined);
      await fsp.rmdir(path.dirname(filePath)).catch(() => undefined);
    }
  }

  private async clearApplyStatusState() {
    await fsp.rm(this.applyStatusPath(), { force: true }).catch(() => undefined);
  }

  private async cleanupSystemUpdateWorkspace(currentVersion?: string) {
    const root = this.updateRoot();
    await fsp.mkdir(root, { recursive: true }).catch(() => undefined);
    await this.pruneChildDirs(root, (name) => name.startsWith("work-") || (!!currentVersion && name !== currentVersion));
    await this.pruneFiles(path.join(this.projectRoot(), "storage", "backups"), /^update-.*\.tar\.gz$/, 2);
    await fsp.rm(path.join(this.projectRoot(), ".npm-cache", "_cacache", "tmp"), { recursive: true, force: true }).catch(() => undefined);
    await fsp.rm(path.join(this.projectRoot(), "backend", "node_modules", ".cache"), { recursive: true, force: true }).catch(() => undefined);
    await fsp.rm(path.join(this.projectRoot(), "admin", "node_modules", ".cache"), { recursive: true, force: true }).catch(() => undefined);
  }

  private async pruneChildDirs(parent: string, shouldRemove: (name: string) => boolean) {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(parent, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && shouldRemove(entry.name))
        .map((entry) => fsp.rm(path.join(parent, entry.name), { recursive: true, force: true }).catch(() => undefined)),
    );
  }

  private async pruneFiles(parent: string, pattern: RegExp, keep = 2) {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(parent, { withFileTypes: true });
    } catch {
      return;
    }
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && pattern.test(entry.name))
        .map(async (entry) => {
          const file = path.join(parent, entry.name);
          const stat = await fsp.stat(file).catch(() => null);
          return stat ? { file, mtimeMs: stat.mtimeMs } : null;
        }),
    );
    const stale = files
      .filter((item): item is { file: string; mtimeMs: number } => !!item)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(keep);
    await Promise.all(stale.map((item) => fsp.rm(item.file, { force: true }).catch(() => undefined)));
  }

  private async deleteJsonConfig(key: string) {
    await this.prisma.config.delete({ where: { key } }).catch(() => undefined);
  }

  async reportUpdate(body: { result: "SUCCESS" | "FAILED" | "ROLLBACK"; message?: string; releaseId?: string; targetVersion?: string }) {
    const cfg = await this.loadRuntimeConfig();
    if (!cfg.enabled || !cfg.licenseKey || !cfg.server) {
      throw new BadRequestException("授权配置未完成，不能回传更新结果");
    }
    const update = await this.readJsonConfig<any>(UPDATE_KEY);
    const payload = {
      licenseKey: cfg.licenseKey,
      releaseId: body.releaseId || update?.update?.id,
      product: cfg.product || DEFAULT_PRODUCT,
      component: cfg.component || DEFAULT_COMPONENT,
      currentVersion: cfg.version || this.currentVersion(),
      targetVersion: body.targetVersion || update?.update?.version,
      result: body.result,
      message: `${body.message || "客户后台回传更新结果"}\nDIAGNOSTICS:${JSON.stringify(await this.getDatabaseDiagnostics())}`,
    };
    const { data } = await axios.post(this.serverUrl(cfg.server, "/updates/report"), payload, { timeout: 15000 });
    return data;
  }

  async getDatabaseDiagnostics() {
    const checkedAt = new Date().toISOString();
    const provider = this.databaseProvider();
    const checks: Array<{ key: string; label: string; status: "PASS" | "MISSING" | "WARNING" | "UNAVAILABLE"; detail: string; repairable?: boolean }> = [];

    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      checks.push({ key: "database.connection", label: "数据库连接", status: "PASS", detail: `已连接 ${provider}` });
    } catch (error: any) {
      checks.push({ key: "database.connection", label: "数据库连接", status: "UNAVAILABLE", detail: String(error?.message || error).slice(0, 300) });
      return { checkedAt, provider, status: "UNAVAILABLE", checks, repairAvailable: false };
    }

    const applyStatus = await this.getApplyStatus().catch(() => null);
    const applyState = String(applyStatus?.status || "");
    checks.push({
      key: "update.lastApply",
      label: "最近更新状态",
      status: ["failed", "rolled_back"].includes(applyState) ? "WARNING" : "PASS",
      detail: applyStatus?.message || "未发现失败的一键更新记录",
    });

    const diskVersion = this.currentVersion();
    const backendVersion = this.readPackageVersion(path.join(this.projectRoot(), "backend", "package.json"));
    checks.push({
      key: "runtime.version",
      label: "运行包版本一致性",
      status: backendVersion && backendVersion !== diskVersion ? "WARNING" : "PASS",
      detail: backendVersion && backendVersion !== diskVersion
        ? `版本文件为 ${diskVersion}，后端运行包为 ${backendVersion}`
        : `当前版本 ${diskVersion}`,
    });

    try {
      const migration = await this.runMigrationRunner("status");
      const items = Array.isArray(migration.migrations) ? migration.migrations : [];
      const pending = items.filter((item: any) => item.status === "PENDING" || item.status === "FAILED");
      const mismatched = items.filter((item: any) => item.status === "CHECKSUM_MISMATCH");
      checks.push({
        key: "database.migrations",
        label: "版本数据库迁移",
        status: mismatched.length ? "UNAVAILABLE" : pending.length ? "MISSING" : "PASS",
        detail: mismatched.length
          ? `迁移文件被修改：${mismatched.map((item: any) => item.name).join("、")}`
          : pending.length
            ? `待执行或失败：${pending.map((item: any) => item.name).join("、")}`
            : `当前版本 ${items.length} 个迁移均已登记并通过 checksum 校验`,
        repairable: !mismatched.length && pending.length > 0,
      });
      checks.push({
        key: "schema.runtime",
        label: "完整数据库结构",
        status: migration.schema?.status || "UNAVAILABLE",
        detail: migration.schema?.detail || "迁移 runner 未返回结构校验结果",
      });
    } catch (error: any) {
      checks.push({
        key: "database.migrations",
        label: "版本数据库迁移",
        status: "UNAVAILABLE",
        detail: String(error?.message || error).slice(0, 500),
      });
    }

    const status = checks.some((item) => item.status === "UNAVAILABLE")
      ? "UNAVAILABLE"
      : checks.some((item) => item.status === "MISSING")
        ? "MISSING"
        : checks.some((item) => item.status === "WARNING")
          ? "WARNING"
          : "PASS";
    return { checkedAt, provider, status, checks, repairAvailable: checks.some((item) => item.repairable) };
  }

  async repairDatabaseDiagnostics() {
    const before = await this.getDatabaseDiagnostics();
    if (!before.repairAvailable) {
      return { success: true, message: "没有待执行或可安全重试的版本迁移", diagnostics: before, applied: [] as string[] };
    }
    await this.runMigrationRunner("apply", 30 * 60 * 1000);
    const diagnostics = await this.getDatabaseDiagnostics();
    if (diagnostics.status === "MISSING" || diagnostics.status === "UNAVAILABLE") {
      throw new BadRequestException("版本迁移执行后校验仍未通过，请保留迁移名称和错误信息");
    }
    return { success: true, message: "待执行迁移已完成并通过统一检测", diagnostics };
  }

  private readPackageVersion(file: string) {
    try {
      return String(JSON.parse(fs.readFileSync(file, "utf8")).version || "");
    } catch {
      return "";
    }
  }

  private runMigrationRunner(command: "status" | "apply", timeoutMs = 2 * 60 * 1000) {
    const backendRoot = path.join(this.projectRoot(), "backend");
    const runner = path.join(backendRoot, "scripts", "migrate-release.cjs");
    if (!fs.existsSync(runner)) return Promise.reject(new Error("缺少统一数据库迁移 runner"));
    return new Promise<any>((resolve, reject) => {
      const child = spawn(process.execPath, [runner, command], {
        cwd: backendRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      const append = (chunk: Buffer) => {
        if (output.length < 2 * 1024 * 1024) output += chunk.toString();
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(output.trim() || `迁移 runner 退出码 ${code}`));
        const line = output.split(/\r?\n/).reverse().find((item) => item.startsWith("LINGMENG_MIGRATIONS_JSON="));
        if (!line) return reject(new Error("迁移 runner 未返回可解析状态"));
        try {
          resolve(JSON.parse(line.slice("LINGMENG_MIGRATIONS_JSON=".length)));
        } catch {
          reject(new Error("迁移 runner 返回了无效 JSON"));
        }
      });
    });
  }

  private async bootstrapCheck() {
    const cfg = await this.loadRuntimeConfig().catch(() => null);
    if (!cfg?.enabled || !this.isConfigComplete(cfg)) return;
    await this.checkLicenseNow().catch((err) => {
      this.logger.warn(`启动授权校验失败：${err?.message || err}`);
    });
  }

  private async doCheckLicense(meta: LicenseRuntimeRequestMeta = {}): Promise<LicenseRuntimeStatus> {
    const cfg = await this.loadRuntimeConfig();
    if (!cfg.enabled) return this.persistStatus(this.disabledStatus());
    if (!this.isConfigComplete(cfg)) return this.persistStatus(this.unconfiguredStatus(this.missingConfigMessage(cfg)));

    const binding = this.resolveClientBinding(cfg, meta);
    const payload = {
      licenseKey: cfg.licenseKey,
      domain: binding.domain,
      apiDomain: binding.apiDomain,
      serverIp: binding.serverIp,
      wechatAppId: binding.wechatAppId,
      systemVersion: cfg.version || this.currentVersion(),
    };

    try {
      const { data } = await axios.post<SignedPayload>(this.serverUrl(cfg.server, "/license/check"), payload, {
        timeout: 12000,
      });
      this.assertSigned(data, cfg.publicKeyBase64);

      const now = new Date();
      const maxOfflineDays = Number(data.license?.maxOfflineDays || cfg.cacheDays || DEFAULT_CACHE_DAYS);
      const modules = normalizeLicenseModules(data.modules || data.license?.modules);
      const status: LicenseRuntimeStatus = {
        enabled: true,
        configured: true,
        allowed: Boolean(data.allowed),
        writable: Boolean(data.allowed),
        code: String(data.code || (data.allowed ? "OK" : "UNKNOWN")) as any,
        message: String(data.message || (data.allowed ? "授权正常" : "授权不可用")),
        checkedAt: now.toISOString(),
        serverTime: data.serverTime || null,
        offlineUntil: data.allowed ? new Date(now.getTime() + maxOfflineDays * 24 * 60 * 60 * 1000).toISOString() : null,
        customerName: data.license?.customerName || null,
        expireAt: data.license?.expireAt || null,
        maxOfflineDays,
        lastError: null,
        modules,
        binding: data.binding || null,
        observed: {
          domain: binding.domain || null,
          serverIp: binding.serverIp || "由授权平台按请求 IP 识别",
        },
      };
      return this.persistStatus(status);
    } catch (err: any) {
      return this.handleCheckFailure(err);
    }
  }

  private async handleCheckFailure(err: any) {
    const cached = this.memoryStatus || (await this.readJsonConfig<LicenseRuntimeStatus>(STATUS_KEY));
    const now = Date.now();
    const offlineUntil = cached?.offlineUntil ? new Date(cached.offlineUntil).getTime() : 0;
    const message = err?.response?.data?.message || err?.message || "授权中心连接失败";

    if (cached?.allowed && offlineUntil > now) {
      return this.persistStatus({
        ...cached,
        allowed: true,
        writable: true,
        code: "GRACE",
        message: `授权中心暂时不可用，系统处于离线宽限期，宽限至 ${new Date(offlineUntil).toLocaleString("zh-CN")}`,
        lastError: message,
      });
    }

    return this.persistStatus({
      enabled: true,
      configured: true,
      allowed: false,
      writable: false,
      code: "NETWORK_ERROR",
      message: `授权中心连接失败，且没有可用离线授权：${message}`,
      checkedAt: new Date().toISOString(),
      lastError: message,
      modules: cached?.modules || [],
    });
  }

  isModuleAllowed(moduleKey: string | null | undefined, status: LicenseRuntimeStatus) {
    if (!moduleKey) return true;
    if (!status.allowed && !status.writable) return false;
    return isModuleEnabled(status.modules, moduleKey);
  }

  private async loadRuntimeConfig(): Promise<LicenseRuntimeConfig> {
    const saved = await this.readJsonConfig<Partial<LicenseRuntimeConfig>>(CONFIG_KEY);
    const bundled = this.loadBundledLicenseDefaults();
    const envEnabled = this.toBoolean(this.config.get("LICENSING_ENABLED"), false);
    const envKey = this.config.get<string>("LICENSE_KEY") || "";
    const envServer = this.config.get<string>("LICENSE_SERVER") || "";
    const envPublicKey = this.config.get<string>("LICENSE_PUBLIC_KEY_BASE64") || "";
    const enabled = envEnabled || Boolean(envKey || envServer || bundled.server || saved?.server) || Boolean(saved?.enabled);

    return {
      enabled,
      server: envServer || bundled.server || saved?.server || "",
      licenseKey: saved?.licenseKey || envKey,
      publicKeyBase64: envPublicKey || bundled.publicKeyBase64 || saved?.publicKeyBase64 || "",
      domain: this.config.get<string>("LICENSE_DOMAIN") || this.inferDomainFromEnv(),
      apiDomain: this.config.get<string>("LICENSE_API_DOMAIN") || "",
      serverIp: this.config.get<string>("LICENSE_SERVER_IP") || "",
      wechatAppId: this.config.get<string>("LICENSE_WECHAT_APPID") || this.config.get<string>("WX_MINI_APPID") || "",
      product: this.config.get<string>("LICENSE_PRODUCT") || saved?.product || DEFAULT_PRODUCT,
      component: this.config.get<string>("LICENSE_COMPONENT") || saved?.component || DEFAULT_COMPONENT,
      version: this.currentVersion() || this.config.get<string>("APP_VERSION") || saved?.version || "1.0.0",
      cacheDays: Number(this.config.get("LICENSE_CACHE_DAYS") || saved?.cacheDays || DEFAULT_CACHE_DAYS),
    };
  }

  private loadBundledLicenseDefaults(): { server: string; publicKeyBase64: string } {
    const candidates = [
      path.join(process.cwd(), "dist", "license-runtime.defaults.cjs"),
      path.join(process.cwd(), "license-runtime.defaults.cjs"),
      path.join(this.projectRoot(), "backend", "dist", "license-runtime.defaults.cjs"),
      path.join(this.projectRoot(), "dist", "license-runtime.defaults.cjs"),
    ];
    for (const file of candidates) {
      try {
        if (!fs.existsSync(file)) continue;
        delete require.cache[require.resolve(file)];
        const loaded = require(file);
        return {
          server: this.clean(loaded?.server),
          publicKeyBase64: this.clean(loaded?.publicKeyBase64),
        };
      } catch {
        // Ignore malformed bundled defaults and fall through to env/database config.
      }
    }
    return { server: "", publicKeyBase64: "" };
  }

  private isConfigComplete(cfg: LicenseRuntimeConfig) {
    return Boolean(cfg.server && cfg.licenseKey && cfg.publicKeyBase64);
  }

  private missingConfigMessage(cfg: LicenseRuntimeConfig) {
    if (!cfg.server || !cfg.publicKeyBase64) {
      return "服务商未预置授权中心地址或公钥，请联系服务商处理";
    }
    if (!cfg.licenseKey) {
      return "请输入授权码后再校验授权";
    }
    return "授权配置未完成";
  }

  private assertSigned(payload: SignedPayload, publicKeyBase64: string) {
    if (!payload?.signature) throw new BadRequestException("授权中心响应缺少签名");
    if (!publicKeyBase64) throw new BadRequestException("缺少授权中心公钥，不能验签");
    const { signature, ...unsigned } = payload;
    const publicKey = Buffer.from(publicKeyBase64, "base64").toString("utf8");
    const ok = verify("RSA-SHA256", Buffer.from(canonicalJson(unsigned)), publicKey, Buffer.from(signature, "base64"));
    if (!ok) throw new BadRequestException("授权中心响应验签失败");
  }

  private verifyPackageSignature(update: Record<string, unknown>, publicKeyBase64: string) {
    if (!publicKeyBase64 || !update.packageSign) return;
    const fileName = this.safeFileName(String(update.packageUrl || "").split("/").pop() || "");
    const payload = {
      fileName,
      product: update.product,
      component: update.component,
      version: update.version,
      packageSha256: update.packageSha256,
      packageSize: update.packageSize,
    };
    const publicKey = Buffer.from(publicKeyBase64, "base64").toString("utf8");
    const ok = verify(
      "RSA-SHA256",
      Buffer.from(canonicalJson(payload)),
      publicKey,
      Buffer.from(String(update.packageSign), "base64"),
    );
    if (!ok) throw new BadRequestException("更新包签名校验失败");
  }

  private async persistStatus(status: LicenseRuntimeStatus) {
    this.memoryStatus = status;
    await this.writeJsonConfig(STATUS_KEY, status, "license").catch(() => undefined);
    return status;
  }

  private disabledStatus(): LicenseRuntimeStatus {
    return {
      enabled: false,
      configured: false,
      allowed: true,
      writable: true,
      code: "DISABLED",
      message: "授权校验未启用",
      modules: normalizeLicenseModules(undefined),
    };
  }

  private unconfiguredStatus(message = "请输入授权码后再校验授权"): LicenseRuntimeStatus {
    return {
      enabled: true,
      configured: false,
      allowed: false,
      writable: false,
      code: "UNCONFIGURED",
      message,
      modules: [],
    };
  }

  private async readJsonConfig<T>(key: string): Promise<T | null> {
    try {
      const row = await this.prisma.config.findUnique({ where: { key } });
      return (row?.value as T) || null;
    } catch {
      return null;
    }
  }

  private async writeJsonConfig(key: string, value: unknown, group: string) {
    return this.prisma.config.upsert({
      where: { key },
      create: { key, value: value as any, group },
      update: { value: value as any, group },
    });
  }

  private maskConfig(config: LicenseRuntimeConfig) {
    return {
      enabled: config.enabled,
      licenseKey: this.mask(config.licenseKey),
      product: config.product,
      component: config.component,
      version: config.version,
      cacheDays: config.cacheDays,
      serviceReady: Boolean(config.server && config.publicKeyBase64),
      serviceMessage: config.server && config.publicKeyBase64 ? "授权中心已由服务商预置" : "服务商未预置授权中心地址或公钥，请联系服务商处理",
      detectedDomain: config.domain || this.inferDomainFromEnv() || "",
      detectedIp: config.serverIp || "由授权平台按请求 IP 识别",
    };
  }

  private resolveClientBinding(cfg: LicenseRuntimeConfig, meta: LicenseRuntimeRequestMeta) {
    const originDomain = this.normalizeDomain(meta.origin);
    const hostDomain = this.normalizeDomain(meta.host);
    return {
      domain: cfg.domain || originDomain || hostDomain || "",
      apiDomain: cfg.apiDomain || hostDomain || "",
      serverIp: cfg.serverIp || "",
      wechatAppId: cfg.wechatAppId || "",
    };
  }

  private serverUrl(server: string, pathname: string) {
    const base = String(server || "").replace(/\/$/, "");
    if (!base) throw new BadRequestException("授权中心地址未配置");
    return `${base}${pathname}`;
  }

  private trustedPackageUrl(packageUrl: unknown, licenseServer: string) {
    try {
      const candidate = new URL(String(packageUrl || ""));
      const trustedOrigin = new URL(String(licenseServer || "")).origin;
      if (candidate.protocol !== "https:" || candidate.origin !== trustedOrigin || candidate.username || candidate.password) {
        throw new Error("untrusted");
      }
      return candidate.href;
    } catch {
      throw new BadRequestException("更新包地址不可信，必须使用授权中心的 HTTPS 地址");
    }
  }

  private currentVersion() {
    const root = this.projectRoot();
    const backendPackage = path.join(root, "backend", "package.json");
    if (fs.existsSync(backendPackage)) {
      try {
        const version = JSON.parse(fs.readFileSync(backendPackage, "utf8")).version;
        if (version) return version;
      } catch {
        // Fall through to deployment markers.
      }
    }
    const versionFile = path.join(root, "deploy", "VERSION");
    if (fs.existsSync(versionFile)) {
      const value = fs.readFileSync(versionFile, "utf8").trim();
      if (value) return value;
    }
    for (const file of [path.join(root, "package.json")]) {
      if (!fs.existsSync(file)) continue;
      try {
        return JSON.parse(fs.readFileSync(file, "utf8")).version || "1.0.0";
      } catch {
        // ignore invalid package.json
      }
    }
    return "1.0.0";
  }

  private deployedVersion() {
    try {
      return fs.readFileSync(path.join(this.projectRoot(), "deploy", "VERSION"), "utf8").trim();
    } catch {
      return "";
    }
  }

  private isProcessAlive(pid: number) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private projectRoot() {
    const cwd = process.cwd();
    return path.basename(cwd) === "backend" ? path.dirname(cwd) : cwd;
  }

  private databaseProvider() {
    const configured = String(this.config.get<string>("DB_PROVIDER") || "").trim().toLowerCase();
    if (configured === "postgres") return "postgresql";
    if (configured === "mysql" || configured === "postgresql") return configured;
    const databaseUrl = String(this.config.get<string>("DATABASE_URL") || "").trim().toLowerCase();
    return databaseUrl.startsWith("postgres") ? "postgresql" : "mysql";
  }

  private updateRoot() {
    return path.join(this.projectRoot(), "storage", "updates");
  }

  private miniappDownloadRoot() {
    return path.join(this.projectRoot(), "storage", "mini-program-downloads");
  }

  private applyStatusPath() {
    return path.join(this.updateRoot(), "apply-status.json");
  }

  private async writeApplyStatus(status: Record<string, unknown>) {
    await fsp.mkdir(this.updateRoot(), { recursive: true });
    await fsp.writeFile(this.applyStatusPath(), JSON.stringify(status, null, 2), "utf8");
  }

  private async readApplyStatusFile() {
    try {
      return JSON.parse(await fsp.readFile(this.applyStatusPath(), "utf8"));
    } catch {
      return null;
    }
  }

  private withMiniProgramDownloadLink<T extends Record<string, any> | null | undefined>(download: T): T {
    if (!download?.filePath) return download;
    const token = this.createMiniProgramDownloadToken(download);
    return {
      ...download,
      browserDownloadUrl: `/admin/license-runtime/miniapp/file?token=${encodeURIComponent(token)}`,
      tokenExpiresAt: new Date(Date.now() + MINIAPP_DOWNLOAD_TOKEN_TTL_MS).toISOString(),
    } as T;
  }

  private createMiniProgramDownloadToken(download: Record<string, any>) {
    const expiresAt = Date.now() + MINIAPP_DOWNLOAD_TOKEN_TTL_MS;
    const payload = this.miniProgramDownloadTokenPayload(download, expiresAt);
    const signature = createHmac("sha256", this.downloadTokenSecret()).update(payload).digest("hex");
    return `${expiresAt}.${signature}`;
  }

  private verifyMiniProgramDownloadToken(download: Record<string, any>, token?: string) {
    const [expiresRaw, signature = ""] = String(token || "").split(".");
    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;
    const payload = this.miniProgramDownloadTokenPayload(download, expiresAt);
    const expected = createHmac("sha256", this.downloadTokenSecret()).update(payload).digest("hex");
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private miniProgramDownloadTokenPayload(download: Record<string, any>, expiresAt: number) {
    return [
      String(download.filePath || ""),
      String(download.sha256 || ""),
      String(download.fileName || ""),
      String(download.downloadedAt || ""),
      String(expiresAt),
    ].join("|");
  }

  private downloadTokenSecret() {
    return (
      this.config.get<string>("ADMIN_JWT_SECRET") ||
      this.config.get<string>("JWT_SECRET_ADMIN") ||
      this.config.get<string>("JWT_SECRET") ||
      this.config.get<string>("SETUP_TOKEN") ||
      "lingmeng-miniapp-download"
    );
  }

  private sha256Buffer(buffer: Buffer) {
    return createHash("sha256").update(buffer).digest("hex");
  }

  private async sha256File(file: string) {
    const hash = createHash("sha256");
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest("hex");
  }

  private safeFileName(name: string) {
    return path.basename(name).replace(/[^\w.-]+/g, "-") || "update.zip";
  }

  private resolvePathInside(root: string, value: unknown) {
    const text = this.clean(value);
    if (!text) return "";
    const resolvedRoot = path.resolve(root);
    const resolvedPath = path.resolve(text);
    return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`) ? resolvedPath : "";
  }

  private clean(value: unknown) {
    const text = String(value ?? "").trim();
    return text || "";
  }

  private normalizeDomain(value: unknown) {
    const text = this.clean(value);
    if (!text || text === "true" || text === "*") return "";
    const first = text.split(",").map((item) => item.trim()).find(Boolean) || "";
    return first
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .toLowerCase();
  }

  private inferDomainFromEnv() {
    return (
      this.normalizeDomain(this.config.get<string>("APP_URL")) ||
      this.normalizeDomain(this.config.get<string>("PUBLIC_BASE_URL")) ||
      this.normalizeDomain(this.config.get<string>("PUBLIC_API_URL")) ||
      this.normalizeDomain(this.config.get<string>("CORS_ORIGIN"))
    );
  }

  private cleanSecretInput(value: unknown) {
    const text = this.clean(value);
    if (!text || text.includes("****") || text.endsWith("...")) return "";
    return text;
  }

  private toBoolean(value: unknown, fallback: boolean) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    return ["1", "true", "yes", "on", "启用"].includes(String(value).toLowerCase());
  }

  private toNumber(value: unknown, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  private mask(value: string) {
    if (!value) return "";
    if (value.length <= 10) return "******";
    return `${value.slice(0, 6)}****${value.slice(-4)}`;
  }
}
