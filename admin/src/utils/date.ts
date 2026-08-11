/**
 * 日期范围工具函数
 * 解决前端 toISOString() 传给后端后日期范围筛选不准确的问题
 */

/**
 * 将日期格式化为 YYYY-MM-DD 格式（不含时间）
 * 用于后端日期范围筛选，避免时区问题
 */
export function toDateString(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化日期范围参数
 * 返回 { startDate, endDate } 格式，endDate 自动设置为当天结束
 */
export function formatDateRangeParams(dateRange: Date[] | null | undefined): {
  startDate?: string;
  endDate?: string;
} {
  if (!dateRange || dateRange.length !== 2) {
    return {};
  }

  const startDate = toDateString(dateRange[0]);
  const endDate = toDateString(dateRange[1]);

  return {
    startDate,
    endDate,
  };
}

/**
 * 格式化日期为 ISO 字符串（包含时间）
 * 用于需要精确时间的场景
 */
export function toISOString(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  return date.toISOString();
}

/**
 * 获取今天的开始时间
 */
export function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * 获取今天的结束时间
 */
export function getTodayEnd(): Date {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
}

/**
 * 获取最近 N 天的日期范围
 */
export function getRecentDays(days: number): [Date, Date] {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return [start, end];
}

/**
 * 解析后端返回的日期字符串
 */
export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}
