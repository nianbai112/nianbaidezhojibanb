import { RealtimeControlService } from "./realtime-control.service";
import { WsNativeGateway } from "./ws-native.gateway";

describe("Realtime control bridge", () => {
  it("publishes disconnect commands from non-realtime processes", () => {
    const publish = jest.fn().mockResolvedValue(1);
    const gateway = new WsNativeGateway(
      {} as any,
      {
        get: jest.fn((key: string) => {
          if (key === "DB_IS_INSTALLED") return "1";
          if (key === "SETUP_WIZARD") return "false";
          return undefined;
        }),
      } as any,
      {} as any,
      { getClient: () => ({ publish }) } as any,
      {} as any,
      {} as any,
    );

    expect(gateway.disconnectUser("user-1", 3)).toBe(0);
    expect(JSON.parse(publish.mock.calls[0][1]).data).toEqual({ userId: "user-1", invalidBeforeVersion: 3 });
    expect(publish).toHaveBeenCalledWith(
      "lm:ws:realtime:control",
      expect.stringContaining('"command":"disconnect_user"'),
    );
  });

  it("disconnects both realtime transports when a command arrives", async () => {
    const wsNative = {
      disconnectUserLocal: jest.fn().mockReturnValue(2),
    };
    const messageGateway = {
      disconnectUser: jest.fn().mockReturnValue(1),
    };
    const service = new RealtimeControlService(
      {} as any,
      {} as any,
      wsNative as any,
      messageGateway as any,
    );

    await (service as any).handleCommand(
      JSON.stringify({
        command: "disconnect_user",
        data: { userId: "user-1", invalidBeforeVersion: 3 },
      }),
    );

    expect(wsNative.disconnectUserLocal).toHaveBeenCalledWith("user-1", 3);
    expect(messageGateway.disconnectUser).toHaveBeenCalledWith("user-1", 3);
  });
  it("ignores old or malformed unbounded disconnect commands", async () => {
    const wsNative = { disconnectUserLocal: jest.fn() };
    const messageGateway = { disconnectUser: jest.fn() };
    const service = new RealtimeControlService({} as any, {} as any, wsNative as any, messageGateway as any);
    for (const cutoff of [undefined, 0, -1, "1"]) {
      await (service as any).handleCommand(JSON.stringify({ command: "disconnect_user", data: { userId: "user-1", invalidBeforeVersion: cutoff } }));
    }
    expect(wsNative.disconnectUserLocal).not.toHaveBeenCalled();
    expect(messageGateway.disconnectUser).not.toHaveBeenCalled();
  });

});
