import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { AiService } from './ai.service';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';

@Module({
  imports: [PrismaModule, AiRuntimeModule],
  controllers: [BotController],
  providers: [BotService, AiService],
  exports: [BotService, AiService],
})
export class BotModule {}
