import { PurchaseService } from "./purchase.service";
import {
  DEFAULT_TICKET_TEMPLATE,
  normalizeTicketTemplate,
  purchaseCancelTicket,
  purchaseRiderLabel,
  TICKET_PRESETS,
  renderPurchaseTicket,
  renderTicketParts,
  sampleTicketData,
  storedTicketTemplate,
} from "./purchase.printing";

const purchaseTicket = (data: any) => renderPurchaseTicket(DEFAULT_TICKET_TEMPLATE, data);

describe("代买出单小票", () => {
  const ticket = (extra: any = {}) =>
    purchaseTicket({
      shopName: "茶百道<南门>",
      orderNo: "DM1791214199980ddf1cbc8",
      acceptTime: new Date("2026-10-06T04:05:00Z"),
      rider: "张** 尾号1234",
      remark: "少冰，放宿舍楼下",
      stopIndex: 0,
      stopCount: 1,
      items: [
        { name: "杨枝甘露", spec: "大杯 / 少冰 / 加椰果", quantity: 2, unitCents: 1650 },
        { name: "缺货商品", spec: "", quantity: 0, unitCents: 900 },
      ],
      ...extra,
    });

  test("列出这家店要做的商品、取餐码和骑手，按北京时间显示", () => {
    const content = ticket();
    expect(content).toContain("<CB>代买 #CBC8</CB>");
    expect(content).toContain("取餐码：CBC8");
    expect(content).toContain("杨枝甘露");
    expect(content).toContain("大杯 / 少冰 / 加椰果");
    expect(content).toContain("<B>x2</B>    ¥33.00");
    expect(content).toContain("共2件  参考货款 ¥33.00");
    expect(content).toContain("接单：10-06 12:05");
    expect(content).toContain("骑手：张** 尾号1234");
    expect(content).not.toContain("缺货商品");
    expect(content).toMatch(/<AUDIO-COMMON>$/);
  });

  test("店名等文本里的尖括号不会变成打印指令", () => {
    expect(ticket()).toContain("茶百道＜南门＞");
  });

  test("多店合单时标明是第几家店", () => {
    expect(ticket({ stopIndex: 1, stopCount: 2 })).toContain("本单共2家店，这是第2家");
    expect(ticket()).not.toContain("本单共");
  });

  test("取消单提醒店家停止制作", () => {
    const content = purchaseCancelTicket({
      shopName: "茶百道",
      orderNo: "DM1791214199980ddf1cbc8",
      cancelTime: new Date("2026-10-06T04:10:00Z"),
    });
    expect(content).toContain("代买单已取消");
    expect(content).toContain("请停止制作该单商品");
    expect(content).toMatch(/<AUDIO-CANCEL>$/);
  });

  test("骑手只显示姓氏和手机尾号，匿名骑手只显示尾号", () => {
    expect(purchaseRiderLabel({ realName: "张三丰", phone: "13800001234" })).toBe("张** 尾号1234");
    expect(purchaseRiderLabel({ realName: "张三丰", phone: "13800001234", anonymous: true })).toBe("尾号1234");
    expect(purchaseRiderLabel(null)).toBe("");
  });
});

describe("代买出单任务", () => {
  const printer = {
    id: "printer-1",
    purchaseShopId: "shop-1",
    brand: "feie",
    status: "active",
    autoPrint: true,
  };
  const stop = (id: string, shopId: string, status = "pending") => ({
    id,
    shopId,
    status,
    snapshot: { name: shopId === "shop-1" ? "茶百道" : "蜜雪冰城" },
    items: [
      {
        quantity: 1,
        approvedUnitCents: 1200,
        snapshot: { productName: "柠檬茶", specText: "大杯 / 去冰" },
      },
    ],
  });
  const purchase = {
    id: "order-1",
    regionId: "region-1",
    order: {
      id: "order-1",
      orderNo: "DM1791214199980ddf1cbc8",
      riderId: "rider-1",
      acceptTime: new Date(),
      remark: "电话 13900001111 放门口",
      deliverPhone: "13900001111",
      deliverAddress: "3号楼 502",
      receiptCode: "778899",
    },
    stops: [stop("stop-1", "shop-1"), stop("stop-2", "shop-2")],
  };
  const setup = (db: any = {}) => {
    const prisma: any = {
      printerConfig: { findMany: jest.fn().mockResolvedValue([printer]) },
      errandPurchase: { findMany: jest.fn().mockResolvedValue([purchase]) },
      printJob: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      regionRider: {
        findMany: jest.fn().mockResolvedValue([
          { userId: "rider-1", realName: "李四", phone: "13700005678", anonymous: false },
        ]),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      config: { findMany: jest.fn().mockResolvedValue([]) },
      errandOrder: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseStop: { findMany: jest.fn().mockResolvedValue([]) },
      ...db,
    };
    const print = { enqueue: jest.fn().mockResolvedValue({ id: "job" }) };
    const service: any = Object.create(PurchaseService.prototype);
    service.prisma = prisma;
    service.printer = print;
    return { service, prisma, print };
  };

  test("接单后只给开启出单的店铺打印该店商品，不打印买家信息", async () => {
    const { service, prisma, print } = setup();
    await service.queuePrintTickets();

    expect(prisma.errandPurchase.findMany.mock.calls[0][0].where).toMatchObject({
      order: { status: "accepted", acceptTime: { gte: expect.any(Date) } },
      stops: { some: { shopId: { in: ["shop-1"] }, status: "pending" } },
    });
    expect(print.enqueue).toHaveBeenCalledTimes(1);
    const job = print.enqueue.mock.calls[0][0];
    expect(job).toMatchObject({
      printer,
      event: "purchase",
      dedupeKey: "purchase:stop-1:new",
      orderId: "order-1",
      bizType: "purchase_stop",
      bizId: "stop-1",
    });
    expect(job.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(job.content).toContain("茶百道");
    expect(job.content).toContain("柠檬茶");
    expect(job.content).toContain("李** 尾号5678");
    expect(job.content).toContain("本单共2家店，这是第1家");
    expect(job.content).not.toContain("3号楼");
    expect(job.content).not.toContain("778899");
  });

  test("已经出过单的店铺不会重复打印", async () => {
    const { service, print } = setup({
      printJob: {
        findMany: jest.fn().mockResolvedValue([{ bizId: "stop-1" }]),
        updateMany: jest.fn(),
      },
    });
    await service.queuePrintTickets();
    expect(print.enqueue).not.toHaveBeenCalled();
  });

  test("关闭出单的打印机不再出新单", async () => {
    const { service, prisma, print } = setup({
      printerConfig: {
        findMany: jest.fn().mockResolvedValue([{ ...printer, autoPrint: false }]),
      },
    });
    await service.queuePrintTickets();
    expect(prisma.errandPurchase.findMany).not.toHaveBeenCalled();
    expect(print.enqueue).not.toHaveBeenCalled();
  });

  test("已出单的订单被取消后补打取消单", async () => {
    const ticketJob = {
      id: "job-1",
      bizId: "stop-1",
      orderId: "order-1",
      printerId: "printer-1",
      status: "printed",
      event: "purchase",
    };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([ticketJob])
      .mockResolvedValueOnce([]);
    const { service, print, prisma } = setup({
      errandPurchase: { findMany: jest.fn().mockResolvedValue([]) },
      printJob: { findMany, updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      errandOrder: {
        findMany: jest.fn().mockResolvedValue([
          { id: "order-1", orderNo: "DM1791214199980ddf1cbc8", cancelTime: new Date() },
        ]),
      },
      purchaseStop: {
        findMany: jest.fn().mockResolvedValue([{ id: "stop-1", snapshot: { name: "茶百道" } }]),
      },
    });
    await service.queuePrintTickets();
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: { in: ["queued", "failed"] } },
      data: expect.objectContaining({ status: "cancelled" }),
    });
    expect(print.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "purchase_cancel",
        dedupeKey: "purchase:stop-1:cancel",
        bizId: "stop-1",
        content: expect.stringContaining("请停止制作该单商品"),
      }),
    );
  });

  test("还没发出的小票在取消时直接撤回，不打取消单", async () => {
    const { service, print } = setup({
      errandPurchase: { findMany: jest.fn().mockResolvedValue([]) },
      printJob: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: "job-1", bizId: "stop-1", orderId: "order-1", printerId: "printer-1", status: "queued" },
          ])
          .mockResolvedValueOnce([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      errandOrder: {
        findMany: jest.fn().mockResolvedValue([
          { id: "order-1", orderNo: "DM1", cancelTime: new Date() },
        ]),
      },
    });
    await service.queuePrintTickets();
    expect(print.enqueue).not.toHaveBeenCalled();
  });
});

describe("代买店铺打印机设置", () => {
  const setup = (current: any = null) => {
    const prisma: any = {
      region: { findUnique: jest.fn().mockResolvedValue({ id: "region-1" }) },
      purchaseShop: {
        findFirst: jest.fn().mockResolvedValue({ id: "shop-1", name: "茶百道", regionId: "region-1" }),
      },
      printerConfig: {
        findUnique: jest.fn().mockResolvedValue(current),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: "printer-1", ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ ...current, ...data })),
      },
    };
    const print = {
      prepareConnection: jest.fn().mockReturnValue({
        connectionMode: "merchant_owned",
        credentialCiphertext: "v1:secret",
      }),
      bindFeieDevice: jest.fn().mockResolvedValue({ bound: true, message: "" }),
    };
    const service: any = Object.create(PurchaseService.prototype);
    service.prisma = prisma;
    service.printer = print;
    service.scope = { assertRegionAccess: jest.fn().mockResolvedValue(undefined) };
    return { service, prisma, print };
  };

  test("用店家自己的凭证新建打印机，并把飞鹅设备添加到店家账号", async () => {
    const { service, prisma, print } = setup();
    const result = await service.savePrinter("admin-1", "region-1", "shop-1", {
      brand: "feie",
      sn: "916500001",
      enabled: true,
      user: "shop-user",
      ukey: "shop-ukey",
      deviceKey: "abcd1234",
      connectionMode: "platform_managed",
    });
    expect(service.scope.assertRegionAccess).toHaveBeenCalledWith("admin-1", "region-1");
    expect(print.prepareConnection).toHaveBeenCalledWith(
      "feie",
      expect.objectContaining({ connectionMode: "merchant_owned", ukey: "shop-ukey" }),
      null,
    );
    expect(prisma.printerConfig.create.mock.calls[0][0].data).toMatchObject({
      purchaseShopId: "shop-1",
      name: "茶百道出单机",
      brand: "feie",
      sn: "916500001",
      autoPrint: true,
      status: "active",
      connectionMode: "merchant_owned",
    });
    expect(print.bindFeieDevice).toHaveBeenCalledWith("printer-1");
    expect(result.printer).toEqual(
      expect.objectContaining({ enabled: true, credentialConfigured: true }),
    );
    expect(JSON.stringify(result)).not.toContain("v1:secret");
  });

  test("其他品牌不调用飞鹅添加设备；关闭开关只停止出单", async () => {
    const current = { id: "printer-1", purchaseShopId: "shop-1", brand: "yly", credentialCiphertext: "v1:old" };
    const { service, prisma, print } = setup(current);
    const result = await service.savePrinter("admin-1", "region-1", "shop-1", {
      brand: "yly",
      sn: "4004000001",
      enabled: false,
    });
    expect(prisma.printerConfig.update.mock.calls[0][0]).toMatchObject({
      where: { id: "printer-1" },
      data: { autoPrint: false, status: "active", brand: "yly" },
    });
    expect(print.bindFeieDevice).not.toHaveBeenCalled();
    expect(result.bind).toBeNull();
    expect(result.printer.enabled).toBe(false);
  });

  test("拒绝不支持的品牌和其他区域的店铺", async () => {
    const { service, prisma } = setup();
    await expect(
      service.savePrinter("admin-1", "region-1", "shop-1", { brand: "moth", sn: "1", enabled: true }),
    ).rejects.toThrow("请选择打印机品牌");
    prisma.purchaseShop.findFirst.mockResolvedValue(null);
    await expect(
      service.savePrinter("admin-1", "region-1", "shop-x", { brand: "feie", sn: "1", enabled: true }),
    ).rejects.toThrow("店铺不存在");
  });
});

describe("小票模板", () => {
  const data = { ...sampleTicketData("茶百道"), acceptTime: new Date("2026-10-06T04:05:00Z") };
  const template = (blocks: any[], extra: any = {}) =>
    normalizeTicketTemplate({ paperWidth: 58, copies: 1, voice: false, cut: false, blocks, ...extra });

  test("按模块顺序、开关和样式渲染，自定义文字支持变量", () => {
    const content = renderPurchaseTicket(
      template([
        { type: "text", text: "{店名}·第{第几家}/{店铺数}家", size: "tall", align: "center", bold: true },
        { type: "rider", enabled: false, label: "骑手：" },
        { type: "pickupCode", label: "取 ", size: "wide", align: "right" },
        { type: "items", showSpec: false, showPrice: false, bigQuantity: false },
        { type: "text", text: "第一行\n\n第三行 {不存在}" },
      ]),
      data,
    );
    expect(content).toBe(
      "<C><L><BOLD>茶百道·第1/2家</BOLD></L></C><BR>" +
        "<RIGHT><W>取 CBC8</W></RIGHT><BR>" +
        "杨枝甘露<BR>x2<BR>招牌奶茶<BR>x1<BR>" +
        "第一行<BR><BR>第三行 {不存在}<BR>",
    );
  });

  test("数量不放大时价格按纸宽右对齐，80mm 纸分隔线更长", () => {
    const narrow = renderPurchaseTicket(
      template([{ type: "items", showSpec: false, bigQuantity: false }]),
      data,
    );
    expect(narrow).toContain(`x2${" ".repeat(32 - 2 - 6)}¥33.00<BR>`);
    const wide = renderPurchaseTicket(
      template([{ type: "divider" }, { type: "items" }], { paperWidth: 80 }),
      data,
    );
    expect(wide.startsWith(`${"-".repeat(48)}<BR>`)).toBe(true);
  });

  test("模板里写的打印指令会被转成普通字符，不能控制打印机", () => {
    const content = renderPurchaseTicket(
      template([{ type: "items" }, { type: "text", text: "<CUT><AUDIO-REFUND>打折" }]),
      { ...data, remark: "<BR>" },
    );
    expect(content).toContain("＜CUT＞＜AUDIO-REFUND＞打折");
    expect(content).not.toContain("<CUT>");
  });

  test("二维码、语音、切纸和测试标记", () => {
    const t = template(
      [{ type: "items" }, { type: "qrcode", text: "https://x.cn/o/{订单号}", align: "center" }],
      { voice: true, cut: true },
    );
    const content = renderPurchaseTicket(t, data);
    expect(content).toContain("<C><QR>https://x.cn/o/DM1791214199980ddf1cbc8</QR></C>");
    expect(content.endsWith("<AUDIO-COMMON><CUT>")).toBe(true);
    const test = renderPurchaseTicket(t, { ...data, test: true });
    expect(test.startsWith("<CB>测试小票</CB>")).toBe(true);
    expect(test).not.toContain("<AUDIO-COMMON>");
  });

  test("多店提示只在合单时出现，空字段整行省略", () => {
    const t = template([
      { type: "stops", text: "共{店铺数}家店" },
      { type: "remark", label: "备注：" },
      { type: "items" },
    ]);
    const single = renderPurchaseTicket(t, { ...data, stopCount: 1, remark: "" });
    expect(single).not.toContain("共1家店");
    expect(single).not.toContain("备注");
  });

  test("拒绝缺商品列表、多个二维码、未知模块和超长内容", () => {
    expect(() => template([{ type: "text", text: "hi" }])).toThrow("小票必须包含商品列表");
    expect(() =>
      template([{ type: "items" }, { type: "qrcode", text: "a" }, { type: "qrcode", text: "b" }]),
    ).toThrow("只能打印一个二维码");
    expect(() => template([{ type: "items" }, { type: "html" }])).toThrow("类型不正确");
    expect(() => template([{ type: "items" }, { type: "text", text: "长".repeat(201) }])).toThrow(
      "不能超过 200 个字",
    );
    expect(() => template([{ type: "items" }], { copies: 4 })).toThrow("打印联数");
    expect(() => template([{ type: "items" }, { type: "items", size: "huge" }])).toThrow(
      "字号或对齐方式不正确",
    );
  });

  test("存储的模板损坏时回退为空，由调用方使用默认模板", () => {
    expect(storedTicketTemplate({ blocks: [{ type: "bad" }] })).toBeNull();
    expect(storedTicketTemplate(null)).toBeNull();
    expect(storedTicketTemplate(DEFAULT_TICKET_TEMPLATE)).toEqual(DEFAULT_TICKET_TEMPLATE);
  });
});

describe("小票模板的选择与保存", () => {
  const shopTemplate = {
    ...DEFAULT_TICKET_TEMPLATE,
    copies: 2,
    blocks: [{ type: "text", text: "本店专用" }, { type: "items" }],
  };
  const regionTemplate = {
    ...DEFAULT_TICKET_TEMPLATE,
    blocks: [{ type: "text", text: "区域默认" }, { type: "items" }],
  };
  const purchase = {
    id: "order-1",
    regionId: "region-1",
    order: { orderNo: "DM1", riderId: "rider-1", acceptTime: new Date(), remark: "" },
    stops: [
      {
        id: "stop-1",
        shopId: "shop-1",
        status: "pending",
        snapshot: { name: "茶百道" },
        items: [{ quantity: 1, approvedUnitCents: 1200, snapshot: { productName: "柠檬茶" } }],
      },
    ],
  };
  const setup = (printerTemplate: any) => {
    const prisma: any = {
      printerConfig: {
        findMany: jest.fn().mockResolvedValue([
          { id: "printer-1", purchaseShopId: "shop-1", status: "active", autoPrint: true, ticketTemplate: printerTemplate },
        ]),
      },
      errandPurchase: { findMany: jest.fn().mockResolvedValue([purchase]) },
      printJob: { findMany: jest.fn().mockResolvedValue([]) },
      regionRider: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      config: {
        findMany: jest.fn().mockResolvedValue([
          { key: "purchase_ticket_template:region-1", value: regionTemplate },
        ]),
      },
    };
    const print = { enqueue: jest.fn() };
    const service: any = Object.create(PurchaseService.prototype);
    service.prisma = prisma;
    service.printer = print;
    return { service, print };
  };

  test("店铺自定义模板优先，联数随模板", async () => {
    const { service, print } = setup(shopTemplate);
    await service.queuePrintTickets();
    const job = print.enqueue.mock.calls[0][0];
    expect(job.content).toContain("本店专用");
    expect(job.copies).toBe(2);
  });

  test("店铺没有自定义时用区域默认模板", async () => {
    const { service, print } = setup(null);
    await service.queuePrintTickets();
    expect(print.enqueue.mock.calls[0][0].content).toContain("区域默认");
  });

  const adminSetup = () => {
    const prisma: any = {
      region: { findUnique: jest.fn().mockResolvedValue({ id: "region-1" }) },
      config: { upsert: jest.fn(), deleteMany: jest.fn() },
      purchaseShop: {
        findFirst: jest.fn().mockResolvedValue({ id: "shop-1", name: "茶百道" }),
      },
      printerConfig: {
        findUnique: jest.fn().mockResolvedValue({ id: "printer-1", purchaseShopId: "shop-1" }),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: "printer-1", ...data })),
      },
    };
    const service: any = Object.create(PurchaseService.prototype);
    service.prisma = prisma;
    service.scope = { assertRegionAccess: jest.fn() };
    return { service, prisma };
  };

  test("保存区域默认模板会先校验；传 null 恢复系统默认", async () => {
    const { service, prisma } = adminSetup();
    await expect(
      service.saveTicketTemplate("admin", "region-1", { blocks: [{ type: "text" }] }),
    ).rejects.toThrow("小票必须包含商品列表");
    await service.saveTicketTemplate("admin", "region-1", regionTemplate);
    expect(prisma.config.upsert.mock.calls[0][0]).toMatchObject({
      where: { key: "purchase_ticket_template:region-1" },
      create: { group: "errand_purchase" },
    });
    await expect(service.saveTicketTemplate("admin", "region-1", null)).resolves.toEqual({
      template: DEFAULT_TICKET_TEMPLATE,
      custom: false,
    });
    expect(prisma.config.deleteMany).toHaveBeenCalledWith({
      where: { key: "purchase_ticket_template:region-1" },
    });
  });

  test("店铺恢复使用默认模板时清空自定义", async () => {
    const { service, prisma } = adminSetup();
    const view = await service.saveShopTicketTemplate("admin", "region-1", "shop-1", null);
    expect(prisma.printerConfig.update.mock.calls[0][0].data.ticketTemplate).toBe(
      require("@prisma/client").Prisma.DbNull,
    );
    expect(view.ticketTemplate).toBeNull();
  });

  test("预览用示例订单渲染，模板错误作为数据返回", async () => {
    const { service } = adminSetup();
    const ok = await service.previewTicket("admin", "region-1", {
      shopId: "shop-1",
      template: DEFAULT_TICKET_TEMPLATE,
    });
    expect(ok.error).toBeNull();
    expect(ok.content).toContain("<C>茶百道</C>");
    const bad = await service.previewTicket("admin", "region-1", {
      template: { blocks: [] },
    });
    expect(bad).toEqual({ content: null, parts: [], error: expect.stringContaining("商品列表") });
    expect(ok.parts.length).toBeGreaterThan(5);
  });
});

describe("小票编辑器的分段预览与现成样式", () => {
  test("分段结果标明每段来自第几个模块，停用和无内容的模块不出现", () => {
    const template = normalizeTicketTemplate({
      voice: true,
      blocks: [
        { type: "shopName", align: "center" },
        { type: "rider", enabled: false },
        { type: "stops", text: "合单" },
        { type: "items" },
      ],
    });
    const parts = renderTicketParts(template, { ...sampleTicketData("茶百道"), stopCount: 1, test: true });
    expect(parts.map((p) => p.index)).toEqual([null, 0, 3]);
    expect(parts[0].markup).toContain("测试小票");
    expect(parts.map((p) => p.markup).join("")).toBe(
      renderPurchaseTicket(template, { ...sampleTicketData("茶百道"), stopCount: 1, test: true }),
    );
    const live = renderTicketParts(template, sampleTicketData("茶百道"));
    expect(live.at(-1)).toEqual({ index: null, markup: "<AUDIO-COMMON>" });
  });

  test.each(TICKET_PRESETS.map((p) => [p.name, p.template]))(
    "现成样式「%s」能通过校验并打印出商品",
    (_name, template) => {
      const normalized = normalizeTicketTemplate(template);
      expect(renderPurchaseTicket(normalized, sampleTicketData())).toContain("杨枝甘露");
    },
  );
});
