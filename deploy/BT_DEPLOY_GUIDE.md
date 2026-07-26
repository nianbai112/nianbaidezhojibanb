# 灵梦后台 v1.0.1 宝塔部署教程

## 1. 服务器需要安装什么

在宝塔面板安装：

- Nginx 1.22+，用于访问后台和代理后端 API。
- MySQL 8.0，创建业务数据库。
- Redis 6+，用于缓存、会话、实时连接状态等。
- Node.js 22.x，项目要求 Node `>=22`。
- PM2 管理器，宝塔软件商店里可以装，或命令行 `npm i -g pm2`。

服务器放行端口：

- `80` / `443`：网站访问。
- `3000`：后端本机端口，建议只给本机访问，不要公网裸露。

## 2. 推荐域名结构

强烈建议分成两个域名：

- `admin.example.com`：后台管理端。
- `api.example.com`：小程序和后台 API。

原因：后台是一个 Vue 单页应用，小程序 API 又有很多根路径接口。如果只用一个域名，很容易出现后台路由和 API 路由抢路径。

## 3. 上传部署包

把 `lingmeng-deploy-v1.0.1.zip` 上传到宝塔目录，例如：

```bash
/www/wwwroot/lingmeng-release-v1.0.1
```

解压后执行：

```bash
cd /www/wwwroot/lingmeng-release-v1.0.1
bash scripts/install.sh
```

默认会部署到：

```bash
/www/wwwroot/lingmeng
```

如果你想换目录：

```bash
APP_ROOT=/www/wwwroot/my-lingmeng bash scripts/install.sh
```

## 4. 配置数据库

宝塔面板进入「数据库」：

1. 新建数据库，例如 `lingmeng`。
2. 新建数据库用户，例如 `lingmeng_user`。
3. 复制数据库密码。

后端 `.env` 的 `DATABASE_URL` 格式：

```env
DATABASE_URL=mysql://数据库账号:数据库密码@127.0.0.1:3306/数据库名
```

例子：

```env
DATABASE_URL=mysql://lingmeng_user:你的密码@127.0.0.1:3306/lingmeng
```

## 5. 配置 Redis

如果宝塔 Redis 没有设置密码：

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
```

如果设置了密码，就填到 `REDIS_PASSWORD`。

## 6. 首次安装页面

后端 `.env` 首次部署保留：

```env
SETUP_WIZARD=true
SETUP_TOKEN=你自己设置的长口令
```

然后访问：

```text
https://admin.example.com/setup
```

安装页面会让你填写：

- `SETUP_TOKEN`：和 `.env` 里的 `SETUP_TOKEN` 一致。
- 超级管理员账号和密码。
- MySQL `DATABASE_URL`。
- Redis。
- 微信小程序 AppID / AppSecret。
- 腾讯云 COS、微信支付可以先留空，后面在系统配置里补。

如果页面提示需要迁移数据库，在宝塔终端执行：

```bash
cd /www/wwwroot/lingmeng/backend
npm run db:migrate:deploy
npm run db:generate
pm2 restart lingmeng-backend
```

然后回到 `/setup` 再点一次“执行初始化”。

初始化成功后，必须关闭安装模式：

```env
SETUP_WIZARD=false
```

重启后端：

```bash
pm2 restart lingmeng-backend --update-env
```

## 7. Nginx 配置

后台域名使用：

```text
deploy/nginx/admin-site.conf.sample
```

API 域名使用：

```text
deploy/nginx/api-site.conf.sample
```

在宝塔里创建两个网站后，把示例配置复制到对应网站的 Nginx 配置里，并把 `admin.example.com`、`api.example.com` 换成你的真实域名。

## 8. 上线检查命令

后端健康检查：

```bash
curl http://127.0.0.1:3000/healthz
```

PM2 状态：

```bash
pm2 status
pm2 logs lingmeng-backend --lines 80
```

数据库迁移：

```bash
cd /www/wwwroot/lingmeng/backend
npx prisma migrate status
```

## 9. 下一次增量更新怎么做

以后我给你的更新包只需要包含：

- `admin/dist`
- `backend/dist`
- `backend/prisma`
- `backend/package.json`
- `backend/package-lock.json`
- `scripts/update.sh`

上传更新包，解压后执行：

```bash
cd /www/wwwroot/lingmeng-update-v版本号
bash scripts/update.sh
```

脚本会保留服务器上的 `.env`、`uploads`、`storage`、`logs`，只更新代码、迁移和前端静态文件。

## 10. 腾讯云 COS 字段怎么填

- 存储桶名称 Bucket：填腾讯云 COS 控制台里的完整桶名，例如 `nianbai-1340278115`。
- 所属地域 Region：不是域名，填地域代码，例如重庆是 `ap-chongqing`，广州是 `ap-guangzhou`。
- CDN / COS 访问域名：可以先不填；如果没有独立 CDN，就填 COS 访问域名，例如 `https://nianbai-1340278115.cos.ap-chongqing.myqcloud.com`。
- 上传路径前缀：可以不填；如果想统一放到某个目录，填 `uploads/`。
