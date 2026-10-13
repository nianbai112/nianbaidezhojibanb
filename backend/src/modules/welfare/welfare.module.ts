import { WechatModule } from "../wechat/wechat.module";
import { WelfareWechatService } from "./welfare-wechat.service";
import { WelfareWecomService } from "./welfare-wecom.service";
import { WelfareWecomAdminController, WelfareWecomCallbackController } from "./welfare-wecom.controller";
import { Module } from "@nestjs/common";
import { MembershipModule } from "../membership/membership.module";
import {
  WelfareController,
  WelfareAdminController,
} from "./welfare.controller";
import { WelfareService } from "./welfare.service";
import { WelfareCheckinService } from "./welfare-checkin.service";
import { WelfareCheckinController, WelfareCheckinAdminController } from "./welfare-checkin.controller";

@Module({
  imports: [MembershipModule, WechatModule],
  controllers: [WelfareController, WelfareAdminController, WelfareCheckinController, WelfareCheckinAdminController, WelfareWecomAdminController, WelfareWecomCallbackController],
  providers: [WelfareService, WelfareWechatService, WelfareCheckinService, WelfareWecomService],
  exports: [WelfareService, WelfareWecomService],
})
export class WelfareModule {}
