// 两个 WebSocket 网关（socket.io 与原生 ws）共用的消息防护常量
export const MAX_MESSAGE_LENGTH = 5000; // 单条消息最大字符数
export const RATE_LIMIT_WINDOW_SEC = 10; // 限流窗口（秒）
export const RATE_LIMIT_MAX_MESSAGES = 10; // 窗口内最大消息数
export const RATE_LIMIT_ADMIN_MAX = 30; // 管理员窗口内最大消息数
export const SENSITIVE_WORD_PATTERN =
  /(赌博|赌场|色情|裸聊|贷款|办证|刻章|发票|枪|毒|嫖)/i;
