import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../common/modules/prisma.module";
import { RedisModule } from "../../common/modules/redis.module";
import { SocketIoRedisStateService } from "../../common/services/socket-io-redis-state.service";
import { AiRuntimeModule } from "../ai-runtime/ai-runtime.module";
import { SystemConfigService } from "../system-config/system-config.service";
import { MessageGateway } from "./message.gateway";
import { RealtimeControlService } from "./realtime-control.service";
import { RealtimeHeartbeatService } from "./realtime-heartbeat.service";
import { WebsocketModule } from "./websocket.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    AiRuntimeModule,
    WebsocketModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get("JWT_SECRET"),
        signOptions: { expiresIn: config.get("JWT_EXPIRES_IN", "7d") },
      }),
    }),
  ],
  providers: [
    MessageGateway,
    RealtimeControlService,
    RealtimeHeartbeatService,
    SystemConfigService,
    SocketIoRedisStateService,
  ],
  exports: [
    MessageGateway,
    RealtimeControlService,
    SocketIoRedisStateService,
    WebsocketModule,
  ],
})
export class RealtimeGatewayModule {}
