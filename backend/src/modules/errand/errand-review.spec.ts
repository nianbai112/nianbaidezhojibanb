import { ErrandService } from './errand.service';

const createService = (prisma: any) => new ErrandService(
  prisma,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
);

describe('ErrandService review closure', () => {
  it('allows the owner to review once only after confirmed receipt', async () => {
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({
        id: 'order-1', userId: 'user-1', riderId: 'rider-1', status: 'completed',
        receiptConfirmedAt: new Date(), refundStatus: 'none',
      }) },
      errandReview: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ orderId: 'order-1', rating: 5 }),
      },
    };
    const service = createService(prisma);

    await expect(service.createReview('user-1', 'order-1', { rating: 5, tags: ['准时'], content: '送达很快' }))
      .resolves.toEqual(expect.objectContaining({ orderId: 'order-1', rating: 5 }));
    expect(prisma.errandReview.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      orderId: 'order-1', userId: 'user-1', riderId: 'rider-1', rating: 5,
    }) });
  });

  it.each([
    [{ status: 'arrived', receiptConfirmedAt: null, refundStatus: 'none' }, '确认收货后才能评价'],
    [{ status: 'completed', receiptConfirmedAt: new Date(), refundStatus: 'refunded' }, '已全额退款订单不能评价'],
  ])('rejects an ineligible review', async (state, message) => {
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'order-1', userId: 'user-1', riderId: 'rider-1', ...state }) },
      errandReview: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    };
    await expect(createService(prisma).createReview('user-1', 'order-1', { rating: 5 })).rejects.toThrow(message);
  });
});
