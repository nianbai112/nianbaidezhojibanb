# uniappx 账号与认证接口修复记录

本次修改本地源码，未部署生产。保留本工作区原有未提交改动，不新增依赖、不更改数据库 schema 或生产迁移。

## 修复内容

1. 学生认证新提交的 materialId 必须存在且归当前账号所有，MANUAL／ROSTER 分支统一校验；不再接受新增公开 photo_url/cardImage。历史读取与已通过身份幂等路径保持兼容，历史错误关联未批量清理。
2. 协议读取与确认共用 `src/common/agreement-consent.ts`：指定校区优先、全局兜底，忽略隐藏和未来预约文档。GET 对真实文档新增 content_hash；确认严格验证 ID、类型、版本、作用域及已传入的摘要。
3. 登录可增加 `agreement_consents`，必须是 TERMS_OF_SERVICE、PRIVACY_POLICY 各一份，带 document_id、version、content_hash，作用域与登录 region_id 一致。两份证明在 Serializable 事务中全部校验后写入，成功后才签发本次 token。冲突有限重试，不能吞掉保存错误。
4. 旧客户端／静默登录不传该字段仍可登录，但不再自动写固定 1.0.0 的同意记录。这是兼容策略，不表示所有登录都已取得最新协议同意。
5. 错误响应保留数字 code，另提供白名单格式的字符串 error_code，供客户端处理 AGREEMENT_UPDATED 等状态；保留微信日志脱敏。
6. 保存资料引导成功后清两种本人资料缓存；本人 `/auth/me` 和保存回包增加 selected_tags 与 selection_unresolved，支持重新进入引导后恢复标签。
7. 旧标签表只存名称／颜色，只有当前校区及全局启用定义中唯一匹配的项才返回 ID。歧义不猜测；不传 selected_tags 保留旧标签，显式 [] 才清空；同时选择多个同名定义会被拒绝，避免唯一键导致静默丢项。

## 兼容与发布顺序

- 先部署这些后端修复，再发布新的 uniappx 登录页。新前端要求 GET 返回正文摘要，不能只发布前端。
- 旧独立协议确认仍可提交真实 document_id＋version；缺 ID 或版本不再回填默认值。未带摘要的旧客户端无法检测同版本改正文，需升级。
- 旧学生认证客户端通过公开 URL 新提交会被拒绝，需使用私有上传及 materialId；历史公开文件不在本次自动迁移范围。
- 后台须发布真实且版本明确的用户协议、隐私政策。历史同意记录没有被改写；现有同意表不存历史正文快照，运营改正文仍需发布新版本。
- 仍未实现 App 微信开放平台／Apple 登录接口；这份补丁不表示 Android/iOS 已能完成真实登录。

## 验证和复现

后端相关回归：25 suites／256 tests 全部通过，涵盖协议、三种既有登录、用户资料、学生认证、控制器及异常过滤。命令在 backend 目录执行：

```bash
npm test -- --runInBand --testPathPattern='src/(common/agreement-consent|common/user-guidance-tags|filters/all-exceptions|modules/(auth|user|operation|student-identity)/)'
```

TypeScript 无输出检查已通过；本机 tsc 包装命令没有执行权限，使用 Node 调用现有脚本即可，无需更改依赖权限：

```bash
node ../node_modules/typescript/bin/tsc --noEmit --incremental false
```

真实数据库验证在仓库根目录执行：

```bash
node backend/scripts/test-uniappx-isolated.cjs
```

运行器需要 Node 22、已安装项目依赖，以及 PATH 可找到的 initdb、pg_ctl、createdb；本机已在 macOS／PostgreSQL 18.3 上运行通过。使用现有 PostgreSQL schema 的临时副本生成独立 Prisma Client，不修改共享 Client。

结果：学生认证 69 项检查通过，使用 1000 条合成学籍记录；协议／登录／资料链 14 组合同检查通过，包含真实 PostgreSQL 与实际 Nest 控制器的 HTTP 往返。

隔离边界：只建立全新临时集群、测试库和随机回环端口；不读取现有项目 `.env`，不启动 AppModule 的后台任务，不使用已有业务库或 Redis。测试完成清理本次临时目录和进程；停止失败保留目录，SIGKILL／断电不能保证自动清理。

微信通信、JWT／认证守卫、Redis、IPGeo 使用测试替身；此结果不验证真实微信换码、实际 JWT 守卫、Redis 集群或真机权限。运行器的网络／文件保护不是操作系统安全沙箱。尚未进行 MySQL 数据库集成验证或生产发布验证。

前端完整接续说明：`/Users/nianbaidediannao/Desktop/uniappx/docs/2026-09-28-batch3-handoff.md`。测试日志和源码备份放在该前端项目的 `output/`，隔离验证证据为明确标注的工具结果摘要。
