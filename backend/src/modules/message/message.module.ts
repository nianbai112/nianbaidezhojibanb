import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { RedisModule } from '../../common/modules/redis.module';

@Module({
  imports: [WebsocketModule, RedisModule],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
