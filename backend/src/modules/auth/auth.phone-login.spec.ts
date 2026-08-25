import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService phone login identity resolution', () => {
  const createService = (riders: Array<{ userId: string }> = []) => {
    const prisma = {
      regionRider: {
        findMany: jest.fn().mockResolvedValue(riders),
      },
      user: {
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.id
            ? { id: where.id, phone: null }
            : { id: 'phone-only-user', phone: '13800138000' }),
        ),
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
});
