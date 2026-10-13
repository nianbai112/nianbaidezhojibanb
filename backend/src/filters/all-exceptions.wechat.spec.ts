jest.mock('../common/services/logger.service', () => ({ LoggerService: class {} }));
import { BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('WeChat exception privacy', () => {
  function run(error: Error, url: string) {
    const logger = { error: jest.fn() };
    const prisma = { serverLog: { create: jest.fn().mockResolvedValue({}) } };
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const request = { url, method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    new AllExceptionsFilter(logger as any, prisma as any).catch(error, { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as any);
    return { logger, prisma, response };
  }
  it('does not leak provider/Prisma message bodies or query strings into common exception logs', () => {
    const r = run(new Error('PRIVATE_PROVIDER_OR_DATABASE_ECHO'), '/api/admin/wechat-chat/preview?text=PRIVATE_QUERY');
    const logs = JSON.stringify([r.logger.error.mock.calls, r.prisma.serverLog.create.mock.calls]);
    expect(logs).not.toContain('PRIVATE_PROVIDER_OR_DATABASE_ECHO');
    expect(logs).not.toContain('PRIVATE_QUERY');
    expect(r.prisma.serverLog.create.mock.calls[0][0].data.path).toBe('/api/admin/wechat-chat/preview');
  });
  it('keeps useful field validation feedback in the response', () => {
    const r = run(new BadRequestException('风格无效'), '/api/admin/wechat-chat/settings');
    expect(r.response.status).toHaveBeenCalledWith(400);
    expect(r.response.json).toHaveBeenCalledWith(expect.objectContaining({ message: '风格无效' }));
  });
  it('retains normal exception diagnostics for other routes', () => {
    const r = run(new Error('ordinary diagnostic'), '/api/healthz');
    expect(JSON.stringify(r.logger.error.mock.calls)).toContain('ordinary diagnostic');
  });
  it.each(['app-login', 'apple/notifications'])('redacts provider exception echoes and queries for %s', (endpoint) => {
    const r = run(new Error('PRIVATE_APPLE_JWT_OR_REFRESH'), `/api/v1/wx-auth/${endpoint}?payload=PRIVATE_QUERY`);
    expect(JSON.stringify([r.logger.error.mock.calls, r.prisma.serverLog.create.mock.calls])).not.toContain('PRIVATE_');
  });
});
