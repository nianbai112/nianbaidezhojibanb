CREATE TABLE "membership_display_items" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "imageUrl" TEXT,
  "priceText" TEXT,
  "originalPriceText" TEXT,
  "buttonText" TEXT NOT NULL DEFAULT '可用',
  "actionType" TEXT NOT NULL DEFAULT 'navigate',
  "actionUrl" TEXT,
  "targetType" TEXT,
  "targetId" TEXT,
  "benefitKey" TEXT,
  "memberOnly" BOOLEAN NOT NULL DEFAULT false,
  "showWhen" TEXT NOT NULL DEFAULT 'always',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "membership_display_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_faqs" (
  "id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "scene" TEXT NOT NULL DEFAULT 'miniapp',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "membership_faqs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "membership_display_items_isEnabled_sortOrder_idx" ON "membership_display_items"("isEnabled", "sortOrder");
CREATE INDEX "membership_display_items_benefitKey_idx" ON "membership_display_items"("benefitKey");
CREATE INDEX "membership_faqs_scene_isEnabled_sortOrder_idx" ON "membership_faqs"("scene", "isEnabled", "sortOrder");
