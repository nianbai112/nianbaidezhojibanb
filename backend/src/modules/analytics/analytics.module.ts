import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { PrismaModule } from "../../common/modules/prisma.module";
import { RiderAiAdvisoryService } from "./rider-ai-advisory.service";
import { RiderLearningStore } from "./rider-learning-store";
import { RedisModule } from "../../common/modules/redis.module";

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RiderAiAdvisoryService, RiderLearningStore],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
