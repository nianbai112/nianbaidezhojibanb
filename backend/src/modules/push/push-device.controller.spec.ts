import { PushDeviceController } from './push-device.controller';
describe('校园 App 推送设备绑定', () => {
  const make = () => { const db = {userPushDevice: {upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({count: 1})}}; return {db, service:new PushDeviceController(db as any)}; };
  it('身份来自JWT，绑定变更不接受body中的userId', async () => {
    const {db,service}=make();await service.register('self',{clientId:'cid-12345678',platform:'ios',userId:'victim'});
    expect(db.userPushDevice.upsert).toHaveBeenCalledWith(expect.objectContaining({update:expect.objectContaining({userId:'self'}),create:expect.objectContaining({userId:'self'})}));
  });
  it('迟到注销不删除新账号的绑定', async () => {
    const {db,service}=make();await service.unregister('old',{clientId:'cid-12345678'});
    expect(db.userPushDevice.deleteMany).toHaveBeenCalledWith({where:{clientId:'cid-12345678',userId:'old'}});
  });
  it('无效设备和平台不写数据库', async () => {
    const {db,service}=make();await expect(service.register('self',{clientId:'x',platform:'ios'})).rejects.toThrow();await expect(service.register('self',{clientId:'cid-12345678',platform:'web'})).rejects.toThrow();expect(db.userPushDevice.upsert).not.toHaveBeenCalled();
  });
  it('同CID新账号接管后，旧账号的迟到解绑不删除新所有者', async () => {
    const records = new Map<string, { userId: string; platform: string }>();
    const db = { userPushDevice: {
      upsert: jest.fn(async (args: any) => {
        const existing = records.get(args.where.clientId);
        const next = existing ? { ...existing, ...args.update } : args.create;
        records.set(args.where.clientId, next);
        return next;
      }),
      deleteMany: jest.fn(async (args: any) => {
        const record = records.get(args.where.clientId);
        if (record?.userId !== args.where.userId) return { count: 0 };
        records.delete(args.where.clientId);
        return { count: 1 };
      }),
    } };
    const service = new PushDeviceController(db as any);
    const dto = { clientId: 'cid-12345678', platform: 'ios' };
    await service.register('old', dto);
    await service.register('new', { ...dto, userId: 'old' });
    expect(records.size).toBe(1);
    expect(records.get(dto.clientId)?.userId).toBe('new');
    await expect(service.unregister('old', dto)).resolves.toEqual({ success: true, removed: 0 });
    expect(records.get(dto.clientId)?.userId).toBe('new');
    await expect(service.unregister('new', dto)).resolves.toEqual({ success: true, removed: 1 });
    expect(records.size).toBe(0);
  });
});
