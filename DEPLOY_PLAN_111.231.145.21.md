# 部署方案：lingmeng v1.0.46（本地源码版）→ 服务器 111.231.145.21

> 状态：**仅方案，未执行**。用户确认后再开始。
> 目标服务器：OpenCloudOS 9.4 / 宝塔面板 / Node v22.20 / MySQL 3306 / Redis 6379
> 现有实例：`/www/wwwroot/lingmeng`（PM2 `lingmeng-backend` v1.0.25，已上线、有真实数据）

---

## 0. 前置认知（决定本方案）

1. **这是一次原地升级（v1.0.25 → v1.0.46），不是全新安装。**
   服务器上已是 `DB_IS_INSTALLED=1` 的活实例，`.env` 含真实 `DATABASE_URL`、JWT 密钥。
   → **`.env` 必须保留，绝不用 `deploy/env.backend.example` 覆盖**（那个模板是 `DB_IS_INSTALLED=0` 的首装向导，覆盖会重置系统）。
2. **原生模块必须在服务器构建。** 后端依赖 `bcrypt` / `sharp` / `@prisma/client` 引擎，在 macOS 本地编译的产物无法在 Linux x86_64 运行。
   → admin、site 是纯静态（可本地 build 后上传）；backend 必须上传源码后在服务器 `npm install` + `nest build`。
3. **数据库迁移有风险，必先全量备份。**
4. **portal `site/` 目录当前在服务器不存在**，nginx 根目录已指向 `site/dist`，部署后会一并补上。
5. **保留服务器自己的 `ecosystem.config.js`**（运行态是 cluster 模式），不要用本地 `deploy/ecosystem.config.cjs`（默认 fork 模式、APP_ROOT=/opt/lingmeng）覆盖。

---

## 1. 本地构建静态资源（Mac 上，安全）

```bash
# admin 后台（Vue + Vite，产物纯静态，跨平台）
cd /Users/nianbaidediannao/Desktop/后端后台本地测试版/admin
npm install
npm run build          # → admin/dist

# 门户站点（同理）
cd /Users/nianbaidediannao/Desktop/后端后台本地测试版/site
npm install
npm run build          # → site/dist
```
> backend **不**在本地构建，见阶段 3。

---

## 2. 上传到服务器（保留 .env / node_modules / uploads / storage / logs）

用 rsync（排除敏感/可重建目录）。`SSH` 用 root + 密码（或先配好 ssh key）。

```bash
SSH="sshpass -p '<服务器密码>' ssh -o StrictHostKeyChecking=no root@111.231.145.21"
SRC="/Users/nianbaidediannao/Desktop/后端后台本地测试版"
DST="root@111.231.145.21:/www/wwwroot/lingmeng"

# 1) 后端源码（不含 node_modules/.env/dist/uploads/storage/logs）
rsync -az --delete \
  --exclude='.env' --exclude='node_modules' --exclude='dist' \
  --exclude='uploads' --exclude='storage' --exclude='logs' \
  "$SRC/backend/" "$DST/backend/"

# 2) 静态资源
rsync -az --delete "$SRC/admin/dist/" "$DST/admin/dist/"
mkdir -p /www/wwwroot/lingmeng/site/dist   # 服务器端先建目录
rsync -az --delete "$SRC/site/dist/" "$DST/site/dist/"
```
> 注意：不要 rsync 顶层 `ecosystem.config.cjs` 去覆盖服务器的 `ecosystem.config.js`。
> 服务器 `.env` 和 `backend/.env` 保持不动。

---

## 3. 服务器端：构建后端 + 备份 + 迁移

登录服务器后执行：

```bash
cd /www/wwwroot/lingmeng

# 3.1 数据库全量备份（凭据从 backend/.env 的 DATABASE_URL 取）
DBURL=$(grep '^DATABASE_URL=' backend/.env | tail -1 | cut -d= -f2- | tr -d '"')
# DATABASE_URL 形如 mysql://user:pass@127.0.0.1:3306/lingmeng
mkdir -p backups
eval "$(echo "$DBURL" | sed -E 's#mysql://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+)#DB_USER=\1; DB_PASS=\2; DB_HOST=\3; DB_PORT=\4; DB_NAME=\5#')"
mysqldump -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" --single-transaction --routines --events "$DB_NAME" \
  > "backups/db-before-1.0.46-$(date +%Y%m%d-%H%M%S).sql"

# 3.2 文件备份
tar -czf "backups/files-before-1.0.46-$(date +%Y%m%d-%H%M%S).tar.gz" \
  --exclude='backend/node_modules' --exclude='backend/uploads' \
  --exclude='backend/storage' --exclude='backend/logs' --exclude='backups' \
  backend admin site ecosystem.config.js

# 3.3 安装依赖并构建（用国内镜像，复用离线包优先）
cd backend
npm config set registry https://registry.npmmirror.com
# 若 deps/ 下有 backend-node_modules-linux-x64-node22.tar.gz 可优先解压复用
npm install --omit=dev --no-audit --no-fund
node -e "require('bcrypt')" 2>/dev/null || npm rebuild bcrypt --no-audit --no-fund
npm run build            # → dist/src/main.js

# 3.4 Prisma
[ "$DB_PROVIDER" = "postgresql" ] && cp prisma/schema.postgresql.prisma prisma/schema.prisma \
  || cp prisma/schema.mysql.prisma prisma/schema.prisma
npx prisma generate

# 3.5 迁移（★ 安全优先）
# 优先用迁移目录（不丢数据）：
npx prisma migrate deploy
# 若本地没有 prisma/migrations 目录，才退化为：
# npx prisma db push     # 强制同步，可能删字段，仅在确认无重要结构删除时使用
```

---

## 4. 重启与验证

```bash
cd /www/wwwroot/lingmeng
pm2 startOrReload ecosystem.config.js --env production
pm2 save

# 健康检查
curl -fsS http://127.0.0.1:3000/healthz && echo " backend OK"
# 业务验证
curl -sI https://1.886xz.com/admin/ | head -1
curl -sI https://1.886xz.com/api/   | head -1
```

---

## 5. 回滚方案

```bash
# 文件回滚
tar -xzf backups/files-before-1.0.46-<时间戳>.tar.gz -C /www/wwwroot/lingmeng
# 数据库回滚
mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < backups/db-before-1.0.46-<时间戳>.sql
pm2 restart lingmeng-backend
```

---

## 6. 风险清单 / 检查项

- [ ] 执行前已人工确认**不会覆盖**服务器 `.env`
- [ ] 已做 `mysqldump` 全量备份 + 文件 tar 备份
- [ ] 后端在**服务器**完成 `npm install` + `nest build`（未用 macOS 产物）
- [ ] 迁移使用 `migrate deploy`（非 `db push` 强制同步），除非确认无结构删除
- [ ] 升级期间 API 有短暂中断（建议维护窗口，约数分钟）
- [ ] 升级后核对 `APP_VERSION` 是否变为 1.0.46，并观察 PM2 日志有无报错
- [ ] portal `site/dist` 已就位（此前缺失，nginx 根目录已配好）

---

## 7. 备注

- 服务器当前 `lingmeng-backend` 运行 55 天、v1.0.25；本地 v1.0.46-selfhosted.1 为较新源码版。
- 现有部署是「客户混淆包」(obfuscateJs)，换成源码版不影响运行，仅代码可读性变化。
- 若改选「独立测试实例」：把 `DST` 换成 `/www/wwwroot/lingmeng-test`，PM2 改名（如 `lingmeng-test-backend`），nginx 新建站点/子域名并反代到新端口即可，其余步骤一致。
