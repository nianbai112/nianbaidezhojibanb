import { ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { RequestLogInterceptor } from "./request-log.interceptor";
import { requestContext } from '../common/request-context';

describe("RequestLogInterceptor", () => {
  const contextFor = (request: any) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as ExecutionContext;

  it.each(['app-login', 'apple/notifications'])('does not log App authorization codes or notification JWTs: %s', async (endpoint) => {
    const prisma = { serverLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const interceptor = new RequestLogInterceptor(prisma as any);
    const request = { method: 'POST', url: `/api/v1/wx-auth/${endpoint}?code=PRIVATE_QUERY`, headers: {},
      body: { code: 'PRIVATE_CODE', identityToken: 'PRIVATE_JWT', openid: 'PRIVATE_ID', payload: 'PRIVATE_APPLE_NOTIFICATION_JWT' } };
    await expect(lastValueFrom(interceptor.intercept(contextFor(request), {
      handle: () => throwError(() => Object.assign(new Error('failed'), { status: 400 })),
    }))).rejects.toThrow('failed');
    await interceptor.onModuleDestroy();
    const saved = JSON.stringify(prisma.serverLog.createMany.mock.calls);
    expect(saved).not.toContain('PRIVATE_');
    expect(saved).toContain('appLoginCredentials');
    expect(prisma.serverLog.createMany).toHaveBeenCalledTimes(1);
  });

  it('records a successful admin mutation when the business handler has no audit writer', async () => {
    const prisma = { serverLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) }, adminOperationLog: { create: jest.fn().mockResolvedValue({}) } };
    const interceptor = new RequestLogInterceptor(prisma as any);
    const request: any = { method: 'PUT', url: '/admin/configs/miniapp', headers: {}, ip: '203.0.113.1', user: { sub: 'admin-1', isAdmin: true }, body: { enabled: true, appSecret: 'do-not-log' } };
    await requestContext.run({ request }, () => lastValueFrom(interceptor.intercept(contextFor(request), { handle: () => of({ success: true }) })));
    expect(prisma.adminOperationLog.create.mock.calls[0][0].data).toMatchObject({ accountId: 'admin-1', ip: '203.0.113.1', detail: { submitted: { enabled: true, appSecret: '已隐藏敏感信息' } } });
    await interceptor.onModuleDestroy();
  });

  it('does not duplicate an existing business audit record or label a rejected mutation successful', async () => {
    const prisma = { serverLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) }, adminOperationLog: { create: jest.fn() } };
    const interceptor = new RequestLogInterceptor(prisma as any);
    const request: any = { method: 'PUT', url: '/admin/configs/miniapp', headers: {}, user: { sub: 'admin-1', isAdmin: true } };
    await requestContext.run({ request, operationLogged: true }, () => lastValueFrom(interceptor.intercept(contextFor(request), { handle: () => of({ success: true }) })));
    await requestContext.run({ request }, () => lastValueFrom(interceptor.intercept(contextFor(request), { handle: () => of({ code: 400 }) })));
    expect(prisma.adminOperationLog.create).not.toHaveBeenCalled();
    await interceptor.onModuleDestroy();
  });

  it("batches successful admin request logs outside the response path", async () => {
    const prisma = {
      serverLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const interceptor = new RequestLogInterceptor(prisma as any);
    const request = {
      method: "GET",
      url: "/admin/users",
      headers: { "user-agent": "test" },
      body: undefined,
      ip: "127.0.0.1",
      res: { statusCode: 200 },
      user: { sub: "admin-1", isAdmin: true },
    };

    await lastValueFrom(
      interceptor.intercept(contextFor(request), {
        handle: () => of({ ok: true }),
      }),
    );
    expect(prisma.serverLog.createMany).not.toHaveBeenCalled();

    await (interceptor as any).flushPendingLogs();
    expect(prisma.serverLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          module: "admin",
          adminId: "admin-1",
          statusCode: 200,
        }),
      ],
    });
    await interceptor.onModuleDestroy();
  });

  it("records failed requests without delaying the propagated error", async () => {
    const prisma = {
      serverLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const interceptor = new RequestLogInterceptor(prisma as any);
    const request = {
      method: "POST",
      url: "/orders",
      headers: {},
      body: { token: "secret-value" },
      ip: "127.0.0.1",
      res: { statusCode: 200 },
    };
    const failure = Object.assign(new Error("database unavailable"), {
      status: 503,
    });

    await expect(
      lastValueFrom(
        interceptor.intercept(contextFor(request), {
          handle: () => throwError(() => failure),
        }),
      ),
    ).rejects.toBe(failure);

    await (interceptor as any).flushPendingLogs();
    expect(prisma.serverLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          level: "error",
          statusCode: 503,
          detail: { token: "se***ue" },
        }),
      ],
    });
    await interceptor.onModuleDestroy();
  });
});
