-- CreateTable
CREATE TABLE "wechat_chat_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_chat_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_chat_conversations" (
    "id" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "wxid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "takeover" BOOLEAN NOT NULL DEFAULT false,
    "style" TEXT NOT NULL DEFAULT 'inherit',
    "groupTrigger" TEXT NOT NULL DEFAULT 'inherit',
    "allowedSkills" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "contextAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReplyAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_chat_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "sender" TEXT,
    "text" TEXT NOT NULL,
    "msgType" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wechat_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_chat_replies" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "text" TEXT,
    "reason" TEXT,
    "settingsRevision" INTEGER NOT NULL,
    "conversationRevision" INTEGER NOT NULL,
    "sourceVersions" JSONB,
    "remoteId" TEXT,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_chat_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_chat_skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publishedVersionId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_chat_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_chat_skill_versions" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "commit" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wechat_chat_skill_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_chat_knowledge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'private',
    "conversationId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wechat_chat_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_chat_quotas" (
    "id" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_chat_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_chat_members" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "banterMuted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_chat_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wechat_chat_conversations_accountKey_updatedAt_idx" ON "wechat_chat_conversations"("accountKey", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_chat_conversations_accountKey_wxid_key" ON "wechat_chat_conversations"("accountKey", "wxid");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_chat_messages_eventKey_key" ON "wechat_chat_messages"("eventKey");

-- CreateIndex
CREATE INDEX "wechat_chat_messages_conversationId_createdAt_idx" ON "wechat_chat_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_chat_replies_messageId_key" ON "wechat_chat_replies"("messageId");

-- CreateIndex
CREATE INDEX "wechat_chat_replies_status_notBefore_idx" ON "wechat_chat_replies"("status", "notBefore");

-- CreateIndex
CREATE INDEX "wechat_chat_replies_conversationId_status_createdAt_idx" ON "wechat_chat_replies"("conversationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "wechat_chat_skill_versions_skillId_createdAt_idx" ON "wechat_chat_skill_versions"("skillId", "createdAt");

-- CreateIndex
CREATE INDEX "wechat_chat_knowledge_scope_enabled_idx" ON "wechat_chat_knowledge"("scope", "enabled");

-- CreateIndex
CREATE INDEX "wechat_chat_members_conversationId_idx" ON "wechat_chat_members"("conversationId");

-- AddForeignKey
ALTER TABLE "wechat_chat_messages" ADD CONSTRAINT "wechat_chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "wechat_chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wechat_chat_replies" ADD CONSTRAINT "wechat_chat_replies_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "wechat_chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wechat_chat_replies" ADD CONSTRAINT "wechat_chat_replies_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "wechat_chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wechat_chat_skill_versions" ADD CONSTRAINT "wechat_chat_skill_versions_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "wechat_chat_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wechat_chat_members" ADD CONSTRAINT "wechat_chat_members_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "wechat_chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Register permission codes without granting other roles access to private conversations.
INSERT INTO "admin_permissions" ("id","code","name","module","action") VALUES ('wc_67295e4ae15a04674581e566','wechat:conversation:view','查看微信会话','wechat','view') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "admin_permissions" ("id","code","name","module","action") VALUES ('wc_ba326b05d8b38b2109203ebe','wechat:content:view','查看微信聊天正文','wechat','content') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "admin_permissions" ("id","code","name","module","action") VALUES ('wc_c4ea812fba2880e1ccb8fd90','wechat:reply:edit','管理微信自动回复','wechat','edit') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "admin_permissions" ("id","code","name","module","action") VALUES ('wc_a59ff2277d2fe07c7563c1c8','wechat:log:view','查看微信回复任务','wechat','log') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "admin_permissions" ("id","code","name","module","action") VALUES ('wc_f988efac527e944ccad73174','wechat:knowledge:edit','管理微信问答资料','wechat','knowledge') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "admin_permissions" ("id","code","name","module","action") VALUES ('wc_34bb47ac3533be25610b09af','skill:view','查看微信 Skill','skill','view') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "admin_permissions" ("id","code","name","module","action") VALUES ('wc_dcb09400fe3332eccde49022','skill:edit','编辑微信 Skill 草稿','skill','edit') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "admin_permissions" ("id","code","name","module","action") VALUES ('wc_baecb02699d0bb41d947b45e','skill:publish','发布及停用微信 Skill','skill','publish') ON CONFLICT ("code") DO NOTHING;

-- History keeps settings only; rollback always preserves the live credential.
UPDATE "ai_config_versions" SET "value" = "value"::jsonb || '{"apiKey":"********"}'::jsonb, "maskedValue" = COALESCE("maskedValue"::jsonb, '{}'::jsonb) || '{"apiKey":"********"}'::jsonb WHERE "configKey" = 'ai_ops_config';
