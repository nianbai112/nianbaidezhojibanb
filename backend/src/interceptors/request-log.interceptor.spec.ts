import { ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { RequestLogInterceptor } from "./request-log.interceptor";

describe("RequestLogInterceptor", () => {
  const contextFor = (request: any) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as ExecutionContext;

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
