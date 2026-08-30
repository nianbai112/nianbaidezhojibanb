import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("campus map active session guard migrations", () => {
  const backendRoot = resolve(__dirname, "../../..");
  const read = (relativePath: string) =>
    readFileSync(resolve(backendRoot, relativePath), "utf8");

  it.each([
    "prisma/migrations/202608260002_campus_map_active_session_guard/migration.sql",
    "prisma/additive-migrations/postgresql/202608260002_campus_map_active_session_guard.sql",
  ])("backfills and uniquely constrains PostgreSQL active session leases: %s", (file) => {
    const sql = read(file);
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "activeKey" TEXT');
    expect(sql).toContain("ROW_NUMBER() OVER");
    expect(sql).toContain("'recording', 'paused', 'uploading', 'finishing'");
    expect(sql).toContain("ELSE 'abandoned'");
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "campus_map_collection_sessions_activeKey_key"');
  });

  it("backfills and uniquely constrains MySQL active session leases idempotently", () => {
    const sql = read(
      "prisma/additive-migrations/mysql/202608260002_campus_map_active_session_guard.sql",
    );
    expect(sql).toContain("column_name = 'activeKey'");
    expect(sql).toContain("ROW_NUMBER() OVER");
    expect(sql).toContain("AS row_rank");
    expect(sql).toContain("ranked.row_rank = 1");
    expect(sql).not.toContain("AS row_number");
    expect(sql).toContain("'recording', 'paused', 'uploading', 'finishing'");
    expect(sql).toContain("ELSE 'abandoned'");
    expect(sql).toContain("information_schema.statistics");
    expect(sql).toContain("CREATE UNIQUE INDEX `campus_map_collection_sessions_activeKey_key`");
  });

  it.each([
    "prisma/migrations/202608260003_campus_map_runtime_safety/migration.sql",
    "prisma/additive-migrations/postgresql/202608260003_campus_map_runtime_safety.sql",
  ])("releases PostgreSQL leases owned by terminal task states: %s", (file) => {
    const sql = read(file);
    expect(sql).toContain('FROM "campus_map_collection_tasks" AS task_row');
    expect(sql).toContain("task_row.\"status\" NOT IN ('ready', 'collecting')");
    expect(sql).toContain('"activeKey" = NULL');
    expect(sql).toContain('"status" = \'abandoned\'');
  });

  it("releases MySQL leases owned by terminal task states", () => {
    const sql = read(
      "prisma/additive-migrations/mysql/202608260003_campus_map_runtime_safety.sql",
    );
    expect(sql).toContain("JOIN `campus_map_collection_tasks` AS task_row");
    expect(sql).toContain("task_row.`status` NOT IN ('ready', 'collecting')");
    expect(sql).toContain("session_row.`activeKey` = NULL");
    expect(sql).toContain("session_row.`status` = 'abandoned'");
  });
});
