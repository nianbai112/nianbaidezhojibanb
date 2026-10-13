import { Module } from "@nestjs/common";
import { PaymentModule } from "../payment/payment.module";
import { NotifyModule } from "../notify/notify.module";
import { RiderPayoutModule } from "../rider-payout/rider-payout.module";
import { PrintModule } from "../print/print.module";
import {
  PurchaseController,
  PurchaseAdminController,
} from "./purchase.controller";
import { PurchaseService } from "./purchase.service";
@Module({
  imports: [PaymentModule, NotifyModule, RiderPayoutModule, PrintModule],
  controllers: [PurchaseController, PurchaseAdminController],
  providers: [PurchaseService],
  exports: [PurchaseService],
})
export class PurchaseModule {}
