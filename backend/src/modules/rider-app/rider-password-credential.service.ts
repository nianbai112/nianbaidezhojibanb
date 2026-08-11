import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { parseRiderPasswordCredentialInput } from "./rider-password-credential.contract";

const PASSWORD_ROUNDS = 12;
const RIDER_PASSWORD_CREDENTIAL_ID = "rider-password-login";
const DEVICE_FIELDS = [
  "model",
  "os",
  "system",
  "platform",
  "appVersion",
] as const;

@Injectable()
export class RiderPasswordCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSafeConfig() {
    const credential = await this.findManagedCredential();
    if (!credential) return { configured: false };
    const { rider, region } = await this.getRiderContext(credential.userId);
    return this.toSafeConfig(credential, rider, region);
  }

  async saveConfig(dto: any, operatorId?: string, ip?: string) {
    const current = await this.findManagedCredential();
    const input = parseRiderPasswordCredentialInput(
      dto,
      Boolean(current?.passwordHash),
    );
    const rider = await this.prisma.regionRider.findFirst({
      where: {
        userId: input.userId,
        verifyStatus: "approved",
        riderType: "official",
        User: { status: "ACTIVE" },
      },
      include: { User: true },
    });
    if (!rider || !String(rider.regionId || "").trim()) {
      throw new BadRequestException("只能绑定已审核且已分配区域的官方骑手");
    }
    const region = await this.prisma.region.findUnique({
      where: { id: rider.regionId },
      select: { id: true, name: true },
    });
    if (!region) throw new BadRequestException("骑手所属区域不存在");

    const passwordChanged = Boolean(input.password);
    const passwordHash = passwordChanged
      ? await bcrypt.hash(input.password!, PASSWORD_ROUNDS)
      : current!.passwordHash;
    const sessionChanged =
      !current ||
      current.id !== RIDER_PASSWORD_CREDENTIAL_ID ||
      passwordChanged ||
      current.userId !== input.userId ||
      current.enabled !== input.enabled;
    const safeData = {
      username: input.username,
      normalizedUsername: input.username,
      userId: input.userId,
      enabled: input.enabled,
      expiresAt: input.expiresAt,
      updatedBy: operatorId,
    };
    const updateData = {
      ...safeData,
      passwordHash,
      ...(passwordChanged ? { passwordChangedAt: new Date() } : {}),
    };
    const saved = current && current.id !== RIDER_PASSWORD_CREDENTIAL_ID
      ? await this.prisma.riderAppPasswordCredential.update({
          where: { id: current.id },
          data: {
            id: RIDER_PASSWORD_CREDENTIAL_ID,
            ...updateData,
            sessionVersion: { increment: 1 },
          },
        })
      : await this.prisma.riderAppPasswordCredential.upsert({
          where: { id: RIDER_PASSWORD_CREDENTIAL_ID },
          create: {
            id: RIDER_PASSWORD_CREDENTIAL_ID,
            ...safeData,
            passwordHash,
            createdBy: operatorId,
          },
          update: {
            ...updateData,
            ...(sessionChanged ? { sessionVersion: { increment: 1 } } : {}),
          },
        });

    if (current && sessionChanged) {
      await this.redis
        .del(`refresh:rider_password:${current.id}`)
        .catch(() => undefined);
    }
    await this.logCredentialChange(
      operatorId,
      current ? "update" : "create",
      saved.id,
      {
        username: saved.username,
        userId: saved.userId,
        enabled: saved.enabled,
        expiresAt:
          saved.expiresAt instanceof Date
            ? saved.expiresAt.toISOString()
            : saved.expiresAt || null,
        passwordChanged,
      },
      ip,
    );
    return this.toSafeConfig(saved, rider, region);
  }

  async resetLock(operatorId?: string, ip?: string) {
    const current = await this.findManagedCredential();
    if (!current) throw new BadRequestException("尚未配置密码登录账号");
    const saved = await this.prisma.riderAppPasswordCredential.update({
      where: { id: current.id },
      data: { failedAttempts: 0, lockedUntil: null, updatedBy: operatorId },
    });
    await this.logCredentialChange(
      operatorId,
      "reset_lock",
      current.id,
      {
        credentialId: current.id,
        action: "reset_lock",
      },
      ip,
    );
    const { rider, region } = await this.getRiderContext(current.userId);
    return this.toSafeConfig(saved, rider, region);
  }

  async listRiderOptions(keyword?: string) {
    const search = String(keyword || "")
      .trim()
      .slice(0, 50);
    const riders = await this.prisma.regionRider.findMany({
      where: {
        verifyStatus: "approved",
        riderType: "official",
        regionId: { not: "" },
        User: { status: "ACTIVE" },
        ...(search
          ? {
              OR: [
                { realName: { contains: search } },
                { phone: { contains: search } },
                { User: { nickname: { contains: search } } },
                { User: { phone: { contains: search } } },
              ],
            }
          : {}),
      },
      include: { User: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const regions = await this.prisma.region.findMany({
      where: {
        id: { in: [...new Set(riders.map((rider) => rider.regionId))] },
      },
      select: { id: true, name: true },
    });
    const regionNames = new Map(
      regions.map((region) => [region.id, region.name]),
    );
    return riders.map((rider) => ({
      userId: rider.userId,
      nickname: rider.User.nickname || rider.realName,
      realName: rider.realName,
      phone: this.maskPhone(rider.phone || rider.User.phone),
      regionId: rider.regionId,
      regionName: regionNames.get(rider.regionId) || "",
    }));
  }

  private async findManagedCredential() {
    const fixed = await this.prisma.riderAppPasswordCredential.findUnique({
      where: { id: RIDER_PASSWORD_CREDENTIAL_ID },
    });
    if (fixed) return fixed;
    return this.prisma.riderAppPasswordCredential.findFirst({
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
        { id: "asc" },
      ],
    });
  }

  private async getRiderContext(userId: string) {
    const rider = await this.prisma.regionRider.findFirst({
      where: { userId },
      include: { User: true },
    });
    const region = rider?.regionId
      ? await this.prisma.region.findUnique({
          where: { id: rider.regionId },
          select: { id: true, name: true },
        })
      : null;
    return { rider, region };
  }

  private toSafeConfig(credential: any, rider: any, region: any) {
    return {
      configured: true,
      username: credential.username,
      userId: credential.userId,
      enabled: credential.enabled,
      expiresAt: credential.expiresAt,
      failedAttempts: credential.failedAttempts,
      lockedUntil: credential.lockedUntil,
      lastLoginAt: credential.lastLoginAt,
      lastLoginIp: credential.lastLoginIp,
      lastLoginDevice: this.sanitizeDevice(credential.lastLoginDevice),
      passwordChangedAt: credential.passwordChangedAt,
      rider: rider
        ? {
            userId: rider.userId,
            nickname: rider.User?.nickname || rider.realName || "",
            realName: rider.realName || "",
            phone: this.maskPhone(rider.phone || rider.User?.phone),
          }
        : null,
      region: region ? { id: region.id, name: region.name } : null,
    };
  }

  private sanitizeDevice(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const source = value as Record<string, unknown>;
    const safe: Record<string, string> = {};
    for (const field of DEVICE_FIELDS) {
      const fieldValue = String(source[field] || "")
        .trim()
        .slice(0, 100);
      if (fieldValue) safe[field] = fieldValue;
    }
    return Object.keys(safe).length ? safe : null;
  }

  private maskPhone(value: unknown) {
    const phone = String(value || "").trim();
    if (!phone) return "";
    if (phone.length <= 7) return "****";
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }

  private async logCredentialChange(
    accountId: string | undefined,
    action: string,
    targetId: string,
    detail: Record<string, unknown>,
    ip?: string,
  ) {
    if (!accountId) return;
    try {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId,
          action: `rider_password_${action}`,
          module: "rider_app",
          targetId,
          targetType: "rider_password_credential",
          detail: detail as Prisma.InputJsonObject,
          ip: ip || "",
        },
      });
    } catch {
      // Credential changes must not fail because an auxiliary audit write failed.
    }
  }
}
