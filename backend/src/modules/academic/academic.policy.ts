import { BadRequestException } from "@nestjs/common";

export const DAY = 86400000;
export const ZONE = "Asia/Shanghai";
export function text(value: unknown, label: string, max = 80): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new BadRequestException(`${label}必填，且不能超过${max}字`);
  return value.trim();
}
export function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new BadRequestException(`${label}须为${min}至${max}的整数`);
  return value;
}
export function date(value: unknown): string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException("日期须为 YYYY-MM-DD");
  const n = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value)
    throw new BadRequestException("日期无效");
  return value;
}
export function addDays(value: string, days: number): string {
  return new Date(Date.parse(date(value)) + days * DAY)
    .toISOString()
    .slice(0, 10);
}
export function weekOf(monday: string, value: string): number {
  return (
    Math.floor((Date.parse(date(value)) - Date.parse(date(monday))) / DAY / 7) +
    1
  );
}
export function localDate(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
export function clock(value: unknown): string {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new BadRequestException("时间须为 HH:mm");
  return value;
}
export function termInput(body: any) {
  const monday = date(body.monday),
    startDate = date(body.startDate),
    endDate = date(body.endDate);
  if (new Date(monday).getUTCDay() !== 1)
    throw new BadRequestException("第 1 教学周起点必须是周一");
  if (
    startDate < monday ||
    startDate > addDays(monday, 6) ||
    endDate < startDate ||
    weekOf(monday, endDate) > 54
  )
    throw new BadRequestException(
      "教学起始日期须在第 1 周内，学期长度不能超过 54 周",
    );
  const rawSlots = body.slots ?? [];
  if (!Array.isArray(rawSlots) || rawSlots.length > 24)
    throw new BadRequestException("每天最多设置 24 个节次");
  const slots = rawSlots.map((s: any) => {
    const startTime = clock(s.startTime),
      endTime = clock(s.endTime);
    if (startTime >= endTime)
      throw new BadRequestException("节次结束时间必须晚于开始时间");
    return { name: text(s.name, "节次名称", 20), startTime, endTime };
  });
  if (new Set(slots.map((s) => s.name)).size !== slots.length)
    throw new BadRequestException("节次名称不能重复");
  const sorted = [...slots].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i].startTime < sorted[i - 1].endTime)
      throw new BadRequestException("作息节次不能重叠");
  return {
    name: text(body.name, "学期名称"),
    monday,
    startDate,
    endDate,
    slots: sorted,
  };
}
export function ruleInput(body: any, term: any) {
  const startTime = clock(body.startTime),
    endTime = clock(body.endTime);
  if (startTime >= endTime)
    throw new BadRequestException("结束时间必须晚于开始时间，不支持跨夜课程");
  if (
    !Array.isArray(body.weeks) ||
    !body.weeks.length ||
    body.weeks.length > 54
  )
    throw new BadRequestException("请选择上课周次");
  const weeks = [
    ...new Set<number>(
      body.weeks.map((w: unknown) =>
        integer(w, "周次", 1, weekOf(term.monday, term.endDate)),
      ),
    ),
  ].sort((a, b) => a - b);
  if (
    !Array.isArray(body.classIds) ||
    !body.classIds.length ||
    body.classIds.length > 30
  )
    throw new BadRequestException("请选择 1 至 30 个班级");
  const classIds = [
    ...new Set<string>(body.classIds.map((id: unknown) => text(id, "班级 ID"))),
  ];
  return {
    courseName: text(body.courseName, "课程名称"),
    teacherId: text(body.teacherId, "老师"),
    location: text(body.location, "上课地点", 160),
    classIds,
    weekday: integer(body.weekday, "星期", 1, 7),
    weeks,
    startTime,
    endTime,
  };
}
export function generateSessions(term: any, rule: any) {
  return rule.weeks
    .map((week: number) => {
      const day = addDays(term.monday, (week - 1) * 7 + rule.weekday - 1);
      return {
        sourceWeek: week,
        originalDate: day,
        date: day,
        startAt: new Date(`${day}T${rule.startTime}:00+08:00`),
        endAt: new Date(`${day}T${rule.endTime}:00+08:00`),
        startTime: rule.startTime,
        endTime: rule.endTime,
        courseName: rule.courseName,
        teacherId: rule.teacherId,
        location: rule.location,
        classIds: rule.classIds,
      };
    })
    .filter((s: any) => s.date >= term.startDate && s.date <= term.endDate);
}
export function conflicts(a: any, b: any): boolean {
  return (
    a.status !== "cancelled" &&
    b.status !== "cancelled" &&
    +new Date(a.startAt) < +new Date(b.endAt) &&
    +new Date(b.startAt) < +new Date(a.endAt) &&
    (a.teacherId === b.teacherId ||
      a.classIds.some((id: string) => b.classIds.includes(id)))
  );
}
export const REMINDER_FIELDS = [
  "courseName",
  "teacherName",
  "location",
  "startTime",
  "className",
];
export function mappingInput(value: any): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("请选择模板字段映射");
  const pairs = Object.entries(value);
  if (
    !pairs.length ||
    pairs.length > 5 ||
    pairs.some(
      ([key, field]) =>
        !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) ||
        !REMINDER_FIELDS.includes(field as string),
    )
  )
    throw new BadRequestException(
      "模板字段只能映射课程、老师、地点、上课时间和班级",
    );
  if (
    !Object.values(value).includes("courseName") ||
    !Object.values(value).includes("startTime")
  )
    throw new BadRequestException("模板必须包含课程名称和上课时间");
  return Object.fromEntries(pairs) as Record<string, string>;
}
