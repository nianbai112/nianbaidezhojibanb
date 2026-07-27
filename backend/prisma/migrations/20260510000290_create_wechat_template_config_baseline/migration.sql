-- Additive baseline repair. The following published notification migration
-- extends this table, so a fresh database must create it first.
CREATE TABLE IF NOT EXISTS "wechat_template_configs" (
  "id" TEXT NOT NULL,
  "platformType" TEXT NOT NULL DEFAULT 'miniprogram',
  "templateType" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "title" TEXT,
  "defaultPage" TEXT,
  "fieldMapping" JSONB,
  "exampleData" JSONB,
  "pageTemplate" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "regionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wechat_template_configs_pkey" PRIMARY KEY ("id")
);
