# 商家资金账本、收款账户与活动出资闭环设计

**日期：** 2026-07-26

**适用范围：** `后端后台本地测试版` 后端与管理后台，后续商家 Web 端

**状态：** 资金路线已确认，待用户复核本文后进入实施计划

## 1. 目标与边界

本设计建立外卖商家的第一条完整资金链：订单金额形成商家账、活动优惠明确出资方、退款按原分摊冲回、账单锁定可结算明细、打款绑定当时的已核验账户，并且平台与商家都能逐笔解释金额来源。

已经确认的首期资金路线是：

1. 用户继续向平台现有支付入口付款；
2. 商家在 Web 端提交银行卡或支付宝收款账户；
3. 平台完成账户核验后，系统按周期生成商家结算单；
4. 首期支持人工或半自动打款，并保存回单、流水号和打款尝试；
5. 后续具备微信支付服务商/平台能力后，再把打款适配器升级为子商户结算或分账，不改商家账本和结算规则。

本轮不扩散到以下内容：

- 不在本轮完成批量投券、人群圈选和营销触达；这些在商家资金底座稳定后作为独立子项目。
- 不在本轮重做骑手结算；继续使用现有 `RiderSettlement` 与 `RiderSettlementItem`。
- 不创建第二套订单、支付、退款或商家后端。
- 不直接接通真实银行卡、支付宝或微信自动转账；首期只建立安全适配器和人工/半自动打款闭环。
- 不删除现有 `SubsidyLedger`、`MerchantSettlement` 或历史结算单。
- 不用订单页面临时统计替代正式账本。

## 2. 方案比较与选择

### 2.1 采用方案：平台统一收款，账本先行，分阶段升级打款

优点：可以复用当前支付、退款、补贴台账和线下打款能力；最早形成可解释、可恢复的商家财务闭环；将来切换微信子商户或自动分账时，不影响订单与账单历史。

代价：首期平台财务仍需核验账户和处理打款，必须建设对账、审计和异常修复能力。

### 2.2 暂不采用：第一期直接接微信子商户与自动分账

优点：资金可直接进入子商户体系，长期人工操作较少。

暂不采用原因：依赖平台主体资质、商家进件、授权、分账比例和支付渠道配置；异步分账、分账回退和退款处理仍需要内部账本。现在直接接入只会把尚未厘清的金额问题带到真实资金渠道。

### 2.3 不采用：每个商家直接使用自己的支付参数收款

优点：平台表面上不需要周期打款。

不采用原因：平台优惠、跨店营销、佣金、平台配送、统一退款和售后都会被拆散；商家支付配置泄漏或失效还会直接阻断用户下单，并形成多套支付状态来源。

## 3. 资金口径

每笔订单必须在创建时保存服务端金额快照。外卖商家资金口径固定为：

```text
商家商品原价收入
+ 商家拥有的包装费
- 商家承担的优惠
+ 平台/区域/赞助方补给商家的优惠
- 商家承担的退款
- 平台佣金
+ 人工补偿
- 人工扣减
= 商家最终应收
```

平台配送费、骑手奖励和小费不进入商家收入；自配送商家的配送费是否归商家，由订单创建时的配送模式和区域合同快照决定，不能在结算时读取当前配置后重新解释历史订单。

默认佣金基数为：

```text
商品原价收入 + 商家拥有的包装费 - 商家承担的优惠 - 商家承担的退款
```

平台、区域或赞助方补贴不计入佣金基数。区域以后需要其他合同口径时，应以订单级 `commissionPolicySnapshot` 保存，不能修改旧账。

所有金额使用 `Decimal(12,2)`；API 对商家 Web 和后台统一返回十进制金额字符串，不在同一接口混用“分”和“元”。数据库账务行金额始终为正数，收入/支出由 `direction` 表示，禁止依赖正负号猜测业务含义。

## 4. 单一资金写入口

新增 `MerchantLedgerService`，作为商家资金变化的唯一写入口。订单服务、支付回调、退款服务、营销活动和管理后台不能直接修改商家余额或结算总额。

```text
订单创建/支付确认 ─┐
退款成功回调     ─┼─> MerchantLedgerService ─> MerchantLedgerEntry
活动优惠分摊     ─┤                           ├> SubsidyLedger
后台人工调整     ─┘                           └> MerchantSettlement

MerchantSettlementService ─> 锁定账务行 ─> 生成结算单
MerchantPayoutService     ─> 打款尝试   ─> 人工/自动渠道适配器
```

`MerchantLedgerService` 只负责：

- 根据权威订单/退款/活动事件创建幂等账务行；
- 推进 `pending -> available -> locked -> settled/cancelled`；
- 根据原始资金分摊生成冲正；
- 提供余额聚合和账单明细查询。

它不负责更新订单履约状态、不调用支付退款、不发送营销消息。通知在资金事务提交后通过现有 `NotifyService` 发送，通知失败不能回滚账务事实。

## 5. 数据模型

### 5.1 `MerchantPayoutAccount`

新增商家收款账户：

| 字段 | 类型 | 用途 |
|---|---|---|
| `id` | `String` | 主键 |
| `merchantId` | `String` | 所属门店；首期按门店结算 |
| `accountType` | `String` | `bank_card/alipay` |
| `accountHolder` | `String` | 收款主体姓名或企业名称 |
| `accountNoCiphertext` | `String` | AES-256-GCM 加密后的账号 |
| `accountNoFingerprint` | `String` | 使用独立密钥 HMAC 后的指纹，只用于去重 |
| `accountNoMasked` | `String` | 商家和后台日常展示的脱敏账号 |
| `bankName` | `String?` | 银行卡开户行 |
| `bankCode` | `String?` | 以后自动通道使用的银行编码 |
| `status` | `String` | `pending/verified/rejected/disabled` |
| `isDefault` | `Boolean` | 当前默认收款账户 |
| `submittedBy` | `String` | 提交商家员工 |
| `verifiedBy` | `String?` | 审核管理员 |
| `verifiedAt` | `DateTime?` | 审核时间 |
| `rejectReason` | `String?` | 驳回原因 |
| `effectiveAt` | `DateTime?` | 账户可用于新结算单的时间 |
| `version` | `Int` | 并发变更保护 |
| `createdAt/updatedAt` | `DateTime` | 审计时间 |

约束：

- 同一门店、账户类型和账号指纹不能重复创建未禁用账户；
- 一个门店只能有一个 `verified + isDefault=true` 账户，由事务条件更新保证；
- 任何人不能从普通查询接口获得明文账号；
- 解密只允许打款适配器在执行打款时调用；
- 使用独立环境变量 `PAYOUT_ACCOUNT_CREDENTIAL_KEY`，不得复用打印机或微信支付密钥；
- 删除账户采用 `disabled`，不物理删除历史账户。

### 5.2 `MerchantLedgerEntry`

新增商家不可变账务明细：

| 字段 | 类型 | 用途 |
|---|---|---|
| `id` | `String` | 主键 |
| `merchantId` | `String` | 资金归属门店 |
| `entryNo` | `String` | 可展示账务流水号，唯一 |
| `entryType` | `String` | `order_goods/merchant_discount/external_subsidy/commission/refund/adjustment` |
| `direction` | `String` | `credit/debit` |
| `amount` | `Decimal(12,2)` | 正数金额 |
| `status` | `String` | `pending/available/locked/settled/cancelled` |
| `orderId/orderNo` | `String?` | 外卖订单来源 |
| `sourceType/sourceId` | `String` | 原始事件类型和 ID |
| `payerType/payerId` | `String?` | `platform/merchant/region/sponsor` 及主体 |
| `campaignId` | `String?` | 活动来源 |
| `commissionRateSnapshot` | `Decimal?` | 订单佣金率快照 |
| `availableAt` | `DateTime?` | 售后冷静期结束，可进入结算的时间 |
| `settlementId` | `String?` | 锁定到的商家结算单 |
| `reversalOfId` | `String?` | 冲正对应原账务行 |
| `dedupeKey` | `String` | 业务幂等键，唯一 |
| `metadata` | `Json?` | 金额组成、退款分配等审计快照 |
| `createdAt/updatedAt` | `DateTime` | 审计时间 |

余额不单独维护可被随意修改的字段，查询时按状态和方向聚合：

- `pendingBalance`：等待履约完成或售后冷静期；
- `availableBalance`：可进入新结算单；
- `lockedBalance`：已进入结算单但未打款；
- `settledBalance`：历史已支付净额；
- `adjustmentBalance`：未被后续收入完全抵扣的负向调整。

首期数据量可以直接使用带索引的数据库聚合，不新增缓存余额表。只有真实数据证明聚合成为瓶颈后，才增加可重建的余额快照。

`order_goods` 金额必须从订单商品、规格、小料和包装费的服务端快照生成，不能直接把已经包含优惠结果的 `Order.totalAmount` 当成商品原价收入。`Order.totalAmount`、`discountAmount`、`subsidyAmount` 和商家账务聚合会在审计中互相校验，但商家账务行是结算唯一来源。

### 5.3 复用并扩展 `SubsidyLedger`

继续使用现有补贴台账，不再创建第二张活动成本表。增加或正式约束：

- `dedupeKey String? @unique`：同一订单、同一优惠、同一出资方只入账一次；
- 一个优惠允许生成多条补贴台账，支持平台与商家按金额共同承担；
- `payerType/payerId` 必须和活动资金快照一致；
- `receiverType=merchant` 时，平台/区域/赞助方承担的部分必须同步生成 `external_subsidy + credit` 商家账务行；
- 商家自己承担的优惠生成 `merchant_discount + debit`，不能同时补回商家；
- 退款成功后原补贴台账进入 `cancelled` 或按退款比例生成冲正，不能只恢复优惠券状态。

### 5.4 复用并扩展 `MerchantSettlement`

保留现有结算单号、周期、金额、平台费、状态、流水号和防重 `periodKey`，增加：

| 字段 | 用途 |
|---|---|
| `grossAmount` | 锁定账务行的收入合计 |
| `debitAmount` | 优惠、佣金、退款和调整支出合计 |
| `subsidyAmount` | 外部补贴收入合计 |
| `netAmount` | 实际应付商家金额 |
| `payoutAccountId` | 生成时选中的已核验账户 |
| `payoutAccountSnapshot` | 当时账户类型、持有人和脱敏账号，不含明文 |
| `merchantConfirmedAt` | 商家确认时间 |
| `disputeStatus` | `none/open/resolved/rejected` |
| `disputeReason` | 商家异议说明 |
| `disputeResolvedBy/At` | 平台处理记录 |
| `failureReason` | 最近一次结算或打款失败原因 |
| `paidAmount` | 实际已支付金额 |

新结算单的字段兼容关系固定为：

```text
grossAmount   = order_goods 收入
subsidyAmount = external_subsidy 收入
debitAmount   = 全部 debit，包含平台佣金
netAmount     = grossAmount + subsidyAmount - debitAmount
platformFee   = debitAmount 中 commission 的子集
amount        = netAmount + platformFee
```

因此旧接口继续使用 `amount - platformFee` 时仍得到新结算单的 `netAmount`，不会因为新增字段重复扣佣金。新页面直接读取 `netAmount`。

兼容现有状态并明确含义：

```text
pending    = 已生成，处于商家查看/异议窗口
completed  = 核算确认，可发起打款
processing = 已发起一次打款，等待最终结果
paid       = 最终打款成功
failed     = 打款或人工处理失败，可重试
cancelled  = 打款前因退款、异议调整或账户风险作废，永不支付
```

`completed` 只表示账单核算完成，绝不能在商家端展示成“已到账”。

### 5.5 `MerchantPayoutAttempt`

新增每次打款尝试，避免在结算单上覆盖失败历史：

- `settlementId`、`attemptNo`、`channel=manual/bank/alipay/wechat_submerchant`；
- `idempotencyKey` 唯一；
- `amount`、`status=pending/processing/succeeded/failed/unknown`；
- `externalRequestNo`、`externalTransferNo`；
- `accountSnapshot`，只保存脱敏信息和账户版本；
- `requestedBy/requestedAt`、`completedAt`；
- `failureCode/failureReason`、`rawResult`（过滤密钥与完整账号后保存）。

结算单允许多次失败尝试，但只允许一次成功。打款渠道返回“已受理”时只能进入 `processing/unknown`；只有人工上传并复核回单，或渠道最终查询确认成功后才能进入 `paid`。

### 5.6 正式活动资金快照

现有活动规则保存在通用配置中，首轮不同时建设完整投券平台，但下单时必须把活动资金规则规范化为：

```ts
type DiscountFundingAllocation = {
  payerType: 'platform' | 'merchant' | 'region' | 'sponsor'
  payerId: string | null
  amount: string
}
```

规则：

- 各方 `amount` 之和必须等于本次优惠金额；
- 金额以服务端规则计算，客户端不能指定出资方或比例；
- 下单事务保存到 `SubsidyLedger.metadata.fundingAllocation` 和商家账务行；
- 后续活动模型迁移时读取同一结构，不改变历史订单；
- 第一阶段支持平台全额、商家全额、区域全额以及平台+商家两方按金额分摊；三方以上组合和动态竞价不在首期范围。

本轮保证“优惠发生后由谁承担、如何补给商家、退款如何冲回”正确，但不把现有按聚合金额判断预算描述成并发安全。共享出资活动在正式营销活动子项目完成原子预算预占前只允许测试区域灰度；普通单一出资优惠继续使用现有入口，并接受账务差异监控。

## 6. 订单资金生命周期

### 6.1 创建订单

订单服务继续负责服务端报价、库存和优惠占用。在同一数据库事务中：

1. 保存订单商品、包装费、配送费、优惠和佣金政策快照；
2. 原子占用优惠券；
3. 计算活动资金分摊；
4. 创建 `pending` 的 `SubsidyLedger`；
5. 创建 `pending` 的商家账务行，但不形成可提现资金。

支付未完成而订单超时关闭时，订单释放服务必须一次性取消对应商家账务行、补贴台账和优惠占用。

### 6.2 支付成功

支付回调仍是微信支付结果权威。回调在推进支付单和订单状态的同一事务中确认账务行有效，但账务行仍保持 `pending`，因为订单尚未履约完成。

余额支付和零元订单调用同一账务接口，不能各自重算优惠和商家应收。

### 6.3 履约完成

订单真正进入 `COMPLETED` 后，为相关账务行设置 `availableAt`。默认售后冷静期沿用结算配置；首期若没有独立配置，使用订单完成后 24 小时。

定时任务只把同时满足以下条件的账务行从 `pending` 推进为 `available`：

- 订单为 `COMPLETED`；
- `availableAt <= 当前时间`；
- 不处于 `refunding/refunded`；
- 没有未完结订单申诉；
- 没有资金冻结级风险事件；
- 账务行仍是 `pending`。

状态推进使用带旧状态的条件更新，重复任务不重复释放资金。

### 6.4 退款

只有支付退款最终成功后才写商家冲正。退款申请或渠道受理不等于退款成功。

退款按照订单创建时的原资金快照分配：

1. 先计算退款覆盖商品、包装费、配送费和优惠的比例；
2. 商家承担部分生成 `refund/merchant_discount` 冲正；
3. 平台、区域或赞助方承担的补贴按原比例取消或冲正；
4. 佣金按照原佣金政策生成反向调整；
5. 每一条冲正通过 `reversalOfId + refundId` 形成唯一幂等键。

若原账务行仍是 `pending/available`，可以取消原行并创建净额明细；若已经 `locked`，退款阻止该结算单继续打款并触发重新核算；若已经 `settled`，生成新的负向账务行，从商家后续可结算收入抵扣。首期不从商家银行卡主动扣款。

`locked` 账务行发生退款时，不直接修改商家已经看过的结算单：若结算单尚未进入 `processing/paid`，同一事务把结算单标为 `cancelled`、解除未变化账务行的锁定、创建退款冲正，再由管理员生成新结算单。若已经进入 `processing`，先把打款结果查明；结果未知时冻结结算和后续重试，禁止一边退款重算一边重复打款。

## 7. 商家结算生命周期

### 7.1 生成结算单

`MerchantSettlementService.generate` 按门店加 Redis 锁防止重复操作，并在数据库事务中：

1. 校验周期不与 `pending/completed/processing/paid/failed` 结算单重叠，忽略已 `cancelled` 账单；
2. 查询周期内 `available` 且未绑定结算单的商家账务行；
3. 校验门店存在默认 `verified` 收款账户；
4. 按账务行汇总收入、补贴、支出和净额；
5. 创建结算单及账户脱敏快照；
6. 条件更新账务行为 `locked` 并写入 `settlementId`；
7. 若锁定数量与预期不一致，整个事务回滚。

新结算单 `periodKey` 使用 `merchantId:startAt:endAt:vN`。取消账单保留原 `periodKey` 作为审计记录，重新生成时递增版本号；不能清空旧键后伪装成原账单从未存在。

结算金额必须来自账务行，停止从订单表临时重算。订单表和补贴台账只用于追溯，不再作为结算单总额的第二来源。

### 7.2 商家查看与异议

商家 Web 展示每张结算单的订单级组成、平台补贴、商家优惠、佣金、退款和调整。商家可以：

- 确认无异议；
- 在结算单未打款前提出一次在途异议；
- 选择具体账务行并填写原因；
- 查看平台处理结果。

存在 `open` 异议时不能进入打款。平台驳回或处理异议必须记录管理员、原因和资金调整行，禁止直接覆盖旧金额。

### 7.3 核算确认与打款

管理员核算确认后结算单进入 `completed`。发起打款时：

- 结算单必须是 `completed/failed`；
- 净额必须大于 0；负向结算通过后续收入抵扣；
- 账户必须仍为已核验，但实际收款信息使用结算单账户快照对应的账户版本；
- 创建唯一打款尝试并将结算单推进为 `processing`；
- 人工打款必须填写渠道流水号、打款时间并上传回单；另一名具备财务复核权限的管理员确认后才标记成功；
- 自动渠道必须主动查询或接收已验签终态，不能把接口受理当成功。

打款成功后，同事务将结算单改为 `paid`、账务行改为 `settled`、补贴台账绑定并推进为 `settled`。任一步失败均不能出现“结算单已支付但账务行仍可再次结算”。

## 8. 收款账户流程

```text
商家提交
  -> pending（只显示脱敏账号）
  -> verified（管理员核验，可设默认）
  -> rejected（商家修改后重新提交新版本）
  -> disabled（停用，不影响旧结算单）
```

规则：

- 只有门店所有者或 `merchant:finance_account:manage` 员工可以提交和变更；
- 修改账号永远创建新版本，不覆盖已核验旧记录；
- 新账户核验前，原默认账户继续有效；
- 核验新账户并设默认时，旧账户取消默认但不禁用；
- 正常更换默认账户不改变已生成结算单；若旧账户因风险被 `disabled`，所有引用它且未打款的结算单暂停，管理员作废后使用新核验账户重新生成；
- 账户变更、核验、设默认和停用均写管理审计，并通知门店所有者；
- 首期核验由平台人工完成，必须记录核验依据类型，不存储身份证照片在本表；
- API 日志、错误日志和操作日志禁止打印明文账号。

## 9. 后端接口

### 9.1 商家 Web

- `GET /merchant-web/shops`：当前账号可管理门店。
- `GET /merchant-web/shops/:merchantId/finance/overview`：待入账、可结算、结算中、已结算和负向调整。
- `GET /merchant-web/shops/:merchantId/finance/ledger`：分页查询资金明细及订单来源。
- `GET /merchant-web/shops/:merchantId/finance/settlements`：结算单列表。
- `GET /merchant-web/shops/:merchantId/finance/settlements/:id`：账单和账务行明细。
- `POST /merchant-web/shops/:merchantId/finance/settlements/:id/confirm`：商家确认。
- `POST /merchant-web/shops/:merchantId/finance/settlements/:id/dispute`：提交异议。
- `GET /merchant-web/shops/:merchantId/payout-accounts`：仅返回脱敏账户。
- `POST /merchant-web/shops/:merchantId/payout-accounts`：提交新账户版本。
- `PUT /merchant-web/shops/:merchantId/payout-accounts/:id/default`：设置已核验默认账户。
- `PUT /merchant-web/shops/:merchantId/payout-accounts/:id/disable`：停用非在途账户。

所有响应由服务端返回 `allowedActions`，商家 Web 不根据状态字符串自行猜测操作权限。

### 9.2 平台后台

- `GET /admin/finance/merchant-ledger`：按区域、门店、类型、状态、订单筛选。
- `GET/POST /admin/finance/merchant-payout-accounts/:id/review`：账户核验。
- `POST /admin/finance/merchant-payout-accounts/:id/reveal`：人工打款前受控查看一次完整账号。
- `POST /admin/finance/merchant-settlements/generate`：从可结算账务行生成账单。
- `POST /admin/finance/merchant-settlements/:id/confirm`：核算确认。
- `POST /admin/finance/merchant-settlements/:id/payouts`：发起人工或自动打款。
- `POST /admin/finance/merchant-settlements/:id/payouts/:attemptId/review`：人工回单复核。
- `POST /admin/finance/merchant-settlements/:id/payouts/:attemptId/requery`：查询自动渠道最终状态。
- `POST /admin/finance/merchant-settlements/:id/disputes/resolve`：处理商家异议。
- `POST /admin/finance/merchant-ledger/adjustments`：创建有原因、有审批人的人工调整。

旧结算列表和确认接口在兼容期调用新服务，返回旧字段与新字段；旧的“填写流水号直接 paid”入口下线，改为创建人工打款尝试。

完整账号查看接口仅允许 `finance:merchant_payout:create`，要求最近二次验证、高风险操作确认、结算单引用校验和查看原因；每次查看写独立审计并通知财务安全负责人。响应设置禁止缓存，前端不保存、不写入通用日志，也不提供包含完整账号的批量导出。以后接入服务端自动通道后，默认关闭人工查看入口。

## 10. 商家 Web 财务页面

首期只建设五个页面，不继续堆叠低频配置：

1. **资金概览**：待入账、可结算、结算中、已结算、负向调整；金额口径帮助说明。
2. **资金明细**：每一笔订单收入、优惠、补贴、佣金、退款、调整，支持按订单跳转。
3. **结算账单**：周期、净额、账户、状态、明细、确认和异议。
4. **收款账户**：新增、核验状态、默认账户、变更历史；不显示完整账号。
5. **打款记录**：打款渠道、流水号、发起时间、最终状态、失败原因和回单。

多店账号顶部始终显示当前门店，财务筛选不会跨门店混合。平台主体级汇总在后续多店财务子项目中建设，首期不允许把不同门店结算到一个未经核验的临时账户。

## 11. 平台后台页面

平台财务只保留四条主任务流：

1. 待核验收款账户；
2. 待生成/待核算商家结算；
3. 待打款/处理中/失败打款；
4. 商家异议和资金异常。

数据看板必须展示可行动异常，不把全部历史结算单当待办。区域管理员只查看授权区域；超级管理员查看全局但敏感账号仍默认遮罩。任何导出只包含脱敏账号，完整收款信息不进入通用 Excel 导出。

## 12. 权限与安全

新增最小权限点：

- `merchant:finance:view`
- `merchant:finance_account:manage`
- `merchant:settlement:confirm`
- `finance:merchant_account:review`
- `finance:merchant_settlement:generate`
- `finance:merchant_settlement:confirm`
- `finance:merchant_payout:create`
- `finance:merchant_payout:review`
- `finance:merchant_adjustment:create`

多店员工体系落地前，当前 `Merchant.userId` 所有者临时拥有本门店的财务查看、账户管理和账单确认能力；普通用户没有这些权限。后续员工与角色子项目把相同权限点分配给店主、店长和财务人员，不改变本设计的接口和数据范围校验。

人工打款创建与复核不能由同一个管理员完成。超级管理员也受该双人复核规则约束；紧急跳过必须使用现有高风险操作机制并留下原因、审批人和告警。

敏感信息安全要求：

- AES-256-GCM 随机 IV 加密账号，HMAC 指纹使用不同派生密钥；
- 密钥只来自环境变量，缺失时禁止提交或执行打款，不生成弱默认值；
- DTO、日志、异常、审计详情和监控标签只允许脱敏账号；
- 接口限频，账户新增和变更要求最近重新登录或二次验证；
- 打款接口使用服务端生成幂等键，前端不能指定终态；
- 原始渠道响应在落库前过滤证书、签名、密钥、明文账户和个人证件信息。

## 13. 异常、修复与回滚

### 13.1 必须可识别的异常

- 商家有可结算余额但没有已核验默认账户；
- 账务行卡在 `pending` 超过售后冷静期；
- 账务行被两个结算单竞争锁定；
- 退款成功但未生成冲正；
- 平台补贴已支出但未补到商家账；
- 结算单金额与所含账务行聚合不一致；
- 打款长时间 `processing/unknown`；
- 结算单 `paid` 但账务行或补贴台账未 `settled`；
- 已结算退款形成负向余额但后续结算未抵扣。

### 13.2 修复工具

新增只读审计脚本和受控修复脚本：

- 审计脚本按订单重算预期账务组成，只输出差异，不默认写库；
- 历史回填脚本按日期、区域和门店分批生成账务行，使用 `dedupeKey` 可重复执行；
- 修复写入必须显式传入 `--apply`、操作者和原因，并先输出将影响的行数与金额；
- 打款状态修复优先查询渠道，不允许直接把 `unknown` 改成成功；
- 所有修复创建管理审计和资金调整来源，不能静默修改历史金额。

### 13.3 回滚

发布开关：

- `merchantLedgerV2Enabled`
- `merchantSettlementV2Enabled`
- `merchantPayoutAccountEnabled`

开关按区域读取。关闭 V2 时停止创建新结算单和新打款，但仍允许读取已经生成的 V2 账务、账单和打款记录；不能回到订单临时统计后继续支付。回滚不删除新表、不回写历史订单、不撤销已经成功的真实资金。

## 14. 迁移与上线顺序

1. 增量创建新表、字段、索引和权限点，不修改历史状态含义。
2. 上线双读审计：旧商家收入统计与 V2 账务聚合并行展示给内部管理员，不用于真实打款。
3. 对未结算完成订单生成历史账务行；已支付历史结算只建立只读关联，不重新打款。
4. 按一个测试区域启用账务写入，观察订单、退款和补贴差异。
5. 开启商家收款账户提交与人工核验。
6. 在测试区域用 V2 生成账单，但先不允许打款，人工核对订单级明细。
7. 开启人工打款与双人复核，完成至少一个完整周期。
8. 观察无差异后再按区域扩大；自动分账作为后续独立发布。

迁移前必须备份目标数据库并记录恢复点。历史回填先运行 dry-run，核对订单数、收入、优惠、补贴、佣金、退款和净额六组总数后，才允许 `--apply`。

## 15. 监控与运营指标

监控至少包括：

- 商家账务创建失败数和金额；
- 订单完成后超过 26 小时仍为 `pending` 的账务行；
- 补贴台账与商家外部补贴收入差额；
- 退款成功与商家冲正差额；
- 可结算但无核验账户的门店数和金额；
- 结算单与账务行聚合差额；
- 打款成功率、失败率、未知状态时长和重试次数；
- 已支付结算与已结算账务行差额；
- 商家异议数量、金额和处理时长。

金额差异告警阈值为 0.01 元；任何非零差异都进入财务异常列表。仪表盘只统计权威账务行，不把前端埋点或页面展示金额作为财务事实。

## 16. 测试与验收

### 16.1 单元与事务测试

- 平台、商家、区域及平台+商家共同出资的优惠分摊金额之和准确；
- 同一支付回调、订单完成任务和退款回调重复执行不会重复入账；
- 平台补贴生成商家收入，商家优惠不生成补回；
- 部分退款按原资金快照生成正确冲正；
- 已结算退款形成负向后续抵扣，不重复扣款；
- 两个并发结算生成请求只能锁定每条账务行一次；
- 结算单金额等于所含账务行按方向聚合结果；
- 修改默认账户不改变旧结算单账户快照；
- 创建打款与复核人为同一账号时拒绝；
- 打款渠道只返回受理时结算单不能进入 `paid`；
- 打款成功回调重复执行不会二次结算。

### 16.2 权限与安全测试

- 无门店权限、仅订单权限和普通店员不能读取财务；
- 财务查看者不能修改收款账户；
- 区域管理员不能核验其他区域商家账户；
- 所有列表、日志、审计、导出和错误消息不包含完整账号；
- 缺少加密密钥时账户写入和打款安全失败；
- 被禁用账户不能用于新结算单，旧账单仍可追溯。

### 16.3 业务验收场景

至少用以下订单完成一个真实本地数据库周期：

1. 无优惠普通订单；
2. 平台全额承担优惠；
3. 商家全额承担优惠；
4. 平台与商家共同承担优惠；
5. 平台免配送会员权益；
6. 完成前全额退款；
7. 完成后部分退款；
8. 已结算后退款并从下一期抵扣；
9. 商家修改收款账户但旧账单仍使用旧快照；
10. 人工打款失败后重试成功。

通过条件：订单金额、补贴台账、商家账务、结算单、打款尝试和退款冲正在每个场景中逐笔一致，重复回调和 50 个并发结算请求不会造成重复资金记录。

本地测试通过不等于上线完成。正式完成仍需数据库迁移、目标环境配置、真实支付/退款回调、真实人工打款回单、商家 Web 操作和至少一个完整结算周期的观察证据。

## 17. 后续子项目顺序

本设计实现并稳定后，按以下顺序继续：

1. 商家 Web 日常经营端：账号、多店员工、订单、商品、库存、打印机和营业设置；
2. 正式营销活动模型：预算原子占用、活动审批、商家报名、优惠互斥与叠加；
3. 批量投券：受众快照、异步批次、暂停、重试、幂等和效果归因；
4. 骑手 App 生产闭环：独立账号、持续定位、导航、强提醒、凭证、异常和骑手财务；
5. 微信支付服务商/平台收付通或其他自动打款适配器。

后续模块必须消费本设计定义的订单资金快照、补贴台账和商家账务接口，不得各自重算商家应收。
