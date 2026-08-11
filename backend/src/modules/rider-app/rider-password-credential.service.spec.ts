import { RiderPasswordCredentialService } from "./rider-password-credential.service";

describe("RiderPasswordCredentialService", () => {
  const rider = {
    id: "rider-1",
    userId: "user-1",
    regionId: "region-1",
    realName: "测试骑手",
    phone: "13800138000",
    verifyStatus: "approved",
    riderType: "official",
    User: {
      id: "user-1",
      status: "ACTIVE",
      nickname: "测试骑手",
      phone: "13800138000",
    },
  };
  const region = { id: "region-1", name: "测试区域" };

  function createService() {
    const prisma = {
      riderAppPasswordCredential: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      regionRider: {
        findFirst: jest.fn().mockResolvedValue(rider),
        findMany: jest.fn().mockResolvedValue([rider]),
      },
      region: {
        findUnique: jest.fn().mockResolvedValue(region),
        findMany: jest.fn().mockResolvedValue([region]),
      },
      adminOperationLog: {
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
      },
    };
    const redis = { del: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new RiderPasswordCredentialService(prisma as any, redis as any),
      prisma,
      redis,
    };
  }

  it("stores a bcrypt hash and never returns it", async () => {
    const { service, prisma } = createService();
    prisma.riderAppPasswordCredential.upsert.mockImplementation(
      async ({ create }) => ({
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        lastLoginIp: null,
        lastLoginDevice: null,
        passwordChangedAt: new Date("2026-08-11T00:00:00.000Z"),
        ...create,
      }),
    );

    const result = await service.saveConfig(
      {
        username: "Campus.Test",
        password: "Campus2026!",
        userId: "user-1",
        enabled: true,
        expiresAt: "2026-12-31T00:00:00.000Z",
        passwordHash: "must-not-be-used",
        failedAttempts: 999,
      },
      "admin-1",
      "127.0.0.1",
    );

    const data = prisma.riderAppPasswordCredential.upsert.mock.calls[0][0].create;
    expect(data).toMatchObject({
      id: "rider-password-login",
      username: "campus.test",
      normalizedUsername: "campus.test",
      userId: "user-1",
      enabled: true,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      createdBy: "admin-1",
      updatedBy: "admin-1",
    });
    expect(data.passwordHash).toMatch(/^\$2/);
    expect(data).not.toHaveProperty("failedAttempts");
    expect(JSON.stringify(result)).not.toContain("Campus2026!");
    expect(JSON.stringify(result)).not.toContain("passwordHash");
    expect(prisma.adminOperationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detail: {
          username: "campus.test",
          userId: "user-1",
          enabled: true,
          expiresAt: "2026-12-31T00:00:00.000Z",
          passwordChanged: true,
        },
      }),
    });
    expect(result).toMatchObject({
      configured: true,
      username: "campus.test",
      rider: { userId: "user-1", phone: "138****8000" },
      region,
    });
  });

  it("concurrent initial saves target one deterministic singleton row", async () => {
    const { service, prisma } = createService();
    prisma.riderAppPasswordCredential.upsert.mockImplementation(
      async ({ create }) => ({
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        lastLoginIp: null,
        lastLoginDevice: null,
        passwordChangedAt: new Date("2026-08-11T00:00:00.000Z"),
        ...create,
      }),
    );

    await Promise.all([
      service.saveConfig(
        {
          username: "campus.one",
          password: "Campus2026!",
          userId: "user-1",
          enabled: true,
        },
        "admin-1",
        "127.0.0.1",
      ),
      service.saveConfig(
        {
          username: "campus.two",
          password: "Campus2027!",
          userId: "user-2",
          enabled: true,
        },
        "admin-2",
        "127.0.0.2",
      ),
    ]);

    expect(prisma.riderAppPasswordCredential.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.riderAppPasswordCredential.findUnique).toHaveBeenCalledTimes(2);
    for (const [args] of prisma.riderAppPasswordCredential.findUnique.mock.calls) {
      expect(args).toEqual({ where: { id: "rider-password-login" } });
    }
    for (const [args] of prisma.riderAppPasswordCredential.upsert.mock.calls) {
      expect(args).toMatchObject({
        where: { id: "rider-password-login" },
        create: { id: "rider-password-login" },
      });
    }
  });

  it("keeps a pre-existing single legacy credential visible during upgrade", async () => {
    const { service, prisma } = createService();
    prisma.riderAppPasswordCredential.findFirst.mockResolvedValue({
      id: "cm-legacy-credential",
      username: "campus.legacy",
      normalizedUsername: "campus.legacy",
      passwordHash: "$2b$12$existing",
      userId: "user-1",
      enabled: true,
      expiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      lastLoginIp: null,
      lastLoginDevice: null,
      passwordChangedAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-11T00:00:00.000Z"),
      User: rider.User,
    });

    await expect(service.getSafeConfig()).resolves.toMatchObject({
      configured: true,
      username: "campus.legacy",
      userId: "user-1",
    });
    expect(prisma.riderAppPasswordCredential.findFirst).toHaveBeenCalledWith({
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
        { id: "asc" },
      ],
    });
  });

  it("adopts a pre-existing single legacy credential instead of creating a second row", async () => {
    const { service, prisma, redis } = createService();
    const legacy = {
      id: "cm-legacy-credential",
      username: "campus.legacy",
      normalizedUsername: "campus.legacy",
      passwordHash: "$2b$12$existing",
      userId: "user-1",
      enabled: true,
      expiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      lastLoginIp: null,
      lastLoginDevice: null,
      passwordChangedAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-11T00:00:00.000Z"),
    };
    prisma.riderAppPasswordCredential.findFirst.mockResolvedValue(legacy);
    prisma.riderAppPasswordCredential.update.mockImplementation(
      async ({ data }) => ({ ...legacy, ...data }),
    );
    prisma.riderAppPasswordCredential.upsert.mockImplementation(
      async ({ create }) => ({
        ...legacy,
        ...create,
      }),
    );

    await service.saveConfig(
      {
        username: "campus.legacy",
        password: "",
        userId: "user-1",
        enabled: true,
      },
      "admin-1",
      "127.0.0.1",
    );

    expect(prisma.riderAppPasswordCredential.update).toHaveBeenCalledWith({
      where: { id: "cm-legacy-credential" },
      data: expect.objectContaining({
        id: "rider-password-login",
        sessionVersion: { increment: 1 },
      }),
    });
    expect(prisma.riderAppPasswordCredential.upsert).not.toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith(
      "refresh:rider_password:cm-legacy-credential",
    );
  });

  it("rejects a user who is not an approved official rider with a region", async () => {
    const { service, prisma } = createService();
    prisma.regionRider.findFirst.mockResolvedValue(null);

    await expect(
      service.saveConfig(
        {
          username: "campus.test",
          password: "Campus2026!",
          userId: "user-2",
          enabled: true,
        },
        "admin-1",
        "127.0.0.1",
      ),
    ).rejects.toThrow("官方骑手");
    expect(prisma.riderAppPasswordCredential.upsert).not.toHaveBeenCalled();
  });

  it.each([
    [
      "password change",
      true,
      {
        username: "campus.test",
        password: "Changed2026!",
        userId: "user-1",
        enabled: true,
      },
      true,
    ],
    [
      "rider reassignment",
      true,
      {
        username: "campus.test",
        password: "",
        userId: "user-2",
        enabled: true,
      },
      false,
    ],
    [
      "disable",
      true,
      {
        username: "campus.test",
        password: "",
        userId: "user-1",
        enabled: false,
      },
      false,
    ],
    [
      "re-enable",
      false,
      {
        username: "campus.test",
        password: "",
        userId: "user-1",
        enabled: true,
      },
      false,
    ],
  ])("rotates the password-login session on %s", async (
    _label,
    currentEnabled,
    dto,
    passwordChanged,
  ) => {
    const { service, prisma, redis } = createService();
    const current = {
      id: "rider-password-login",
      username: "campus.test",
      normalizedUsername: "campus.test",
      passwordHash: "$2b$12$existing",
      userId: "user-1",
      enabled: currentEnabled,
      expiresAt: null,
      failedAttempts: 2,
      lockedUntil: null,
      lastLoginAt: null,
      lastLoginIp: null,
      lastLoginDevice: null,
      passwordChangedAt: new Date("2026-08-10T00:00:00.000Z"),
    };
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue(current);
    prisma.riderAppPasswordCredential.upsert.mockImplementation(
      async ({ update }) => ({
        ...current,
        ...update,
        sessionVersion: 2,
      }),
    );

    await service.saveConfig(dto, "admin-1", "127.0.0.1");

    expect(prisma.riderAppPasswordCredential.upsert).toHaveBeenCalledWith({
      where: { id: "rider-password-login" },
      create: expect.objectContaining({ id: "rider-password-login" }),
      update: expect.objectContaining({
        passwordHash: passwordChanged
          ? expect.stringMatching(/^\$2/)
          : "$2b$12$existing",
        sessionVersion: { increment: 1 },
      }),
    });
    if (passwordChanged) {
      expect(
        prisma.riderAppPasswordCredential.upsert.mock.calls[0][0].update,
      ).toHaveProperty("passwordChangedAt", expect.any(Date));
    }
    expect(redis.del).toHaveBeenCalledWith(
      "refresh:rider_password:rider-password-login",
    );
  });

  it("keeps the existing password and session when only safe metadata changes", async () => {
    const { service, prisma, redis } = createService();
    const current = {
      id: "rider-password-login",
      username: "campus.test",
      normalizedUsername: "campus.test",
      passwordHash: "$2b$12$existing",
      userId: "user-1",
      enabled: true,
      expiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      lastLoginIp: null,
      lastLoginDevice: null,
      passwordChangedAt: new Date("2026-08-10T00:00:00.000Z"),
    };
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue(current);
    prisma.riderAppPasswordCredential.upsert.mockImplementation(
      async ({ update }) => ({ ...current, ...update }),
    );

    await service.saveConfig(
      {
        username: "campus.test",
        password: "",
        userId: "user-1",
        enabled: true,
        expiresAt: "2026-12-31T00:00:00.000Z",
      },
      "admin-1",
      "127.0.0.1",
    );

    expect(
      prisma.riderAppPasswordCredential.upsert.mock.calls[0][0].update,
    ).toMatchObject({
      passwordHash: "$2b$12$existing",
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    });
    expect(
      prisma.riderAppPasswordCredential.upsert.mock.calls[0][0].update,
    ).not.toHaveProperty("sessionVersion");
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("returns safe config and sanitizes device metadata", async () => {
    const { service, prisma } = createService();
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue({
      id: "rider-password-login",
      username: "campus.test",
      passwordHash: "$2b$12$secret",
      userId: "user-1",
      enabled: true,
      expiresAt: null,
      failedAttempts: 1,
      lockedUntil: null,
      lastLoginAt: new Date("2026-08-11T00:00:00.000Z"),
      lastLoginIp: "127.0.0.1",
      lastLoginDevice: {
        model: "LM Phone",
        os: "Android 16",
        appVersion: "1.2.3",
        token: "secret",
      },
      passwordChangedAt: new Date("2026-08-10T00:00:00.000Z"),
      User: rider.User,
    });

    const result = await service.getSafeConfig();

    expect(prisma.riderAppPasswordCredential.findUnique).toHaveBeenCalledWith({
      where: { id: "rider-password-login" },
    });
    expect(result).toMatchObject({
      configured: true,
      lastLoginDevice: {
        model: "LM Phone",
        os: "Android 16",
        appVersion: "1.2.3",
      },
      rider: { phone: "138****8000" },
      region,
    });
    expect(JSON.stringify(result)).not.toContain("$2b$12$secret");
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("resets the lock without exposing secrets and logs only the reset action", async () => {
    const { service, prisma } = createService();
    const current = {
      id: "rider-password-login",
      username: "campus.test",
      passwordHash: "$2b$12$secret",
      userId: "user-1",
      enabled: true,
      expiresAt: null,
      failedAttempts: 5,
      lockedUntil: new Date("2026-08-11T01:00:00.000Z"),
      lastLoginAt: null,
      lastLoginIp: null,
      lastLoginDevice: null,
      passwordChangedAt: new Date(),
      User: rider.User,
    };
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue(current);
    prisma.riderAppPasswordCredential.update.mockResolvedValue({
      ...current,
      failedAttempts: 0,
      lockedUntil: null,
    });

    const result = await service.resetLock("admin-1", "127.0.0.1");

    expect(prisma.riderAppPasswordCredential.findUnique).toHaveBeenCalledWith({
      where: { id: "rider-password-login" },
    });
    expect(prisma.riderAppPasswordCredential.update).toHaveBeenCalledWith({
      where: { id: "rider-password-login" },
      data: { failedAttempts: 0, lockedUntil: null, updatedBy: "admin-1" },
    });
    expect(prisma.adminOperationLog.create).toHaveBeenCalledWith({
      data: {
        accountId: "admin-1",
        action: "rider_password_reset_lock",
        module: "rider_app",
        targetId: "rider-password-login",
        targetType: "rider_password_credential",
        detail: {
          credentialId: "rider-password-login",
          action: "reset_lock",
        },
        ip: "127.0.0.1",
      },
    });
    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(result)).not.toContain("$2b$12$secret");
    expect(
      JSON.stringify(prisma.adminOperationLog.create.mock.calls[0][0]),
    ).not.toContain("$2b$12$secret");
  });

  it("lists only active approved official riders with masked phones and regions", async () => {
    const { service, prisma } = createService();

    await expect(service.listRiderOptions(" 测试 ")).resolves.toEqual([
      {
        userId: "user-1",
        nickname: "测试骑手",
        realName: "测试骑手",
        phone: "138****8000",
        regionId: "region-1",
        regionName: "测试区域",
      },
    ]);
    expect(prisma.regionRider.findMany).toHaveBeenCalledWith({
      where: {
        verifyStatus: "approved",
        riderType: "official",
        regionId: { not: "" },
        User: { status: "ACTIVE" },
        OR: [
          { realName: { contains: "测试" } },
          { phone: { contains: "测试" } },
          { User: { nickname: { contains: "测试" } } },
          { User: { phone: { contains: "测试" } } },
        ],
      },
      include: { User: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  });

  it("does not return a nonstandard rider phone number unchanged", async () => {
    const { service, prisma } = createService();
    prisma.regionRider.findMany.mockResolvedValue([
      {
        ...rider,
        phone: "+8613800138000",
        User: { ...rider.User, phone: "+8613800138000" },
      },
    ]);

    const [option] = await service.listRiderOptions();

    expect(option.phone).toBe("+86****8000");
    expect(option.phone).not.toContain("13800138000");
  });
});
