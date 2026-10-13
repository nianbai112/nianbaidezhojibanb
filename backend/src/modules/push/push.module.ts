import { Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PushDeviceController } from './push-device.controller';

@Module({
  controllers: [PushDeviceController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
