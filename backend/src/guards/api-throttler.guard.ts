import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

function firstHeaderValue(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? "")
    .split(",")[0]
    .trim();
}

function isLoopback(address: string): boolean {
  const normalized = address.replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1";
}

/** Trust proxy headers only when the request arrived from the local Nginx. */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const remoteAddress = String(
      req.socket?.remoteAddress || req.connection?.remoteAddress || "",
    );

    if (isLoopback(remoteAddress)) {
      const forwarded = firstHeaderValue(req.headers?.["x-forwarded-for"]);
      const realIp = firstHeaderValue(req.headers?.["x-real-ip"]);
      if (forwarded || realIp) return forwarded || realIp;
    }

    return String(req.ip || remoteAddress || "unknown");
  }
}
