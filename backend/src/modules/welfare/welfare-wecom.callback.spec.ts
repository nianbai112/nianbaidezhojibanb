import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { decryptWecomCallback, parseWecomXml } from "./welfare-wecom.callback";
import { WelfareWecomCallbackController } from "./welfare-wecom.controller";
const key = randomBytes(32),
  config = {
    corpId: "ww_test",
    callbackToken: "test-token",
    encodingAESKey: key.toString("base64").slice(0, -1),
  };
function encrypted(
  message: string,
  corpId = config.corpId,
  paddingError = false,
) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(Buffer.byteLength(message));
  const raw = Buffer.concat([
      randomBytes(16),
      length,
      Buffer.from(message),
      Buffer.from(corpId),
    ]),
    pad = 32 - (raw.length % 32);
  const padded = Buffer.concat([raw, Buffer.alloc(pad, pad)]);
  if (paddingError) padded[padded.length - 1] = 0;
  const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  const value = Buffer.concat([cipher.update(padded), cipher.final()]).toString(
    "base64",
  );
  const query = {
    timestamp: String(Math.floor(Date.now() / 1000)),
    nonce: "nonce-test",
    msg_signature: createHash("sha1")
      .update(
        [
          config.callbackToken,
          String(Math.floor(Date.now() / 1000)),
          "nonce-test",
          value,
        ]
          .sort()
          .join(""),
      )
      .digest("hex"),
  };
  return { value, query };
}
describe("企业微信加密回调", () => {
  test("URL验证返回原始echostr，成员事件验签解密后只使官方群快照失效", async () => {
    const service: any = { config: async () => config, invalidate: jest.fn() };
    const controller = new WelfareWecomCallbackController(service);
    const response: any = { type: jest.fn().mockReturnThis(), send: jest.fn() };
    const echo = encrypted("echo-123");
    await controller.verify({ ...echo.query, echostr: echo.value }, response);
    expect(response.send).toHaveBeenCalledWith("echo-123");
    const event = encrypted(
      "<xml><ToUserName><![CDATA[ww_test]]></ToUserName><Event><![CDATA[change_external_chat]]></Event><ChatId><![CDATA[chat-a]]></ChatId><UpdateDetail>del_member</UpdateDetail></xml>",
    );
    await controller.event(
      event.query,
      {
        rawBody: Buffer.from(
          "<xml><Encrypt><![CDATA[" + event.value + "]]></Encrypt></xml>",
        ),
      },
      undefined,
      response,
    );
    expect(service.invalidate).toHaveBeenCalledWith("ww_test", "chat-a");
    expect(response.send).toHaveBeenLastCalledWith("success");
  });
  test("伪造签名、过期回放、错企业、非法padding与篡改密文均不能更新状态", () => {
    const a = encrypted("echo");
    expect(() =>
      decryptWecomCallback(
        { ...a.query, msg_signature: "0".repeat(40) },
        a.value,
        config,
      ),
    ).toThrow("签名");
    expect(() =>
      decryptWecomCallback(a.query, a.value, config, Date.now() + 601000),
    ).toThrow("签名");
    const b = encrypted("echo", "other-enterprise");
    expect(() => decryptWecomCallback(b.query, b.value, config)).toThrow(
      "解密",
    );
    const c = encrypted("echo", config.corpId, true);
    expect(() => decryptWecomCallback(c.query, c.value, config)).toThrow(
      "解密",
    );
    expect(() =>
      decryptWecomCallback(a.query, a.value.slice(0, -4) + "AAAA", config),
    ).toThrow("签名");
  });
  test.each([
    '<!DOCTYPE xml [<!ENTITY test "value">]><xml>&test;</xml>',
    "<xml><broken></xml>",
    "<xml>" + "x".repeat(66000) + "</xml>",
  ])("拒绝实体扩展、畸形XML与超大请求", (xml) => {
    expect(() => parseWecomXml(xml)).toThrow("格式错误");
  });
  test("非群事件与不匹配ToUserName不会触发成员更新", async () => {
    const service: any = { config: async () => config, invalidate: jest.fn() };
    const controller = new WelfareWecomCallbackController(service);
    const response: any = { type: () => response, send: jest.fn() };
    for (const event of [
      "<xml><ToUserName>other</ToUserName><Event>change_external_chat</Event><ChatId>chat-a</ChatId></xml>",
      "<xml><ToUserName>ww_test</ToUserName><Event>change_external_contact</Event><ChatId>chat-a</ChatId></xml>",
    ]) {
      const a = encrypted(event);
      await controller.event(
        a.query,
        {},
        "<xml><Encrypt>" + a.value + "</Encrypt></xml>",
        response,
      );
    }
    expect(service.invalidate).not.toHaveBeenCalled();
  });
});
