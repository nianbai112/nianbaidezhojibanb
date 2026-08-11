import { Injectable } from '@nestjs/common';
import { RedisService } from '../../common/services/redis.service';
import { MessageGateway } from './message.gateway';
import { WsNativeGateway } from './ws-native.gateway';

/** Revokes every server-managed session surface after an account becomes unavailable. */
@Injectable()
export class UserSessionRevocationService {
  constructor(
    private readonly redis: RedisService,
    private readonly wsNative: WsNativeGateway,
    private readonly messageGateway: MessageGateway,
  ) {}

  async revoke(userId: string) {
    await this.redis.del(`refresh:${userId}`).catch(() => undefined);
    const nativeSockets = this.wsNative.disconnectUser(userId);
    const socketIoSockets = this.messageGateway.disconnectUser(userId);
    return { nativeSockets, socketIoSockets };
  }
}
