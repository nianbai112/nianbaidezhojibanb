import {
  buildMomentBody,
  extractMessageId,
  extractQrFromJson,
  normalizeCdnid,
  parseJsonKeepingBigInts,
  WechatpadClient,
  WechatpadError,
} from "./wechatpad.client";

const config = {
  baseUrl: "https://gw.example.com/",
  appKey: "k",
  appSecret: "s",
  deviceId: "dev1",
  cdnBaseUrl: "https://cdn.example.com",
  cdnToken: "tok",
};

describe("wechatpad client helpers", () => {
  it("keeps uint64 moment ids exact", () => {
    const parsed = parseJsonKeepingBigInts(
      '{"errmsg":"","resp":{"id":14962494110775251489,"content_style":1,"medias":[{"width":640}]}}',
    );
    expect(parsed.resp.id).toBe("14962494110775251489");
    expect(parsed.resp.content_style).toBe(1);
    expect(parsed.resp.medias[0].width).toBe(640);
  });

  it("strips a full cdnMidUrl down to the cdnid segment", () => {
    expect(
      normalizeCdnid("http://mmsns.qpic.cn/mmsns/YiaPCuFNedkbxdC6fRibmic8/0"),
    ).toBe("YiaPCuFNedkbxdC6fRibmic8");
    expect(normalizeCdnid("YiaPCuFNedkbxdC6fRibmic8")).toBe(
      "YiaPCuFNedkbxdC6fRibmic8",
    );
  });

  it("builds the documented single-image body with empty caption", () => {
    const body = buildMomentBody("dev1", [
      { cdnid: "a", width: 750, height: 1334, totalSize: 1000 },
    ]);
    expect(body).toEqual({
      device_id: "dev1",
      content: "",
      cdnid: "a",
      width: 750,
      height: 1334,
      total_size: 1000,
    });
  });

  it("adds medias for multi-image moments", () => {
    const body: any = buildMomentBody("dev1", [
      { cdnid: "a", width: 750, height: 1334, totalSize: 1 },
      { cdnid: "b", width: 750, height: 1334, totalSize: 2 },
    ]);
    expect(body.cdnid).toBe("a");
    expect(body.medias.map((m: any) => m.cdnid)).toEqual(["a", "b"]);
    expect(body.medias[1].total_size).toBe(2);
  });
});

describe("WechatpadClient", () => {
  const http = { post: jest.fn() };
  const client = new WechatpadClient(config, http as any);

  beforeEach(() => http.post.mockReset());

  it("sends auth headers and returns the sns id as string", async () => {
    http.post.mockResolvedValue({
      data: '{"errmsg":"","resp":{"id":14962494110775251489,"medias":[{},{}]}}',
    });
    const result = await client.postImages([
      { cdnid: "a", width: 1, height: 1, totalSize: 1 },
      { cdnid: "b", width: 1, height: 1, totalSize: 1 },
    ]);
    expect(result).toMatchObject({
      snsId: "14962494110775251489",
      mediaCount: 2,
    });
    const [url, , options] = http.post.mock.calls[0];
    expect(url).toBe("https://gw.example.com/sns/post_image_by_cdnid");
    expect(options.headers).toMatchObject({
      "X-App-Key": "k",
      "X-App-Secret": "s",
    });
  });

  it("treats a missing response on publish as ambiguous", async () => {
    http.post.mockRejectedValue(
      Object.assign(new Error("timeout of 30000ms exceeded"), {
        code: "ECONNABORTED",
      }),
    );
    await expect(
      client.postImages([{ cdnid: "a", width: 1, height: 1, totalSize: 1 }]),
    ).rejects.toMatchObject({ ambiguous: true });
  });

  it("treats HTTP 500 after publish as ambiguous to avoid duplicate sends", async () => {
    http.post.mockRejectedValue({
      response: { status: 500, data: '{"errmsg":"ret=201"}' },
    });
    const error = await client
      .postImages([{ cdnid: "a", width: 1, height: 1, totalSize: 1 }])
      .catch((e) => e);
    expect(error).toBeInstanceOf(WechatpadError);
    expect(error.ambiguous).toBe(true);
    expect(error.message).toContain("ret=201");
  });

  it("rejects a publish response without an id", async () => {
    http.post.mockResolvedValue({ data: '{"errmsg":"device offline"}' });
    await expect(
      client.postImages([{ cdnid: "a", width: 1, height: 1, totalSize: 1 }]),
    ).rejects.toThrow("device offline");
  });

  it("uploads to the self-hosted CDN with the token and normalizes cdnid", async () => {
    http.post.mockResolvedValue({
      data: '{"base":{"errcode":0},"cdnid":"http://mmsns.qpic.cn/mmsns/XYZ/0","width":750,"height":1334}',
    });
    const result = await client.uploadSnsImage(
      { auth_key: "x" },
      Buffer.from("img"),
    );
    expect(result).toEqual({ cdnid: "XYZ", width: 750, height: 1334 });
    const [url, body, options] = http.post.mock.calls[0];
    expect(url).toBe("https://cdn.example.com/v1/cdn/upload_sns_image");
    expect(body.cdn_info).toEqual({ auth_key: "x" });
    expect(body.cdnInfo).toBeUndefined();
    expect(body.image).toBe(Buffer.from("img").toString("base64"));
    expect(options.headers["X-Cdn-Token"]).toBe("tok");
    expect(options.headers["X-App-Key"]).toBeUndefined();
    expect(options.headers["X-App-Secret"]).toBeUndefined();
    expect(options.maxRedirects).toBe(0);
  });
});

describe("login helpers", () => {
  it("extracts a QR image from common JSON shapes", () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
    const a: any = extractQrFromJson({
      data: { qr_base64: `data:image/png;base64,${png}` },
    });
    expect(a.mimeType).toBe("image/png");
    const b: any = extractQrFromJson({ qrcode: "iVBORw0KGgoAAAA" });
    expect(b.mimeType).toBe("image/png");
    const c: any = extractQrFromJson({ qr_url: "http://weixin.qq.com/x/abc" });
    expect(c.url).toBe("http://weixin.qq.com/x/abc");
    expect(() => extractQrFromJson({ errmsg: "device busy" })).toThrow(
      "device busy",
    );
  });

  it("reads device_id from /device/init", async () => {
    const http = {
      post: jest.fn(async () => ({ data: '{"device_id":"abc123"}' })),
    };
    const client = new WechatpadClient(
      { ...config, deviceId: "" },
      http as any,
    );
    await expect(client.initDevice()).resolves.toMatchObject({
      deviceId: "abc123",
    });
  });

  it("returns a PNG login QR as-is", async () => {
    const png = Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      Buffer.alloc(8),
    ]);
    const http = {
      post: jest.fn(async (..._args: any[]) => ({
        data: png,
        headers: { "content-type": "image/png" },
      })),
    };
    const client = new WechatpadClient(config, http as any);
    const result: any = await client.loginQrImage();
    expect(result.mimeType).toBe("image/png");
    expect(http.post.mock.calls[0][0]).toBe(
      "https://gw.example.com/login/qr?device_id=dev1",
    );
  });
});

describe("image upload errors", () => {
  it("explains a missing upload endpoint", async () => {
    const http = {
      post: jest.fn(async () =>
        Promise.reject({
          response: { status: 404, data: "404 page not found" },
        }),
      ),
    };
    const client = new WechatpadClient(config, http as any);
    await expect(client.uploadSnsImage({}, Buffer.from("x"))).rejects.toThrow(
      "图片服务地址",
    );
  });
});

describe("WechatpadClient text receipt contract", () => {
  const http = { post: jest.fn() };
  const client = new WechatpadClient(config, http as any);
  beforeEach(() => http.post.mockReset());

  it("confirms a successful receipt only with an exact remote message id", async () => {
    http.post.mockResolvedValue({
      data: '{"ret":0,"new_msg_id":14962494110775251489}',
    });
    await expect(
      client.sendText("wxid_friend", "消息 14962494110775251489"),
    ).resolves.toEqual({ messageId: "14962494110775251489", confirmed: true });
    expect(http.post.mock.calls[0][0]).toBe(
      "https://gw.example.com/message/send",
    );
    expect(http.post.mock.calls[0][1]).toEqual({
      device_id: "dev1",
      to: "wxid_friend",
      content: "消息 14962494110775251489",
    });
    expect(
      parseJsonKeepingBigInts('{"content":"\\\"id\\\":14962494110775251489"}')
        .content,
    ).toBe('"id":14962494110775251489');
  });

  it("leaves unknown successful HTTP response shapes unconfirmed", async () => {
    http.post.mockResolvedValue({ data: '{"success":true}' });
    await expect(client.sendText("wxid_friend", "你好")).resolves.toEqual({
      messageId: null,
      confirmed: false,
    });
  });

  it("distinguishes a rejection from an ambiguous server error", async () => {
    http.post.mockResolvedValue({ data: '{"ret":-1}' });
    await expect(client.sendText("wxid_friend", "你好")).rejects.toMatchObject({
      ambiguous: false,
    });
    http.post.mockRejectedValue({
      response: { status: 500, data: "internal error" },
    });
    await expect(client.sendText("wxid_friend", "你好")).rejects.toMatchObject({
      ambiguous: true,
    });
  });
});

describe('cdn info', () => {
  it('asks the gateway for the sns pool', async () => {
    const http = { post: jest.fn(async (..._args: any[]) => ({ data: '{"uin":1,"front_ips":["1.1.1.1"],"auth_key":"abc"}' })) };
    const client = new WechatpadClient(config, http as any);
    await client.getCdnInfo();
    expect(http.post.mock.calls[0][1]).toEqual({ device_id: 'dev1', pool: 'sns' });
  });
});

describe('sendText (wechat-chat)', () => {
  it.each([
    '{"ret":-1,"data":{"new_msg_id":"42","ok":true}}',
    '{"ret":0,"data":{"base_resp":{"ret":-2},"msgId":"42"}}',
    '{"ok":false,"resp":{"ret":0,"msgId":"42"}}',
  ])('rejects an explicit error even when a message ID is present: %s', async (data) => {
    const http = { post: jest.fn(async () => ({ data })) };
    await expect(new WechatpadClient(config, http as any).sendText('wxid_a', 'hi'))
      .rejects.toMatchObject({ ambiguous: false });
  });

  it('keeps ID-only responses unconfirmed and ignores echoed or conflicting IDs', async () => {
    const http = { post: jest.fn(async () => ({ data: '{"data":{"MsgId":"42"}}' })) };
    await expect(new WechatpadClient(config, http as any).sendText('wxid_a', 'hi'))
      .resolves.toEqual({ messageId: '42', confirmed: false });
    expect(extractMessageId({ ret: 0, request: { msgId: '42' } })).toBeNull();
    expect(extractMessageId({ list: [{ msgId: '42' }, { msgId: '43' }] })).toBeNull();
    expect(extractMessageId({ msgId: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
    expect(extractMessageId({ msgId: { value: '42' } })).toBeNull();
  });

  it('confirms a nested alternate ID only with a successful response status', async () => {
    const http = { post: jest.fn(async () => ({ data: '{"base_resp":{"ret":0},"data":{"NewMsgId":18446744073709551615}}' })) };
    await expect(new WechatpadClient(config, http as any).sendText('wxid_a', 'hi'))
      .resolves.toEqual({ messageId: '18446744073709551615', confirmed: true });
  });

  it('treats an HTTP 408 after sending as unknown, not safe to retry', async () => {
    const http = { post: jest.fn(async () => Promise.reject({ response: { status: 408, data: 'timeout' } })) };
    await expect(new WechatpadClient(config, http as any).sendText('wxid_a', 'hi'))
      .rejects.toMatchObject({ ambiguous: true });
  });

  it('posts to /message/send and keeps the uint64 message id exact', async () => {
    const http = { post: jest.fn(async (..._args: any[]) => ({ data: '{"ret":0,"data":{"new_msg_id":12345678901234567890}}' })) };
    const client = new WechatpadClient(config, http as any);
    await expect(client.sendText('wxid_a', '你好')).resolves.toEqual({ messageId: '12345678901234567890', confirmed: true });
    expect(http.post.mock.calls[0][0]).toBe('https://gw.example.com/message/send');
    expect(http.post.mock.calls[0][1]).toEqual({ device_id: 'dev1', to: 'wxid_a', content: '你好' });
  });

  it('reports an unconfirmed send when no id comes back', async () => {
    const http = { post: jest.fn(async () => ({ data: '{"ok":true}' })) };
    const client = new WechatpadClient(config, http as any);
    await expect(client.sendText('wxid_a', 'hi')).resolves.toEqual({ messageId: null, confirmed: false });
  });

  it('fails definitely on an error reply and ambiguously on a timeout', async () => {
    const bad = new WechatpadClient(config, { post: jest.fn(async () => ({ data: '{"ret":-1,"errmsg":"not friend"}' })) } as any);
    await expect(bad.sendText('wxid_a', 'hi')).rejects.toMatchObject({ ambiguous: false });
    const slow = new WechatpadClient(config, { post: jest.fn(async () => Promise.reject(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))) } as any);
    await expect(slow.sendText('wxid_a', 'hi')).rejects.toMatchObject({ ambiguous: true });
  });

  it('finds ids under common field names', () => {
    expect(extractMessageId({ list: [{ msgId: 42 }] })).toBe('42');
    expect(extractMessageId({ resp: { new_msg_id: '0' } })).toBeNull();
  });
});
