import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(file, "utf8");

describe("service process boundaries", () => {
  it("runs schedules only in the worker process", () => {
    const apiModule = read(path.join(__dirname, "app.module.ts"));
    const workerModule = read(path.join(__dirname, "worker.module.ts"));

    expect(apiModule).not.toContain("ScheduleModule.forRoot()");
    expect(workerModule).toContain("ScheduleModule.forRoot()");
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

    expect(ecosystem).toContain("'dist/src/main.js'");
    expect(ecosystem).toContain("'dist/src/worker.js'");
    expect(ecosystem).toContain("'dist/src/realtime.js'");
  });
});
