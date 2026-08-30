#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  migrationFiles,
  prismaCliPath,
  rowValue,
  schemaDiffState,
} = require("./migrate-release.cjs");

assert.ok(fs.existsSync(prismaCliPath()), "migration runner must resolve a hoisted Prisma CLI");

assert.equal(rowValue({ COLUMN_NAME: "levelTitleId" }, "column_name"), "levelTitleId");
assert.equal(rowValue({ column_name: "levelBenefits" }, "COLUMN_NAME"), "levelBenefits");

assert.equal(schemaDiffState("").status, "PASS");
assert.equal(
  schemaDiffState(`-- AlterTable
ALTER TABLE "orders" ADD COLUMN "delivery_receipt_code" TEXT;`).status,
  "MISSING",
);
assert.equal(
  schemaDiffState(`-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "merchant_staffs"("id");`).status,
  "MISSING",
);
assert.equal(
  schemaDiffState(`-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_ticketId_fkey";
-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "ticketId" SET DATA TYPE TEXT;
-- DropTable
DROP TABLE "legacy_events";
-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "assistant_tickets"("id");
-- RenameIndex
ALTER INDEX "old_name" RENAME TO "new_name";`).status,
  "WARNING",
);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lingmeng-migration-check-"));
fs.writeFileSync(path.join(temp, "b.sql"), "SELECT 2;");
fs.writeFileSync(path.join(temp, "a.sql"), "SELECT 1;");
assert.deepEqual(fs.readdirSync(temp).filter((name) => name.endsWith(".sql")).sort(), ["a.sql", "b.sql"]);
fs.rmSync(temp, { recursive: true, force: true });

for (const provider of ["postgresql", "mysql"]) {
  assert.ok(
    migrationFiles(provider).some((migration) => migration.name === "202608090001_campus_map_collection_phase_one"),
    `${provider} release migrations must create the campus map collection tables`,
  );
  const shareTextMigration = migrationFiles(provider).find(
    (migration) => migration.name === "202608220001_widen_share_settings_text",
  );
  assert.ok(shareTextMigration, `${provider} release migrations must widen share settings text fields`);
  const shareTextSql = fs.readFileSync(shareTextMigration.file, "utf8");
  assert.match(shareTextSql, /activityImage[\s\S]*TEXT/i);
  assert.match(shareTextSql, /activityRules[\s\S]*TEXT/i);

  const officialSupportMigration = migrationFiles(provider).find(
    (migration) => migration.name === "202608240002_official_support_single_ledger",
  );
  assert.ok(officialSupportMigration, `${provider} release migrations must add official support linkage fields`);
  const officialSupportSql = fs.readFileSync(officialSupportMigration.file, "utf8");
  assert.match(officialSupportSql, /systemRole/);
  assert.match(officialSupportSql, /scopeKey/);
  assert.match(officialSupportSql, /conversationId/);
  assert.match(officialSupportSql, /ticketId/);
  assert.match(officialSupportSql, /messageId/);
  assert.match(officialSupportSql, /eventKey/);
  assert.doesNotMatch(officialSupportSql, /\b(?:DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN)|TRUNCATE\s+TABLE)\b/i);
  if (provider === "mysql") {
    assert.match(officialSupportSql, /information_schema\.columns/i);
    assert.match(officialSupportSql, /information_schema\.statistics/i);
    assert.match(officialSupportSql, /information_schema\.table_constraints/i);
    assert.match(officialSupportSql, /PREPARE\s+lingmeng_stmt/i);
  } else {
    assert.match(officialSupportSql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
    assert.match(officialSupportSql, /CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i);
  }

  const retireCommentLotteryMigration = migrationFiles(provider).find(
    (migration) => migration.name === "202608240003_retire_comment_lottery",
  );
  assert.ok(retireCommentLotteryMigration, `${provider} release migrations must retire comment lottery metadata`);
  const retireCommentLotterySql = fs.readFileSync(retireCommentLotteryMigration.file, "utf8");
  assert.match(retireCommentLotterySql, /comment_lottery_winner/);
  assert.match(retireCommentLotterySql, /deliveryStatus[\s\S]*retired/i);
  assert.match(retireCommentLotterySql, /admin_role_permissions/);
  assert.match(retireCommentLotterySql, /admin_permissions/);
  assert.match(retireCommentLotterySql, /admin_role_menus/);
  assert.match(retireCommentLotterySql, /admin_menus/);
  assert.doesNotMatch(retireCommentLotterySql, /\b(?:DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(
    retireCommentLotterySql,
    /\bDELETE\s+FROM\s+(?:`|")?(?:users|posts|comments|notifications)(?:`|")?\b/i,
  );

  const selfUnbanMigration = migrationFiles(provider).find(
    (migration) => migration.name === "202608280001_self_unban_review_closure",
  );
  assert.ok(selfUnbanMigration, `${provider} release migrations must create self-unban review records`);
  const selfUnbanSql = fs.readFileSync(selfUnbanMigration.file, "utf8");
  assert.match(selfUnbanSql, /self_unban_requests/i);
  assert.match(selfUnbanSql, /activeKey/i);
  assert.match(selfUnbanSql, /requestNo/i);
  assert.match(selfUnbanSql, /banVersion/i);
  assert.doesNotMatch(selfUnbanSql, /\b(?:DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN)|TRUNCATE\s+TABLE)\b/i);
  if (provider === "mysql") {
    const mysqlSchema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.mysql.prisma"), "utf8");
    const selfUnbanModel = mysqlSchema.match(/model SelfUnbanRequest \{[\s\S]*?\n\}/)?.[0] || "";
    assert.match(selfUnbanModel, /banReason\s+String\?\s+@db\.Text/);
    assert.match(selfUnbanModel, /adminNote\s+String\?\s+@db\.Text/);
    assert.match(selfUnbanSql, /`banReason`\s+TEXT\s+NULL/i);
    assert.match(selfUnbanSql, /`adminNote`\s+TEXT\s+NULL/i);
  }
}

const disabledConversationMigration = path.resolve(
  __dirname,
  "../prisma/migrations/20260824145429_add_private_conversation_unique_constraint.sql",
);
if (fs.existsSync(disabledConversationMigration)) {
  const sql = fs.readFileSync(disabledConversationMigration, "utf8");
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+(?:`|")?conversations\b/i);
  assert.match(sql, /已停用/);
}
console.log("migration runner self-check passed");
