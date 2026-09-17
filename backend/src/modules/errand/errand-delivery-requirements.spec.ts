import { assertErrandGenderChangeAllowed, assertErrandRiderGender, errandDeliveryRequirementFields, errandRiderGenderMatches, normalizeErrandDeliveryRequirements } from './errand-delivery-requirements';
import { ErrandService } from './errand.service';
import { enforceErrandAssignmentGuard } from './errand-assignment-guard';

describe('errand dormitory handoff and rider gender', () => {
  const femaleOrder = { remark: JSON.stringify({ rider_gender_requirement: 'female', handoff_mode: 'room', dorm_access_rule: 'female_only' }) };

  it.each(['MALE', 'FEMALE'])('lets a %s publisher request either rider gender', (publisherGender) => {
    for (const gender of ['any', 'female', 'male']) {
      expect(normalizeErrandDeliveryRequirements({ gender: publisherGender, rider_gender_requirement: gender }).rider_gender_requirement).toBe(gender);
    }
  });

  it('derives the restriction from room access and rejects contradictory or forbidden entry', () => {
    expect(normalizeErrandDeliveryRequirements({ handoff_mode: 'room', dorm_access_rule: 'female_only' }).rider_gender_requirement).toBe('female');
    expect(() => normalizeErrandDeliveryRequirements({ handoff_mode: 'room' })).toThrow('通行要求');
    expect(() => normalizeErrandDeliveryRequirements({ handoff_mode: 'room', dorm_access_rule: 'no_entry' })).toThrow('楼下交接');
    expect(() => normalizeErrandDeliveryRequirements({ handoff_mode: 'room', dorm_access_rule: 'female_only', rider_gender_requirement: 'male' })).toThrow('冲突');
    expect(() => normalizeErrandDeliveryRequirements({ rider_gender_requirement: 'anything' })).toThrow('请选择');
  });

  it.each(['MALE', 'UNKNOWN', undefined])('rejects %s for female-only orders', async (gender) => {
    const db = { userProfile: { findUnique: jest.fn().mockResolvedValue({ gender }) } };
    expect(errandRiderGenderMatches(femaleOrder, gender)).toBe(false);
    await expect(assertErrandRiderGender(db, femaleOrder, 'rider')).rejects.toThrow('不符合');
  });

  it.each([['female', 'FEMALE', 'MALE'], ['male', 'MALE', 'FEMALE']])('enforces the %s requirement in both directions', (required, allowed, denied) => {
    const order = { remark: JSON.stringify({ rider_gender_requirement: required, handoff_mode: 'room', dorm_access_rule: required + '_only' }) };
    expect(errandRiderGenderMatches(order, allowed)).toBe(true);
    expect(errandRiderGenderMatches(order, denied)).toBe(false);
    expect(errandRiderGenderMatches(order, 'UNKNOWN')).toBe(false);
  });

  it('allows matching riders and keeps historical agreements intact', async () => {
    await expect(assertErrandRiderGender({ userProfile: { findUnique: async () => ({ gender: 'FEMALE' }) } }, femaleOrder, 'rider')).resolves.toBeUndefined();
    expect(errandDeliveryRequirementFields({ remark: '旧订单备注' })).toMatchObject({ rider_gender_requirement: 'any', handoff_mode: '', handoff_mode_label: '按原订单约定交接' });
    expect(errandDeliveryRequirementFields({ ...femaleOrder, type: 'deliver' }).handoff_mode_label).toBe('到寝室取件');
  });

  it('blocks a legacy unpaid positive-value order even if its status says pending_accept', async () => {
    const order = { userId: 'publisher', status: 'pending_accept', payAmount: 8, payTime: null };
    await expect(enforceErrandAssignmentGuard({}, order, 'rider', '直接接单')).rejects.toThrow('尚未确认付款');
    await expect(enforceErrandAssignmentGuard({}, { ...order, payTime: new Date() }, 'rider', '直接接单')).resolves.toMatchObject({ allowed: true });
  });

  it('rejects an incompatible direct acceptance before changing the order', async () => {
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = {
      errandOrder: { findUnique: async () => ({ ...femaleOrder, id: 'order-1', userId: 'publisher', status: 'pending_accept', riderId: null }) },
      userProfile: { findUnique: async () => ({ gender: 'MALE' }) },
      $transaction: jest.fn(),
    };
    await expect(service.acceptOrderUnlocked('order-1', 'male-rider')).rejects.toThrow('不符合');
    expect(service.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not create transfer requests for refunding orders', async () => {
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = {
      errandOrder: { findUnique: async () => ({ id: 'order-1', riderId: 'rider', status: 'accepted', refundStatus: 'refunding' }) },
      regionRider: { findFirst: jest.fn() },
    };
    await expect(service.requestTransfer('order-1', 'rider', { target_rider_id: 'target' })).rejects.toThrow('退款处理中');
    expect(service.prisma.regionRider.findFirst).not.toHaveBeenCalled();
  });

  it('prevents profile changes from invalidating an active assignment', async () => {
    const tx = { userProfile: { findUnique: async () => ({ gender: 'FEMALE' }) }, errandOrder: { findMany: jest.fn().mockResolvedValue([femaleOrder]) } };
    await expect(assertErrandGenderChangeAllowed(tx, 'rider', 'MALE')).rejects.toThrow('未完成');
    await expect(assertErrandGenderChangeAllowed(tx, 'rider', 'FEMALE')).resolves.toBeUndefined();
    expect(tx.errandOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { riderId: 'rider', status: { in: ['accepted', 'in_progress', 'arrived'] } } }));
  });

  it('preserves requirements even when the order remark uses its compact fallback', () => {
    const service: any = Object.create(ErrandService.prototype);
    const remark = service.buildMiniOrderRemark({ handoff_mode: 'room', dorm_access_rule: 'male_only', rider_gender_requirement: 'male' }, [{ description: '长描述'.repeat(100) }], {});
    expect(JSON.parse(remark)).toMatchObject({ handoff_mode: 'room', dorm_access_rule: 'male_only', rider_gender_requirement: 'male' });
  });

  it('finds an eligible order beyond the old candidate limit without exposing incompatible orders', async () => {
    const candidates = Array.from({ length: 210 }, (_, i) => ({ ...femaleOrder, id: `female-${i}` }));
    candidates.push({ id: 'male-1', remark: JSON.stringify({ rider_gender_requirement: 'male' }) });
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = { errandOrder: { findMany: jest.fn(async ({ skip, take }) => candidates.slice(skip, skip + take)) } };
    service.filterErrandRowsForOrderTaking = (rows: any[]) => rows.filter(row => errandRiderGenderMatches(row, 'MALE'));
    await expect(service.getEligibleErrandPoolPage({}, {}, { canTakeOrders: true }, 1, 10)).resolves.toEqual({ rows: [candidates[210]], total: 1 });
    expect(service.prisma.errandOrder.findMany).toHaveBeenCalledTimes(2);
  });
});
