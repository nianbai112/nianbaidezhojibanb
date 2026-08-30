# Worker / Realtime 服务拆分

当前后端分为三个独立进程，共享现有数据库与 Redis：

| 服务 | 入口 | 默认端口 | 职责 |
| --- | --- | --- | --- |
| API | `backend/src/main.ts` | 3000 | HTTP API、管理后台接口、上传回调 |
| Worker | `backend/src/worker.ts` | 无 | 所有 `@Cron` / `@Interval` 后台任务、持久化打印任务消费 |
| Realtime | `backend/src/realtime.ts` | 3001 | 原生 `/ws-native` 与 Socket.IO `/ws` |

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
- Worker 和 Realtime 分别写入带 TTL 的 Redis 心跳键：
  - `lm:service:worker:heartbeat`
  - `lm:service:realtime:heartbeat`
- API 的 `GET /healthz/services` 聚合检查两个心跳；Realtime 的 `GET /healthz` 还会检查 WebSocket 挂载、推送订阅与控制订阅。
- 自动打印先持久化到 `print_jobs`，再由 Worker 抢占执行。Worker 中断时无法确认第三方结果的任务会标记为 `uncertain`，不会盲目重复出单。
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

## Nginx

小程序地址保持不变。必须把 WebSocket 路径转发到 Realtime 的 3001 端口：

```nginx
location /api/ws-native {
    proxy_pass http://127.0.0.1:3001/ws-native;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

普通 `/api/` 请求继续转发到 API 的 3000 端口。完整样例位于 `deploy/nginx/`。

## 发布顺序

1. 备份数据库和当前发布包。
2. 执行项目现有 release migration 流程。
3. 构建后端，确认 `dist/src/main.js`、`worker.js`、`realtime.js` 都存在。
4. 先启动 Realtime 和 Worker，再切换 Nginx WebSocket upstream。
5. 验证 API 健康、Realtime 健康、`/healthz/services`、真实 WebSocket 登录和消息推送。

当前是渐进式服务化：三个服务仍共享业务数据库。订单、支付、退款、库存和结算仍留在 API 内，避免过早引入分布式事务。
