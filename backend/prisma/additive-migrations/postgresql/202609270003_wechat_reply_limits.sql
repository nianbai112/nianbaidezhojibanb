-- PostgreSQL TEXT already supports replies without an application character cap.
ALTER TABLE "wechat_chat_replies" ALTER COLUMN "text" TYPE TEXT;
