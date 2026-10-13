-- 客户群成员运营名册。可重复执行。
ALTER TABLE "welfare_wecom_groups" ADD COLUMN IF NOT EXISTS "rosterSyncedAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "welfare_wecom_members" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "memberKey" TEXT NOT NULL,
  "identityHash" TEXT,
  "identityScope" VARCHAR(256),
  "linkedUserId" TEXT,
  "identityState" TEXT NOT NULL DEFAULT 'unlinked',
  "nickname" TEXT NOT NULL,
  "memberType" INTEGER NOT NULL,
  "joinedAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "leftAt" TIMESTAMP(3),
  CONSTRAINT "welfare_wecom_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "welfare_wecom_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "welfare_wecom_groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "welfare_wecom_members_groupId_memberKey_key" ON "welfare_wecom_members"("groupId", "memberKey");
CREATE INDEX IF NOT EXISTS "welfare_wecom_members_groupId_leftAt_idx" ON "welfare_wecom_members"("groupId", "leftAt");
CREATE INDEX IF NOT EXISTS "welfare_wecom_members_linkedUserId_idx" ON "welfare_wecom_members"("linkedUserId");
