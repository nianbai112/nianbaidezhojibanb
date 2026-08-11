#!/usr/bin/env node
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function loadEnv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").replaceAll("\r", "").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function providerName() {
  const configured = String(process.env.DB_PROVIDER || "").toLowerCase();
  if (configured === "postgres") return "postgresql";
  if (configured === "mysql" || configured === "postgresql") return configured;
  return String(process.env.DATABASE_URL || "").startsWith("postgres") ? "postgresql" : "mysql";
}

function migrationFiles(provider) {
  const dir = path.join(root, "prisma", "additive-migrations", provider);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const file = path.join(dir, name);
      return {
        name: name.slice(0, -4),
        file,
        checksum: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      };
    });
}

function rowValue(row, key) {
  const found = Object.keys(row || {}).find((name) => name.toLowerCase() === key.toLowerCase());
  return found ? row[found] : undefined;
}

function prismaCli(args, options = {}) {
  const cli = path.join(root, "node_modules", "prisma", "build", "index.js");
  if (!fs.existsSync(cli)) throw new Error("缺少 Prisma CLI，无法执行数据库迁移");
  const result = childProcess.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    timeout: options.timeout || 30 * 60 * 1000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowedCodes?.includes(result.status)) {
    throw new Error(String(result.stderr || result.stdout || `Prisma 退出码 ${result.status}`).trim());
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`.trim();
}

async function ensureLedger(prisma, provider) {
  if (provider === "mysql") {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS \`lingmeng_schema_migrations\` (
      \`migration_name\` varchar(191) NOT NULL,
      \`checksum\` varchar(64) NOT NULL,
      \`status\` varchar(16) NOT NULL,
      \`started_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`finished_at\` datetime(3) NULL,
      \`error_message\` text NULL,
      PRIMARY KEY (\`migration_name\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    return;
  }
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "lingmeng_schema_migrations" (
    "migration_name" varchar(191) PRIMARY KEY,
    "checksum" varchar(64) NOT NULL,
    "status" varchar(16) NOT NULL,
    "started_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" timestamp(3) NULL,
    "error_message" text NULL
  )`);
}

async function ledgerRows(prisma) {
  const rows = await prisma.$queryRawUnsafe("SELECT migration_name, checksum, status, started_at, finished_at, error_message FROM lingmeng_schema_migrations ORDER BY migration_name");
  return new Map(rows.map((row) => [String(rowValue(row, "migration_name")), {
    checksum: String(rowValue(row, "checksum") || ""),
    status: String(rowValue(row, "status") || ""),
    error: String(rowValue(row, "error_message") || ""),
  }]));
}

async function markRunning(prisma, provider, migration) {
  if (provider === "mysql") {
    await prisma.$executeRawUnsafe(
      "INSERT INTO lingmeng_schema_migrations (migration_name, checksum, status, started_at, finished_at, error_message) VALUES (?, ?, 'RUNNING', NOW(3), NULL, NULL) ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), status = 'RUNNING', started_at = NOW(3), finished_at = NULL, error_message = NULL",
      migration.name,
      migration.checksum,
    );
    return;
  }
  await prisma.$executeRawUnsafe(
    "INSERT INTO lingmeng_schema_migrations (migration_name, checksum, status, started_at, finished_at, error_message) VALUES ($1, $2, 'RUNNING', CURRENT_TIMESTAMP, NULL, NULL) ON CONFLICT (migration_name) DO UPDATE SET checksum = EXCLUDED.checksum, status = 'RUNNING', started_at = CURRENT_TIMESTAMP, finished_at = NULL, error_message = NULL",
    migration.name,
    migration.checksum,
  );
}

async function markFinished(prisma, provider, migration, status, error = "") {
  const sql = provider === "mysql"
    ? "UPDATE lingmeng_schema_migrations SET status = ?, finished_at = NOW(3), error_message = ? WHERE migration_name = ?"
    : "UPDATE lingmeng_schema_migrations SET status = $1, finished_at = CURRENT_TIMESTAMP, error_message = $2 WHERE migration_name = $3";
  await prisma.$executeRawUnsafe(sql, status, error.slice(0, 4000) || null, migration.name);
}

async function databaseIsEmpty(prisma, provider) {
  const sql = provider === "mysql"
    ? "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name NOT IN ('lingmeng_schema_migrations', '_prisma_migrations')"
    : "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = current_schema() AND table_name NOT IN ('lingmeng_schema_migrations', '_prisma_migrations')";
  const rows = await prisma.$queryRawUnsafe(sql);
  return Number(rowValue(rows[0], "table_count") || 0) === 0;
}

function schemaVerification(provider) {
  const schema = path.join(root, "prisma", `schema.${provider}.prisma`);
  if (!fs.existsSync(schema)) return { status: "UNAVAILABLE", detail: `缺少 ${path.basename(schema)}` };
  try {
    const output = prismaCli([
      "migrate", "diff",
      "--from-schema-datasource", schema,
      "--to-schema-datamodel", schema,
      "--script",
      "--exit-code",
    ], { capture: true, timeout: 2 * 60 * 1000, allowedCodes: [2] });
    const additions = /^(-- (CreateTable|AlterTable|CreateIndex|AddForeignKey)|ALTER TABLE .* ADD|CREATE (TABLE|INDEX))/m.test(output);
    const retained = /^(-- Drop(Table|Index)|DROP (TABLE|INDEX))/m.test(output);
    return additions
      ? { status: "MISSING", detail: "仍存在未由发布迁移覆盖的必需结构" }
      : retained
        ? { status: "WARNING", detail: "必需结构已齐全；历史表或旧索引按安全策略保留" }
        : { status: "PASS", detail: "数据库结构与当前版本一致" };
  } catch (error) {
    return { status: "UNAVAILABLE", detail: String(error.message || error).slice(0, 500) };
  }
}

async function status(prisma, provider) {
  await ensureLedger(prisma, provider);
  const rows = await ledgerRows(prisma);
  const migrations = migrationFiles(provider).map((migration) => {
    const recorded = rows.get(migration.name);
    let state = recorded?.status || "PENDING";
    if (recorded && recorded.checksum !== migration.checksum) state = "CHECKSUM_MISMATCH";
    return { name: migration.name, checksum: migration.checksum, status: state, error: recorded?.error || "" };
  });
  return { provider, migrations, schema: schemaVerification(provider) };
}

async function apply(prisma, provider, install) {
  const schema = path.join(root, "prisma", `schema.${provider}.prisma`);
  if (install && await databaseIsEmpty(prisma, provider)) {
    console.log("检测到全新空数据库，创建当前版本初始结构。");
    prismaCli(["db", "push", "--schema", schema, "--skip-generate", "--accept-data-loss"]);
  }
  await ensureLedger(prisma, provider);
  const rows = await ledgerRows(prisma);
  for (const migration of migrationFiles(provider)) {
    const recorded = rows.get(migration.name);
    if (recorded?.status === "APPLIED" && recorded.checksum === migration.checksum) continue;
    if (recorded?.status === "APPLIED" && recorded.checksum !== migration.checksum) {
      throw new Error(`迁移 ${migration.name} 已执行但 checksum 发生变化，已拒绝更新`);
    }
    await markRunning(prisma, provider, migration);
    try {
      console.log(`执行迁移 ${migration.name}`);
      prismaCli(["db", "execute", "--schema", schema, "--file", migration.file]);
      await markFinished(prisma, provider, migration, "APPLIED");
    } catch (error) {
      await markFinished(prisma, provider, migration, "FAILED", String(error.message || error));
      throw error;
    }
  }
  const verification = schemaVerification(provider);
  if (verification.status === "MISSING" || verification.status === "UNAVAILABLE") {
    throw new Error(`迁移后结构校验未通过：${verification.detail}`);
  }
  return status(prisma, provider);
}

async function main() {
  loadEnv();
  const command = process.argv[2] || "status";
  const provider = providerName();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL 为空");
  if (!fs.existsSync(path.join(root, "prisma", `schema.${provider}.prisma`))) throw new Error(`不支持的数据库：${provider}`);
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const result = command === "apply" || command === "install"
      ? await apply(prisma, provider, command === "install")
      : await status(prisma, provider);
    console.log(`LINGMENG_MIGRATIONS_JSON=${JSON.stringify(result)}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

module.exports = { migrationFiles, rowValue };
