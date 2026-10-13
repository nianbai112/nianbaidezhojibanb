# App OAuth 凭证校验边界

本模块只将第三方服务器验证过的凭证转成 `{ provider, appId, subject, unionId? }`。业务账号查找、协议同意、校区绑定和本平台会话签发由 `AuthService` 处理。客户端传来的 `openid`、`email`、`identityToken` 不参与身份判定，也不用于账号合并。

## 配置

| 配置键 | 用途 |
| --- | --- |
| `WX_APP_APPID` | 微信开放平台移动应用 AppID；与小程序 AppID 分开 |
| `WX_APP_SECRET` | 上述移动应用的服务器密钥 |
| `APPLE_APP_CLIENT_ID` | 原生 iOS App 对应的客户端标识 / Bundle ID |
| `APPLE_TEAM_ID` | Apple 开发者团队 ID |
| `APPLE_KEY_ID` | Sign in with Apple 私钥的 Key ID |
| `APPLE_PRIVATE_KEY` | 服务端保存的 P-256 `.p8` 私钥内容；支持实际换行或转义 `\n` |

任一必需配置缺失或 Apple 私钥格式错误时，该渠道返回 `APP_OAUTH_NOT_CONFIGURED`。没有硬编码测试账号，不回退使用小程序或本平台 JWT 密钥。不支持由请求参数指定 AppID、第三方 URL、redirect URI 或私钥。

Apple client ID 和 subject 上限均为 191 个 ASCII 字符，与跨端身份表的长度契约一致；超限值拒绝，不能截断后查找账号。

## 实现

- 微信：服务器向固定微信 HTTPS 端点提交 code 和移动应用配置，检查成功响应中的 openid、授权 scope、有效期；UnionID 仅在微信返回时提供。
- Apple：服务器使用短期 ES256 client secret 向固定 Apple HTTPS token 端点换码，再读取这次服务器响应的 id_token。只使用固定 Apple JWK 端点的公钥，校验 RS256 签名、kid、iss、aud、exp、iat、sub 以及可选 nbf；存在 c_hash / at_hash 时验证与当前 code / access_token 一致。JWK 缓存一小时，未知 kid 重新加载，加载失败不会接受过期缓存。
- 两种渠道都先用 Redis 原子的 SET NX EX 为 code 的 SHA-256 摘要保留十分钟消费标记。并发请求只允许一个换码；失败也保留标记，用户需重新授权。Redis 故障时拒绝登录，不使用进程内存降级。
- 所有第三方请求限制超时、响应大小并禁止 HTTP 跳转；错误响应经过脱敏，不回传或记录 axios 中的 code、密钥和第三方令牌。

## nonce 和验证范围

当前接入的 uni-app x / HBuilderX 5.26 App 登录接口没有可用的 nonce/state 传参能力，因此当前集成使用 **B：一次性 code 换码 + Redis 防重放 + Apple 令牌验证**。它未建立“服务端挑战与发起设备/会话”的 nonce 绑定，不能按已实现 nonce 绑定宣传或验收。

**A：服务端生成一次性 nonce、App 原生授权传入、服务器比对**需要支持该参数的原生适配后才能启用。模块保留 `expectedNonce` 内部参数；未来必须从服务端保存的授权上下文取得，严禁直接转发客户端 DTO 的 nonce 作为期望值。当前调用只传 code。

已运行 51 条使用临时生成 RSA / EC 密钥的单元测试，覆盖真实签名验签、过期和错误 audience、伪造签名、密钥轮转、code 重放、长度边界和错误脱敏。HTTP 和 Redis 是测试替身；这不等于微信/Apple 正式账号和签名安装包的真机授权通过。模块不持久化第三方 refresh_token，Apple 后续撤销授权同步属于单独的会话生命周期工作。

## 官方依据

- [微信移动应用授权后接口调用（UnionID）](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/WeChat_Login/Authorized_API_call_UnionID.html)
- [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens)
- [Apple identity verification](https://developer.apple.com/documentation/signinwithapple/verifying-a-user)
- [Apple 文档引用的 client secret 签名规则](https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret)
- [Apple OIDC discovery：身份令牌签名算法为 RS256](https://appleid.apple.com/.well-known/openid-configuration)

核对日期：2026-09-29。Apple client secret 的 ES256 与 Apple id_token 的 RS256 是两个不同用途的签名，不能混用。
