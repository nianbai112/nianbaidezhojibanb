ALTER TABLE "wechat_message_logs"
ADD COLUMN IF NOT EXISTS "wechatMsgId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "wechat_message_logs_wechatMsgId_key"
ON "wechat_message_logs"("wechatMsgId");
