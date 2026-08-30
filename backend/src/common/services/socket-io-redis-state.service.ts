import { Injectable } from "@nestjs/common";
import type Redis from "ioredis";

@Injectable()
export class SocketIoRedisStateService {
  private pubClient?: Redis;
  private subClient?: Redis;
  private applied = false;

  bindClients(pubClient: Redis, subClient: Redis) {
    this.pubClient = pubClient;
    this.subClient = subClient;
  }

  markApplied() {
    this.applied = true;
  }

  clear() {
    this.pubClient = undefined;
    this.subClient = undefined;
    this.applied = false;
  }

  isReady() {
    return this.getStatus().ready;
  }

  getStatus() {
    const pubClient = this.pubClient?.status || "missing";
    const subClient = this.subClient?.status || "missing";
    return {
      ready: this.applied && pubClient === "ready" && subClient === "ready",
      applied: this.applied,
      pubClient,
      subClient,
    };
  }
}
