-- PERF-P0-02: 补齐 region_riders 索引，消除派单推送/接单大厅的全表扫描。
CREATE INDEX IF NOT EXISTS "region_riders_regionId_status_verifyStatus_idx"
  ON "region_riders" ("regionId", "status", "verifyStatus");
CREATE INDEX IF NOT EXISTS "region_riders_status_idx"
  ON "region_riders" ("status");
