# uni-app x 第七批：区域运营接口与合伙申请

2026-09-29，本地代码验证，未部署生产，无 schema 变更。完整前后端交接：[第七批记录](/Users/nianbaidediannao/Desktop/uniappx/docs/2026-09-29-batch7-handoff.md)。

变更：

- `RegionController/RegionService` 新增用户侧私有 management GET。内容 CRUD 在 Serializable 事务内校验服务端用户状态、真实 UserRole 与校区范围；URL 的区域 ID 不可被请求体覆盖；更新/删除校验记录归属。AdminAccount 保持独立后台权限链。
- `region-management.helpers.ts` 将移动端 category/type/target/icon 转为旧表 type/link/image，并白名单保存。公开内容读取保持原格式。
- `OperationService` 公开富文本列表限定校区+全局，未选仅全局；列表/详情/类型映射过滤未展示与未来发布；自定义页校验 display_scope，稳定分页。继续允许已发布文章按 ID 跨校公开分享。
- `UserService.submitCityAgentApplication` 锁账号行，在事务内重查状态、负责人资格与最新申请；不覆盖 approved，序列化冲突/条件更新冲突返回 409。真实并发证明确保同用户首次双端提交不产生多条申请，审核竞态不能回写为 pending。

验证：8 suites / 87 项后端相关测试及全项目 TypeScript 通过；隔离 PostgreSQL/Nest HTTP 内容 9 组、管理与申请 7 组通过。所有数据库/HTTP仅本轮临时 loopback；JWT actor 使用替身注入，业务权限由真实数据库判定。未测试生产、真实网关/JWT签发、MySQL并发、真实运营账号。

复现：`node backend/scripts/test-region-content-isolated.cjs`、`node backend/scripts/test-region-management-isolated.cjs`。后者新建临时库，禁止加载实际 .env，清理自身集群/client。日志在桌面 uniappx 的 `output/batch7-*.log`。

上线需配套发布前后端，验收管理权限撤销、跨区攻击、申请并发与管理员审核；不需要运行数据库迁移。原有本地修改未覆盖，没有提交/推送/部署。
