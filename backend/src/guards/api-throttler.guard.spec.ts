import { ApiThrottlerGuard } from "./api-throttler.guard";

describe("ApiThrottlerGuard tracker", () => {
  const tracker = (request: Record<string, any>) =>
    (ApiThrottlerGuard.prototype as any).getTracker(request);

  it("uses forwarded client IP when the direct peer is local Nginx", async () => {
    await expect(
      tracker({
        ip: "127.0.0.1",
        socket: { remoteAddress: "::ffff:127.0.0.1" },
        headers: { "x-forwarded-for": "203.0.113.8, 127.0.0.1" },
      }),
    ).resolves.toBe("203.0.113.8");
  });

  it("ignores spoofed proxy headers from a non-loopback peer", async () => {
    await expect(
      tracker({
        ip: "198.51.100.7",
        socket: { remoteAddress: "198.51.100.7" },
        headers: { "x-forwarded-for": "203.0.113.8" },
      }),
    ).resolves.toBe("198.51.100.7");
  });
});
