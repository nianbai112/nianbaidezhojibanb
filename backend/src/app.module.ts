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
import { RiderAppModule } from './modules/rider-app/rider-app.module';
import { FinanceModule } from './modules/finance/finance.module';
import { FinanceAdminModule } from './modules/finance-admin/finance-admin.module';
import { CouponAdminModule } from './modules/coupon-admin/coupon-admin.module';
import { DatingAdminModule } from './modules/dating-admin/dating-admin.module';
import { ErrandAdminModule } from './modules/errand-admin/errand-admin.module';
import { MessageModule } from './modules/message/message.module';
import { NotifyModule } from './modules/notify/notify.module';
import { WechatModule } from './modules/wechat/wechat.module';
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
import { OrderCenterModule } from './modules/order-center/order-center.module';
import { LayoutConfigModule } from './modules/layout-config/layout-config.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MarketingAdminModule } from './modules/marketing-admin/marketing-admin.module';
import { AiAdminModule } from './modules/ai-admin/ai-admin.module';
import { AiRuntimeModule } from './modules/ai-runtime/ai-runtime.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { RecommendModule } from './modules/recommend/recommend.module';
import { ABTestModule } from './modules/ab-test/ab-test.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SchoolModule } from './modules/school/school.module';
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
const uploadUserThrottleLimit = parseInt(process.env.UPLOAD_USER_THROTTLE_LIMIT || '180', 10);
const uploadBatchThrottleLimit = parseInt(process.env.UPLOAD_BATCH_THROTTLE_LIMIT || '30', 10);
const uploadVideoThrottleLimit = parseInt(process.env.UPLOAD_VIDEO_THROTTLE_LIMIT || '20', 10);
const uploadAdminImageThrottleLimit = parseInt(
  process.env.UPLOAD_ADMIN_IMAGE_THROTTLE_LIMIT || '180',
  10,
);
const uploadAdminVideoThrottleLimit = parseInt(
  process.env.UPLOAD_ADMIN_VIDEO_THROTTLE_LIMIT || '20',
  10,
);
const uploadQrcodeThrottleLimit = parseInt(process.env.UPLOAD_QRCODE_THROTTLE_LIMIT || '60', 10);

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
          {
            name: 'upload_user',
            ttl: throttleTtl * 1000,
            limit: uploadUserThrottleLimit,
          },
          {
            name: 'upload_user_batch',
            ttl: throttleTtl * 1000,
            limit: uploadBatchThrottleLimit,
          },
          {
            name: 'upload_video',
            ttl: throttleTtl * 1000,
            limit: uploadVideoThrottleLimit,
          },
          {
            name: 'upload_admin_image',
            ttl: throttleTtl * 1000,
            limit: uploadAdminImageThrottleLimit,
          },
          {
            name: 'upload_admin_video',
            ttl: throttleTtl * 1000,
            limit: uploadAdminVideoThrottleLimit,
          },
          {
            name: 'upload_qrcode',
            ttl: throttleTtl * 1000,
            limit: uploadQrcodeThrottleLimit,
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
    RiderAppModule,
    FinanceModule,
    FinanceAdminModule,
    CouponAdminModule,
    DatingAdminModule,
    ErrandAdminModule,
    PaymentModule,
    MessageModule,
    NotifyModule,
    WechatModule,
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
    OrderCenterModule,
    LayoutConfigModule,
    AnalyticsModule,
    MarketingAdminModule,
    AiRuntimeModule,
    AiAdminModule,
    TrackingModule,
    RecommendModule,
    ABTestModule,
    SchedulerModule,
    SchoolModule,
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
