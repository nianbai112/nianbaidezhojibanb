import { lastValueFrom, of } from 'rxjs';
import { RequestLogInterceptor } from './request-log.interceptor';

describe('RequestLogInterceptor sensitive request bodies', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('never persists short rider passwords, password hashes, secrets, or tokens', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const prisma = {
      serverLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    };
    const interceptor = new RequestLogInterceptor(prisma as any);
    const request: any = {
      method: 'POST',
      url: '/rider-app/login/password',
      headers: {
        'user-agent': 'rider-app/1.2.3',
        'x-request-id': 'request-1',
      },
      body: {
        username: 'campus.test',
        password: 'Campus2026!',
        passwordHash: '$2b$12$short',
        client_secret: 'short-secret',
        accessToken: 'short-token',
        hash: 'short-hash',
        profile: {
          phone: '13800138000',
          email: 'rider@example.com',
          ip: '127.0.0.1',
        },
      },
      ip: '127.0.0.1',
      res: { statusCode: 200 },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;

    await lastValueFrom(interceptor.intercept(context, { handle: () => of({ success: true }) }));

    expect(prisma.serverLog.create).toHaveBeenCalledTimes(1);
    const persisted = prisma.serverLog.create.mock.calls[0][0].data;
    expect(persisted.path).toBe('/rider-app/login/password');
    expect(persisted.detail).toEqual({
      username: 'campus.test',
      password: '[REDACTED]',
      passwordHash: '[REDACTED]',
      client_secret: '[REDACTED]',
      accessToken: '[REDACTED]',
      hash: '[REDACTED]',
      profile: {
        phone: '138****8000',
        email: 'rider@example.com',
        ip: '127.0.0.1',
      },
    });
    expect(JSON.stringify(persisted.detail)).not.toContain('Campus2026!');
    expect(JSON.stringify(persisted.detail)).not.toContain('$2b$12$short');
    expect(JSON.stringify(persisted.detail)).not.toContain('short-secret');
    expect(JSON.stringify(persisted.detail)).not.toContain('short-token');
    expect(JSON.stringify(persisted.detail)).not.toContain('short-hash');
  });
});
