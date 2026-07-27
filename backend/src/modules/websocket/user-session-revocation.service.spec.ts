import { UserSessionRevocationService } from './user-session-revocation.service';

describe('UserSessionRevocationService', () => {
  it('clears refresh state and disconnects both WebSocket implementations', async () => {
    const redis = { del: jest.fn().mockResolvedValue(undefined) };
    const wsNative = { disconnectUser: jest.fn().mockReturnValue(2) };
    const messageGateway = { disconnectUser: jest.fn().mockReturnValue(1) };
    const service = new UserSessionRevocationService(redis as any, wsNative as any, messageGateway as any);

    await expect(service.revoke('user-1')).resolves.toEqual({ nativeSockets: 2, socketIoSockets: 1 });
    expect(redis.del).toHaveBeenCalledWith('refresh:user-1');
    expect(wsNative.disconnectUser).toHaveBeenCalledWith('user-1');
    expect(messageGateway.disconnectUser).toHaveBeenCalledWith('user-1');
  });
});
