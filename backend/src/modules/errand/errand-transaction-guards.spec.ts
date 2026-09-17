import {
  errandCampaignDayKey,
  lockErrandAssignee,
  reserveErrandCampaignBudget,
  resolveActiveCouponCampaign,
} from './errand-transaction-guards'

describe('errand database transaction guards', () => {
  function counterDb() {
    const rows = new Map<string, any>()
    const ledgers: any[] = []
    return {
      rows,
      ledgers,
      tx: {
        subsidyLedger: {
          aggregate: jest.fn(async ({ where }: any) => {
            const matches = ledgers.filter(row => row.campaignId === where.campaignId && row.status !== 'cancelled'
              && (!where.userId || row.userId === where.userId)
              && (!where.createdAt || (row.createdAt >= where.createdAt.gte && row.createdAt < where.createdAt.lt)))
            return { _sum: { amount: matches.reduce((sum, row) => sum + row.amount, 0) }, _count: matches.length }
          }),
        },
        marketingCampaignBudgetCounter: {
          createMany: jest.fn(async ({ data }: any) => {
            const row = data[0]
            if (rows.has(row.id)) return { count: 0 }
            rows.set(row.id, { ...row })
            return { count: 1 }
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const current = rows.get(where.id)
            current.version += Number(data.version.increment || 0)
            return { ...current }
          }),
          updateMany: jest.fn(async ({ where, data }: any) => {
            const current = rows.get(where.id)
            if (!current || current.version !== where.version) return { count: 0 }
            current.spent = data.spent
            current.uses = data.uses
            return { count: 1 }
          }),
        },
      },
    }
  }

  it('includes legacy shop ledgers even when its counter was never maintained', async () => {
    const { tx, ledgers } = counterDb()
    ledgers.push({ campaignId: 'campaign-1', userId: 'old-user', amount: 8, createdAt: new Date() })
    await expect(reserveErrandCampaignBudget(tx, { id: 'campaign-1', totalBudget: 10 }, 'new-user', 3))
      .rejects.toThrow('活动总预算已不足')
  })

  it('repairs stale counters after cancellation instead of permanently exhausting the budget', async () => {
    const { tx, rows, ledgers } = counterDb()
    rows.set('campaign-1:total', { spent: 100, uses: 10, version: 1 })
    ledgers.push({ campaignId: 'campaign-1', amount: 100, status: 'cancelled', createdAt: new Date() })
    await reserveErrandCampaignBudget(tx, { id: 'campaign-1', totalBudget: 10 }, 'new-user', 3)
    expect(rows.get('campaign-1:total')).toMatchObject({ spent: 3, uses: 1 })
  })

  it('serializes assignments by updating the assignee mutex row', async () => {
    const tx: any = {
      errandAssigneeMutex: {
        upsert: jest.fn().mockResolvedValue({ userId: 'rider-1', version: 1 }),
      },
    }
    await lockErrandAssignee(tx, 'rider-1')
    expect(tx.errandAssigneeMutex.upsert).toHaveBeenCalledWith({
      where: { userId: 'rider-1' },
      create: { userId: 'rider-1', version: 1 },
      update: { version: { increment: 1 } },
    })
  })

  it('uses a stable Shanghai calendar key for budget consume and release', () => {
    expect(errandCampaignDayKey(new Date('2026-08-31T16:30:00.000Z')))
      .toBe('2026-09-01')
  })

  it('rejects consumption after an atomic campaign budget counter is exhausted', async () => {
    const { tx, ledgers } = counterDb()
    const campaign = { id: 'campaign-1', totalBudget: 10 }

    await reserveErrandCampaignBudget(tx, campaign, 'user-1', 6, new Date('2026-09-01T00:00:00Z'))
    ledgers.push({ campaignId: campaign.id, userId: 'user-1', amount: 6, createdAt: new Date('2026-09-01T00:00:00Z') })
    await expect(
      reserveErrandCampaignBudget(tx, campaign, 'user-2', 6, new Date('2026-09-01T00:00:00Z')),
    ).rejects.toThrow('活动总预算已不足')
  })

  it('makes first-order-only campaigns one use per campaign user', async () => {
    const { tx, ledgers } = counterDb()
    const campaign = { id: 'campaign-first', firstOrderOnly: true }

    await reserveErrandCampaignBudget(tx, campaign, 'user-1', 1)
    ledgers.push({ campaignId: campaign.id, userId: 'user-1', amount: 1, createdAt: new Date() })
    await expect(reserveErrandCampaignBudget(tx, campaign, 'user-1', 1))
      .rejects.toThrow('个人活动补贴或参与次数上限')
  })
})


describe('linked coupon campaign lifecycle', () => {
  it('finds an active linked campaign when earlier campaigns for the coupon are paused', async () => {
    const db = { config: { findUnique: jest.fn().mockResolvedValue({ value: { list: [
      { id: 'paused', couponId: 'coupon-1', status: 'paused' },
      { id: 'active', couponId: 'coupon-1', status: 'active' },
    ] } }) } };
    expect(await resolveActiveCouponCampaign(db, 'coupon-1')).toMatchObject({ id: 'active' });
  })
  it('propagates config outages instead of converting a campaign coupon to an unlimited coupon', async () => {
    const db = { config: { findUnique: jest.fn().mockRejectedValue(new Error('database unavailable')) } }
    await expect(resolveActiveCouponCampaign(db, 'coupon-1')).rejects.toThrow('database unavailable')
  })
  it.each([
    { status: 'paused' },
    { status: 'active', endAt: '2020-01-01' },
    { status: 'active', startAt: '2099-01-01' },
    { status: 'active', startAt: 'invalid' },
  ])('rejects an unavailable linked campaign: %j', async config => {
    const db = { config: { findUnique: jest.fn().mockResolvedValue({ value: { list: [{ couponId: 'coupon-1', ...config }] } }) } }
    await expect(resolveActiveCouponCampaign(db, 'coupon-1')).rejects.toThrow('关联活动')
  })
  it('preserves standalone coupons and assigns the same legacy campaign ID in both businesses', async () => {
    const db = { config: { findUnique: jest.fn().mockResolvedValue({ value: [{ couponId: 'coupon-1', status: 'active' }] }) } }
    expect(await resolveActiveCouponCampaign(db, 'coupon-1')).toMatchObject({ id: 'coupon:coupon-1' })
    expect(await resolveActiveCouponCampaign(db, 'standalone')).toBeNull()
  })
})
