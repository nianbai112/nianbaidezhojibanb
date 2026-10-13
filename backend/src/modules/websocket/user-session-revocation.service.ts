import { Injectable, Optional, Logger } from '@nestjs/common';
import { RedisService } from '../../common/services/redis.service';
import { PrismaService } from '../../common/services/prisma.service';
import { assertRevocationCutoff, clearRefreshSessionsBefore } from '../../common/session-refresh-cleanup';
import { MessageGateway } from './message.gateway';
import { WsNativeGateway } from './ws-native.gateway';

/** Revokes every server-managed session surface after an account becomes unavailable. */
@Injectable()
export class UserSessionRevocationService {
  private readonly logger = new Logger(UserSessionRevocationService.name);
  constructor(
    private readonly redis: RedisService,
    private readonly wsNative: WsNativeGateway,
    private readonly prisma: PrismaService,
    @Optional() private readonly messageGateway?: MessageGateway,
  ) {}

  async revoke(userId: string, options: { versionAlreadyRevoked?: boolean; invalidBeforeVersion?: number } = {}) {
    let cutoff = options.invalidBeforeVersion;
    if (!options.versionAlreadyRevoked) {
      // Capture the version from this exact atomic write, never a later read.
      const user = await this.prisma.user.update({
        where: { id: userId }, data: { authVersion: { increment: 1 } }, select: { authVersion: true },
      });
      cutoff = user.authVersion;
    }
    assertRevocationCutoff(cutoff!);
    try { await clearRefreshSessionsBefore(this.redis, userId, cutoff!); }
    catch { this.logger.warn('Refresh cleanup unavailable after durable session revocation'); }
    const nativeSockets = this.wsNative.disconnectUser(userId, cutoff!);
    const socketIoSockets = this.messageGateway ? await this.messageGateway.disconnectUser(userId, cutoff!) : 0;
    return { nativeSockets, socketIoSockets };
  }
}
