import { ErrandService } from './errand.service';

describe('ErrandService rider location authorization', () => {
  const prisma: any = {
    regionRider: { findFirst: jest.fn() },
    errandOrder: { findFirst: jest.fn() },
  };
  const service = new ErrandService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.regionRider.findFirst.mockResolvedValue({
      id: 'rider-row-1', userId: 'rider-1', lat: 30.1, lng: 120.1, locationUpdatedAt: new Date(),
    });
    prisma.errandOrder.findFirst.mockResolvedValue(null);
  });

  it('rejects rider location reads without an active related order', async () => {
    await expect(service.getRiderLocation('viewer-1', 'rider-1')).rejects.toThrow('无权查看骑手位置');
  });

  it('allows the order owner to read the assigned rider location', async () => {
    prisma.errandOrder.findFirst.mockResolvedValue({ id: 'order-1' });

    await expect(service.getRiderLocation('viewer-1', 'rider-1', 'order-1')).resolves.toMatchObject({
      lat: 30.1,
      lng: 120.1,
    });
  });
});
