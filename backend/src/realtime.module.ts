import "./config/bootstrap-env";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { getEnvFilePaths } from "./config/env-loader";
import { validate } from "./config/env.validation";
import { LoggerModule } from "./common/modules/logger.module";
import { PrismaModule } from "./common/modules/prisma.module";
import { RedisModule } from "./common/modules/redis.module";
import { RealtimeGatewayModule } from "./modules/websocket/realtime-gateway.module";
import { RealtimeHealthController } from "./realtime-health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFilePaths(),
      validate,
    }),
    PrismaModule,
    RedisModule,
    LoggerModule,
    RealtimeGatewayModule,
  ],
  controllers: [RealtimeHealthController],
})
export class RealtimeModule {}
