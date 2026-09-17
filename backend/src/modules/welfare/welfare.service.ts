import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WelfareCampaign } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { MembershipService } from '../membership/membership.service';
import { choose, dayKey, instantPrize, maskNickname, validateCampaign } from './welfare.policy';

const includeCampaign = { prizes: { orderBy: { sortOrder: 'asc' as const } }, gifts: true };
const eligibleUser = { status: 'ACTIVE' as const, deletedAt: null, userType: 1, systemRole: null };
type DB = Prisma.TransactionClient;

@Injectable()
export class WelfareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminDataScopeService,
    private readonly access: UserAccessPolicyService,
    private readonly membership: MembershipService,
  ) {}

  private paging(q: any) {
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(q.page) || 1)));
    const size = Math.max(1, Math.min(50, Math.trunc(Number(q.size) || 20)));
    return { page, size, skip: (page - 1) * size };
  }
  private userId(user: any) {
    if (!user?.sub || user.isAdmin) throw new ForbiddenException('请使用小程序用户账号参与');
    return String(user.sub);
  }
  private async strictSuper(accountId: string) {
    const ctx = await this.scope.getAdminContext(accountId);
    return ctx.roleCodes.some(code => String(code).toLowerCase() === 'super_admin');
  }
  private async requireSuper(accountId: string) {
    if (!(await this.strictSuper(accountId))) throw new ForbiddenException('仅超级管理员可设置指定赠送');
  }
  private async adminAccess(accountId: string, regionId: string | null) {
    if (!accountId) throw new ForbiddenException('请登录管理后台');
    const ctx = await this.scope.getAdminContext(accountId);
    if (!ctx.isSuperAdmin && (!regionId || !ctx.regionIds.includes(regionId))) throw new ForbiddenException('无权管理该校区活动');
  }
  private async campaign(id: string, db: DB = this.prisma) {
    const row = await db.welfareCampaign.findUnique({ where: { id }, include: includeCampaign });
    if (!row) throw new NotFoundException('活动不存在');
    return row;
  }
  // All campaign mutations acquire this lock first. The DB unique constraints are
  // the final guard; Redis is not the authority for prizes or user eligibility.
  private async locked(id: string, db: DB) {
    const claimed = await db.welfareCampaign.updateMany({ where: { id }, data: { version: { increment: 1 } } });
    if (claimed.count !== 1) throw new NotFoundException('活动不存在');
    return this.campaign(id, db);
  }
  private async tx<T>(run: (db: DB) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(run, { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 60000 }); }
      catch (error: any) { if (error.code !== 'P2034' || attempt >= 2) throw error; }
    }
  }
  private async audit(db: DB, accountId: string, id: string, action: string, detail: any = {}) {
    await db.adminOperationLog.create({ data: { accountId, module: 'welfare', action, targetId: id, targetType: 'welfare_campaign', detail } });
  }
  private publicView(c: any) {
    return {
      id: c.id, title: c.title, description: c.description, cover: c.cover, mode: c.mode,
      status: c.status, regionId: c.regionId, requireStudent: c.requireStudent, memberOnly: c.memberOnly,
      startAt: c.startAt, endAt: c.endAt, drawAt: c.drawAt, claimUntil: c.claimUntil, drawnAt: c.drawnAt,
      entryCount: c.entryCount, maxEntries: c.maxEntries, dailyLimit: c.dailyLimit, totalLimit: c.totalLimit,
      pickupLocation: c.pickupLocation, contact: c.contact, giftCount: c.gifts.length,
      gifts: c.prizes.map((p: any) => ({ prizeName: p.name, quantity: c.gifts.filter((g: any) => g.prizeId === p.id).length })).filter((g: any) => g.quantity),
      prizes: c.prizes.map((p: any) => ({ id: p.id, name: p.name, image: p.image, kind: p.kind, quantity: p.quantity, probabilityBps: p.probabilityBps,
        remaining: Math.max(0, p.quantity + c.gifts.filter((g: any) => g.prizeId === p.id).length - p.issuedCount) })),
      serverTime: new Date(),
      automaticRules: c.mode === 'instant'
        ? '免费参与。概率按每次抽取计算；奖品耗尽后对应概率计为未中奖，不转移给其他奖品。次数按北京时间每日重置。'
        : '免费报名，每人一次，每人最多获得一个奖品。截止后从符合资格的报名用户中随机抽选；人数不足按实际人数发放。指定赠送单独公示，不占随机名额，指定用户不重复参加随机抽奖。',
    };
  }
  async listPublic(q: any) {
    const { page, size, skip } = this.paging(q);
    const where: Prisma.WelfareCampaignWhereInput = { status: { in: ['published', 'paused', 'finished'] },
      OR: q.regionId ? [{ regionId: String(q.regionId) }, { regionId: null }] : [{ regionId: null }],
      ...(q.mode === 'instant' || q.mode === 'scheduled' ? { mode: q.mode } : {}),
    };
    const [list, total] = await Promise.all([
      this.prisma.welfareCampaign.findMany({ where, include: includeCampaign, orderBy: { createdAt: 'desc' }, skip, take: size }),
      this.prisma.welfareCampaign.count({ where }),
    ]);
    return { list: list.map(c => this.publicView(c)), total, page, size };
  }
  async publicDetail(id: string) {
    const c = await this.campaign(id);
    if (c.status === 'draft') throw new NotFoundException('活动尚未发布');
    return this.publicView(c);
  }
  private ownView(entry: any) {
    const c = entry.campaign;
    return { id: entry.id, campaignId: entry.campaignId, title: c?.title, mode: c?.mode,
      requestKey: entry.requestKey, campaignStatus: c?.status, outcome: entry.outcome, source: entry.source,
      prize: entry.prize ? { name: entry.prize.name, image: entry.prize.image, kind: entry.prize.kind } : null,
      claimStatus: entry.prize?.kind === 'physical' && entry.claimStatus === 'pending' && c?.claimUntil <= new Date() ? 'expired' : entry.claimStatus,
      claimCode: c?.claimUntil > new Date() && entry.claimStatus === 'pending' && entry.prize?.kind === 'physical' ? entry.claimCode : null,
      couponReceiveId: entry.couponReceiveId, deliveryError: entry.deliveryError ? '奖品发放处理中，系统将自动重试' : null,
      drawAt: c?.drawAt, claimUntil: c?.claimUntil, pickupLocation: c?.pickupLocation, contact: c?.contact,
      cover: c?.cover, createdAt: entry.createdAt, serverTime: new Date(),
    };
  }
  async myState(id: string, user: any) {
    const userId = this.userId(user);
    const c = await this.campaign(id);
    if (c.status === 'draft') throw new NotFoundException('活动尚未发布');
    const entries = await this.prisma.welfareEntry.findMany({ where: { campaignId: id, userId }, include: { prize: true, campaign: true }, orderBy: { createdAt: 'desc' } });
    const attempts = entries.filter(e => e.source === 'random');
    const today = attempts.filter(e => e.dayKey === dayKey()).length;
    const gifted = c.gifts.some(g => g.userId === userId);
    return { remaining: c.mode === 'instant' ? Math.max(0, Math.min(c.totalLimit - attempts.length, c.dailyLimit - today)) : entries.length || gifted ? 0 : 1,
      registered: entries.length > 0, gifted, entry: entries[0] ? this.ownView(entries[0]) : null, serverTime: new Date() };
  }
  async mine(user: any, q: any) {
    const userId = this.userId(user), { page, size, skip } = this.paging(q);
    const where: Prisma.WelfareEntryWhereInput = { userId,
      ...(q.tab === 'waiting' ? { outcome: 'waiting' } : q.tab === 'won' ? { outcome: 'won' } : q.tab === 'ended' ? { outcome: { in: ['lost', 'excluded', 'cancelled'] } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.welfareEntry.findMany({ where, include: { prize: true, campaign: true }, orderBy: { createdAt: 'desc' }, take: size, skip }),
      this.prisma.welfareEntry.count({ where }),
    ]);
    return { list: rows.map(e => this.ownView(e)), total, page, size };
  }
  async myEntry(id: string, user: any) {
    const e = await this.prisma.welfareEntry.findFirst({ where: { id, userId: this.userId(user) }, include: { prize: true, campaign: true } });
    if (!e) throw new NotFoundException('参与记录不存在');
    return this.ownView(e);
  }
  async winners(id: string, q: any) {
    await this.publicDetail(id);
    const { page, size, skip } = this.paging(q);
    const where = { campaignId: id, outcome: 'won' };
    const [rows, total] = await Promise.all([
      this.prisma.welfareEntry.findMany({ where, select: { nickname: true, source: true, updatedAt: true, prize: { select: { name: true, image: true } } }, orderBy: { createdAt: 'desc' }, take: size, skip }),
      this.prisma.welfareEntry.count({ where }),
    ]);
    return { list: rows.map(e => ({ nickname: maskNickname(e.nickname), source: e.source, prize: e.prize })), total, page, size };
  }
  private async eligible(db: DB, userId: string, c: WelfareCampaign) {
    const user = await db.user.findFirst({ where: { id: userId, ...eligibleUser }, include: { profile: true, studentVerify: true } });
    if (!user) throw new ForbiddenException('当前账号不能参与活动');
    if (c.regionId && user.profile?.regionId !== c.regionId) throw new ForbiddenException('该活动仅限所属校区用户参与');
    if (c.requireStudent && user.studentVerify?.status !== 'APPROVED') throw new ForbiddenException('请先完成学生认证');
    return user;
  }
  async participate(id: string, user: any, requestKey: unknown) {
    const userId = this.userId(user);
    if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{12,80}$/.test(requestKey)) throw new BadRequestException('请求编号无效，请重新进入活动');
    const initial = await this.campaign(id);
    await this.access.assertStudentProtectedAction(userId, initial.regionId, '参加抽奖');
    const responseId = await this.tx(async db => {
      const c = await this.locked(id, db);
      // Return a committed result before time/limit checks, including network retries after closing.
      const previous = await db.welfareEntry.findFirst({ where: { campaignId: id, userId,
        ...(c.mode === 'scheduled' ? { ordinal: 0 } : { requestKey }) } });
      if (previous) return previous.id;
      const now = new Date();
      if (c.status !== 'published' || now < c.startAt || now >= c.endAt) throw new BadRequestException('当前不在可参与时间内');
      if (c.entryCount >= c.maxEntries) throw new BadRequestException('本场参与名额已满');
      if (c.gifts.some(g => g.userId === userId)) throw new BadRequestException('你已在指定赠送名单中，无需重复报名');
      const profile = await this.eligible(db, userId, c);
      if (c.memberOnly && !(await this.membership.hasBenefit(userId, 'member_only_activity'))) throw new ForbiddenException('本活动仅限有效会员参与');
      const [total, daily] = await Promise.all([
        db.welfareEntry.count({ where: { campaignId: id, userId } }),
        db.welfareEntry.count({ where: { campaignId: id, userId, dayKey: dayKey(now) } }),
      ]);
      if (total >= c.totalLimit || daily >= c.dailyLimit) throw new BadRequestException('可参与次数已用完');
      const e = await db.welfareEntry.create({ data: { campaignId: id, userId, nickname: profile.nickname || '同学', requestKey,
        ordinal: c.mode === 'scheduled' ? 0 : total + 1, dayKey: dayKey(now), outcome: c.mode === 'scheduled' ? 'waiting' : 'lost' } });
      await db.welfareCampaign.update({ where: { id }, data: { entryCount: { increment: 1 } } });
      if (c.mode === 'instant') {
        const prize = instantPrize(c.prizes);
        if (prize) await this.award(db, e.id, prize.id);
        await this.resultNotification(db, e.id, c);
      }
      return e.id;
    });
    return this.myEntry(responseId, user);
  }
  private async award(db: DB, entryId: string, prizeId: string) {
    const p = await db.welfarePrize.update({ where: { id: prizeId }, data: { issuedCount: { increment: 1 } } });
    await db.welfareEntry.update({ where: { id: entryId }, data: { outcome: 'won', prizeId, claimStatus: 'pending',
      claimCode: p.kind === 'physical' ? randomBytes(12).toString('hex').toUpperCase() : null } });
  }
  private async resultNotification(db: DB, entryId: string, c: WelfareCampaign) {
    const entry = await db.welfareEntry.findUniqueOrThrow({ where: { id: entryId }, include: { prize: true } });
    await this.resultNotifications(db, [entry], c);
  }
  private async resultNotifications(db: DB, entries: any[], c: WelfareCampaign) {
    // Bound SQL parameter count and packet size at the maximum 10,000 entrants.
    for (let start = 0; start < entries.length; start += 250) {
      await db.notification.createMany({ data: entries.slice(start, start + 250).map(e => ({
        userId: e.userId, eventKey: `welfare:${e.id}`, regionId: c.regionId, type: 'SYSTEM', scene: 'welfare_draw',
        title: e.source === 'gift' ? '校园赠送奖品已到账' : e.outcome === 'won' ? '恭喜中奖' : e.outcome === 'cancelled' ? '活动已取消' : '抽奖结果已公布',
        content: e.outcome === 'won' ? `「${c.title}」：获得${e.prize?.name}，请查看领取方式。` : `「${c.title}」${e.outcome === 'cancelled' ? '已取消' : '本次未中奖'}，查看你的参与记录。`,
        data: { campaignId: c.id, entryId: e.id, source: e.source, activityName: c.title, prizeName: e.prize?.name || '', result: e.outcome, drawTime: new Date().toISOString() },
        linkType: 'page', linkValue: `/pagesA/welfare/result?id=${e.id}`,
        channelMask: { inApp: true, websocket: true, wechatSubscribe: true, officialAccount: false, push: false },
      })), skipDuplicates: true });
    }
  }
  async adminOptions(accountId: string) {
    const ctx = await this.scope.getAdminContext(accountId);
    const regions = await this.prisma.region.findMany({ where: ctx.isSuperAdmin ? {} : { id: { in: ctx.regionIds } }, select: { id: true, name: true }, take: 500 });
    const coupons = await this.prisma.coupon.findMany({ where: { status: 'active', endAt: { gt: new Date() }, ...(!ctx.isSuperAdmin ? { regionId: { in: ctx.regionIds } } : {}) },
      select: { id: true, name: true, regionId: true, totalCount: true, receivedCount: true, startAt: true, endAt: true }, take: 500, orderBy: { createdAt: 'desc' } });
    return { regions, coupons, canGlobal: ctx.isSuperAdmin };
  }
  async adminCapabilities(accountId: string) { return { canGift: await this.strictSuper(accountId), claimMethod: 'pickup', maxEntries: 10000 }; }
  async adminList(accountId: string, q: any) {
    const ctx = await this.scope.getAdminContext(accountId), { page, size, skip } = this.paging(q);
    const where: Prisma.WelfareCampaignWhereInput = {
      ...(!ctx.isSuperAdmin ? { regionId: { in: ctx.regionIds } } : {}),
      ...(q.status ? { status: String(q.status) } : {}), ...(q.keyword ? { title: { contains: String(q.keyword).slice(0, 80) } } : {}),
    };
    const [list, total] = await Promise.all([
      this.prisma.welfareCampaign.findMany({ where, include: { prizes: true, _count: { select: { gifts: true } } }, take: size, skip, orderBy: { createdAt: 'desc' } }),
      this.prisma.welfareCampaign.count({ where }),
    ]);
    return { list, total, page, size };
  }
  async adminDetail(id: string, accountId: string) {
    const c = await this.campaign(id);
    await this.adminAccess(accountId, c.regionId);
    const canGift = await this.strictSuper(accountId);
    return { ...c, gifts: canGift ? c.gifts : [], giftCount: c.gifts.length,
      giftUsers: canGift ? await this.prisma.user.findMany({ where: { id: { in: c.gifts.map(g => g.userId) } }, select: { id: true, nickname: true, uid: true } }) : [],
      draw: await this.prisma.welfareDraw.findUnique({ where: { campaignId: id } }),
      pendingAwards: await this.prisma.welfareEntry.count({ where: { campaignId: id, outcome: 'won', claimStatus: 'pending', prize: { kind: 'coupon' } } }),
    };
  }
  async save(id: string | null, input: any, accountId: string) {
    const parsed = validateCampaign(input), { prizes, ...data } = parsed;
    await this.adminAccess(accountId, data.regionId);
    if (data.regionId && !(await this.prisma.region.findUnique({ where: { id: data.regionId }, select: { id: true } }))) throw new BadRequestException('校区不存在');
    return this.tx(async db => {
      let savedId = id;
      if (id) {
        const c = await this.locked(id, db);
        await this.adminAccess(accountId, c.regionId);
        if (c.publishedAt || c.status !== 'draft') throw new BadRequestException('已发布活动的规则已锁定');
        if (c.gifts.length) throw new BadRequestException('修改活动前请先在指定赠送中清空名单，保存后重新配置');
        await db.welfarePrize.deleteMany({ where: { campaignId: id } });
        await db.welfareCampaign.update({ where: { id }, data: { ...data, prizes: { create: prizes } } });
      } else {
        const c = await db.welfareCampaign.create({ data: { ...data, createdBy: accountId, prizes: { create: prizes } } });
        savedId = c.id;
      }
      await this.audit(db, accountId, savedId!, 'WELFARE_SAVE', { mode: data.mode });
      return this.campaign(savedId!, db);
    });
  }
  async searchGiftUsers(accountId: string, keyword: string) {
    await this.requireSuper(accountId);
    const key = String(keyword || '').trim().slice(0, 80);
    if (key.length < 2) return { list: [] };
    const n = Number(key);
    const list = await this.prisma.user.findMany({ where: { ...eligibleUser, OR: [{ nickname: { contains: key } },
      ...(Number.isSafeInteger(n) && n > 0 ? [{ uid: n }, { publicUid: n }] : [])] },
      select: { id: true, nickname: true, uid: true, publicUid: true }, take: 20 });
    return { list: list.map(u => ({ id: u.id, nickname: u.nickname, uid: u.publicUid || u.uid })) };
  }
  async setGifts(id: string, gifts: unknown, accountId: string) {
    await this.requireSuper(accountId);
    if (!Array.isArray(gifts) || gifts.length > 50) throw new BadRequestException('指定赠送最多 50 人');
    if (new Set(gifts.map(g => g?.userId)).size !== gifts.length) throw new BadRequestException('指定赠送用户不能重复');
    return this.tx(async db => {
      const c = await this.locked(id, db);
      if (c.status !== 'draft' || c.publishedAt || c.mode !== 'scheduled') throw new BadRequestException('仅定时开奖的未发布草稿可配置指定赠送');
      for (const g of gifts) {
        if (!g || typeof g.userId !== 'string' || typeof g.reason !== 'string' || !g.reason.trim() || g.reason.length > 200 || !c.prizes.some(p => p.id === g.prizeId)) throw new BadRequestException('请正确选择用户、奖品并填写赠送原因');
        await this.eligible(db, g.userId, c);
      }
      await db.welfareGift.deleteMany({ where: { campaignId: id } });
      if (gifts.length) await db.welfareGift.createMany({ data: gifts.map(g => ({ campaignId: id, userId: g.userId, prizeId: g.prizeId, reason: g.reason.trim() })) });
      await this.audit(db, accountId, id, 'WELFARE_GIFTS', { gifts });
      return { saved: gifts.length };
    });
  }
  private async reserveCoupons(db: DB, c: any) {
    // Stable coupon lock order avoids deadlocks when campaigns share coupon types.
    for (const p of [...c.prizes].sort((a: any, b: any) => String(a.couponId).localeCompare(String(b.couponId)))) {
      if (p.kind !== 'coupon') continue;
      await db.coupon.updateMany({ where: { id: p.couponId }, data: { receivedCount: { increment: 0 } } });
      const coupon = await db.coupon.findUnique({ where: { id: p.couponId } });
      const count = p.quantity + c.gifts.filter((g: any) => g.prizeId === p.id).length;
      if (!coupon || coupon.status !== 'active' || coupon.startAt > c.startAt || coupon.endAt < c.claimUntil || (coupon.regionId && coupon.regionId !== c.regionId)) throw new BadRequestException(`「${p.name}」优惠券状态、校区或有效期不满足活动要求`);
      const reserved = await db.coupon.updateMany({ where: { id: coupon.id, receivedCount: { lte: coupon.totalCount - count } }, data: { receivedCount: { increment: count } } });
      if (reserved.count !== 1) throw new BadRequestException(`「${p.name}」优惠券库存不足`);
      await db.welfarePrize.update({ where: { id: p.id }, data: { couponReserved: count } });
    }
  }
  private async releaseUnused(db: DB, c: any) {
    for (const p of [...c.prizes].sort((a: any, b: any) => String(a.couponId).localeCompare(String(b.couponId)))) {
      if (!p.couponId || !p.couponReserved) continue;
      const pending = await db.welfareEntry.count({ where: { prizeId: p.id, outcome: 'won', claimStatus: 'pending' } });
      const release = Math.max(0, p.couponReserved - pending);
      if (!release) continue;
      const updated = await db.coupon.updateMany({ where: { id: p.couponId, receivedCount: { gte: release } }, data: { receivedCount: { decrement: release } } });
      if (updated.count !== 1) throw new BadRequestException('优惠券预留库存异常，请核对库存');
      await db.welfarePrize.update({ where: { id: p.id }, data: { couponReserved: { decrement: release } } });
    }
  }
  async transition(id: string, action: string, accountId: string) {
    if (!['publish', 'pause', 'resume', 'cancel', 'finish', 'retry'].includes(action)) throw new BadRequestException('操作不存在');
    return this.tx(async db => {
      const c = await this.locked(id, db);
      await this.adminAccess(accountId, c.regionId);
      const now = new Date();
      let status = c.status;
      if (action === 'publish') {
        if (c.status !== 'draft' || c.publishedAt) throw new BadRequestException('活动已发布');
        validateCampaign({ ...c, prizes: c.prizes });
        for (const g of c.gifts) await this.eligible(db, g.userId, c);
        await this.reserveCoupons(db, c);
        status = 'published';
      } else if (action === 'pause' || action === 'resume') {
        if (c.status !== (action === 'pause' ? 'published' : 'paused') || now >= c.endAt) throw new BadRequestException('活动当前不能执行该操作');
        status = action === 'pause' ? 'paused' : 'published';
      } else if (action === 'cancel') {
        if (c.mode !== 'scheduled' || !['published', 'paused'].includes(c.status) || now >= c.endAt) throw new BadRequestException('仅报名截止前可取消定时活动');
        status = 'cancelled';
        await db.welfareEntry.updateMany({ where: { campaignId: id, outcome: 'waiting' }, data: { outcome: 'cancelled' } });
        const entries = await db.welfareEntry.findMany({ where: { campaignId: id }, include: { prize: true } });
        await this.resultNotifications(db, entries, c);
        await this.releaseUnused(db, c);
      } else if (action === 'finish') {
        if (c.mode !== 'instant' || !['published', 'paused'].includes(c.status)) throw new BadRequestException('仅即时活动可提前结束');
        status = 'finished';
        await this.releaseUnused(db, c);
      } else {
        if (!c.publishedAt) throw new BadRequestException('草稿不能重试');
        // Retry schedules existing work. It never deletes a draw or redraws winners.
      }
      await db.welfareCampaign.update({ where: { id }, data: { status, lastError: null, ...(action === 'publish' ? { publishedAt: now } : {}) } });
      await this.audit(db, accountId, id, `WELFARE_${action.toUpperCase()}`, { previousStatus: c.status, status });
      return { id, status };
    });
  }
  async drawScheduled(id: string) {
    return this.tx(async db => {
      const c = await this.locked(id, db), now = new Date();
      if (c.mode !== 'scheduled' || !['published', 'paused'].includes(c.status) || !c.drawAt || c.drawAt > now || c.drawnAt) return false;
      const entries = await db.welfareEntry.findMany({ where: { campaignId: id, outcome: 'waiting' }, orderBy: { id: 'asc' } });
      const ids = [...new Set([...entries.map(e => e.userId), ...c.gifts.map(g => g?.userId)])];
      const users = ids.length ? await db.user.findMany({ where: { id: { in: ids }, ...eligibleUser }, select: { id: true, nickname: true } }) : [];
      // Qualification is snapshotted on entry; account bans/deletion are checked again at draw.
      const valid = new Map(users.map(u => [u.id, u]));
      const giftIds = new Set(c.gifts.map(g => g?.userId));
      let pool = entries.filter(e => valid.has(e.userId) && !giftIds.has(e.userId));
      const candidateCount = pool.length;
      await db.welfareEntry.updateMany({ where: { campaignId: id, outcome: 'waiting' }, data: { outcome: 'lost' } });
      const excluded = entries.filter(e => !valid.has(e.userId));
      if (excluded.length) await db.welfareEntry.updateMany({ where: { id: { in: excluded.map(e => e.id) } }, data: { outcome: 'excluded' } });
      let randomWinners = 0, giftedCount = 0;
      for (const p of c.prizes) {
        const winners = choose(pool, p.quantity), selected = new Set(winners.map(e => e.id));
        for (const e of winners) await this.award(db, e.id, p.id);
        randomWinners += winners.length;
        pool = pool.filter(e => !selected.has(e.id));
      }
      for (const g of c.gifts) {
        const profile = valid.get(g.userId);
        if (!profile) { await db.welfareGift.update({ where: { id: g.id }, data: { status: 'skipped' } }); continue; }
        const entry = await db.welfareEntry.upsert({ where: { campaignId_userId_ordinal: { campaignId: id, userId: g.userId, ordinal: 0 } },
          update: { source: 'gift' }, create: { campaignId: id, userId: g.userId, nickname: profile.nickname || '同学', requestKey: `gift_${g.id}`, ordinal: 0, dayKey: dayKey(now), source: 'gift' } });
        await this.award(db, entry.id, g.prizeId);
        await db.welfareGift.update({ where: { id: g.id }, data: { status: 'awarded' } });
        giftedCount++;
      }
      await db.welfareDraw.create({ data: { campaignId: id, candidateCount, randomWinners, giftedCount,
        rules: { version: 1, mode: c.mode, endAt: c.endAt.toISOString(), drawAt: c.drawAt.toISOString(),
          prizes: c.prizes.map(p => ({ id: p.id, quantity: p.quantity })), giftCount: c.gifts.length } } });
      await db.welfareCampaign.update({ where: { id }, data: { status: 'finished', drawnAt: now, lastError: null } });
      await this.releaseUnused(db, await this.campaign(id, db));
      // Persist notifications in the same commit. Delivery is an independent worker concern.
      const results = await db.welfareEntry.findMany({ where: { campaignId: id, outcome: { in: ['won', 'lost'] } }, include: { prize: true } });
      await this.resultNotifications(db, results, c);
      return { randomWinners, giftedCount, candidateCount };
    });
  }
  async deliverCoupon(entryId: string) {
    const initial = await this.prisma.welfareEntry.findUnique({ where: { id: entryId } });
    if (!initial) return;
    return this.tx(async db => {
      await this.locked(initial.campaignId, db);
      const e = await db.welfareEntry.findUniqueOrThrow({ where: { id: entryId }, include: { prize: true } });
      if (e.outcome !== 'won' || e.claimStatus !== 'pending' || e.prize?.kind !== 'coupon' || !e.prize.couponId) return;
      if (e.prize.couponReserved < 1) throw new BadRequestException('奖品券预留库存不足');
      const coupon = await db.coupon.findUnique({ where: { id: e.prize.couponId } });
      if (!coupon || coupon.status !== 'active' || coupon.endAt <= new Date()) throw new BadRequestException('奖品券停用或过期，请运营处理');
      // Publication already reserved inventory. Issuing must not decrement it a second time.
      const receipt = await db.couponReceive.create({ data: { userId: e.userId, couponId: coupon.id, status: 'unused' } });
      await db.welfarePrize.update({ where: { id: e.prize.id }, data: { couponReserved: { decrement: 1 } } });
      await db.welfareEntry.update({ where: { id: e.id }, data: { claimStatus: 'delivered', couponReceiveId: receipt.id, deliveryError: null } });
    });
  }
  async sweep() {
    const now = new Date();
    const campaigns = await this.prisma.welfareCampaign.findMany({ where: { status: { in: ['published', 'paused'] },
      OR: [{ mode: 'scheduled', drawAt: { lte: now } }, { mode: 'instant', endAt: { lte: now } }] }, take: 20, orderBy: { updatedAt: 'asc' } });
    for (const c of campaigns) {
      try {
        if (c.mode === 'scheduled') await this.drawScheduled(c.id);
        else await this.tx(async db => { const locked = await this.locked(c.id, db); if (!['published', 'paused'].includes(locked.status)) return;
          await this.releaseUnused(db, locked); await db.welfareCampaign.update({ where: { id: c.id }, data: { status: 'finished' } }); });
      } catch (error: any) {
        await this.prisma.welfareCampaign.update({ where: { id: c.id }, data: { lastError: String(error.message || error).slice(0, 1000) } });
      }
    }
    const pending = await this.prisma.welfareEntry.findMany({ where: { outcome: 'won', claimStatus: 'pending', prize: { kind: 'coupon' } }, select: { id: true }, take: 100, orderBy: { updatedAt: 'asc' } });
    for (const e of pending) {
      try { await this.deliverCoupon(e.id); }
      catch (error: any) { await this.prisma.welfareEntry.update({ where: { id: e.id }, data: { deliveryError: String(error.message || error).slice(0, 1000) } }); }
    }
    return { campaigns: campaigns.length, deliveries: pending.length };
  }
  async redeem(code: unknown, accountId: string) {
    if (typeof code !== 'string' || !/^[A-F0-9]{24}$/.test(code.trim().toUpperCase())) throw new BadRequestException('请输入完整领取码');
    const e = await this.prisma.welfareEntry.findUnique({ where: { claimCode: code.trim().toUpperCase() }, include: { campaign: true } });
    if (!e) throw new NotFoundException('领取码不存在');
    await this.adminAccess(accountId, e.campaign.regionId);
    return this.tx(async db => {
      const c = await this.locked(e.campaignId, db);
      if (c.claimUntil <= new Date()) throw new BadRequestException('领奖期限已过');
      const updated = await db.welfareEntry.updateMany({ where: { id: e.id, outcome: 'won', claimStatus: 'pending', prize: { kind: 'physical' } }, data: { claimStatus: 'redeemed', redeemedAt: new Date(), redeemedBy: accountId } });
      if (updated.count !== 1) throw new BadRequestException('奖品已核销，请勿重复发放');
      await this.audit(db, accountId, c.id, 'WELFARE_REDEEM', { entryId: e.id });
      return { redeemed: true, entryId: e.id };
    });
  }
  async adminEntries(id: string, accountId: string, q: any) {
    const c = await this.campaign(id); await this.adminAccess(accountId, c.regionId);
    const { page, size, skip } = this.paging(q);
    const where = { campaignId: id, ...(q.outcome ? { outcome: String(q.outcome) } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.welfareEntry.findMany({ where, include: { prize: true }, orderBy: { createdAt: 'desc' }, take: size, skip }),
      this.prisma.welfareEntry.count({ where }),
    ]);
    return { list: rows.map(({ claimCode, requestKey, ...e }) => e), total, page, size };
  }
  async adminLogs(id: string, accountId: string) {
    const c = await this.campaign(id); await this.adminAccess(accountId, c.regionId);
    const list = await this.prisma.adminOperationLog.findMany({ where: { module: 'welfare', targetId: id }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, action: true, accountId: true, createdAt: true } });
    return { list };
  }
}
