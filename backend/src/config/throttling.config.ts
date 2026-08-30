import { ExecutionContext } from "@nestjs/common";
import { ThrottlerOptions } from "@nestjs/throttler";

export const SPECIALIZED_THROTTLER_NAMES = [
  "auth",
  "admin_auth",
  "upload_user",
  "upload_user_batch",
  "upload_video",
  "upload_admin_image",
  "upload_admin_video",
  "upload_qrcode",
] as const;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Named throttlers are opt-in: they only run on handlers/classes carrying a
 * matching @Throttle({ name: ... }) decorator. Without this guard every named
 * definition would also run globally and the strictest limit would win.
 */
export function skipUnlessThrottleConfigured(name: string) {
  return (context: ExecutionContext): boolean => {
    const metadataKey = `THROTTLER:LIMIT${name}`;
    return !(
      Reflect.hasMetadata(metadataKey, context.getHandler()) ||
      Reflect.hasMetadata(metadataKey, context.getClass())
    );
  };
}

export function createThrottlerDefinitions(
  env: NodeJS.ProcessEnv = process.env,
): ThrottlerOptions[] {
  const ttlMs = positiveInteger(env.THROTTLE_TTL, 60) * 1000;
  const specialized = (
    name: (typeof SPECIALIZED_THROTTLER_NAMES)[number],
    envName: string,
    fallback: number,
  ): ThrottlerOptions => ({
    name,
    ttl: ttlMs,
    limit: positiveInteger(env[envName], fallback),
    skipIf: skipUnlessThrottleConfigured(name),
  });

  return [
    {
      name: "default",
      ttl: ttlMs,
      limit: positiveInteger(env.THROTTLE_LIMIT, 100),
    },
    specialized("auth", "AUTH_THROTTLE_LIMIT", 5),
    specialized("admin_auth", "ADMIN_AUTH_THROTTLE_LIMIT", 30),
    specialized("upload_user", "UPLOAD_USER_THROTTLE_LIMIT", 180),
    specialized("upload_user_batch", "UPLOAD_BATCH_THROTTLE_LIMIT", 30),
    specialized("upload_video", "UPLOAD_VIDEO_THROTTLE_LIMIT", 20),
    specialized("upload_admin_image", "UPLOAD_ADMIN_IMAGE_THROTTLE_LIMIT", 180),
    specialized("upload_admin_video", "UPLOAD_ADMIN_VIDEO_THROTTLE_LIMIT", 20),
    specialized("upload_qrcode", "UPLOAD_QRCODE_THROTTLE_LIMIT", 60),
  ];
}
