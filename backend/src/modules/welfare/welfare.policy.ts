import { BadRequestException } from '@nestjs/common';
import { randomInt } from 'node:crypto';

export function integer(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new BadRequestException(`${label}须为 ${min} 至 ${max} 的整数`);
  }
  return value;
}

export function dayKey(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

export function maskNickname(value: string) {
  return Array.from(String(value || '同学'))[0] + '**';
}

// Exhausted prizes retain their probability interval. Never silently redistribute odds.
export function instantPrize<T extends { probabilityBps: number; issuedCount: number; quantity: number }>(
  prizes: T[], pick: (max: number) => number = randomInt,
): T | null {
  const roll = pick(10000);
  let boundary = 0;
  for (const prize of prizes) {
    boundary += prize.probabilityBps;
    if (roll < boundary) return prize.issuedCount < prize.quantity ? prize : null;
  }
  return null;
}

// Partial Fisher-Yates: equal chance, without replacement; no sort(Math.random()).
export function choose<T>(pool: T[], count: number, pick: (max: number) => number = randomInt): T[] {
  const copy = [...pool];
  const winners: T[] = [];
  for (let n = 0; n < count && copy.length; n++) {
    const index = pick(copy.length);
    winners.push(copy[index]);
    copy[index] = copy[copy.length - 1];
    copy.pop();
  }
  return winners;
}

export function validateCampaign(input: any, now = new Date()) {
  if (!input || typeof input !== 'object') throw new BadRequestException('请填写活动配置');
  const str = (value: unknown, label: string, max: number, required = false) => {
    if (value != null && typeof value !== 'string') throw new BadRequestException(`${label}格式错误`);
    const text = String(value || '').trim();
    if ((required && !text) || text.length > max) throw new BadRequestException(`请正确填写${label}（不超过${max}字）`);
    return text;
  };
  const date = (value: unknown, label: string) => {
    const parsed = new Date(String(value || ''));
    if (!Number.isFinite(parsed.getTime())) throw new BadRequestException(`请正确填写${label}`);
    return parsed;
  };
  const image = (value: unknown) => {
    const url = str(value, '图片地址', 1000);
    if (url && !/^(https:\/\/[^\s]+|\/(?:uploads|static)\/[^\s]+)$/.test(url)) throw new BadRequestException('请使用 HTTPS 图片或站内上传图片');
    return url || null;
  };
  if (!['instant', 'scheduled'].includes(input.mode)) throw new BadRequestException('请选择抽奖模式');
  const startAt = date(input.startAt, '开始时间');
  const endAt = date(input.endAt, '结束或报名截止时间');
  const drawAt = input.mode === 'scheduled' ? date(input.drawAt, '开奖时间') : null;
  const claimUntil = date(input.claimUntil, '领奖截止时间');
  if (endAt <= startAt || endAt <= now || (drawAt && drawAt < endAt) || claimUntil <= (drawAt || endAt)) {
    throw new BadRequestException('请保证开始 < 截止 ≤ 开奖 < 领奖截止，且活动尚未截止');
  }
  if (!Array.isArray(input.prizes) || !input.prizes.length || input.prizes.length > 12) throw new BadRequestException('请配置 1 至 12 个奖项');
  const prizes = input.prizes.map((p: any, sortOrder: number) => {
    if (!p || !['physical', 'coupon'].includes(p.kind)) throw new BadRequestException('奖品仅支持实物或优惠券');
    return {
      name: str(p.name, '奖品名称', 80, true), image: image(p.image), kind: p.kind,
      couponId: p.kind === 'coupon' ? str(p.couponId, '优惠券 ID', 100, true) : null,
      quantity: integer(p.quantity, '奖品数量', 1, 1000),
      probabilityBps: input.mode === 'instant' ? integer(p.probabilityBps, '概率万分比', 1, 10000) : 0,
      sortOrder,
    };
  });
  if (prizes.reduce((n: number, p: any) => n + p.quantity, 0) > 1000) throw new BadRequestException('单场随机奖品总数不得超过 1000');
  if (prizes.reduce((n: number, p: any) => n + p.probabilityBps, 0) > 10000) throw new BadRequestException('中奖概率合计不得超过 100%');
  for (const key of ['requireStudent', 'memberOnly']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new BadRequestException('参与条件格式错误');
  }
  const pickupLocation = str(input.pickupLocation, '自提地点', 200);
  if (prizes.some((p: any) => p.kind === 'physical') && !pickupLocation) throw new BadRequestException('实物奖品请填写自提地点');
  return {
    title: str(input.title, '活动标题', 80, true), description: str(input.description, '活动说明', 5000, true),
    cover: image(input.cover), mode: input.mode as string, regionId: str(input.regionId, '校区', 100) || null,
    requireStudent: input.requireStudent === true, memberOnly: input.memberOnly === true,
    startAt, endAt, drawAt, claimUntil, pickupLocation: pickupLocation || null,
    contact: str(input.contact, '领取联系方式', 100) || null,
    dailyLimit: input.mode === 'instant' ? integer(input.dailyLimit, '每日次数', 1, 20) : 1,
    totalLimit: input.mode === 'instant' ? integer(input.totalLimit, '总次数', 1, 100) : 1,
    maxEntries: integer(input.maxEntries, '参与上限', 1, 10000), prizes,
  };
}
