import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { AiService } from './ai.service';
import { PrismaModule } from '../../common/modules/prisma.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';
import { AiAdminModule } from '../ai-admin/ai-admin.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [PrismaModule, AiRuntimeModule, AiAdminModule, WebsocketModule],
  controllers: [BotController],
  providers: [BotService, AiService],
  exports: [BotService, AiService],
})
export class BotModule {}
