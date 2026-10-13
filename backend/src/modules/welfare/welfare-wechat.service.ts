import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { createDecipheriv, randomBytes } from "node:crypto";
import axios from "axios";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { WechatTokenService } from "../wechat/wechat-token.service";

export function decryptGroupProof(
  proof: any,
  key: string,
  appid: string,
  now = Date.now(),
): string {
  try {
    if (
      !proof ||
      typeof proof.encryptedData !== "string" ||
      proof.encryptedData.length > 8192 ||
      typeof proof.iv !== "string"
    )
      throw new Error();
    const decipher = createDecipheriv(
      "aes-128-cbc",
      Buffer.from(key, "base64"),
      Buffer.from(proof.iv, "base64"),
    );
    const value = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(proof.encryptedData, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
    // wx.getGroupEnterInfo 的解密结构由微信按接口返回，官方示例只保证
    // opengid/open_single_roomid/group_openid/chat_type，不保证附带通用开放
    // 数据中的 watermark。存在 watermark 时仍校验；缺少时不能误判为过期。
    if (value.watermark !== undefined) {
      const time = Number(value.watermark?.timestamp) * 1000;
      if (
        value.watermark?.appid !== appid ||
        !Number.isFinite(time) ||
        now - time > 300000 ||
        time > now + 30000
      )
        throw new Error();
    }
    const gid = value.opengid || value.openGId;
    if (
      typeof gid !== "string" ||
      gid.length < 5 ||
      gid.length > 128 ||
      (value.chat_type !== undefined && value.chat_type !== 3)
    )
      throw new Error();
    return gid;
  } catch {
    throw new BadRequestException({
      code: "WELFARE_GROUP_REQUIRED",
      message: "群验证已失效，请从官方群里的活动卡片重新进入并验证",
    });
  }
}

@Injectable()
export class WelfareWechatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wechat: WechatTokenService,
  ) {}
  async refreshSession(userId: string, code: unknown) {
    if (typeof code !== "string" || !code || code.length > 256)
      throw new BadRequestException("请重新获取微信登录凭证");
    if (
      (await this.redis.incrementWindow(`welfare:session-rate:${userId}`, 60)) >
      15
    )
      throw new BadRequestException("操作频繁，请稍后再试");
    const { appid, secret } = await this.wechat.getMiniappCredentials();
    let data: any;
    try {
      ({ data } = await axios.get(
        "https://api.weixin.qq.com/sns/jscode2session",
        {
          params: {
            appid,
            secret,
            js_code: code,
            grant_type: "authorization_code",
          },
          timeout: 10000,
        },
      ));
    } catch {
      throw new BadRequestException("微信验证暂不可用，请稍后重试");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { openid: true, unionid: true },
    });
    if (
      data.errcode ||
      !data.session_key ||
      !user?.openid ||
      data.openid !== user.openid
    )
      throw new ForbiddenException("当前微信与登录账号不一致，请重新登录");
    if (data.unionid && typeof data.unionid === 'string' && data.unionid.length <= 191) {
      if (user.unionid && user.unionid !== data.unionid) throw new ForbiddenException('微信身份记录不一致，请联系管理员');
      if (!user.unionid) await this.prisma.user.update({ where: { id: userId }, data: { unionid: data.unionid } });
    }
    await this.redis.set(`welfare:session:${userId}`, data.session_key, 600);
    await this.redis.set(`session_key:${userId}`, data.session_key, 7200);
    return { ready: true };
  }
  async groupId(userId: string, proof: any) {
    const key = await this.redis.get(`welfare:session:${userId}`);
    if (!key)
      throw new BadRequestException({
        code: "WELFARE_GROUP_REQUIRED",
        message: "微信验证已过期，请重新验证",
      });
    const { appid } = await this.wechat.getMiniappCredentials();
    return decryptGroupProof(proof, key, appid);
  }
  async code(page: string, scene: string, envVersion = "release") {
    if (!["release", "trial", "develop"].includes(envVersion))
      throw new BadRequestException("小程序版本无效");
    const { appid } = await this.wechat.getMiniappCredentials();
    const cacheKey = `welfare:code:${appid}:${envVersion}:${page}:${scene}`;
    const cached = await this.redis.getJson<{ image: string }>(cacheKey);
    if (cached) return cached;
    const token = await this.wechat.getMiniappAccessToken();
    let data: any;
    try {
      ({ data } = await axios.post(
        `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`,
        { page, scene, check_path: false, env_version: envVersion, width: 430 },
        { responseType: "arraybuffer", timeout: 15000 },
      ));
    } catch {
      throw new BadRequestException("小程序码生成失败，请稍后重试");
    }
    const buffer = Buffer.from(data);
    const mime = buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "png"
      : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
        ? "jpeg"
        : null;
    if (!mime || buffer.length < 100)
      throw new BadRequestException(
        "微信未生成小程序码，请检查小程序配置和版本",
      );
    const result = {
      image: `data:image/${mime};base64,${buffer.toString("base64")}`,
    };
    await this.redis.setJson(cacheKey, result, 3600);
    return result;
  }
  async startBinding(
    accountId: string,
    campaignId: string,
    envVersion: string,
  ) {
    const token = randomBytes(12).toString("hex");
    const session = { accountId, campaignId, candidate: null };
    const code = await this.code(
      "pagesWelfare/group-bind",
      token,
      ["release", "trial", "develop"].includes(envVersion)
        ? envVersion
        : "trial",
    );
    await this.redis.setJson(`welfare:binding:${token}`, session, 900);
    return { token, ...code, expiresIn: 900 };
  }
  async offerBinding(token: string, userId: string, proof: any) {
    if (!/^[a-f0-9]{24}$/.test(token || ""))
      throw new BadRequestException("绑定入口无效");
    const key = `welfare:binding:${token}`;
    const session = await this.redis.getJson<any>(key);
    if (!session)
      throw new BadRequestException("绑定入口已过期，请在后台重新生成");
    const gid = await this.groupId(userId, proof);
    const updated = await this.redis.withLock(`${key}:lock`, 15, async () => {
      const fresh = await this.redis.getJson<any>(key);
      if (!fresh) throw new BadRequestException("绑定入口已过期");
      if (
        fresh.candidate &&
        (fresh.candidate.gid !== gid || fresh.candidate.userId !== userId)
      )
        throw new BadRequestException("此入口已提交其他群，请管理员重新生成");
      await this.redis.setJson(
        key,
        {
          ...fresh,
          candidate: { gid, userId, verifiedAt: new Date().toISOString() },
        },
        900,
      );
      return { submitted: true };
    });
    if (!updated) throw new BadRequestException("正在提交，请稍后重试");
    return updated;
  }
  async binding(accountId: string, campaignId: string, token: string) {
    if (!/^[a-f0-9]{24}$/.test(token || ""))
      throw new BadRequestException("绑定入口无效");
    const data = await this.redis.getJson<any>(`welfare:binding:${token}`);
    if (!data || data.accountId !== accountId || data.campaignId !== campaignId)
      throw new ForbiddenException("绑定入口不存在、已过期或不属于当前管理员");
    return data;
  }
  async consumeBinding(token: string) {
    await this.redis.del(`welfare:binding:${token}`);
  }
}
