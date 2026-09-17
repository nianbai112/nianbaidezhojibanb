import { AuthService } from './auth.service';

describe('administrator login failure evidence', () => {
  let service: any;
  let prisma: any;
  const previous = process.env.ADMIN_LOGIN_CAPTCHA_REQUIRED;
  beforeEach(() => {
    process.env.ADMIN_LOGIN_CAPTCHA_REQUIRED = 'true';
    prisma = { adminLoginLog: { create: jest.fn().mockResolvedValue({}) }, adminAccount: { findFirst: jest.fn().mockResolvedValue(null) } };
    service = Object.create(AuthService.prototype);
    service.prisma = prisma;
    service.logger = { warn: jest.fn() };
    service.verifyCaptcha = jest.fn().mockResolvedValue(false);
  });
  afterAll(() => { if (previous === undefined) delete process.env.ADMIN_LOGIN_CAPTCHA_REQUIRED; else process.env.ADMIN_LOGIN_CAPTCHA_REQUIRED = previous; });
  it('records a missing captcha without storing the submitted password', async () => {
    await expect(service.adminLogin({ username: 'admin', password: 'secret-password' }, '203.0.113.1', 'browser')).rejects.toThrow('请填写验证码');
    expect(prisma.adminLoginLog.create).toHaveBeenCalledWith({ data: { accountId: null, username: 'admin', success: false, failReason: '未填写图形验证码', ip: '203.0.113.1', ua: 'browser' } });
    expect(JSON.stringify(prisma.adminLoginLog.create.mock.calls)).not.toContain('secret-password');
  });
  it('records an incorrect or expired captcha', async () => {
    await expect(service.adminLogin({ username: 'admin', password: 'wrong', captchaId: 'captcha', captcha: 'bad' }, '203.0.113.1', 'browser')).rejects.toThrow('验证码错误');
    expect(prisma.adminLoginLog.create.mock.calls[0][0].data.failReason).toBe('图形验证码错误或已过期');
  });
  it('retains nonexistent account attempts but returns the same public login error', async () => {
    service.verifyCaptcha.mockResolvedValue(true);
    await expect(service.adminLogin({ username: 'nonexistent', password: 'wrong', captchaId: 'captcha', captcha: 'ok' })).rejects.toThrow('账号或密码错误');
    expect(prisma.adminLoginLog.create.mock.calls[0][0].data).toMatchObject({ accountId: null, username: 'nonexistent', failReason: '账号不存在', success: false });
  });
});
