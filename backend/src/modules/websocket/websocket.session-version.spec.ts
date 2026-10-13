import { Server } from 'socket.io';
import { WsNativeGateway } from './ws-native.gateway';
import { MessageGateway } from './message.gateway';

const token = () => ({ sub: 'user-1', token_use: 'access', sv: 0, exp: Math.floor(Date.now() / 1000) + 3600 });
const fixture = () => {
  const user = { id: 'user-1', status: 'ACTIVE', authVersion: 0, deletedAt: null };
  const prisma = { user: { findUnique: jest.fn().mockImplementation(async () => ({ ...user })) } };
  const access = { assertActiveUser: jest.fn().mockResolvedValue(undefined) };
  const native = new WsNativeGateway({} as any, { get: jest.fn().mockReturnValue('true') } as any, prisma as any, {} as any, {} as any, access as any);
  const io = new MessageGateway({} as any, { get: jest.fn() } as any, {} as any, prisma as any, {} as any, access as any, {} as any);
  const ws = { readyState: 1, send: jest.fn(), close: jest.fn() };
  const client: any = { ws, userId: 'user-1', socketId: 'socket-1', isAdmin: false, authPayload: token(), lastPongAt: Date.now(), regionId: 'region-1' };
  (native as any).clients.set(client.socketId, client);
  (native as any).userSockets.set('user-1', new Set([client.socketId]));
  (native as any).groupSockets.set('group-1', new Set([client.socketId]));
  const socket: any = { id: 'io-1', data: { userId: 'user-1', isAdmin: false, authPayload: token() }, emit: jest.fn(), disconnect: jest.fn() };
  const fetchSockets = jest.fn().mockResolvedValue([socket]);
  (io as any).server = { in: jest.fn().mockReturnValue({ fetchSockets }) };
  return { user, prisma, native, io, ws, client, socket, fetchSockets, access };
};
describe('websocket persisted session version', () => {
  it('a delayed native disconnect leaves new and newer authorization sockets connected', () => {
    const f = fixture();
    const fresh = { ...f.client, socketId: 'new', authPayload: { ...token(), sv: 1 }, ws: { close: jest.fn() } };
    const newer = { ...f.client, socketId: 'newer', authPayload: { ...token(), sv: 2 }, ws: { close: jest.fn() } };
    (f.native as any).clients.set('new', fresh); (f.native as any).clients.set('newer', newer);
    (f.native as any).userSockets.set('user-1', new Set(['socket-1', 'new', 'newer']));
    expect(f.native.disconnectUserLocal('user-1', 1)).toBe(1);
    expect(f.ws.close).toHaveBeenCalledTimes(1);
    expect(fresh.ws.close).not.toHaveBeenCalled(); expect(newer.ws.close).not.toHaveBeenCalled();
  });
  it('treats verified no-purpose legacy sockets as version zero', () => {
    const f = fixture(); f.client.authPayload = { sub: 'user-1' };
    expect(f.native.disconnectUserLocal('user-1', 1)).toBe(1);
    expect(f.ws.close).toHaveBeenCalledTimes(1);
  });
  it('uses the actual Socket.IO Namespace shape and only disconnects older sessions', async () => {
    const f = fixture();
    // In-memory namespace only: no HTTP server, listen(), adapters or network clients.
    const namespace = new Server().of('/ws');
    f.io.server = namespace;
    const newer: any = { ...f.socket, id: 'io-new', data: { ...f.socket.data, authPayload: { ...token(), sv: 1 } }, disconnect: jest.fn() };
    namespace.sockets.set(f.socket.id, f.socket); namespace.sockets.set(newer.id, newer);
    namespace.adapter.addAll(f.socket.id, new Set([f.socket.id, 'user:user-1'])); namespace.adapter.addAll(newer.id, new Set([newer.id, 'user:user-1']));
    await expect(f.io.disconnectUser('user-1', 1)).resolves.toBe(1);
    expect(f.socket.disconnect).toHaveBeenCalledWith(true); expect(newer.disconnect).not.toHaveBeenCalled();
  });

  it.each([
    { token_use: 'refresh', sv: 0 }, {}, { token_use: 'access', sv: 3 },
  ])('rejects invalid credential claims at both websocket handshakes %#', async claims => {
    const f = fixture(); const payload = { sub: 'user-1', ...claims };
    (f.native as any).jwtService = { verifyAsync: jest.fn().mockResolvedValue(payload) };
    jest.spyOn(f.native as any, 'isRedisRateLimited').mockResolvedValue(false);
    await (f.native as any).handleConnection(f.ws, { url: '/ws-native?token=opaque', headers: { host: 'localhost' }, socket: {} });
    expect(f.ws.close).toHaveBeenCalledWith(4003, 'Invalid token');
    expect(f.ws.send).not.toHaveBeenCalled();
    (f.io as any).jwtService = { verifyAsync: jest.fn().mockResolvedValue(payload) };
    jest.spyOn(f.io as any, 'logSecurity').mockResolvedValue(undefined);
    f.socket.handshake = { auth: { token: 'opaque' }, headers: {}, query: {} }; f.socket.join = jest.fn();
    await f.io.handleConnection(f.socket);
    expect(f.socket.disconnect).toHaveBeenCalled(); expect(f.socket.join).not.toHaveBeenCalled();
  });
  it('checks existing native clients before inbound actions after revocation', async () => {
    const f = fixture(); f.user.authVersion = 1;
    const ping = jest.spyOn(f.native as any, 'touchRedisOnline').mockResolvedValue(undefined);
    await (f.native as any).handleMessage('socket-1', Buffer.from(JSON.stringify({ event: 'ping' })));
    expect(f.ws.close).toHaveBeenCalledWith(4003, 'Account inactive');
    expect(f.ws.send).not.toHaveBeenCalled(); expect(ping).not.toHaveBeenCalled();
  });
  it.each(['user', 'region', 'group', 'broadcast', 'redis'] as const)('does not deliver %s pushes to a revoked native socket', async kind => {
    const f = fixture(); f.user.authVersion = 1;
    if (kind === 'user') await f.native.pushToUser('user-1', { secret: 'notification' });
    if (kind === 'region') await f.native.pushToRegion('region-1', { secret: 'notification' });
    if (kind === 'group') await f.native.pushToGroup('group-1', { secret: 'notification' });
    if (kind === 'broadcast') await f.native.broadcast({ secret: 'notification' });
    if (kind === 'redis') await (f.native as any).handleRedisPushMessage(JSON.stringify({ originInstanceId: 'another-node', targetType: 'user', targetId: 'user-1', payload: { secret: 'notification' } }));
    expect(f.ws.send).not.toHaveBeenCalled();
    expect(f.ws.close).toHaveBeenCalled();
  });
  it('reports only actually authorized native recipients as delivered', async () => {
    const f = fixture();
    await expect(f.native.pushToUser('user-1', { event: 'notification' })).resolves.toBe(1);
    expect(f.ws.send).toHaveBeenCalledTimes(1);
    f.user.authVersion = 1;
    await expect(f.native.pushToUser('user-1', { event: 'notification' })).resolves.toBe(0);
    expect(f.ws.send).toHaveBeenCalledTimes(1);
  });
  it('checks existing Socket.IO senders before reading business state', async () => {
    const f = fixture(); f.user.authVersion++;
    await expect(f.io.handleTyping({ conversationId: 'private-1' }, f.socket)).rejects.toThrow('登录状态已失效');
    expect(f.socket.disconnect).toHaveBeenCalledWith(true);
    expect(f.fetchSockets).not.toHaveBeenCalled();
  });
  it('checks Socket.IO recipients on every notification including remote adapter sockets', async () => {
    const f = fixture(); await f.io.pushNotification('user-1', { secret: 'first' });
    expect(f.socket.emit).toHaveBeenCalledWith('notification', { secret: 'first' });
    f.user.authVersion++;
    await f.io.pushNotification('user-1', { secret: 'second' });
    expect(f.socket.emit).toHaveBeenCalledTimes(1); expect(f.socket.disconnect).toHaveBeenCalledWith(true);
  });
  it.each(['native', 'io'] as const)('fails closed on database loss for %s output', async kind => {
    const f = fixture(); f.prisma.user.findUnique.mockRejectedValue(new Error('offline'));
    if (kind === 'native') { await f.native.pushToUser('user-1', { secret: 'data' }); expect(f.ws.send).not.toHaveBeenCalled(); }
    else { await f.io.pushNotification('user-1', { secret: 'data' }); expect(f.socket.emit).not.toHaveBeenCalled(); }
  });
  it.each(['native', 'io'] as const)('expires an existing %s connection without requiring reconnect', async kind => {
    const f = fixture(); f.client.authPayload.exp = 1; f.socket.data.authPayload.exp = 1;
    if (kind === 'native') { await f.native.pushToUser('user-1', {}); expect(f.ws.send).not.toHaveBeenCalled(); }
    else { await f.io.pushNotification('user-1', {}); expect(f.socket.emit).not.toHaveBeenCalled(); }
  });
});
