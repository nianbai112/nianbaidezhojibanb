import { ErrandService } from './errand.service';

function fixture() {
  const user: any = {
    id: 'rider-user', phone: '13800138000', nickname: '测试学生',
    studentVerify: {
      status: 'APPROVED', schoolId: 'school-a', proofMethod: 'MANUAL_REVIEW',
      school: { id: 'school-a', regionId: 'region-a', isEnabled: true },
    },
  };
  let rider: any = { id: 'rider-row', userId: user.id, regionId: 'region-a', verifyStatus: 'revoked', riderType: 'ordinary_user', status: 'offline' };
  let order: any = {
    id: 'order-a', userId: 'customer', regionId: 'region-a', status: 'pending_accept',
    type: 'pickup', riderId: null, payAmount: 5, payTime: new Date(), refundStatus: 'none',
    remark: JSON.stringify({ receiver_type: 'ordinary_user' }), tasks: [],
  };
  const db: any = {
    user: { findUnique: jest.fn(async () => user) },
    regionRider: {
      findUnique: jest.fn(async () => rider),
      update: jest.fn(async ({ data }: any) => (rider = { ...rider, ...data })),
      upsert: jest.fn(async ({ update }: any) => (rider = { ...rider, ...update })),
    },
    errandAssigneeMutex: { upsert: jest.fn().mockResolvedValue({}) },
    errandOrder: {
      findUnique: jest.fn(async () => order),
      findUniqueOrThrow: jest.fn(async () => order),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn(async ({ data }: any) => { order = { ...order, ...data }; return { count: 1 }; }),
    },
    order: { count: jest.fn().mockResolvedValue(0) },
    errandConfig: { findUnique: jest.fn().mockResolvedValue({ basePrice: 0 }) },
    config: { findUnique: jest.fn().mockResolvedValue({ value: { orderTakingPolicy: { ordinaryUserEnabled: true, receiverChoiceEnabled: true } } }) },
  };
  db.$transaction = jest.fn((fn: any) => fn(db));
  const service: any = Object.create(ErrandService.prototype);
  service.prisma = db;
  service.recordDeliveryNode = jest.fn().mockResolvedValue({});
  service.formatMiniOrders = async (rows: any[]) => rows;
  service.recordErrandLearningSnapshot = async () => {};
  service.notifyErrandAccepted = async () => {};
  return { service, db, user, rider: () => rider, order: () => order };
}

describe('revoked riders use ordinary eligibility until a new application is approved', () => {
  it('allows only ordinary-user orders for a revoked rider with valid student and phone credentials', async () => {
    const f = fixture();
    expect(await f.service.getOrderTakingIdentity(f.user.id, { region_id: 'region-a' })).toMatchObject({ role: 'ordinary_user', canTakeOrders: true });
    await expect(f.service.acceptOrderUnlocked('order-a', f.user.id)).resolves.toMatchObject({ success: true });
    expect(f.rider()).toMatchObject({ verifyStatus: 'revoked', riderType: 'ordinary_user' });
    expect(f.order()).toMatchObject({ riderId: f.user.id, status: 'accepted', deliveryDisplayMode: 'status_nodes' });
  });

  it.each(['missing_phone', 'pending_student', 'revoked_student', 'other_region', 'approved_rider_order', 'high_risk'])('still rejects %s after revocation', async scenario => {
    const f = fixture();
    if (scenario === 'missing_phone') f.user.phone = null;
    if (scenario === 'pending_student') f.user.studentVerify.status = 'PENDING';
    if (scenario === 'revoked_student') f.user.studentVerify.status = 'REVOKED';
    if (scenario === 'other_region') f.user.studentVerify.school.regionId = 'region-b';
    if (scenario === 'approved_rider_order') f.order().remark = JSON.stringify({ receiver_type: 'approved_rider' });
    if (scenario === 'high_risk') f.order().remark = JSON.stringify({ receiver_type: 'ordinary_user', risk_assessment: { risk_level: 'high', risk_tags: ['valuable'] } });
    await expect(f.service.acceptOrderUnlocked('order-a', f.user.id)).rejects.toThrow();
    expect(f.db.errandOrder.updateMany).not.toHaveBeenCalled();
  });

  it('does not allow ordinary acceptance when the region closes ordinary-user orders', async () => {
    const f = fixture();
    f.db.config.findUnique.mockResolvedValue({ value: { orderTakingPolicy: { ordinaryUserEnabled: false } } });
    await expect(f.service.acceptOrderUnlocked('order-a', f.user.id)).rejects.toThrow();
    expect(f.db.errandOrder.updateMany).not.toHaveBeenCalled();
  });

  it.each(['online', 'busy'])('does not let a revoked rider restore duty status to %s', async status => {
    const f = fixture();
    await expect(f.service.updateRiderInfo(f.user.id, { status })).rejects.toThrow('认证已撤销');
    expect(f.db.regionRider.update).not.toHaveBeenCalled();
  });

  it('starts a new pending part-time application and does not restore the former official role', async () => {
    const f = fixture();
    f.service.formatRiderInfo = (value: any) => value;
    await expect(f.service.applyRider(f.user.id, { region_id: 'region-a', full_name: '测试学生', phone_number: '13800138000' })).resolves.toMatchObject({ data: { verifyStatus: 'pending', riderType: 'part_time', status: 'offline' } });
    expect(f.db.errandAssigneeMutex.upsert).toHaveBeenCalled();
    expect(await f.service.getOrderTakingIdentity(f.user.id, { region_id: 'region-a' })).toMatchObject({ canTakeOrders: false });
  });

  it('does not reset a revoked ordinary receiver to pending while their ordinary order remains unfinished', async () => {
    const f = fixture();
    f.db.errandOrder.count.mockResolvedValue(1);
    await expect(f.service.applyRider(f.user.id, { region_id: 'region-a', full_name: '测试学生', phone_number: '13800138000' })).rejects.toThrow('进行中的订单');
    expect(f.db.regionRider.upsert).not.toHaveBeenCalled();
  });

  it('exposes revoked rather than pending to mini-program clients', () => {
    const f = fixture();
    expect(f.service.normalizeRiderAccountStatus('revoked')).toBe('revoked');
  });
});
