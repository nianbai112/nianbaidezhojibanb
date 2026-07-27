import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessageGateway } from './message.gateway';
import { WsNativeGateway } from './ws-native.gateway';
import { UserSessionRevocationService } from './user-session-revocation.service';
import { PrismaModule } from '../../common/modules/prisma.module';
import { RedisModule } from '../../common/modules/redis.module';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { PrivateMessagePermissionService } from '../../common/services/private-message-permission.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    SystemConfigModule,
  ],
  providers: [
    MessageGateway,
    UserSessionRevocationService,
    {
      provide: WsNativeGateway,
      useFactory: (
        jwtService: JwtService,
        config: ConfigService,
        prisma: PrismaService,
        redis: RedisService,
        privateMessagePermission: PrivateMessagePermissionService,
        userAccess: UserAccessPolicyService,
      ) => {
        return new WsNativeGateway(jwtService, config, prisma, redis, privateMessagePermission, userAccess);
      },
      inject: [JwtService, ConfigService, PrismaService, RedisService, PrivateMessagePermissionService, UserAccessPolicyService],
    },
  ],
  exports: [MessageGateway, WsNativeGateway, UserSessionRevocationService],
})
export class WebsocketModule {}
