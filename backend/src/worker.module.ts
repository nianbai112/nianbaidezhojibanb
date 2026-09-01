import "./config/bootstrap-env";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { getEnvFilePaths } from "./config/env-loader";
import { validate } from "./config/env.validation";
import { LoggerModule } from "./common/modules/logger.module";
import { PrismaModule } from "./common/modules/prisma.module";
import { RedisModule } from "./common/modules/redis.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { ErrandModule } from "./modules/errand/errand.module";
import { NotifyModule } from "./modules/notify/notify.module";
import { PrintModule } from "./modules/print/print.module";
import { SchedulerModule } from "./modules/scheduler/scheduler.module";
import { ShopModule } from "./modules/shop/shop.module";
import { WorkerHeartbeatService } from "./worker-heartbeat.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFilePaths(),
      validate,
    }),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get("JWT_SECRET"),
        signOptions: {
          expiresIn: config.get("JWT_ACCESS_EXPIRES_IN") || "2h",
        },
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    LoggerModule,
    AnalyticsModule,
    NotifyModule,
    PrintModule,
    ShopModule,
    ErrandModule,
    SchedulerModule,
  ],
  providers: [WorkerHeartbeatService],
})
export class WorkerModule {}
