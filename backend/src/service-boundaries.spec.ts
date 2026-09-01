import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(file, "utf8");

describe("service process boundaries", () => {
  it("runs schedules only in the worker process", () => {
    const apiModule = read(path.join(__dirname, "app.module.ts"));
    const workerModule = read(path.join(__dirname, "worker.module.ts"));

    expect(apiModule).not.toContain("ScheduleModule.forRoot()");
    expect(workerModule).toContain("ScheduleModule.forRoot()");
    expect(workerModule).not.toContain("AuthModule");
  });

  it("attaches native WebSocket only in the realtime process", () => {
    const apiMain = read(path.join(__dirname, "main.ts"));
    const realtimeMain = read(path.join(__dirname, "realtime.ts"));

    expect(apiMain).not.toContain("wsNative.attach(");
    expect(realtimeMain).toContain("wsNative.attach(");
  });

  it("declares API, Worker, and Realtime as independent PM2 apps", () => {
    const ecosystem = read(
      path.resolve(__dirname, "../../deploy/ecosystem.config.cjs"),
    );

    expect(ecosystem).toContain("dist/src/main.js");
    expect(ecosystem).toContain("dist/src/worker.js");
    expect(ecosystem).toContain("dist/src/realtime.js");
    expect(ecosystem).toContain("process.env.REALTIME_INSTANCES");
    expect(ecosystem).toContain('realtimeInstances > 1 ? "cluster" : "fork"');
  });

  it("preserves the /api prefix for mall user routes before the legacy API proxy", () => {
    for (const file of ["portal-site.conf.sample", "admin-site.conf.sample"]) {
      const nginx = read(
        path.resolve(__dirname, `../../deploy/nginx/${file}`),
      );
      const mallLocation = nginx.indexOf("\n    location ^~ /api/mall/ {");
      const legacyApiLocation = nginx.indexOf("\n    location /api/ {");

      expect(mallLocation).toBeGreaterThan(-1);
      expect(legacyApiLocation).toBeGreaterThan(mallLocation);
      expect(
        nginx.slice(mallLocation, legacyApiLocation),
      ).toContain("proxy_pass http://127.0.0.1:3000;");
    }
  });

  it("waits for database migration before starting Docker services", () => {
    const compose = read(path.resolve(__dirname, "../docker-compose.yml"));

    expect(
      compose.match(/condition: service_completed_successfully/g),
    ).toHaveLength(3);
    expect(compose).not.toContain("profiles:\n      - manual");
    expect(compose).not.toContain("container_name: lingmeng-realtime");
  });
});
