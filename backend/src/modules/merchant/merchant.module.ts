import { Module } from '@nestjs/common';
import { MerchantAdminController } from './merchant.admin.controller';
import { MerchantService } from './merchant.service';
import { DistributorAdminController } from './distributor.admin.controller';
import { DistributorService } from './distributor.service';
import { PrintModule } from '../print/print.module';

@Module({
  imports: [PrintModule],
  controllers: [MerchantAdminController, DistributorAdminController],
  providers: [MerchantService, DistributorService],
  exports: [MerchantService, DistributorService],
})
export class MerchantModule {}
