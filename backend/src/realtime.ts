import "./config/bootstrap-env";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { LoggerService } from "./common/services/logger.service";
import { RedisService } from "./common/services/redis.service";
import { RedisIoAdapter } from "./common/adapters/redis-io.adapter";
import { SocketIoRedisStateService } from "./common/services/socket-io-redis-state.service";
import { resolveCorsOrigin, resolveListenHost } from "./config/setup-cors";
import { MessageGateway } from "./modules/websocket/message.gateway";
import { WsNativeGateway } from "./modules/websocket/ws-native.gateway";
import { RealtimeModule } from "./realtime.module";

async function bootstrap() {
  process.env.SERVICE_ROLE = "realtime";
  const app = await NestFactory.create(RealtimeModule, {
    bufferLogs: true,
  });
  app.enableShutdownHooks();
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  const isSetupWizard =
    String(process.env.DB_IS_INSTALLED || "").toLowerCase() !== "1" ||
    String(process.env.SETUP_WIZARD || "").toLowerCase() === "true";
  app.enableCors({
    origin: resolveCorsOrigin({
      nodeEnv: process.env.NODE_ENV,
      setupWizard: isSetupWizard,
      corsOrigin: process.env.CORS_ORIGIN,
    }),
    credentials: true,
  });

  let redisIoAdapter: RedisIoAdapter | undefined;
  if (!isSetupWizard) {
    redisIoAdapter = new RedisIoAdapter(
      app,
      app.get(RedisService),
      app.get(SocketIoRedisStateService),
    );
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);
  }

  const port = Number(process.env.REALTIME_PORT || 3001);
  const host = resolveListenHost({
    nodeEnv: process.env.NODE_ENV,
    host: process.env.REALTIME_HOST || process.env.HOST,
  });
  await app.listen(port, host);
  if (redisIoAdapter) {
    redisIoAdapter.ensureApplied(app.get(MessageGateway).server as any);
  }

  const wsNative = app.get(WsNativeGateway);
  wsNative.attach(app.getHttpServer());

  logger.log(`Realtime service running on: http://${host}:${port}`);
  logger.log(`Native WebSocket available at: ws://${host}:${port}/ws-native`);
  logger.log(`Socket.IO compatibility namespace: ws://${host}:${port}/ws`);
}

bootstrap().catch((error) => {
  new Logger("RealtimeBootstrap").error(
    `Realtime service failed to start: ${error?.message || error}`,
    error?.stack,
  );
  process.exit(1);
});
