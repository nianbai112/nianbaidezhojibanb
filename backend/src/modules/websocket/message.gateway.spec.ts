import { WsException } from "@nestjs/websockets";
import { MessageGateway } from "./message.gateway";

describe("MessageGateway legacy write entry", () => {
  it("rejects the deprecated Socket.IO sendMessage event before it can write a message", async () => {
    const userAccess = {
      assertActiveUser: jest.fn().mockResolvedValue({ id: "user-1" }),
    };
    const gateway = new MessageGateway(
      {} as any,
      { get: jest.fn().mockReturnValue("test") } as any,
      {} as any,
      {} as any,
      {} as any,
      userAccess as any,
      {} as any,
    );
    const client = { data: { userId: "user-1", isAdmin: false } };

    await expect(
      gateway.rejectLegacySendMessage(client as any),
    ).rejects.toBeInstanceOf(WsException);
    expect(userAccess.assertActiveUser).toHaveBeenCalledWith(
      "user-1",
      "发送消息",
    );
  });
});
