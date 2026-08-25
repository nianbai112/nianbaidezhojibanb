# 无授权自部署设计

## 目标

把当前本地工作区整理为只依赖自有服务器的部署版本。运行时不注册、不编译、不打包授权中心、授权码、模块许可或服务商远程更新逻辑；部署包可直接安装到 Ubuntu 24.04 x86_64，并通过本机 MySQL、Redis、Nginx、PM2 运行。

## 发布边界

- 当前本地工作区是唯一事实源，旧 `lingmeng-baota-1.0.44.zip` 不再使用。
- 保留登录鉴权、角色权限、区域数据权限和业务权限；只删除商业授权中心逻辑。
- 不上传 `.env`、token、密钥、日志、运行数据、`node_modules`、Git 元数据或 iCloud `dataless` 文件。
- 不覆盖用户现有业务改动，不删除本地 `.decorver-token`，但把它加入忽略和打包禁入规则。
- 当前版本统一提升为 `1.0.45-selfhosted.1`，与旧 1.0.44 授权包明确区分。

## 运行架构

- Nginx 只公开 80/443，提供官网、`/admin/` 后台、`/api/` 反代、`/uploads/` 和 WebSocket。
- NestJS 由 PM2 单实例启动，只监听服务器本机 3000。
- MySQL 8.0 与 Redis 7 只监听本机，不向公网开放。
- 首次启动使用 `SETUP_WIZARD=true`，安装器生成强随机 `SETUP_TOKEN`、JWT 密钥、数据库密码和 Redis 密码；完成初始化后切换完整生产校验。
- 宝塔、Docker、PostgreSQL、PHP 和授权中心均不是依赖。

## 代码清理

- 从 `AppModule` 保持移除 `LicenseRuntimeModule`。
- 删除 `backend/src/modules/license-runtime`、授权专用后台页面、路由入口、Guard 例外和环境变量。
- 合同快照不再包含未注册的授权控制器。
- 安装与打包脚本不得出现 `LICENSING_ENABLED`、`LICENSE_KEY`、`protectedModules` 或授权中心默认配置。

## 部署包

生成 `lingmeng-selfhosted-1.0.45-selfhosted.1.zip`，包含：

- 后端编译产物、Prisma schema/迁移、运行脚本、生产依赖清单；
- 后台与官网静态构建产物；
- 自部署安装器、PM2 配置、Nginx 模板、环境变量模板和版本清单；
- 带文件 SHA-256 的 manifest。

生成器必须先检查构建产物、版本一致性、授权残留、敏感文件名、真实 `.env`、符号链接和 `dataless` 文件，任一不满足即失败。

## 错误处理与回滚

- 安装器在缺少 Node 22、npm、PM2、MySQL 客户端、Redis 客户端或 Nginx 时明确退出。
- 文件替换前保留服务器旧目录备份；数据库只执行当前项目的正式迁移器。
- Nginx 必须先 `nginx -t`，PM2 启动后必须通过本机 `/healthz` 或 `/setup/status`。
- 任何验证失败均停止，不继续开放公网或切换站点。

## 验收

- 后端 TypeScript、后台类型检查、后台/官网/后端构建通过。
- 数据库迁移自检和相关测试通过。
- ZIP 解压测试、manifest 哈希复算、敏感文件扫描、授权残留扫描通过。
- 新服务器实际只有 22、80、443 和受限管理端口对外；3000、3306、6379 不公开。
- 通过公网完成安装向导、后台登录、认证接口、`/healthz`、静态资源与 WebSocket 基础检查。
