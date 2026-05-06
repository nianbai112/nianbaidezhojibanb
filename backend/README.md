# 灵萌 / Xiaoyi 后端服务

区域/校园生活服务平台完整后端，基于 NestJS + Prisma + PostgreSQL + Redis。

---

## 一、项目目录结构

```
lingmeng-backend/
├── prisma/
│   ├── schema.prisma          # 完整数据模型（80+ 张表）
│   └── seed.ts                # 种子数据
├── src/
│   ├── main.ts                # 入口，Swagger、全局管道/拦截器/过滤器
│   ├── app.module.ts          # 根模块
│   ├── config/
│   │   └── env.validation.ts  # 环境变量校验
│   ├── common/
│   │   ├── modules/
│   │   │   ├── prisma.module.ts
│   │   │   ├── redis.module.ts
│   │   │   └── logger.module.ts
│   │   ├── services/
│   │   │   ├── prisma.service.ts
│   │   │   ├── redis.service.ts
│   │   │   └── logger.service.ts
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── enums/
│   │   └── interfaces/
│   ├── modules/
│   │   ├── auth/              # 微信登录、JWT、token 续期
│   │   ├── user/              # 用户资料、关注粉丝、学生认证
│   │   ├── region/            # 区域、轮播、公告、导航、TabBar
│   │   ├── post/              # 帖子、评论、点赞、收藏、举报、投票、热榜
│   │   ├── circle/            # 圈子、成员、频道、话题分组
│   │   ├── shop/              # 商家、商品、SKU、购物车、订单
│   │   ├── delivery/          # 跑腿配置、订单池、骑手、位置更新
│   │   ├── finance/           # 钱包、充值、提现、交易流水
│   │   ├── payment/           # 微信支付 V3、退款
│   │   ├── message/           # 私聊、群聊、系统通知
│   │   ├── websocket/         # Socket.IO 实时推送
│   │   ├── upload/            # 腾讯云 COS 上传、临时凭证
│   │   ├── operation/         # 优惠券、签到、活动、二手、漂流瓶
│   │   └── admin/             # 后台管理、审核、仪表盘
│   ├── guards/
│   │   ├── jwt.guard.ts
│   │   └── roles.guard.ts
│   ├── interceptors/
│   │   └── transform.interceptor.ts
│   ├── filters/
│   │   └── all-exceptions.filter.ts
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── roles.decorator.ts
│   ├── utils/
│   └── types/
├── .env.example
├── package.json
├── tsconfig.json
├── nest-cli.json
└── docker-compose.yml
```

---

## 二、Prisma 数据模型设计

核心模型覆盖 10 大模块，共 80+ 张表：

### 2.1 用户与权限
- `User` — 基础用户（openid、unionid、昵称、头像、状态）
- `UserProfile` — 扩展资料（性别、生日、学校、专业、宿舍）
- `UserSettings` — 隐私与通知设置
- `StudentVerify` — 学生认证（姓名、学号、学校、状态）
- `Role` / `Permission` / `UserRole` — RBAC 角色权限
- `Follow` / `Block` — 关注与拉黑
- `BrowseHistory` / `UserTag` — 浏览记录、用户标签

### 2.2 区域系统
- `Region` — 区域/校区（范围半径、仅学生访问、开关）
- `RegionBanner` / `RegionNotice` / `RegionNav` / `RegionTabBar` — 首页装修

### 2.3 内容社区
- `Post` — 帖子（类型、状态、置顶、共创、审核状态）
- `PostMedia` — 多媒体（图片/视频/音频）
- `Topic` / `PostTopic` — 话题
- `Comment` — 评论（嵌套回复）
- `Like` / `Favorite` — 点赞、收藏
- `Vote` / `VoteRecord` — 投票
- `PostCollaborator` — 共创者
- `Report` — 举报

### 2.4 圈子系统
- `Circle` — 圈子（加入方式、成员上限）
- `CircleMember` — 成员（角色：OWNER/ADMIN/MEMBER）
- `CircleChannel` — 频道（文字/语音/公告）
- `CircleTopicGroup` — 话题分组

### 2.5 商家/商城
- `Merchant` — 商家入驻（审核状态、评分）
- `Category` — 商品类目（树形）
- `Product` / `SKU` — 商品与规格
- `Cart` — 购物车
- `Order` / `OrderItem` — 订单
- `Refund` — 退款
- `Review` — 评价
- `Promotion` / `PromotionProduct` — 促销
- `FreightTemplate` — 运费模板

### 2.6 外卖/跑腿
- `DeliveryConfig` — 区域跑腿配置（起步价、里程价、重量价）
- `DeliveryOrder` — 跑腿订单（取件/寄件/取餐/万能）
- `Rider` — 骑手（位置、评分、状态）

### 2.7 财务系统
- `Wallet` — 钱包（余额、冻结、支付密码）
- `WalletTransaction` — 交易流水
- `Withdraw` — 提现（状态机）
- `Recharge` — 充值记录

### 2.8 消息系统
- `Conversation` / `ConversationMember` — 会话与成员
- `Message` — 消息（撤回标记、已读数）
- `Notification` — 系统通知（未读数）

### 2.9 运营功能
- `Coupon` / `CouponReceive` — 优惠券
- `CheckIn` — 签到（连续天数）
- `Badge` / `UserBadge` — 徽章
- `Activity` / `ActivityJoin` — 活动/社团
- `ScoreCheckIn` — 评分打卡
- `SecondHand` — 二手交易
- `DriftBottle` — 漂流瓶
- `Match` — 对象匹配
- `NetDisk` — 网盘资源

### 2.10 系统
- `Config` — 全局配置键值对
- `AuditLog` — 审计日志

---

## 三、RBAC 权限模型

```
Permission（权限点）
  ├── code: 唯一编码（如 post:create）
  ├── module: 所属模块（post, user, order...）
  ├── action: 操作（create, read, update, delete, approve...）
  └── roles: Role[]

Role（角色）
  ├── SUPER_ADMIN — 超级管理员（全部权限）
  ├── ADMIN — 平台运营
  ├── REGION_ADMIN — 区域管理员（仅管辖区域数据）
  ├── MERCHANT — 商家
  ├── RIDER — 骑手
  └── USER — 普通用户

UserRole（用户角色关联）
  ├── userId
  ├── roleId
  └── regionId — 区域管理员时指定管辖区域
```

权限校验流程：
1. `@Roles(RoleType.ADMIN, RoleType.REGION_ADMIN)` 装饰 Controller/Method
2. `RolesGuard` 读取 requiredRoles，查询当前用户的 UserRole 列表
3. 比对 roleType，同时校验 regionId 越权（区域管理员只能操作自己区域）

---

## 四、REST API 设计（兼容小程序已有路径）

### 4.1 微信认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /wx-auth/wx-mini-login | 小程序登录（code2session） |
| POST | /wx-auth/wx-phone | 获取手机号（需要 code） |
| POST | /wx-auth/refresh | token 续期（refreshToken） |
| GET | /wx-auth/profile | 当前用户信息 |

### 4.2 用户
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /user/profile | 用户资料 |
| PUT | /user/profile | 更新资料 |
| GET | /user/settings | 用户设置 |
| PUT | /user/settings | 更新设置 |
| POST | /user/student-verify | 学生认证 |
| POST | /user/follow | 关注/取消关注 |
| GET | /user/follows | 关注列表 |
| GET | /user/fans | 粉丝列表 |
| GET | /user/browse-history | 浏览记录 |
| GET | /user/:id | 用户主页 |

### 4.3 区域
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /region | 区域列表 |
| GET | /region/:id | 区域详情 |
| GET | /region/:id/home | 区域首页（帖子+装修） |

### 4.4 帖子
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /post | 帖子列表 |
| GET | /post/hot | 热榜 |
| GET | /post/:id | 帖子详情 |
| POST | /post | 发布帖子（进入审核） |
| POST | /post/:id/like | 点赞 |
| POST | /post/:id/favorite | 收藏 |
| POST | /post/:id/comment | 评论 |
| GET | /post/:id/comments | 评论列表 |
| POST | /post/:id/report | 举报 |
| DELETE | /post/:id | 删除帖子 |

### 4.5 圈子
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /circle | 圈子列表 |
| GET | /circle/:id | 圈子详情 |
| POST | /circle | 创建圈子 |
| POST | /circle/:id/join | 加入圈子 |
| POST | /circle/:id/leave | 退出圈子 |
| GET | /circle/:id/members | 成员列表 |

### 4.6 商城
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /shop/products | 商品列表 |
| GET | /shop/products/:id | 商品详情 |
| GET | /shop/categories | 分类 |
| GET | /shop/cart | 购物车 |
| POST | /shop/cart | 加入购物车 |
| POST | /shop/order | 创建订单 |
| GET | /shop/orders | 订单列表 |
| GET | /shop/orders/:id | 订单详情 |

### 4.7 跑腿
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /delivery/orders | 我的订单 |
| GET | /delivery/pool | 订单池（骑手） |
| POST | /delivery/orders | 创建订单 |
| POST | /delivery/orders/:id/accept | 接单 |
| POST | /delivery/orders/:id/complete | 完成 |
| POST | /delivery/rider/location | 更新位置 |

### 4.8 财务
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /finance/wallet | 钱包 |
| GET | /finance/transactions | 交易流水 |
| POST | /finance/recharge | 充值 |
| POST | /finance/withdraw | 提现 |

### 4.9 支付
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /payment/wx-unified-order | 微信支付下单 |
| POST | /payment/wx-notify | 微信回调 |
| GET | /payment/query | 查询支付状态 |
| POST | /payment/refund | 退款 |

### 4.10 消息
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /message/conversations | 会话列表 |
| POST | /message/conversations | 创建会话 |
| GET | /message/conversations/:id/messages | 消息列表 |
| POST | /message/conversations/:id/messages | 发送消息 |
| GET | /message/notifications | 通知列表 |
| POST | /message/notifications/read | 标记已读 |

### 4.11 上传
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /upload/image | 上传图片 |
| POST | /upload/video | 上传视频 |
| POST | /upload/audio | 上传音频 |
| POST | /upload/cos-credential | COS 临时凭证 |

### 4.12 运营
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /operation/coupons | 优惠券 |
| POST | /operation/coupons/:id/receive | 领取优惠券 |
| POST | /operation/check-in | 签到 |
| GET | /operation/activities | 活动 |
| POST | /operation/activities/:id/join | 参加活动 |
| GET | /operation/second-hands | 二手列表 |
| POST | /operation/second-hands | 发布二手 |
| POST | /operation/drift-bottle/throw | 扔漂流瓶 |
| GET | /operation/drift-bottle/pick | 捞漂流瓶 |

### 4.13 后台管理（需 ADMIN 权限）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /admin/dashboard | 仪表盘 |
| GET | /admin/users | 用户管理 |
| PUT | /admin/users/:id/ban | 封禁/解封 |
| GET | /admin/posts | 帖子管理 |
| PUT | /admin/posts/:id/audit | 审核帖子 |
| GET | /admin/reports | 举报管理 |
| PUT | /admin/reports/:id/handle | 处理举报 |
| GET | /admin/orders | 订单管理 |
| GET | /admin/withdraws | 提现管理 |
| PUT | /admin/withdraws/:id/audit | 审核提现 |
| GET | /admin/audit-logs | 审计日志 |

---

## 五、WebSocket 消息协议

命名空间：`/ws`

### 5.1 连接认证
```json
// 连接时携带 token
{ "auth": { "token": "Bearer xxx" } }
```

### 5.2 客户端事件
| 事件 | 参数 | 说明 |
|------|------|------|
| joinConversation | `{ conversationId }` | 加入会话房间 |
| leaveConversation | `{ conversationId }` | 离开会话房间 |
| sendMessage | `{ conversationId, type, content, extra }` | 发送消息 |
| recallMessage | `{ messageId, conversationId }` | 撤回消息 |
| typing | `{ conversationId }` | 正在输入 |

### 5.3 服务端事件
| 事件 | 参数 | 说明 |
|------|------|------|
| newMessage | Message | 新消息推送 |
| messageRecalled | `{ messageId, conversationId }` | 消息撤回 |
| userTyping | `{ conversationId, userId }` | 对方正在输入 |
| notification | Notification | 系统通知 |
| orderUpdate | Order | 订单状态更新 |
| newDeliveryOrder | DeliveryOrder | 新跑腿订单（推骑手） |

---

## 六、状态机设计

### 6.1 商城订单状态机
```
PENDING_PAY --支付成功--> PAID --发货--> SHIPPED --签收--> DELIVERED --确认--> RECEIVED --完成--> COMPLETED
  |                          |                    |              |
  |--超时取消--> CANCELLED   |--申请退款--> REFUNDING --> REFUNDED
  |                          |
  |--用户取消--> CANCELLED   |
```

### 6.2 跑腿订单状态机
```
PENDING_PAY --支付--> PENDING_ACCEPT --接单--> ACCEPTED --取件--> IN_PROGRESS --送达--> ARRIVED --确认--> COMPLETED
  |                              |                      |
  |--取消--> CANCELLED          |--转单--> PENDING_ACCEPT
  |                              |
  |--退款--> REFUNDING --> REFUNDED
```

### 6.3 退款状态机
```
PENDING --审核通过--> APPROVED --执行退款--> COMPLETED
   |
   |--审核拒绝--> REJECTED
```

### 6.4 提现状态机
```
PENDING --审核--> PROCESSING --转账--> SUCCESS
   |
   |--拒绝--> REJECTED
   |--失败--> FAILED（余额退回）
```

---

## 七、内容审核与举报处理流程

### 7.1 自动审核
1. 用户发布帖子 → `status: PENDING`, `auditStatus: pending`
2. 敏感词过滤（Redis 缓存词库）
3. 图片/视频异步送审（腾讯云 COS 内容审核或阿里云绿网）
4. 通过 → `auditStatus: approved`, `status: PUBLISHED`
5. 拒绝 → `auditStatus: rejected`, 推送系统通知给用户

### 7.2 举报处理
1. 用户举报 → `Report` 记录创建，`status: pending`
2. 后台 `/admin/reports` 列表展示
3. 管理员处理 → `status: resolved/rejected`
4. 若确认违规：
   - 对帖子：下架/删除，记录 `auditReason`
   - 对用户：发送警告、禁言、封禁（`User.status: BANNED`）
5. 推送处理结果给举报人和被举报人

---

## 八、文件上传方案

### 8.1 服务端直传（小文件/后台）
- 接口：`POST /upload/image|video|audio`
- 使用 `multer` 接收文件流
- 直传腾讯云 COS（`cos-nodejs-sdk-v5`）
- 返回 CDN 访问地址

### 8.2 客户端直传（小程序推荐）
- 接口：`POST /upload/cos-credential`
- 后端调用 COS STS 获取临时密钥（有效期 2 小时）
- 小程序使用 `wx.uploadFile` 直传 COS，减轻服务端带宽

### 8.3 存储结构
```
cos://lingmeng-125xxxxxx/
├── users/{userId}/avatar/xxx.jpg
├── users/{userId}/post/xxx.jpg
├── posts/{postId}/media/xxx.mp4
├── merchants/{merchantId}/product/xxx.jpg
├── second-hand/{id}/xxx.jpg
└── drift-bottle/{id}/voice/xxx.mp3
```

---

## 九、安全方案

### 9.1 鉴权
- JWT AccessToken（有效期 2h）+ RefreshToken（有效期 7d）
- 请求头 `Authorization: Bearer <token>`
- Token 黑名单：登出时将 token 加入 Redis 黑名单（剩余有效期）

### 9.2 限流
- `@nestjs/throttler` 全局限流：60 秒 100 请求
- 敏感接口单独限流（登录 5 次/分钟，短信 1 次/分钟）
- Redis 滑动窗口限流实现

### 9.3 签名验证（微信支付）
- 微信支付 V3 使用 RSA 签名
- 回调通知验证 `Wechatpay-Signature` 请求头
- 平台证书自动轮换

### 9.4 越权校验
- `CurrentUser` 装饰器提取当前用户 ID
- 所有涉及资源操作的接口校验 `resource.userId === currentUserId`
- 区域管理员校验 `UserRole.regionId === resource.regionId`

### 9.5 审计日志
- `AuditLog` 表记录所有敏感操作
- AOP 拦截器自动记录：管理员登录、审核、封禁、删除、提现审批
- 记录字段：用户、动作、模块、目标 ID、详情、IP、UA、时间

### 9.6 数据安全
- 用户敏感信息（手机号、身份证）数据库级别加密存储
- 支付密码使用 bcrypt 哈希
- SQL 注入防护：Prisma ORM 参数化查询
- XSS 防护：Helmet + 输入校验

---

## 十、首次部署 （Setup Wizard）

### 10.1 准备最小 .env

首次部署时，后端需要至少能启动才能访问 POST /setup/init。在 `.env` 中添加：

```bash
NODE_ENV=production
SETUP_WIZARD=true          # 放宽环境变量校验，允许 WX_PAY/COS 暂不可用

DATABASE_URL=postgresql://user:password@host:5432/lingmeng_db
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=至少32字符的强随机字符串
WX_MINI_APPID=你的小程序AppID
WX_MINI_SECRET=你的小程序Secret
```

### 10.2 启动 → 调用 Setup API → 补全 .env → 重启

```bash
# 1. 启动（SETUP_WIZARD 放宽校验）
npm run build && npm run start:prod

# 2. 检查环境
curl -X POST http://localhost:3000/setup/check

# 3. 查看初始化状态
curl http://localhost:3000/setup/status

# 4. 执行初始化（创建超级管理员、运行迁移、seed权限）
curl -X POST http://localhost:3000/setup/init \
  -H 'Content-Type: application/json' \
  -d '{"siteName":"灵萌生活","adminUsername":"admin","adminPassword":"YourStrongP@ss1"}'

# 5. 从 .env 中移除 SETUP_WIZARD=true，补全 WX_PAY/COS 等生产配置
# 6. 重启服务 → 完整生产环境校验生效
```

### 10.3 环境要求

- Node.js >= 18
- PostgreSQL >= 14
- Redis >= 6

### 10.4 安装依赖
```bash
cd backend
npm install
```

### 10.3 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 填写数据库、Redis、微信、COS 配置
```

### 10.4 数据库迁移
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 10.5 启动服务
```bash
# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

### 10.6 Docker 一键启动（可选）
```bash
docker-compose up -d
```

---

## 十一、Production Database Deployment

⚠️ **CRITICAL: Always back up before migrations.**

### 1. Backup the database
```bash
pg_dump -U lingmeng -h <host> -p 5432 lingmeng_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Deploy pending migrations (production-safe)
```bash
npm run db:migrate:deploy
```
This runs `prisma migrate deploy` which only applies pending migrations **without** generating new ones.  
It never resets or drifts the database — safe for production.

### 3. Seed data if needed (first deploy / fresh environment)
```bash
npm run db:seed
```

### 4. Regenerate Prisma client after schema changes
```bash
npm run db:generate
```

### ⛔ NEVER run these in production:
| Command | Why it's dangerous |
|---------|-------------------|
| `prisma db push` | Bypasses migration history — can cause drift and data loss |
| `prisma migrate dev` | Creates/drops/resets the DB — development only |
| `prisma migrate reset` | Wipes the entire database |

### Rollback procedure
If a migration causes issues:
1. Find the migration timestamp in `prisma/migrations/`
2. Manually write a revert SQL migration OR restore from backup
3. Prisma does not auto-generate down-migrations

---

## 十二、小程序端对接说明

- baseURL: `https://yuntingzhe.cn/api/v1`
- 请求头统一携带 `Authorization: Bearer <accessToken>`
- Token 过期时调用 `POST /wx-auth/refresh` 续期
- 文件上传推荐使用 COS 客户端直传方案
- WebSocket 连接 `wss://yuntingzhe.cn/ws`，携带 `auth.token`
