# uni-app x 第六批：Apple 生命周期与持久会话撤销

2026-09-29。本地实现记录；未部署业务服务器，未使用真实 Apple/微信凭据，未完成签名包和真机验收。最终验证数字和日志统一见前端工程 `docs/2026-09-29-batch6-handoff.md`。

## 方案与交付范围

**采用 A：数据库持久保存授权状态、会话版本、加密凭证和待撤销任务。** 账号注销先在同一事务中写入本地删除状态和任务，再由 worker 请求 Apple。外部故障时保留可重试任务，页面说明授权处理中。

**不推荐 B：只删除 Redis refresh key 或只做前端退出。** 未过期 access token 和已连接 WebSocket 仍可能有效；第三方撤销失败后没有可恢复记录。

本批普通用户会话统一区分 `token_use: access/refresh`，携带 `sv`。HTTP、可选认证和两类 WebSocket 均核对 `User.authVersion`。管理员认证不是本批改造范围，不能将本批结果描述为全部管理员安全审计。

## Apple 登录与通知

1. App 仍只提交平台一次性授权码。后端换码、验签并确认 provider refresh token；客户端自报的 subject、邮箱、身份 JWT 不参与账号归属。
2. `resolveLoginIdentity` 的 Serializable 事务内绑定 Apple 授权并加密保存凭证。身份冲突、已删除身份或过时授权证明失败时，新用户、渠道归属和凭证一起回滚。
3. 原生 SDK 未提供可用的 nonce 输入契约，本批没有声称实现 nonce 挑战绑定。已验签的 `auth_time`（若有）/`iat` 和服务器请求开始时间仅作授权事件排序，不能解释为用户刚刚完成交互的证明。
4. 通知入口 `POST /wx-auth/apple/notifications`，常用代理路径 `/api/wx-auth/apple/notifications`；JSON 为 `{ "payload": "<Apple signed JWT>" }`。不用用户 JWT；依赖 Apple 官方 JWK、RS256、issuer、服务端 client ID、时间和事件结构校验。API 启动入口对该 JSON 路径限制 16 KB，控制器限频。通用日志屏蔽整个通知内容及查询串。
5. 支持 `consent-revoked`、`account-deleted`、`email-enabled`、`email-disabled`；兼容旧 `account-delete`。通知不是登录 ID token，顶层 `sub/exp` 不强制存在，存在则验证；拒绝任意 audience。分组 Primary App ID 与 client ID 不同的场景尚未配置验收，不能自动接受其他 audience。
6. 同一事务保存事件去重记录、身份水位、凭证处理状态及用户新会话版本。未知 subject 也记撤销状态，不能被迟到的旧授权创建账户。邮件事件只记收据，不恢复授权。
7. 新授权之后才到达的旧 consent 通知不会撤销新授权，也不会清掉本地注销后仍待处理的新凭证。永久 Apple 账户删除和本地账号删除保留终态，不创建替身账户。

Apple 官方依据：[通知处理](https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts)、[撤销令牌](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens)、[账号删除与撤销 TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)。

## 注销、重试和业务边界

- 原接口 `POST /auth/user/cancel-account` 保留。状态、订单、提现和钱包检查移入同一 Serializable 事务；补查用户作为跑腿骑手、二手卖家的未完成责任，以及冻结资金。二手查询失败不能再按“无订单”放行。冲突返回 409，刷新后重试。
- 用户变为 DELETED、公开资料脱敏、`authVersion + 1`、审计记录与 Apple 待撤销任务一起提交。任务写入或审计失败时全部回滚。
- 每个实际得到的 Apple refresh token 单独加密留存；不能只保留最新一个而丢掉旧授权的撤销责任。AES-256-GCM 使用随机 IV，绑定 appId 和 subject；数据库不保存明文，日志不打印密文或 token。
- WorkerModule 每 30 秒扫描到期任务；多实例用数据库条件更新认领，租约 60 秒。失败退避 30 秒至 1 小时，保留固定内部错误码；成功或可信的有效撤销通知确认后清空密文。进程重启后接手过期租约，迟到响应只能修改仍归自己持有的任务。
- 没有历史 provider token 的旧 Apple 账户仍可完成本地注销；返回手动停止使用 Apple 登录的说明。不得强制用户重新授权才能删除本地账号。
- 返回增加 `apple_revocation.status`：`not_required` 无 Apple 身份；`pending` 已持久排队；`manual_required` 至少一个历史身份缺少可撤销凭证；`complete` 服务器已有撤销确认。混合多个身份时手动处理优先显示，其余已排队任务继续执行。
- 本批收到 Apple 账户/授权撤销事件时禁用相应 Apple 身份、清凭证并撤销平台旧会话；**不自动硬删除钱包和订单记录**。完整个人数据删除、交易留存期限、商家未完责任及通知文案仍须随账号/交易域核对，未宣称已经完成平台全量数据删除或上架合规验收。

## 防止旧清理误踢新登录

数据库提交后的会话版本是撤销分界。清理 Redis 或实时连接必须携带该次 `invalidBeforeVersion`，只清更早版本；不能在异步清理阶段按 userId 删除所有新旧会话。Redis 删除须原子比较当前值，实时控制消息须携带分界版本。数据库版本校验负责最终拒绝旧会话，即使 Redis/消息总线暂时失效也不恢复权限。

升级前没有 `token_use` 的普通 access token 返回 401；现有 refresh 只有缓存精确匹配且旧版本 0 与数据库一致时才允许换新 access。有 sid 的存量 refresh 可沿用到原有效期，不能把刷新窗口无限续长。测试必须覆盖旧 refresh 迁移、版本变化和接收方长连接。

## 新配置与数据库迁移

服务端变量，均不得写入前端或发送到聊天：

| 变量 | 用途 |
| --- | --- |
| `APPLE_APP_CLIENT_ID` | 本次原生 App 的已登记 Bundle ID / client ID |
| `APPLE_TEAM_ID`、`APPLE_KEY_ID`、`APPLE_PRIVATE_KEY` | 服务端签发 Apple client secret；私钥经部署密钥管理注入 |
| `APPLE_TOKEN_ENCRYPTION_KEY_ID` | 当前加密密钥版本，1–40 位字母/数字/下划线/短横线 |
| `APPLE_TOKEN_ENCRYPTION_KEYS` | JSON 键环：版本 ID 到标准 base64 编码的随机 32 字节密钥；最多 8 版 |
| `WX_OPEN_PLATFORM_ACCOUNT_ID` | 已核实属于同一开放平台的移动应用与小程序共享命名空间 |
| `WX_OFFICIAL_OPEN_PLATFORM_ACCOUNT_ID` | 公众号另行核实的命名空间；必须与上一项相同才自动按 UnionID 关联 |

加密密钥缺失时 Apple 登录失败关闭，不能降级明文保存；不影响无 Apple 身份的正常本地注销。轮换时先加入新版本，再切换当前 ID；保留旧键直到其所有在用授权/队列均已处理或完成专门的重新加密迁移，不能只等 pending 队列变空就删旧键。

新增迁移 `202609290002_apple_account_lifecycle`：User.authVersion 默认 0，AppleAuthorization、AppleOAuthToken、AppleServerEvent 三表及索引/关系。PostgreSQL 主迁移与 additive 副本一致；MySQL 有对应 additive SQL。保留上批 `202609290001_app_login_identities` 前置。本批不重写既有迁移、不应用到业务数据库。

发布顺序：备份 → 测试环境应用前置及新增迁移 → 重新生成对应方言 Prisma client → 注入服务端密钥 → 同步升级 API/worker/realtime → 配置 Apple HTTPS 通知 URL → 实际签名包验收 → 观察队列。不得长期混跑忽略 `sv` 的旧节点，否则旧节点会绕过新撤销规则。部署工具按项目现有数据库方言流程执行，不能把两种迁移重复应用到同一个库。

回退时优先关闭相关渠道并保留版本守卫和 worker；不要直接回退到不校验 `authVersion` 的旧认证实现，也不要删表、清任务或移除旧加密键。退款/提现及历史订单仍依赖原业务数据。

## 运行检查与未验收项

仅查看聚合任务状态即可初步发现积压，不查询/输出凭证：

```sql
SELECT state, COUNT(*) FROM apple_oauth_tokens GROUP BY state;
```

持续 pending/processing、固定重试告警、到期任务不推进时，应检查 worker 运行、密钥环、Apple client 配置和出网；不能以手动改 complete 消除告警。

尚未验收：真实 Apple/微信回调、签名设备、生产配置和迁移、MySQL 事务行为、跨节点实时压力与 Redis 故障演练、Apple 分组 App ID、完整数据删除/留存流程。实时收发新增数据库版本查询，应在容量验收中测量频率与延迟；不能通过无限缓存版本来绕过撤销。

本批同时修正公众号 UnionID 的唯一归属：已签名回调/服务器查询获得的 union 数据只能在明确同一 scope 下关联；历史重复/归属冲突直接拒绝，不挑第一条。没有配置公众号 scope 时仅关闭自动关联，已有合法二维码绑定流程仍保留。真实公众号通知/回流列在 WP14。
