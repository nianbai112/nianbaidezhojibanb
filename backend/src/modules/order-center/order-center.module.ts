import { Module } from '@nestjs/common';
import { OrderCenterController } from './order-center.controller';
import { OrderCenterService } from './order-center.service';

@Module({
  controllers: [OrderCenterController],
  providers: [OrderCenterService],
  exports: [OrderCenterService],
})
export class OrderCenterModule {}
