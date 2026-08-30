import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";

describe("HealthController service readiness", () => {
  const runtimeConfig = {
    get: jest.fn((key: string) => (key === "DB_IS_INSTALLED" ? "1" : "false")),
  } as any;

  it("reports all three services ready only with fresh runtime heartbeats", async () => {
    const updatedAt = new Date().toISOString();
    const heartbeats = {
      list: jest.fn((service: string) =>
        Promise.resolve([
          {
            service,
            instanceId: `${service}-1`,
            mode: "runtime",
            ready: true,
            updatedAt,
          },
        ]),
      ),
    } as any;
    const controller = new HealthController(heartbeats, runtimeConfig);

    await expect(controller.services()).resolves.toEqual(
      expect.objectContaining({
        status: "ok",
        services: expect.objectContaining({
          worker: expect.objectContaining({
            status: "up",
            totalInstances: 1,
            readyInstances: 1,
          }),
          realtime: expect.objectContaining({
            status: "up",
            totalInstances: 1,
            readyInstances: 1,
          }),
        }),
      }),
    );
  });

  it("rejects a stale setup-mode Realtime process after installation", async () => {
    const heartbeats = {
      list: jest.fn((service: string) =>
        Promise.resolve([
          {
            instanceId: `${service}-1`,
            mode: service === "realtime" ? "setup" : "runtime",
            ready: true,
            updatedAt: new Date().toISOString(),
          },
        ]),
      ),
    } as any;
    const controller = new HealthController(heartbeats, runtimeConfig);

    await expect(controller.services()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("reports the service down when any registered instance is stale", async () => {
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 60_000).toISOString();
    const heartbeats = {
      list: jest.fn((service: string) =>
        Promise.resolve(
          service === "worker"
            ? [
                {
                  instanceId: "worker-1",
                  mode: "runtime",
                  ready: true,
                  updatedAt: now,
                },
                {
                  instanceId: "worker-2",
                  mode: "runtime",
                  ready: true,
                  updatedAt: stale,
                },
              ]
            : [
                {
                  instanceId: "realtime-1",
                  mode: "runtime",
                  ready: true,
                  updatedAt: now,
                },
              ],
        ),
      ),
    } as any;
    const controller = new HealthController(heartbeats, runtimeConfig);

    await expect(controller.services()).rejects.toMatchObject({
      response: expect.objectContaining({
        services: expect.objectContaining({
          worker: expect.objectContaining({
            status: "down",
            totalInstances: 2,
            readyInstances: 1,
          }),
        }),
      }),
    });
  });
});
