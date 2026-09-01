ALTER TABLE "wechat_message_logs"
ADD COLUMN "wechatMsgId" TEXT;

CREATE UNIQUE INDEX "wechat_message_logs_wechatMsgId_key"
ON "wechat_message_logs"("wechatMsgId");
