# 福利抽奖：发帖参与条件上线记录

## 结果与使用入口

2026-10-07 18:55:17（北京时间），服务器发布 `20261007-welfare-post-01` 完成并通过验证。后台刷新后，在“福利抽奖 → 新建活动／编辑草稿 → 参与条件”勾选“发一篇帖子”。已有活动默认关闭；已发布活动继续锁定参与规则。

小程序开发版 `2026.10.07.5` 已通过微信开发者工具上传，AppID 为 `wxe19d584cba3437f9`。本次没有提交微信审核或发布正式版，正式使用还需完成微信审核发布。最终上传总大小 9,486,146 字节，主包 1,942,499 字节。

## 最终业务规则

- 至少有一篇活动首次发布后创建、审核通过、仍可见且未删除的校园社区帖子。仅提交、待审核、驳回及活动发布前的帖子不算完成。
- 校区活动仅计算本活动校区帖子；全平台活动接受任意校区帖子。
- 报名时由服务端核验，开奖前再次核验。没有合格帖子时取消抽奖资格，并展示中文原因“开奖前没有活动发布后审核通过且仍可见的合格帖子”；如仍有其他合格帖子，则保留资格。
- 开奖复核先过滤不合格用户，再计算实际有效参与人数、最低人数和中奖候选；预设中奖用户同样接受核验。
- 小程序显示“去发帖”“审核中”“已完成”与重新核验入口；发帖返回后刷新状态。支持活动开始前提前完成和开奖前补发，发帖后仍需主动完成报名。
- 成功页、等待开奖页提醒保留合格帖子。身份状态接口只返回完成／待审核标记，不返回帖子正文。

## 代码与数据变更

新增 `WelfareCampaign.requirePost`，默认 `false`；MySQL、PostgreSQL 与根 Prisma schema 同步。新增 `welfare-post.policy.ts` 负责时间、审核、可见性、校区过滤以及按用户批量聚合，报名与开奖复用同一资格标准。

发布包共核验 359 个文件：23 个后端源码、编译产物、schema／迁移文件及 336 个后台静态资源。发布前按服务器原始源码构建并检查基线，避免携带本地其他未发布功能。仅重载 API 与 worker，realtime 服务保持运行。

加法迁移 `202610070003_welfare_post_requirement` 已执行，重复执行验证幂等性并写入迁移记录。核验时现有 6 个活动的新增条件均为关闭；没有创建测试帖子、报名或开奖等生产业务记录。企业微信配置没有变化。

## 验证证据

| 项目 | 结果与证据 |
| --- | --- |
| 后端逻辑 | 6 组、107 项通过：[backend-tests.log](../../artifacts/2026-10-07-welfare-post/backend-tests.log)；后端编译与服务器源码隔离构建通过 |
| 后台 | 类型检查、生产构建、真实 Vue 组件的模拟 API 保存流程通过：[admin-build.log](../../artifacts/2026-10-07-welfare-post/admin-build.log)、[browser-qa.log](../../artifacts/2026-10-07-welfare-post/browser-qa.log) |
| 小程序流程 | 47 项通过：[mini-tests.log](../../artifacts/2026-10-07-welfare-post/mini-tests.log) |
| 原生编译 | 干净快照全量编译无错误（176 条路由）；新增行样式修正后再次原生编译通过：[mini-release-compile.log](../../artifacts/2026-10-07-welfare-post/mini-release-compile.log)、[mini-correction-compile.json](../../artifacts/2026-10-07-welfare-post/mini-correction-compile.json) |
| 开发版上传 | CLI 退出码 0 并返回 `✔ upload`：[mini-upload-final.log](../../artifacts/2026-10-07-welfare-post/mini-upload-final.log)、[mini-upload-final-result.json](../../artifacts/2026-10-07-welfare-post/mini-upload-final-result.json) |
| 生产环境 | 真实数据库资格查询、公开活动和个人状态接口、鉴权、网站／后台资源、服务健康通过：[verification-live.json](../../artifacts/2026-10-07-welfare-post/verification-live.json)、[verification-after.json](../../artifacts/2026-10-07-welfare-post/verification-after.json) |
| 企业微信回调 | `/wechat/wecom/callback` 与 `/api/wechat/wecom/callback` 签名加密挑战通过，未签名请求被拒绝；配置保持不变 |
| 界面复核 | 首次独立复核发现新增文字对比度问题；局部修正后定向复核通过，说明／状态对比度 6.45／6.57：[界面记录](2026-10-07-welfare-post-ui.md) |

浏览器中的小程序预览是原生模板／样式适配图，不是真机截图。原始工作区静态扫描出现 19 条未注册备份模板 `pagesA/Grab/Grab 2.wxml` 的历史标签问题；上传快照排除这些非路由备份文件后，全量校验无错误。未宣称完成微信真机联调或正式版发布。

## 备份与交付物

服务器回滚备份：`/opt/lingmeng/releases/20261007-welfare-post-01/rollback`，保留修改前源码、运行文件、后台静态资源及生成的 Prisma Client。代码回滚可保留新增且默认关闭的数据列，无需删除生产数据。

本地保留 [部署结果](../../artifacts/2026-10-07-welfare-post/deployment-complete.json)、[发布清单](../../artifacts/2026-10-07-welfare-post/manifest.json)、[小程序上传快照清单](../../artifacts/2026-10-07-welfare-post/mini-upload-manifest.json)、最终代码快照、测试日志与界面截图。
