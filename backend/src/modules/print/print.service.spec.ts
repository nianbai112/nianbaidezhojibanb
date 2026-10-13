jest.mock("axios", () => ({ post: jest.fn(), get: jest.fn() }));

import axios from "axios";
import { PrintService } from "./print.service";

describe("PrintService", () => {
  const originalCredentialKey = process.env.PRINT_CREDENTIAL_KEY;
  const createService = () => {
    const prisma: any = {
      config: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            value: { enabled: true, user: "feie-user", ukey: "feie-ukey" },
          }),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: "order-1",
          orderNo: "SO-1001",
          merchantId: "merchant-1",
          status: "PAID",
          merchantAcceptTime: null,
          refundStatus: "none",
          fulfillmentStartTime: null,
          createdAt: new Date("2026-07-18T09:30:00Z"),
          totalAmount: 18,
          packagingAmount: 1,
          freightAmount: 2,
          discountAmount: 0,
          subsidyAmount: 0,
          payAmount: 21,
          receiverName: "张三",
          receiverPhone: "13800000000",
          receiverAddress: "1号楼 101",
          remark: "不要辣",
          merchant: {
            id: "merchant-1",
            name: "食堂一号",
            businessType: "takeaway",
          },
          items: [
            {
              productName: "鸡腿饭",
              skuSpecs: ["大份"],
              modifierSelections: [],
              price: 18,
              quantity: 1,
              totalPrice: 18,
            },
          ],
        }),
      },
      printerConfig: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: "printer-1",
              sn: "SN-1",
              brand: "feie",
              connectionMode: "platform_managed",
              status: "active",
              autoPrint: true,
            },
          ]),
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: "printer-1",
            sn: "SN-1",
            brand: "feie",
            connectionMode: "platform_managed",
            status: "active",
          }),
      },
      printJob: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({
            id: "job-1",
            status: "queued",
            ...data,
            attempts: 0,
          })),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: "job-1", ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    return {
      prisma,
      service: new PrintService(prisma, {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        withLock: jest.fn((_key: string, _ttl: number, task: any) => task()),
        withRenewingLock: jest.fn((_key: string, _ttl: number, task: any) =>
          task(),
        ),
      } as any),
    };
  };

  beforeEach(() => jest.clearAllMocks());
  afterAll(() => {
    if (originalCredentialKey === undefined)
      delete process.env.PRINT_CREDENTIAL_KEY;
    else process.env.PRINT_CREDENTIAL_KEY = originalCredentialKey;
  });

  it("persists a paid actionable order for the Worker without calling Feie in the API path", async () => {
    const { prisma, service } = createService();

    await expect(service.enqueueAutomaticOrder("order-1")).resolves.toEqual({
      queued: 1,
    });

    expect(axios.post).not.toHaveBeenCalled();
    expect(prisma.printJob.create.mock.calls[0][0].data.content).toContain(
      "SO-1001",
    );
    expect(prisma.printJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: "auto" }),
      }),
    );
  });

  it("does not print a scheduled order before its fulfillment start time", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValueOnce({
      ...(await prisma.order.findUnique()),
      fulfillmentStartTime: new Date(Date.now() + 60_000),
    });

    await expect(service.enqueueAutomaticOrder("order-1")).resolves.toEqual({
      queued: 0,
    });
    expect(prisma.printerConfig.findMany).not.toHaveBeenCalled();
  });

  it("has the Worker claim a queued job and marks a provider timeout uncertain", async () => {
    const { prisma, service } = createService();
    (axios.post as jest.Mock).mockRejectedValue(new Error("timeout"));
    prisma.printJob.findMany.mockResolvedValueOnce([
      {
        id: "job-1",
        printerId: "printer-1",
        provider: "feie",
        status: "queued",
        attempts: 0,
        content: "receipt",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await service.reconcileJobs();

    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "processing" } }),
    );
    expect(prisma.printJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "uncertain" }),
      }),
    );
  });

  it("encrypts merchant credentials and submits an EasyPrint task with the merchant app", async () => {
    process.env.PRINT_CREDENTIAL_KEY =
      "a-test-only-print-credential-key-that-is-long-enough";
    const { prisma, service } = createService();
    const connection = service.prepareConnection("yly", {
      clientId: "merchant-client",
      clientSecret: "merchant-secret",
    });
    expect(connection.connectionMode).toBe("merchant_owned");
    expect(connection.credentialCiphertext).not.toContain("merchant-secret");
    prisma.printerConfig.findUnique.mockResolvedValue({
      id: "printer-yly",
      sn: "YLY-1",
      brand: "yly",
      status: "active",
      ...connection,
    });
    (axios.post as jest.Mock)
      .mockResolvedValueOnce({
        data: { error: 0, body: { access_token: "token-1" } },
      })
      .mockResolvedValueOnce({ data: { error: 0, body: { id: "yly-job-1" } } });

    await expect(service.testPrinter("printer-yly")).resolves.toEqual(
      expect.objectContaining({
        status: "submitted",
        providerJobId: "yly-job-1",
      }),
    );

    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      "https://open-api.10ss.net/v2/oauth/oauth",
      expect.any(URLSearchParams),
      expect.any(Object),
    );
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      "https://open-api.10ss.net/v2/print/index",
      expect.any(URLSearchParams),
      expect.any(Object),
    );
    expect(String((axios.post as jest.Mock).mock.calls[1][1])).toContain(
      "machine_code=YLY-1",
    );
  });

  it.each([
    [
      "xpyun",
      { xpyUser: "xpy-user", xpyUserKey: "xpy-key" },
      "https://open.xpyun.net/api/openapi/xprinter/print",
      { code: 0, data: "xpy-job-1" },
    ],
    [
      "gprinter",
      { gpMemberCode: "gp-member", gpApiKey: "gp-key" },
      "https://api.poscom.cn/apisc/sendMsg",
      { code: 0 },
    ],
  ])(
    "encrypts and submits a merchant-owned %s task",
    async (brand, credentials, expectedUrl, response) => {
      process.env.PRINT_CREDENTIAL_KEY =
        "a-test-only-print-credential-key-that-is-long-enough";
      const { prisma, service } = createService();
      const connection = service.prepareConnection(brand, credentials);
      expect(connection.credentialCiphertext).not.toContain(
        Object.values(credentials)[1] as string,
      );
      prisma.printerConfig.findUnique.mockResolvedValue({
        id: `printer-${brand}`,
        sn: `${brand}-1`,
        brand,
        status: "active",
        ...connection,
      });
      (axios.post as jest.Mock).mockResolvedValue({ data: response });

      await expect(service.testPrinter(`printer-${brand}`)).resolves.toEqual(
        expect.objectContaining({ status: "submitted" }),
      );

      expect(axios.post).toHaveBeenCalledWith(
        expectedUrl,
        expect.anything(),
        expect.any(Object),
      );
    },
  );

  describe("代买出单所需的通用能力", () => {
    const KEY = "a-test-only-print-credential-key-that-is-long-enough";
    const ownFeie = (service: PrintService, extra: any = {}) => ({
      id: "printer-shop",
      sn: "916500001",
      name: "奶茶店出单机",
      brand: "feie",
      status: "active",
      ...service.prepareConnection("feie", {
        user: "shop-user",
        ukey: "shop-ukey",
        deviceKey: "abcd1234",
        ...extra,
      }),
    });

    it("queues ready-made content with its business key and expiry", async () => {
      const { prisma, service } = createService();
      const expiresAt = new Date(Date.now() + 60_000);
      await service.enqueue({
        printer: { id: "printer-shop", brand: "feie" },
        event: "purchase",
        dedupeKey: "purchase:stop-1:new",
        content: "x".repeat(6000),
        orderId: "order-1",
        bizType: "purchase_stop",
        bizId: "stop-1",
        expiresAt,
      });
      const data = prisma.printJob.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        orderId: "order-1",
        bizType: "purchase_stop",
        bizId: "stop-1",
        expiresAt,
        event: "purchase",
      });
      expect(Buffer.byteLength(data.content, "utf8")).toBeLessThanOrEqual(5000);
    });

    it("drops a job past its expiry without calling the vendor", async () => {
      const { prisma, service } = createService();
      prisma.printJob.findMany.mockResolvedValueOnce([
        {
          id: "job-old",
          printerId: "printer-1",
          provider: "feie",
          status: "queued",
          attempts: 0,
          content: "receipt",
          expiresAt: new Date(Date.now() - 1000),
        },
      ]);
      await service.reconcileJobs();
      expect(axios.post).not.toHaveBeenCalled();
      expect(prisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "job-old" },
          data: expect.objectContaining({ status: "expired" }),
        }),
      );
    });

    it("sends Feie the expiry so an offline printer does not print the ticket later", async () => {
      process.env.PRINT_CREDENTIAL_KEY = KEY;
      const { prisma, service } = createService();
      prisma.printerConfig.findUnique.mockResolvedValue(ownFeie(service));
      (axios.post as jest.Mock).mockResolvedValue({
        data: { ret: 0, data: "916500001_20261006_1" },
      });
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      prisma.printJob.findMany.mockResolvedValueOnce([
        {
          id: "job-1",
          printerId: "printer-shop",
          provider: "feie",
          status: "queued",
          attempts: 0,
          content: "ticket<AUDIO-COMMON>",
          expiresAt,
        },
      ]);
      await service.reconcileJobs();
      const [url, body] = (axios.post as jest.Mock).mock.calls[0];
      expect(url).toBe("https://api.feieyun.cn/Api/Open/printMsg");
      expect(body.get("user")).toBe("shop-user");
      expect(body.get("expired")).toBe(
        String(Math.floor(expiresAt.getTime() / 1000)),
      );
      expect(body.get("content")).toContain("<AUDIO-COMMON>");
    });

    it("strips Feie voice tags before sending to another brand", async () => {
      process.env.PRINT_CREDENTIAL_KEY = KEY;
      const { prisma, service } = createService();
      prisma.printerConfig.findUnique.mockResolvedValue({
        id: "printer-xpy",
        sn: "XPY-1",
        brand: "xpyun",
        status: "active",
        ...service.prepareConnection("xpyun", { xpyUser: "u", xpyUserKey: "k" }),
      });
      (axios.post as jest.Mock).mockResolvedValue({ data: { code: 0, data: "x-1" } });
      prisma.printJob.findMany.mockResolvedValueOnce([
        {
          id: "job-x",
          printerId: "printer-xpy",
          provider: "xpyun",
          status: "queued",
          attempts: 0,
          content: "ticket<BR><AUDIO-CANCEL>",
          expiresAt: new Date(Date.now() + 600_000),
        },
      ]);
      await service.reconcileJobs();
      const body = (axios.post as jest.Mock).mock.calls[0][1];
      expect(body.content).toBe("ticket<BR>");
      expect(body.expiresIn).toBeGreaterThan(590);
      expect(body.expiresIn).toBeLessThanOrEqual(600);
    });

    it("stops polling stale jobs and rotates unconfirmed ones so newer jobs are still checked", async () => {
      process.env.PRINT_CREDENTIAL_KEY = KEY;
      const { prisma, service } = createService();
      prisma.printerConfig.findUnique.mockResolvedValue(ownFeie(service));
      prisma.printJob.findMany.mockResolvedValueOnce([
        { id: "waiting", printerId: "printer-shop", provider: "feie", providerJobId: "a", status: "submitted" },
        {
          id: "lapsed",
          printerId: "printer-shop",
          provider: "feie",
          providerJobId: "b",
          status: "submitted",
          expiresAt: new Date(Date.now() - 5 * 60_000),
        },
        { id: "done", printerId: "printer-shop", provider: "feie", providerJobId: "c", status: "submitted" },
      ]);
      (axios.post as jest.Mock)
        .mockResolvedValueOnce({ data: { ret: 0, data: false } })
        .mockResolvedValueOnce({ data: { ret: 0, data: false } })
        .mockResolvedValueOnce({ data: { ret: 0, data: true } });

      await service.reconcileSubmittedJobs();

      expect(prisma.printJob.updateMany.mock.calls[0][0]).toMatchObject({
        where: { status: "submitted", sentAt: { lt: expect.any(Date) } },
        data: { status: "expired" },
      });
      expect(prisma.printJob.findMany.mock.calls[0][0].orderBy).toEqual({
        updatedAt: "asc",
      });
      expect(prisma.printJob.updateMany).toHaveBeenCalledWith({
        where: { id: "waiting", status: "submitted" },
        data: { updatedAt: expect.any(Date) },
      });
      expect(prisma.printJob.updateMany).toHaveBeenCalledWith({
        where: { id: "lapsed", status: "submitted" },
        data: expect.objectContaining({ status: "expired" }),
      });
      expect(prisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "done" },
          data: expect.objectContaining({ status: "printed" }),
        }),
      );
      expect(prisma.printJob.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "done", status: "submitted" } }),
      );
    });

    it("binds the device to the shop's own Feie account and accepts an already-bound device", async () => {
      process.env.PRINT_CREDENTIAL_KEY = KEY;
      const { prisma, service } = createService();
      prisma.printerConfig.findUnique.mockResolvedValue(ownFeie(service));
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ret: 0, data: { ok: [], no: ["916500001#abcd1234#奶茶店出单机 （错误：已被添加过）"] } },
      });
      await expect(service.bindFeieDevice("printer-shop")).resolves.toEqual({
        bound: true,
        message: "",
      });
      const [url, body] = (axios.post as jest.Mock).mock.calls[0];
      expect(url).toBe("https://api.feieyun.cn/Api/Open/printerAddlist");
      expect(body.get("apiname")).toBe("Open_printerAddlist");
      expect(body.get("printerContent")).toBe("916500001#abcd1234#奶茶店出单机");
    });

    it("reports a binding failure without echoing the device KEY", async () => {
      process.env.PRINT_CREDENTIAL_KEY = KEY;
      const { prisma, service } = createService();
      prisma.printerConfig.findUnique.mockResolvedValue(ownFeie(service));
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ret: 0, data: { ok: [], no: ["916500001#abcd1234 （错误：打印机编号和KEY不正确）"] } },
      });
      const result = await service.bindFeieDevice("printer-shop");
      expect(result).toEqual({ bound: false, message: "打印机编号和KEY不正确" });
      expect(JSON.stringify(result)).not.toContain("abcd1234");
    });

    it("reads Feie online status", async () => {
      process.env.PRINT_CREDENTIAL_KEY = KEY;
      const { prisma, service } = createService();
      prisma.printerConfig.findUnique.mockResolvedValue(ownFeie(service));
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ret: 0, data: "在线，工作状态不正常。" },
      });
      await expect(service.printerStatus("printer-shop")).resolves.toEqual({
        supported: true,
        online: true,
        normal: false,
        text: "在线，工作状态不正常。",
      });
    });

    it("prints a template sample as-is, with the template's copies", async () => {
      process.env.PRINT_CREDENTIAL_KEY = KEY;
      const { prisma, service } = createService();
      prisma.printerConfig.findUnique.mockResolvedValue(ownFeie(service));
      (axios.post as jest.Mock).mockResolvedValue({ data: { ret: 0, data: "id-1" } });
      await service.printSample("printer-shop", "<CB>测试小票</CB><BR>", 2);
      expect(prisma.printJob.create.mock.calls[0][0].data).toMatchObject({
        event: "test",
        bizType: "test",
        copies: 2,
        content: "<CB>测试小票</CB><BR>",
      });
      const body = (axios.post as jest.Mock).mock.calls[0][1];
      expect(body.get("content")).toBe("<CB>测试小票</CB><BR>");
      expect(body.get("times")).toBe("2");
    });

    it("keeps saved secrets when an edit only changes some credential fields", async () => {
      process.env.PRINT_CREDENTIAL_KEY = KEY;
      const { prisma, service } = createService();
      const current = ownFeie(service);
      const next = service.prepareConnection("feie", { deviceKey: "newkey99" }, current);
      prisma.printerConfig.findUnique.mockResolvedValue({ ...current, ...next });
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { ret: 0, data: { ok: ["916500001#newkey99"], no: [] } },
      });
      await service.bindFeieDevice("printer-shop");
      const body = (axios.post as jest.Mock).mock.calls[0][1];
      expect(body.get("user")).toBe("shop-user");
      expect(body.get("printerContent")).toContain("916500001#newkey99");
    });
  });
});
