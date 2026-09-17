import { UserService } from './user.service';

describe('profile editing cannot replace a verified login phone', () => {
  const createService = () => {
    const service: any = Object.create(UserService.prototype);
    service.userAccess = { assertCanInteract: jest.fn().mockResolvedValue(undefined) };
    service.prisma = { user: { findUnique: jest.fn().mockResolvedValue({ phone: '13800138000' }), update: jest.fn() } };
    service.clearProfileCache = jest.fn();
    service.getProfile = jest.fn().mockResolvedValue({ nickname: '同学' });
    return service;
  };

  it.each(['phone', 'mobile'])('rejects unverified changes through %s before writing anything', async (key) => {
    const service = createService();
    await expect(service.updateProfile('user-1', { nickname: '同学', [key]: '13900139000' })).rejects.toThrow('微信手机号授权');
    expect(service.prisma.user.update).not.toHaveBeenCalled();
  });

  it('accepts an unchanged phone for older clients without writing the phone field', async () => {
    const service = createService();
    await expect(service.updateProfile('user-1', { nickname: '同学', phone: '13800138000' })).resolves.toEqual({ nickname: '同学' });
    expect(service.prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { nickname: '同学' } });
  });
});
