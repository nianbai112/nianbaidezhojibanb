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
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
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
    prisma.riderAppPasswordCredential.create.mockImplementation(
      async ({ data }) => ({
        id: "credential-1",
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        lastLoginIp: null,
        lastLoginDevice: null,
        passwordChangedAt: new Date("2026-08-11T00:00:00.000Z"),
        ...data,
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

    const data = prisma.riderAppPasswordCredential.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
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
    expect(prisma.riderAppPasswordCredential.create).not.toHaveBeenCalled();
  });

  it("rotates only the password-login session when password, rider, or enabled state changes", async () => {
    const { service, prisma, redis } = createService();
    const current = {
      id: "credential-1",
      username: "campus.test",
      normalizedUsername: "campus.test",
      passwordHash: "$2b$12$existing",
      userId: "user-1",
      enabled: true,
      expiresAt: null,
      failedAttempts: 2,
      lockedUntil: null,
      lastLoginAt: null,
      lastLoginIp: null,
      lastLoginDevice: null,
      passwordChangedAt: new Date("2026-08-10T00:00:00.000Z"),
    };
    prisma.riderAppPasswordCredential.findFirst.mockResolvedValue(current);
    prisma.riderAppPasswordCredential.update.mockImplementation(
      async ({ data }) => ({
        ...current,
        ...data,
        sessionVersion: 2,
      }),
    );

    await service.saveConfig(
      {
        username: "campus.test",
        password: "Changed2026!",
        userId: "user-1",
        enabled: true,
      },
      "admin-1",
      "127.0.0.1",
    );

    expect(prisma.riderAppPasswordCredential.update).toHaveBeenCalledWith({
      where: { id: "credential-1" },
      data: expect.objectContaining({
        passwordHash: expect.stringMatching(/^\$2/),
        passwordChangedAt: expect.any(Date),
        sessionVersion: { increment: 1 },
      }),
    });
    expect(redis.del).toHaveBeenCalledWith(
      "refresh:rider_password:credential-1",
    );
  });

  it("keeps the existing password and session when only safe metadata changes", async () => {
    const { service, prisma, redis } = createService();
    const current = {
      id: "credential-1",
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
    prisma.riderAppPasswordCredential.findFirst.mockResolvedValue(current);
    prisma.riderAppPasswordCredential.update.mockImplementation(
      async ({ data }) => ({ ...current, ...data }),
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
      prisma.riderAppPasswordCredential.update.mock.calls[0][0].data,
    ).toMatchObject({
      passwordHash: "$2b$12$existing",
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    });
    expect(
      prisma.riderAppPasswordCredential.update.mock.calls[0][0].data,
    ).not.toHaveProperty("sessionVersion");
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("returns safe config and sanitizes device metadata", async () => {
    const { service, prisma } = createService();
    prisma.riderAppPasswordCredential.findFirst.mockResolvedValue({
      id: "credential-1",
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
      id: "credential-1",
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
    prisma.riderAppPasswordCredential.findFirst.mockResolvedValue(current);
    prisma.riderAppPasswordCredential.update.mockResolvedValue({
      ...current,
      failedAttempts: 0,
      lockedUntil: null,
    });

    const result = await service.resetLock("admin-1", "127.0.0.1");

    expect(prisma.riderAppPasswordCredential.update).toHaveBeenCalledWith({
      where: { id: "credential-1" },
      data: { failedAttempts: 0, lockedUntil: null, updatedBy: "admin-1" },
    });
    expect(prisma.adminOperationLog.create).toHaveBeenCalledWith({
      data: {
        accountId: "admin-1",
        action: "rider_password_reset_lock",
        module: "rider_app",
        targetId: "credential-1",
        targetType: "rider_password_credential",
        detail: { credentialId: "credential-1", action: "reset_lock" },
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
