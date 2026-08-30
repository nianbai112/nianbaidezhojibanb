# Worker / Realtime 服务拆分

当前后端分为三个独立进程，共享现有数据库与 Redis：

| 服务     | 入口                      | 默认端口 | 职责                                                          |
| -------- | ------------------------- | -------- | ------------------------------------------------------------- |
| API      | `backend/src/main.ts`     | 3000     | HTTP API、管理后台接口、上传回调                              |
| Worker   | `backend/src/worker.ts`   | 无       | 所有 `@Cron` / `@Interval` 后台任务、持久化打印与通知任务消费 |
| Realtime | `backend/src/realtime.ts` | 3001     | 原生 `/ws-native` 与 Socket.IO `/ws`，支持多实例广播          |

## 本地启动

分别打开三个终端：

```bash
npm run dev:backend
npm run dev:worker
npm run dev:realtime
```

Worker 在 `DB_IS_INSTALLED=1` 且 `SETUP_WIZARD=false` 后才执行任务。安装向导阶段会保持空闲，防止访问尚未初始化的数据库。

使用 Docker Compose 时，如果 `.env` 中的密码包含 `$`，请使用单引号包裹整个值，避免 Compose 将其误当成环境变量插值。

## 进程通信

- API 和 Worker 不持有客户端连接。
- 面向用户、区域、群组和全站的实时推送写入 Redis `lm:ws:native:push`。
- Realtime 订阅该通道并投递到本机连接。
- 账号禁用/注销通过 `lm:ws:realtime:control` 通知 Realtime，同时断开原生 WebSocket 和兼容 Socket.IO 连接。
- Socket.IO 使用 `@socket.io/redis-adapter` 和 Redis 前缀 `lm:socket.io`。多个 Realtime 实例可以共享房间广播、远程断连和服务端事件；客户端固定使用 WebSocket transport。
- Worker 和 Realtime 把每个进程的心跳写入 Redis Hash，同时保留旧的单心跳键供滚动升级期兼容。
- API 的 `GET /healthz/services` 会检查所有已注册实例；任一实例超过 45 秒未更新即返回降级。正常停机会立即移除实例，崩溃实例保留 5 分钟供故障检测后再清理。Realtime 的 `GET /healthz` 还会检查原生 WebSocket 挂载、推送订阅、控制订阅，以及 Socket.IO Redis Adapter 是否已应用且发布/订阅客户端均为 `ready`。
- 自动打印先持久化到 `print_jobs`，再由 Worker 抢占执行。Worker 中断时无法确认第三方结果的任务会标记为 `uncertain`，不会盲目重复出单。
- 邮件、短信和微信订阅消息先写入 `notifications`，状态为 `pending`，再由 Worker 原子抢占并投递。失败状态为 `partial`，由 Worker 延迟重试；API 请求不再同步等待第三方通知服务。
- 长时间 Cron 使用可续租 Redis 锁；Worker 崩溃后租约仍会按 TTL 自动释放。

## PM2

`deploy/ecosystem.config.cjs` 会启动：

```text
lingmeng-backend
lingmeng-worker
lingmeng-realtime
```

检查状态：

```bash
pm2 status
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3000/healthz/services
```

安装向导完成后会一次重载 `lingmeng-worker`、`lingmeng-realtime`、`lingmeng-backend`。手动操作时使用：

```bash
pm2 restart lingmeng-worker lingmeng-realtime lingmeng-backend --update-env
```

默认只启动一个 Realtime。单机需要增加 Realtime 进程时，在 `backend/.env` 设置 `REALTIME_INSTANCES=2`，再执行安装/更新脚本。PM2 会仅对 Realtime 使用 cluster 模式，Worker 仍保持单实例。

Docker Compose 执行 `docker compose up -d` 时会先运行一次 migration，只有迁移成功后 API、Worker 和 Realtime 才会启动。

## Nginx

小程序地址保持不变。必须把 WebSocket 路径转发到 Realtime 的 3001 端口：

```nginx
location /api/ws-native {
    proxy_pass http://127.0.0.1:3001/ws-native;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location /socket.io/ {
    proxy_pass http://127.0.0.1:3001/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

普通 `/api/` 请求继续转发到 API 的 3000 端口。完整样例位于 `deploy/nginx/`。如部署多个 Realtime 实例，可把两个 WebSocket location 的 upstream 改为 Realtime 实例组；当前 Socket.IO 客户端只启用 WebSocket transport，不依赖轮询粘性会话。

## 发布顺序

1. 备份数据库和当前发布包。
2. 执行项目现有 release migration 流程。
3. 构建后端，确认 `dist/src/main.js`、`worker.js`、`realtime.js` 都存在。
4. 先启动 Realtime 和 Worker，再切换 Nginx WebSocket upstream。
5. 验证 API 健康、Realtime 健康、`/healthz/services`、真实 WebSocket 登录和消息推送。

当前是渐进式服务化：三个服务仍共享业务数据库。订单、支付、退款、库存和结算仍留在 API 内，避免过早引入分布式事务。
