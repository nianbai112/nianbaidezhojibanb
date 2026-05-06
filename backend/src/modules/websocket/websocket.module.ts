import { Module } from '@nestjs/common';
import { MessageGateway } from './message.gateway';

@Module({
  providers: [MessageGateway],
  exports: [MessageGateway],
})
export class WebsocketModule {}
