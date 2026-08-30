import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService phone login identity resolution', () => {
  const createService = (
    riders: Array<{ userId: string }> = [],
    phoneUsers: Array<{ id: string }> = [{ id: 'phone-only-user' }],
  ) => {
    const prisma = {
      regionRider: {
        findMany: jest.fn().mockResolvedValue(riders),
      },
      user: {
        findMany: jest.fn().mockResolvedValue(phoneUsers),
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.id
            ? { id: where.id, phone: null }
            : { id: 'phone-only-user', phone: '13800138000' }),
        ),
        create: jest.fn(),
      },
    };
    const service = new AuthService(
      prisma as any,
      {} as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  };

  it('prefers the approved official rider account over a phone-only duplicate', async () => {
    const { service, prisma } = createService([{ userId: 'official-user' }]);

    await expect(
      (service as any).findPhoneLoginUser('13800138000', true),
    ).resolves.toMatchObject({ id: 'official-user' });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'official-user', status: { not: 'DELETED' } },
    });
  });

  it('keeps normal phone login behavior outside the official rider app', async () => {
    const { service, prisma } = createService([{ userId: 'official-user' }]);

    await expect(
      (service as any).findPhoneLoginUser('13800138000', false),
    ).resolves.toMatchObject({ id: 'phone-only-user' });
    expect(prisma.regionRider.findMany).not.toHaveBeenCalled();
  });

  it('rejects ambiguous official rider phone mappings', async () => {
    const { service } = createService([
      { userId: 'official-user-1' },
      { userId: 'official-user-2' },
    ]);

    await expect(
      (service as any).findPhoneLoginUser('13800138000', true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an ambiguous partner phone across user and rider identity sources', async () => {
    const { service } = createService(
      [{ userId: 'rider-user' }],
      [{ id: 'phone-user' }],
    );

    await expect(
      (service as any).findPhoneLoginUser('13800138000', true, true),
    ).rejects.toThrow('多个账号');
  });

  it('deduplicates the same canonical partner user found by both phone sources', async () => {
    const { service, prisma } = createService(
      [{ userId: 'same-user' }],
      [{ id: 'same-user' }],
    );

    await expect(
      (service as any).findPhoneLoginUser('13800138000', true, true),
    ).resolves.toMatchObject({ id: 'same-user' });
    expect(prisma.user.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'same-user', status: { not: 'DELETED' } },
    });
  });

  it('does not create a new account from the campus partner login', async () => {
    const { service, prisma } = createService([], []);
    jest.spyOn(service as any, 'verifyPhoneLoginCode').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'buildLoginMeta').mockResolvedValue({});
    jest.spyOn(service as any, 'findPhoneLoginUser').mockResolvedValue(null);

    await expect(service.phoneLogin(
      { phone: '13800138000', code: '123456' },
      undefined,
      undefined,
      { strictPartnerIdentity: true },
    )).rejects.toThrow('请先在小程序登录并绑定手机号');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
