import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { PrismaService } from "../../common/services/prisma.service";
import { AdminDataScopeService } from "../../common/services/admin-data-scope.service";
import {
  authenticateCheckinToken,
  checkinAvailable,
  createCheckinToken,
  readCheckinToken,
  validateCheckinSession,
} from "./welfare-checkin.policy";

type DB = Prisma.TransactionClient;
const activeUser = {
  status: "ACTIVE" as const,
  deletedAt: null,
  userType: 1,
  systemRole: null,
};
const sessionInclude = {
  staff: {
    include: { user: { select: { id: true, uid: true, nickname: true } } },
  },
  _count: { select: { records: true } },
};
export const checkinSessionSelect = {
  id: true,
  title: true,
  regionId: true,
  location: true,
  startAt: true,
  endAt: true,
  allowStaffScan: true,
  allowSelfScan: true,
  status: true,
} as const;
@Injectable()
export class WelfareCheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminDataScopeService,
  ) {}
  private userId(user: any) {
    if (!user?.sub || user.isAdmin)
      throw new ForbiddenException("请使用小程序账号签到");
    return String(user.sub);
  }
  private async adminScope(accountId: string, regionId?: string | null) {
    if (!accountId) throw new ForbiddenException("请登录管理后台");
    const ctx = await this.scope.getAdminContext(accountId);
    if (
      regionId !== undefined &&
      !ctx.isSuperAdmin &&
      (!regionId || !ctx.regionIds.includes(regionId))
    )
      throw new ForbiddenException("无权管理该校区签到");
    return ctx;
  }
  private async session(id: string, db: DB = this.prisma) {
    const row = await db.welfareCheckinSession.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("签到场次不存在");
    return row;
  }
  private publicView(row: any) {
    return Object.fromEntries(
      Object.keys(checkinSessionSelect).map((key) => [key, row[key]]),
    );
  }
  private async locked(id: string, db: DB) {
    const locked = await db.welfareCheckinSession.updateMany({
      where: { id },
      data: { version: { increment: 1 } },
    });
    if (!locked.count) throw new NotFoundException("签到场次不存在");
    return this.session(id, db);
  }
  private async participant(db: DB, userId: string, regionId?: string | null) {
    const user = await db.user.findFirst({
      where: { id: userId, ...activeUser },
      include: { profile: true },
    });
    if (!user) throw new ForbiddenException("当前账号不能签到");
    if (regionId && user.profile?.regionId !== regionId)
      throw new ForbiddenException("该签到仅限所属校区用户");
    return user;
  }
  private async staff(db: DB, sessionId: string, userId: string) {
    await this.participant(db, userId);
    const row = await db.welfareCheckinStaff.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!row) throw new ForbiddenException("你不是本场指定工作人员");
  }
  private record(db: DB, sessionId: string, userId: string) {
    return db.welfareCheckinRecord.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
  }
  private async audit(db: DB, accountId: string, id: string, action: string) {
    await db.adminOperationLog.create({
      data: {
        accountId,
        module: "welfare",
        action,
        targetId: id,
        targetType: "welfare_checkin_session",
      },
    });
  }
  async adminList(accountId: string, q: any = {}) {
    const ctx = await this.adminScope(accountId);
    const page = Math.max(1, Math.trunc(Number(q.page) || 1)),
      size = 50;
    const where = {
      ...(!ctx.isSuperAdmin ? { regionId: { in: ctx.regionIds } } : {}),
      ...(q.keyword
        ? { title: { contains: String(q.keyword).slice(0, 80) } }
        : {}),
    };
    const [list, total] = await Promise.all([
      this.prisma.welfareCheckinSession.findMany({
        where,
        include: sessionInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.welfareCheckinSession.count({ where }),
    ]);
    return {
      list: list.map((row) => ({
        ...this.publicView(row),
        staff: row.staff,
        recordCount: row._count.records,
      })),
      total,
      page,
      size,
    };
  }
  async adminDetail(id: string, accountId: string) {
    const row = await this.prisma.welfareCheckinSession.findUnique({
      where: { id },
      include: sessionInclude,
    });
    if (!row) throw new NotFoundException("签到场次不存在");
    await this.adminScope(accountId, row.regionId);
    const used = await this.prisma.welfareCampaign.count({
      where: { checkinSessionId: id, publishedAt: { not: null } },
    });
    return {
      ...this.publicView(row),
      staff: row.staff,
      recordCount: row._count.records,
      locked: !!used || row._count.records > 0,
    };
  }
  async save(id: string | null, input: any, accountId: string) {
    const { staffUserIds, ...data } = validateCheckinSession(input);
    await this.adminScope(accountId, data.regionId);
    return this.prisma.$transaction(
      async (db) => {
        if (id) {
          const old = await this.locked(id, db);
          await this.adminScope(accountId, old.regionId);
          if (
            (await db.welfareCheckinRecord.count({
              where: { sessionId: id },
            })) ||
            (await db.welfareCampaign.count({
              where: { checkinSessionId: id, publishedAt: { not: null } },
            }))
          )
            throw new BadRequestException(
              "已有签到记录或关联已发布抽奖，场次配置已锁定",
            );
        }
        if (
          data.regionId &&
          !(await db.region.findUnique({
            where: { id: data.regionId },
            select: { id: true },
          }))
        )
          throw new BadRequestException("校区不存在");
        const staff = await db.user.findMany({
          where: { id: { in: staffUserIds }, ...activeUser },
          select: { id: true },
        });
        if (staff.length !== staffUserIds.length)
          throw new BadRequestException("工作人员须为有效的小程序用户");
        const staffData = {
          create: staffUserIds.map((userId) => ({ userId })),
        };
        if (id)
          await db.welfareCheckinStaff.deleteMany({ where: { sessionId: id } });
        const row = id
          ? await db.welfareCheckinSession.update({
              where: { id },
              data: {
                ...data,
                qrSecret: randomBytes(32).toString("hex"),
                staff: staffData,
              },
            })
          : await db.welfareCheckinSession.create({
              data: {
                ...data,
                createdBy: accountId,
                qrSecret: randomBytes(32).toString("hex"),
                staff: staffData,
              },
            });
        await this.audit(db, accountId, row.id, "WELFARE_CHECKIN_SAVE");
        return { id: row.id };
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  async setStatus(id: string, accountId: string, status: unknown) {
    if (!["active", "paused"].includes(String(status)))
      throw new BadRequestException("签到状态不正确");
    return this.prisma.$transaction(async (db) => {
      const row = await this.locked(id, db);
      await this.adminScope(accountId, row.regionId);
      await db.welfareCheckinSession.update({
        where: { id },
        data: {
          status: String(status),
          qrSecret: randomBytes(32).toString("hex"),
        },
      });
      await this.audit(
        db,
        accountId,
        id,
        status === "active"
          ? "WELFARE_CHECKIN_RESUME"
          : "WELFARE_CHECKIN_PAUSE",
      );
      return { id, status };
    });
  }
  async records(id: string, accountId: string, q: any) {
    const session = await this.session(id);
    await this.adminScope(accountId, session.regionId);
    const page = Math.max(1, Math.trunc(Number(q.page) || 1)),
      size = 50;
    const [list, total] = await Promise.all([
      this.prisma.welfareCheckinRecord.findMany({
        where: { sessionId: id },
        include: { user: { select: { uid: true, nickname: true } } },
        orderBy: { signedAt: "desc" },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.welfareCheckinRecord.count({ where: { sessionId: id } }),
    ]);
    const operatorIds = [
      ...new Set(
        list.map((row) => row.verifiedBy).filter((id): id is string => !!id),
      ),
    ];
    const operators = operatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, uid: true, nickname: true },
        })
      : [];
    return {
      list: list.map((row) => ({
        ...row,
        operator: operators.find((user) => user.id === row.verifiedBy) || null,
      })),
      total,
      page,
      size,
    };
  }
  async publicCode(id: string, accountId: string) {
    const session = await this.session(id);
    await this.adminScope(accountId, session.regionId);
    checkinAvailable(session);
    if (!session.allowSelfScan)
      throw new BadRequestException("本场未开启自行扫码签到");
    return this.qr(session, "self");
  }
  private async qr(session: any, kind: "staff" | "self", userId?: string) {
    const signed = createCheckinToken(session, kind, userId);
    return {
      ...signed,
      image: await QRCode.toDataURL("WFCI1:" + signed.token, {
        width: 640,
        margin: 2,
        errorCorrectionLevel: "M",
      }),
    };
  }
  async myState(id: string, user: any) {
    const userId = this.userId(user),
      session = await this.session(id);
    await this.participant(this.prisma, userId, session.regionId);
    const record = await this.record(this.prisma, id, userId);
    return {
      session: this.publicView(session),
      record: record
        ? { signedAt: record.signedAt, source: record.source }
        : null,
      serverTime: new Date(),
    };
  }
  async personalCode(id: string, user: any) {
    const userId = this.userId(user),
      session = await this.session(id);
    await this.participant(this.prisma, userId, session.regionId);
    if (await this.record(this.prisma, id, userId)) return { signed: true };
    checkinAvailable(session);
    if (!session.allowStaffScan)
      throw new BadRequestException("本场未开启工作人员扫码签到");
    return this.qr(session, "staff", userId);
  }
  private async context(db: DB, token: unknown, user: any, lock: boolean) {
    const actor = this.userId(user),
      hint = readCheckinToken(token).payload;
    const session = lock
      ? await this.locked(hint.s, db)
      : await this.session(hint.s, db);
    const signed = authenticateCheckinToken(token, session.qrSecret);
    const userId = signed.k === "staff" ? signed.u! : actor;
    if (signed.k === "staff") {
      await this.staff(db, session.id, actor);
      if (actor === userId)
        throw new ForbiddenException("请由其他指定工作人员核对并为你签到");
    }
    const participant = await this.participant(db, userId, session.regionId);
    const existing = await this.record(db, session.id, userId);
    if (!existing) {
      checkinAvailable(session);
      if (
        (signed.k === "staff" && !session.allowStaffScan) ||
        (signed.k === "self" && !session.allowSelfScan)
      )
        throw new BadRequestException("该签到方式已关闭");
      if (signed.e <= Date.now())
        throw new BadRequestException("签到码已过期，请扫描最新二维码");
    }
    return { session, signed, userId, actor, participant, existing };
  }
  async preview(token: unknown, user: any) {
    const ctx = await this.context(this.prisma, token, user, false);
    return {
      session: this.publicView(ctx.session),
      source: ctx.signed.k,
      participant: {
        nickname: ctx.participant.nickname,
        avatar: ctx.participant.avatar,
        uid: ctx.participant.publicUid || ctx.participant.uid,
      },
      signedAt: ctx.existing?.signedAt || null,
      expiresAt: new Date(ctx.signed.e),
      serverTime: new Date(),
    };
  }
  async confirm(token: unknown, user: any) {
    return this.prisma.$transaction(
      async (db) => {
        const ctx = await this.context(db, token, user, true);
        if (ctx.existing)
          return {
            signed: true,
            duplicate: true,
            sessionId: ctx.session.id,
            signedAt: ctx.existing.signedAt,
          };
        const record = await db.welfareCheckinRecord.create({
          data: {
            sessionId: ctx.session.id,
            userId: ctx.userId,
            source: ctx.signed.k,
            verifiedBy: ctx.signed.k === "staff" ? ctx.actor : null,
          },
        });
        return {
          signed: true,
          duplicate: false,
          sessionId: ctx.session.id,
          signedAt: record.signedAt,
        };
      },
      { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 },
    );
  }
}
