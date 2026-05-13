# pojie 功能模块对照审计表

> 目标：把 `/Users/nianbaidediannao/Desktop/pojie` 当作功能蓝图，对照当前项目 `/Users/nianbaidediannao/Desktop/后端后台文件`，整理后台/后端/数据库/小程序读取链路的缺口。本文档用于后续分阶段开发和验收，不直接照搬 `pojie` 的 UI 或代码。

## 一、总判断

`pojie` 的价值不是“页面长得怎么样”，而是它把校园本地生活平台拆得很细：区域配置、页面装修、笔记配置、圈子配置、商城、商家、订单履约、玩法、系统运维都有独立的配置和数据表。当前项目已经搭起了大部分菜单和基础模块，但不少页面还处于“有入口、有页面、有局部接口，业务闭环不够完整”的状态。

当前后台的设计基准仍以 `admin/DESIGN.md` 为准：

- 不允许假 KPI、假排行榜、假趋势。
- 没有真实数据时展示 `0` 或 `暂无真实数据`。
- 图片字段必须优先用上传组件，不能只让运营者手填 URL。
- 配置页必须保存到后端，并能被小程序读取。
- 小程序源码默认不改，除非确实需要新增读取字段或入口。

## 二、当前项目已具备的中心

当前菜单来自：

- `admin/src/router/menus.ts`
- `admin/src/router/index.ts`

当前已经存在这些中心：

| 中心 | 当前菜单 | 初步判断 |
| --- | --- | --- |
| 运营工作台 | 数据总览、今日待办、区域运营、异常中心、快捷操作 | 入口齐，但必须继续清假数据和弱反馈 |
| 区域中心 | 区域列表、区域配置、页面装修、Tabbar 配置、分享配置、区域管理员 | 是重点，要继续向 `pojie` 的区域装修/区域列表靠近 |
| 用户中心 | 用户列表、学生认证、学校库、标签、徽章、黑名单 | 基础齐，学校库和学生认证要继续打磨 |
| 内容中心 | 帖子、评论、圈子话题、审核举报、敏感词、内容配置 | 目前最大重点，缺笔记配置/圈子配置的完整运营闭环 |
| 商家中心 | 商家、外卖商品、订单、退款、评价、结算、打印机、加价、采集、商家设置 | 入口齐，仍需按真实外卖业务细化 |
| 商城中心 | 商城概览、分类、商户、商品、订单、售后、评价、运费、分销、促销、客服 | 已补很多，但要继续验表、验接口、验小程序端 |
| 订单履约中心 | 统一订单、跑腿订单、骑手、调度、计费、异常 | 需要对照跑腿配置、地址、费用、骑手激励 |
| 财务中心 | 支付、退款、提现、流水、结算、对账 | 骑手结算已补，仍要查真实账务闭环 |
| 营销增长中心 | 优惠券、活动、团购、签到、分享、弹窗、榜单、通知 | 有入口，需补真实配置和小程序读取 |
| 扩展玩法中心 | 对象匹配、漂流瓶、网盘、打卡、评分、二手、爆照、社团 | 入口齐，但很多需要按 `pojie` 做深 |
| 数据分析中心 | 概览、用户、内容、订单、埋点、漏斗、关键词 | 要坚持真实聚合，不做装饰数据 |
| 推荐实验中心 | 推荐中心、策略、推荐池、A/B 测试 | 需要验证是否真实影响小程序 |
| AI 运营中心 | AI 面板、机器人、人设、任务、日志、配置、AI 运营配置 | 有雏形，需绑定真实 AI 执行链和日志 |
| 系统运维中心 | 管理员、角色、文件、系统配置、小程序路径、通知、微信日志、在线连接、日志、监控、上线检查、定时任务 | 重点查权限、微信、WebSocket、路径库 |

## 三、`pojie` 关键蓝图来源

| 来源路径 | 说明 | 当前项目应吸收的点 |
| --- | --- | --- |
| `/Users/nianbaidediannao/Desktop/pojie/routes/config/noteSettings.js` | 笔记配置最完整 | 内容限制、媒体限制、二维码过滤、审核、发布、权限、评论、匿名、AI、广告 |
| `/Users/nianbaidediannao/Desktop/pojie/routes/config/community.js` | 社群/圈子付费和区域配置 | 圈子创建、加入方式、付费加入、邀请码、人数、购买订单 |
| `/Users/nianbaidediannao/Desktop/pojie/routes/circle/*` | 圈子、话题、帖子、成员、申请、通知 | 内容中心的圈子管理要拆出配置、成员、话题、申请 |
| `/Users/nianbaidediannao/Desktop/pojie/routes/region/home-page-content.js` | 首页模块装修 | 轮播、公告、金刚区、菜单、横道图、缓存刷新 |
| `/Users/nianbaidediannao/Desktop/pojie/routes/region/tabs.js` | 首页 Tabs 读取 | 小程序首页 Tabs 应从区域配置读取 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/regionTabSql.js` | 底部导航表结构 | 图标、选中图标、颜色、角标、跳转、角色可见、排序 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/mallSql.js` | 商城完整表群 | 商品、SKU、订单、退款、评价、运费、客服、分销、促销 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/merchantsql.js` | 外卖商家表群 | 外卖分类、商品规格、属性、加料、打印机、商家评价、统计 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/orderSql.js` | 订单履约表群 | 指定地址、订单明细、支付、配送、日志、价格调整、骑手激励 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/users.js` | 用户运营表群 | 等级、经验、标签、自定义表单、签到、头像库、贴纸 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/tasksSql.js` | 任务/网盘资源表群 | 任务中心、网盘分类、资源、链接、评论、举报 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/datingSql.js` | 对象匹配 | 用户资料、套餐、订单、举报、缓存 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/checkInSql.js` | 打卡地图 | 地点、分类、记录、评论、愿望单 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/competitionsql.js` | 爆照评选 | 赛事、照片、投票、评分 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/rating.js` | 评分系统 | 评分对象、分类、回复、设置 |
| `/Users/nianbaidediannao/Desktop/pojie/mysql/shareSql.js` / `shareSettingsSql.js` | 分享配置 | 分享卡片、分享图片、朋友圈、奖励 |

## 四、模块对照总表

| 业务域 | `pojie` 能力 | 当前项目状态 | 缺口 | 优先级 | 建议落点 |
| --- | --- | --- | --- | --- | --- |
| 区域列表 | 区域卡片、Logo/封面上传、快速编辑、置顶套餐、搜索配置 | 有 `RegionList.vue`、`RegionConfigCenter.vue` | 新建区域流程不够像运营向导；创建后还要手动配置多个页签，太麻烦 | P0 | `admin/src/views/region/RegionList.vue`、`backend/src/modules/region` |
| 区域基础配置 | 基本信息、图片设置、管理员、位置、财务、显示开关 | 有区域配置中心 | 图片应统一上传/预览/删除/替换；保存后小程序实时读取要验 | P0 | `RegionConfigCenter.vue`、`upload`、`region.service.ts` |
| 页面装修 | 首页轮播、公告、金刚区、横道图、Tabs、榜单、消息页、我的页 | 有 `RegionPageDecoration.vue` | 横道图/首页导航/Tabs 要有真实上传、跳转、排序、启停、预览和小程序读取 | P0 | `RegionPageDecoration.vue`、`layout-config`、`region.service.ts` |
| 底部导航 | 图标/选中图标、颜色、角标、跳转、角色可见、排序 | 有 `RegionTabbarManager.vue` | 要补完整跳转、图标上传、角标、预览、发布检查 | P0 | `RegionTabbarManager.vue`、`RegionTabBar` model |
| 分享配置 | 分享标题、图片、朋友圈图、尾部文案 | 有分享配置 | 图片仍要统一上传；小程序分享页要验读取字段 | P1 | `RegionShareSettings.vue`、`share.service.ts` |
| 笔记配置 | 内容字数、标题、话题、媒体、二维码过滤、分享、广告、发布、编辑、评论、匿名、AI | 当前 `ContentSettings.vue` 有雏形 | 要补全字段归类、保存、发布规则、小程序读取、图片替代上传 | P0 | `ContentSettings.vue`、`admin.service.ts`、`operation.service.ts` |
| 圈子配置 | 默认圈子、允许创建、加入方式、付费、邀请码、成员数、话题头、默认布局 | 当前圈子管理有列表和部分配置 | 要拆成“圈子配置”和“圈子列表/成员/申请”，小程序加入圈子要真实闭环 | P0 | `ContentSettings.vue`、`CirclesPage.vue`、`circle.service.ts` |
| 帖子管理 | 列表、审核、置顶、推荐、下架、批量操作 | 有 `PostsManage.vue` | 要继续查统计是不是从真实接口来，批量动作是否真执行 | P1 | `post.service.ts`、`admin.service.ts` |
| 评论管理 | 评论审核、删除、抽奖、匿名、二维码过滤 | 有 `CommentsPage.vue` | 抽奖和二维码过滤需要联动配置 | P1 | `comment.service.ts`、`ContentSettings.vue` |
| 审核举报 | 内容举报、用户举报、风险内容、处理记录 | 有 `ContentAudit.vue` | 不能有假统计；处理动作要写日志 | P1 | `audit.service.ts`、`admin.service.ts` |
| 敏感词 | 分类、替换、批量导入、启停 | 有 `SensitiveWords.vue` | 要验小程序/后端发布链是否真的使用 | P2 | `content-ext` 或 `audit` |
| 用户学校库 | 学校列表、区域绑定、认证表单选择学校 | 有 `SchoolLibrary.vue` | 学校选择接口、小程序认证页要稳定；Logo/封面应上传 | P0 | `school` module、`StudentCertification` 小程序只读 |
| 用户标签/徽章/称号 | 标签、等级、徽章、称号、兑换码、头像库 | 有部分页面 | 头像库、贴纸库、称号兑换码可补 | P2 | `user-admin`、`marketing`、`system/files` |
| 商家外卖 | 商家、分类、商品、规格、属性、加料、打印机、评价、加价 | 当前商家中心菜单很全 | 继续验每个操作是否真实写库；缺属性/加料可后补 | P1 | `merchant` module |
| 商城 | 商品/SKU、订单、退款、评价、运费、促销、分销、客服 | 已补较多 | 客服会话/快捷回复/自动回复、分销层级和佣金链要继续补 | P1 | `mall` module |
| 订单履约 | 统一订单、跑腿、地址、价格调整、日志、骑手激励 | 有订单履约中心 | 跑腿配置和骑手激励要按表补完整 | P1 | `order-center`、`errand`、`delivery` |
| 财务 | 余额、提现、商家结算、骑手结算、对账 | 有财务中心 | 对账、支付回调、退款结果、结算状态必须全链路验 | P1 | `finance-admin`、`payment` |
| 营销 | 优惠券、活动、团购、签到、分享、弹窗、榜单 | 有菜单 | 每个营销配置要确认小程序入口读取，不只是后台保存 | P2 | `marketing-admin`、`coupon-admin`、`share` |
| 扩展玩法 | 打卡、评分、二手、爆照、对象、漂流瓶、网盘、社团 | 有入口 | 每块都要查是否存在真实表、真实接口、真实小程序入口 | P2 | `features/*`、各 backend modules |
| 数据分析 | 用户、内容、订单、GMV、漏斗、关键词、埋点 | 有分析页 | 只保留真实聚合；没有埋点就显示未接入，不做假图 | P2 | `analytics`、`tracking` |
| 推荐实验 | 策略、推荐池、A/B | 有入口 | 要验证是否真正影响首页/列表接口排序 | P3 | `recommend`、`ab-test` |
| AI 运营 | 机器人、人设、任务、日志、配置、AI 评论 | 有 AI 模块 | 要继续验模型配置、任务日志、失败重试、成本限制 | P2 | `ai-admin`、`bot`、`operation` |
| 系统运维 | 微信模板、公众号、WebSocket、文件、角色、路径、CI、日志、任务、监控 | 有多页 | 微信日志、在线连接、角色权限、小程序路径库仍要重点验 | P0 | `system/*`、`wechat`、`websocket`、`miniapp` |

## 五、P0 必须优先做实的事项

### 1. 内容中心：笔记配置 + 圈子配置

原因：这是用户小程序的核心内容体验，当前用户已经多次遇到“圈子后台有，前端不显示/不能加入”的问题。

必须做到：

- 后台可配置笔记发布规则：字数、标题、纯文字、图片/视频/音频、每日限制、发布间隔。
- 后台可配置审核规则：人工/AI/云审核、评论审核、举报开关。
- 后台可配置二维码过滤：笔记图片、评论图片、白名单用户、替代图片上传。
- 后台可配置广告：卡片流广告、瀑布流广告，支持图片上传或广告位 ID。
- 后台可配置圈子：允许用户创建、默认圈子、加入方式、付费加入、邀请码、成员上限、话题头。
- 后台圈子列表要支持上传图标/封面，不允许只填 URL。
- 小程序进入圈子、加入圈子、圈子列表读取同一套后端数据。
- 所有统计来自真实表，没有数据就显示 0。

参考源：

- `/Users/nianbaidediannao/Desktop/pojie/routes/config/noteSettings.js`
- `/Users/nianbaidediannao/Desktop/pojie/routes/config/community.js`
- `/Users/nianbaidediannao/Desktop/pojie/routes/circle/circles.js`
- `/Users/nianbaidediannao/Desktop/pojie/routes/circle/topics.js`
- `/Users/nianbaidediannao/Desktop/pojie/routes/circle/circleMembers.js`

当前落点：

- `admin/src/views/content/ContentSettings.vue`
- `admin/src/views/content/CirclesPage.vue`
- `backend/src/modules/admin/admin.service.ts`
- `backend/src/modules/circle/circle.service.ts`
- `backend/src/modules/operation/operation.service.ts`
- `backend/prisma/schema.prisma`

### 2. 区域中心：创建区域向导 + 页面装修

原因：现在创建区域后还要跑到区域配置、页面装修、Tabbar、分享配置等页面逐项设置，运营者很容易漏。应做成“新建区域向导”，创建区域时顺带完成基础装修。

必须做到：

- 新建区域时可以一次配置：区域名称、类型、Logo、封面、轮播图、管理员、地理位置、运营状态。
- 新建区域成功后自动生成默认：首页轮播、公告、金刚区、首页 Tabs、底部导航、分享卡片。
- 创建成功后跳转到区域详情/装修，不要让运营者自己找。
- 图片字段全部用上传组件，上传后可预览、替换、删除。
- 页面装修的横道图是广告核心，必须有：图片、标题、副标题、跳转方式、路径、参数、状态、排序。
- 首页 Tabs 必须有：名称、图标、封面、内容类型、跳转类型、路径/小程序 AppID、参数、启停、排序。
- 首页导航/金刚区必须有：图标、名称、副标题、跳转、排序、启停。
- 小程序首页读取的字段必须来自同一套接口。

参考源：

- `/Users/nianbaidediannao/Desktop/pojie/routes/region/home-page-content.js`
- `/Users/nianbaidediannao/Desktop/pojie/routes/region/tabs.js`
- `/Users/nianbaidediannao/Desktop/pojie/routes/config/regionCustomPages.js`
- `/Users/nianbaidediannao/Desktop/pojie/mysql/regionTabSql.js`

当前落点：

- `admin/src/views/region/RegionList.vue`
- `admin/src/views/region/RegionConfigCenter.vue`
- `admin/src/views/region/RegionPageDecoration.vue`
- `admin/src/views/region/RegionTabbarManager.vue`
- `backend/src/modules/region/region.service.ts`
- `backend/src/modules/layout-config/layout-config.service.ts`
- `backend/src/modules/upload/upload.service.ts`

### 3. 系统运维：小程序路径库、微信日志、在线连接、角色权限

原因：这些不是锦上添花，是后续配置页能不能“选路径、测推送、查权限”的基础设施。

必须做到：

- 小程序路径库要从 `/Users/nianbaidediannao/Desktop/前端文件/app.json` 和页面目录扫描，至少包含所有真实页面。
- 后台所有“跳转路径”字段优先从小程序路径库选择，也允许手动输入。
- 微信发送日志要能看到：模板、openid、区域、状态、错误原因、重试。
- 在线连接不是只看 socket id，要显示头像、昵称、openid、区域、最后活跃、是否真实在线。
- 官方消息会话要固定在消息页，用户可以点击进入官方会话，并能双向对话。
- 角色权限要覆盖新菜单和新接口，不然非超级管理员会 401。

参考源：

- `/Users/nianbaidediannao/Desktop/pojie/routes/config/wechatTemplate.js`
- `/Users/nianbaidediannao/Desktop/pojie/routes/config/weixin-ci.js`
- `/Users/nianbaidediannao/Desktop/pojie/routes/config/miniprogram-data.js`
- `/Users/nianbaidediannao/Desktop/pojie/public/admin/assets/miniapp-pages--7ffTTiM.js`

当前落点：

- `admin/src/views/system/MiniProgramPaths.vue`
- `admin/src/views/system/WechatLogsPage.vue`
- `admin/src/views/system/RealtimeSessionsPage.vue`
- `admin/src/views/system/RolesPage.vue`
- `backend/src/modules/miniapp`
- `backend/src/modules/wechat`
- `backend/src/modules/websocket`
- `backend/src/modules/setup/setup.service.ts`

## 六、P1-P3 路线

### P1：交易和履约闭环

目标：商家、商城、订单、退款、结算不再出现“页面有、动作弱、数据不完整”。

重点：

- 商家外卖商品补齐规格、属性、加料、分类、打印机、加价。
- 商城补齐客服会话、快捷回复、自动回复、分销层级、佣金记录。
- 订单中心必须有订单日志、支付日志、退款日志、配送日志。
- 财务必须能从真实订单聚合，不允许手写金额。

### P2：营销增长和扩展玩法

目标：所有玩法不是静态列表，而是有配置、有审核、有小程序入口、有数据回流。

重点：

- 签到/积分/任务/分享奖励统一成增长配置中心。
- 打卡地图、评分系统、二手、爆照、对象匹配、漂流瓶、网盘、社团逐个验接口。
- 每个玩法都要有区域开关，关闭后小程序不展示入口。

### P3：推荐实验和数据分析

目标：不是好看的图，而是真实运营判断。

重点：

- 推荐策略必须影响接口排序。
- A/B 测试必须有实验对象、流量比例、生效范围、结果指标。
- 埋点、漏斗、关键词必须有采集源，没有采集就显示未接入。

## 七、每个功能的验收标准

每新增或重构一个功能，必须按这个清单验：

1. 后台菜单是否有入口。
2. 前端页面是否没有假数据。
3. 所有图片字段是否支持上传、预览、替换、删除。
4. 表单保存是否写入后端。
5. 后端 controller 是否有明确路由。
6. 后端 service 是否真实读写数据库。
7. Prisma schema 是否有表或有明确 Config 存储策略。
8. 权限 seed 是否包含新菜单/新动作。
9. 小程序读取接口是否返回同一份配置。
10. 无数据时是否显示真实空状态。
11. 操作失败是否有明确中文错误。
12. `npm --workspace backend run build` 通过。
13. `npm --workspace admin run typecheck` 通过。
14. `npm --workspace admin run build` 通过。
15. 涉及后端逻辑时，相关测试通过或新增最小测试。

## 八、禁止继续出现的问题

- 不能再出现“后台有数据，小程序不显示”的断链。
- 不能再让运营者手填图片 URL 作为唯一方式。
- 不能再用假数字撑 KPI。
- 不能只做页面不做接口。
- 不能只做接口不接页面。
- 不能只保存后台配置，小程序却读另一套默认值。
- 不能所有区域只能选“全部区域”，多区域必须可选。
- 不能把长表单塞进小弹窗。
- 不能隐藏错误到 `console.error`。
- 不能为了 UI 改动去动小程序核心源码；小程序只在接口字段确实不够时做最小适配。

## 九、建议的下一步执行计划

### 第一步：做“内容中心 P0 完整闭环”

范围：

- 笔记配置
- 圈子配置
- 圈子列表/创建/编辑/加入规则
- 图片上传字段
- 小程序读取验证

输出：

- `内容中心功能契约.md`
- 后端接口和 schema 缺口清单
- 后台页面调整
- 小程序接口读取 smoke test

### 第二步：做“区域装修 P0 完整闭环”

范围：

- 区域新建向导
- 首页轮播/横道图
- 首页导航/金刚区
- 首页 Tabs
- 底部导航
- 分享卡片
- 小程序路径库选择

输出：

- `区域装修功能契约.md`
- 新建区域默认配置生成逻辑
- 图片上传/删除/替换统一组件
- 小程序首页读取 smoke test

### 第三步：做“系统运维 P0 稳定化”

范围：

- 小程序路径库全量扫描
- 微信发送日志
- WebSocket 在线连接和官方会话
- 角色权限补齐
- 操作日志

输出：

- `系统运维功能契约.md`
- 权限 seed 对照表
- 推送消息端到端测试脚本

## 十、给后续 AI 的执行要求

后续任何 AI 改代码前必须先读：

1. `admin/DESIGN.md`
2. `docs/pojie功能模块对照审计表.md`
3. 当前要做模块的后台页面
4. 当前要做模块的后端 controller/service
5. 小程序是否有对应读取页面和接口

它不能只回答“已完成”。必须说明：

- 改了哪些文件。
- 新增/修改了哪些接口。
- 数据存在哪里。
- 小程序从哪里读。
- 怎么测试。
- 哪些没做、为什么没做。

## 十一、`pojie` 可吸收模块明细

这一节是给后续开发排期用的。不是所有模块都要马上做，但不能再只看当前后台已有菜单。`pojie` 里这些模块说明了一个成熟校园平台应该有哪些运营抓手。

### A. 区域中心

| `pojie` 模块 | 作用 | 当前建议 |
| --- | --- | --- |
| region-list | 区域卡片列表、搜索、快捷编辑 | 当前区域列表要做成卡片+表格双视图 |
| region-edit | 新增/编辑区域长表单 | 改成新建区域向导，创建时顺带生成默认装修 |
| region-config | 区域基础配置 | 保留，但弱化成“详情配置”，不要承担全部装修 |
| home-page-content | 首页内容模块 | 页面装修的轮播、公告、横道图、金刚区都应对齐 |
| custom-pages | 自定义页面 | 后续可做区域富文本页、活动页、规则页 |
| region-rich-text | 区域富文本 | 可用于入驻说明、隐私说明、社区规则 |
| tabbar / tabbar-edit | 底部导航管理 | 继续补图标、选中图标、颜色、角标、跳转和预览 |
| share-settings | 分享卡片 | 保留在区域中心，必须图片上传 |
| user-guidance-settings | 新用户引导 | 可并入区域配置的“业务开关/新人引导” |

### B. 内容中心

| `pojie` 模块 | 作用 | 当前建议 |
| --- | --- | --- |
| note-settings | 笔记配置 | 拆成内容设置页核心模块，不要混在普通帖子列表里 |
| note-poster / poster-share | 笔记海报/分享图 | 可接到分享卡片和笔记分享设置 |
| circle-list | 圈子列表 | 当前圈子话题页要升级为圈子管理工作台 |
| circle types | 圈子类型 | 可做分类，帮助运营按学习/外卖/二手/活动分组 |
| topicHeaders / topics | 话题头和话题 | 首页 Tabs 和圈子内话题需要可控 |
| post-management | 帖子运营 | 帖子管理要有置顶、推荐、下架、审核、批量动作 |
| comment-list | 评论管理 | 评论审核和二维码过滤要接配置 |
| comment-lottery | 评论抽奖 | 可后续作为互动玩法，不急 |
| AnonymousIdentity | 匿名身份 | 匿名头像/昵称库应归入内容配置 |
| user_titles | 用户称号 | 可归入用户中心或营销增长 |

### C. 商家和商城

| `pojie` 模块 | 作用 | 当前建议 |
| --- | --- | --- |
| merchant-list / merchant-edit | 商家资料 | 商家中心保留，检查图片/地址/分类/营业状态 |
| merchant-settings | 区域商家配置 | 当前商家设置要能控制小程序商家入口 |
| printer-config | 打印机配置 | 商家中心已存在，继续验真实打印字段 |
| takeaway-orders | 外卖订单 | 订单类型必须和后端过滤一致 |
| mall products / categories | 商城商品和分类 | 已有，继续验 SKU、分类筛选和上下架 |
| mall refunds / reviews | 售后和评价 | 要补处理记录和用户可见状态 |
| mall service | 客服 | 后续补会话、快捷回复、自动回复 |
| distributor | 分销 | 需要分销等级、关系、佣金、提现链路 |
| mall promotions | 促销 | 要区分商城促销和外卖促销 |

### D. 订单履约和跑腿

| `pojie` 模块 | 作用 | 当前建议 |
| --- | --- | --- |
| errand config | 跑腿配置 | 当前计费规则要细化到重量、距离、时间段 |
| pickupPoint | 取件点 | 可用于校园驿站/宿舍楼点位 |
| itemSize | 物品规格 | 跑腿计费必须用 |
| feeAdjustment | 费用调整 | 订单异常/客服补价要用 |
| rider incentive | 骑手激励 | 当前骑手结算可继续接激励记录 |
| order logs | 订单日志 | 所有订单详情必须有时间线 |

### E. 用户和校园资料

| `pojie` 模块 | 作用 | 当前建议 |
| --- | --- | --- |
| user-list | 用户管理 | 当前用户列表要修空字段、NaN、头像昵称展示 |
| user-tag-management | 用户标签 | 当前已有，继续接批量打标 |
| user-level-management | 等级经验 | 可作为后续增长模块 |
| avatar-library | 头像库 | 系统运维或用户中心可补 |
| sticker-manage | 贴纸包 | 后续消息/评论可用 |
| signin-config | 签到配置 | 营销增长中心要接真实签到奖励 |
| contacts | 通讯录 | 如果校园通讯录要做，需要学生认证联动 |

### F. 扩展玩法

| `pojie` 模块 | 作用 | 当前建议 |
| --- | --- | --- |
| Punch-In/check-in | 打卡地图 | 需要地图 SDK、地点、分类、审核 |
| dating | 对象匹配 | 后续按资料、套餐、订单、举报做 |
| driftBottle | 漂流瓶 | 需要审核和举报 |
| resources/netdisk | 网盘资源 | 需要分类、资源、链接、下载记录、举报 |
| rating | 评分系统 | 需要评分对象、分类、回复、缓存 |
| explosivesel | 爆照评选 | 需要赛事、照片、投票、审核 |
| secondHand | 二手交易 | 需要商品、订单、举报、审核 |
| groupbuy | 团购 | 需要套餐、订单、支付、评价 |
| activity/clubs | 社团活动 | 需要报名、订单、奖励、社团审核 |

### G. 系统运维

| `pojie` 模块 | 作用 | 当前建议 |
| --- | --- | --- |
| wechatTemplate | 微信订阅模板 | 已做雏形，继续补字段映射和发送日志 |
| weixin-ci | 小程序上传发布 | 可做上线发布中心，不要混在普通配置 |
| miniprogram-data / miniapp-pages | 小程序页面和数据 | 当前小程序路径库要从这里吸收思路 |
| clearRedisCache / bull | 缓存和队列 | 系统运维可做缓存/队列面板 |
| websiteInfo / email / license | 站点、邮件、授权 | 后续系统配置可细化 |
| robotApi / regionRobotConfig | 机器人配置 | 可并入 AI 运营中心 |

## 十二、推荐新增或调整的菜单

不是立刻全部加菜单，而是未来精装修时的目标菜单结构。

| 当前中心 | 建议新增/调整 | 原因 |
| --- | --- | --- |
| 内容中心 | `笔记配置` 独立于 `内容配置` | 笔记配置字段太多，应该成为独立工作台 |
| 内容中心 | `圈子配置` 独立于 `圈子话题` | 圈子列表、加入规则、默认圈子、付费规则不是同一件事 |
| 内容中心 | `匿名身份库` | 支撑匿名笔记/评论 |
| 区域中心 | `新建区域向导` | 降低创建区域后的配置成本 |
| 区域中心 | `首页内容模块` | 轮播、公告、横道图、金刚区统一管理 |
| 区域中心 | `自定义页面/富文本` | 规则页、活动说明、入驻页可运营 |
| 系统运维中心 | `小程序发布` | 对齐 weixin-ci，未来支持预览/上传/版本 |
| 系统运维中心 | `缓存队列` | Redis/Bull/任务状态统一看 |
| 用户中心 | `头像库/贴纸库` | 头像、聊天贴纸、评论贴纸都需要素材库 |
| 营销增长中心 | `积分与任务` | 签到、任务、奖励、分享应聚合 |
