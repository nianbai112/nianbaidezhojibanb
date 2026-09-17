import { OpsService } from './ops.service';

describe('service monitor log reads', () => {
  const setup = () => {
    const prisma = { serverLog: { findMany: jest.fn().mockResolvedValue([{ id: 'log' }]), count: jest.fn().mockResolvedValue(1) } };
    return { prisma, service: new OpsService(prisma as any, {} as any, {} as any, {} as any) };
  };
  it('reads only bounded list fields and keeps search and pagination', async () => {
    const { prisma, service } = setup();
    await expect(service.getLogs({ page: '2', pageSize: '20', level: 'error', keyword: '发送' })).resolves.toMatchObject({ total: 1, page: 2 });
    const query = prisma.serverLog.findMany.mock.calls[0][0];
    expect(query).toMatchObject({ skip: 20, take: 20, where: { level: 'error' }, select: { message: true, createdAt: true } });
    expect(query.select.detail).toBeUndefined();
  });
  it.each([{ page: 'abc' }, { page: -1 }, { pageSize: 10000 }, { startTime: 'invalid' }, { level: 'invalid' }])('rejects invalid filters as a client error: %p', async (query) => {
    const { prisma, service } = setup();
    await expect(service.getLogs(query)).rejects.toMatchObject({ status: 400 });
    expect(prisma.serverLog.findMany).not.toHaveBeenCalled();
  });
  it('does not turn database failure into an empty successful list', async () => {
    const { prisma, service } = setup();
    prisma.serverLog.findMany.mockRejectedValue(new Error('db unavailable'));
    await expect(service.getLogs({})).rejects.toThrow('db unavailable');
  });
});
