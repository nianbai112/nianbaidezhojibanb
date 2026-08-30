#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
require("./checkNodeVersion");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const adminDir = path.join(rootDir, "admin");
const rootEnvPath = path.join(rootDir, ".env");
const backendEnvPath = path.join(backendDir, ".env");
const deployEnvExamplePath = path.join(
  rootDir,
  "deploy",
  "env.backend.example",
);
const backendEnvExamplePath = path.join(backendDir, ".env.example");

const pm2Name = process.env.PM2_NAME || "lingmeng-backend";
const pm2WorkerName = process.env.PM2_WORKER_NAME || "lingmeng-worker";
const pm2RealtimeName = process.env.PM2_REALTIME_NAME || "lingmeng-realtime";
const skipInstall = isEnabled(process.env.SKIP_INSTALL);
const skipBuild = isEnabled(process.env.SKIP_BUILD);
const skipMigrate = isEnabled(process.env.SKIP_MIGRATE);
const skipPm2 = isEnabled(process.env.SKIP_PM2);
const skipHealth = isEnabled(process.env.SKIP_HEALTH);

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function log(message = "") {
  console.log(message);
}

function section(title) {
  log(`\n== ${title} ==`);
}

function fail(message) {
  console.error(`\n[失败] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  log(`> ${printable}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    env: { ...process.env, ...(options.env || {}) },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    fail(`${printable} 执行失败：${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${printable} 退出码 ${result.status}`);
  }
}

function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.stdio || "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function commandExists(command) {
  if (process.platform === "win32") {
    return tryRun("where", [command]);
  }
  return tryRun("sh", ["-lc", `command -v ${JSON.stringify(command)}`]);
}

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function buildDatabaseUrl(env) {
  if (hasValue(env.DATABASE_URL)) return String(env.DATABASE_URL).trim();

  const provider = String(env.DB_PROVIDER || "mysql")
    .trim()
    .toLowerCase();
  const host = String(env.DB_HOST || "").trim();
  const user = String(env.DB_USER || "").trim();
  const password = String(env.DB_PASSWORD || "").trim();
  const database = String(env.DB_NAME || "").trim();
  if (!host || !user || !database) return "";

  const port = String(
    env.DB_PORT ||
      (provider === "postgresql" || provider === "postgres" ? "5432" : "3306"),
  ).trim();
  const schema = String(env.DB_SCHEMA || "public").trim();
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);

  if (provider === "postgresql" || provider === "postgres") {
    return `postgresql://${auth}@${host}:${port}/${encodeURIComponent(database)}?schema=${encodeURIComponent(schema)}`;
  }

  return `mysql://${auth}@${host}:${port}/${encodeURIComponent(database)}`;
}

function normalizeEnv(env) {
  const normalized = { ...env };
  const databaseUrl = buildDatabaseUrl(normalized);
  if (databaseUrl && !hasValue(normalized.DATABASE_URL)) {
    normalized.DATABASE_URL = databaseUrl;
  }

  if (
    !hasValue(normalized.SETUP_WIZARD) &&
    hasValue(normalized.DB_IS_INSTALLED)
  ) {
    normalized.SETUP_WIZARD =
      String(normalized.DB_IS_INSTALLED).trim() === "1" ? "false" : "true";
  }

  if (
    !hasValue(normalized.THROTTLE_TTL) &&
    hasValue(normalized.RATE_LIMIT_WINDOW_MS)
  ) {
    const windowMs = Number(normalized.RATE_LIMIT_WINDOW_MS);
    if (Number.isFinite(windowMs) && windowMs > 0) {
      normalized.THROTTLE_TTL = String(Math.ceil(windowMs / 1000));
    }
  }

  if (
    !hasValue(normalized.THROTTLE_LIMIT) &&
    hasValue(normalized.RATE_LIMIT_MAX)
  ) {
    normalized.THROTTLE_LIMIT = String(normalized.RATE_LIMIT_MAX).trim();
  }

  return normalized;
}

function upsertEnv(filePath, updates) {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";
  const seen = new Set();
  const lines = existing.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) return line;
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(filePath, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
}

function ensureProjectShape() {
  if (!fs.existsSync(path.join(rootDir, "package.json"))) {
    fail(`没有找到根目录 package.json：${rootDir}`);
  }
  if (!fs.existsSync(path.join(backendDir, "package.json"))) {
    fail("没有找到 backend/package.json，请确认压缩包已完整解压。");
  }
  if (!fs.existsSync(path.join(adminDir, "package.json"))) {
    fail("没有找到 admin/package.json，请确认压缩包已完整解压。");
  }
}

function ensureRootEnv() {
  if (fs.existsSync(rootEnvPath)) {
    log(`使用根目录环境文件：${rootEnvPath}`);
  } else if (fs.existsSync(backendEnvPath)) {
    fs.copyFileSync(backendEnvPath, rootEnvPath);
    log(`检测到旧位置 backend/.env，已复制到根目录：${rootEnvPath}`);
  } else {
    const template = fs.existsSync(deployEnvExamplePath)
      ? deployEnvExamplePath
      : backendEnvExamplePath;
    if (!fs.existsSync(template)) {
      fail("缺少 .env 模板，无法创建 backend/.env。");
    }
    fs.copyFileSync(template, rootEnvPath);
    log(`首次运行：已从模板创建 ${rootEnvPath}`);
  }

  const env = normalizeEnv(readEnv(rootEnvPath));
  const updates = {};
  if (!env.SETUP_TOKEN || env.SETUP_TOKEN.includes("please-change")) {
    updates.SETUP_TOKEN = randomBytes(24).toString("hex");
  }
  if (
    !env.JWT_SECRET ||
    env.JWT_SECRET.includes("please-generate") ||
    env.JWT_SECRET.includes("<CHANGE_ME>")
  ) {
    updates.JWT_SECRET = randomBytes(48).toString("hex");
  }
  if (Object.keys(updates).length) {
    upsertEnv(rootEnvPath, updates);
    log("已自动生成 SETUP_TOKEN / JWT_SECRET 占位密钥。");
  }

  return normalizeEnv(readEnv(rootEnvPath));
}

function installDependencies() {
  if (skipInstall) {
    log("跳过依赖安装：SKIP_INSTALL=1");
    return;
  }
  section("安装依赖");
  if (fs.existsSync(path.join(rootDir, "package-lock.json"))) {
    run("npm", ["ci"], { cwd: rootDir });
  } else {
    run("npm", ["install"], { cwd: rootDir });
  }
}

function prepareRuntimeDirs() {
  section("准备运行目录");
  for (const dir of [
    path.join(backendDir, "logs"),
    path.join(backendDir, "uploads"),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
    log(`OK ${dir}`);
  }
}

function migrateDatabase(env) {
  if (skipMigrate) {
    log("跳过数据库迁移：SKIP_MIGRATE=1");
    return;
  }

  section("数据库迁移");
  if (!env.DATABASE_URL) {
    log(
      "未配置 DATABASE_URL，跳过 migrate deploy。先打开 /setup 或编辑根目录 .env 配好数据库。",
    );
    return;
  }
  const provider =
    String(env.DB_PROVIDER || "").toLowerCase() ||
    (String(env.DATABASE_URL).startsWith("mysql://") ? "mysql" : "postgresql");
  const schema = `prisma/schema.${provider === "mysql" ? "mysql" : "postgresql"}.prisma`;
  run("npm", ["run", "db:generate"], {
    cwd: backendDir,
    env: { ...env, DB_PROVIDER: provider },
  });
  run("npx", ["prisma", "db", "push", "--schema", schema], {
    cwd: backendDir,
    env,
  });
}

async function bootstrapMembershipContent(env) {
  if (!env.DATABASE_URL) {
    log("未配置 DATABASE_URL，跳过会员运营默认数据引导。");
    return;
  }

  section("会员运营默认数据");
  let PrismaClient;
  try {
    PrismaClient = require("@prisma/client").PrismaClient;
  } catch (error) {
    log(`未能加载 Prisma Client，跳过会员运营默认数据引导：${error.message}`);
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });
  try {
    const permissionDefs = [
      {
        code: "membership:list",
        name: "查看会员概览",
        module: "membership",
        action: "list",
      },
      {
        code: "membership:plan:list",
        name: "查看会员套餐",
        module: "membership",
        action: "plan:list",
      },
      {
        code: "membership:plan:create",
        name: "创建会员套餐",
        module: "membership",
        action: "plan:create",
      },
      {
        code: "membership:plan:update",
        name: "更新会员套餐",
        module: "membership",
        action: "plan:update",
      },
      {
        code: "membership:plan:delete",
        name: "删除会员套餐",
        module: "membership",
        action: "plan:delete",
      },
      {
        code: "membership:order:list",
        name: "查看会员订单",
        module: "membership",
        action: "order:list",
      },
      {
        code: "membership:user:list",
        name: "查看会员用户",
        module: "membership",
        action: "user:list",
      },
      {
        code: "membership:usage:list",
        name: "查看会员权益使用记录",
        module: "membership",
        action: "usage:list",
      },
      {
        code: "membership:grant",
        name: "赠送会员",
        module: "membership",
        action: "grant",
      },
    ];

    const permissions = [];
    for (const def of permissionDefs) {
      permissions.push(
        await prisma.adminPermission.upsert({
          where: { code: def.code },
          update: { name: def.name, module: def.module, action: def.action },
          create: def,
        }),
      );
    }

    const menuDefs = [
      {
        id: "menu__membership",
        name: "会员运营",
        path: "/membership",
        icon: "CrownOutlined",
        sortOrder: 16,
      },
      {
        id: "menu__membership_overview",
        name: "会员概览",
        path: "/membership/overview",
        parentId: "menu__membership",
        sortOrder: 0,
      },
    ];
    const menus = [];
    for (const def of menuDefs) {
      menus.push(
        await prisma.adminMenu.upsert({
          where: { id: def.id },
          update: {
            name: def.name,
            path: def.path,
            icon: def.icon || null,
            parentId: def.parentId || null,
            sortOrder: def.sortOrder,
            isHidden: false,
          },
          create: {
            id: def.id,
            name: def.name,
            path: def.path,
            icon: def.icon || null,
            parentId: def.parentId || null,
            sortOrder: def.sortOrder,
          },
        }),
      );
    }
    await prisma.adminMenu.deleteMany({
      where: {
        path: "/membership/overview",
        id: { not: "menu__membership_overview" },
      },
    });
    await prisma.adminMenu.deleteMany({
      where: { path: "/membership", id: { not: "menu__membership" } },
    });

    const roles = await prisma.adminRole.findMany({
      where: { code: { in: ["super_admin", "platform_ops"] } },
    });
    for (const role of roles) {
      for (const permission of permissions) {
        await prisma.adminRolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
      }
      for (const menu of menus) {
        await prisma.adminRoleMenu.upsert({
          where: { roleId_menuId: { roleId: role.id, menuId: menu.id } },
          update: {},
          create: { roleId: role.id, menuId: menu.id },
        });
      }
    }

    const displayCount = await prisma.membershipDisplayItem.count();
    if (displayCount === 0) {
      await prisma.membershipDisplayItem.createMany({
        data: [
          {
            title: "每月会员专属优惠券",
            subtitle: "开通后自动发放，可用于平台订单抵扣",
            imageUrl: "/static/logo.jpg",
            priceText: "2张",
            originalPriceText: "每月",
            buttonText: "去查看",
            actionType: "navigate",
            actionUrl: "/pagesA/coupon/coupon",
            targetType: "coupon",
            benefitKey: "member_coupon_monthly",
            sortOrder: 1,
          },
          {
            title: "免配送费额度",
            subtitle: "外卖/小店订单可抵扣配送费",
            imageUrl: "/static/logo.jpg",
            priceText: "4次",
            originalPriceText: "每月",
            buttonText: "可用",
            actionType: "switchTab",
            actionUrl: "/pages/tabbar/index/index",
            targetType: "shop",
            benefitKey: "delivery_free_quota",
            sortOrder: 2,
          },
          {
            title: "免费帖子置顶",
            subtitle: "内容发布后可使用会员置顶额度",
            imageUrl: "/static/logo.jpg",
            priceText: "2次",
            originalPriceText: "每月",
            buttonText: "去使用",
            actionType: "navigate",
            actionUrl: "/pagesB/post/createPost",
            targetType: "post",
            benefitKey: "post_pin_free_quota",
            sortOrder: 3,
          },
          {
            title: "活动报名券",
            subtitle: "报名付费活动时可优先抵扣",
            imageUrl: "/static/logo.jpg",
            priceText: "1张",
            originalPriceText: "每月",
            buttonText: "去报名",
            actionType: "navigate",
            actionUrl: "/pagesA/selection/activity/activity",
            targetType: "activity",
            benefitKey: "activity_ticket_coupon_monthly",
            sortOrder: 4,
          },
        ],
      });
    }
    await prisma.membershipDisplayItem.updateMany({
      where: {
        benefitKey: "post_pin_free_quota",
        actionUrl: "/pages/tabbar/circle/circle",
      },
      data: { actionType: "navigate", actionUrl: "/pagesB/post/createPost" },
    });
    await prisma.membershipDisplayItem.updateMany({
      where: {
        benefitKey: "activity_ticket_coupon_monthly",
        actionUrl: "/pagesA/activity/list",
      },
      data: {
        actionType: "navigate",
        actionUrl: "/pagesA/selection/activity/activity",
      },
    });
    await prisma.membershipDisplayItem.updateMany({
      where: { benefitKey: "member_coupon_monthly", buttonText: "可用" },
      data: { buttonText: "去查看" },
    });

    const faqCount = await prisma.membershipFaq.count();
    if (faqCount === 0) {
      await prisma.membershipFaq.createMany({
        data: [
          {
            question: "会员如何续费？",
            answer:
              "在会员中心选择需要续费的套餐并完成支付即可。未到期会员续费后，有效期会顺延，不会覆盖当前剩余时间。",
            sortOrder: 1,
          },
          {
            question: "会员有效期如何计算？",
            answer:
              "会员有效期从支付成功或运营赠送成功时开始计算，到期后未使用完的月度权益会自动失效。",
            sortOrder: 2,
          },
          {
            question: "会员价格如何享受？",
            answer:
              "开通会员后，系统会在外卖、商城、跑腿、活动等场景自动识别会员身份，并按后台配置的权益进行优惠或抵扣。",
            sortOrder: 3,
          },
          {
            question: "如何查看权益剩余额度？",
            answer:
              "会员中心的“权益额度”会实时同步后台发放记录，展示当前可用次数、折扣或专属资格。",
            sortOrder: 4,
          },
        ],
      });
    }

    log("OK 会员运营权限、菜单、权益展示、常见问题已确认。");
  } catch (error) {
    log(`会员运营默认数据引导失败，更新继续：${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

function buildProject(env) {
  if (skipBuild) {
    log("跳过构建：SKIP_BUILD=1");
    return;
  }

  section("构建后端和后台");
  run("npm", ["run", "build"], { cwd: rootDir, env });
}

function restartPm2(env) {
  if (skipPm2) {
    log("跳过 PM2：SKIP_PM2=1");
    return;
  }
  if (!commandExists("pm2")) {
    log("未检测到 pm2，跳过重启。服务器可执行：npm i -g pm2");
    return;
  }

  section("重启 API / Worker / Realtime 服务");
  const ecosystemPath = path.join(rootDir, "deploy", "ecosystem.config.cjs");
  run("pm2", ["startOrReload", ecosystemPath, "--update-env"], {
    cwd: backendDir,
    env: {
      ...env,
      APP_ROOT: rootDir,
      PM2_NAME: pm2Name,
      PM2_WORKER_NAME: pm2WorkerName,
      PM2_REALTIME_NAME: pm2RealtimeName,
    },
  });
  run("pm2", ["save"], { cwd: backendDir, env });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function checkHealth(env) {
  if (skipHealth || skipPm2) return;
  const port = env.PORT || "3000";
  const realtimePort = env.REALTIME_PORT || "3001";
  const urls = [
    `http://127.0.0.1:${port}/healthz`,
    `http://127.0.0.1:${realtimePort}/healthz`,
    `http://127.0.0.1:${port}/healthz/services`,
  ];
  section("健康检查");
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const results = await Promise.all(urls.map((url) => requestHealth(url)));
    if (results.every(Boolean)) {
      urls.forEach((url) => log(`OK ${url}`));
      return;
    }
    await wait(2000);
  }
  fail(`三服务健康检查未通过：${urls.join(", ")}`);
}

async function main() {
  log("== Lingmeng 自动更新 ==");
  log(`项目目录：${rootDir}`);
  log(`PM2 名称：${pm2Name}`);

  ensureProjectShape();
  const env = ensureRootEnv();
  installDependencies();
  prepareRuntimeDirs();
  migrateDatabase(env);
  await bootstrapMembershipContent(env);
  buildProject(env);
  restartPm2(env);
  await checkHealth(env);

  log("\n更新完成。");
  log("下次上传解压后，在项目根目录执行：node utils/updateAndInstall.js");
}

if (require.main === module) {
  main().catch((error) => fail(error.stack || error.message));
}
