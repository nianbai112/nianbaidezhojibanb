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
});
