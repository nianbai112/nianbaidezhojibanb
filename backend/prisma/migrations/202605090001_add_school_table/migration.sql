-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "type" TEXT NOT NULL DEFAULT 'university',
    "province" TEXT,
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(10,6),
    "longitude" DECIMAL(10,6),
    "campus_name" TEXT,
    "logo" TEXT,
    "cover" TEXT,
    "region_id" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schools_region_id_idx" ON "schools"("region_id");

-- CreateIndex
CREATE INDEX "schools_name_idx" ON "schools"("name");

-- CreateIndex
CREATE INDEX "schools_province_city_idx" ON "schools"("province", "city");

-- AlterTable: Add schoolId to student_verifies
ALTER TABLE "student_verifies" ADD COLUMN "school_id" TEXT;

-- CreateIndex
CREATE INDEX "student_verifies_school_id_idx" ON "student_verifies"("school_id");

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_verifies" ADD CONSTRAINT "student_verifies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert test data
INSERT INTO "schools" ("id", "name", "short_name", "type", "province", "city", "district", "address", "is_enabled", "sort_order", "created_at", "updated_at") VALUES
('school_test_001', '测试大学', '测大', 'university', '广东省', '广州市', '天河区', '天河路1号', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('school_test_002', '测试职业学院', '测职院', 'college', '广东省', '广州市', '白云区', '白云大道2号', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('school_test_003', '测试中学', '测中', 'highschool', '广东省', '广州市', '越秀区', '中山路3号', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
