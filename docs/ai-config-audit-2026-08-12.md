# AI 配置全面审计报告

- 审计日期:2026-08-12
- 审计方式:4 路并行只读分析(后端核心模块 / 环境变量与校验 / 前端管理界面 / 业务消费链路)
- 范围:`backend/src/modules/ai-runtime`、`ai-admin`、`bot`、`operation`、`analytics/rider-ai-advisory`、`system-config`、`ops`、`backend/src/config/*`、`admin/src/views/ai/*`、部署模板与 CI

---

## 一、总体结论

AI 配置体系"能跑且考虑较全":配置版本化、调用日志、按日配额、审核失败转人工降级、密钥掩码回显链路都是加分项。**但存在 1 处确定的密钥泄露接口、1 条完全脱离体系的独立 AI 链路、以及大量"定义了却不生效"的死配置和三方配置漂移。** 主要风险集中在配置正确性与密钥管理,而非架构缺失。

## 二、体系结构现状

### 配置存储与优先级

- 存储于 Prisma `Config` 表(`key @unique`,value 为 JSON **明文**),涉及 4 个 key:
  - `ai_ops_config`(当前标准)、`ai_config` / `ai`(遗留只读回退)、`robot`(遗留镜像)
- 派生表:`AiConfigVersion`(版本快照)、`AiCallLog`(调用日志)、`AiQuotaUsage`(按日聚合用量)、`AiRiskEvent`、`AiModerationRecord`
- 加载链(`ai-runtime.service.ts:254-333`,**逐字段独立取第一个非空值**):

  ```
  ai_ops_config(DB) → ai_config(DB) → ai(DB) → 环境变量 → 硬编码默认
  ```

  注意:**数据库优先于环境变量**(与常见预期相反),且逐字段混合可能拼出 provider 来自 DB、key 来自 env 的"缝合配置",`source` 标识会失真。
- **无任何缓存**:一次调用至少 6 次 DB 往返,高频审核路径固定开销明显。

### 服务商抽象

- **没有 provider 抽象层**,仅支持 OpenAI 兼容协议 `POST {apiBaseUrl}/chat/completions`
- baseUrl 推导仅硬编码 deepseek / openai,**未知 provider 静默回落到 api.openai.com**(填了 Kimi 的 key 忘填 baseUrl 时,密钥会被发往 OpenAI —— 凭证外送风险)
- 成本单价表只认识 deepseek 和 gpt-4o-mini,其他模型成本计 0,`maxDailyCost` 配额对其静默失效
- 无多模型路由、无 provider fallback、调用层零重试

### 消费方全景

| 消费方 | 用途 | 配置来源 |
|---|---|---|
| post / comment / audit | 内容审核、意图分类 | ✅ 统一 ai-runtime |
| bot / ai-admin / operation / layout-config | 文案生成、布局生成 | ✅ 统一 ai-runtime |
| qrcode-moderation | 图片 QR 检测 + 视觉兜底 | ✅ 统一 ai-runtime |
| **rider-ai-advisory(骑手调度建议)** | **完全独立第二条链路** | ❌ **绕过统一配置** |
| assistant-ticket / recommend / search | **实际不使用任何 AI** | — |

## 三、高危问题(立即处理)

| # | 问题 | 位置 |
|---|---|---|
| H1 | **配置版本接口泄露明文 apiKey**:`getConfigVersions()` 原样返回整行(含未脱敏 `value`),仅 `ai:view` 权限即可通过 `GET /admin/ai/config/versions` 读到明文密钥;同表已有 `maskedValue` 字段却未使用 | `ai-admin.service.ts:1349-1362` |
| H2 | **apiKey 明文静态存储两处**:`configs` 表 + `ai_config_versions.value`(历史密钥永久留存,含已轮换旧 key),无加密/KMS | `ai-admin.service.ts:1592, 1602` |
| H3 | **rider-ai-advisory 完全脱离体系**:独立 config key `rider_ai_advisory_config_v1`、独立 key/endpoint、自己发 fetch 且**无超时**,不进 AiCallLog、不受配额守卫、成本恒 0,分钟级定时任务可能堆积挂起请求 | `rider-ai-advisory.service.ts:24, 145-252`;定时入口 `analytics.service.ts:943` |
| H4 | **AI 生成帖子不经内容审核**:帖子任务只看 `reviewBeforePost`,不调用 moderateContent、不过敏感词;评论任务反而有审核,行为不一致 | `ai-admin.service.ts:947-972`(对比 `:999-1024`) |
| H5 | **小程序用户可通过 `dto.persona` 注入 system prompt**(prompt injection 面) | `operation.service.ts:3975` |
| H6 | **二维码审核存在 SSRF 面**:对用户可控图片 URL 直接 `axios.get`,无内网 IP/协议白名单(有 8s 超时 + 10MB 上限缓解) | `qrcode-moderation.service.ts:176-183` |

## 四、中危问题(尽快修复)

### 配置一致性

| # | 问题 | 位置 |
|---|---|---|
| M1 | **僵尸变量 `AI_BASE_URL`**:deploy 模板有、代码从不读(代码读 `AI_API_BASE_URL`/`AI_API_URL`),客户按模板配置完全不生效,且被 install.sh 复制进所有生产 .env | `deploy/env.backend.example:89`;`install.sh:74-77` |
| M2 | **7 个实际使用的 AI 变量脱离 Joi schema**(AI_PROVIDER/OPENAI_PROVIDER/AI_MODEL/AI_API_BASE_URL/AI_API_URL/OPENAI_BASE_URL/DEEPSEEK_BASE_URL),被 stripUnknown 剥离、零校验,URL 无 uri 校验 | `env.validation.ts:259-296` |
| M3 | **配置双写入口 group 不一致**:ai-admin 写 `group:'ai'`,system-config 写 `group:'ai_ops_config'`,`resetGroup('ai')` 只清一半,出现"重置后配置仍在" | `ai-admin.service.ts:1595`;`system-config.service.ts:273` |
| M4 | **配置回显字段回写污染**:`hasApiKey`/`source` 混入前端表单并全量 PUT 回,被持久化进配置值 | `AiConfig.vue:260-282`;`ai-admin.service.ts:1586` |
| M5 | **诊断/测试接口权限前后端倒挂**:后端 `ai:view` 即可触发真实消耗额度的模型调用,前端却按 `ai:edit` 隐藏按钮 | `ai-admin.controller.ts:290, 297` |
| M6 | **双套 AI 配置中心并存**:`/admin/ai/config`(ai:edit)与 `/admin/config/ai-ops`(system:config)职责割裂;`/ai/ops-config` 路由守卫与接口权限不匹配,ai:view-only 角色打开全 403;`admin.ts:956-967` 三个 API 封装是无调用方死代码 | `access.ts:94`;`AiOpsConfigCenter.vue` |
| M7 | **死配置项**:`scheduling.autoRetryFailed/maxRetryTimes`、`riskControl.failurePauseMinutes/maxLikesPerDay/maxMiniProgramCallsPerUserDay`、`quietHours*` 定义了但无代码消费;`aiPromptTemplate` 表有 CRUD 无消费方 | `ai-admin.service.ts:24-61`;`bot.service.ts:210-249` |
| M8 | 生产环境 AI key 无占位符/弱值拦截(与 JWT_SECRET 的 productionPlaceholderCheck 不一致) | `env.validation.ts:139-141` |
| M9 | 配额守卫忽略 regionId/botId 维度(存了 scopeKey 但查询不用);token 用 chars/3 粗估 | `ai-runtime.service.ts:208-232, 122-125` |
| M10 | provider 错误细节(状态码+报文片段)透传到 C 端小程序 | `ai-runtime.service.ts:406` + `operation.service.ts:4107-4125` |
| M11 | axios 前端 15s 超时 vs 后端 AI 调用 30s,诊断/测试生成大概率误报"请求超时" | `request.ts:7`;`ai-runtime.service.ts:362` |
| M12 | **隐式启用**:三配置源都未显式 enabled 时,只要有 apiKey 就视为启用;运维状态页判定(须 DB enabled=true)与运行时不一致,状态误报 | `ai-runtime.service.ts:311-316`;`ops.service.ts:171-178` |

## 五、低危问题(择机清理)

- L1 脱敏掩码两种写法并存(`********` vs `******`)(ai-admin / system-config)
- L2 `boolValue("false") === true` 陷阱:DB 中布尔存成字符串 `"false"` 会被当作开启(`ai-runtime.service.ts:89-94`)
- L3 遗留 key 三套并存 + robot 镜像,无清理/迁移脚本;回滚旧版本可能复活废弃字段
- L4 AiCallLog 明文存储 600 字 prompt 预览,含用户内容隐私
- L5 AiConfig 表单零校验(quietStart/quietEnd 无 HH:mm 校验、apiBaseUrl 无 URL 校验);`maxDailyCost` 无币种标注
- L6 AiGovernance 全部 load 函数无 catch,弹窗取消产生 unhandled rejection(`AiGovernance.vue:356-481`)
- L7 错误 toast 双发(响应拦截器 + 页面 catch);PersonaList 按钮未做 ai:edit 前端门控
- L8 deploy example 缺 `OPENAI_API_KEY`/`DEEPSEEK_API_KEY`,backend example 缺 `AI_PROVIDER`/`AI_MODEL`;`env.validation.spec.ts` 无 AI 用例
- L9 QR 扫描内存缓存多实例不一致(`qrcode-moderation.service.ts:44, 139-167`)
- L10 每次保存强制产生新版本,无 diff/防抖;全量提交

## 六、做得好的部分(值得肯定)

- 密钥掩码链路完整:sanitizeConfig + getSafeConfig + 版本 maskedValue + 掩码回写保护,未发现明文回显接口
- 审核链路降级完善:AI 未配置/超时/解析失败 → 转人工,manualFallback 可按规则自动裁决
- 调用日志与配额体系设计完整(requestId/promptHash/latency/tokens/cost 全留痕)
- 操作审计(logOperation + IP)覆盖写操作;权限空缓存默认拒绝
- 诊断/测试生成按钮、日志报错中文翻译等运营体验较好
- 密钥不落 Dockerfile/CI,rsync 排除 .env,升级不丢密钥

## 七、修复优先级建议

1. **P0(本周)**:`getConfigVersions` 改用 `maskedValue` 返回(H1);rider-ai-advisory 接入 AiRuntimeService 或至少补超时+日志+配额(H3);收紧 config/test 接口权限到 `ai:edit`(M5)
2. **P1(两周内)**:AI 生成帖子接入审核管线(H4);屏蔽 dto.persona 注入(H5);统一 baseUrl 变量名并修复 deploy 模板僵尸变量(M1);7 个变量补入 Joi schema + uri 校验 + 生产占位符检查(M2/M8);统一配置写入 group(M3)
3. **P2(迭代内)**:apiKey 加密存储(H2);apiKey 加带失效的短 TTL 缓存;QR 审核 SSRF 白名单(H6);清理死配置与三套 legacy key(M7/L3);过滤回显字段回写(M4)
4. **P3(体验)**:前端表单校验、超时对齐、catch 补全、错误提示去重
