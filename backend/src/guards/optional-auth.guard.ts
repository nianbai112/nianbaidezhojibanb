import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/services/prisma.service';
import { readAccessSession } from '../common/user-token-policy';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) return true;

    let payload: any;
    delete request.user;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
    } catch {
      return true; // An invalid token may only continue as an anonymous visitor.
    }
    if (payload.isAdmin === true) return true;
    try {
      const user = await readAccessSession(this.prisma, payload);
      if (user.status === 'ACTIVE') request.user = payload;
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    }
    return true;
  }

  private extractToken(request: any): string | undefined {
    const auth = request.headers?.authorization || request.headers?.Authorization;
    if (!auth) return undefined;
    if (auth.startsWith('Bearer ')) return auth.slice(7);
    if (auth.length > 20 && !auth.includes(' ')) return auth;
    return undefined;
  }
}
