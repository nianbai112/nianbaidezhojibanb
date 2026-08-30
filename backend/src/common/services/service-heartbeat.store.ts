import { Injectable } from "@nestjs/common";
import { RedisService } from "./redis.service";

export type ServiceHeartbeat = {
  service?: string;
  instanceId?: string;
  mode?: string;
  ready?: boolean;
  updatedAt?: string;
  [key: string]: unknown;
};

const HEARTBEAT_TTL_SECONDS = 45;
const REGISTRY_TTL_SECONDS = 24 * 60 * 60;
const STALE_INSTANCE_RETENTION_MS = 5 * 60 * 1000;

@Injectable()
export class ServiceHeartbeatStore {
  constructor(private readonly redis: RedisService) {}

  async publish(
    service: "worker" | "realtime",
    instanceId: string,
    heartbeat: ServiceHeartbeat,
  ) {
    const payload = { ...heartbeat, service, instanceId };
    const registryKey = this.registryKey(service);
    await this.redis.hset(registryKey, instanceId, JSON.stringify(payload));
    await Promise.all([
      this.redis.expire(registryKey, REGISTRY_TTL_SECONDS),
      // Keep the original key for older operational pages during rollout.
      this.redis.setJson(
        this.legacyKey(service),
        payload,
        HEARTBEAT_TTL_SECONDS,
      ),
    ]);
  }

  async remove(service: "worker" | "realtime", instanceId: string) {
    await this.redis
      .hdel(this.registryKey(service), instanceId)
      .catch(() => undefined);
    const legacyKey = this.legacyKey(service);
    const legacy = await this.redis
      .getJson<ServiceHeartbeat>(legacyKey)
      .catch(() => null);
    if (legacy?.instanceId === instanceId) {
      await this.redis.del(legacyKey).catch(() => undefined);
    }
  }

  async list(service: "worker" | "realtime") {
    const registryKey = this.registryKey(service);
    const rawEntries = await this.redis.hgetall(registryKey);
    const now = Date.now();
    const heartbeats: ServiceHeartbeat[] = [];
    const staleIds: string[] = [];

    for (const [instanceId, raw] of Object.entries(rawEntries)) {
      try {
        const heartbeat = JSON.parse(raw) as ServiceHeartbeat;
        const updatedAt = Date.parse(String(heartbeat.updatedAt || ""));
        if (
          !Number.isFinite(updatedAt) ||
          now - updatedAt > STALE_INSTANCE_RETENTION_MS
        ) {
          staleIds.push(instanceId);
          continue;
        }
        heartbeats.push({ ...heartbeat, service, instanceId });
      } catch {
        staleIds.push(instanceId);
      }
    }

    await Promise.all(
      staleIds.map((instanceId) =>
        this.redis.hdel(registryKey, instanceId).catch(() => undefined),
      ),
    );
    if (heartbeats.length > 0) return heartbeats;

    const legacy = await this.redis.getJson<ServiceHeartbeat>(
      this.legacyKey(service),
    );
    return legacy ? [legacy] : [];
  }

  private legacyKey(service: "worker" | "realtime") {
    return `lm:service:${service}:heartbeat`;
  }

  private registryKey(service: "worker" | "realtime") {
    return `lm:service:${service}:heartbeats`;
  }
}
