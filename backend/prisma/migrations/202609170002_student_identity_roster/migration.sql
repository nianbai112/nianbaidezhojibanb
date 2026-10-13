-- AlterEnum
ALTER TYPE "StudentVerifyStatus" ADD VALUE 'REVOKED';

-- AlterTable
ALTER TABLE "student_verifies" ADD COLUMN     "materialId" TEXT,
ADD COLUMN     "proofMethod" TEXT NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "roster_student_id" TEXT,
ADD COLUMN     "submissionVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "rosterRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "studentVerificationMode" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "school_students" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "studentId" VARCHAR(191) NOT NULL,
    "identityKey" VARCHAR(64) NOT NULL,
    "realName" VARCHAR(191) NOT NULL,
    "enrollmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "bound_user_id" TEXT,
    "boundAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_roster_batches" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "baseRevision" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "sourceName" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "school_roster_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_verification_events" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "rosterStudentId" TEXT,
    "userId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "submissionVersion" INTEGER,
    "materialId" TEXT,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_verification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_verification_materials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_verification_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_students_bound_user_id_key" ON "school_students"("bound_user_id");

-- CreateIndex
CREATE INDEX "school_students_school_id_enrollmentStatus_idx" ON "school_students"("school_id", "enrollmentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "school_students_school_id_identityKey_key" ON "school_students"("school_id", "identityKey");

-- CreateIndex
CREATE INDEX "school_roster_batches_school_id_digest_status_idx" ON "school_roster_batches"("school_id", "digest", "status");

-- CreateIndex
CREATE INDEX "student_verification_events_schoolId_createdAt_idx" ON "student_verification_events"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "student_verification_events_userId_createdAt_idx" ON "student_verification_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "student_verification_events_materialId_idx" ON "student_verification_events"("materialId");

-- CreateIndex
CREATE INDEX "student_verification_materials_userId_createdAt_idx" ON "student_verification_materials"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "student_verifies" ADD CONSTRAINT "student_verifies_roster_student_id_fkey" FOREIGN KEY ("roster_student_id") REFERENCES "school_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_verifies" ADD CONSTRAINT "student_verifies_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "student_verification_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_students" ADD CONSTRAINT "school_students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_students" ADD CONSTRAINT "school_students_bound_user_id_fkey" FOREIGN KEY ("bound_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_roster_batches" ADD CONSTRAINT "school_roster_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_verification_events" ADD CONSTRAINT "student_verification_events_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "student_verification_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

