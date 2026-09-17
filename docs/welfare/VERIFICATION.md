# 校园福利抽奖 · 验证记录

日期：2026-09-17；运行环境：本机 Node 22 / Prisma 5.22，微信开发者工具模拟器，隔离 PostgreSQL 端口 55437。

## 已通过

- 后端 5 组测试共 **32 项**：8 项纯规则，14 项真实数据库事务/并发，4 项真实 Nest HTTP 权限守卫，6 项相关微信场景回归。
- 前端 **7 项**状态测试：双击只请求一次、最后一次机会的断网恢复、重试复用请求编号、隐藏页面后的过期响应、截止后查看报名凭证、倒计时归零、页面文件与路由齐全。
- 小程序模拟器 **7 条页面流程**：即时揭晓、中奖领取页、报名成功倒计时、我的参与、中奖与赠送公示、指定赠送结果、未中奖结果。使用拦截请求的隔离演示数据，无真实报名或发券；异常监听为 0。
- 小程序全工程 WXML / WXSS 编译均 exit code 0，检查 163 条页面路由、344 个 JS、272 个 JSON；新增页面未声明组件错误已修正，最终静态 errors 为 []。相对 require 629 处全部可解析。
- 管理后台 Vue TypeScript 检查通过；Vite 构建通过（保留原工程大包提示）。浏览器中检查列表、创建草稿、模式配置、指定赠送增行、关闭抽屉，采用隔离模拟接口。
- 后端 TypeScript 检查与完整构建通过。
- PostgreSQL / MySQL 两个 Prisma schema 验证通过，方言同步检查通过。
- 在单独的 `welfare_migration_qa` 数据库导入修改前 schema，再执行 PostgreSQL 本次增量 SQL，与当前 schema 比较结果 **No difference detected**。MySQL SQL 已生成、schema 验证通过，尚未在真实 MySQL 引擎上执行。

## 本地单场规模验证

在隔离 PostgreSQL 中准备 **10,000 名报名用户、1,000 份奖品**，调用真实统一开奖服务：产生 1,000 个不同中奖用户，10,000 条结果通知，事务完成约 **1.54 秒**。

这是本机单场开奖事务验证，不代表线上请求吞吐量，也不包含微信发送耗时。线上仍需按实际 CPU、数据库连接和网络时延验收；配置上限为单场 10,000 人。

## 未做及环境限制

- 未执行现有业务库升级，未创建真实活动，未发布服务器或小程序。
- 未验证真实微信模板发送、实际用户授权、实物交付、真机不同机型的触摸手感；这些需要开发版和实际配置。
- 旧的全项目 CLI 巡检工具 `validate-wechat-routes.cjs` 在本机通道执行失败，未作为通过依据。本次新增模块改用 `miniprogram-automator` 直接连接模拟器验证，结果如上。
- 原有优惠券前端用例的 mock 缺少 `delivery-time` 导致 4 项失败，在本次修改前已存在；本次没有改动这些业务用例。

## 重跑

在后端根目录，先启动独立测试 PostgreSQL（仅 127.0.0.1:55437，库名 welfare_qa），使用 PostgreSQL schema 创建空测试结构和生成对应 Prisma Client。不要把已有业务库的 DATABASE_URL 传给测试。

```sh
WELFARE_TEST_DATABASE_URL='postgresql://welfare_qa@127.0.0.1:55437/welfare_qa' node node_modules/jest/bin/jest.js --config backend/package.json --runInBand --testPathPattern='welfare|wechat.controller|wechat-template-contracts'
node node_modules/typescript/bin/tsc --project backend/tsconfig.json --noEmit --incremental false
npm run typecheck --workspace admin
npm run build --workspace admin
```

数据库用例有显式连接白名单，未设置 WELFARE_TEST_DATABASE_URL 时跳过，地址不匹配则拒绝运行。测试后按项目配置重新生成对应数据库的 Prisma Client。

在前端根目录：

```sh
node --test minitest/welfare-flow.test.cjs
node tools/check-frontend.cjs
node tools/check-requires.cjs
```

模拟器脚本：`tools/visual-qa/welfare-flow.cjs`，先通过 `start-automation.js` 建立连接。默认不在交互断言中截图；本机当前开发者工具在连续截图时出现过状态干扰，关闭截图后完整流程再次通过。需要图片时设置 `CAPTURE_SCREENSHOTS=1`，截图仅作视觉验收，交互回归以默认模式为准。测试结束恢复 wx 方法，删除仅用于测试的请求编号缓存。
