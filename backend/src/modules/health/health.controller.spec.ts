import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";

describe("HealthController service readiness", () => {
  const runtimeConfig = {
    get: jest.fn((key: string) => (key === "DB_IS_INSTALLED" ? "1" : "false")),
  } as any;

  it("reports all three services ready only with fresh runtime heartbeats", async () => {
    const updatedAt = new Date().toISOString();
    const redis = {
      getJson: jest.fn((key: string) =>
        Promise.resolve({
          service: key.includes("worker") ? "worker" : "realtime",
          instanceId: key,
          mode: "runtime",
          ready: true,
          updatedAt,
        }),
      ),
    } as any;
    const controller = new HealthController(redis, runtimeConfig);

    await expect(controller.services()).resolves.toEqual(
      expect.objectContaining({
        status: "ok",
        services: expect.objectContaining({
          worker: expect.objectContaining({ status: "up" }),
          realtime: expect.objectContaining({ status: "up" }),
        }),
      }),
    );
  });

  it("rejects a stale setup-mode Realtime process after installation", async () => {
    const redis = {
      getJson: jest.fn((key: string) =>
        Promise.resolve({
          mode: key.includes("realtime") ? "setup" : "runtime",
          ready: true,
          updatedAt: new Date().toISOString(),
        }),
      ),
    } as any;
    const controller = new HealthController(redis, runtimeConfig);

    await expect(controller.services()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
