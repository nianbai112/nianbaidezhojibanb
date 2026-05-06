import { Module, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { validate } from './config/env.validation';
import { PrismaModule } from './common/modules/prisma.module';
import { RedisModule } from './common/modules/redis.module';
import { LoggerModule } from './common/modules/logger.module';
import { RedisService } from './common/services/redis.service';
import { ThrottlerRedisStorage } from './common/services/throttler-redis.storage';
import { UploadModule } from './modules/upload/upload.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { RegionModule } from './modules/region/region.module';
import { PostModule } from './modules/post/post.module';
import { CommentModule } from './modules/comment/comment.module';
import { CircleModule } from './modules/circle/circle.module';
import { ShopModule } from './modules/shop/shop.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { ErrandModule } from './modules/errand/errand.module';
import { FinanceModule } from './modules/finance/finance.module';
import { FinanceAdminModule } from './modules/finance-admin/finance-admin.module';
import { CouponAdminModule } from './modules/coupon-admin/coupon-admin.module';
import { DatingAdminModule } from './modules/dating-admin/dating-admin.module';
import { ErrandAdminModule } from './modules/errand-admin/errand-admin.module';
import { MessageModule } from './modules/message/message.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OperationModule } from './modules/operation/operation.module';
import { AdminModule } from './modules/admin/admin.module';
import { PaymentModule } from './modules/payment/payment.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { AddressModule } from './modules/address/address.module';
import { ActivityModule } from './modules/activity/activity.module';
import { TopupModule } from './modules/topup/topup.module';
import { MallModule } from './modules/mall/mall.module';
import { AuditModule } from './modules/audit/audit.module';
import { BotModule } from './modules/bot/bot.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { OpsModule } from './modules/ops/ops.module';
import { SetupModule } from './modules/setup/setup.module';
import { HealthModule } from './modules/health/health.module';
import { GroupBuyModule } from './modules/group-buy/group-buy.module';
import { MiniappModule } from './modules/miniapp/miniapp.module';
import { ContentExtModule } from './modules/content-ext/content-ext.module';
import { PhotoContestModule } from './modules/photo-contest/photo-contest.module';
import { PunchInModule } from './modules/punch-in/punch-in.module';
import { ShareModule } from './modules/share/share.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { RatingModule } from './modules/rating/rating.module';
import { SecondHandModule } from './modules/second-hand/second-hand.module';
import { NetDiskModule } from './modules/netdisk/netdisk.module';
import { UserAdminModule } from './modules/user-admin/user-admin.module';
import { SystemAdminModule } from './modules/system-admin/system-admin.module';
import { RequestLogInterceptor } from './interceptors/request-log.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

// ---------------------------------------------------------------------------
// Rate limiting configs
// - 'default': general API traffic (100 req / 60s window)
// - 'auth':    login / token endpoints (5 req / 60s per IP — brute-force protection)
// ---------------------------------------------------------------------------
const throttleTtl = parseInt(process.env.THROTTLE_TTL || '60', 10);
const throttleLimit = parseInt(process.env.THROTTLE_LIMIT || '100', 10);
const authThrottleLimit = parseInt(
  process.env.AUTH_THROTTLE_LIMIT || '5',
  10,
);
const adminAuthThrottleLimit = parseInt(
  process.env.ADMIN_AUTH_THROTTLE_LIMIT || '30',
  10,
);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate,
    }),
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        storage: new ThrottlerRedisStorage(redisService),
        throttlers: [
          {
            name: 'auth',
            ttl: throttleTtl * 1000,
            limit: authThrottleLimit,
          },
          {
            name: 'admin_auth',
            ttl: throttleTtl * 1000,
            limit: adminAuthThrottleLimit,
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    LoggerModule,
    UploadModule,
    AuthModule,
    UserModule,
    RegionModule,
    PostModule,
    CommentModule,
    CircleModule,
    ShopModule,
    DeliveryModule,
    ErrandModule,
    FinanceModule,
    FinanceAdminModule,
    CouponAdminModule,
    DatingAdminModule,
    ErrandAdminModule,
    PaymentModule,
    MessageModule,
    NotificationModule,
    OperationModule,
    AdminModule,
    AddressModule,
    ActivityModule,
    TopupModule,
    MallModule,
    WebsocketModule,
    AuditModule,
    BotModule,
    SystemConfigModule,
    OpsModule,
    SetupModule,
    HealthModule,
    GroupBuyModule,
    MiniappModule,
    ContentExtModule,
    PhotoContestModule,
    PunchInModule,
    ShareModule,
    MerchantModule,
    RatingModule,
    SecondHandModule,
    NetDiskModule,
    UserAdminModule,
    SystemAdminModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLogInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

  ],
})
export class AppModule {}
