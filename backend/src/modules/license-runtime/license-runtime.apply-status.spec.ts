import { reconcileApplyStatus } from "./license-runtime.apply-status";

const base = {
  status: "running",
  targetVersion: "1.0.36",
  updatedAt: "2026-07-20T00:00:00.000Z",
};
const context = {
  now: Date.parse("2026-07-20T00:10:00.000Z"),
  staleAfterMs: 120_000,
  currentVersion: "1.0.35",
  deployedVersion: "1.0.35",
};

describe("reconcileApplyStatus", () => {
  it("keeps a live task with a fresh heartbeat", () => {
    expect(reconcileApplyStatus({ ...base, heartbeatAt: "2026-07-20T00:09:30.000Z" }, { ...context, runnerAlive: true })?.status).toBe("running");
  });

  it("recovers success after restart when the target version is active", () => {
    const result = reconcileApplyStatus(base, { ...context, runnerAlive: false, currentVersion: "1.0.36" });
    expect(result).toMatchObject({ status: "success", recovered: true });
  });

  it("ends an orphaned legacy task instead of keeping it forever", () => {
    const result = reconcileApplyStatus(base, { ...context, runnerAlive: null });
    expect(result).toMatchObject({ status: "failed", recovered: true });
  });

  it("ends a hung task with an expired heartbeat", () => {
    const result = reconcileApplyStatus(base, { ...context, runnerAlive: true });
    expect(result).toMatchObject({ status: "failed", recovered: true });
  });

  it("keeps the recovered terminal result stable across repeated detection", () => {
    const recovered = reconcileApplyStatus(base, { ...context, runnerAlive: false, currentVersion: "1.0.36" });
    expect(reconcileApplyStatus(recovered, { ...context, runnerAlive: null })).toEqual(recovered);
  });
});
