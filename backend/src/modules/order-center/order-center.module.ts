import { Module } from '@nestjs/common';
import { OrderCenterController } from './order-center.controller';
import { OrderCenterService } from './order-center.service';
import { NotifyModule } from '../notify/notify.module';
import { ShopModule } from '../shop/shop.module';

@Module({
  imports: [NotifyModule, ShopModule],
  controllers: [OrderCenterController],
  providers: [OrderCenterService],
  exports: [OrderCenterService],
})
export class OrderCenterModule {}
