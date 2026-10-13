import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import axios from "axios";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "crypto";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";

const FEIE_PRINT_URL = "https://api.feieyun.cn/Api/Open/printMsg";
const FEIE_QUERY_URL = "https://api.feieyun.cn/Api/Open/queryOrderState";
const FEIE_ADD_URL = "https://api.feieyun.cn/Api/Open/printerAddlist";
const FEIE_STATUS_URL = "https://api.feieyun.cn/Api/Open/queryPrinterStatus";
const SUBMITTED_POLL_WINDOW_MS = 24 * 60 * 60_000;
const YLY_BASE_URL = "https://open-api.10ss.net/v2";
const XPYUN_BASE_URL = "https://open.xpyun.net/api/openapi/xprinter";
const GPRINTER_BASE_URL = "https://api.poscom.cn/apisc";
const SUPPORTED_BRANDS = ["feie", "yly", "xpyun", "gprinter", "moth"];
const FEIE_MAX_CONTENT_BYTES = 5000;

type FeieConfig = { enabled?: boolean; user?: string; ukey?: string };
type PrinterCredentials = {
  user?: string;
  ukey?: string;
  clientId?: string;
  clientSecret?: string;
  xpyUser?: string;
  xpyUserKey?: string;
  gpMemberCode?: string;
  gpApiKey?: string;
  deviceKey?: string;
};

@Injectable()
export class PrintService {
  private readonly logger = new Logger(PrintService.name);
  private reconcileRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Only used after the order is actionable by the merchant. */
  async enqueueAutomaticOrder(orderId: string) {
    const order = await this.getOrder(orderId);
    if (
      !order ||
      order.status !== "PAID" ||
      order.merchantAcceptTime ||
      ["refunding", "refunded"].includes(
        String(order.refundStatus || "none"),
      ) ||
      (order.fulfillmentStartTime &&
        new Date(order.fulfillmentStartTime) > new Date())
    ) {
      return { queued: 0 };
    }
    const printers = await this.prisma.printerConfig.findMany({
      where: {
        merchantId: order.merchantId,
        autoPrint: true,
        status: "active",
        brand: { in: SUPPORTED_BRANDS },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    const results = await Promise.all(
      printers.map((printer) =>
        this.createQueued({
          order,
          printer,
          event: "auto",
          dedupeKey: `auto:${order.id}:${printer.id}`,
        }),
      ),
    );
    return { queued: results.filter(Boolean).length };
  }

  async reprintOrder(orderId: string, merchantId: string) {
    const order = await this.getOrder(orderId);
    if (!order || order.merchantId !== merchantId)
      throw new BadRequestException("订单不存在或不属于当前商家");
    const printers = await this.prisma.printerConfig.findMany({
      where: { merchantId, status: "active", brand: { in: SUPPORTED_BRANDS } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    if (!printers.length)
      throw new BadRequestException("请先启用受支持的云小票机");
    const count = await this.prisma.printJob.count({
      where: { orderId, event: "manual" },
    });
    const results = await Promise.all(
      printers.map((printer) =>
        this.createAndSubmit({
          order,
          printer,
          event: "manual",
          copyLabel: `补打·第 ${count + 1} 联`,
          dedupeKey: `manual:${order.id}:${printer.id}:${count + 1}`,
        }),
      ),
    );
    const submitted = results.filter(
      (job) => job?.status === "submitted",
    ).length;
    if (!submitted)
      throw new BadRequestException(
        "云打印服务未确认受理补打任务，请核对设备状态后再试",
      );
    return {
      success: true,
      queued: submitted,
      message: "补打任务已提交云打印服务",
    };
  }

  /** Queues ready-made receipt content (e.g. a 代买 ticket) for the Worker; a repeated dedupeKey is ignored. */
  enqueue(input: {
    printer: any;
    event: string;
    dedupeKey: string;
    content: string;
    orderId?: string;
    bizType: string;
    bizId: string;
    expiresAt?: Date;
    copies?: number;
  }) {
    return this.createQueued({ ...input, content: this.limit(input.content) });
  }

  /** Adds the device to the owner's Feie account so printMsg accepts it; needs the KEY from the device label. */
  async bindFeieDevice(printerId: string) {
    const printer = await this.prisma.printerConfig.findUnique({
      where: { id: printerId },
    });
    if (!printer || this.providerOf(printer) !== "feie") return null;
    const deviceKey =
      printer.connectionMode === "platform_managed"
        ? ""
        : String(
            this.decryptCredentials(printer.credentialCiphertext).deviceKey ||
              "",
          );
    if (!deviceKey)
      return {
        bound: false,
        message: "未填写设备 KEY，请确认已在飞鹅云后台添加该设备",
      };
    const result = await this.feieRequest(
      printer,
      FEIE_ADD_URL,
      "Open_printerAddlist",
      { printerContent: `${printer.sn}#${deviceKey}#${this.safe(printer.name).replace(/#/g, "")}` },
    );
    if (Number(result.ret) !== 0)
      return { bound: false, message: String(result.msg || "飞鹅云拒绝添加设备") };
    const failed: string[] = Array.isArray(result.data?.no) ? result.data.no : [];
    const reason = failed.map(String).join("；");
    // Feie reports an already-bound device under "no"; it is still usable.
    if (!failed.length || /已被添加过/.test(reason)) return { bound: true, message: "" };
    // Rows echo "SN#KEY#name", so only the error text goes back to the caller.
    const detail = reason.match(/错误[:：]\s*([^）)]+)/)?.[1];
    return {
      bound: false,
      message: detail?.trim() || "飞鹅云未能添加该设备，请核对 SN 与 KEY",
    };
  }

  /** Online / paper state for Feie devices; other brands report unsupported. */
  async printerStatus(printerId: string) {
    const printer = await this.prisma.printerConfig.findUnique({
      where: { id: printerId },
    });
    if (!printer) throw new BadRequestException("打印机不存在");
    if (this.providerOf(printer) !== "feie")
      return { supported: false, online: null, text: "该品牌暂不支持查询在线状态" };
    const result = await this.feieRequest(
      printer,
      FEIE_STATUS_URL,
      "Open_queryPrinterStatus",
      { sn: printer.sn },
    );
    if (Number(result.ret) !== 0)
      throw new BadRequestException(String(result.msg || "飞鹅云查询设备状态失败"));
    const text = String(result.data || "");
    return {
      supported: true,
      online: /^在线/.test(text),
      normal: /正常/.test(text) && !/不正常/.test(text),
      text,
    };
  }

  async testPrinter(printerId: string, content?: string) {
    return this.submitTest(printerId, this.testReceipt(content));
  }

  /** Sends ready-made, already-escaped markup at once, e.g. a template sample ticket. */
  async printSample(printerId: string, content: string, copies = 1) {
    return this.submitTest(printerId, this.limit(content), copies);
  }

  private async submitTest(printerId: string, content: string, copies = 1) {
    const printer = await this.prisma.printerConfig.findUnique({
      where: { id: printerId },
    });
    if (!printer) throw new BadRequestException("打印机不存在");
    if (
      !SUPPORTED_BRANDS.includes(printer.brand) ||
      printer.status !== "active"
    ) {
      throw new BadRequestException("仅可测试已启用的云小票机");
    }
    return this.createAndSubmit({
      printer,
      event: "test",
      bizType: "test",
      content,
      copies,
      dedupeKey: `test:${printer.id}:${Date.now()}`,
    });
  }

  @Cron("*/5 * * * * *")
  async reconcileJobs() {
    if (this.reconcileRunning) return;
    this.reconcileRunning = true;
    try {
      await this.redis.withRenewingLock(
        "print:cron:reconcile",
        30,
        async () => {
          await this.prisma.printJob.updateMany({
            where: {
              status: "processing",
              updatedAt: { lt: new Date(Date.now() - 2 * 60_000) },
            },
            data: {
              status: "uncertain",
              errorMessage:
                "Worker 在提交期间中断，无法确认云打印是否已受理；请核对设备后再决定是否补打",
            },
          });
          const pending = await this.prisma.printJob.findMany({
            where: {
              OR: [
                { status: "queued" },
                { status: "failed", attempts: { lt: 3 } },
              ],
            },
            orderBy: { createdAt: "asc" },
            take: 30,
          });
          for (const job of pending) {
            const claimed = await this.prisma.printJob.updateMany({
              where: { id: job.id, status: job.status },
              data: { status: "processing" },
            });
            if (claimed.count !== 1) continue;
            await this.submit({ ...job, status: "processing" }).catch(
              (error: any) => {
                this.logger.warn(
                  `打印任务 ${job.id} 消费失败: ${error?.message || error}`,
                );
              },
            );
          }
        },
      );
    } finally {
      this.reconcileRunning = false;
    }
  }

  @Cron("0 * * * * *")
  async reconcileSubmittedJobs() {
    await this.redis.withRenewingLock("print:cron:submitted", 50, async () => {
      // Vendors drop unprinted jobs within days; stop polling after a day.
      await this.prisma.printJob.updateMany({
        where: {
          status: "submitted",
          sentAt: { lt: new Date(Date.now() - SUBMITTED_POLL_WINDOW_MS) },
        },
        data: {
          status: "expired",
          errorMessage: "提交后 24 小时仍未确认打印，已停止查询",
        },
      });
      const submitted = await this.prisma.printJob.findMany({
        where: {
          status: "submitted",
          provider: { in: ["feie", "xpyun", "gprinter"] },
          providerJobId: { not: null },
        },
        orderBy: { updatedAt: "asc" },
        take: 50,
      });
      for (const job of submitted) {
        const printed = await this.reconcile(job).catch(() => false);
        if (printed) continue;
        // Feie and Xpyun discard a job after the expiry we sent; Gprinter has no such field.
        const lapsed =
          job.provider !== "gprinter" &&
          job.expiresAt &&
          new Date(job.expiresAt).getTime() < Date.now() - 60_000;
        // Touching updatedAt rotates checked jobs to the back of the queue,
        // so a few unconfirmable jobs cannot starve newer ones.
        await this.prisma.printJob.updateMany({
          where: { id: job.id, status: "submitted" },
          data: lapsed
            ? { status: "expired", errorMessage: "超过出单有效期仍未打印，云打印已作废" }
            : { updatedAt: new Date() },
        });
      }
    });
  }

  private async createQueued(input: {
    order?: any;
    printer: any;
    event: string;
    dedupeKey: string;
    copyLabel?: string;
    content?: string;
    orderId?: string;
    bizType?: string;
    bizId?: string;
    expiresAt?: Date;
    copies?: number;
  }) {
    const existing = await this.prisma.printJob.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });
    if (existing) return null;
    const content =
      input.content || this.orderReceipt(input.order, input.copyLabel);
    try {
      return await this.prisma.printJob.create({
        data: {
          orderId: input.orderId ?? input.order?.id,
          printerId: input.printer.id,
          provider: this.providerOf(input.printer),
          event: input.event,
          ...(input.bizType ? { bizType: input.bizType } : {}),
          ...(input.bizId ? { bizId: input.bizId } : {}),
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
          ...(input.copies && input.copies > 1 ? { copies: input.copies } : {}),
          dedupeKey: input.dedupeKey,
          content,
        },
      });
    } catch (error: any) {
      if (error?.code === "P2002") return null;
      throw error;
    }
  }

  private async createAndSubmit(input: {
    order?: any;
    printer: any;
    event: string;
    dedupeKey: string;
    copyLabel?: string;
    content?: string;
    bizType?: string;
    copies?: number;
  }) {
    const existing = await this.prisma.printJob.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });
    if (existing) return existing;
    const content =
      input.content || this.orderReceipt(input.order, input.copyLabel);
    const job = await this.prisma.printJob.create({
      data: {
        orderId: input.order?.id,
        printerId: input.printer.id,
        provider: this.providerOf(input.printer),
        event: input.event,
        ...(input.bizType ? { bizType: input.bizType } : {}),
        ...(input.copies && input.copies > 1 ? { copies: input.copies } : {}),
        dedupeKey: input.dedupeKey,
        content,
      },
    });
    return this.submit(job);
  }

  private async submit(job: any) {
    const printer = await this.prisma.printerConfig.findUnique({
      where: { id: job.printerId },
    });
    if (
      !printer ||
      printer.status !== "active" ||
      !SUPPORTED_BRANDS.includes(printer.brand)
    ) {
      return this.fail(job, "打印机已停用或不是受支持的云打印设备");
    }
    if (job.expiresAt && new Date(job.expiresAt).getTime() <= Date.now())
      return this.prisma.printJob.update({
        where: { id: job.id },
        data: { status: "expired", errorMessage: "超过出单有效期仍未发出，已作废" },
      });
    const provider = this.providerOf(printer);
    try {
      if (provider === "yly") return await this.submitYly(job, printer);
      if (provider === "xpyun") return await this.submitXpyun(job, printer);
      if (provider === "gprinter")
        return await this.submitGprinter(job, printer);
      return await this.submitFeie(job, printer);
    } catch (error: any) {
      const status = error?.response ? "failed" : "uncertain";
      const message = String(
        error?.response?.data?.msg ||
          error?.response?.data?.error_description ||
          error?.message ||
          "云打印请求失败",
      ).slice(0, 500);
      this.logger.warn(`打印任务 ${job.id} ${status}: ${message}`);
      return this.prisma.printJob.update({
        where: { id: job.id },
        data: { status, attempts: { increment: 1 }, errorMessage: message },
      });
    }
  }

  private async submitFeie(job: any, printer: any) {
    const result = await this.feieRequest(printer, FEIE_PRINT_URL, "Open_printMsg", {
      sn: printer.sn,
      content: job.content,
      times: String(job.copies || 1),
      // Feie drops the job if the device only comes online after this; max 24h ahead.
      ...(job.expiresAt
        ? {
            expired: String(
              Math.floor(
                Math.min(
                  new Date(job.expiresAt).getTime(),
                  Date.now() + SUBMITTED_POLL_WINDOW_MS - 60_000,
                ) / 1000,
              ),
            ),
          }
        : {}),
    });
    if (Number(result.ret) !== 0)
      return this.fail(job, String(result.msg || "飞鹅云拒绝打印任务"));
    const providerJobId = String(result.data || "").trim();
    if (!providerJobId)
      return this.uncertain(
        job,
        "飞鹅云未返回打印订单号，请在设备端核对后再补打",
      );
    return this.submitted(job, providerJobId);
  }

  private async feieRequest(
    printer: any,
    url: string,
    apiname: string,
    params: Record<string, string>,
  ) {
    const config = await this.feieCredentials(printer);
    const stime = Math.floor(Date.now() / 1000);
    const sig = createHash("sha1")
      .update(`${config.user}${config.ukey}${stime}`)
      .digest("hex");
    const response = await axios.post(
      url,
      new URLSearchParams({
        user: config.user,
        stime: String(stime),
        sig,
        apiname,
        ...params,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      },
    );
    return response.data || {};
  }

  private async submitYly(job: any, printer: any) {
    const credentials = await this.ylyCredentials(printer);
    const accessToken = await this.ylyToken(printer.id, credentials);
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await axios.post(
      `${YLY_BASE_URL}/print/index`,
      new URLSearchParams({
        client_id: credentials.clientId,
        timestamp: String(timestamp),
        sign: this.ylySign(
          credentials.clientId,
          credentials.clientSecret,
          timestamp,
        ),
        id: randomUUID(),
        access_token: accessToken,
        machine_code: printer.sn,
        content: this.withoutFeieVoice(job.content),
        origin_id: String(job.id)
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 32),
        idempotence: "1",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      },
    );
    const result = response.data || {};
    if (Number(result.error) !== 0)
      return this.fail(
        job,
        String(result.error_description || "易联云拒绝打印任务"),
      );
    return this.submitted(job, String(result.body?.id || job.id));
  }

  private async submitXpyun(job: any, printer: any) {
    const credentials = this.xpyunCredentials(printer);
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await axios.post(
      `${XPYUN_BASE_URL}/print`,
      {
        user: credentials.xpyUser,
        timestamp: String(timestamp),
        sign: this.xpyunSign(
          credentials.xpyUser,
          credentials.xpyUserKey,
          timestamp,
        ),
        sn: printer.sn,
        content: this.withoutFeieVoice(job.content),
        copies: job.copies || 1,
        mode: 1,
        expiresIn: job.expiresAt
          ? Math.max(
              1,
              Math.min(
                86400,
                Math.floor((new Date(job.expiresAt).getTime() - Date.now()) / 1000),
              ),
            )
          : 3600,
        idempotent: String(job.id).slice(0, 50),
      },
      {
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        timeout: 10000,
      },
    );
    const result = response.data || {};
    if (Number(result.code) !== 0)
      return this.fail(job, String(result.msg || "芯烨云拒绝打印任务"));
    return this.submitted(job, String(result.data || job.id));
  }

  private async submitGprinter(job: any, printer: any) {
    const credentials = this.gprinterCredentials(printer);
    const reqTime = Date.now();
    const msgNo = String(job.id);
    const response = await axios.post(
      `${GPRINTER_BASE_URL}/sendMsg`,
      new URLSearchParams({
        reqTime: String(reqTime),
        securityCode: this.gprinterSign(
          credentials.gpMemberCode,
          printer.sn,
          msgNo,
          reqTime,
          credentials.gpApiKey,
        ),
        memberCode: credentials.gpMemberCode,
        deviceID: printer.sn,
        mode: "2",
        msgDetail: this.gprinterContent(job.content),
        msgNo,
        charset: "1",
        reprint: "0",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      },
    );
    const result = response.data || {};
    if (Number(result.code) !== 0)
      return this.fail(job, String(result.msg || "佳博云拒绝打印任务"));
    return this.submitted(job, msgNo);
  }

  /** Resolves true once the vendor confirms the job was printed. */
  private async reconcile(job: any): Promise<boolean> {
    const printer = await this.prisma.printerConfig.findUnique({
      where: { id: job.printerId },
    });
    if (!printer || !job.providerJobId) return false;
    if (this.providerOf(printer) === "xpyun")
      return this.reconcileXpyun(job, printer);
    if (this.providerOf(printer) === "gprinter")
      return this.reconcileGprinter(job, printer);
    if (this.providerOf(printer) !== "feie") return false;
    const result = await this.feieRequest(
      printer,
      FEIE_QUERY_URL,
      "Open_queryOrderState",
      { orderid: job.providerJobId },
    );
    if (Number(result.ret) !== 0 || result.data !== true) return false;
    await this.markPrinted(job);
    return true;
  }

  private markPrinted(job: any) {
    return this.prisma.printJob.update({
      where: { id: job.id },
      data: { status: "printed", printedAt: new Date(), errorMessage: null },
    });
  }

  private async reconcileXpyun(job: any, printer: any) {
    const credentials = this.xpyunCredentials(printer);
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await axios.post(
      `${XPYUN_BASE_URL}/queryOrderState`,
      {
        user: credentials.xpyUser,
        timestamp: String(timestamp),
        sign: this.xpyunSign(
          credentials.xpyUser,
          credentials.xpyUserKey,
          timestamp,
        ),
        orderId: job.providerJobId,
      },
      {
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        timeout: 10000,
      },
    );
    if (Number(response.data?.code) !== 0 || response.data?.data !== true)
      return false;
    await this.markPrinted(job);
    return true;
  }

  private async reconcileGprinter(job: any, printer: any) {
    const credentials = this.gprinterCredentials(printer);
    const reqTime = Date.now();
    const response = await axios.get(`${GPRINTER_BASE_URL}/queryState`, {
      params: {
        reqTime: String(reqTime),
        securityCode: createHash("md5")
          .update(
            `${credentials.gpMemberCode}${reqTime}${credentials.gpApiKey}${job.providerJobId}`,
          )
          .digest("hex"),
        memberCode: credentials.gpMemberCode,
        msgNo: job.providerJobId,
      },
      timeout: 10000,
    });
    if (Number(response.data?.code) === 1) {
      await this.markPrinted(job);
      return true;
    }
    if (Number(response.data?.code) === 2)
      await this.fail(job, String(response.data?.msg || "佳博云打印失败"));
    return false;
  }

  private async feieConfig(): Promise<FeieConfig> {
    const item = await this.prisma.config.findUnique({
      where: { key: "feie" },
    });
    const value = item?.value as any;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  /** Called by merchant/admin printer setup. Secrets never leave this service. */
  prepareConnection(brand: string, dto: any, current?: any) {
    const connectionMode =
      dto?.connectionMode === "platform_managed"
        ? "platform_managed"
        : current?.connectionMode || "merchant_owned";
    if (connectionMode === "platform_managed") {
      if (brand !== "feie")
        throw new BadRequestException("只有飞鹅云支持平台托管设备");
      return { connectionMode, credentialCiphertext: null };
    }
    const typed = this.cleanCredentials(brand, dto);
    const keepSaved = Boolean(current?.credentialCiphertext && current.brand === brand);
    if (!Object.values(typed).some(Boolean)) {
      if (keepSaved) return { connectionMode };
      throw new BadRequestException("请填写商家自己的云打印开发者凭证");
    }
    // Secret fields left blank on edit keep their saved values.
    const credentials: PrinterCredentials = {
      ...(keepSaved ? this.savedCredentials(current.credentialCiphertext) : {}),
      ...Object.fromEntries(Object.entries(typed).filter(([, value]) => value)),
    };
    this.assertCredentials(brand, credentials);
    return {
      connectionMode,
      credentialCiphertext: this.encryptCredentials(credentials),
    };
  }

  private providerOf(printer: any) {
    return ["yly", "xpyun", "gprinter"].includes(printer?.brand)
      ? printer.brand
      : "feie";
  }

  private async feieCredentials(
    printer: any,
  ): Promise<Required<Pick<PrinterCredentials, "user" | "ukey">>> {
    const platformConfig =
      printer.connectionMode === "platform_managed"
        ? await this.feieConfig()
        : null;
    const value =
      platformConfig || this.decryptCredentials(printer.credentialCiphertext);
    if (
      !value?.user ||
      !value?.ukey ||
      (platformConfig && !platformConfig.enabled)
    ) {
      throw new BadRequestException(
        printer.connectionMode === "platform_managed"
          ? "平台托管飞鹅云尚未配置或已停用"
          : "请填写商家自己的飞鹅云 USER 与 UKEY",
      );
    }
    return { user: String(value.user), ukey: String(value.ukey) };
  }

  private async ylyCredentials(
    printer: any,
  ): Promise<Required<Pick<PrinterCredentials, "clientId" | "clientSecret">>> {
    if (printer.connectionMode === "platform_managed") {
      throw new BadRequestException("易联云暂只支持商家自有开发者凭证");
    }
    const value = this.decryptCredentials(printer.credentialCiphertext);
    if (!value?.clientId || !value?.clientSecret) {
      throw new BadRequestException(
        "请填写商家自己的易联云 Client ID 与 Client Secret",
      );
    }
    return {
      clientId: String(value.clientId),
      clientSecret: String(value.clientSecret),
    };
  }

  private xpyunCredentials(
    printer: any,
  ): Required<Pick<PrinterCredentials, "xpyUser" | "xpyUserKey">> {
    const value = this.decryptCredentials(printer.credentialCiphertext);
    if (!value?.xpyUser || !value?.xpyUserKey)
      throw new BadRequestException(
        "请填写商家自己的芯烨云开发者 ID 与 UserKEY",
      );
    return {
      xpyUser: String(value.xpyUser),
      xpyUserKey: String(value.xpyUserKey),
    };
  }

  private gprinterCredentials(
    printer: any,
  ): Required<Pick<PrinterCredentials, "gpMemberCode" | "gpApiKey">> {
    const value = this.decryptCredentials(printer.credentialCiphertext);
    if (!value?.gpMemberCode || !value?.gpApiKey)
      throw new BadRequestException(
        "请填写商家自己的佳博云商户编码与 API 密钥",
      );
    return {
      gpMemberCode: String(value.gpMemberCode),
      gpApiKey: String(value.gpApiKey),
    };
  }

  private async ylyToken(
    printerId: string,
    credentials: Required<
      Pick<PrinterCredentials, "clientId" | "clientSecret">
    >,
  ) {
    const cacheKey = `print:yly:token:${printerId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;
    const token = await this.redis.withLock(
      `print:yly:token-lock:${printerId}`,
      20,
      async () => {
        const again = await this.redis.get(cacheKey);
        if (again) return again;
        const timestamp = Math.floor(Date.now() / 1000);
        const response = await axios.post(
          `${YLY_BASE_URL}/oauth/oauth`,
          new URLSearchParams({
            client_id: credentials.clientId,
            timestamp: String(timestamp),
            sign: this.ylySign(
              credentials.clientId,
              credentials.clientSecret,
              timestamp,
            ),
            id: randomUUID(),
            scope: "all",
            grant_type: "client_credentials",
          }),
          {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
          },
        );
        const body = response.data?.body || {};
        if (Number(response.data?.error) !== 0 || !body.access_token) {
          throw new BadRequestException(
            String(response.data?.error_description || "易联云开发者凭证无效"),
          );
        }
        // ponytail: cache the vendor token instead of adding a token table; move to durable storage only if Redis resets become operationally material.
        await this.redis.set(
          cacheKey,
          String(body.access_token),
          30 * 24 * 60 * 60,
        );
        return String(body.access_token);
      },
    );
    if (!token)
      throw new BadRequestException("易联云凭证正在初始化，请稍后重试");
    return token;
  }

  private ylySign(clientId: string, clientSecret: string, timestamp: number) {
    return createHash("md5")
      .update(`${clientId}${timestamp}${clientSecret}`)
      .digest("hex");
  }

  private xpyunSign(user: string, userKey: string, timestamp: number) {
    return createHash("sha1")
      .update(`${user}${userKey}${timestamp}`)
      .digest("hex");
  }

  private gprinterSign(
    memberCode: string,
    deviceId: string,
    msgNo: string,
    reqTime: number,
    apiKey: string,
  ) {
    return createHash("md5")
      .update(`${memberCode}${deviceId}${msgNo}${reqTime}${apiKey}`)
      .digest("hex");
  }

  private cleanCredentials(brand: string, dto: any): PrinterCredentials {
    const source = dto?.credentials || dto || {};
    const text = (value: any) => String(value || "").trim();
    if (brand === "yly")
      return {
        clientId: text(source.clientId ?? source.appId),
        clientSecret: text(source.clientSecret ?? source.appSecret),
        deviceKey: text(source.deviceKey ?? source.printerKey),
      };
    if (brand === "xpyun")
      return {
        xpyUser: text(source.xpyUser ?? source.developerId),
        xpyUserKey: text(source.xpyUserKey ?? source.developerSecret),
      };
    if (brand === "gprinter")
      return {
        gpMemberCode: text(source.gpMemberCode ?? source.shangpengClientId),
        gpApiKey: text(source.gpApiKey ?? source.shangpengClientSecret),
      };
    return {
      user: text(source.user),
      ukey: text(source.ukey),
      deviceKey: text(source.deviceKey ?? source.printerKey),
    };
  }

  private assertCredentials(brand: string, credentials: PrinterCredentials) {
    if (
      brand === "yly" &&
      (!credentials.clientId || !credentials.clientSecret)
    ) {
      throw new BadRequestException(
        "易联云需要填写 Client ID 与 Client Secret",
      );
    }
    if (
      brand === "xpyun" &&
      (!credentials.xpyUser || !credentials.xpyUserKey)
    ) {
      throw new BadRequestException("芯烨云需要填写开发者 ID 与 UserKEY");
    }
    if (
      brand === "gprinter" &&
      (!credentials.gpMemberCode || !credentials.gpApiKey)
    ) {
      throw new BadRequestException("佳博云需要填写商户编码与 API 密钥");
    }
    if (
      !["yly", "xpyun", "gprinter"].includes(brand) &&
      (!credentials.user || !credentials.ukey)
    ) {
      throw new BadRequestException("飞鹅云需要填写 USER 与 UKEY");
    }
  }

  private encryptCredentials(value: PrinterCredentials) {
    const key = this.credentialKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
  }

  private savedCredentials(ciphertext: string): PrinterCredentials {
    try {
      return this.decryptCredentials(ciphertext);
    } catch {
      return {};
    }
  }

  private decryptCredentials(ciphertext?: string | null): PrinterCredentials {
    if (!ciphertext) throw new BadRequestException("商家云打印凭证未配置");
    const [version, iv, tag, encrypted] = ciphertext.split(":");
    if (version !== "v1" || !iv || !tag || !encrypted)
      throw new BadRequestException("商家云打印凭证格式错误，请重新配置");
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.credentialKey(),
        Buffer.from(iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return (
        JSON.parse(
          Buffer.concat([
            decipher.update(Buffer.from(encrypted, "base64")),
            decipher.final(),
          ]).toString("utf8"),
        ) || {}
      );
    } catch {
      throw new BadRequestException("商家云打印凭证无法读取，请重新配置");
    }
  }

  private credentialKey() {
    const source = String(process.env.PRINT_CREDENTIAL_KEY || "");
    if (source.length < 32)
      throw new BadRequestException(
        "服务端尚未设置 PRINT_CREDENTIAL_KEY，不能保存商家云打印凭证",
      );
    return createHash("sha256").update(source).digest();
  }

  private fail(job: any, message: string) {
    return this.prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        attempts: { increment: 1 },
        errorMessage: message.slice(0, 500),
      },
    });
  }

  private uncertain(job: any, message: string) {
    return this.prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: "uncertain",
        attempts: { increment: 1 },
        errorMessage: message.slice(0, 500),
        sentAt: new Date(),
      },
    });
  }

  private submitted(job: any, providerJobId: string) {
    return this.prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: "submitted",
        attempts: { increment: 1 },
        providerJobId,
        errorMessage: null,
        sentAt: new Date(),
      },
    });
  }

  private async getOrder(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        merchant: { select: { id: true, name: true, businessType: true } },
        items: {
          select: {
            productName: true,
            skuSpecs: true,
            modifierSelections: true,
            price: true,
            quantity: true,
            totalPrice: true,
          },
        },
      },
    });
  }

  private orderReceipt(order: any, copyLabel = "厨房出餐单") {
    const line = "--------------------------------<BR>";
    const items = (order?.items || [])
      .slice(0, 30)
      .map((item: any) => {
        const spec = [
          this.compactJson(item.skuSpecs),
          this.compactJson(item.modifierSelections),
        ]
          .filter(Boolean)
          .join(" / ");
        return `${this.safe(item.productName)}${spec ? `（${this.safe(spec)}）` : ""}<BR>${item.quantity} × ¥${this.money(item.price)}    ¥${this.money(item.totalPrice)}<BR>`;
      })
      .join("");
    const scheduled = order.fulfillmentStartTime
      ? `履约：${this.time(order.fulfillmentStartTime)}<BR>`
      : "";
    const discount =
      Number(order.discountAmount || 0) + Number(order.subsidyAmount || 0);
    return this.limit(
      `${this.center(`<B>${this.safe(order.merchant?.name || "商家")}</B>`)}<BR>${this.center(copyLabel)}<BR>${line}` +
        `订单号：${this.safe(order.orderNo)}<BR>下单：${this.time(order.createdAt)}<BR>${scheduled}${line}${items}${line}` +
        `商品：¥${this.money(order.totalAmount)}<BR>打包：¥${this.money(order.packagingAmount)}<BR>配送：¥${this.money(order.freightAmount)}<BR>` +
        `${discount ? `优惠：-¥${this.money(discount)}<BR>` : ""}<B>实付：¥${this.money(order.payAmount)}</B><BR>${line}` +
        `收餐人：${this.safe(order.receiverName)} ${this.safe(order.receiverPhone)}<BR>地址：${this.safe(order.receiverAddress)}<BR>` +
        `${order.remark ? `<B>备注：${this.safe(order.remark)}</B><BR>` : ""}${line}${this.center("已支付 · 请及时确认接单")}<BR>`,
    );
  }

  private testReceipt(content?: string) {
    const body = String(content || "飞鹅云打印连接正常")
      .trim()
      .slice(0, 1000);
    return this.limit(
      `${this.center("<B>打印测试</B>")}<BR>${this.safe(body)}<BR>${this.time(new Date())}<BR>`,
    );
  }

  private safe(value: any) {
    return String(value ?? "")
      .replace(/[<>]/g, (char) => (char === "<" ? "＜" : "＞"))
      .replace(/[\r\n]+/g, " ")
      .trim();
  }
  private center(value: string) {
    return `<C>${value}</C>`;
  }
  private money(value: any) {
    return Number(value || 0).toFixed(2);
  }
  private withoutFeieVoice(content: string) {
    return content.replace(/<AUDIO-[A-Z]+>/g, "");
  }
  private gprinterContent(content: string) {
    return content.replace(/<BR>/gi, "\n").replace(/<[^>]+>/g, "");
  }
  private time(value: any) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ""
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  private compactJson(value: any): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value))
      return value
        .map((item) => this.compactJson(item))
        .filter(Boolean)
        .join("、");
    if (typeof value === "object")
      return Object.values(value)
        .map((item) => this.compactJson(item))
        .filter(Boolean)
        .join("、");
    return String(value);
  }
  private limit(content: string) {
    if (Buffer.byteLength(content, "utf8") <= FEIE_MAX_CONTENT_BYTES)
      return content;
    const suffix = "<BR>内容过长已截断";
    const budget = FEIE_MAX_CONTENT_BYTES - Buffer.byteLength(suffix, "utf8");
    let output = "";
    let bytes = 0;
    for (const char of content) {
      const size = Buffer.byteLength(char, "utf8");
      if (bytes + size > budget) break;
      output += char;
      bytes += size;
    }
    return `${output}${suffix}`;
  }
}
