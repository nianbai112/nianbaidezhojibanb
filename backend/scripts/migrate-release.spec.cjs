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

  const dormShopDeliveryMigration = migrationFiles(provider).find(
    (migration) => migration.name === "202608290002_dorm_shop_delivery_staff",
  );
  assert.ok(dormShopDeliveryMigration, `${provider} release migrations must add dorm-shop delivery staff records`);
  const dormShopDeliverySql = fs.readFileSync(dormShopDeliveryMigration.file, "utf8");
  assert.match(dormShopDeliverySql, /merchant_staffs/i);
  assert.match(dormShopDeliverySql, /shop_delivery_assignments/i);
  assert.match(dormShopDeliverySql, /delivery_receipt_code/i);
  assert.doesNotMatch(
    dormShopDeliverySql,
    /\b(?:DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN)|TRUNCATE\s+TABLE)\b/i,
  );
  if (provider === "mysql") {
    assert.match(dormShopDeliverySql, /information_schema\.columns/i);
    assert.match(dormShopDeliverySql, /PREPARE\s+lingmeng_stmt/i);
    assert.doesNotMatch(dormShopDeliverySql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
    const mysqlIdentifiers = [...dormShopDeliverySql.matchAll(/`([^`]+)`/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(
      mysqlIdentifiers.filter((identifier) => Buffer.byteLength(identifier, "utf8") > 64),
      [],
      "MySQL migration identifiers must not exceed the 64-byte limit",
    );
  } else {
    assert.match(dormShopDeliverySql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
  }

  const wechatDeliveryReceiptMigration = migrationFiles(provider).find(
    (migration) => migration.name === "202608300003_wechat_template_delivery_receipt",
  );
  assert.ok(
    wechatDeliveryReceiptMigration,
    `${provider} release migrations must add the WeChat delivery receipt id`,
  );
  const wechatDeliveryReceiptSql = fs.readFileSync(wechatDeliveryReceiptMigration.file, "utf8");
  assert.match(wechatDeliveryReceiptSql, /wechat_message_logs/i);
  assert.match(wechatDeliveryReceiptSql, /wechatMsgId/);
  assert.match(wechatDeliveryReceiptSql, /CREATE\s+UNIQUE\s+INDEX/i);
  assert.doesNotMatch(
    wechatDeliveryReceiptSql,
    /\b(?:DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN)|TRUNCATE\s+TABLE)\b/i,
  );
  if (provider === "mysql") {
    assert.match(wechatDeliveryReceiptSql, /information_schema\.columns/i);
    assert.match(wechatDeliveryReceiptSql, /information_schema\.statistics/i);
    assert.match(
      wechatDeliveryReceiptSql,
      /column_name\s*=\s*'wechatMsgId'[\s\S]*?ALTER TABLE [`]wechat_message_logs[`] ADD COLUMN [`]wechatMsgId[`]/i,
    );
    assert.match(
      wechatDeliveryReceiptSql,
      /index_name\s*=\s*'wechat_message_logs_wechatMsgId_key'[\s\S]*?CREATE UNIQUE INDEX [`]wechat_message_logs_wechatMsgId_key[`]/i,
    );
    assert.match(wechatDeliveryReceiptSql, /PREPARE\s+lingmeng_stmt/i);
    assert.doesNotMatch(wechatDeliveryReceiptSql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
  } else {
    assert.match(wechatDeliveryReceiptSql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
    assert.match(wechatDeliveryReceiptSql, /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS/i);
  }

  const notificationPreferenceMigration = migrationFiles(provider).find(
    (migration) => migration.name === "202608300004_notification_preference_modes",
  );
  assert.ok(
    notificationPreferenceMigration,
    `${provider} release migrations must add notification preference modes`,
  );
  const notificationPreferenceSql = fs.readFileSync(notificationPreferenceMigration.file, "utf8");
  const modeBackfills = [
    ["notifyLikeMode", "notifyLike", "reduced"],
    ["notifyCommentMode", "notifyComment", "instant"],
    ["notifyReplyMode", "notifyComment", "instant"],
    ["notifyMentionMode", "notifyComment", "instant"],
    ["notifyFollowMode", "notifyFollow", "inbox"],
    ["notifySquatMode", "notifySquat", "inbox"],
  ];
  for (const [column, legacyColumn, defaultValue] of modeBackfills) {
    assert.match(
      notificationPreferenceSql,
      new RegExp(`SET [\\x60"]${column}[\\x60"] = [\\s\\S]*?[\\x60"]${legacyColumn}[\\x60"][\\s\\S]*?WHERE [\\x60"]${column}[\\x60"] IS NULL`, "i"),
      `${provider} must backfill only NULL ${column} values from ${legacyColumn}`,
    );
    if (provider === "mysql") {
      assert.match(
        notificationPreferenceSql,
        new RegExp(`column_name = '${column}'[\\s\\S]*?ADD COLUMN [\\x60]${column}[\\x60] VARCHAR\\(191\\) NULL`, "i"),
        `MySQL must independently guard nullable creation of ${column}`,
      );
      assert.match(
        notificationPreferenceSql,
        new RegExp(`MODIFY COLUMN [\\x60]${column}[\\x60] VARCHAR\\(191\\) NOT NULL DEFAULT '${defaultValue}'`, "i"),
      );
    } else {
      assert.match(
        notificationPreferenceSql,
        new RegExp(`ADD COLUMN IF NOT EXISTS "${column}" TEXT(?:,|;)`, "i"),
        `PostgreSQL must create ${column} as nullable before its legacy backfill`,
      );
      assert.match(
        notificationPreferenceSql,
        new RegExp(`ALTER COLUMN "${column}" SET DEFAULT '${defaultValue}'[\\s\\S]*?ALTER COLUMN "${column}" SET NOT NULL`, "i"),
      );
    }
  }
  for (const column of ["notifyOfficialAccount", "notifyInteractionBadge"]) {
    assert.match(
      notificationPreferenceSql,
      new RegExp(`SET [\\x60"]${column}[\\x60"] = true\\s+WHERE [\\x60"]${column}[\\x60"] IS NULL`, "i"),
      `${provider} must backfill only NULL ${column} values`,
    );
    if (provider === "mysql") {
      assert.match(
        notificationPreferenceSql,
        new RegExp(`column_name = '${column}'[\\s\\S]*?ADD COLUMN [\\x60]${column}[\\x60] BOOLEAN NULL`, "i"),
        `MySQL must independently guard nullable creation of ${column}`,
      );
      assert.match(
        notificationPreferenceSql,
        new RegExp(`MODIFY COLUMN [\\x60]${column}[\\x60] BOOLEAN NOT NULL DEFAULT true`, "i"),
      );
    } else {
      assert.match(
        notificationPreferenceSql,
        new RegExp(`ADD COLUMN IF NOT EXISTS "${column}" BOOLEAN(?:,|;)`, "i"),
        `PostgreSQL must create ${column} as nullable before its default backfill`,
      );
      assert.match(
        notificationPreferenceSql,
        new RegExp(`ALTER COLUMN "${column}" SET DEFAULT true[\\s\\S]*?ALTER COLUMN "${column}" SET NOT NULL`, "i"),
      );
    }
  }
  assert.doesNotMatch(
    notificationPreferenceSql,
    /[`"]notify(?:System|Order)[`"]\s*=/i,
    `${provider} migration must preserve existing system and order notification preferences`,
  );
  assert.doesNotMatch(
    notificationPreferenceSql,
    /\b(?:DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN)|TRUNCATE\s+TABLE)\b/i,
  );
  if (provider === "mysql") {
    assert.match(notificationPreferenceSql, /information_schema\.columns/i);
    assert.match(notificationPreferenceSql, /PREPARE\s+lingmeng_stmt/i);
    assert.doesNotMatch(notificationPreferenceSql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
  } else {
    assert.match(notificationPreferenceSql, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
  }
}

for (const provider of ["postgresql", "mysql"]) {
  const legacyEntryMigration = migrationFiles(provider).find(
    (migration) => migration.name === "202609190004_welfare_legacy_entry_defaults",
  );
  assert.ok(
    legacyEntryMigration,
    `${provider} release migrations must account for retired welfare entry columns`,
  );
  const legacyEntrySql = fs.readFileSync(legacyEntryMigration.file, "utf8");
  if (provider === "mysql") {
    assert.match(legacyEntrySql, /welfare_entries[\s\S]*ordinal[\s\S]*DEFAULT 0/i);
    assert.match(legacyEntrySql, /welfare_entries[\s\S]*dayKey[\s\S]*DEFAULT ''''/i);
    assert.match(legacyEntrySql, /welfare_draws[\s\S]*giftedCount[\s\S]*DEFAULT 0/i);
    assert.match(legacyEntrySql, /information_schema\.columns/i);
    assert.match(legacyEntrySql, /PREPARE\s+stmt/i);
  } else {
    assert.match(legacyEntrySql, /SELECT 1/i);
  }
}

for (const provider of ["postgresql", "mysql"]) {
  const modifierMigration = migrationFiles(provider).find(
    (migration) => migration.name === "202609270002_purchase_modifiers",
  );
  assert.ok(modifierMigration, `${provider} release migrations must add the purchase modifier library`);
  const modifierSql = fs.readFileSync(modifierMigration.file, "utf8");
  assert.match(modifierSql, /CREATE TABLE IF NOT EXISTS [`"]purchase_modifier_groups[`"]/);
  assert.match(modifierSql, /CREATE TABLE IF NOT EXISTS [`"]purchase_modifier_options[`"]/);
  assert.match(modifierSql, /modifierBindings/);
  // A partly applied release must be able to run this file again.
  assert.match(modifierSql, provider === "mysql" ? /information_schema\.COLUMNS/ : /ADD COLUMN IF NOT EXISTS/);
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
