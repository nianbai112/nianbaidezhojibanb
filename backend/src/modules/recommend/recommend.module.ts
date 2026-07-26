import { Module } from '@nestjs/common';
import { RecommendController } from './recommend.controller';
import { RecommendService } from './recommend.service';
import { PrismaModule } from '../../common/modules/prisma.module';
import { RedisModule } from '../../common/modules/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [RecommendController],
  providers: [RecommendService],
  exports: [RecommendService],
})
export class RecommendModule {}
