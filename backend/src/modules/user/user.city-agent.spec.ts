import { BadRequestException, ConflictException } from '@nestjs/common';
import { UserService } from './user.service';
const payload = { regionId: 'r1', realName: '申请人', phone: '13800000000', reason: '合作计划内容八个字以上', wechat: 'wx_example' };
const create = () => {
  const calls: string[] = [];
  const tx: any = {
    $queryRaw: jest.fn().mockImplementation(async () => { calls.push('lock'); return [{ id: 'u1' }]; }),
    user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', deletedAt: null }) },
    region: { findUnique: jest.fn().mockImplementation(async () => { calls.push('region'); return { id: 'r1', name: '区域' }; }) },
    cityAgent: { findUnique: jest.fn().mockResolvedValue(null) },
    cityAgentApplication: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'a1', ...data })), update: jest.fn().mockImplementation(async ({ where, data }) => ({ id: where.id, userId: 'u1', regionId: 'r1', ...data })) },
  };
  const prisma: any = { $transaction: jest.fn(async (work) => work(tx)) };
  const service = new UserService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { tx, prisma, service, calls };
};
describe('UserService city-agent application serialization', () => {
 it('locks active account first inside Serializable transaction and ignores forged identity/status', async () => {
  const h = create(); const result = await h.service.submitCityAgentApplication('u1', { ...payload, userId: 'victim', isAdmin: true, status: 'approved' });
  expect(h.calls).toEqual(['lock', 'region']); expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  expect(h.tx.cityAgentApplication.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId:'u1', regionId:'r1', status:'pending', reason: payload.reason+'\n微信：wx_example' }) }));
  expect(result.application?.userId).toBe('u1'); expect(result.application?.status).toBe('pending');
 });
 it.each(['active', 'frozen'])('does not replace any-region %s agent', async status => {
  const h = create(); h.tx.cityAgent.findUnique.mockResolvedValue({ regionId:'r2', status }); await expect(h.service.submitCityAgentApplication('u1',payload)).rejects.toThrow(BadRequestException); expect(h.tx.cityAgentApplication.create).not.toHaveBeenCalled();
 });
 it('does not resubmit approved application and guards UPDATE against approval after snapshot', async () => {
  const h = create(); h.tx.cityAgentApplication.findFirst.mockResolvedValue({ id:'a1',status:'approved' }); await expect(h.service.submitCityAgentApplication('u1',payload)).rejects.toThrow(BadRequestException); expect(h.tx.cityAgentApplication.update).not.toHaveBeenCalled();
  h.tx.cityAgentApplication.findFirst.mockResolvedValue({ id:'a1',status:'pending' }); await h.service.submitCityAgentApplication('u1',payload);
  expect(h.tx.cityAgentApplication.update).toHaveBeenCalledWith(expect.objectContaining({ where:{id:'a1',userId:'u1',regionId:'r1',status:{not:'approved'}} }));
 });
 it.each(['P2034','P2025'])('returns conflict for %s instead of lying about successful pending state', async code => {
  const h = create(); h.prisma.$transaction.mockRejectedValue({code}); await expect(h.service.submitCityAgentApplication('u1',payload)).rejects.toThrow(ConflictException);
 });
 it('closed agent can resubmit rejected while unknown/inactive account cannot create', async () => {
  const h=create(); h.tx.cityAgent.findUnique.mockResolvedValue({status:'closed'});h.tx.cityAgentApplication.findFirst.mockResolvedValue({id:'a1',status:'rejected'});expect((await h.service.submitCityAgentApplication('u1',payload)).application?.status).toBe('pending');
  h.tx.$queryRaw.mockResolvedValue([]);h.tx.cityAgentApplication.create.mockClear();await expect(h.service.submitCityAgentApplication('u1',payload)).rejects.toThrow(BadRequestException);expect(h.tx.cityAgentApplication.create).not.toHaveBeenCalled();
 });
});
