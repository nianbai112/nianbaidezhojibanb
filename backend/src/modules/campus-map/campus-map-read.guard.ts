import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

// This endpoint additionally requires the local service identity and JwtGuard.
// A token fingerprint avoids grouping an entire campus NAT into one quota and
// never places a bearer token in Redis rate-limit keys.
export function campusMapReadThrottleTracker(request: Record<string, any>): string {
  const token = request.headers?.authorization;
  const identity = typeof token === 'string' ? token : 'missing-token';
  return `campus-map-read:${createHash('sha256').update(identity).digest('hex')}`;
}

/** Internal, read-only snapshot export. Never reuse the JWT signing secret. */
@Injectable()
export class CampusMapReadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const peer = String(request.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    const expected = process.env.CAMPUS_MAP_READ_TOKEN || '';
    const supplied = request.headers?.['x-campus-map-read-token'];
    if (!['127.0.0.1', '::1'].includes(peer)
      || expected.length < 32
      || typeof supplied !== 'string'
      || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      throw new UnauthorizedException('地图内部读取身份无效');
    }
    return true;
  }
}
