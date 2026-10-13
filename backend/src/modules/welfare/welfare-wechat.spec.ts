import { createCipheriv, randomBytes } from "node:crypto";
import axios from "axios";
import {
  WelfareWechatService,
  decryptGroupProof,
} from "./welfare-wechat.service";
const key = randomBytes(16).toString("base64"),
  appid = "wx_test",
  now = Date.now();
function proof(patch: any = {}) {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(key, "base64"), iv);
  const value = {
    opengid: "official_group_id",
    chat_type: 3,
    watermark: { appid, timestamp: Math.floor(now / 1000) },
    ...patch,
  };
  return {
    iv: iv.toString("base64"),
    encryptedData: Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]).toString("base64"),
  };
}
describe("微信群凭证服务端解密", () => {
  test("接受当前应用、当前用户有效群凭证", () =>
    expect(decryptGroupProof(proof(), key, appid, now)).toBe(
      "official_group_id",
    ));
  test("兼容微信群启动信息未返回 watermark 的官方结构", () => {
    const p = proof();
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-128-cbc", Buffer.from(key, "base64"), iv);
    const value = { opengid: "official_group_id", chat_type: 3 };
    p.iv = iv.toString("base64");
    p.encryptedData = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]).toString("base64");
    expect(decryptGroupProof(p, key, appid, now)).toBe("official_group_id");
  });
  test.each([
    ["wrong app", { watermark: { appid: "other", timestamp: now / 1000 } }],
    ["expired", { watermark: { appid, timestamp: (now - 301000) / 1000 } }],
    ["future", { watermark: { appid, timestamp: (now + 31000) / 1000 } }],
    ["private chat", { chat_type: 1 }],
    ["empty group", { opengid: "" }],
  ])("拒绝 %s", (_, data) =>
    expect(() => decryptGroupProof(proof(data), key, appid, now)).toThrow(),
  );
  test("其他用户的密钥和篡改密文不能验证通过", () => {
    expect(() =>
      decryptGroupProof(
        proof(),
        randomBytes(16).toString("base64"),
        appid,
        now,
      ),
    ).toThrow();
    const p = proof();
    p.encryptedData = p.encryptedData.slice(0, -10) + "tampered";
    expect(() => decryptGroupProof(p, key, appid, now)).toThrow();
  });
  test("客户端直接提交 groupId 或群码不构成凭证", () =>
    expect(() =>
      decryptGroupProof(
        { opengid: "official_group_id", verified: true },
        key,
        appid,
        now,
      ),
    ).toThrow());
});

describe("微信小程序码真实响应格式", () => {
  const cached = new Map<string, any>();
  const service = new WelfareWechatService(
    {} as any,
    {
      getJson: async (k: string) => cached.get(k),
      setJson: async (k: string, v: any) => cached.set(k, v),
    } as any,
    {
      getMiniappCredentials: async () => ({ appid: "qa_app" }),
      getMiniappAccessToken: async () => "qa_token",
    } as any,
  );
  afterEach(() => {
    jest.restoreAllMocks();
    cached.clear();
  });
  test.each([
    ["png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ["jpeg", Buffer.from([255, 216, 255])],
  ])("按实际 %s 图片类型返回并保留体验版", async (mime, signature) => {
    const send = jest
      .spyOn(axios, "post")
      .mockResolvedValue({
        data: Buffer.concat([signature as Buffer, Buffer.alloc(150)]),
      });
    const result = await service.code("pagesWelfare/detail", "c=qa", "trial");
    expect(result.image).toMatch(
      new RegExp("^data:image/" + mime + ";base64,"),
    );
    expect(send.mock.calls[0][1]).toMatchObject({ env_version: "trial" });
  });
  test("微信 JSON 错误、HTML 错误和非法版本不当作二维码", async () => {
    const send = jest
      .spyOn(axios, "post")
      .mockResolvedValue({
        data: Buffer.from(
          " " +
            JSON.stringify({ errcode: 40001, errmsg: "invalid credential" }) +
            " ".repeat(100),
        ),
      });
    await expect(service.code("pagesWelfare/detail", "c=qa")).rejects.toThrow(
      "未生成",
    );
    send.mockResolvedValue({
      data: Buffer.from("<html>" + "error".repeat(40)),
    });
    await expect(service.code("pagesWelfare/detail", "c=qa")).rejects.toThrow(
      "未生成",
    );
    await expect(
      service.code("pagesWelfare/detail", "c=qa", "invalid"),
    ).rejects.toThrow("版本无效");
  });
});

describe('群核验会话的微信身份刷新',()=>{
  afterEach(()=>jest.restoreAllMocks());
  function fixture(unionid:string|null=null){const db:any={user:{findUnique:jest.fn(async()=>({openid:'openid-qa',unionid})),update:jest.fn()}};const redis:any={incrementWindow:async()=>1,set:jest.fn()};const service=new WelfareWechatService(db,redis,{getMiniappCredentials:async()=>({appid:'qa-app',secret:'qa-secret'})} as any);return {db,redis,service};}
  test('只在微信验证同一openid后补齐UnionID，为普通入口企业群核验提供身份',async()=>{
    const {service,db}=fixture();jest.spyOn(axios,'get').mockResolvedValue({data:{openid:'openid-qa',unionid:'unionid-qa',session_key:'qa-session-key'}});
    await expect(service.refreshSession('student','wx-login-code')).resolves.toEqual({ready:true});expect(db.user.update).toHaveBeenCalledWith({where:{id:'student'},data:{unionid:'unionid-qa'}});
  });
  test('其他微信账号或冲突UnionID不能覆盖已登录用户身份或会话',async()=>{
    const {service,db,redis}=fixture('original-union');const get=jest.spyOn(axios,'get').mockResolvedValue({data:{openid:'other-openid',unionid:'original-union',session_key:'qa-session-key'}});
    await expect(service.refreshSession('student','wx-login-code')).rejects.toThrow('不一致');get.mockResolvedValue({data:{openid:'openid-qa',unionid:'different-union',session_key:'qa-session-key'}});
    await expect(service.refreshSession('student','wx-login-code')).rejects.toThrow('身份记录不一致');expect(db.user.update).not.toHaveBeenCalled();expect(redis.set).not.toHaveBeenCalled();
  });
});
