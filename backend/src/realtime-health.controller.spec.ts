import { ServiceUnavailableException } from "@nestjs/common";
import { RealtimeHealthController } from "./realtime-health.controller";

describe("RealtimeHealthController", () => {
  const config = {
    get: jest.fn((key: string) => (key === "DB_IS_INSTALLED" ? "1" : "false")),
  } as any;
  const redis = {
    getClient: () => ({ ping: jest.fn().mockResolvedValue("PONG") }),
  } as any;

  it("requires the native server and both Redis subscribers in runtime mode", async () => {
    const controller = new RealtimeHealthController(
      redis,
      config,
      { isAttached: () => true, isPushSubscriberReady: () => true } as any,
      { isSubscribed: () => true } as any,
      {
        getStatus: () => ({ ready: true, applied: true }),
      } as any,
    );

    await expect(controller.health()).resolves.toEqual(
      expect.objectContaining({ status: "ok", mode: "runtime" }),
    );
  });

  it("fails when the push subscriber is not ready", async () => {
    const controller = new RealtimeHealthController(
      redis,
      config,
      { isAttached: () => true, isPushSubscriberReady: () => false } as any,
      { isSubscribed: () => true } as any,
      {
        getStatus: () => ({ ready: true, applied: true }),
      } as any,
    );

    await expect(controller.health()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("fails when the Socket.IO Redis adapter is not ready", async () => {
    const controller = new RealtimeHealthController(
      redis,
      config,
      { isAttached: () => true, isPushSubscriberReady: () => true } as any,
      { isSubscribed: () => true } as any,
      {
        getStatus: () => ({ ready: false, applied: false }),
      } as any,
    );

    await expect(controller.health()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
