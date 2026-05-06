import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { AiService } from './ai.service';
import { PrismaModule } from '../../common/modules/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BotController],
  providers: [BotService, AiService],
  exports: [BotService, AiService],
})
export class BotModule {}
