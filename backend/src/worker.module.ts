import { AcademicWorker } from './modules/academic/academic.worker';
import { AcademicModule } from './modules/academic/academic.module';
import "./config/bootstrap-env";
import { WechatChatWorker } from './modules/wechat-chat/wechat-chat.worker';
import { WechatChatModule } from './modules/wechat-chat/wechat-chat.module';
import { WechatBroadcastModule } from './modules/wechat-broadcast/wechat-broadcast.module';
import { WechatBroadcastWorker } from './modules/wechat-broadcast/wechat-broadcast.worker';
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
import { PurchaseModule } from "./modules/errand-purchase/purchase.module";
import { NotifyModule } from "./modules/notify/notify.module";
import { PrintModule } from "./modules/print/print.module";
import { SchedulerModule } from "./modules/scheduler/scheduler.module";
import { ShopModule } from "./modules/shop/shop.module";
import { WorkerHeartbeatService } from "./worker-heartbeat.service";
import { WelfareModule } from "./modules/welfare/welfare.module";
import { WelfareWorker } from "./modules/welfare/welfare.worker";
import { WechatMomentsModule } from "./modules/wechat-moments/wechat-moments.module";
import { WechatMomentsWorker } from "./modules/wechat-moments/wechat-moments.worker";
import { AppleLifecycleModule } from './modules/auth/apple-lifecycle.module';
import { AppleRevocationWorker } from './modules/auth/apple-revocation.worker';

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
    PurchaseModule,
    SchedulerModule,
    WelfareModule,
    AcademicModule,
    WechatMomentsModule,
    WechatChatModule,
    WechatBroadcastModule,
    AppleLifecycleModule,
  ],
  providers: [AcademicWorker, WorkerHeartbeatService, WelfareWorker, WechatMomentsWorker, WechatChatWorker, WechatBroadcastWorker, AppleRevocationWorker],
})
export class WorkerModule {}
