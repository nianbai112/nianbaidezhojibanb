import { RiderAppService } from "./rider-app.service";

describe("RiderAppService", () => {
  const officialRider = {
    id: "rider-1",
    userId: "user-1",
    regionId: "region-1",
    realName: "骑手甲",
    phone: "13800138000",
    riderBio: "",
    status: "online",
    verifyStatus: "approved",
    riderType: "official",
    rating: 5,
    balance: 12.5,
    totalOrders: 8,
    todayOrders: 2,
  };

  function createService(rider: any = officialRider) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-1",
          nickname: "小骑手",
          avatar: "avatar.png",
          phone: "13800138000",
        }),
      },
      regionRider: { findUnique: jest.fn().mockResolvedValue(rider) },
      merchant: { findMany: jest.fn().mockResolvedValue([]) },
      merchantStaff: { findMany: jest.fn().mockResolvedValue([]) },
      region: { findUnique: jest.fn().mockResolvedValue({ name: "测试区域" }) },
      errandOrder: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: "order-1" }]),
        findUnique: jest.fn().mockResolvedValue({
          id: "order-1",
          riderId: "user-1",
          status: "in_progress",
        }),
      },
      order: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      riderLocationTrack: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      deliveryRiskEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: "risk-1", eventType: "cannot_contact" }),
      },
      deliveryOrderNode: {
        create: jest.fn().mockResolvedValue({ id: "node-1" }),
      },
      wallet: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ userId: "user-1", balance: 10, freeze: 2 }),
      },
      riderSettlement: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { payableAmount: 0 } }),
      },
      riderSettlementItem: { findMany: jest.fn().mockResolvedValue([]) },
      withdraw: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      orderAppeal: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: "appeal-1", status: "pending" }),
        update: jest
          .fn()
          .mockResolvedValue({ id: "appeal-1", status: "pending" }),
      },
      orderAppealEvent: {
        create: jest.fn().mockResolvedValue({ id: "event-1" }),
      },
      subsidyLedger: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      userPushDevice: {
        upsert: jest.fn().mockResolvedValue({ id: "device-1" }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const auth = {
      sendPhoneLoginCode: jest
        .fn()
        .mockResolvedValue({ success: true, expiresIn: 300 }),
      phoneLogin: jest.fn().mockResolvedValue({
        id: "user-1",
        token: "access",
        accessToken: "access",
        refreshToken: "refresh",
      }),
    };
    const errand = {
      getDeliveryOrdersList: jest.fn().mockResolvedValue({ orders: [] }),
      getRiderDeliveryOrderDetail: jest
        .fn()
        .mockResolvedValue({ success: true, data: { id: "order-1" } }),
      acceptOrder: jest.fn().mockResolvedValue({ success: true }),
      updateRiderStatus: jest.fn().mockResolvedValue({ success: true }),
      updateLocation: jest.fn().mockResolvedValue({ success: true }),
      updateLocationIfNewer: jest
        .fn()
        .mockResolvedValue({ success: true, updated: true }),
      getRiderInfo: jest.fn().mockResolvedValue({ id: "rider-1" }),
      updateRiderInfo: jest.fn().mockResolvedValue({ id: "rider-1" }),
      getOrderStats: jest.fn().mockResolvedValue({ today: 1 }),
      confirmReceiptByCode: jest.fn().mockResolvedValue({
        success: true,
        data: { id: "order-1", status: "completed" },
      }),
    };
    const systemConfig = {
      getRiderAppControlConfig: jest.fn().mockResolvedValue({
        data: { runtime: { locationMaxAgeHours: 24 } },
      }),
    };
    const finance = {
      transactions: jest
        .fn()
        .mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 20 }),
      withdraw: jest
        .fn()
        .mockResolvedValue({ id: "withdraw-1", status: "PENDING" }),
    };
    (prisma as any).$transaction = jest.fn(async (callback: any) =>
      callback(prisma),
    );
    return {
      service: new RiderAppService(
        prisma as any,
        auth as any,
        errand as any,
        systemConfig as any,
        finance as any,
      ),
      prisma,
      auth,
      errand,
      systemConfig,
      finance,
    };
  }

  it("allows only approved official riders with a region", async () => {
    const { service } = createService();

    await expect(service.getSession("user-1")).resolves.toMatchObject({
      allowed: true,
      user: { id: "user-1", nickname: "小骑手" },
      rider: {
        user_id: "user-1",
        region_id: "region-1",
        region_name: "测试区域",
        rider_type: "official",
        is_official: true,
      },
    });
  });

  it("denies an approved part-time rider", async () => {
    const { service } = createService({
      ...officialRider,
      riderType: "part_time",
    });

    await expect(service.getSession("user-1")).resolves.toMatchObject({
      allowed: false,
      message: expect.stringContaining("兼职骑手"),
    });
  });

  it("uses the existing phone verification service and returns rider eligibility", async () => {
    const { service, auth } = createService();
    const dto = { phone: "13800138000", code: "123456" };

    await expect(
      service.loginPhone(dto, "127.0.0.1", "rider-app"),
    ).resolves.toMatchObject({
      token: "access",
      refreshToken: "refresh",
      allowed: true,
    });
    expect(auth.phoneLogin).toHaveBeenCalledWith(
      dto,
      "127.0.0.1",
      "rider-app",
      {
        preferApprovedOfficialRider: true,
      },
    );
  });

  it("delegates SMS code sending to the existing throttled auth service", async () => {
    const { service, auth } = createService();

    await expect(
      service.sendPhoneCode({ phone: "13800138000" }, "127.0.0.1"),
    ).resolves.toMatchObject({
      success: true,
      expiresIn: 300,
    });
    expect(auth.sendPhoneLoginCode).toHaveBeenCalledWith(
      { phone: "13800138000" },
      "127.0.0.1",
    );
  });

  it("returns rider and dorm-shop roles in one partner session", async () => {
    const { service, prisma } = createService();
    prisma.merchant.findMany.mockResolvedValue([
      {
        id: "merchant-1",
        name: "一栋零食铺",
        businessType: "dorm_shop",
        status: "approved",
        deliveryMode: "self_delivery",
        logo: "shop.png",
        dormBuilding: "一栋",
        dormRoom: "101",
      },
    ]);

    await expect(service.getPartnerSession("user-1")).resolves.toMatchObject({
      allowed: true,
      defaultRole: "rider",
      roles: [
        { type: "rider", allowed: true },
        {
          type: "dorm_shop_owner",
          allowed: true,
          shops: [{ id: "merchant-1", name: "一栋零食铺" }],
        },
        { type: "dorm_shop_staff", allowed: false },
      ],
      shops: [{ id: "merchant-1", delivery_mode: "self_delivery" }],
    });
  });

  it("allows a merchant-only account into the partner app without granting rider APIs", async () => {
    const { service, prisma, errand } = createService(null);
    prisma.merchant.findMany.mockResolvedValue([
      {
        id: "merchant-1",
        name: "二栋小卖部",
        businessType: "dorm_shop",
        status: "closed",
        deliveryMode: "self_delivery",
        logo: null,
        dormBuilding: "二栋",
        dormRoom: "202",
      },
    ]);

    await expect(service.getPartnerSession("user-1")).resolves.toMatchObject({
      allowed: true,
      defaultRole: "dorm_shop_owner",
      rider: null,
      roles: [
        { type: "rider", allowed: false },
        { type: "dorm_shop_owner", allowed: true },
        { type: "dorm_shop_staff", allowed: false },
      ],
    });
    await expect(service.getOrders("user-1", {})).rejects.toThrow("骑手");
    expect(errand.getDeliveryOrdersList).not.toHaveBeenCalled();
  });

  it("allows an invited delivery employee to enter and accept the invitation", async () => {
    const { service, prisma } = createService(null);
    prisma.merchantStaff.findMany.mockResolvedValue([
      {
        id: "staff-1",
        merchantId: "merchant-1",
        userId: "user-1",
        status: "invited",
        onDuty: false,
        inviteExpiresAt: new Date(Date.now() + 60_000),
        merchant: {
          id: "merchant-1",
          name: "四栋小店",
          logo: null,
          status: "approved",
          businessType: "dorm_shop",
          dormBuilding: "四栋",
          dormRoom: "404",
        },
      },
    ]);

    await expect(service.getPartnerSession("user-1")).resolves.toMatchObject({
      allowed: true,
      defaultRole: "dorm_shop_staff",
      staff_shops: [{ staff_id: "staff-1", status: "invited" }],
      roles: [
        { type: "rider", allowed: false },
        { type: "dorm_shop_owner", allowed: false },
        { type: "dorm_shop_staff", allowed: true, status: "invited" },
      ],
    });
  });

  it("does not grant the employee role after the invitation expires", async () => {
    const { service, prisma } = createService(null);
    prisma.merchantStaff.findMany.mockResolvedValue([
      {
        id: "staff-expired",
        merchantId: "merchant-1",
        userId: "user-1",
        status: "invited",
        onDuty: false,
        inviteExpiresAt: new Date(Date.now() - 60_000),
        merchant: {
          id: "merchant-1",
          name: "四栋小店",
          logo: null,
          status: "approved",
          businessType: "dorm_shop",
          dormBuilding: "四栋",
          dormRoom: "404",
        },
      },
    ]);

    await expect(service.getPartnerSession("user-1")).resolves.toMatchObject({
      allowed: false,
      defaultRole: null,
      staff_shops: [{ staff_id: "staff-expired", status: "expired" }],
      roles: [
        { type: "rider", allowed: false },
        { type: "dorm_shop_owner", allowed: false },
        {
          type: "dorm_shop_staff",
          allowed: false,
          status: "expired",
          message: expect.stringContaining("邀请已过期"),
        },
      ],
    });
  });

  it("uses strict canonical phone identity for partner login", async () => {
    const { service, auth, prisma } = createService();
    prisma.merchant.findMany.mockResolvedValue([]);
    const dto = { phone: "13800138000", code: "123456" };

    await expect(
      service.loginPartnerPhone(dto, "127.0.0.1", "partner-app"),
    ).resolves.toMatchObject({
      token: "access",
      allowed: true,
      roles: expect.any(Array),
    });
    expect(auth.phoneLogin).toHaveBeenCalledWith(
      dto,
      "127.0.0.1",
      "partner-app",
      {
        preferApprovedOfficialRider: true,
        strictPartnerIdentity: true,
      },
    );
  });

  it("registers and unregisters a merchant-only partner push device by user and client", async () => {
    const { service, prisma } = createService(null);
    prisma.merchant.findMany.mockResolvedValue([
      {
        id: "merchant-1",
        name: "三栋小店",
        businessType: "dorm_shop",
        status: "approved",
        deliveryMode: "self_delivery",
        logo: null,
        dormBuilding: "三栋",
        dormRoom: "303",
      },
    ]);

    await expect(
      service.registerPartnerPushToken("user-1", {
        clientId: "cid-1",
        platform: "android",
        appVersion: "1.1.0",
      }),
    ).resolves.toEqual({ success: true, clientId: "cid-1" });
    expect(prisma.userPushDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ userId: "user-1" }),
      }),
    );

    await expect(
      service.unregisterPartnerPushToken("user-1", { clientId: "cid-1" }),
    ).resolves.toEqual({ success: true, removed: 1 });
    expect(prisma.userPushDevice.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "cid-1" },
    });
  });

  it("allows official riders to use the dedicated App order APIs", async () => {
    const { service, errand } = createService();

    await service.getOrders("user-1", { status: "pending_accept" });
    await service.acceptOrder("user-1", "order-1");
    await service.updateLocation("user-1", { lat: 30, lng: 120 });

    expect(errand.getDeliveryOrdersList).toHaveBeenCalledWith("user-1", {
      status: "pending_accept",
    });
    expect(errand.acceptOrder).toHaveBeenCalledWith("order-1", "user-1");
    expect(errand.updateLocation).toHaveBeenCalledWith("user-1", {
      lat: 30,
      lng: 120,
    });
  });

  it("rejects part-time riders before an App order operation reaches the delivery service", async () => {
    const { service, errand } = createService({
      ...officialRider,
      riderType: "part_time",
    });

    await expect(service.getOrders("user-1", {})).rejects.toThrow("兼职骑手");
    expect(errand.getDeliveryOrdersList).not.toHaveBeenCalled();
  });

  it("does not accept App location uploads without an active delivery order", async () => {
    const { service, prisma, errand } = createService();
    prisma.errandOrder.count.mockResolvedValue(0);
    prisma.order.count.mockResolvedValue(0);

    await expect(
      service.updateLocation("user-1", { lat: 30, lng: 120 }),
    ).rejects.toThrow("配送中的订单");
    expect(errand.updateLocation).not.toHaveBeenCalled();
  });

  it("stores an idempotent batch and forwards the newest point to the live location", async () => {
    const { service, prisma, errand } = createService();
    const recordedAt = new Date().toISOString();

    await expect(
      service.updateLocationBatch("user-1", {
        points: [
          {
            client_id: "point-1",
            order_id: "order-1",
            lat: 30,
            lng: 120,
            recorded_at: recordedAt,
          },
          {
            client_id: "point-2",
            order_id: "order-1",
            lat: 30.1,
            lng: 120.1,
            accuracy: 8,
            recorded_at: recordedAt,
          },
        ],
      }),
    ).resolves.toMatchObject({
      success: true,
      inserted: 2,
      accepted_client_ids: ["point-1", "point-2"],
    });

    expect(prisma.riderLocationTrack.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          riderId: "user-1",
          orderId: "order-1",
          clientId: "point-1",
        }),
      ]),
      skipDuplicates: true,
    });
    expect(errand.updateLocationIfNewer).toHaveBeenCalledWith(
      "user-1",
      { lat: 30.1, lng: 120.1 },
      new Date(recordedAt),
    );
  });

  it("accepts cached points for a recently completed assigned order", async () => {
    const { service, prisma } = createService();
    const recordedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await expect(
      service.updateLocationBatch("user-1", {
        points: [
          {
            client_id: "completed-point",
            order_id: "order-1",
            lat: 30,
            lng: 120,
            recorded_at: recordedAt,
          },
        ],
      }),
    ).resolves.toMatchObject({
      success: true,
      accepted_client_ids: ["completed-point"],
    });

    expect(prisma.errandOrder.findMany).toHaveBeenCalledWith({
      where: { riderId: "user-1", updatedAt: { gte: expect.any(Date) } },
      select: { id: true },
    });
  });

  it("rejects oversized, stale, invalid, or unassigned trajectory batches", async () => {
    const { service } = createService();
    const point = {
      client_id: "point-1",
      order_id: "order-1",
      lat: 30,
      lng: 120,
      recorded_at: new Date().toISOString(),
    };

    await expect(
      service.updateLocationBatch("user-1", { points: Array(51).fill(point) }),
    ).rejects.toThrow("最多上传 50");
    await expect(
      service.updateLocationBatch("user-1", {
        points: [{ ...point, lat: 91 }],
      }),
    ).rejects.toThrow("定位坐标无效");
    await expect(
      service.updateLocationBatch("user-1", {
        points: [
          {
            ...point,
            recorded_at: new Date(
              Date.now() - 25 * 60 * 60 * 1000,
            ).toISOString(),
          },
        ],
      }),
    ).rejects.toThrow("超过补传时效");
    await expect(
      service.updateLocationBatch("user-1", {
        points: [{ ...point, order_id: "other-order" }],
      }),
    ).rejects.toThrow("不属于当前骑手");
  });

  it("enforces the server-side background-location switch", async () => {
    const { service, systemConfig, prisma } = createService();
    systemConfig.getRiderAppControlConfig.mockResolvedValue({
      data: {
        runtime: { backgroundLocationEnabled: false, locationMaxAgeHours: 24 },
      },
    });

    await expect(
      service.updateLocationBatch("user-1", {
        points: [
          {
            client_id: "point-1",
            order_id: "order-1",
            lat: 30,
            lng: 120,
            recorded_at: new Date().toISOString(),
          },
        ],
      }),
    ).rejects.toThrow("后台定位已关闭");
    expect(prisma.riderLocationTrack.createMany).not.toHaveBeenCalled();
  });

  it("records one actionable exception for an active assigned order", async () => {
    const { service, prisma } = createService();

    await expect(
      service.reportException("user-1", "order-1", {
        type: "cannot_contact",
        description: "多次拨打电话无人接听",
        proof_images: ["proof.jpg"],
      }),
    ).resolves.toMatchObject({ success: true, data: { id: "risk-1" } });

    expect(prisma.deliveryRiskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: "order-1",
        orderType: "errand",
        riderId: "user-1",
        eventType: "cannot_contact",
        handled: false,
      }),
    });
    expect(prisma.deliveryOrderNode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: "order-1",
        nodeType: "exception",
        proofImages: ["proof.jpg"],
      }),
    });
  });

  it("records shop delivery exceptions with the shop order type", async () => {
    const { service, prisma } = createService();
    prisma.errandOrder.findUnique.mockResolvedValue(null);
    prisma.order.findUnique.mockResolvedValue({
      id: "shop-1",
      riderId: "user-1",
      status: "SHIPPED",
    });

    await expect(
      service.reportException("user-1", "shop-1", {
        type: "merchant_delay",
        description: "商家表示还需要等待十五分钟",
      }),
    ).resolves.toMatchObject({ success: true });

    expect(prisma.deliveryRiskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: "shop-1",
        orderType: "shop",
        eventType: "merchant_delay",
      }),
    });
  });

  it("returns the existing open exception instead of creating a duplicate", async () => {
    const { service, prisma } = createService();
    prisma.deliveryRiskEvent.findFirst.mockResolvedValue({
      id: "risk-existing",
      eventType: "cannot_contact",
    });

    await expect(
      service.reportException("user-1", "order-1", {
        type: "cannot_contact",
        description: "仍然无法联系收货人",
      }),
    ).resolves.toMatchObject({
      success: true,
      duplicate: true,
      data: { id: "risk-existing" },
    });
    expect(prisma.deliveryRiskEvent.create).not.toHaveBeenCalled();
  });

  it("rejects invalid or unassigned delivery exception reports", async () => {
    const { service, prisma } = createService();

    await expect(
      service.reportException("user-1", "order-1", {
        type: "unknown",
        description: "说明足够长",
      }),
    ).rejects.toThrow("异常类型");

    prisma.errandOrder.findUnique.mockResolvedValue({
      id: "order-1",
      riderId: "user-2",
      status: "in_progress",
    });
    await expect(
      service.reportException("user-1", "order-1", {
        type: "address_issue",
        description: "地址与订单信息不一致",
      }),
    ).rejects.toThrow("当前骑手");
  });

  it("exposes a rider income overview backed by wallet and completed-order earnings", async () => {
    const { service, prisma } = createService();
    prisma.errandOrder.findMany.mockResolvedValue([
      {
        id: "e1",
        orderNo: "E1",
        title: "跑腿",
        price: 10,
        tip: 2,
        completeTime: new Date(),
      },
    ]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.riderSettlementItem.findMany.mockResolvedValue([]);
    prisma.wallet.findUnique.mockResolvedValue({
      userId: "user-1",
      balance: 50,
      freeze: 5,
    });
    prisma.riderSettlement.aggregate.mockResolvedValue({
      _sum: { payableAmount: 30 },
    });
    prisma.withdraw.aggregate.mockResolvedValue({ _sum: { amount: 8 } });

    await expect(
      service.getRiderIncomeOverview("user-1"),
    ).resolves.toMatchObject({
      balance: 50,
      freeze: 5,
      today_income: 12,
      month_income: 12,
      pending_settlement: 42, // 12 未结算 + 30 已结算未打款
      withdrawing: 8,
    });
  });

  it("lists only the rider own settlements with appeal status", async () => {
    const { service, prisma } = createService();
    prisma.riderSettlement.findMany.mockResolvedValue([
      {
        id: "s1",
        settlementNo: "ST1",
        periodStart: new Date(),
        periodEnd: new Date(),
        orderCount: 3,
        deliveryFeeTotal: 60,
        rewardAmount: 5,
        penaltyAmount: 0,
        payableAmount: 65,
        paidAmount: 0,
        status: "PENDING",
      },
    ]);
    prisma.riderSettlement.count.mockResolvedValue(1);
    prisma.orderAppeal.findMany.mockResolvedValue([
      { orderId: "s1", status: "pending" },
    ]);

    await expect(
      service.getRiderSettlements("user-1", { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      list: [
        {
          id: "s1",
          deliveryFeeTotal: 60,
          payableAmount: 65,
          appealStatus: "pending",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(prisma.riderSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { riderId: "user-1" },
      }),
    );
  });

  it("returns settlement detail with order rows and appeal reply", async () => {
    const { service, prisma } = createService();
    prisma.riderSettlement.findFirst.mockResolvedValue({
      id: "s1",
      settlementNo: "ST1",
      periodStart: new Date(),
      periodEnd: new Date(),
      orderCount: 1,
      deliveryFeeTotal: 8,
      rewardAmount: 2,
      penaltyAmount: 0,
      payableAmount: 10,
      paidAmount: 0,
      status: "PENDING",
    });
    prisma.riderSettlementItem.findMany.mockResolvedValue([
      {
        id: "i1",
        orderType: "errand",
        orderId: "e1",
        deliveryFeeAmount: 8,
        tipAmount: 2,
        rewardAmount: 0,
        penaltyAmount: 0,
        payableAmount: 10,
        status: "included",
        reversalAmount: 0,
      },
    ]);
    prisma.errandOrder.findMany.mockResolvedValue([
      { id: "e1", orderNo: "E-100" },
    ]);
    prisma.orderAppeal.findFirst.mockResolvedValue({
      status: "processing",
      description: "金额不对",
      latestReply: "已核实",
    });

    const result = await service.getRiderSettlementDetail("user-1", "s1");
    expect(result).toMatchObject({
      id: "s1",
      appealStatus: "processing",
      appealReason: "金额不对",
      appealReply: "已核实",
      itemNetAmount: 10,
      orders: [{ orderNo: "E-100", originalAmount: 10, netAmount: 10 }],
    });
  });

  it("creates a settlement appeal once and blocks duplicate pending appeals", async () => {
    const { service, prisma } = createService();
    prisma.riderSettlement.findFirst.mockResolvedValue({
      id: "s1",
      settlementNo: "ST1",
      regionId: "region-1",
    });

    await expect(
      service.createRiderSettlementAppeal("user-1", "s1", {
        reason: "结算金额与我核算不一致，请重新核对",
        images: [],
      }),
    ).resolves.toMatchObject({ status: "pending" });
    expect(prisma.orderAppeal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderType: "rider_settlement",
        orderId: "s1",
        description: "结算金额与我核算不一致，请重新核对",
      }),
    });

    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1",
      status: "pending",
    });
    await expect(
      service.createRiderSettlementAppeal("user-1", "s1", {
        reason: "再次提交申诉说明",
      }),
    ).rejects.toThrow("已提交申诉");
  });

  it("rejects settlement appeals with too-short reasons", async () => {
    const { service } = createService();

    await expect(
      service.createRiderSettlementAppeal("user-1", "s1", { reason: "短" }),
    ).rejects.toThrow("5-500");
  });

  it("delegates rider wallet transactions and withdrawals to the finance service", async () => {
    const { service, finance } = createService();

    await service.getRiderIncomeTransactions("user-1", { page: 1 });
    expect(finance.transactions).toHaveBeenCalledWith("user-1", { page: 1 });

    await service.createRiderWithdrawal("user-1", {
      amount: 10,
      channel: "WX_PAY",
      account: "wx-1",
    });
    expect(finance.withdraw).toHaveBeenCalledWith("user-1", {
      amount: 10,
      channel: "WX_PAY",
      account: "wx-1",
    });
  });
});
