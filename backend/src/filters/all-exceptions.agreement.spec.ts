jest.mock('../common/services/logger.service', () => ({ LoggerService: class {} }));
import { BadRequestException, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter stable agreement error codes', () => {
  const run = (error: Error, url = '/api/wx-auth/login') => {
    const logger = { error: jest.fn() };
    const prisma = { serverLog: { create: jest.fn().mockResolvedValue({}) } };
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const request = { url, method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    new AllExceptionsFilter(logger as any, prisma as any).catch(error, {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as any);
    return { logger, prisma, response, body: response.json.mock.calls[0][0] };
  };

  it.each([
    { status: 409, error: new ConflictException({ code: 'AGREEMENT_UPDATED', message: '协议已更新，请重新阅读' }), business: 'AGREEMENT_UPDATED' },
    { status: 400, error: new BadRequestException({ code: 'AGREEMENT_PROOF_REQUIRED', message: '请提交协议证明' }), business: 'AGREEMENT_PROOF_REQUIRED' },
  ])('keeps numeric HTTP code $status and adds the string business code', ({ status, error, business }) => {
    const result = run(error);
    expect(result.response.status).toHaveBeenCalledWith(status);
    expect(result.body).toMatchObject({ code: status, error_code: business, data: null, timestamp: expect.any(String) });
    expect(typeof result.body.code).toBe('number');
    expect(typeof result.body.error_code).toBe('string');
    expect(result.prisma.serverLog.create).not.toHaveBeenCalled();
  });

  it.each([409, '', 'lowercase_code', 'code with spaces', '<private-content>', 'A'.repeat(65)])('does not expose noncanonical business code %p', (code) => {
    const result = run(new ConflictException({ code, message: '请求冲突' }));
    expect(result.body.code).toBe(409);
    expect(result.body.error_code).toBeUndefined();
    expect(JSON.parse(JSON.stringify(result.body))).not.toHaveProperty('error_code');
  });

  it('preserves existing validation arrays and plain string exceptions', () => {
    const validation = run(new BadRequestException({ message: ['code不能为空', 'phone格式错误'] }));
    expect(validation.body).toMatchObject({ code: 400, message: ['code不能为空', 'phone格式错误'] });
    const plain = run(new BadRequestException('风格无效'));
    expect(plain.body).toMatchObject({ code: 400, message: '风格无效' });
    expect(plain.body.error_code).toBeUndefined();
  });

  it('keeps unknown server failures generic instead of treating Error.code as a public business code', () => {
    const error = Object.assign(new Error('PRIVATE_DATABASE_DETAIL'), { code: 'AGREEMENT_UPDATED' });
    const result = run(error);
    expect(result.body).toMatchObject({ code: 500, message: '服务器内部错误，请稍后重试' });
    expect(result.body.error_code).toBeUndefined();
    expect(result.prisma.serverLog.create).toHaveBeenCalledTimes(1);
  });

  it('redacts App OAuth query and raw exception details from failure logs', () => {
    const result = run(new Error('PRIVATE_CODE_IN_ERROR'), '/api/v1/wx-auth/app-login?code=PRIVATE_QUERY');
    expect(JSON.stringify([result.logger.error.mock.calls, result.prisma.serverLog.create.mock.calls, result.body])).not.toContain('PRIVATE_');
    expect(result.body.path).toBe('/api/v1/wx-auth/app-login');
    expect(result.prisma.serverLog.create.mock.calls[0][0].data.detail.name).toBe('AppLoginRequestError');
  });

  it('preserves WeChat query and exception-detail redaction while carrying an allowed business code', () => {
    const result = run(
      new HttpException({ code: 'AGREEMENT_UPDATED', message: 'PRIVATE_WECHAT_PROVIDER_CONTENT' }, HttpStatus.INTERNAL_SERVER_ERROR),
      '/api/admin/wechat-chat/preview?text=PRIVATE_WECHAT_QUERY',
    );
    const logs = JSON.stringify([result.logger.error.mock.calls, result.prisma.serverLog.create.mock.calls]);
    expect(logs).not.toContain('PRIVATE_WECHAT_PROVIDER_CONTENT');
    expect(logs).not.toContain('PRIVATE_WECHAT_QUERY');
    expect(result.body).toMatchObject({ code: 500, error_code: 'AGREEMENT_UPDATED', path: '/api/admin/wechat-chat/preview' });
    expect(result.prisma.serverLog.create.mock.calls[0][0].data.detail.name).toBe('WechatRequestError');
  });
});
