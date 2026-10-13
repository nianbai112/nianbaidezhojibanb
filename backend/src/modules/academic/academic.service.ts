import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/services/prisma.service";
import { AdminDataScopeService } from "../../common/services/admin-data-scope.service";
import { WechatOfficialService } from "../wechat/wechat-official.service";
import {
  addDays,
  clock,
  conflicts,
  date,
  generateSessions,
  integer,
  localDate,
  mappingInput,
  ruleInput,
  termInput,
  text,
  weekOf,
} from "./academic.policy";

const PAGE = "pagesAcademic/timetable/index";
const activeUser = {
  status: "ACTIVE",
  deletedAt: null,
  userType: 1,
  systemRole: null,
};
@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminDataScopeService,
    private readonly official: WechatOfficialService,
  ) {}
  // Existing services also use a dynamic transaction client to support both generated dialects.
  private get db(): any {
    return this.prisma;
  }
  private tx<T>(run: (db: any) => Promise<T>): Promise<T> {
    return this.db.$transaction(run, {
      isolationLevel: "ReadCommitted",
      maxWait: 10000,
      timeout: 20000,
    });
  }
  private async adminRegion(account: string, regionId: string) {
    text(account, "管理员");
    text(regionId, "学校区域");
    await this.scope.assertRegionAccess(account, regionId);
    if (
      !(await this.db.region.findUnique({
        where: { id: regionId },
        select: { id: true },
      }))
    )
      throw new NotFoundException("学校区域不存在");
  }
  private async lock(db: any, regionId: string) {
    await db.academicSetting.upsert({
      where: { regionId },
      create: { regionId },
      update: { version: { increment: 1 } },
    });
    return db.academicSetting.findUnique({ where: { regionId } });
  }
  private async term(db: any, id: string) {
    const row = await db.academicTerm.findUnique({
      where: { id: text(id, "学期") },
    });
    if (!row) throw new NotFoundException("学期不存在");
    return row;
  }
  private async audit(
    db: any,
    accountId: string,
    targetId: string,
    action: string,
  ) {
    await db.adminOperationLog.create({
      data: {
        accountId,
        module: "academic",
        action,
        targetId,
        targetType: "academic_schedule",
      },
    });
  }
  private async participants(db: any, regionId: string, rule: any) {
    const [classes, teacher] = await Promise.all([
      db.academicClass.count({
        where: { id: { in: rule.classIds }, regionId, active: true },
      }),
      db.academicTeacher.findFirst({ where: { id: rule.teacherId, regionId } }),
    ]);
    if (classes !== rule.classIds.length || !teacher)
      throw new BadRequestException("班级和老师必须属于当前学校，且班级已启用");
  }
  async options(accountId: string) {
    text(accountId, "管理员");
    return {
      regions: await this.db.region.findMany({
        where: await this.scope.regionModelWhere(accountId),
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    };
  }
  async workspace(accountId: string, q: any) {
    const regionId = text(q.regionId, "学校区域");
    await this.adminRegion(accountId, regionId);
    const terms = await this.db.academicTerm.findMany({
      where: { regionId },
      orderBy: { startDate: "desc" },
    });
    const selected = q.termId
      ? terms.find((t: any) => t.id === q.termId)
      : terms.find(
          (t: any) => t.startDate <= localDate() && t.endDate >= localDate(),
        ) || terms[0];
    if (q.termId && !selected)
      throw new NotFoundException("当前学校没有该学期");
    const [classes, teachers, rules, sessions, setting, template, reminders] =
      await Promise.all([
        this.db.academicClass.findMany({
          where: { regionId },
          orderBy: [{ major: "asc" }, { grade: "desc" }, { name: "asc" }],
        }),
        this.db.academicTeacher.findMany({
          where: { regionId },
          orderBy: { name: "asc" },
        }),
        selected
          ? this.db.academicRule.findMany({
              where: { termId: selected.id },
              orderBy: { createdAt: "desc" },
            })
          : [],
        selected
          ? this.db.academicSession.findMany({
              where: { termId: selected.id },
              orderBy: { startAt: "asc" },
            })
          : [],
        this.db.academicSetting.findUnique({ where: { regionId } }),
        this.db.wechatTemplateConfig.findFirst({
          where: {
            regionId,
            platformType: "official",
            templateType: "course_reminder",
          },
        }),
        this.db.academicReminder.findMany({
          where: { session: { term: { regionId } } },
          orderBy: { updatedAt: "desc" },
          take: 100,
          select: {
            id: true,
            status: true,
            attempts: true,
            error: true,
            updatedAt: true,
            session: {
              select: { courseName: true, date: true, startTime: true },
            },
          },
        }),
      ]);
    return {
      terms,
      term: selected || null,
      classes,
      teachers,
      rules,
      sessions,
      setting: setting || { enabled: false, leadMinutes: 20 },
      template,
      reminders,
      serverTime: new Date(),
    };
  }
  async saveTerm(accountId: string, b: any) {
    const regionId = text(b.regionId, "学校区域"),
      data = termInput(b);
    await this.adminRegion(accountId, regionId);
    return this.tx(async (db) => {
      await this.lock(db, regionId);
      if (b.id) {
        const old = await this.term(db, b.id);
        if (old.regionId !== regionId)
          throw new ForbiddenException("不能修改其他学校的学期");
        if (old.version !== b.version)
          throw new ConflictException("学期已更新，请刷新后重试");
        if (
          (old.monday !== data.monday ||
            old.startDate !== data.startDate ||
            old.endDate !== data.endDate) &&
          (await db.academicRule.count({ where: { termId: old.id } })) +
            (await db.academicSession.count({ where: { termId: old.id } })) >
            0
        )
          throw new BadRequestException(
            "已有课程后不能移动学期日期，请新建学期或调整具体课次",
          );
      }
      if (
        await db.academicTerm.findFirst({
          where: {
            regionId,
            ...(b.id ? { id: { not: b.id } } : {}),
            startDate: { lte: data.endDate },
            endDate: { gte: data.startDate },
          },
        })
      )
        throw new BadRequestException("同一学校的教学学期日期不能重叠");
      const row = b.id
        ? await db.academicTerm.update({
            where: { id: b.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await db.academicTerm.create({ data: { regionId, ...data } });
      await this.audit(db, accountId, row.id, "保存学期");
      return row;
    });
  }
  async saveClass(accountId: string, b: any) {
    const regionId = text(b.regionId, "学校区域");
    await this.adminRegion(accountId, regionId);
    const data = {
      regionId,
      major: text(b.major, "专业"),
      grade: integer(b.grade, "入学年级", 2000, 2099),
      name: text(b.name, "班级名称"),
      active: b.active !== false,
    };
    return this.tx(async (db) => {
      await this.lock(db, regionId);
      if (
        b.id &&
        !(await db.academicClass.findFirst({ where: { id: b.id, regionId } }))
      )
        throw new NotFoundException("班级不存在");
      if (
        await db.academicClass.findFirst({
          where: {
            regionId,
            major: data.major,
            grade: data.grade,
            name: data.name,
            ...(b.id ? { id: { not: b.id } } : {}),
          },
        })
      )
        throw new BadRequestException(
          "该专业、年级和班级已存在，请直接编辑已有班级",
        );
      const row = b.id
        ? await db.academicClass.update({ where: { id: b.id }, data })
        : await db.academicClass.create({ data });
      await this.audit(db, accountId, row.id, "保存班级");
      return row;
    });
  }
  async saveTeacher(accountId: string, b: any) {
    const regionId = text(b.regionId, "学校区域");
    await this.adminRegion(accountId, regionId);
    const data = {
      regionId,
      name: text(b.name, "老师姓名"),
      code: text(b.code, "教师工号或区分编号", 40),
    };
    return this.tx(async (db) => {
      await this.lock(db, regionId);
      if (
        b.id &&
        !(await db.academicTeacher.findFirst({ where: { id: b.id, regionId } }))
      )
        throw new NotFoundException("老师不存在");
      if (
        await db.academicTeacher.findFirst({
          where: {
            regionId,
            code: data.code,
            ...(b.id ? { id: { not: b.id } } : {}),
          },
        })
      )
        throw new BadRequestException("该教师编号已存在，请直接选择已有老师");
      const row = b.id
        ? await db.academicTeacher.update({ where: { id: b.id }, data })
        : await db.academicTeacher.create({ data });
      await this.audit(db, accountId, row.id, "保存老师");
      return row;
    });
  }
  async saveRule(accountId: string, b: any) {
    const term = await this.term(this.db, b.termId);
    await this.adminRegion(accountId, term.regionId);
    return this.tx(async (db) => {
      await this.lock(db, term.regionId);
      const currentTerm = await this.term(db, term.id),
        draft = ruleInput(b, currentTerm);
      await this.participants(db, term.regionId, draft);
      if (b.id) {
        const old = await db.academicRule.findFirst({
          where: { id: b.id, termId: term.id },
        });
        if (!old) throw new NotFoundException("课程规律不存在");
        if (b.version !== old.version)
          throw new ConflictException("课程已被修改，请刷新后重试");
      }
      const row = b.id
        ? await db.academicRule.update({
            where: { id: b.id },
            data: { draft, version: { increment: 1 } },
          })
        : await db.academicRule.create({ data: { termId: term.id, draft } });
      await this.audit(db, accountId, row.id, "保存课程草稿");
      return row;
    });
  }
  private async plan(db: any, rule: any, now = new Date()) {
    const term = await this.term(db, rule.termId),
      input = ruleInput(rule.draft, term);
    await this.participants(db, term.regionId, input);
    const existing = await db.academicSession.findMany({
      where: { ruleId: rule.id },
    });
    const generated = generateSessions(term, input);
    const rows: any[] = generated
      .filter((s: any) => +s.startAt > +now)
      .map((s: any) => {
        const old = existing.find((e: any) => e.sourceWeek === s.sourceWeek);
        if (old && (+old.startAt <= +now || old.exception)) return null;
        return { ...s, id: old?.id, status: "scheduled", exception: false };
      })
      .filter(Boolean);
    const cancelled = existing.filter(
      (s: any) =>
        !s.exception &&
        +s.startAt > +now &&
        !rows.some((r) => r.sourceWeek === s.sourceWeek),
    );
    const others = await db.academicSession.findMany({
      where: {
        term: { regionId: term.regionId },
        status: "scheduled",
        startAt: { gt: now },
      },
    });
    const replaced = new Set([
      ...rows.map((s) => s.id),
      ...cancelled.map((s: any) => s.id),
    ]);
    const kept = others.filter((s: any) => !replaced.has(s.id));
    const issues: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const other = [...kept, ...rows.slice(0, i)].find((s) =>
        conflicts(rows[i], s),
      );
      if (other)
        issues.push(
          `${rows[i].date} ${rows[i].startTime} 与「${other.courseName}」的班级或老师时间重叠`,
        );
    }
    return {
      ruleId: rule.id,
      version: rule.version,
      rows,
      cancelled,
      preserved: existing.filter((s: any) => s.exception || +s.startAt <= +now),
      issues,
    };
  }
  async preview(accountId: string, id: string) {
    const rule = await this.db.academicRule.findUnique({
      where: { id },
      include: { term: true },
    });
    if (!rule) throw new NotFoundException("课程规律不存在");
    await this.adminRegion(accountId, rule.term.regionId);
    return this.plan(this.db, rule);
  }
  private async editable(db: any, ids: string[]) {
    if (
      ids.length &&
      (await db.academicReminder.count({
        where: { sessionId: { in: ids }, status: "processing" },
      }))
    )
      throw new ConflictException("该课次正在发送提醒，请稍后重试");
  }
  async publish(accountId: string, id: string, version: unknown) {
    const initial = await this.db.academicRule.findUnique({
      where: { id },
      include: { term: true },
    });
    if (!initial) throw new NotFoundException("课程规律不存在");
    await this.adminRegion(accountId, initial.term.regionId);
    return this.tx(async (db) => {
      await this.lock(db, initial.term.regionId);
      const rule = await db.academicRule.findUnique({ where: { id } });
      if (rule.version !== version)
        throw new ConflictException("草稿已变化，请重新预览");
      if (rule.publishedVersion === rule.version)
        return { published: true, unchanged: true };
      const plan = await this.plan(db, rule);
      if (plan.issues.length)
        throw new BadRequestException(plan.issues.join("；"));
      await this.editable(db, [
        ...plan.rows.map((s) => s.id).filter(Boolean),
        ...plan.cancelled.map((s: any) => s.id),
      ]);
      for (const s of plan.rows) {
        const { id: oldId, ...data } = s;
        const row = oldId
          ? await db.academicSession.update({
              where: { id: oldId },
              data: { ...data, version: { increment: 1 } },
            })
          : await db.academicSession.create({
              data: { ...data, termId: rule.termId, ruleId: id },
            });
        await db.academicReminder.updateMany({
          where: {
            sessionId: row.id,
            status: { in: ["pending", "cancelled", "retry"] },
          },
          data: {
            status: "pending",
            sessionVersion: row.version,
            error: null,
            attempts: 0,
          },
        });
      }
      for (const s of plan.cancelled) {
        await db.academicSession.update({
          where: { id: s.id },
          data: {
            status: "cancelled",
            reason: "上课规律调整",
            version: { increment: 1 },
          },
        });
        await db.academicReminder.updateMany({
          where: { sessionId: s.id, status: { in: ["pending", "retry"] } },
          data: { status: "cancelled" },
        });
      }
      await db.academicRule.update({
        where: { id },
        data: { publishedVersion: rule.version },
      });
      await this.audit(db, accountId, id, "发布课程");
      return { published: true, count: plan.rows.length };
    });
  }
  private sessionInput(b: any, term: any) {
    const day = date(b.date);
    if (day < term.startDate || day > term.endDate)
      throw new BadRequestException("上课日期必须在学期范围内");
    const startTime = clock(b.startTime),
      endTime = clock(b.endTime);
    if (startTime >= endTime)
      throw new BadRequestException("结束时间须晚于开始时间");
    const startAt = new Date(`${day}T${startTime}:00+08:00`),
      endAt = new Date(`${day}T${endTime}:00+08:00`);
    if (+startAt <= Date.now())
      throw new BadRequestException("只能安排尚未开始的课程");
    return {
      date: day,
      startTime,
      endTime,
      startAt,
      endAt,
      location: text(b.location, "地点", 160),
      teacherId: text(b.teacherId, "老师"),
    };
  }
  private async checkSession(db: any, session: any, term: any) {
    await this.participants(db, term.regionId, session);
    if (session.status === "cancelled") return;
    const others = await db.academicSession.findMany({
      where: {
        term: { regionId: term.regionId },
        ...(session.id ? { id: { not: session.id } } : {}),
        status: "scheduled",
        startAt: { lt: session.endAt },
        endAt: { gt: session.startAt },
      },
    });
    const hit = others.find((s: any) => conflicts(s, session));
    if (hit)
      throw new BadRequestException(
        `与「${hit.courseName}」的班级或老师时间重叠`,
      );
  }
  async extra(accountId: string, b: any) {
    const term = await this.term(this.db, b.termId);
    await this.adminRegion(accountId, term.regionId);
    return this.tx(async (db) => {
      await this.lock(db, term.regionId);
      const input = ruleInput({ ...b, weekday: 1, weeks: [1] }, term),
        time = this.sessionInput(b, term);
      const data = {
        ...time,
        courseName: input.courseName,
        classIds: input.classIds,
        termId: term.id,
        sourceWeek: weekOf(term.monday, time.date),
        originalDate: time.date,
        exception: true,
        reason: text(b.reason, "补课说明", 200),
        status: "scheduled",
      };
      await this.checkSession(db, data, term);
      const row = await db.academicSession.create({ data });
      await this.audit(db, accountId, row.id, "新增补课");
      return row;
    });
  }
  async changeSession(accountId: string, id: string, b: any) {
    const original = await this.db.academicSession.findUnique({
      where: { id },
      include: { term: true },
    });
    if (!original) throw new NotFoundException("课次不存在");
    await this.adminRegion(accountId, original.term.regionId);
    if (!["scheduled", "cancelled"].includes(b.status))
      throw new BadRequestException("请选择正常上课或停课");
    return this.tx(async (db) => {
      await this.lock(db, original.term.regionId);
      const current = await db.academicSession.findUnique({ where: { id } });
      if (current.version !== b.version)
        throw new ConflictException("课次已更新，请刷新后重试");
      if (+current.startAt <= Date.now())
        throw new BadRequestException("已开始的课程只能查看，不能改写历史");
      await this.editable(db, [id]);
      const data = {
        ...this.sessionInput(b, original.term),
        status: b.status,
        exception: true,
        reason: text(b.reason, "调整说明", 200),
      };
      await this.checkSession(db, { ...current, ...data }, original.term);
      const row = await db.academicSession.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
      await db.academicReminder.updateMany({
        where: {
          sessionId: id,
          status: { in: ["pending", "retry", "cancelled"] },
        },
        data: {
          status: b.status === "cancelled" ? "cancelled" : "pending",
          sessionVersion: row.version,
          error: null,
          attempts: 0,
        },
      });
      await this.audit(
        db,
        accountId,
        id,
        b.status === "cancelled" ? "停课" : "调整课次",
      );
      return row;
    });
  }
  async settings(accountId: string, b: any) {
    const regionId = text(b.regionId, "学校区域");
    await this.adminRegion(accountId, regionId);
    if (typeof b.enabled !== "boolean")
      throw new BadRequestException("提醒开关无效");
    const leadMinutes = integer(b.leadMinutes, "提前分钟数", 1, 120);
    const templateId = b.templateId ? text(b.templateId, "模板 ID", 128) : "";
    const fieldMapping = templateId ? mappingInput(b.fieldMapping) : {};
    if (b.enabled && !templateId)
      throw new BadRequestException("开启前请配置适用的课程提醒模板");
    return this.tx(async (db) => {
      await this.lock(db, regionId);
      if (templateId)
        await db.wechatTemplateConfig.upsert({
          where: {
            platformType_templateType_regionId: {
              platformType: "official",
              templateType: "course_reminder",
              regionId,
            },
          },
          create: {
            regionId,
            platformType: "official",
            templateType: "course_reminder",
            templateId,
            fieldMapping,
            enabled: b.enabled,
            defaultPage: PAGE,
          },
          update: {
            templateId,
            fieldMapping,
            enabled: b.enabled,
            defaultPage: PAGE,
          },
        });
      else
        await db.wechatTemplateConfig.updateMany({
          where: {
            regionId,
            platformType: "official",
            templateType: "course_reminder",
          },
          data: { enabled: false },
        });
      const row = await db.academicSetting.update({
        where: { regionId },
        data: { enabled: b.enabled, leadMinutes },
      });
      await this.audit(db, accountId, regionId, "保存课程提醒配置");
      return row;
    });
  }
  private async user(userId: string) {
    text(userId, "用户");
    if (
      !(await this.db.user.findFirst({
        where: { id: userId, ...activeUser },
        select: { id: true },
      }))
    )
      throw new ForbiddenException("请使用正常学生账号登录");
  }
  async catalog(userId: string, regionId: string, sessionId?: string) {
    await this.user(userId);
    text(regionId, "学校区域");
    const [classes, terms, subscription, setting, binding] = await Promise.all([
      this.db.academicClass.findMany({
        where: { regionId, active: true },
        orderBy: [{ major: "asc" }, { grade: "desc" }, { name: "asc" }],
      }),
      this.db.academicTerm.findMany({
        where: { regionId },
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          name: true,
          monday: true,
          startDate: true,
          endDate: true,
          slots: true,
        },
      }),
      this.db.academicSubscription.findUnique({
        where: { userId_regionId: { userId, regionId } },
      }),
      this.db.academicSetting.findUnique({ where: { regionId } }),
      this.db.wechatOfficialBinding.findUnique({
        where: { userId },
        select: { subscribe: true },
      }),
    ]);
    const focusSession =
      sessionId && subscription
        ? await this.db.academicSession.findFirst({
            where: { id: sessionId, term: { regionId } },
            include: { term: true },
          })
        : null;
    const focus =
      focusSession && focusSession.classIds.includes(subscription.classId)
        ? {
            termId: focusSession.termId,
            date: focusSession.date,
            week: weekOf(focusSession.term.monday, focusSession.date),
          }
        : null;
    return {
      classes,
      terms,
      subscription,
      focus,
      reminderAvailable: !!setting?.enabled,
      leadMinutes: setting?.leadMinutes || 20,
      officialBound: !!binding?.subscribe,
      serverDate: localDate(),
    };
  }
  async subscribe(userId: string, b: any) {
    await this.user(userId);
    const classId = text(b.classId, "班级");
    if (typeof b.enabled !== "boolean")
      throw new BadRequestException("请选择是否开启提醒");
    const klass = await this.db.academicClass.findUnique({
      where: { id: classId },
    });
    if (!klass?.active) throw new BadRequestException("班级已停用或不存在");
    return this.tx(async (db) => {
      const setting = await this.lock(db, klass.regionId);
      const currentClass = await db.academicClass.findUnique({
        where: { id: classId },
      });
      if (!currentClass?.active) throw new BadRequestException("班级已停用");
      const old = await db.academicSubscription.findUnique({
        where: { userId_regionId: { userId, regionId: klass.regionId } },
      });
      if (b.enabled) {
        if ((!old?.enabled || old.classId !== classId) && b.consent !== true)
          throw new BadRequestException("请明确同意接收当前班级的上课提醒");
        if (!setting.enabled)
          throw new BadRequestException("学校暂未开启课程提醒");
        const binding = await db.wechatOfficialBinding.findUnique({
          where: { userId },
        });
        if (!binding?.subscribe || !binding.officialOpenid)
          throw new BadRequestException("请先绑定并关注服务号");
      }
      const data = {
        classId,
        enabled: b.enabled,
        consentAt: b.enabled ? old?.consentAt || new Date() : null,
      };
      const row = await db.academicSubscription.upsert({
        where: { userId_regionId: { userId, regionId: klass.regionId } },
        create: { userId, regionId: klass.regionId, ...data },
        update: data,
      });
      await db.academicReminder.updateMany({
        where: {
          userId,
          session: { term: { regionId: klass.regionId } },
          status: { in: ["pending", "retry"] },
        },
        data: { status: "cancelled" },
      });
      return row;
    });
  }
  async timetable(userId: string, q: any) {
    await this.user(userId);
    const term = await this.term(this.db, q.termId);
    const subscription = await this.db.academicSubscription.findUnique({
      where: { userId_regionId: { userId, regionId: term.regionId } },
      include: { classroom: true },
    });
    if (!subscription?.classroom?.active)
      throw new BadRequestException("请先选择有效班级");
    const week = integer(
      Number(q.week),
      "周次",
      1,
      weekOf(term.monday, term.endDate),
    );
    const first = addDays(term.monday, (week - 1) * 7),
      last = addDays(first, 6);
    const sessions = await this.db.academicSession.findMany({
      where: { termId: term.id, date: { gte: first, lte: last } },
      orderBy: { startAt: "asc" },
    });
    const teachers = await this.db.academicTeacher.findMany({
      where: { regionId: term.regionId },
    });
    return {
      week,
      first,
      last,
      serverDate: localDate(),
      className: `${subscription.classroom.major} · ${subscription.classroom.grade}级 · ${subscription.classroom.name}`,
      sessions: sessions
        .filter((s: any) => s.classIds.includes(subscription.classId))
        .map((s: any) => ({
          id: s.id,
          courseName: s.courseName,
          teacherName:
            teachers.find((t: any) => t.id === s.teacherId)?.name ||
            "老师信息待更新",
          location: s.location,
          date: s.date,
          originalDate: s.originalDate,
          sourceWeek: s.sourceWeek,
          week: weekOf(term.monday, s.date),
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.status,
          changed: s.exception,
          reason: s.reason,
        })),
    };
  }
  async sweep(now = new Date()) {
    // A crashed dispatch is uncertain, never blindly resent. Stop retrying after class begins.
    await this.db.academicReminder.updateMany({
      where: {
        status: "processing",
        updatedAt: { lt: new Date(+now - 180000) },
      },
      data: { status: "unknown", error: "发送进程中断，结果待核实" },
    });
    await this.db.academicReminder.updateMany({
      where: {
        status: { in: ["pending", "retry"] },
        session: { startAt: { lte: now } },
      },
      data: { status: "cancelled", error: "已过上课时间" },
    });
    const settings = await this.db.academicSetting.findMany({
      where: { enabled: true },
    });
    for (const setting of settings) {
      const sessions = await this.db.academicSession.findMany({
        where: {
          term: { regionId: setting.regionId },
          status: "scheduled",
          startAt: {
            gt: now,
            lte: new Date(+now + setting.leadMinutes * 60000),
          },
        },
        orderBy: { startAt: "asc" },
      });
      for (const session of sessions) {
        let cursor: string | undefined;
        do {
          const subscribers = await this.db.academicSubscription.findMany({
            where: {
              regionId: setting.regionId,
              classId: { in: session.classIds },
              enabled: true,
              classroom: { active: true },
              user: activeUser,
            },
            orderBy: { id: "asc" },
            take: 100,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          if (!subscribers.length) break;
          for (const subscriber of subscribers)
            await this.dispatch(
              session.id,
              subscriber.userId,
              setting.regionId,
              now,
            );
          cursor =
            subscribers.length === 100
              ? subscribers[subscribers.length - 1].id
              : undefined;
        } while (cursor);
      }
    }
  }
  private async dispatch(
    sessionId: string,
    userId: string,
    regionId: string,
    now: Date,
  ) {
    const task: any = await this.tx(async (db) => {
      const setting = await this.lock(db, regionId);
      const session = await db.academicSession.findUnique({
        where: { id: sessionId },
      });
      const sub = await db.academicSubscription.findUnique({
        where: { userId_regionId: { userId, regionId } },
        include: {
          classroom: true,
          user: {
            select: {
              status: true,
              deletedAt: true,
              userType: true,
              systemRole: true,
            },
          },
        },
      });
      const timestamp = Math.max(+now, Date.now());
      if (
        !setting.enabled ||
        session.status !== "scheduled" ||
        +session.startAt <= timestamp ||
        +session.startAt - setting.leadMinutes * 60000 > timestamp ||
        !sub?.enabled ||
        !sub.classroom.active ||
        !session.classIds.includes(sub.classId) ||
        sub.user.status !== "ACTIVE" ||
        sub.user.deletedAt ||
        sub.user.userType !== 1 ||
        sub.user.systemRole
      )
        return null;
      const binding = await db.wechatOfficialBinding.findUnique({
        where: { userId },
      });
      if (!binding?.subscribe || !binding.officialOpenid) return null;
      const reminder = await db.academicReminder.upsert({
        where: { sessionId_userId: { sessionId, userId } },
        create: { sessionId, userId, sessionVersion: session.version },
        update: {},
      });
      if (
        !["pending", "retry", "cancelled"].includes(reminder.status) ||
        reminder.attempts >= 3 ||
        (reminder.status === "retry" && +reminder.updatedAt > timestamp - 60000)
      )
        return null;
      const row = await db.academicReminder.update({
        where: { id: reminder.id },
        data: {
          status: "processing",
          sessionVersion: session.version,
          attempts: { increment: 1 },
          error: null,
        },
      });
      const teacher = await db.academicTeacher.findUnique({
        where: { id: session.teacherId },
      });
      return {
        row,
        session,
        data: {
          regionId,
          sessionId,
          courseName: session.courseName,
          teacherName: teacher?.name || "任课老师",
          location: session.location,
          startTime: `${session.date} ${session.startTime}`,
          className: `${sub.classroom.grade}级${sub.classroom.name}`,
        },
      };
    });
    if (!task) return;
    // Recheck consent after the database claim and immediately before dispatch.
    const [sub, currentSetting] = await Promise.all([
      this.db.academicSubscription.findUnique({
        where: { userId_regionId: { userId, regionId } },
      }),
      this.db.academicSetting.findUnique({ where: { regionId } }),
    ]);
    if (
      !currentSetting?.enabled ||
      !sub?.enabled ||
      !task.session.classIds.includes(sub.classId) ||
      +task.session.startAt <= Date.now()
    ) {
      await this.db.academicReminder.update({
        where: { id: task.row.id },
        data: { status: "cancelled" },
      });
      return;
    }
    try {
      const result: any = await this.official.sendTemplateMessage({
        userId,
        templateType: "course_reminder",
        page: `${PAGE}?sessionId=${encodeURIComponent(sessionId)}&regionId=${encodeURIComponent(regionId)}`,
        data: task.data,
      });
      const retry = result.errorCode === "-1" && task.row.attempts < 3;
      await this.db.academicReminder.update({
        where: { id: task.row.id },
        data: {
          status: result.success
            ? "accepted"
            : result.uncertain
              ? "unknown"
              : retry
                ? "retry"
                : "failed",
          error: result.success
            ? null
            : String(result.error || "发送失败").slice(0, 500),
        },
      });
    } catch {
      await this.db.academicReminder.update({
        where: { id: task.row.id },
        data: {
          status: "unknown",
          error: "发送结果待核实，请查看服务号消息记录",
        },
      });
    }
  }
}
