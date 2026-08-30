import { SocketIoRedisStateService } from "./socket-io-redis-state.service";

describe("SocketIoRedisStateService", () => {
  it("is ready only after both clients are ready and the adapter is applied", () => {
    const state = new SocketIoRedisStateService();
    const pubClient = { status: "ready" } as any;
    const subClient = { status: "ready" } as any;

    state.bindClients(pubClient, subClient);
    expect(state.isReady()).toBe(false);

    state.markApplied();
    expect(state.isReady()).toBe(true);

    subClient.status = "reconnecting";
    expect(state.isReady()).toBe(false);

    state.clear();
    expect(state.isReady()).toBe(false);
  });
});
