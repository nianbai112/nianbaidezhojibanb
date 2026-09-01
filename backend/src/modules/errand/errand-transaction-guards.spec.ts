import {
  errandCampaignDayKey,
  lockErrandAssignee,
  reserveErrandCampaignBudget,
} from './errand-transaction-guards'

describe('errand database transaction guards', () => {
  function counterDb() {
    const rows = new Map<string, any>()
    return {
      rows,
      tx: {
        marketingCampaignBudgetCounter: {
          upsert: jest.fn(async ({ where, create, update }: any) => {
            const current = rows.get(where.id)
            if (!current) {
              const row = { ...create }
              rows.set(where.id, row)
              return { ...row }
            }
            current.version += Number(update.version.increment || 0)
            return { ...current }
          }),
          updateMany: jest.fn(async ({ where, data }: any) => {
            const current = rows.get(where.id)
            if (!current || current.version !== where.version) return { count: 0 }
            current.spent += Number(data.spent.increment || 0)
            current.uses += Number(data.uses.increment || 0)
            return { count: 1 }
          }),
        },
      },
    }
  }

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
    const { tx } = counterDb()
    const campaign = { id: 'campaign-1', totalBudget: 10 }

    await reserveErrandCampaignBudget(tx, campaign, 'user-1', 6, new Date('2026-09-01T00:00:00Z'))
    await expect(
      reserveErrandCampaignBudget(tx, campaign, 'user-2', 6, new Date('2026-09-01T00:00:00Z')),
    ).rejects.toThrow('活动总预算已不足')
  })

  it('makes first-order-only campaigns one use per campaign user', async () => {
    const { tx } = counterDb()
    const campaign = { id: 'campaign-first', firstOrderOnly: true }

    await reserveErrandCampaignBudget(tx, campaign, 'user-1', 1)
    await expect(reserveErrandCampaignBudget(tx, campaign, 'user-1', 1))
      .rejects.toThrow('个人活动补贴或参与次数上限')
  })
})
