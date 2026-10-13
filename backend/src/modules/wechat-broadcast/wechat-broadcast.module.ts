import { Module } from "@nestjs/common";
import { WechatMomentsModule } from "../wechat-moments/wechat-moments.module";
import { WechatBroadcastController } from "./wechat-broadcast.controller";
import { WechatBroadcastService } from "./wechat-broadcast.service";

/** Errand orders announced to one WeChat group per campus over the shared Moments connection. */
@Module({
  imports: [WechatMomentsModule],
  controllers: [WechatBroadcastController],
  providers: [WechatBroadcastService],
  exports: [WechatBroadcastService],
})
export class WechatBroadcastModule {}
