import {
  addDays,
  conflicts,
  date,
  generateSessions,
  mappingInput,
  ruleInput,
  termInput,
  weekOf,
} from "./academic.policy";
const term = termInput({
  name: "测试学期",
  monday: "2026-09-07",
  startDate: "2026-09-09",
  endDate: "2027-01-03",
});
const base = {
  courseName: "数学",
  teacherId: "teacher-a",
  classIds: ["class-a"],
  location: "A203",
  weekday: 2,
  weeks: [1, 2, 3],
  startTime: "08:00",
  endTime: "09:40",
};
describe("学校日期与排课边界", () => {
  it.each(["2026-02-29", "2026-13-01", "2026-04-31", "2026-9-1", ""])(
    "拒绝非法日期 %s",
    (value) => expect(() => date(value)).toThrow(),
  );
  it("支持闰日与跨年", () => {
    expect(date("2028-02-29")).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("教学周在周一切换，周日仍属前一周", () => {
    expect(weekOf(term.monday, "2026-09-13")).toBe(1);
    expect(weekOf(term.monday, "2026-09-14")).toBe(2);
  });
  it("第 1 周未实际开课的日期不生成，UTC 时间使用上海时区", () => {
    const rows = generateSessions(term, ruleInput(base, term));
    expect(rows.map((r: any) => r.date)).toEqual(["2026-09-15", "2026-09-22"]);
    expect(rows[0].startAt.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });
  it("按明确周集合排课，去重且不擅自跳过节假日", () => {
    const rows = generateSessions(
      term,
      ruleInput({ ...base, weekday: 4, weeks: [4, 2, 4, 6] }, term),
    );
    expect(rows.map((r: any) => r.date)).toEqual([
      "2026-09-17",
      "2026-10-01",
      "2026-10-15",
    ]);
  });
  it("拒绝学期外周次、空班级、跨夜时间与不合法星期", () => {
    for (const extra of [
      { weeks: [99] },
      { weeks: [] },
      { classIds: [] },
      { startTime: "23:00", endTime: "01:00" },
      { weekday: 8 },
    ])
      expect(() => ruleInput({ ...base, ...extra }, term)).toThrow();
  });
  it("学期周一起点与开课范围严格校验", () => {
    expect(() => termInput({ ...term, monday: "2026-09-08" })).toThrow();
    expect(() => termInput({ ...term, startDate: "2026-09-15" })).toThrow();
  });
  it("作息表不接受重叠节次", () => {
    expect(() =>
      termInput({
        ...term,
        slots: [
          { name: "1", startTime: "08:00", endTime: "09:00" },
          { name: "2", startTime: "08:50", endTime: "10:00" },
        ],
      }),
    ).toThrow();
  });
  it("结束边界接下一节不算冲突；不同老师同班和同老师不同班均冲突", () => {
    const a = {
      startAt: new Date("2026-09-15T00:00Z"),
      endAt: new Date("2026-09-15T01:00Z"),
      teacherId: "a",
      classIds: ["a"],
      status: "scheduled",
    };
    expect(
      conflicts(a, {
        ...a,
        startAt: a.endAt,
        endAt: new Date("2026-09-15T02:00Z"),
      }),
    ).toBe(false);
    expect(conflicts(a, { ...a, teacherId: "b" })).toBe(true);
    expect(conflicts(a, { ...a, classIds: ["b"] })).toBe(true);
    expect(conflicts(a, { ...a, teacherId: "b", classIds: ["b"] })).toBe(false);
    expect(conflicts(a, { ...a, status: "cancelled" })).toBe(false);
  });
  it("提醒模板至少映射课程与时间，并拒绝无关字段", () => {
    expect(mappingInput({ thing1: "courseName", time2: "startTime" })).toEqual({
      thing1: "courseName",
      time2: "startTime",
    });
    expect(() => mappingInput({ thing1: "location" })).toThrow();
    expect(() =>
      mappingInput({
        thing1: "courseName",
        time2: "startTime",
        thing3: "phone",
      }),
    ).toThrow();
  });
});
