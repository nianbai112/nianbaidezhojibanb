# 发帖参与条件：界面实现与验证证据

日期：2026-10-07。范围：既有后台活动编辑抽屉与小程序福利抽奖页面内新增“发一篇帖子”条件。本记录描述已完成的局部扩展及验证范围，不据此判断正式环境部署状态。

## 继承关系与局部样式

遵循 [surface-brief.md](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/surface-brief.md) 的 Operate 方向：继承现有界面，在原参与条件中增加一个选项、规则说明和状态入口。

后台沿用 [WelfareDraws.vue](/Users/nianbaidediannao/Desktop/后端后台本地测试版/admin/src/views/marketing/WelfareDraws.vue) 的 Element Plus 抽屉、复选框、表单和保存操作。抽屉保持 `min(1100px, 96vw)`；表单延续两列、22px 列间距，900px 及以下改为单列。正文和控件沿用既有 14px 字号与系统中文无衬线字体，新增说明复用原有 12px 辅助文字、`--mx-sub` 颜色和 1.8 行高。白色工作面、轻边界与蓝色选中态保持既有后台语义。

小程序沿用 [detail.wxml](/Users/nianbaidediannao/Desktop/前端文件/pagesWelfare/detail.wxml)、[detail.wxss](/Users/nianbaidediannao/Desktop/前端文件/pagesWelfare/detail.wxss) 和 [shared.wxss](/Users/nianbaidediannao/Desktop/前端文件/pagesWelfare/shared.wxss) 的条件列表、说明与胶囊状态。条件标题为 26rpx，说明为 22rpx、1.6 行高，状态为 23rpx；说明列允许收缩换行，状态保持单行。原有暖色页面背景、白色圆角卡片、浅蓝条件标记和黄色主操作延续既有实现。

唯一新增色彩覆盖限定于发帖行：说明文字 `#56624f`，状态文字 `#9e3f27`。这是新行的可读性修正，不是全局令牌或其他条件行的样式更新。本次未创建或修改 `PRODUCT.md`、`DESIGN.md`、`.impeccable` 设计系统文件，也未修改全局设计。

## 信息与交互规则

- 新建活动时发帖条件默认关闭。开启后立即显示时间、校区、审核、可见性和开奖复核规则；活动发布后随其他参与条件一起锁定。
- 合格帖子须在活动发布后发布，属于本活动校区，审核通过且仍可见。全平台活动接受任意校区的帖子，活动发布前的帖子不计入。
- 报名时核验，开奖前再次核验。删除或下架某篇帖子后，只要仍有其他合格帖子即可保留资格；复核时没有任何合格帖子才取消资格。
- 成功页与等待开奖页在启用本条件时提醒保留合格帖子，见 [success.wxml](/Users/nianbaidediannao/Desktop/前端文件/pagesWelfare/success.wxml) 和 [result.wxml](/Users/nianbaidediannao/Desktop/前端文件/pagesWelfare/result.wxml)。

状态由服务端资格结果驱动，见 [detail.js](/Users/nianbaidediannao/Desktop/前端文件/pagesWelfare/detail.js)。返回活动页会重新读取活动和资格状态。明确未完成且没有待审核帖时，发帖行也支持活动开始前提前完成、报名后开奖前补发；该入口按实际资格状态判断。

| 状态 | 发帖行文案与动作 | 报名处理 |
| --- | --- | --- |
| 明确未完成且无待审核帖 | “去发帖 ›”，进入既有发帖页 | 主操作引导发帖 |
| 审核中 | “审核中 · 刷新 ›”，重新核验 | 引导刷新，不重复引导发帖 |
| 已完成 | “已完成 · 核验 ›”，允许再次核验 | 其他条件满足时可继续报名 |
| 返回值未知或读取失败 | “点击重新核验” | 不判定达标，提供重新核验入口 |
| 未登录／正在读取 | “登录后核验”／“正在核验…” | 延续登录及读取流程，不提前宣告达标 |

## 证据与验证边界

| 证据 | 已确认内容 | 边界 |
| --- | --- | --- |
| [admin-desktop.png](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/admin-desktop.png)、[admin-mobile.png](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/admin-mobile.png)、[browser-qa.log](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/browser-qa.log) | 真实后台 Vue 组件在模拟 API 下：默认关闭、开关说明联动、保存草稿提交 `requirePost: true`；1440×1000 与 390×844 下新增说明可读，窄屏未越出视口 | 保存验证使用模拟 API，不代表真实服务端联调或线上活动发布验证 |
| [mini-missing.png](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/mini-missing.png)、[mini-pending.png](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/mini-pending.png)、[mini-complete.png](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/mini-complete.png) | 未完成、审核中、已完成三种状态的新增条件行；说明随状态入口宽度换行 | 原生 WXML/WXSS 的浏览器适配预览，包含预览专用容器与状态选择器，不是微信原生运行截图或真机图；不能据此证明真实跳转和网络流程 |
| [contrast-verification.log](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/contrast-verification.log) | 修正后新增行说明、状态文字在白色卡片上的对比度分别为 6.45:1、6.57:1；三张状态图已刷新 | 只复核新增发帖行的文字对比度，不扩大为全页面无障碍审计 |
| [admin-typecheck.log](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/admin-typecheck.log)、[admin-build.log](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/admin-build.log) | 实现阶段后台类型检查与生产构建通过 | 构建仍提示既有大体积 chunk，不将其记为构建失败，也未在本局部任务中处理 |
| [backend-tests.log](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/backend-tests.log)、[mini-tests.log](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/mini-tests.log) | 后端相关 6 组、107 项测试通过；小程序页面流程 47 项测试通过 | 自动化逻辑验证，与浏览器视觉预览、原生编译和真机验证分别计证 |
| [mini-release-compile.log](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/mini-release-compile.log)、[mini-correction-compile.json](/Users/nianbaidediannao/Desktop/后端后台本地测试版/artifacts/2026-10-07-welfare-post/mini-correction-compile.json) | 原生干净代码快照全量编译无错误：176 条路由，WXML 281 文件、WXSS 283 文件；最终局部颜色纠正后相关模板与样式再次原生编译通过 | 证明编译器接受源代码，不代表微信真机的渲染、点击或服务端联调完成 |

## 完成评审与未固化项

独立完成评审首次要求修复一项：新增条件行文字对比度。实现已通过限定于发帖行的颜色覆盖完成修正；随后仅针对该问题进行对比度复核并更新三状态截图。最终记录为 **Verdict: Pass**，该问题 **resolved**，**remaining: clear**，**disposition: ship**。这一结论包含首次独立评审与问题定向复核，不表示进行了第二次全量独立审查。

本次只记录局部扩展的继承关系与实际行为。既有字形标记、其他条件行的颜色和历史设计漂移未升级为全局规则，也未顺带修复；本次未开展全站设计漂移审计。文档记录未替代微信真机验证。
