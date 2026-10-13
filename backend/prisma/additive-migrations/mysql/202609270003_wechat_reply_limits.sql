-- Expand storage for replies with maxReplyChars = 0. Existing values are preserved.
ALTER TABLE `wechat_chat_replies` MODIFY COLUMN `text` LONGTEXT NULL;
