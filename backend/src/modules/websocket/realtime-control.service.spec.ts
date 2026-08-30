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

    expect(gateway.disconnectUser("user-1")).toBe(0);
    expect(publish).toHaveBeenCalledWith(
      "lm:ws:realtime:control",
      expect.stringContaining('"command":"disconnect_user"'),
    );
  });

  it("disconnects both realtime transports when a command arrives", () => {
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

    (service as any).handleCommand(
      JSON.stringify({
        command: "disconnect_user",
        data: { userId: "user-1" },
      }),
    );

    expect(wsNative.disconnectUserLocal).toHaveBeenCalledWith("user-1");
    expect(messageGateway.disconnectUser).toHaveBeenCalledWith("user-1");
  });
});
