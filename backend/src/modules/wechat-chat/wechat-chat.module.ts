import { Module } from "@nestjs/common";
import { AiRuntimeModule } from "../ai-runtime/ai-runtime.module";
import { WechatMomentsModule } from "../wechat-moments/wechat-moments.module";
import { WechatMomentsWebhookController } from "../wechat-moments/wechat-moments.webhook.controller";
import { WechatChatController } from "./wechat-chat.controller";
import { WechatChatService } from "./wechat-chat.service";

@Module({
  imports: [AiRuntimeModule, WechatMomentsModule],
  controllers: [WechatChatController, WechatMomentsWebhookController],
  providers: [WechatChatService],
  exports: [WechatChatService],
})
export class WechatChatModule {}
