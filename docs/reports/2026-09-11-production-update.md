# 2026-09-11 后端与管理后台生产更新

目标服务器：`106.55.40.33`，应用目录：`/opt/lingmeng`。本次按用户确认的 A 方案完成原环境保留升级：允许短暂停机，保留数据库、用户数据、上传文件、存储和日志；未执行数据库迁移。

## 发布结果

- 后端、Worker、Realtime 和 Vue 管理后台已更新。
- 发布批次：`20260911-2334`。
- 发布文件：2,884 个；逐项 SHA-256 校验通过。
- 本地构建：后端 Nest 构建与 TypeScript 编译通过；后台生产构建和类型检查通过。
- 后端测试：148 个套件通过、1 个原有套件跳过；1,494 项通过、8 项跳过。
- 数据库台账：26 项迁移全部 `APPLIED`，0 项待执行；Schema 与生产结构检查通过。
- 切换窗口：约 12 秒；失败自动回退脚本已随发布目录保留。

## 线上验收

- API、Worker、Realtime PM2 状态均为 `online`，健康端点返回 `status=ok`，三个服务均为 `up` 且 Worker/Realtime ready。
- `https://yuntingzhe.cn/api/healthz/services`：HTTP 200。
- `https://yuntingzhe.cn/api/regions`：HTTP 200。
- `https://yuntingzhe.cn/admin/`：HTTP 200，返回新后台入口 HTML。
- `https://yuntingzhe.cn/api/platform/app-capabilities`：HTTP 200，配置与发布前一致。
- 生产 `.env`、PM2 配置和 Nginx 配置哈希保持不变。
- 发布后错误日志文件大小与切换前一致；没有新增启动错误。
- `/opt/lingmeng/backend/uploads`、`storage` 和 `/opt/lingmeng/logs` 均保留。

## 备份与回退

备份目录：`/opt/lingmeng/backups/20260911-2334/`。

- `application.tar.gz`：切换前应用和运行依赖备份。
- `database.sql.gz`：切换前 MySQL 备份，gzip 校验通过。
- `previous-runtime/`：切换前运行文件，供代码回退。
- `backend.env`、`ecosystem.config.cjs`、`nginx.conf`：配置备份。

发布目录：`/opt/lingmeng/releases/20260911-2334/`，包含发布包、清单、预检查、切换和线上验收记录。

本次没有改动小程序客户端，也没有执行真实支付、退款、发券或订单写入。

⚠️ 用户在聊天中直接提供了 root 密码。部署完成后应立即在服务器上更换 root 密码，并优先改用 SSH 密钥、禁用 root 密码登录。
