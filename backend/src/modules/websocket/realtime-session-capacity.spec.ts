import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("realtime session capacity schema", () => {
  const backendRoot = resolve(__dirname, "../../..");
  const read = (relativePath: string) =>
    readFileSync(resolve(backendRoot, relativePath), "utf8");

  it.each([
    "prisma/schema.prisma",
    "prisma/schema.mysql.prisma",
    "prisma/schema.postgresql.prisma",
  ])("indexes socket-scoped heartbeat and disconnect updates: %s", (file) => {
    const schema = read(file);
    const model =
      schema.match(/model RealtimeSession \{[\s\S]*?\n}/)?.[0] || "";
    expect(model).toContain("@@index([socketId, online])");
  });

  it("ships the MySQL additive index migration", () => {
    expect(
      read(
        "prisma/additive-migrations/mysql/202608300001_realtime_session_capacity.sql",
      ),
    ).toContain("ON `realtime_sessions`(`socketId`, `online`)");
  });

  it.each([
    "prisma/migrations/202608300001_realtime_session_capacity/migration.sql",
    "prisma/additive-migrations/postgresql/202608300001_realtime_session_capacity.sql",
  ])("ships the PostgreSQL index migration: %s", (file) => {
    expect(read(file)).toContain(
      'ON "realtime_sessions"("socketId", "online")',
    );
  });
});
