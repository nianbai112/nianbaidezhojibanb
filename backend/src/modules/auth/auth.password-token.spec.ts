import { AuthService } from './auth.service';

describe('AuthService rider password token isolation', () => {
  function createService(payload: Record<string, unknown>, storedToken = 'presented-refresh') {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', status: 'ACTIVE' }),
      },
      riderAppPasswordCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'credential-1',
          userId: 'user-1',
          enabled: true,
          expiresAt: null,
          sessionVersion: 3,
        }),
      },
    };
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue(payload),
      sign: jest.fn()
        .mockReturnValueOnce('new-access')
        .mockReturnValueOnce('new-refresh'),
    };
    const config = {
      get: jest.fn((key: string) => ({
        JWT_SECRET: 'secret',
        JWT_ACCESS_EXPIRES_IN: '2h',
        JWT_REFRESH_EXPIRES_IN: '7d',
      })[key]),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(storedToken),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new AuthService(prisma as any, jwt as any, config as any, redis as any, {} as any),
      prisma,
      jwt,
      redis,
    };
  }

  it('refreshes an ordinary SMS token under the unchanged user key and claims', async () => {
    const payload = { sub: 'user-1', openid: 'openid-1', isAdmin: false };
    const { service, prisma, jwt, redis } = createService(payload);

    await expect(service.refreshToken('presented-refresh')).resolves.toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 7200,
    });

    expect(prisma.riderAppPasswordCredential.findUnique).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith('refresh:user-1');
    expect(jwt.sign).toHaveBeenNthCalledWith(1, payload, { expiresIn: '2h' });
    expect(jwt.sign).toHaveBeenNthCalledWith(2, payload, { expiresIn: '7d' });
    expect(redis.set).toHaveBeenCalledWith('refresh:user-1', 'new-refresh', 7 * 24 * 3600);
  });

  it('refreshes a password token only under its credential key and preserves claims', async () => {
    const payload = {
      sub: 'user-1',
      openid: 'openid-1',
      isAdmin: false,
      authSource: 'rider_password',
      credentialId: 'credential-1',
      credentialVersion: 3,
    };
    const { service, prisma, jwt, redis } = createService(payload);

    await expect(service.refreshToken('presented-refresh')).resolves.toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 7200,
    });

    expect(prisma.riderAppPasswordCredential.findUnique).toHaveBeenCalledWith({
      where: { id: 'credential-1' },
    });
    expect(redis.get).toHaveBeenCalledWith('refresh:rider_password:credential-1');
    expect(redis.get).not.toHaveBeenCalledWith('refresh:user-1');
    expect(jwt.sign).toHaveBeenNthCalledWith(1, payload, { expiresIn: '2h' });
    expect(jwt.sign).toHaveBeenNthCalledWith(2, payload, { expiresIn: '7d' });
    expect(redis.set).toHaveBeenCalledWith(
      'refresh:rider_password:credential-1',
      'new-refresh',
      7 * 24 * 3600,
    );
  });

  it('rejects a rotated password refresh token before reading Redis', async () => {
    const payload = {
      sub: 'user-1',
      openid: 'openid-1',
      authSource: 'rider_password',
      credentialId: 'credential-1',
      credentialVersion: 2,
    };
    const { service, redis } = createService(payload);

    await expect(service.refreshToken('presented-refresh')).rejects.toThrow('刷新令牌无效');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('clears only the supplied password refresh key when token issuance finds an inactive user', async () => {
    const { service, prisma, redis } = createService({});
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'INACTIVE' });

    await expect((service as any).issueActiveUserTokens(
      'user-1',
      'openid-1',
      {
        authSource: 'rider_password',
        credentialId: 'credential-1',
        credentialVersion: 3,
      },
      'refresh:rider_password:credential-1',
    )).rejects.toThrow('账号已被禁用');

    expect(redis.del).toHaveBeenCalledWith('refresh:rider_password:credential-1');
    expect(redis.del).not.toHaveBeenCalledWith('refresh:user-1');
  });

  it('keeps core user identity claims authoritative over supplied extras', async () => {
    const { service, jwt } = createService({});

    await service.issueActiveUserTokens(
      'user-1',
      'openid-1',
      {
        sub: 'attacker',
        openid: 'attacker-openid',
        isAdmin: true,
        authSource: 'rider_password',
        credentialId: 'credential-1',
        credentialVersion: 3,
      },
      'refresh:rider_password:credential-1',
    );

    expect(jwt.sign).toHaveBeenNthCalledWith(1, {
      sub: 'user-1',
      openid: 'openid-1',
      isAdmin: false,
      authSource: 'rider_password',
      credentialId: 'credential-1',
      credentialVersion: 3,
    }, { expiresIn: '2h' });
  });
});
