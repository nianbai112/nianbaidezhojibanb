import { WsException } from '@nestjs/websockets';
import { MessageGateway } from './message.gateway';

describe('MessageGateway legacy write entry', () => {
  it('rejects the deprecated Socket.IO sendMessage event before it can write a message', async () => {
    const userAccess = { assertActiveUser: jest.fn().mockResolvedValue({ id: 'user-1' }) };
    const gateway = new MessageGateway(
      {} as any,
      { get: jest.fn().mockReturnValue('test') } as any,
      {} as any,
      {} as any,
      {} as any,
      userAccess as any,
      {} as any,
    );
    const client = { data: { userId: 'user-1', isAdmin: false } };

    await expect(gateway.rejectLegacySendMessage(client as any)).rejects.toBeInstanceOf(WsException);
    expect(userAccess.assertActiveUser).toHaveBeenCalledWith('user-1', '发送消息');
  });

  it('rejects rider-password tokens on the legacy Socket.IO connection surface', async () => {
    const userAccess = { assertActiveUser: jest.fn().mockResolvedValue({ id: 'user-1' }) };
    const gateway = new MessageGateway(
      { verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        authSource: 'rider_password',
        credentialId: 'rider-password-login',
        credentialVersion: 4,
      }) } as any,
      { get: jest.fn((key: string) => key === 'JWT_SECRET' ? 'secret' : '') } as any,
      {} as any,
      { serverActionLog: { create: jest.fn() } } as any,
      {} as any,
      userAccess as any,
      {} as any,
    );
    const client = {
      id: 'socket-1',
      data: {},
      handshake: { auth: { token: 'password-token' }, headers: {}, query: {}, address: '127.0.0.1' },
      disconnect: jest.fn(),
      join: jest.fn(),
    };

    await gateway.handleConnection(client as any);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
    expect(userAccess.assertActiveUser).not.toHaveBeenCalled();
  });
});
