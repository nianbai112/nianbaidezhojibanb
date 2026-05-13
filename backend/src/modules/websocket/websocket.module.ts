import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessageGateway } from './message.gateway';
import { WsNativeGateway } from './ws-native.gateway';
import { PrismaModule } from '../../common/modules/prisma.module';
import { RedisModule } from '../../common/modules/redis.module';
import { PrismaService } from '../../common/services/prisma.service';

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
  ],
  providers: [
    MessageGateway,
    {
      provide: WsNativeGateway,
      useFactory: (jwtService: JwtService, config: ConfigService, prisma: PrismaService) => {
        return new WsNativeGateway(jwtService, config, prisma);
      },
      inject: [JwtService, ConfigService, PrismaService],
    },
  ],
  exports: [MessageGateway, WsNativeGateway],
})
export class WebsocketModule {}
