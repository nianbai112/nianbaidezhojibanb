-- CreateTable
CREATE TABLE "academic_terms" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monday" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "slots" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_classes" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "major" VARCHAR(80) NOT NULL,
    "grade" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "academic_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_teachers" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,

    CONSTRAINT "academic_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_rules" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_sessions" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "ruleId" TEXT,
    "sourceWeek" INTEGER NOT NULL,
    "originalDate" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "courseName" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "classIds" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "exception" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_settings" (
    "regionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "leadMinutes" INTEGER NOT NULL DEFAULT 20,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_settings_pkey" PRIMARY KEY ("regionId")
);

-- CreateTable
CREATE TABLE "academic_reminders" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_terms_regionId_startDate_idx" ON "academic_terms"("regionId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "academic_class_identity" ON "academic_classes"("regionId", "major", "grade", "name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_teacher_identity" ON "academic_teachers"("regionId", "code");

-- CreateIndex
CREATE INDEX "academic_rules_termId_idx" ON "academic_rules"("termId");

-- CreateIndex
CREATE INDEX "academic_sessions_termId_date_idx" ON "academic_sessions"("termId", "date");

-- CreateIndex
CREATE INDEX "academic_sessions_status_startAt_idx" ON "academic_sessions"("status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "academic_source_occurrence" ON "academic_sessions"("ruleId", "sourceWeek");

-- CreateIndex
CREATE INDEX "academic_subscriptions_classId_enabled_idx" ON "academic_subscriptions"("classId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "academic_user_region" ON "academic_subscriptions"("userId", "regionId");

-- CreateIndex
CREATE INDEX "academic_reminders_status_updatedAt_idx" ON "academic_reminders"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "academic_reminder_once" ON "academic_reminders"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "academic_rules" ADD CONSTRAINT "academic_rules_termId_fkey" FOREIGN KEY ("termId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_termId_fkey" FOREIGN KEY ("termId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "academic_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_subscriptions" ADD CONSTRAINT "academic_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_subscriptions" ADD CONSTRAINT "academic_subscriptions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "academic_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_reminders" ADD CONSTRAINT "academic_reminders_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_reminders" ADD CONSTRAINT "academic_reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


INSERT INTO "admin_permissions" ("id", "code", "name", "module", "action", "createdAt") VALUES ('academic_view', 'academic:view', '查看课表', 'academic', 'view', CURRENT_TIMESTAMP) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "admin_permissions" ("id", "code", "name", "module", "action", "createdAt") VALUES ('academic_edit', 'academic:edit', '管理课表', 'academic', 'edit', CURRENT_TIMESTAMP) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "admin_permissions" ("id", "code", "name", "module", "action", "createdAt") VALUES ('academic_config', 'academic:config', '配置课程提醒', 'academic', 'config', CURRENT_TIMESTAMP) ON CONFLICT ("code") DO NOTHING;

INSERT INTO "admin_menus" ("id", "name", "icon", "path", "permission", "sortOrder", "updatedAt") VALUES ('menu__academic_schedule', '课表管理', 'CalendarOutlined', '/academic/schedule', 'academic:view', 30, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
