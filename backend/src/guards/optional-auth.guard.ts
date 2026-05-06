import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) return true;

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
      request['user'] = payload;
    } catch {
      // token 无效也不拦截，静默放行
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
