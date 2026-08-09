import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/services/prisma.service';
import {
  parsePointBatch,
  parseFinishSession,
  parseMarker,
  parseStartSession,
  BINDING_RELATIONS,
  COLLECTION_TASK_STATUSES,
  CollectionTaskFilters,
  CreateCollectionTaskDto,
  CreateCollectionMarkerDto,
  FinishCollectionSessionDto,
  MarkerTemplateDto,
  parseTask,
  parseTemplate,
  StartCollectionSessionDto,
  UpdateCollectionTaskDto,
  UploadPointBatchDto,
} from './campus-map-collection.contract';

const ACCESS_CODE_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class CampusMapCollectionService {
  constructor(private readonly prisma: PrismaService) {}

  createTask(regionId: string, dto: CreateCollectionTaskDto, adminId: string) {
    const input = parseTask(dto);
    return this.prisma.campusMapCollectionTask.create({
      data: {
        regionId,
        name: input.name,
        instructions: input.instructions,
        status: input.status,
        createdBy: adminId,
        assignments: {
          create: input.collectorUserIds.map((userId) => ({ userId, assignedBy: adminId })),
        },
      },
      include: { assignments: true, _count: { select: { sessions: true } } },
    });
  }

  async listTasks(regionId: string, filters: CollectionTaskFilters = {}) {
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
    const status = filters.status ? String(filters.status) : undefined;
    if (status && !COLLECTION_TASK_STATUSES.includes(status as (typeof COLLECTION_TASK_STATUSES)[number])) {
      throw new BadRequestException('采集任务状态无效');
    }
    const where = { regionId, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.campusMapCollectionTask.findMany({
        where,
        include: { assignments: true, _count: { select: { sessions: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.campusMapCollectionTask.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getTask(regionId: string, taskId: string) {
    const task = await this.prisma.campusMapCollectionTask.findFirst({
      where: { id: taskId, regionId },
      include: {
        assignments: true,
        sessions: {
          orderBy: { startedAt: 'desc' },
          include: { _count: { select: { points: true, markers: true, attachments: true } } },
        },
      },
    });
    if (!task) throw new NotFoundException('采集任务不存在');
    return task;
  }

  async getSession(regionId: string, taskId: string, sessionId: string) {
    const session = await this.prisma.campusMapCollectionSession.findFirst({
      where: { id: sessionId, taskId, task: { regionId } },
      include: {
        points: { orderBy: { recordedAt: 'asc' }, take: 5_000 },
        markers: { orderBy: { recordedAt: 'asc' }, include: { bindings: true, attachments: true } },
        attachments: true,
      },
    });
    if (!session) throw new NotFoundException('采集会话不存在');
    return session;
  }

  async updateTask(regionId: string, taskId: string, dto: UpdateCollectionTaskDto, adminId: string) {
    const current = await this.prisma.campusMapCollectionTask.findFirst({
      where: { id: taskId, regionId },
      include: { assignments: true },
    });
    if (!current) throw new NotFoundException('采集任务不存在');
    const collectorUserIds = dto.collectorUserIds === undefined
      ? current.assignments.map((item) => item.userId)
      : dto.collectorUserIds;
    const input = parseTask({
      name: dto.name ?? current.name,
      instructions: dto.instructions ?? current.instructions ?? undefined,
      status: dto.status ?? current.status,
      collectorUserIds,
    });
    return this.prisma.$transaction(async (tx) => {
      if (dto.collectorUserIds !== undefined) {
        await tx.campusMapCollectionAssignment.deleteMany({ where: { taskId } });
        if (input.collectorUserIds.length) {
          await tx.campusMapCollectionAssignment.createMany({
            data: input.collectorUserIds.map((userId) => ({ taskId, userId, assignedBy: adminId })),
          });
        }
      }
      return tx.campusMapCollectionTask.update({
        where: { id: taskId },
        data: { name: input.name, instructions: input.instructions, status: input.status },
        include: { assignments: true, _count: { select: { sessions: true } } },
      });
    });
  }

  listTemplates(regionId: string) {
    return this.prisma.campusMapMarkerTemplate.findMany({
      where: { OR: [{ regionId: null }, { regionId }] },
      orderBy: [{ pinned: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createTemplate(regionId: string, dto: MarkerTemplateDto, adminId: string) {
    const input = parseTemplate(dto);
    return this.prisma.campusMapMarkerTemplate.create({
      data: {
        ...input,
        regionId,
        fieldSchema: input.fieldSchema as Prisma.InputJsonValue,
        allowedBindings: input.allowedBindings as Prisma.InputJsonValue,
        createdBy: adminId,
      },
    });
  }

  async updateTemplate(regionId: string, templateId: string, dto: Partial<MarkerTemplateDto>, adminId: string) {
    const current = await this.prisma.campusMapMarkerTemplate.findFirst({ where: { id: templateId, regionId } });
    if (!current) throw new NotFoundException('标记模板不存在');
    const input = parseTemplate({
      label: dto.label ?? current.label,
      description: dto.description ?? current.description ?? undefined,
      icon: dto.icon ?? current.icon ?? undefined,
      color: dto.color ?? current.color ?? undefined,
      behavior: dto.behavior ?? current.behavior,
      fieldSchema: dto.fieldSchema ?? current.fieldSchema as Array<Record<string, unknown>>,
      allowedBindings: dto.allowedBindings ?? current.allowedBindings as MarkerTemplateDto['allowedBindings'],
      pinned: dto.pinned ?? current.pinned,
      requirePhoto: dto.requirePhoto ?? current.requirePhoto,
      requireNote: dto.requireNote ?? current.requireNote,
      requireStationarySample: dto.requireStationarySample ?? current.requireStationarySample,
      enabled: dto.enabled ?? current.enabled,
      sortOrder: dto.sortOrder ?? current.sortOrder,
    });
    return this.prisma.campusMapMarkerTemplate.update({
      where: { id: templateId },
      data: {
        ...input,
        fieldSchema: input.fieldSchema as Prisma.InputJsonValue,
        allowedBindings: input.allowedBindings as Prisma.InputJsonValue,
        updatedBy: adminId,
      },
    });
  }

  async rotateAccessCode(regionId: string, taskId: string, _adminId: string) {
    const task = await this.prisma.campusMapCollectionTask.findFirst({ where: { id: taskId, regionId } });
    if (!task) throw new NotFoundException('采集任务不存在');

    const accessCode = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ACCESS_CODE_TTL_MS);
    await this.prisma.campusMapCollectionTask.update({
      where: { id: taskId },
      data: {
        accessCodeHash: createHash('sha256').update(accessCode).digest('hex'),
        accessCodeExpiresAt: expiresAt,
      },
    });
    return { accessCode, expiresAt };
  }

  async resolveCollectorContext(accessCode: string, userId: string) {
    const code = String(accessCode || '').trim();
    if (!code) throw new BadRequestException('缺少采集任务码');
    const task = await this.prisma.campusMapCollectionTask.findFirst({
      where: { accessCodeHash: createHash('sha256').update(code).digest('hex') },
      include: { assignments: true },
    });
    if (!task) throw new BadRequestException('采集任务码无效');
    if (!task.accessCodeExpiresAt || task.accessCodeExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('采集任务码已过期');
    }
    if (!['ready', 'collecting'].includes(task.status)) throw new BadRequestException('采集任务当前不可执行');
    if (!task.assignments.some((item) => item.userId === userId)) throw new ForbiddenException('你未被分配到这个采集任务');

    const templates = await this.prisma.campusMapMarkerTemplate.findMany({
      where: {
        enabled: true,
        OR: [{ regionId: null }, { regionId: task.regionId }],
      },
      orderBy: [{ pinned: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const { accessCodeHash, accessCodeExpiresAt, assignments, ...safeTask } = task;
    return { task: safeTask, templates, accessCodeExpiresAt };
  }

  async startSession(taskId: string, userId: string, dto: StartCollectionSessionDto) {
    const input = parseStartSession(dto);
    const existing = await this.prisma.campusMapCollectionSession.findUnique({
      where: { clientSessionId: input.clientSessionId },
    });
    if (existing) {
      if (existing.taskId !== taskId || existing.collectorUserId !== userId) {
        throw new ForbiddenException('客户端会话标识已被占用');
      }
      return existing;
    }

    const task = await this.prisma.campusMapCollectionTask.findFirst({
      where: {
        id: taskId,
        status: { in: ['ready', 'collecting'] },
        assignments: { some: { userId } },
      },
      select: { id: true },
    });
    if (!task) throw new ForbiddenException('无权开始这个采集任务');
    return this.prisma.campusMapCollectionSession.create({
      data: {
        taskId,
        collectorUserId: userId,
        ...input,
        device: input.device as Prisma.InputJsonValue,
      },
    });
  }

  async uploadPointBatch(sessionId: string, userId: string, batchNo: number, dto: UploadPointBatchDto) {
    const input = parsePointBatch(batchNo, dto);
    const session = await this.prisma.campusMapCollectionSession.findFirst({
      where: {
        id: sessionId,
        collectorUserId: userId,
        status: { in: ['recording', 'paused', 'uploading'] },
      },
      select: { id: true, lastBatchNo: true },
    });
    if (!session) throw new ForbiddenException('无权上传这个采集会话');

    return this.prisma.$transaction(async (tx) => {
      await tx.campusMapCollectionPoint.createMany({
        data: input.points.map((point) => ({
          sessionId,
          clientPointId: point.clientPointId,
          batchNo,
          pointSeq: point.pointSeq,
          recordedAt: point.recordedAt,
          longitude: point.longitude,
          latitude: point.latitude,
          accuracy: point.accuracy,
          speed: point.speed,
          heading: point.heading,
          altitude: point.altitude,
          raw: point.raw as Prisma.InputJsonValue | undefined,
        })),
        skipDuplicates: true,
      });
      const [stored, pointCount] = await Promise.all([
        tx.campusMapCollectionPoint.findMany({
          where: { sessionId, batchNo },
          select: { clientPointId: true },
          orderBy: { pointSeq: 'asc' },
        }),
        tx.campusMapCollectionPoint.count({ where: { sessionId } }),
      ]);
      await tx.campusMapCollectionSession.update({
        where: { id: sessionId },
        data: {
          pointCount,
          lastBatchNo: Math.max(session.lastBatchNo, batchNo),
        },
      });
      return {
        batchNo,
        acknowledgedPointIds: stored.map((point) => point.clientPointId),
        pointCount,
      };
    });
  }

  async finishSession(sessionId: string, userId: string, dto: FinishCollectionSessionDto) {
    const input = parseFinishSession(dto);
    const session = await this.prisma.campusMapCollectionSession.findFirst({
      where: { id: sessionId, collectorUserId: userId },
    });
    if (!session) throw new ForbiddenException('无权完成这个采集会话');
    if (session.status === 'completed' && session.uploadComplete) return session;

    return this.prisma.$transaction(async (tx) => {
      const [pointCount, markerCount] = await Promise.all([
        tx.campusMapCollectionPoint.count({ where: { sessionId } }),
        tx.campusMapCollectionMarker.count({ where: { sessionId } }),
      ]);
      if (pointCount !== input.clientPointCount || markerCount !== input.clientMarkerCount) {
        throw new ConflictException({
          message: '仍有采集数据未完成上传',
          serverPointCount: pointCount,
          serverMarkerCount: markerCount,
        });
      }
      return tx.campusMapCollectionSession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          endedAt: input.endedAt,
          pointCount,
          markerCount,
          uploadComplete: true,
        },
      });
    });
  }

  async createMarker(sessionId: string, userId: string, dto: CreateCollectionMarkerDto) {
    const input = parseMarker(dto);
    const session = await this.prisma.campusMapCollectionSession.findFirst({
      where: {
        id: sessionId,
        collectorUserId: userId,
        status: { in: ['recording', 'paused', 'uploading'] },
      },
      include: { task: { select: { regionId: true } } },
    });
    if (!session) throw new ForbiddenException('无权添加这个采集会话的标记');

    const existing = await this.prisma.campusMapCollectionMarker.findUnique({
      where: { sessionId_clientMarkerId: { sessionId, clientMarkerId: input.clientMarkerId } },
      include: { bindings: true, attachments: true },
    });
    if (existing) return existing;

    const template = await this.prisma.campusMapMarkerTemplate.findFirst({
      where: {
        id: input.templateId,
        enabled: true,
        OR: [{ regionId: null }, { regionId: session.task.regionId }],
      },
    });
    if (!template) throw new BadRequestException('标记模板不存在或已停用');
    if (template.requirePhoto && input.attachments.length === 0) throw new BadRequestException('这个标记需要现场照片');
    if (template.requireNote && !input.note) throw new BadRequestException('这个标记需要填写备注');
    if (template.requireStationarySample && Number(input.stationarySampleCount || 0) < 3) {
      throw new BadRequestException('这个标记需要至少三次站定采样');
    }

    const allowed = template.allowedBindings as { targetTypes?: unknown; relationTypes?: unknown };
    const targetTypes = Array.isArray(allowed?.targetTypes) ? allowed.targetTypes.map(String) : [];
    const relationTypes = Array.isArray(allowed?.relationTypes) ? allowed.relationTypes.map(String) : [];
    for (const binding of input.bindings) {
      if (!targetTypes.includes(binding.targetType) || !relationTypes.includes(binding.relationType)
        || !BINDING_RELATIONS.includes(binding.relationType as (typeof BINDING_RELATIONS)[number])) {
        throw new BadRequestException('标记绑定不符合模板约束');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const marker = await tx.campusMapCollectionMarker.create({
        data: {
          sessionId,
          templateId: template.id,
          clientMarkerId: input.clientMarkerId,
          templateLabelSnapshot: template.label,
          templateIconSnapshot: template.icon,
          templateColorSnapshot: template.color,
          behaviorSnapshot: template.behavior,
          longitude: input.longitude,
          latitude: input.latitude,
          accuracy: input.accuracy,
          recordedAt: input.recordedAt,
          fieldValues: input.fieldValues as Prisma.InputJsonValue,
          note: input.note,
          bindings: { create: input.bindings },
          attachments: {
            create: input.attachments.map((attachment) => ({
              kind: attachment.kind || 'photo',
              url: attachment.url,
              storageKey: attachment.storageKey,
              mimeType: attachment.mimeType,
              byteSize: attachment.byteSize || 0,
              checksum: attachment.checksum,
              metadata: attachment.metadata as Prisma.InputJsonValue | undefined,
            })),
          },
        },
      });
      const markerCount = await tx.campusMapCollectionMarker.count({ where: { sessionId } });
      await tx.campusMapCollectionSession.update({ where: { id: sessionId }, data: { markerCount } });
      return marker;
    });
  }
}
