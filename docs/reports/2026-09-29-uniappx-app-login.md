# uni-app x 第四批：App 登录接口与身份表

日期：2026-09-29。源码已实现、本地验证通过；尚未部署，尚未真实微信／Apple 换码或签名包验收。完整前端交付记录位于桌面 `uniappx/docs/2026-09-29-batch4-handoff.md`。

## 采用方案

**A：独立渠道身份表，服务端验证平台授权码，保留小程序 openid 语义**，本批采用。

**B：将 App openid／Apple sub 写回原 User.openid，或按邮箱／昵称自动合并**，不采用：原字段被小程序支付、通知、骑手收款共用，不同平台标识不可互换。

新增接口 `POST /wx-auth/app-login`（随既有全局 API_PREFIX）：

- `channel` 必须为 `app-weixin` 或 `app-apple`。
- `code` 为本次平台授权码；Apple 对应 SDK 的 `appleInfo.authorizationCode`。
- `region_id` 必须对应开放区域。
- `agreement_consents` 必须有当前 TERMS_OF_SERVICE 与 PRIVACY_POLICY 的文档 ID、版本、正文摘要；缺失和过期会在换码前拒绝，最终落库时再次原子校验。
- 可传 `loginDevice` 用于原登录设备摘要。客户端 openid、unionId、userId、email、identityToken 不能决定登录身份。
- 返回既有 token／refreshToken／用户资料格式，加 `login_channel`。`wx_bound` 仅表示已具备小程序身份；纯 App 新账号为 false。
- 路由保留现有 auth 桶每分钟 10 次的限流声明；此次局部控制器测试不代表生产全局限流部署已验收。

AppOauthService 使用独立服务器配置，固定 HTTPS 平台端点，限制超时／大小／跳转。微信只认换码结果；Apple 使用短期 ES256 client secret 换码，随后验证官方 JWK 的 RS256 签名和 claims。Redis SET NX EX 保存授权码摘要十分钟防并发重复使用，网络失败不释放标记；Redis 故障拒绝登录。不记录或回传第三方 access/refresh token。

当前官方 uni-app x LoginOptions 没有 nonce/state。**A：原生 nonce 挑战绑定**需要新适配；**B：官方 SDK 授权码换码＋防重放＋令牌校验**是本批实现。不能把 B 宣传为已完成发起设备／会话绑定。详细说明和官方依据见 `backend/src/modules/auth/app-oauth.notes.md`。

## 身份与兼容

新增 `user_auth_identities`：identityKey 唯一 SHA-256(provider, appId, subject)，字段保留来源和 userId。哈希键避免 MySQL 默认排序规则把大小写不同的第三方 subject 当成同一身份。

纯 App 用户创建 `app_login_<hash>` 占位 openid；已关联旧用户保留原真实小程序 openid。新公共 helper 阻止占位值进入小程序支付、充值、骑手授权／转账、订阅通知与重试，也修正绑定状态显示。

`WX_OPEN_PLATFORM_ACCOUNT_ID` 非空才启用跨微信 App／小程序 UnionID 关联，配置前须确认两者处于同一开放平台账号。旧 User.unionid 必须精确唯一；重复、渠道所有者矛盾、已绑定不同真实小程序身份时返回 ACCOUNT_IDENTITY_CONFLICT。内部 wechat-union 身份记录加唯一键；账号及身份创建在 Serializable 事务内，冲突有限重试完整解析。

默认不做 Apple 与微信合并。先关闭归并产生两个账号后再开启，也不会自动搬移钱包或订单。已有作用域不应随意改名。已注销／禁用用户拒绝，封禁用户沿用受限会话。原小程序缺协议字段的静默登录兼容保留；新 App 接口不提供这种缺字段兼容。

身份事务、初始区域绑定、协议记录和 JWT 签发是分阶段处理。协议在授权期间变化时仍会拒绝签发 token；之前创建的账号可以留下，后续凭同一渠道重试。不能将新 resolver 的并发保证推广到所有历史手机号／UnionID 写入代码。

## 配置与数据库交付

环境变量模板 `backend/.env.example` 新增：

| 字段 | 用途 |
| --- | --- |
| WX_APP_APPID / WX_APP_SECRET | 微信移动应用凭据，不能填写小程序凭据 |
| WX_OPEN_PLATFORM_ACCOUNT_ID | 已核实的共享开放平台命名空间；首次 App 上线前确定 |
| APPLE_APP_CLIENT_ID | 原生 App Bundle ID |
| APPLE_TEAM_ID / APPLE_KEY_ID | Apple 团队与 Sign in with Apple Key ID |
| APPLE_PRIVATE_KEY | 服务端 P-256 私钥内容，可用转义换行；不得进入前端 |

环境校验保留这七项，缺配置时既有小程序仍可启动，对应 App 渠道返回 APP_OAUTH_NOT_CONFIGURED。没有内置测试身份或回退密钥。

新增迁移：

- `backend/prisma/additive-migrations/postgresql/202609290001_app_login_identities.sql`
- `backend/prisma/additive-migrations/mysql/202609290001_app_login_identities.sql`
- `backend/prisma/migrations/202609290001_app_login_identities/migration.sql`

主 schema 与两种方言已同步。迁移仅增加身份表、索引和外键，不清洗旧用户；旧迁移文件未改。已有发布工具从 additive-migrations 读取迁移，因此不能只复制 prisma/migrations 文件。

后续发布顺序：测试环境数据库备份 → 通过原发布流程应用对应方言增量迁移 → 重新生成 Prisma Client → 更新后端与配置 → 核对真实协议 → 构建、签名并验收新前端。本批没有执行这些部署操作，不应在真实业务库直接运行 db push。若回退，先关闭新 App 入口并回退配套代码，保留身份表及归属记录。

## 验证结果

- 后端合并回归 44 suites／593 tests 全通过，其中 OAuth 51 项使用临时生成 RSA／EC 密钥实际验签。
- TypeScript `node ../node_modules/typescript/bin/tsc --noEmit --incremental false` 通过。
- `node scripts/test-uniappx-isolated.cjs` 通过 106 项：学生认证 69、原协议／资料合同 14、新 App 身份／HTTP 23。使用全新临时 PostgreSQL 和独立 Prisma Client，结束清理；没有加载项目 .env 或访问既有业务库。
- 新增 App HTTP 测试实际运行 Nest 控制器、响应转换、异常过滤与 JWT 签发；OAuth、Redis、IPGeo、守卫环境为测试替身。并发同人、身份冲突、账号状态、协议授权中变化与客户端身份伪造均覆盖。
- PostgreSQL／MySQL schema validate 通过。从本批原始备份到当前 schema 生成的两种 diff SQL 与新增 additive SQL 一致；主 migration 与 PG additive 字节一致。未进行 MySQL 真实数据库集成。
- 前端 230 单测及微信／Android／iOS 前端编译通过。未打 APK／IPA 或真机验证。

原始日志保存在桌面 uniappx/output 的 `batch4-backend-regression.log`、`batch4-backend-typecheck.log`、`batch4-isolated-integration.log`、`batch4-schema-validation.txt`、`batch4-frontend-check.log`。

仍待真实配置与签名验收；Apple 撤销授权通知／注销令牌撤销、历史重复账号治理、公众号旧 UnionID findFirst 关联逻辑需要发布前收尾。App 支付、推送和 iOS 虚拟商品购买不在本批实现范围。
