import {
  assessErrandAssignmentRisk,
  enforceErrandAssignmentGuard,
  inspectErrandAssignmentRisk,
} from './errand-assignment-guard'

describe('errand assignment anti-fraud guard', () => {
  it('always blocks the order owner from taking their own errand', () => {
    expect(assessErrandAssignmentRisk({
      ownerUserId: 'user-1',
      assigneeUserId: 'user-1',
    })).toEqual(expect.objectContaining({
      allowed: false,
      blocked: true,
      reasonCode: 'self_assignment',
      eventType: 'self_assignment_attempt',
    }))
  })

  it('blocks strongly related accounts when the order contains a marketing benefit', async () => {
    const db: any = {
      subsidyLedger: { findFirst: jest.fn().mockResolvedValue({ id: 'subsidy-1' }) },
      user: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === 'owner-1'
          ? { phone: '138-0000-0000', studentVerify: null }
          : { phone: '13800000000', studentVerify: null })),
      },
      regionRider: { findUnique: jest.fn().mockResolvedValue(null) },
    }

    const risk = await inspectErrandAssignmentRisk(db, {
      id: 'order-1',
      userId: 'owner-1',
      couponDiscount: 0,
    }, 'rider-1')

    expect(risk).toEqual(expect.objectContaining({
      allowed: false,
      blocked: true,
      reasonCode: 'marketing_related_account',
      signals: ['same_phone'],
    }))
  })

  it('allows fulfillment but escalates combined shared device and IP for manual settlement review', () => {
    expect(assessErrandAssignmentRisk({
      ownerUserId: 'owner-1',
      assigneeUserId: 'rider-1',
      hasMarketingBenefit: true,
      owner: { lastLoginDevice: 'iPhone 15', lastLoginIp: '10.0.0.8' },
      assignee: { lastLoginDevice: 'iphone 15', lastLoginIp: '10.0.0.8' },
    })).toEqual(expect.objectContaining({
      allowed: true,
      blocked: false,
      eventType: 'marketing_shared_device_and_ip',
      eventLevel: 'error',
      signals: ['same_recent_device', 'same_recent_ip'],
    }))
  })

  it('keeps a shared campus IP alone as a warning to avoid false-positive blocking', () => {
    expect(assessErrandAssignmentRisk({
      ownerUserId: 'owner-1',
      assigneeUserId: 'rider-1',
      hasMarketingBenefit: true,
      owner: { lastLoginDevice: 'iPhone 15', lastLoginIp: '10.0.0.8' },
      assignee: { lastLoginDevice: 'Android', lastLoginIp: '10.0.0.8' },
    })).toEqual(expect.objectContaining({
      allowed: true,
      blocked: false,
      eventType: 'marketing_shared_device_or_ip',
      eventLevel: 'warning',
      signals: ['same_recent_ip'],
    }))
  })

  it('treats a shared unionid or payout account as a strong marketing relation', () => {
    const risk = assessErrandAssignmentRisk({
      ownerUserId: 'owner-1',
      assigneeUserId: 'rider-1',
      hasMarketingBenefit: true,
      owner: {
        unionid: 'union-shared',
        withdraws: [{ account: '138-0000-0010' }],
      },
      assignee: {
        unionid: 'union-shared',
        rider: { alipayAccount: '13800000010' },
      },
    })

    expect(risk).toEqual(expect.objectContaining({
      allowed: false,
      blocked: true,
      signals: expect.arrayContaining(['same_unionid', 'same_payout_account']),
    }))
  })

  it('fails closed when marketing risk data cannot be read', async () => {
    const risk = await inspectErrandAssignmentRisk({
      subsidyLedger: { findFirst: jest.fn().mockRejectedValue(new Error('database unavailable')) },
    }, {
      id: 'order-1', userId: 'owner-1', couponDiscount: 0,
    }, 'rider-1')

    expect(risk).toEqual(expect.objectContaining({
      allowed: false,
      blocked: true,
      reasonCode: 'assignment_risk_check_unavailable',
    }))
  })

  it('records and rejects a blocked assignment before any order mutation', async () => {
    const db: any = {
      deliveryRiskEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'risk-1' }),
      },
    }

    await expect(enforceErrandAssignmentGuard(db, {
      id: 'order-1', orderNo: 'ERR-1', userId: 'user-1',
    }, 'user-1', '直接接单')).rejects.toThrow('不能接自己发布的跑腿订单')
    expect(db.deliveryRiskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        riderId: 'user-1',
        eventType: 'self_assignment_attempt',
        eventLevel: 'critical',
      }),
    })
  })
})
