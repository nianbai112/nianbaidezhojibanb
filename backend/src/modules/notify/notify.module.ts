import { Module } from '@nestjs/common';
import { NotifyService } from './notify.service';
import { NotifyController } from './notify.controller';
import { NotifyAdminController } from './notify.admin.controller';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  controllers: [NotifyController, NotifyAdminController],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
