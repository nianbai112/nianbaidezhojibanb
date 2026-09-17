import { BadRequestException } from '@nestjs/common';

export function normalizeErrandDeliveryRequirements(source: any = {}) {
  let gender = source.rider_gender_requirement ?? 'any';
  const mode = source.handoff_mode ?? 'downstairs';
  const access = source.dorm_access_rule ?? (mode === 'room' ? '' : 'unrestricted');
  if (!['any', 'female', 'male'].includes(gender)) {
    throw new BadRequestException('请选择不限、仅女骑手或仅男骑手');
  }
  if (!['downstairs', 'room'].includes(mode)) {
    throw new BadRequestException('请选择楼下交接或寝室交接');
  }
  if (!['unrestricted', 'female_only', 'male_only', 'no_entry'].includes(access)) {
    throw new BadRequestException('请确认宿舍通行要求');
  }
  if (mode === 'room') {
    if (access === 'no_entry') throw new BadRequestException('该宿舍不允许配送人员入楼，请选择楼下交接');
    const required = access === 'female_only' ? 'female' : access === 'male_only' ? 'male' : 'any';
    if (required !== 'any') {
      if (gender !== 'any' && gender !== required) {
        throw new BadRequestException('骑手性别要求与宿舍通行要求冲突，请调整后下单');
      }
      gender = required;
    }
  }
  return { rider_gender_requirement: gender as string, handoff_mode: mode as string, dorm_access_rule: access as string };
}

export function readErrandDeliveryRequirements(order: any = {}) {
  let remark = order.remark ?? order.remarks ?? {};
  if (typeof remark === 'string') {
    try { remark = JSON.parse(remark); } catch { remark = {}; }
  }
  if (!remark || typeof remark !== 'object' || Array.isArray(remark)) remark = {};
  const source = { ...remark, ...order };
  // Historical orders retain their original agreement; do not relabel them as downstairs delivery.
  if (source.rider_gender_requirement === undefined && source.handoff_mode === undefined) {
    return { rider_gender_requirement: 'any', handoff_mode: '', dorm_access_rule: '' };
  }
  return normalizeErrandDeliveryRequirements(source);
}

export function errandDeliveryRequirementFields(order: any) {
  const requirements = readErrandDeliveryRequirements(order);
  const pickup = ['deliver', 'express_send'].includes(order.type || order.service_type);
  return {
    ...requirements,
    rider_gender_requirement_label: { any: '骑手性别不限', female: '仅女骑手', male: '仅男骑手' }[requirements.rider_gender_requirement],
    handoff_mode_label: requirements.handoff_mode === 'room'
      ? (pickup ? '到寝室取件' : '送到寝室')
      : requirements.handoff_mode === 'downstairs' ? '楼下交接' : '按原订单约定交接',
    dorm_access_rule_label: requirements.handoff_mode === 'downstairs' ? '无需进入宿舍楼'
      : { unrestricted: '允许配送人员入楼', female_only: '仅女性可入楼', male_only: '仅男性可入楼', no_entry: '配送人员不可入楼' }[requirements.dorm_access_rule] || '',
  };
}

export function errandRiderGenderMatches(order: any, profileGender: unknown) {
  const required = readErrandDeliveryRequirements(order).rider_gender_requirement;
  return required === 'any' || (required === 'female' && profileGender === 'FEMALE') || (required === 'male' && profileGender === 'MALE');
}

export async function assertErrandRiderGender(db: any, order: any, userId: string) {
  if (readErrandDeliveryRequirements(order).rider_gender_requirement === 'any') return;
  const profile = await db.userProfile.findUnique({ where: { userId }, select: { gender: true } });
  if (!errandRiderGenderMatches(order, profile?.gender)) {
    throw new BadRequestException('个人资料中的性别不符合该订单要求；未填写性别只能接不限订单');
  }
}

// Call inside the same assignee mutex transaction used by acceptance and transfers.
export async function assertErrandGenderChangeAllowed(tx: any, userId: string, gender: string) {
  const current = await tx.userProfile.findUnique({ where: { userId }, select: { gender: true } });
  if (current?.gender === gender) return;
  const orders = await tx.errandOrder.findMany({
    where: { riderId: userId, status: { in: ['accepted', 'in_progress', 'arrived'] } },
    select: { remark: true },
  });
  if (orders.some((order: any) => !errandRiderGenderMatches(order, gender))) {
    throw new BadRequestException('还有限制骑手性别的订单未完成，暂不能修改为不符合订单要求的性别');
  }
}
