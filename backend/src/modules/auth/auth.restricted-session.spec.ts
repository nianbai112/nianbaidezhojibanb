import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService restricted sessions for banned users', () => {
  const createService = (status: 'ACTIVE' | 'BANNED' | 'INACTIVE' = 'BANNED') => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', status }),
      },
    };
    const jwtService = {
      sign: jest.fn()
        .mockReturnValueOnce('restricted-access-token')
        .mockReturnValueOnce('restricted-refresh-token'),
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1', openid: 'openid-1' }),
    };
    const config = {
      get: jest.fn((key: string) => ({
        JWT_SECRET: 'test-secret',
        JWT_ACCESS_EXPIRES_IN: '2h',
        JWT_REFRESH_EXPIRES_IN: '7d',
      })[key]),
    };
    const redis = {
      get: jest.fn().mockResolvedValue('existing-refresh-token'),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      prisma as any,
      jwtService as any,
      config as any,
      redis as any,
      {} as any,
    );
    return { service, prisma, jwtService, redis };
  };

  it('issues a restricted session so a banned user can reach self-unban after a cold login', async () => {
    const { service, jwtService, redis } = createService('BANNED');

    await expect((service as any).generateTokens('user-1', 'openid-1')).resolves.toEqual({
      accessToken: 'restricted-access-token',
      refreshToken: 'restricted-refresh-token',
      expiresIn: 7200,
    });
    expect(jwtService.sign).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sub: 'user-1', restricted: true }),
      expect.objectContaining({ expiresIn: '2h' }),
    );
    expect(redis.set).toHaveBeenCalledWith(
      'refresh:user-1',
      'restricted-refresh-token',
      7 * 24 * 3600,
    );
  });

  it('renews a banned user restricted session after the access token expires', async () => {
    const { service, jwtService, redis } = createService('BANNED');

    await expect(service.refreshToken('existing-refresh-token')).resolves.toEqual({
      accessToken: 'restricted-access-token',
      refreshToken: 'restricted-refresh-token',
      expiresIn: 7200,
    });
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('existing-refresh-token', {
      secret: 'test-secret',
    });
    expect(redis.get).toHaveBeenCalledWith('refresh:user-1');
  });

  it('still rejects inactive users and removes their stale refresh token', async () => {
    const { service, redis } = createService('INACTIVE');

    await expect((service as any).generateTokens('user-1', 'openid-1'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.del).toHaveBeenCalledWith('refresh:user-1');
  });
});
