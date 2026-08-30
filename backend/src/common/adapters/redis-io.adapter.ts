import { INestApplicationContext, Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type Redis from "ioredis";
import type { Server, ServerOptions } from "socket.io";
import { RedisService } from "../services/redis.service";
import { SocketIoRedisStateService } from "../services/socket-io-redis-state.service";

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient?: Redis;
  private subClient?: Redis;
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisService,
    private readonly state: SocketIoRedisStateService,
  ) {
    super(app);
  }

  async connectToRedis() {
    this.pubClient = this.redis.getClient().duplicate();
    this.subClient = this.redis.getClient().duplicate();
    this.state.bindClients(this.pubClient, this.subClient);
    await Promise.all([
      this.waitForReady(this.pubClient),
      this.waitForReady(this.subClient),
    ]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient, {
      key: "lm:socket.io",
      publishOnSpecificResponseChannel: true,
    });
    this.logger.log("Socket.IO Redis adapter ready");
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    if (!this.adapterConstructor) {
      throw new Error("Socket.IO Redis adapter is not connected");
    }
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapterConstructor);
    this.state.markApplied();
    return server;
  }

  ensureApplied(target: Server | { server?: Server }) {
    if (this.state.getStatus().applied) return;
    if (!this.adapterConstructor) {
      throw new Error("Socket.IO Redis adapter is not connected");
    }
    const server =
      typeof (target as Server)?.adapter === "function"
        ? (target as Server)
        : (target as { server?: Server })?.server;
    if (!server || typeof server.adapter !== "function") {
      throw new Error("Socket.IO server is unavailable");
    }
    server.adapter(this.adapterConstructor);
    this.state.markApplied();
    this.logger.log("Socket.IO Redis adapter applied to existing server");
  }

  async close(server: Server) {
    try {
      await super.close(server);
    } finally {
      this.pubClient?.disconnect();
      this.subClient?.disconnect();
      this.pubClient = undefined;
      this.subClient = undefined;
      this.adapterConstructor = undefined;
      this.state.clear();
    }
  }

  private async waitForReady(client: Redis) {
    if (client.status === "ready") return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Redis adapter connection timed out"));
      }, 10_000);
      timeout.unref?.();
      const cleanup = () => {
        clearTimeout(timeout);
        client.off("ready", onReady);
        client.off("error", onError);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      client.once("ready", onReady);
      client.once("error", onError);
      if (client.status === "wait" || client.status === "end") {
        void client.connect().catch(onError);
      }
    });
  }
}
