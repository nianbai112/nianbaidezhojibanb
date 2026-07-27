# 全量代码审查报告（2026-07-27）

## 1. 审查结论

本轮已对以下代码面完成静态检查、构建、类型检查、测试、依赖审计和高风险业务边界审查：

- 后端 NestJS / Prisma：`backend/src` 共 379 个 TypeScript 文件
- 管理后台：`admin/src` 共 238 个源码文件
- 官网：`site/src` 共 5 个源码文件
- 编译版微信小程序：1371 个已跟踪文件，其中 388 个 JavaScript / CommonJS 文件
- 数据库迁移、部署/契约工具、Git 上传边界、敏感信息、权限、区域数据隔离、资金、会员权益、退款、消息幂等与并发

本轮只写入审查设计、执行计划和本报告，没有修改业务代码，也没有创建前端远端仓库或推送当前业务快照。原因是上传前存在一个 P0 阻断项，且用户要求先查看问题清单再决定修复范围。

审查发现：

- P0：1 项
- P1：11 项
- P2：8 项
- P3：2 项

其中 P0、P1 不建议带入任何公开仓库或生产发布。

## 2. 验证基线

### 2.1 环境

- NVM 默认 Node 已从 18 切换为 `v22.23.1`
- npm：`10.9.8`
- 本轮构建和测试均使用 Node 22

### 2.2 通过项

- 后端构建：通过
- 管理后台 Vite 构建：通过
- 官网测试：5/5 通过
- 官网构建：通过
- 小程序全部 JavaScript / CommonJS 语法检查：通过
- 小程序 minitest：135/135 通过
- 小程序混合媒体专项测试：3/3 通过
- 小程序 `app.json`、`project.config.json` 解析：通过
- Git 冲突标记和 `git diff --check`：未发现问题
- 未发现真实私钥、GitHub Token、OpenAI Key、AWS Key 等已跟踪明文凭据
- 上传模块已有 MIME、扩展名、危险文件类型和大小校验
- 钱包常规扣款路径使用了事务和余额条件更新
- 支付订单和退款的部分核心状态迁移已有条件更新和回归测试

### 2.3 未通过项

- 后端 Jest 全量：84 个测试套件中 82 个通过、2 个失败；680 个测试中 677 个通过、3 个失败
- 管理后台类型检查：126 个错误，分布于 12 个文件
- 生产依赖审计：35 个漏洞，其中 3 个 critical、12 个 high、20 个 moderate
- API 契约工具报告 2 个疑似不匹配，但严格模式仍以成功退出

## 3. 问题清单

### P0-01 Git 上传边界会把本地数据库备份带入公开仓库

证据：

- `backend/storage/database-backups/lingmeng-before-schema-repair-20260719.dump`
- `backend/storage/` 当前未被 `.gitignore` 排除
- 后端远端仓库当前是公开仓库

影响：

- 如果后续直接执行全量暂存，数据库备份可能进入 Git 历史
- 数据库备份通常包含用户、订单、联系方式、资金或运营数据；即使随后删除文件，公开 Git 历史仍可能保留内容

建议：

1. 上传前先将 `backend/storage/`、数据库备份和运行探针文件加入忽略规则
2. 只做路径/文件名确认，不读取或复制数据库备份内容
3. 暂存后单独检查 Git 索引，确认备份未进入提交
4. 在完成上述检查前不要推送后端审查分支

---

### P1-01 `/api` 兼容控制器几乎完全绕过细粒度权限和区域数据隔离

证据：

- `backend/src/modules/admin/api-compat.controller.ts`
- 控制器共有 136 个路由，仅 1 个路由声明 `@RequirePermission`
- 类级别仅使用 `JwtGuard, AdminGuard`
- 任意有效管理员可调用的写操作示例：
  - 107-113 行：批量审核通讯录
  - 151-156 行：批量通过相亲资料
  - 239-244 行：批量开启/关闭任意区域相亲配置
  - 802-807 行：批量启停微信模板
- 大量列表和统计直接访问全库，没有传入管理员 ID，也没有应用 `AdminDataScopeService`

影响：

- 低权限管理员可能读取其他模块、其他区域的用户和经营数据
- 低权限管理员可能执行本不属于其角色的审核、配置和启停操作
- 这是控制器级系统性绕过，不是单个接口遗漏

建议：

1. 为兼容控制器建立显式权限矩阵
2. 所有区域数据请求传入当前管理员 ID，并统一走 `AdminDataScopeService`
3. 对写操作增加资源归属校验和审计日志
4. 无前端依赖的过时兼容路由直接删除或返回 410
5. 增加“区域管理员不能访问区域 B”和“只读管理员不能写”的控制器回归测试

---

### P1-02 任意有效管理员都能修改授权、执行系统更新和数据库修复

证据：

- `backend/src/modules/license-runtime/license-runtime.controller.ts`
- 类级别仅使用 `JwtGuard, AdminGuard`
- 没有 `AdminPermissionGuard`、权限装饰器或服务层超级管理员校验
- 高影响接口包括：
  - 21-24 行：保存授权配置
  - 39-54 行：下载并应用系统更新
  - 63-66 行：清除更新执行状态
  - 75-78 行：执行数据库修复
  - 87-90 行：下载小程序包
  - 100-103 行：回传更新结果

影响：

- 普通管理员或区域管理员可以改变系统运行配置
- 可以触发代码更新、数据库修复和小程序包替换
- 误操作或恶意操作可能导致全站不可用或数据结构变化

建议：

- 限制为超级管理员或新增独立的 `system:update`、`system:repair` 权限
- 服务层再次校验操作者身份，避免只依赖控制器
- 对更新和修复增加二次确认、互斥锁、审计日志和可验证回滚点

---

### P1-03 财务模块的区域数据隔离不完整

证据：

- `backend/src/modules/finance-admin/finance-admin.controller.ts`
- `getFinanceOverview`、`getSubsidyOverview`、`getSubsidyLedgers`、`getUserWalletLogs`、`getWithdrawals`、`getRegionBalanceLogs` 没有把操作者 ID 传给服务
- `backend/src/modules/finance-admin/finance-admin.service.ts`
  - 617-649 行：区域余额日志可查询全部区域
  - 683 行起：财务总览聚合全平台支付、提现和结算
  - 970-1017 行：用户钱包流水包含手机号但没有区域条件
  - 1022-1068 行：提现列表包含账户、实名和手机号但没有区域条件
  - 1071-1184 行：审核和完成提现没有校验用户归属区域
- 同一服务内的支付订单、商家结算和骑手结算已经有区域范围实现，说明区域隔离是既有业务规则

影响：

- 区域财务人员可能看到其他区域的用户钱包、提现账号、实名、手机号和平台汇总
- 有提现权限的区域管理员可能审核或确认其他区域的提现

建议：

- 给所有财务查询和变更统一传入 `operatorId`
- 通过用户档案、订单、商家或骑手归属推导区域条件
- 详情、审核、打款三个阶段都做资源级区域校验
- 增加跨区域列表、详情和写操作的拒绝测试

---

### P1-04 `finance:view` 查看权限可以直接修改用户余额

证据：

- `backend/src/modules/admin/admin.controller.ts` 359-368 行
- `backend/src/modules/admin/new-ui-compat.controller.ts` 174-193 行
- 单用户和批量余额调整均使用 `@RequirePermission("finance:view")`

影响：

- 只应查看财务数据的管理员可以增加或扣减用户余额
- 批量接口放大了误操作和滥用影响

建议：

- 新增或使用独立的 `finance:balance-adjust` 权限
- 前端按钮、标准接口和兼容接口使用同一个权限
- 高金额、负数和批量调整增加二次确认、审批阈值与审计告警

---

### P1-05 用户余额和区域余额调整存在并发丢失更新

证据：

- `backend/src/modules/admin/admin.service.ts` 9699-9735 行
  - 先在事务外读取钱包
  - 计算 `newBalance`
  - 再在事务内写入绝对余额
- `backend/src/modules/finance-admin/finance-admin.service.ts` 651-676 行
  - 先读取区域余额
  - 计算 `newBalance`
  - 再写入绝对余额

影响：

- 两个并发调整读取到同一个旧余额时，后写入的一次会覆盖前一次结果
- 区域余额日志可能记录两个相同的“新余额”，但金额流水之和与最终余额不一致
- 属于真实资金账实不一致风险

建议：

- 使用数据库原子 `increment/decrement` 或带旧余额条件的 `updateMany`
- 在同一事务内取得更新后的余额并写流水
- 对余额不足、并发增加、并发扣减和一增一减增加数据库级并发测试

---

### P1-06 会员权益业务场景白名单与调用方不一致，四条权益链路会被服务端拒绝

证据：

- `backend/src/modules/membership/membership.service.ts` 688-693 行允许：
  - `topup`
  - `delivery`
  - `coupon`
  - `activity`
  - `post_pin`
  - `content_promotion`
  - `dating`
  - `second_hand`
- 实际调用方：
  - 活动：`activity_order`，被拒绝
  - 跑腿：`errand_order`，被拒绝
  - 外卖/小店：`shop_order`，被拒绝
  - 帖子免费置顶：`post`，被拒绝
  - 二手刷新：`second_hand`，允许

影响：

- 会员活动优惠订单创建失败
- 会员跑腿优惠订单创建失败
- 会员外卖免配送费/折扣订单创建失败
- 免费置顶异常被 `catch` 吞掉后静默回退到付费流程，用户会误以为权益不可用

建议：

- 先定义唯一的业务场景枚举，再让消费、恢复、补贴账本和调用方统一使用
- 为五个业务场景分别增加成功消费、取消恢复和退款恢复测试
- 禁止静默吞掉“场景不匹配”等编程错误

---

### P1-07 会员权益配额消费不是并发安全的，也没有业务幂等唯一约束

证据：

- `backend/src/modules/membership/membership.service.ts` 680-698 行
  - 先读取 `usedQuota`
  - 在应用层检查剩余次数
  - 再无条件 `increment`
- `backend/prisma/schema.prisma` 462-481 行
  - `MembershipBenefitUsage` 只有普通索引
  - 没有 `(grantId, targetType, targetId)` 或业务幂等键唯一约束

影响：

- 同一权益剩余 1 次时，并发两个请求都可能通过检查并消费成功
- 相同业务对象重试时可能重复生成权益使用记录
- 会员配额可能变成超额使用

建议：

- 使用带 `usedQuota <= totalQuota - quantity` 条件的原子更新
- 为有限权益检查更新计数必须为 1
- 为每个业务消费提供幂等键并建立唯一索引
- 捕获唯一冲突并返回第一次成功结果

---

### P1-08 免费置顶和二手刷新把权益扣减与实际履约拆成了两个事务

证据：

- `backend/src/modules/topup/topup.service.ts` 205-239 行
  - 先独立扣会员权益
  - 再创建免费置顶订单
  - 再更新帖子置顶状态
- `backend/src/modules/operation/operation.service.ts` 1135-1148 行
  - 先独立扣二手刷新权益
  - 再更新二手商品

影响：

- 后续订单或内容更新失败时，会员次数已经扣除但服务没有交付
- 免费置顶还可能出现“成功订单已创建、帖子未置顶”的中间状态

建议：

- 使用同一个 Prisma 事务完成权益消费、业务状态和账本写入
- 把帖子/商品资源归属与状态检查也放入事务
- 增加事务中途失败的回滚测试

---

### P1-09 已提交过的历史 Prisma 迁移被原地修改

证据：

- `backend/prisma/migrations/202605100003_add_notify_realtime_schema/migration.sql`
- 当前修改在历史迁移中新增 `wechat_template_configs` 建表语句

影响：

- 已执行该迁移的服务器会出现迁移 checksum 漂移
- 新装数据库与已升级数据库执行的迁移历史不再一致
- 可能阻断 `prisma migrate deploy`，也会降低回滚和审计可信度

建议：

- 恢复历史迁移原文
- 创建一个新的、只追加的迁移来补建或补列
- 分别验证全新数据库和已有数据库升级路径

---

### P1-10 帖子管理和操作日志页面构建成功但运行时会直接报错

证据：

- 管理后台类型检查共 126 个错误
- `admin/src/views/content/PostsManage.vue`
  - 109 个错误
  - `loading`、分页、筛选、列表、详情、统计等状态均未声明
  - 多个模板格式化函数未声明
  - `onMounted` 立即调用 `loadPosts`，第一句访问 `loading.value`
- `admin/src/views/system/OperationLogs.vue`
  - `loading` 未声明
  - `loadLogs` 第一处即访问 `loading.value`

影响：

- 帖子管理页打开即可能出现 `ReferenceError`
- 操作日志页无法正常加载
- Vite 构建不做完整 Vue 类型检查，所以“构建成功”不能证明页面可运行

建议：

- 先恢复两个页面缺失的状态和辅助函数
- 把 `vue-tsc --noEmit` 纳入构建/CI 阻断门禁
- 为关键管理页增加最小挂载测试

---

### P1-11 管理员密码重置前后端契约不一致，且服务端缺少密码强度校验

证据：

- `admin/src/views/modules/AdminsPage.vue` 272-280 行
  - 前端发送 `POST`
  - 不提交新密码
  - 不检查 `fetch` 的 HTTP 状态
  - 无论 404/405 都显示“密码已重置”
- `backend/src/modules/admin/admin.controller.ts` 1368-1378 行
  - 后端只接受 `PUT`
  - 必须提交 `{ password }`
- `backend/src/modules/admin/admin.service.ts` 9365-9380 行
  - 直接 hash 传入值
  - 没有复用已有密码强度规则

影响：

- 后台显示成功但密码实际上没有重置
- 直接调用接口时可以设置不符合平台安全策略的弱密码

建议：

- 明确采用“管理员输入新临时密码”或“服务端生成一次性临时密码”其中一种契约
- 前端检查 `response.ok` 并展示真实错误
- 服务端复用统一密码强度校验
- 重置后强制下次登录改密并撤销所有旧会话

---

### P2-01 后端全量测试有 3 个失败，测试桩已落后于生产实现

证据：

- `errand.service.shop-delivery.spec.ts`
  - 缺少 `regionRider.findUnique`
  - 事务桩缺少 `errandOrder.updateMany`
- `payment.controller.spec.ts`
  - 成功退款路径的 Prisma 桩缺少 `orderLog.create`

判断：

- 当前证据更符合“测试桩未同步”，尚未证明为生产逻辑缺陷
- 但全量测试门禁为红色，后续真实回归容易被噪声掩盖

建议：

- 只补足测试桩，不为通过测试删除生产保护逻辑
- 修复后重新运行 680 个测试

---

### P2-02 管理后台还有 17 个非帖子页类型错误

分布：

- `OperationLogs.vue`：4
- `CirclesPage.vue`：3
- `AdminsPage.vue`：2
- 其余 8 个页面各 1 个

问题类型包括：

- 未声明状态
- 日期范围类型不正确
- 非法 `as const`
- 属性类型扩大
- 订单类型缺少 `orderAmount`

建议：

- P1-10 修完后继续清零全部类型错误
- 禁止仅依赖 Vite 打包结果作为发布门禁

---

### P2-03 生产依赖存在 35 个已知漏洞

统计：

- critical：3
- high：12
- moderate：20

主要风险包：

- `fast-xml-parser`：critical，直接依赖及 COS SDK 旧版本传递依赖
- `request`：critical，由 `cos-nodejs-sdk-v5` 旧版本引入
- `form-data`：critical
- `axios`、`multer`、`nodemailer`、`sharp`、`ws`、`lodash`、`js-yaml`、`vite` 等：high

建议：

- 不执行无审查的 `npm audit fix --force`
- 先升级可兼容的 patch/minor
- COS SDK、Nest 11、Swagger 11、Nodemailer 9 等 major 升级分批完成并做回归
- 对 XML、上传、邮件、WebSocket、图片处理和对象存储路径做专项测试

---

### P2-04 原生 WebSocket 的消息幂等存在并发竞态，冲突时客户端收不到确认

证据：

- `backend/prisma/schema.prisma` 已有 `@@unique([senderId, clientMessageId])`
- `backend/src/modules/websocket/ws-native.gateway.ts`
  - 发送前先 `findExistingClientMessage`
  - 随后直接 `message.create`
  - 两个并发重试可能都查不到，后一个触发唯一冲突
  - 外层 catch 只记录日志，不向客户端发送 `message_sent` 或 `message_error`

影响：

- 网络抖动或双击重试时，一条消息已成功入库，另一个请求可能静默失败
- 客户端无法确认是否已发送，可能继续重试或显示失败

建议：

- 捕获 Prisma 唯一冲突
- 冲突后按 `(senderId, clientMessageId)` 查询已存在消息并返回 `duplicated: true`
- 私聊和群聊都增加并发重试测试

---

### P2-05 API 契约门禁存在假阳性、漏报和过时前端封装

证据：

- 小程序仍导出 `POST /membership/benefits/use`
- 后端已因安全原因删除该直扣权益接口
- 当前搜索未发现该封装调用者，属于过时代码
- `utils/checkApiContract.js` 把所有 `joinUrl(apiUrl, ...)` 模式固定推断为 POST
- 因此把真实 GET `/platform/login-page-config` 错报成 POST
- 严格模式存在 2 个疑似未匹配时仍以 0 退出

影响：

- 真正失效的 API 封装不会阻断
- 正常 GET 被误报，降低审查信噪比

建议：

- 删除过时的会员直扣封装
- 从请求调用块读取真实 method
- 严格模式对确认后的不匹配返回非零
- 为 GET/POST、动态 URL 和已移除接口增加契约工具测试

---

### P2-06 Git 仓库包含或暴露本地审查产物

后端未忽略：

- `.workbuddy/`
- `work/`（约 4.1 MB）

前端已跟踪：

- `.playwright-cli/` 日志和页面快照
- `.codex-assets/` 预览信息与图片
- `.codex-screenshots/` 预览二维码

前端未跟踪：

- `static/logo 2.png`，无代码引用，且与现有 `logo.png` 内容不同

影响：

- Git 历史被本地日志、截图、二维码和临时工作文件污染
- 可能泄露页面内容、测试地址或短期预览信息

建议：

- 上传前明确忽略本地审查目录
- 从前端索引移除已跟踪的本地产物，但保留本地文件
- 无引用的 `logo 2.png` 默认不上传，除非确认它是待替换资产

---

### P2-07 管理后台首屏包体过大

证据：

- 主入口 JS：约 1,317.71 kB，gzip 约 424.28 kB
- `RegionConfigCenter`：约 441.02 kB，gzip 约 128.70 kB
- Vite 报告超过 500 kB 警告

影响：

- 管理后台首次加载、弱网打开和更新缓存成本较高

建议：

- 路由级懒加载
- 拆分大型区域配置中心
- 对 Element Plus、图表和地图依赖做按需加载
- 在功能正确性修完后再做，优先级低于权限和资金问题

---

### P2-08 “机器人统一密码”配置没有实际作用

证据：

- 管理端默认展示 `admin123`
- `AdminService.createRobots` 对密码执行 hash，但 `hashedPassword` 后续未写入任何用户或机器人账号字段

影响：

- 操作员以为已给机器人设置统一密码，实际没有生效
- 形成错误的运维认知

建议：

- 如果机器人不支持密码登录，删除该字段和 hash 逻辑
- 如果确实需要登录，设计独立、安全且可撤销的机器人认证机制，不使用统一默认密码

---

### P3-01 数据库迁移时间前缀重复

重复前缀：

- `202607100001_*` 两个
- `202607140001_*` 两个

影响：

- Prisma 仍可按完整目录名排序，但人工审查和发布顺序容易混淆

建议：

- 新迁移使用唯一、单调递增的时间/序号
- 已发布目录不随意改名；未发布目录可在确认后整理

---

### P3-02 缺少只读 lint 门禁

证据：

- 管理端和后端的 `lint` 脚本都带 `--fix`
- 为避免在审查阶段批量改写用户现有代码，本轮没有直接执行

影响：

- 无法在不改文件的情况下稳定运行 lint
- 审查和 CI 容易把“检查”与“自动改写”混在一起

建议：

- 增加 `lint:check`
- 保留 `lint:fix` 作为显式写操作

## 4. 前端本次混合媒体改动结论

当前前端 6 个已修改文件和 1 个新增测试的静态结论：

- 图片、视频、音频附件会保留在统一 `media` 请求中
- 发布页标签能显示已有图片数量、视频和音频已添加状态
- 笔记详情在媒体类型超过一种时使用共享媒体组件
- WXML 绑定键与 JS 渲染输出一致
- 后端 `PostService` 会规范化并返回 `media`
- 专项测试 3/3 通过
- 小程序全量 minitest 135/135 通过

尚未完成的证明：

- 微信开发者工具模拟器逐路由运行
- 真机上传图片+视频+音频并发布
- 线上接口、对象存储和审核链路验证

所以当前可判定为“源码与静态测试通过”，不能判定为“真机和生产已验证”。

## 5. 建议修复顺序

### 第一批：上传前阻断

- P0-01
- P2-06

目标：先保证任何 Git 暂存和推送都不会带出数据库备份或本地审查产物。

### 第二批：权限与资金

- P1-01
- P1-02
- P1-03
- P1-04
- P1-05
- P1-06
- P1-07
- P1-08

目标：修复管理员越权、跨区域数据泄露、余额并发和会员权益账实不一致。

### 第三批：发布稳定性

- P1-09
- P1-10
- P1-11
- P2-01
- P2-02
- P2-05

目标：恢复迁移可信度、管理后台可用性和测试/契约门禁。

### 第四批：依赖与工程维护

- P2-03
- P2-04
- P2-07
- P2-08
- P3-01
- P3-02

目标：在核心正确性稳定后升级依赖、完善消息重试、减小包体和清理工程债务。

## 6. Git 上传状态

- 后端审查分支：`codex/code-audit-20260727`
- 前端当前分支：`codex/pages-main-runtime-validation`
- 后端业务快照：未提交、未推送
- 前端私有远端仓库：尚未创建
- 原方案 A 保留：后端使用现有仓库新审查分支；前端使用独立私有仓库

在用户选择修复项后，应按“测试先行 → 小批修复 → 分批验证 → 检查暂存边界 → 提交 → 推送”的顺序继续。
