import { ServiceHeartbeatStore } from "./service-heartbeat.store";

describe("ServiceHeartbeatStore", () => {
  afterEach(() => jest.restoreAllMocks());

  it("publishes a per-instance heartbeat and the rollout compatibility key", async () => {
    const redis = {
      hset: jest.fn().mockResolvedValue(undefined),
      expire: jest.fn().mockResolvedValue(undefined),
      setJson: jest.fn().mockResolvedValue(undefined),
    } as any;
    const store = new ServiceHeartbeatStore(redis);
    const heartbeat = {
      mode: "runtime",
      ready: true,
      updatedAt: "2026-08-30T08:00:00.000Z",
    };

    await store.publish("worker", "worker-1", heartbeat);

    expect(redis.hset).toHaveBeenCalledWith(
      "lm:service:worker:heartbeats",
      "worker-1",
      JSON.stringify({
        ...heartbeat,
        service: "worker",
        instanceId: "worker-1",
      }),
    );
    expect(redis.setJson).toHaveBeenCalledWith(
      "lm:service:worker:heartbeat",
      expect.objectContaining({ instanceId: "worker-1" }),
      45,
    );
  });

  it("keeps recently missed instances visible and removes obsolete entries", async () => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2026-08-30T08:05:00.000Z"));
    const redis = {
      hgetall: jest.fn().mockResolvedValue({
        fresh: JSON.stringify({
          mode: "runtime",
          ready: true,
          updatedAt: "2026-08-30T08:04:50.000Z",
        }),
        missed: JSON.stringify({
          mode: "runtime",
          ready: true,
          updatedAt: "2026-08-30T08:04:00.000Z",
        }),
        obsolete: JSON.stringify({
          mode: "runtime",
          ready: true,
          updatedAt: "2026-08-30T07:59:00.000Z",
        }),
      }),
      hdel: jest.fn().mockResolvedValue(undefined),
      getJson: jest.fn(),
    } as any;
    const store = new ServiceHeartbeatStore(redis);

    await expect(store.list("realtime")).resolves.toEqual([
      expect.objectContaining({ instanceId: "fresh" }),
      expect.objectContaining({ instanceId: "missed" }),
    ]);
    expect(redis.hdel).toHaveBeenCalledWith(
      "lm:service:realtime:heartbeats",
      "obsolete",
    );
    expect(redis.getJson).not.toHaveBeenCalled();
  });

  it("removes the compatibility heartbeat only when it belongs to the stopping instance", async () => {
    const redis = {
      hdel: jest.fn().mockResolvedValue(undefined),
      getJson: jest.fn().mockResolvedValue({ instanceId: "worker-1" }),
      del: jest.fn().mockResolvedValue(undefined),
    } as any;
    const store = new ServiceHeartbeatStore(redis);

    await store.remove("worker", "worker-1");

    expect(redis.hdel).toHaveBeenCalledWith(
      "lm:service:worker:heartbeats",
      "worker-1",
    );
    expect(redis.del).toHaveBeenCalledWith("lm:service:worker:heartbeat");
  });
});
