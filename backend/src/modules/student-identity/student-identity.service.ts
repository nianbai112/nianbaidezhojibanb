import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';
import { StudentVerifyDto } from '../user/dto/user.dto';
import {
  EnrollmentDto,
  ReleaseStudentBindingDto,
  ReviewStudentIdentityDto,
  SchoolIdentityPolicyDto,
  StudentIdentityQuery,
} from './student-identity.dto';
import {
  identityInclude,
  identityKey,
  miniStudentIdentity,
  requiresStudentCard,
  studentText,
} from './student-identity.policy';
import { parseRoster, RosterRow } from './roster-parser';

@Injectable()
export class StudentIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly scope: AdminDataScopeService,
  ) {}

  private async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 30000,
        });
      } catch (error) {
        if (error?.code === 'P2034' && attempt < 2) continue;
        if (error?.code === 'P2002' || error?.code === 'P2034')
          throw new ConflictException(
            '身份或名册已发生变更，请刷新后重试；有绑定争议请联系学校',
          );
        throw error;
      }
    }
  }

  private async invalidate(userId?: string | null) {
    if (!userId) return;
    await Promise.all([
      this.redis.delPattern(`user:profile:${userId}:*`).catch(() => undefined),
      this.redis
        .delPattern(`user:profile:v2:${userId}:*`)
        .catch(() => undefined),
    ]);
  }

  private async adminContext(operatorId: string) {
    if (!operatorId) throw new ForbiddenException('缺少管理员身份');
    return this.scope.getAdminContext(operatorId);
  }

  async schoolAccess(schoolId: string, operatorId: string) {
    const [school, context] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId } }),
      this.adminContext(operatorId),
    ]);
    if (!school) throw new NotFoundException('学校不存在');
    if (
      !context.isSuperAdmin &&
      (!school.regionId || !context.regionIds.includes(school.regionId))
    )
      throw new ForbiddenException('无权管理该学校的学生认证');
    return school;
  }

  private async lockSchool(
    tx: Prisma.TransactionClient,
    schoolId: string,
    regionId: string | null,
  ) {
    await tx.$queryRaw`SELECT id FROM schools WHERE id = ${schoolId} FOR UPDATE`;
    const school = await tx.school.findUnique({ where: { id: schoolId } });
    if (!school || school.regionId !== regionId)
      throw new ConflictException('学校归属已变更，请刷新后重新核对权限');
  }

  private submissionSnapshot(record: any) {
    return {
      applicationId: record.id,
      schoolId: record.schoolId,
      schoolName: record.schoolName,
      studentId: record.studentId,
      realName: record.realName,
      major: record.major,
      grade: record.grade,
      materialId: record.materialId,
      legacyImage: record.cardImage,
      proofMethod: record.proofMethod,
      status: record.status,
      reason: record.remark,
    };
  }

  async schools(operatorId: string, keyword = '') {
    const context = await this.adminContext(operatorId);
    return {
      list: await this.prisma.school.findMany({
        where: {
          ...(context.isSuperAdmin
            ? {}
            : { regionId: { in: context.regionIds } }),
          ...(keyword
            ? { name: { contains: keyword.trim().slice(0, 191) } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          regionId: true,
          isEnabled: true,
          studentVerificationMode: true,
          rosterRevision: true,
        },
        orderBy: { name: 'asc' },
        take: 200,
      }),
    };
  }

  async policy(
    schoolId: string,
    dto: SchoolIdentityPolicyDto,
    operatorId: string,
  ) {
    const school = await this.schoolAccess(schoolId, operatorId);
    const result = await this.transaction(async (tx) => {
      await this.lockSchool(tx, schoolId, school.regionId);
      if (
        dto.mode === 'ROSTER' &&
        !(await tx.schoolStudent.count({
          where: { schoolId, enrollmentStatus: 'ACTIVE' },
        }))
      )
        throw new BadRequestException('请先导入有效在校名册');
      const changed = await tx.school.updateMany({
        where: { id: schoolId, rosterRevision: dto.revision },
        data: {
          studentVerificationMode: dto.mode,
          rosterRevision: { increment: 1 },
        },
      });
      if (!changed.count) throw new ConflictException('学校配置已变更，请刷新');
      await tx.studentVerificationEvent.create({
        data: {
          schoolId,
          actorId: operatorId,
          action: 'POLICY',
          detail: { ...dto },
        },
      });
      return tx.school.findUniqueOrThrow({ where: { id: schoolId } });
    });
    const users = await this.prisma.studentVerify.findMany({
      where: { schoolId },
      select: { userId: true },
    });
    for (const user of users) await this.invalidate(user.userId);
    return result;
  }

  async preview(
    schoolId: string,
    buffer: Buffer,
    sourceName: string,
    operatorId: string,
  ) {
    const school = await this.schoolAccess(schoolId, operatorId);
    await this.prisma.schoolRosterBatch.updateMany({
      where: { schoolId, status: 'PREVIEW', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED', rows: [] },
    });
    const rows = parseRoster(buffer);
    const digest = identityKey(
      JSON.stringify(
        rows.map(({ studentId, realName }) => [studentId, realName]),
      ),
    );
    const committed = await this.prisma.schoolRosterBatch.findFirst({
      where: { schoolId, digest, status: 'COMMITTED' },
      select: { id: true, committedAt: true },
    });
    if (committed)
      return {
        alreadyImported: true,
        batchId: committed.id,
        committedAt: committed.committedAt,
      };
    const existing = await this.prisma.schoolStudent.findMany({
      where: { schoolId },
      select: { identityKey: true, studentId: true, realName: true },
    });
    const lookup = new Map(existing.map((row) => [row.identityKey, row]));
    const incoming = new Set(rows.map((row) => row.identityKey));
    const conflicts = rows.filter(
      (row) =>
        lookup.has(row.identityKey) &&
        (lookup.get(row.identityKey)!.studentId !== row.studentId ||
          lookup.get(row.identityKey)!.realName !== row.realName),
    );
    const names = new Map<string, number>();
    rows.forEach((row) =>
      names.set(row.realName, (names.get(row.realName) || 0) + 1),
    );
    const legacy = await this.prisma.studentVerify.groupBy({
      by: ['status'],
      where: { schoolId, rosterStudentId: null, proofMethod: 'LEGACY' },
      _count: { _all: true },
    });
    const summary = {
      total: rows.length,
      added: rows.filter((row) => !lookup.has(row.identityKey)).length,
      unchanged: rows.filter(
        (row) =>
          lookup.get(row.identityKey)?.realName === row.realName &&
          lookup.get(row.identityKey)?.studentId === row.studentId,
      ).length,
      conflicts: conflicts.map((row) => ({
        row: row.row,
        studentId: row.studentId,
        incomingName: row.realName,
        existingName: lookup.get(row.identityKey)!.realName,
      })),
      missing: existing.filter((row) => !incoming.has(row.identityKey)).length,
      sameNameGroups: [...names.values()].filter((n) => n > 1).length,
      legacy: Object.fromEntries(
        legacy.map((row) => [row.status, row._count._all]),
      ),
    };
    const batch = await this.prisma.schoolRosterBatch.create({
      data: {
        schoolId,
        digest,
        baseRevision: school.rosterRevision,
        rows: rows as unknown as Prisma.InputJsonValue,
        summary,
        sourceName: String(sourceName || '学校名册').slice(0, 191),
        createdBy: operatorId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return {
      batchId: batch.id,
      schoolName: school.name,
      summary,
      sample: rows.slice(0, 20),
      expiresAt: batch.expiresAt,
      canCommit: !conflicts.length,
    };
  }

  async commit(schoolId: string, batchId: string, operatorId: string) {
    const school = await this.schoolAccess(schoolId, operatorId);
    const result = await this.transaction(async (tx) => {
      await this.lockSchool(tx, schoolId, school.regionId);
      const batch = await tx.schoolRosterBatch.findFirst({
        where: { id: batchId, schoolId },
      });
      if (!batch) throw new NotFoundException('导入预览不存在');
      if (batch.status === 'COMMITTED')
        return { success: true, alreadyImported: true, batchId };
      if (batch.status !== 'PREVIEW' || batch.expiresAt <= new Date())
        throw new BadRequestException('预览已过期，请重新上传');
      const summary = batch.summary as any;
      if (summary.conflicts?.length)
        throw new BadRequestException('请先处理同号不同名冲突');
      const changed = await tx.school.updateMany({
        where: { id: schoolId, rosterRevision: batch.baseRevision },
        // Importing the roster is the signal that this school wants roster
        // matching enabled. Manual-review schools can still switch back from
        // the policy control later.
        data: {
          studentVerificationMode: 'ROSTER',
          rosterRevision: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ConflictException('预览后名册或学校配置已更新，请重新预览');
      const rows = batch.rows as unknown as RosterRow[];
      // Incremental imports never infer graduation and never overwrite a name or binding.
      for (const row of rows)
        await tx.schoolStudent.upsert({
          where: {
            schoolId_identityKey: { schoolId, identityKey: row.identityKey },
          },
          create: {
            schoolId,
            studentId: row.studentId,
            realName: row.realName,
            identityKey: row.identityKey,
            lastBatchId: batchId,
          },
          update: { lastBatchId: batchId },
        });
      await tx.schoolRosterBatch.update({
        where: { id: batchId },
        data: { status: 'COMMITTED', committedAt: new Date(), rows: [] },
      });
      await tx.studentVerificationEvent.create({
        data: {
          schoolId,
          actorId: operatorId,
          action: 'ROSTER_IMPORT',
          detail: { batchId, ...summary },
        },
      });
      return { success: true, batchId, summary };
    });
    // Importing a roster also reconciles applications that were submitted
    // before the roster existed. Only an exact, active and unbound match is
    // approved; all other cases remain available for manual review.
    const autoApproved = await this.reconcilePending(schoolId, operatorId);
    return { ...result, autoApproved };
  }

  private async reconcilePending(schoolId: string, actorId: string) {
    const pending = await this.prisma.studentVerify.findMany({
      where: { schoolId, status: 'PENDING' },
      select: { id: true, userId: true },
      orderBy: { createdAt: 'asc' },
    });
    let autoApproved = 0;
    const approvedUserIds: string[] = [];

    for (const item of pending) {
      try {
        const approved = await this.transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM schools WHERE id = ${schoolId} FOR UPDATE`;
          const school = await tx.school.findUnique({
            where: { id: schoolId },
            select: { studentVerificationMode: true },
          });
          if (school?.studentVerificationMode !== 'ROSTER') return false;

          await tx.$queryRaw`SELECT id FROM users WHERE id = ${item.userId} FOR UPDATE`;
          const record = await tx.studentVerify.findUnique({
            where: { id: item.id },
            include: identityInclude,
          });
          if (
            !record ||
            record.status !== 'PENDING' ||
            record.schoolId !== schoolId
          )
            return false;

          const roster = await tx.schoolStudent.findUnique({
            where: {
              schoolId_identityKey: {
                schoolId,
                identityKey: identityKey(record.studentId),
              },
            },
          });
          if (
            !roster ||
            roster.studentId !== record.studentId ||
            roster.realName !== record.realName ||
            roster.enrollmentStatus !== 'ACTIVE' ||
            (roster.boundUserId && roster.boundUserId !== record.userId)
          )
            return false;

          const previousVersion = record.submissionVersion;
          const wasUnbound = !roster.boundUserId;
          await this.bind(tx, roster, record.userId);
          const changed = await tx.studentVerify.updateMany({
            where: {
              id: record.id,
              status: 'PENDING',
              submissionVersion: previousVersion,
            },
            data: {
              status: 'APPROVED',
              proofMethod: 'ROSTER_MATCH',
              rosterStudentId: roster.id,
              materialId: null,
              cardImage: null,
              remark: null,
              verifiedAt: new Date(),
              submissionVersion: { increment: 1 },
            },
          });
          if (!changed.count) {
            if (wasUnbound)
              await tx.schoolStudent.updateMany({
                where: { id: roster.id, boundUserId: record.userId },
                data: {
                  boundUserId: null,
                  boundAt: null,
                  version: { increment: 1 },
                },
              });
            return false;
          }

          await tx.studentVerificationEvent.create({
            data: {
              schoolId,
              rosterStudentId: roster.id,
              userId: record.userId,
              actorId,
              action: 'AUTO_APPROVE',
              submissionVersion: previousVersion + 1,
              materialId: null,
              detail: {
                ...this.submissionSnapshot(record),
                status: 'APPROVED',
                proofMethod: 'ROSTER_MATCH',
                reason: '名册导入后自动匹配',
              },
            },
          });
          await tx.userProfile.upsert({
            where: { userId: record.userId },
            update: { school: record.schoolName },
            create: { userId: record.userId, school: record.schoolName },
          });
          return true;
        });
        if (approved) {
          autoApproved += 1;
          approvedUserIds.push(item.userId);
        }
      } catch (error) {
        // A conflicting binding or a concurrently changed application must
        // remain pending for the school's manual review queue.
        if (!(error instanceof ConflictException)) continue;
      }
    }

    for (const userId of approvedUserIds) await this.invalidate(userId);
    return autoApproved;
  }

  private rosterStatusWhere(status: string): Prisma.SchoolStudentWhereInput {
    const approved: Prisma.SchoolStudentWhereInput = {
      enrollmentStatus: 'ACTIVE',
      boundUserId: { not: null },
      verifications: { some: { status: 'APPROVED' } },
    };
    const pending: Prisma.SchoolStudentWhereInput = {
      verifications: { some: { status: 'PENDING' } },
    };
    const rejected: Prisma.SchoolStudentWhereInput = {
      verifications: { some: { status: 'REJECTED' } },
    };
    if (status === 'approved') return approved;
    if (status === 'pending') return { AND: [{ NOT: approved }, pending] };
    if (status === 'rejected')
      return { AND: [{ NOT: approved }, { NOT: pending }, rejected] };
    if (status === 'revoked')
      return {
        AND: [
          { NOT: approved },
          { NOT: pending },
          { NOT: rejected },
          { verifications: { some: {} } },
        ],
      };
    return { verifications: { none: {} } };
  }

  async roster(
    schoolId: string,
    query: StudentIdentityQuery,
    operatorId: string,
  ) {
    const school = await this.schoolAccess(schoolId, operatorId);
    const where: Prisma.SchoolStudentWhereInput = {
      schoolId,
      ...(query.enrollmentStatus
        ? { enrollmentStatus: query.enrollmentStatus }
        : {}),
      ...(query.status ? this.rosterStatusWhere(query.status) : {}),
      ...(query.keyword
        ? {
            OR: [
              { studentId: { contains: query.keyword } },
              { realName: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    const [
      list,
      total,
      active,
      counts,
      legacy,
      manualPending,
      outsideApproved,
    ] = await Promise.all([
      this.prisma.schoolStudent.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ studentId: 'asc' }, { id: 'asc' }],
        include: {
          verifications: {
            select: {
              id: true,
              userId: true,
              status: true,
              submissionVersion: true,
              proofMethod: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
          },
        },
      }),
      this.prisma.schoolStudent.count({ where }),
      this.prisma.schoolStudent.count({
        where: { schoolId, enrollmentStatus: 'ACTIVE' },
      }),
      Promise.all(
        ['none', 'pending', 'approved', 'rejected', 'revoked'].map(
          async (status) =>
            [
              status,
              await this.prisma.schoolStudent.count({
                where: {
                  AND: [
                    { schoolId, enrollmentStatus: 'ACTIVE' },
                    this.rosterStatusWhere(status),
                  ],
                },
              }),
            ] as const,
        ),
      ),
      this.prisma.studentVerify.groupBy({
        by: ['status'],
        where: { schoolId, rosterStudentId: null, proofMethod: 'LEGACY' },
        _count: { _all: true },
      }),
      this.prisma.studentVerify.count({
        where: { schoolId, status: 'PENDING' },
      }),
      this.prisma.studentVerify.count({
        where: {
          schoolId,
          status: 'APPROVED',
          rosterStudentId: null,
          proofMethod: { not: 'LEGACY' },
        },
      }),
    ]);
    const stats = Object.fromEntries(counts);
    return {
      school,
      list: list.map((student) => {
        const records = student.verifications;
        const status =
          student.enrollmentStatus === 'ACTIVE' &&
          student.boundUserId &&
          records.some((v) => v.status === 'APPROVED')
            ? 'approved'
            : records.some((v) => v.status === 'PENDING')
              ? 'pending'
              : records.some((v) => v.status === 'REJECTED')
                ? 'rejected'
                : records.length
                  ? 'revoked'
                  : 'none';
        return { ...student, certificationStatus: status };
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      stats: {
        active,
        ...stats,
        manualPending,
        outsideApproved,
        unfinished: active - stats.approved,
        legacy: Object.fromEntries(
          legacy.map((row) => [row.status, row._count._all]),
        ),
      },
    };
  }

  async applications(query: StudentIdentityQuery, operatorId: string) {
    const context = await this.adminContext(operatorId);
    if (query.schoolId) await this.schoolAccess(query.schoolId, operatorId);
    const where: Prisma.StudentVerifyWhereInput = {
      ...(context.isSuperAdmin
        ? {}
        : { school: { regionId: { in: context.regionIds } } }),
      ...(query.schoolId ? { schoolId: query.schoolId } : {}),
      ...(query.status && query.status !== 'none'
        ? { status: query.status.toUpperCase() as any }
        : {}),
      ...(query.keyword
        ? {
            OR: [
              { realName: { contains: query.keyword } },
              { studentId: { contains: query.keyword } },
              { schoolName: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.studentVerify.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { updatedAt: 'desc' },
        include: identityInclude,
      }),
      this.prisma.studentVerify.count({ where }),
    ]);
    return {
      list: rows.map((row) => ({
        ...miniStudentIdentity(row),
        userId: row.userId,
        historicalStatus: row.status.toLowerCase(),
        rosterStudentId: row.rosterStudentId,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async events(
    schoolId: string,
    userId: string | undefined,
    operatorId: string,
  ) {
    await this.schoolAccess(schoolId, operatorId);
    return this.prisma.studentVerificationEvent.findMany({
      where: { schoolId, ...(userId ? { userId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async me(userId: string) {
    return {
      data: miniStudentIdentity(
        await this.prisma.studentVerify.findUnique({
          where: { userId },
          include: identityInclude,
        }),
      ),
    };
  }

  async uploadMaterial(userId: string, buffer: Buffer) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user?.status !== 'ACTIVE')
      throw new ForbiddenException('账号当前不能上传认证资料');
    if (!buffer?.length || buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException('学生证图片不能超过5MB');
    const count = await this.redis.incrementWindow(
      `student-identity:material:${userId}`,
      3600,
    );
    if (count > 10) throw new HttpException('上传次数较多，请稍后重试', 429);
    let content: Buffer;
    try {
      const input = sharp(buffer, {
        limitInputPixels: 25000000,
        failOn: 'error',
      });
      const metadata = await input.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || ''))
        throw new Error('unsupported');
      content = await input
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      throw new BadRequestException('请上传有效的JPEG、PNG或WebP学生证照片');
    }
    const material = await this.prisma.studentVerificationMaterial.create({
      data: { userId, content },
      select: { id: true },
    });
    return { success: true, data: { materialId: material.id } };
  }

  async material(id: string, userId: string, administrator = false) {
    const item = await this.prisma.studentVerificationMaterial.findUnique({
      where: { id },
      select: {
        userId: true,
        verifications: { select: { schoolId: true } },
        events: { select: { schoolId: true } },
      },
    });
    if (!item) throw new NotFoundException('材料不存在');
    if (administrator) {
      const context = await this.adminContext(userId);
      const schoolIds = [
        ...new Set(
          [...item.verifications, ...item.events]
            .map((v) => v.schoolId)
            .filter((id): id is string => !!id),
        ),
      ];
      const allowed =
        schoolIds.length &&
        (await this.prisma.school.count({
          where: {
            id: { in: schoolIds },
            ...(context.isSuperAdmin
              ? {}
              : { regionId: { in: context.regionIds } }),
          },
        }));
      if (!allowed)
        throw new ForbiddenException('无权查看该材料或材料尚未关联学校申请');
    } else if (item.userId !== userId)
      throw new ForbiddenException('无权查看该材料');
    const file =
      await this.prisma.studentVerificationMaterial.findUniqueOrThrow({
        where: { id },
        select: { content: true },
      });
    return file.content;
  }

  async submit(userId: string, dto: StudentVerifyDto) {
    const attempts = await this.redis.incrementWindow(
      `student-identity:submit:${userId}`,
      600,
    );
    if (attempts > 20)
      throw new HttpException('尝试次数较多，请10分钟后重试或联系学校', 429);
    const schoolId = studentText(dto.schoolId || dto.school_id, '学校');
    const studentId = studentText(dto.studentId || dto.student_id, '学号');
    const realName = studentText(dto.realName || dto.name, '姓名');
    const result = await this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { status: true },
      });
      if (user?.status !== 'ACTIVE')
        throw new ForbiddenException('账号当前不能提交认证');
      const school = await tx.school.findUnique({ where: { id: schoolId } });
      if (!school?.isEnabled || !school.regionId)
        throw new BadRequestException('学校暂不可用于认证');
      const previous = await tx.studentVerify.findUnique({ where: { userId } });
      if (previous?.status === 'APPROVED') {
        if (
          previous.schoolId === schoolId &&
          previous.studentId === studentId &&
          previous.realName === realName
        ) {
          return tx.studentVerify.findUniqueOrThrow({
            where: { userId },
            include: identityInclude,
          });
        }
        throw new BadRequestException('已认证；身份变更请联系学校核实');
      }
      // 新申请只接受专用接口生成的私有材料；历史 cardImage 留在原记录和
      // 审计快照中供已有审核使用，不再通过提交接口创建新的公开证件链接。
      if (
        [dto.photo_url, dto.cardImage].some(
          (value) => value != null && String(value).trim() !== '',
        )
      )
        throw new BadRequestException(
          '不再接受公开学生证链接，请通过认证页面重新上传本人学生证照片',
        );
      const materialId = dto.materialId
        ? studentText(dto.materialId, '认证材料编号')
        : '';
      // 包括名册自动通过分支：只要传入材料编号，就先验证存在且属于本人。
      // 验证必须在名册绑定及申请/审计写入之前，不能用合法学号绕过材料归属。
      if (materialId) {
        const material = await tx.studentVerificationMaterial.findUnique({
          where: { id: materialId },
          select: { userId: true },
        });
        if (!material)
          throw new BadRequestException(
            '认证材料不存在或已失效，请重新上传本人学生证照片',
          );
        if (material.userId !== userId)
          throw new ForbiddenException('只能使用本人上传的学生证照片');
      }
      let roster: any = null;
      let proofMethod = 'MANUAL_PENDING';
      let status: 'APPROVED' | 'PENDING' = 'PENDING';
      if (school.studentVerificationMode === 'ROSTER') {
        const candidate = await tx.schoolStudent.findUnique({
          where: {
            schoolId_identityKey: {
              schoolId,
              identityKey: identityKey(studentId),
            },
          },
        });
        const matches =
          candidate &&
          candidate.studentId === studentId &&
          candidate.realName === realName;
        if (matches) roster = candidate;
        if (
          matches &&
          candidate.enrollmentStatus === 'ACTIVE' &&
          previous?.status !== 'REVOKED' &&
          (!candidate.boundUserId || candidate.boundUserId === userId)
        ) {
          await this.bind(tx, candidate, userId);
          status = 'APPROVED';
          proofMethod = 'ROSTER_MATCH';
        } else {
          proofMethod = 'ROSTER_EXCEPTION';
          if (!materialId && requiresStudentCard(schoolId))
            return {
              requires_material: true,
              message: '未通过名册自动核验，请上传学生证照片后提交人工审核',
            } as const;
        }
      }
      if (status === 'PENDING' && !materialId && requiresStudentCard(schoolId))
        throw new BadRequestException('请通过认证页面重新上传本人学生证照片');
      const data = {
        realName,
        studentId,
        schoolId,
        schoolName: school.name,
        status,
        proofMethod,
        rosterStudentId: roster?.id || null,
        major: String(dto.major || '')
          .trim()
          .slice(0, 191),
        grade: String(dto.grade || '')
          .trim()
          .slice(0, 191),
        cardImage: null,
        materialId: status === 'APPROVED' ? null : materialId || null,
        remark: null,
        verifiedAt: status === 'APPROVED' ? new Date() : null,
      };
      if (previous)
        await tx.studentVerificationEvent.create({
          data: {
            schoolId: previous.schoolId,
            rosterStudentId: previous.rosterStudentId,
            userId,
            actorId: userId,
            action: 'ARCHIVE_SUBMISSION',
            submissionVersion: previous.submissionVersion,
            materialId: previous.materialId,
            detail: this.submissionSnapshot(previous),
          },
        });
      const record = await tx.studentVerify.upsert({
        where: { userId },
        create: { userId, ...data },
        update: { ...data, submissionVersion: { increment: 1 } },
        include: identityInclude,
      });
      await tx.studentVerificationEvent.create({
        data: {
          schoolId,
          rosterStudentId: roster?.id,
          userId,
          actorId: userId,
          action: status === 'APPROVED' ? 'AUTO_APPROVE' : 'SUBMIT',
          submissionVersion: record.submissionVersion,
          materialId: record.materialId,
          detail: {
            ...this.submissionSnapshot(record),
            rosterVersion: roster?.version || null,
          },
        },
      });
      if (status === 'APPROVED')
        await tx.userProfile.upsert({
          where: { userId },
          update: { school: school.name },
          create: { userId, school: school.name },
        });
      return record;
    });
    if ('requires_material' in result) return { success: true, data: result };
    await this.invalidate(userId);
    return { success: true, data: miniStudentIdentity(result) };
  }

  private async bind(
    tx: Prisma.TransactionClient,
    roster: any,
    userId: string,
  ) {
    const bound = await tx.schoolStudent.updateMany({
      where: {
        id: roster.id,
        schoolId: roster.schoolId,
        version: roster.version,
        enrollmentStatus: 'ACTIVE',
        OR: [{ boundUserId: null }, { boundUserId: userId }],
      },
      data: {
        boundUserId: userId,
        boundAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (!bound.count)
      throw new ConflictException('身份绑定已变更，请联系学校核实');
  }

  async review(
    userId: string,
    dto: ReviewStudentIdentityDto,
    operatorId: string,
  ) {
    const snapshot = await this.prisma.studentVerify.findUnique({
      where: { userId },
    });
    if (!snapshot) throw new NotFoundException('认证申请不存在');
    if (!snapshot.schoolId)
      throw new BadRequestException(
        '历史资料缺少学校关联，请学生重新选择学校提交',
      );
    const school = await this.schoolAccess(snapshot.schoolId, operatorId);
    if (!['approved', 'rejected', 'revoked'].includes(dto.status))
      throw new BadRequestException('不支持的审核状态');
    const reason = String(dto.reason || '').trim();
    if (dto.status !== 'approved' && !reason)
      throw new BadRequestException('请填写处理原因');
    const result = await this.transaction(async (tx) => {
      await this.lockSchool(tx, snapshot.schoolId!, school.regionId);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const record = await tx.studentVerify.findUnique({
        where: { userId },
        include: identityInclude,
      });
      if (
        !record ||
        record.id !== dto.applicationId ||
        record.submissionVersion !== dto.submissionVersion ||
        record.schoolId !== snapshot.schoolId
      )
        throw new ConflictException('申请已更新，请重新查看资料');
      if (
        dto.status === 'revoked'
          ? record.status !== 'APPROVED'
          : record.status !== 'PENDING'
      )
        throw new ConflictException('申请状态已变更，请刷新');
      let approvedRosterId: string | null = record.rosterStudentId;
      let approvedProof = record.proofMethod;
      const realName =
        dto.status === 'approved' && dto.correctedRealName !== undefined
          ? studentText(dto.correctedRealName, '姓名')
          : record.realName;
      const studentId =
        dto.status === 'approved' && dto.correctedStudentId !== undefined
          ? studentText(dto.correctedStudentId, '学号')
          : record.studentId;
      if (dto.status === 'approved') {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { status: true },
        });
        if (
          user?.status !== 'ACTIVE' ||
          !record.school?.isEnabled ||
          !record.school.regionId
        )
          throw new BadRequestException('账号或学校当前不可认证');
        if (
          !record.materialId &&
          !record.cardImage &&
          requiresStudentCard(record.schoolId)
        )
          throw new BadRequestException('人工审核需要学生提交的证明材料');
        approvedProof = 'MANUAL_REVIEW';
        if (record.school.studentVerificationMode === 'ROSTER') {
          const candidate = await tx.schoolStudent.findUnique({
            where: {
              schoolId_identityKey: {
                schoolId: record.schoolId!,
                identityKey: identityKey(studentId),
              },
            },
          });
          if (candidate && candidate.studentId === studentId) {
            if (candidate.realName !== realName)
              throw new BadRequestException(
                '该学号已在名册中，请核对并填写名册对应姓名后审核',
              );
            if (candidate.enrollmentStatus !== 'ACTIVE')
              throw new BadRequestException('该生当前不在校，请先核实在校状态');
            if (candidate.boundUserId && candidate.boundUserId !== userId)
              throw new ConflictException(
                '该名册学生已绑定其他账号，请先处理绑定争议',
              );
            await this.bind(tx, candidate, userId);
            approvedRosterId = candidate.id;
            approvedProof = 'SCHOOL_REVIEW';
          } else {
            approvedRosterId = null;
            approvedProof = 'SCHOOL_EXCEPTION';
          }
        }
      }
      const status = dto.status.toUpperCase() as
        | 'APPROVED'
        | 'REJECTED'
        | 'REVOKED';
      const changed = await tx.studentVerify.updateMany({
        where: {
          id: record.id,
          submissionVersion: dto.submissionVersion,
          status: record.status,
        },
        data: {
          status,
          remark: reason || null,
          verifiedAt: status === 'APPROVED' ? new Date() : null,
          ...(status === 'APPROVED'
            ? {
                realName,
                studentId,
                rosterStudentId: approvedRosterId,
                proofMethod: approvedProof,
              }
            : {}),
          submissionVersion: { increment: 1 },
        },
      });
      if (!changed.count) throw new ConflictException('申请已被处理，请刷新');
      await tx.studentVerificationEvent.create({
        data: {
          schoolId: record.schoolId,
          rosterStudentId: record.rosterStudentId,
          userId,
          actorId: operatorId,
          action: status,
          submissionVersion: dto.submissionVersion,
          materialId: record.materialId,
          detail: {
            ...this.submissionSnapshot(record),
            reason,
            reviewedStudentId: studentId,
            reviewedRealName: realName,
            previousStatus: record.status,
            status,
          },
        },
      });
      if (status === 'APPROVED')
        await tx.userProfile.upsert({
          where: { userId },
          update: { school: record.schoolName },
          create: { userId, school: record.schoolName },
        });
      return tx.studentVerify.findUniqueOrThrow({
        where: { userId },
        include: identityInclude,
      });
    });
    await this.invalidate(userId);
    return { success: true, data: miniStudentIdentity(result) };
  }

  async enrollment(
    schoolId: string,
    studentId: string,
    dto: EnrollmentDto,
    operatorId: string,
  ) {
    const school = await this.schoolAccess(schoolId, operatorId);
    const users = await this.transaction(async (tx) => {
      await this.lockSchool(tx, schoolId, school.regionId);
      const changed = await tx.schoolStudent.updateMany({
        where: { id: studentId, schoolId, version: dto.version },
        data: { enrollmentStatus: dto.status, version: { increment: 1 } },
      });
      if (!changed.count) throw new ConflictException('名册状态已变化，请刷新');
      await tx.school.update({
        where: { id: schoolId },
        data: { rosterRevision: { increment: 1 } },
      });
      const records = await tx.studentVerify.findMany({
        where: { rosterStudentId: studentId },
        select: { userId: true },
      });
      if (dto.status !== 'ACTIVE') {
        await tx.studentVerify.updateMany({
          where: {
            rosterStudentId: studentId,
            status: { in: ['PENDING', 'APPROVED'] },
          },
          data: {
            status: 'REVOKED',
            remark: dto.reason,
            submissionVersion: { increment: 1 },
          },
        });
      }
      await tx.studentVerificationEvent.create({
        data: {
          schoolId,
          rosterStudentId: studentId,
          actorId: operatorId,
          action: 'ENROLLMENT',
          detail: {
            status: dto.status,
            reason: dto.reason,
            previousVersion: dto.version,
          },
        },
      });
      return records;
    });
    for (const user of users) await this.invalidate(user.userId);
    return { success: true };
  }

  async release(
    schoolId: string,
    studentId: string,
    dto: ReleaseStudentBindingDto,
    operatorId: string,
  ) {
    const school = await this.schoolAccess(schoolId, operatorId);
    if (dto.identityConfirmed !== true)
      throw new BadRequestException('解除绑定须由学校核实身份争议');
    const users = await this.transaction(async (tx) => {
      await this.lockSchool(tx, schoolId, school.regionId);
      const changed = await tx.schoolStudent.updateMany({
        where: { id: studentId, schoolId, version: dto.version },
        data: { boundUserId: null, boundAt: null, version: { increment: 1 } },
      });
      if (!changed.count) throw new ConflictException('绑定已变化，请刷新');
      const records = await tx.studentVerify.findMany({
        where: { rosterStudentId: studentId },
        select: { userId: true },
      });
      await tx.studentVerify.updateMany({
        where: { rosterStudentId: studentId },
        data: {
          status: 'REVOKED',
          remark: dto.reason,
          submissionVersion: { increment: 1 },
        },
      });

      await tx.studentVerificationEvent.create({
        data: {
          schoolId,
          rosterStudentId: studentId,
          actorId: operatorId,
          action: 'RELEASE_BINDING',
          detail: {
            reason: dto.reason,
            previousVersion: dto.version,
            affectedAccounts: records.map((v) => v.userId),
          },
        },
      });
      return records;
    });
    for (const user of users) await this.invalidate(user.userId);
    return { success: true };
  }
}
