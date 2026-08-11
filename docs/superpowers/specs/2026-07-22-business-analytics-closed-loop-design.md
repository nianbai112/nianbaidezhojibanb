# 业务分析与运营建议闭环设计

**日期：** 2026-07-22

**适用范围：** `后端后台本地测试版` 后端与管理后台

**状态：** 用户已原则确认推荐方向，待审阅本文后进入实施计划

## 1. 目标

把现有“业务分析”从统计看板升级为一条可审计的运营决策链：

```text
统一指标口径
  -> 发现异常并保存证据
  -> 生成可执行建议
  -> 分配负责人和截止时间
  -> 跳转到真实业务页面处理
  -> 记录修改前后内容
  -> 到期自动复测
  -> 判定有效、无效、恶化或需回滚
  -> 超级管理员复盘并沉淀规则
```

业务分析必须同时服务两类使用者：

- 区域运营者：只看授权区域，优先处理今天真正需要做的事项。
- 超级管理员：查看全平台与跨区域差异，管理指标规则、权限、AI 成本和高风险策略审批。

本设计不以“增加更多图表”作为完成标准。只有建议能够被执行、追踪和复测，才算闭环。

## 2. 现状事实与必须先修复的问题

当前业务分析入口包含总览、用户、内容、订单、骑手和二手六个标签。普通分析页主要显示累计值和趋势；骑手页额外提供规则建议、模型建议、接受/忽略和运行日志；区域运营工作台另有保存在 Redis 24 小时的临时任务。

进入闭环实施前必须先解决以下问题：

1. 分析控制器未传当前管理员账号，服务直接信任查询参数中的 `regionId`，未使用 `AdminDataScopeService`。
2. `analytics:view` 同时保护读取、修改 AI 密钥、运行模型和修改建议状态，读写权限未分离。
3. 平台运营和区域负责人默认权限未包含 `analytics:view`，业务分析默认主要由超级管理员可见。
4. 用户区域过滤读取 `UserProfile.region`，而正式区域 ID 字段为 `UserProfile.regionId`。
5. 区域对比忽略日期范围；总量、周期量和同比值混在同一组卡片中。
6. 金额指标混用业务订单金额和支付单金额，退款率的分子分母覆盖业务线不一致。
7. 骑手学习快照未按区域、日期和订单去重，事件数量不能直接作为订单结果率。
8. 趋势按天串行查询，日期范围没有上限；区域排行按区域逐个查询。
9. AI 每日调用和成本上限只保存未执行，运行成本固定为 0；定时分析没有真正使用配置的区域和算法范围。
10. 建议没有负责人、截止时间、动作入口、应用记录、复测指标、结果和回滚状态。

P0 数据隔离和指标口径没有通过前，新的建议只允许运行在“影子模式”，不得推送给运营者作为正式任务。

## 3. 方案选择

### 方案 A：继续增强现有看板

在六个标签页增加更多图表、阈值颜色和 AI 文案。改动较小，但建议仍然无法分配、执行和验证，只会得到更丰富的报表。

### 方案 B：统一洞察任务闭环（采用）

保留现有分析页面作为证据视图，新增一个持久化的 `BusinessInsight` 作为“异常、建议、运营任务、复测结果”的唯一事实来源。复用管理员数据范围、`AdminOperationLog`、`SystemAlert`、现有配置表和区域工作台。确定性规则负责发现问题，AI 只解释和排序。

该方案只新增一个核心业务表，不引入工作流框架、消息队列或新的模型服务。

### 方案 C：AI 自动运营

由模型自行选择参数并直接调整派单、价格、营销和内容策略。自动化程度高，但当前指标口径、权限、样本和回滚能力不满足安全条件，本期不采用。

## 4. 角色与权限

新增并在种子、安装向导和角色编辑页同步以下权限：

| 权限 | 用途 |
|---|---|
| `analytics:view` | 查看授权数据范围内的指标和洞察 |
| `analytics:insight:manage` | 接受、分配、开始、提交应用记录、忽略洞察 |
| `analytics:insight:verify` | 手工复测、确认结果、记录回滚 |
| `analytics:ai:run` | 手动运行模型增强 |
| `analytics:ai:config` | 修改服务商、地址、密钥、额度和定时范围 |

默认授权：

- `region_manager`：`analytics:view`、`analytics:insight:manage`，但数据范围强制限定到绑定区域；不能修改 AI 配置和全局规则。
- `platform_ops`：`analytics:view`、`analytics:insight:manage`、`analytics:insight:verify`，范围取账号数据权限。
- `super_admin`：全部权限，可查看跨区域数据、修改规则、运行 AI 和处理高风险回滚。
- 财务、审核、商家管理员：默认不新增权限；需要时由超级管理员按职责授予只读权限。

所有分析接口都必须从 `@CurrentUser("sub")` 获取账号 ID。服务端按以下规则确定有效范围：

1. 超级管理员不选择区域时可查看全平台；选择区域时只查所选区域。
2. 非超级管理员选择区域时，必须通过 `AdminDataScopeService.assertRegionAccess`。
3. 非超级管理员不选择区域时，只聚合其全部授权区域，绝不能退化成全平台查询。
4. 前端区域下拉只是交互辅助，不作为安全边界。
5. 洞察详情、状态操作、导出和复测必须再次校验洞察的 `regionId`。

AI 密钥配置仅对 `analytics:ai:config` 可见；其他角色只看到“已配置/未配置”和最近运行状态。

## 5. 指标口径与响应契约

### 5.1 通用查询契约

新建经过校验的 `AnalyticsQueryDto`，字段为：

- `startDate`、`endDate`：按后台配置的业务时区解释，默认最近 7 个完整自然日。
- `regionId`：可选，但不能扩大当前管理员的数据范围。
- `businessType`：`all/takeaway/errand/mall/second_hand`。
- `granularity`：`day/week/month`；缺省时按范围自动选择。

约束：

- 开始时间晚于结束时间返回 400，不再静默互换。
- 日粒度最长 93 天，周粒度最长 366 天；超过限制返回明确错误。
- 无效日期返回 400，不再默认为最近 7 天。
- 所有日期标签以业务时区格式化，不能用 UTC `toISOString().split('T')[0]` 生成本地日期。

所有分析响应增加：

```json
{
  "data": {},
  "meta": {
    "scope": { "type": "region", "regionIds": ["..."] },
    "period": { "start": "...", "end": "...", "granularity": "day" },
    "timezone": "Asia/Shanghai",
    "generatedAt": "...",
    "freshnessAt": "...",
    "sampleSize": 0,
    "quality": "complete",
    "warnings": []
  }
}
```

数据不完整时返回 `quality=partial` 和具体缺失项，不用 0 伪装成真实结果。

### 5.2 权威数据源

| 指标域 | 权威数据源 | 时间字段 | 关键排除项 |
|---|---|---|---|
| 用户累计/新增 | `User` | `createdAt` | 机器人用户单独展示，不与真人增长混算 |
| 区域用户 | `UserProfile.regionId`，兼容地址/发帖归属 | 各记录时间 | 同一用户按 ID 去重 |
| 内容发布 | `Post` | `createdAt/publishedAt` | 删除、拒绝内容不计有效供给 |
| 内容互动 | `Comment`、`Like` | `createdAt` | 删除评论、非帖子点赞按指标定义排除 |
| 支付单数/GMV | `PaymentOrder` | `payTime` | 仅 `status=paid`，按支付单去重 |
| 退款金额 | `PaymentRefund`/统一退款事实 | `refundedAt` | 仅 `status=success` 的真实退款 |
| 履约完成率 | 各业务订单表 | `createdAt/completeTime` | 待支付、退款中的订单按指标定义拆分 |
| 骑手履约 | `ErrandOrder`、`Order`、`DeliveryRiskEvent` | 订单和事件时间 | 同一订单、同类事故去重 |
| 二手供给/交易 | `SecondHand`、`SecondHandOrder`、支付单 | 发布、下单、支付时间 | 发布库存和周期交易分开统计 |

金额指标不得使用“支付单金额为空就回退业务订单金额”的隐式混合。若支付事实缺失，返回部分数据警告并触发数据质量洞察。

### 5.3 页面指标分层

每张卡片必须明确属于以下一种：

- 累计：例如累计用户、当前在售商品。
- 周期：例如所选周期新增用户、GMV、完成订单。
- 当前：例如在线骑手、待处理审核。
- 对比：例如相对上一等长周期的变化。

累计值不能使用周期新增的涨跌幅。跨业务汇总必须同时覆盖所有业务线的分子和分母。

## 6. 业务洞察数据模型

新增 `BusinessInsight`，作为洞察和运营任务的唯一持久化事实来源：

| 字段 | 类型 | 用途 |
|---|---|---|
| `id` | `String` | 主键 |
| `fingerprint` | `String @unique` | `规则+范围+周期桶`，防止同一异常重复生成 |
| `ruleKey` | `String` | 生成规则，例如 `order_timeout_high` |
| `source` | `String` | `rule/model/manual/data_quality` |
| `scopeType` | `String` | `global/region/business` |
| `regionId` | `String?` | 区域范围；全局洞察为空 |
| `businessType` | `String?` | `takeaway/errand/mall/second_hand/content/user` |
| `metricKey` | `String` | 被监控指标 |
| `severity` | `String` | `info/low/medium/high/critical` |
| `status` | `String` | 洞察状态机 |
| `title`、`summary` | `String` | 运营可读标题和结论 |
| `evidence` | `Json` | 口径、样本、分子分母、分群、异常明细和数据质量 |
| `recommendation` | `Json` | 建议动作、预期影响、风险提示和保护指标 |
| `actionRoute` | `String?` | 后台真实处理页面，附带区域和筛选条件 |
| `ownerId` | `String?` | 负责人管理员账号 |
| `baselineValue` | `Decimal?` | 异常前基线 |
| `currentValue` | `Decimal?` | 发现时值 |
| `targetValue` | `Decimal?` | 期望达到的值 |
| `periodStart`、`periodEnd` | `DateTime` | 证据周期 |
| `dueAt` | `DateTime?` | 运营处理截止时间 |
| `appliedAt` | `DateTime?` | 运营确认已应用时间 |
| `verificationDueAt` | `DateTime?` | 自动复测时间 |
| `verifiedAt` | `DateTime?` | 实际复测时间 |
| `verificationValue` | `Decimal?` | 复测值 |
| `outcome` | `String?` | `effective/ineffective/worsened/inconclusive` |
| `operatorNote` | `String?` | 运营说明 |
| `changeSnapshot` | `Json?` | 修改前后值、关联业务对象、操作来源 |
| `rollbackSnapshot` | `Json?` | 回滚目标、结果和原因 |
| `lastDetectedAt` | `DateTime` | 同一 fingerprint 最近一次仍命中规则的时间 |
| `createdAt`、`updatedAt` | `DateTime` | 审计时间 |

关系与删除规则：

- `regionId -> Region.id`，区域删除时 `SetNull`，历史洞察仍保留；`Region` 增加 `businessInsights` 反向关系。
- `ownerId -> AdminAccount.id`，账号删除时 `SetNull`，历史负责人 ID 和操作日志不被级联删除；`AdminAccount` 增加 `ownedBusinessInsights` 反向关系。
- `fingerprint` 唯一约束负责并发去重；状态、负责人和指标值不能藏在 JSON 中。

索引：

- `@@index([regionId, status, severity, createdAt])`
- `@@index([ownerId, status, dueAt])`
- `@@index([ruleKey, periodStart, periodEnd])`
- `@@index([verificationDueAt, status])`

不新增事件表。每次状态变化继续写现有 `AdminOperationLog`：`module=business_insight`、`targetType=business_insight`、`targetId=洞察ID`，`detail` 保存旧状态、新状态、备注、指标快照和客户端信息。洞察详情时间线直接读取该日志。

`SystemAlert` 继续处理真正需要提醒的异常：critical 洞察、洞察生成连续失败、复测失败、逾期高风险任务和回滚记录失败。`businessId` 指向洞察 ID，避免把全部普通建议复制成异常记录。分析模块不自动执行跨业务回滚。

## 7. 洞察规则配置

首期规则配置保存在现有 `Config` 表的版本化键 `business_insight_rules_v1`，避免提前增加规则表。配置项包括：

- `enabled`、`ruleKey`、`metricKey`、适用业务和范围；
- 判断运算符、阈值、最小样本量；
- 对比窗口、观察小时数、严重级别；
- 默认建议、动作路由、保护指标和回滚提示。

只有超级管理员可修改。保存时进行 DTO 白名单、范围和版本校验，并写操作日志。配置错误不得让定时任务崩溃；错误规则跳过并产生 `SystemAlert`。

首批只上线能由当前真实表直接计算的规则：

1. 支付 GMV/支付单数相对基线明显下降。
2. 支付后履约接单率低于阈值且样本量足够。
3. 超时率、取消率或风险事故率超过阈值。
4. 成功退款金额率异常升高。
5. 区域有效内容供给不足或待审核积压。
6. 活跃商家率偏低、区域可售商家不足。
7. 二手待审核、下架或长期未售库存异常。
8. 数据源不一致、支付事实缺失或统计质量为 partial。

没有可靠埋点前，不生成“曝光到支付转化率下降”之类无法证明的建议；先把它标记为数据能力缺口。

## 8. 洞察生成、去重和建议

新增 `BusinessInsightService`，负责规则计算、状态推进和复测；指标读取仍由 `AnalyticsService` 提供，避免复制统计公式。

生成流程：

1. 解析当前管理员或定时任务的合法数据范围。
2. 读取版本化规则配置。
3. 调用统一指标注册表计算当前值、基线、样本量和数据质量。
4. 样本量不足时不下结论；必要时生成低级别“样本不足”数据质量洞察。
5. 达到规则条件后生成 `fingerprint=ruleKey+scope+periodBucket`。
6. 同 fingerprint 已存在时更新证据和最近检测时间，不重复创建任务。
7. critical 洞察同步创建或更新 `SystemAlert`。
8. 模型增强异步于确定性结果；模型失败不影响规则洞察落库和展示。

基线首期采用“上一等长周期”，并在页面明确显示。上线稳定后再增加“过去四周同星期”季节性基线，不能用未实现的季节模型包装成智能分析。

建议内容必须包含：

- 发生了什么、影响哪个区域和业务；
- 指标口径、当前值、基线、差值、样本量；
- 可核查的原因拆分或异常对象；
- 一至三个具体动作；
- 每个动作的真实后台入口；
- 预期影响、观察时间和保护指标；
- 风险与回滚提示。

AI 只能基于服务端已经计算出的匿名聚合证据重写说明、补充排序和风险提示；不得修改指标值、阈值、范围、动作权限或自动决定生效。

## 9. 状态机与事务规则

状态机：

```text
detected
  -> accepted
  -> in_progress
  -> verifying
  -> effective | ineffective | worsened | inconclusive

detected/accepted -> dismissed
worsened          -> in_progress | rolled_back
ineffective       -> in_progress | closed
effective         -> closed
```

规则：

- `accepted` 必须有负责人；区域运营者只能接受自己授权区域的洞察。
- `in_progress` 记录开始时间和处理说明。
- `verifying` 必须有应用说明、`changeSnapshot` 和复测时间。
- 通用分析模块不直接修改价格、派单、退款或营销配置；运营者通过 `actionRoute` 进入原业务模块，完成后回到洞察填写应用记录。
- 如果原业务模块可返回操作日志 ID，`changeSnapshot` 保存该 ID 和对象 ID；不能只写“已处理”。
- 定时复测使用同一 `metricKey`、范围和口径，不能换分母或时间字段。
- 达到目标且保护指标没有越界为 `effective`；保护指标恶化为 `worsened`；样本不足为 `inconclusive`；其余为 `ineffective`。
- 结果状态、指标值和时间线写入同一事务；通知在事务提交后发送。
- 重复状态请求幂等返回；非法跳转返回 409，并说明当前状态和允许动作。

## 10. 后端 API

### 10.1 现有分析接口

保留现有路径，减少前端迁移量，但全部增加当前管理员参数、DTO 和数据范围解析：

- `GET /admin/analytics/overview`
- `GET /admin/analytics/users`
- `GET /admin/analytics/content`
- `GET /admin/analytics/orders`
- `GET /admin/analytics/second-hand`
- `GET /admin/analytics/regions`
- `GET /admin/analytics/riders/algorithm`

响应统一增加 `meta`。区域排行必须服从日期和授权区域；趋势查询改为数据库分组或一次读取后聚合，不再逐日串行请求。

### 10.2 洞察接口

- `GET /admin/analytics/insights`：按区域、业务、严重级别、状态、负责人、逾期和结果筛选。
- `GET /admin/analytics/insights/summary`：我的待办、逾期、高风险、待复测和效果统计。
- `GET /admin/analytics/insights/:id`：证据、建议、应用记录、复测和操作时间线。
- `POST /admin/analytics/insights/:id/accept`：接受并指定负责人、截止时间。
- `POST /admin/analytics/insights/:id/start`：开始处理。
- `POST /admin/analytics/insights/:id/apply`：提交处理说明、变更引用和观察周期，进入复测。
- `POST /admin/analytics/insights/:id/dismiss`：填写忽略原因。
- `POST /admin/analytics/insights/:id/verify`：有权限的管理员手工复测。
- `POST /admin/analytics/insights/:id/rollback`：记录已在原业务模块完成的回滚结果。
- `POST /admin/analytics/insights/generate`：超级管理员或平台运营手动运行确定性规则；请求范围仍受数据权限约束。

写接口使用明确 DTO，不接受任意 JSON 状态。所有接口记录操作日志。

### 10.3 AI 接口

旧骑手 AI 接口在迁移期保留，但修改权限：

- 配置读写：`analytics:ai:config`。
- 手动运行：`analytics:ai:run`。
- 洞察查看：`analytics:view`。
- 洞察处置：`analytics:insight:manage`。

每日调用上限按本地业务时区和运行日志真实计数；每日成本上限按服务商返回用量和后台单价估算。超限时不调用模型，确定性规则继续运行并记录 `quota_skipped`。

定时任务必须应用 `analysisScope` 和 `regionScope`，且不允许配置一个非超级管理员无权访问的区域范围。

## 11. 管理后台

### 11.1 业务分析首页

顶部固定展示：

- 当前数据范围、时间范围、时区、数据更新时间和质量状态；
- 周期 GMV、支付单、完成率、退款率、真人新增用户、有效内容供给；
- 与基线的变化，不把累计值和周期变化混在一起。

首页主区域改为：

1. “需要处理”：按严重级别、影响和截止时间排序的洞察任务。
2. “为什么”：指标证据、受影响业务和主要异常对象。
3. “去处理”：跳到带区域和筛选条件的真实业务页面。
4. “处理结果”：待复测、有效、无效、恶化和已回滚数量。

六个分析标签继续保留作为证据钻取页；骑手分析不再在侧边栏重复出现两个入口。

### 11.2 区域运营者视图

区域运营者默认进入“我的运营任务”，只显示授权区域：

- 今日优先事项最多突出 5 条，其余进入列表；
- 卡片显示严重级别、当前值/基线、样本量、截止时间和动作按钮；
- 可接受、开始、跳转处理、提交应用记录、忽略；
- AI 配置、全局排行和其他区域数据不可见；
- 没有可靠数据时显示缺失原因和补数据动作，不显示伪造建议。

### 11.3 超级管理员视图

超级管理员额外看到：

- 跨区域指标排行、异常分布和共性问题；
- 各区域待办、逾期率、完成率、建议采纳率和真实有效率；
- 规则阈值、最小样本、观察周期和保护指标配置；
- AI 模型、调用次数、Token、成本、失败和降级状态；
- 高风险建议审批、恶化任务和回滚入口；
- 数据质量、生成任务和复测任务运行状态。

### 11.4 洞察详情抽屉

详情按以下顺序展示：

1. 结论与影响范围。
2. 指标定义、当前值、基线、目标、样本量和数据质量。
3. 原因拆分与相关业务对象。
4. 建议动作、真实处理入口、风险和保护指标。
5. 负责人、截止时间和状态操作。
6. 修改前后快照和关联操作日志。
7. 自动复测时间、结果值和判定原因。
8. 完整时间线。

## 12. 与现有模块的整合

### 12.1 区域运营工作台

`RegionOpsWorkbench` 的“运营任务”改读 `BusinessInsight`，Redis 仅可做短缓存，不再作为事实来源。原来的内容不足、商家不足、导航未配置和今日无订单规则迁移为确定性洞察规则。

迁移完成前保留旧接口适配：旧任务接口从洞察表转换响应，避免页面一次性切换失败。不能再通过点击“完成”直接结束任务，必须提交应用记录并进入复测或明确忽略。

### 12.2 异常中心

异常中心继续展示 `SystemAlert`。critical 洞察或洞察执行故障生成异常；普通业务建议不进入异常中心，避免异常列表被低价值建议淹没。

### 12.3 骑手 AI 建议

旧 JSON 建议列表进入只读兼容期。新分析结果写入 `BusinessInsight`：

- 确定性规则创建主洞察；
- 模型文案写入同一洞察的 recommendation，不再创建重复建议；
- 旧 `accepted` 映射到 `accepted`，旧 `applied` 映射到 `verifying`；
- 不自动导入大量 pending/重复历史建议，避免污染正式任务；历史配置和运行日志保留可查。

## 13. 定时任务、并发和故障处理

复用现有定时任务和 Redis 锁模式：

- 指标检测默认每小时运行；按 `job+scope+period` 获取带所有者 Token 的分布式锁。
- 复测任务每 15 分钟扫描 `status=verifying AND verificationDueAt<=now`。
- 同一 fingerprint 使用数据库唯一约束幂等落库。
- 任务失败不修改已有洞察状态；记录运行错误，连续三次失败创建 `SystemAlert`。
- 模型调用失败只保留确定性建议并标记降级状态。
- 单个区域或规则失败不终止整批任务；结果记录成功、跳过和失败数量。
- 大范围排行使用分组聚合；禁止逐区域、逐日的串行 N+1 查询。

## 14. 修复、迁移、发布和回滚

### 14.1 迁移

数据库迁移只新增 `business_insights` 表、索引和权限项，不删除现有 Config、SystemAlert、Redis 任务或骑手建议数据。

增加功能开关：

- `business_insight_read_enabled`
- `business_insight_write_enabled`
- `business_insight_verify_enabled`
- `business_insight_ai_enrichment_enabled`

### 14.2 发布阶段

1. P0：修复数据范围、权限和指标口径；保持旧 UI。
2. 影子阶段：只生成洞察供超级管理员查看，不分配给运营者。
3. 运营试点：选择一个区域启用任务处置和复测。
4. 扩大区域：观察误报率、逾期率、查询耗时和数据质量。
5. 迁移区域工作台和骑手建议。
6. 最后启用模型增强；确定性闭环不依赖模型上线。

### 14.3 修复工具

超级管理员修复面板提供：

- 按规则、区域和周期重新计算洞察；
- 查看同 fingerprint 的生成/去重结果；
- 修复无负责人、非法状态、过期复测和缺失证据；
- 重新执行失败复测；
- 将误生成洞察批量标记为 dismissed，并保留原因；
- 查看数据质量检查，不允许直接手工改指标值。

### 14.4 回滚

发生严重问题时按顺序关闭：AI 增强、自动复测、洞察写入、洞察读取。旧分析看板和旧区域任务接口仍可返回兼容数据。回滚不删除洞察、操作日志或历史配置；修复后可继续复测。

涉及价格、派单、营销等业务配置的回滚仍在原业务模块执行，分析模块只保存回滚提示、快照和结果，不拥有跨域修改权限。

## 15. 监控

至少监控：

- 分析接口 P50/P95、错误率、慢查询和查询行数；
- 指标数据更新时间、partial 比例和跨源不一致数量；
- 每次检测的规则数、区域数、生成数、去重数、失败数和耗时；
- detected/accepted/in_progress/verifying/逾期数量；
- 建议接受率、应用率、有效率、恶化率、忽略率和误报率；
- 自动复测成功率、延迟和失败原因；
- AI 调用次数、Token、估算成本、超限跳过和降级次数；
- 数据范围拒绝次数和越权尝试日志。

连续任务失败、数据超过两个检测周期未更新、critical 洞察逾期、复测积压或 AI 成本接近上限时创建 `SystemAlert`。

## 16. 测试与验收

### 16.1 后端自动化

- 区域管理员不能查询、导出、查看详情或操作其他区域洞察。
- 不传 regionId 时，非超级管理员只能聚合授权区域。
- 超级管理员可查看全局与指定区域。
- 日期 DTO、业务时区、最大范围和粒度切换正确。
- 用户区域使用 `profile.regionId` 并按用户去重。
- GMV、支付单、退款额和退款率均使用支付事实且覆盖一致业务范围。
- 趋势一次聚合完成，不随天数产生线性串行查询。
- fingerprint 并发生成只产生一条洞察。
- 状态机非法跳转、重复请求和无权限请求得到正确响应。
- 自动复测使用原指标口径并正确判定四类 outcome。
- AI 限额、成本、范围和失败降级真实生效。

### 16.2 管理后台自动化

- 修复当前业务分析页面的日期范围类型错误并通过 `vue-tsc --noEmit`。
- 不同权限账号只显示允许的标签、按钮和配置字段。
- 区域、日期和业务筛选在总览、钻取和洞察之间保持一致。
- 详情抽屉完整显示证据、动作、负责人、时间线和复测。
- 空数据、partial 数据、加载失败、越权和任务冲突均有明确提示。

### 16.3 本地与运行验收

使用至少两个区域、一个超级管理员、一个平台运营和两个区域负责人进行验收：

1. 制造一个只属于区域 A 的可验证异常。
2. 区域 A 负责人可查看和接受；区域 B 负责人无法通过 UI 或直接请求访问。
3. 负责人跳到真实业务页面处理并提交应用记录。
4. 到期复测产生真实结果；结果和操作时间线可回看。
5. 超级管理员看到跨区域状态和有效率，普通运营看不到 AI 密钥和全局规则。
6. 关闭各功能开关后旧页面仍可使用，历史洞察不丢失。

自动测试、类型检查和本地构建通过只证明本地实现；真实数据库规模、定时任务、角色登录和部署后的运行结果必须单独验证。

## 17. 实施顺序

实施计划必须按以下依赖顺序拆分：

1. P0 数据范围、权限拆分、DTO 和指标口径测试。
2. `BusinessInsight` 迁移、服务、状态机、操作日志和查询接口。
3. 确定性规则、fingerprint 去重和手动生成。
4. 业务分析首页、我的任务、详情抽屉和角色视图。
5. 自动复测、结果判定、异常升级和监控。
6. 区域运营工作台、骑手建议和旧接口兼容迁移。
7. AI 配额、成本、范围、降级和文案增强。
8. 多角色、多区域本地验收；部署与真实运行另行确认。

每一阶段都必须保留最小可运行检查，不把后续阶段的“计划存在”描述成当前阶段已经完成。
