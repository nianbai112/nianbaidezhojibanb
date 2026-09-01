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
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        openid: 'openid-1',
        sid: 'session-1',
        scope: 'default',
      }),
    };
    const config = {
      get: jest.fn((key: string) => ({
        JWT_SECRET: 'test-secret',
        JWT_ACCESS_EXPIRES_IN: '2h',
        JWT_REFRESH_EXPIRES_IN: '7d',
        RIDER_REFRESH_EXPIRES_IN: '30d',
      })[key]),
    };
    const redis = {
      get: jest.fn().mockResolvedValue('existing-refresh-token'),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(0),
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
      expect.stringMatching(/^refresh:user-1:/),
      'restricted-refresh-token',
      7 * 24 * 3600,
    );
  });

  it('renews a banned user restricted session after the access token expires', async () => {
    const { service, jwtService, redis } = createService('BANNED');

    await expect(service.refreshToken('existing-refresh-token')).resolves.toEqual({
      accessToken: 'restricted-access-token',
      refreshToken: 'existing-refresh-token',
      expiresIn: 7200,
    });
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('existing-refresh-token', {
      secret: 'test-secret',
    });
    expect(redis.get).toHaveBeenCalledWith('refresh:user-1:session-1');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('still rejects inactive users and removes their stale refresh token', async () => {
    const { service, redis } = createService('INACTIVE');

    await expect((service as any).generateTokens('user-1', 'openid-1'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.del).toHaveBeenCalledWith('refresh:user-1');
    expect(redis.delPattern).toHaveBeenCalledWith('refresh:user-1:*');
  });

  it('keeps partner App refresh sessions independent for 30 days', async () => {
    const { service, jwtService, redis } = createService('ACTIVE');
    jwtService.sign
      .mockReset()
      .mockReturnValueOnce('partner-access-token')
      .mockReturnValueOnce('partner-refresh-token');

    await expect((service as any).generateTokens('user-1', 'openid-1', {
      scope: 'partner_app',
    })).resolves.toEqual({
      accessToken: 'partner-access-token',
      refreshToken: 'partner-refresh-token',
      expiresIn: 7200,
    });

    expect(jwtService.sign).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sid: expect.any(String), scope: 'partner_app' }),
      expect.objectContaining({ expiresIn: '30d' }),
    );
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^refresh:user-1:/),
      'partner-refresh-token',
      30 * 24 * 3600,
    );
  });

  it('does not let a mini-program login overwrite the rider App refresh session', async () => {
    const { service, jwtService, redis } = createService('ACTIVE');
    jwtService.sign
      .mockReset()
      .mockReturnValueOnce('mini-access-token')
      .mockReturnValueOnce('mini-refresh-token')
      .mockReturnValueOnce('rider-access-token')
      .mockReturnValueOnce('rider-refresh-token');

    await (service as any).generateTokens('user-1', 'openid-1');
    await (service as any).generateTokens('user-1', 'openid-1', {
      scope: 'partner_app',
    });

    const miniKey = redis.set.mock.calls[0][0];
    const riderKey = redis.set.mock.calls[1][0];
    expect(miniKey).toMatch(/^refresh:user-1:/);
    expect(riderKey).toMatch(/^refresh:user-1:/);
    expect(riderKey).not.toBe(miniKey);
    expect(redis.set.mock.calls[0]).toEqual([miniKey, 'mini-refresh-token', 7 * 24 * 3600]);
    expect(redis.set.mock.calls[1]).toEqual([riderKey, 'rider-refresh-token', 30 * 24 * 3600]);
  });

  it('does not turn a transient Redis refresh failure into a 401 logout signal', async () => {
    const { service, redis } = createService('ACTIVE');
    const unavailable = new Error('redis temporarily unavailable');
    redis.get.mockRejectedValueOnce(unavailable);

    await expect(service.refreshToken('existing-refresh-token')).rejects.toBe(unavailable);
  });

  it('keeps the same sid refresh token and rotates only the short access token', async () => {
    const { service, jwtService, redis } = createService('ACTIVE');
    jwtService.sign.mockReset().mockReturnValueOnce('new-access-token');

    await expect(service.refreshToken('existing-refresh-token')).resolves.toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'existing-refresh-token',
      expiresIn: 7200,
    });
    expect(jwtService.sign).toHaveBeenCalledTimes(1);
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sid: 'session-1', scope: 'default' }),
      expect.objectContaining({ expiresIn: '2h' }),
    );
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('migrates a legacy token to a default 7-day sid session; rider re-login is required for 30 days', async () => {
    const { service, jwtService, redis } = createService('ACTIVE');
    jwtService.verifyAsync.mockResolvedValueOnce({
      sub: 'user-1',
      openid: 'openid-1',
    });
    jwtService.sign
      .mockReset()
      .mockReturnValueOnce('migrated-access-token')
      .mockReturnValueOnce('migrated-refresh-token');

    await expect(service.refreshToken('existing-refresh-token')).resolves.toEqual({
      accessToken: 'migrated-access-token',
      refreshToken: 'migrated-refresh-token',
      expiresIn: 7200,
    });
    expect(redis.get).toHaveBeenCalledWith('refresh:user-1');
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^refresh:user-1:/),
      'migrated-refresh-token',
      7 * 24 * 3600,
    );
    expect(redis.del).toHaveBeenCalledWith('refresh:user-1');
  });
});
