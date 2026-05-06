import { Module } from '@nestjs/common';
import { MerchantAdminController } from './merchant.admin.controller';
import { MerchantService } from './merchant.service';
import { DistributorAdminController } from './distributor.admin.controller';
import { DistributorService } from './distributor.service';

@Module({
  controllers: [MerchantAdminController, DistributorAdminController],
  providers: [MerchantService, DistributorService],
  exports: [MerchantService, DistributorService],
})
export class MerchantModule {}
