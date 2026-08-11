export type ApplyStatus = Record<string, any> | null;

export function reconcileApplyStatus(
  status: ApplyStatus,
  context: {
    now: number;
    staleAfterMs: number;
    runnerAlive: boolean | null;
    currentVersion: string;
    deployedVersion: string;
  },
): ApplyStatus {
  if (!status || String(status.status || "") !== "running") return status;

  const lastSeen = Date.parse(String(status.heartbeatAt || status.updatedAt || status.startedAt || ""));
  const stale = !Number.isFinite(lastSeen) || context.now - lastSeen >= context.staleAfterMs;
  if (context.runnerAlive === true && !stale) return status;
  if (context.runnerAlive === null && !stale) return status;

  const targetVersion = String(status.targetVersion || "");
  const targetInstalled = Boolean(targetVersion) && [context.currentVersion, context.deployedVersion].includes(targetVersion);
  const finishedAt = new Date(context.now).toISOString();
  return {
    ...status,
    status: targetInstalled ? "success" : "failed",
    message: targetInstalled
      ? "服务重启后已自动确认目标版本运行正常"
      : context.runnerAlive === true
        ? "更新任务心跳超时，已结束异常状态；可重新下载并更新"
        : "更新任务进程已中断，已结束异常状态；可重新下载并更新",
    step: "恢复更新状态",
    recovered: true,
    updatedAt: finishedAt,
    finishedAt,
  };
}
