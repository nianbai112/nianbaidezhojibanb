import { Module } from '@nestjs/common';
import { SecondHandAdminController } from './second-hand.admin.controller';
import { SecondHandAdminService } from './second-hand.admin.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  controllers: [SecondHandAdminController],
  providers: [SecondHandAdminService],
  exports: [SecondHandAdminService],
})
export class SecondHandModule {}
