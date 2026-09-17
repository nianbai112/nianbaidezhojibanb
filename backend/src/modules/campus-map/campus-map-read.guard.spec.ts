import { UnauthorizedException } from '@nestjs/common';
import { CampusMapReadGuard, campusMapReadThrottleTracker } from './campus-map-read.guard';

describe('CampusMapReadGuard', () => {
  const originalToken = process.env.CAMPUS_MAP_READ_TOKEN;
  const token = 'unit-test-map-read-token-32-characters';
  const guard = new CampusMapReadGuard();
  const context = (peer: string, supplied: unknown) => ({
    switchToHttp: () => ({ getRequest: () => ({ socket: { remoteAddress: peer }, headers: { 'x-campus-map-read-token': supplied } }) }),
  } as any);
  beforeEach(() => { process.env.CAMPUS_MAP_READ_TOKEN = token; });
  afterAll(() => {
    if (originalToken === undefined) delete process.env.CAMPUS_MAP_READ_TOKEN;
    else process.env.CAMPUS_MAP_READ_TOKEN = originalToken;
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('allows a signed local read from %s', (peer) => {
    expect(guard.canActivate(context(peer, token))).toBe(true);
  });
  it.each([undefined, '', 'wrong', [token], token + 'x'])('rejects missing or malformed service credentials', (supplied) => {
    expect(() => guard.canActivate(context('127.0.0.1', supplied))).toThrow(UnauthorizedException);
  });
  it('does not trust forwarded IP headers to authorize a remote caller', () => {
    expect(() => guard.canActivate(context('203.0.113.1', token))).toThrow(UnauthorizedException);
  });
  it('fails closed when the internal token is not configured', () => {
    delete process.env.CAMPUS_MAP_READ_TOKEN;
    expect(() => guard.canActivate(context('127.0.0.1', token))).toThrow(UnauthorizedException);
  });

  it('separates students sharing a campus IP without putting tokens in quota keys', () => {
    const a = campusMapReadThrottleTracker({ headers: { authorization: 'Bearer student-a' } });
    const b = campusMapReadThrottleTracker({ headers: { authorization: 'Bearer student-b' } });
    expect(a).not.toBe(b);
    expect(a).not.toContain('student-a');
    expect(a).toBe(campusMapReadThrottleTracker({ headers: { authorization: 'Bearer student-a' } }));
  });
});
