import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../common/services/prisma.service";
import {
  parsePointBatch,
  parseFinishSession,
  parseMarker,
  parseCollectionObject,
  parseObjectReview,
  parseStartSession,
  BINDING_RELATIONS,
  COLLECTION_TASK_STATUSES,
  CollectionTaskFilters,
  CreateCollectionTaskDto,
  CreateCollectionMarkerDto,
  CreateCollectionObjectDto,
  FinishCollectionSessionDto,
  MarkerTemplateDto,
  ReviewCollectionObjectDto,
  parseTask,
  parseTemplate,
  StartCollectionSessionDto,
  UpdateCollectionTaskDto,
  UploadPointBatchDto,
  validateMarkerFieldValues,
} from "./campus-map-collection.contract";

const ACCESS_CODE_TTL_MS = 30 * 60 * 1000;
const PLACE_PHOTO_SESSION_TOLERANCE_MS = 2 * 60 * 1000;
const MAX_PLACE_PHOTO_ACCURACY_METERS = 20;
const MAX_PLACE_PHOTO_DISTANCE_METERS = 20;
const PLACE_CALIBRATION_APPLY_VERSION = 1;

type CampusPlaceTarget = {
  id: string;
  title: string;
  semanticType: string;
  officialNumber: number | null;
  mapX: number | null;
  mapY: number | null;
  longitude: number | null;
  latitude: number | null;
};

type PlaceVerificationResult = {
  acceptedLongitude: number;
  acceptedLatitude: number;
  acceptedAccuracy: number;
  acceptedRecordedAt: Date;
  locationVerification: {
    acceptedSampleCount: number;
    goodSampleCount: number;
    medianLongitude: number;
    medianLatitude: number;
    medianAccuracy: number;
    maximumDrift: number;
    candidateDelta: number;
    clientPointIds: string[];
    firstSampleAt: string;
    lastSampleAt: string;
    source: "server_ack";
  };
  photoVerification: {
    validatedPhotoCount: number;
    evidenceTypes: string[];
    maximumCandidateDistance: number;
    maximumMedianDistance: number;
    sessionToleranceSeconds: number;
  };
};

/** 骑手端参考底图的单个要素（已统一为 GCJ-02 经纬度） */
type RiderReferenceFeature = {
  id: string;
  title: string;
  semanticType: string;
  officialNumber: number | null;
  kind: "road" | "building" | "poi";
  targeted: boolean;
  points: Array<{ longitude: number; latitude: number }>;
};

type TrustedRouteJunction = {
  key: string;
  longitude: number;
  latitude: number;
  accuracy: number;
  pointId: string;
  sourceObjectId: string;
  sourceEndpoint: "start" | "end";
  label: string;
};

/** 参考底图上限，避免骑手端一次拉取过大 */
const MAX_REFERENCE_FEATURES = 400;
const MAX_REFERENCE_POINTS_PER_FEATURE = 120;

function solveThreeByThree(matrix: number[][], values: number[]) {
  const rows = matrix.map((row, index) => row.concat(values[index]));
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-12) return null;
    if (pivot !== column) [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let index = column; index < 4; index += 1) rows[column][index] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let index = column; index < 4; index += 1) rows[row][index] -= factor * rows[column][index];
    }
  }
  return rows.map((row) => row[3]);
}

export function projectGpsToManifestPoint(manifest: any, longitude: number, latitude: number) {
  const points = (Array.isArray(manifest?.positioning?.calibrationPoints)
    ? manifest.positioning.calibrationPoints
    : [])
    .map((point: any) => ({
      longitude: Number(point.longitude ?? point.lng),
      latitude: Number(point.latitude ?? point.lat),
      mapX: Number(point.mapX ?? point.x),
      mapY: Number(point.mapY ?? point.y),
    }))
    .filter((point: any) => Object.values(point).every(Number.isFinite));
  if (manifest?.positioning?.enabled !== true || points.length < 3) return null;
  const centerLng = points.reduce((sum: number, point: any) => sum + point.longitude, 0) / points.length;
  const centerLat = points.reduce((sum: number, point: any) => sum + point.latitude, 0) / points.length;
  const rows: number[][] = points.map((point: any) => [point.longitude - centerLng, point.latitude - centerLat, 1]);
  const normal = [0, 1, 2].map((row) => [0, 1, 2].map((column) => rows.reduce((sum: number, item: number[]) => sum + item[row] * item[column], 0)));
  const products = (key: "mapX" | "mapY") => [0, 1, 2].map((column) => rows.reduce((sum: number, item: number[], index: number) => sum + item[column] * points[index][key], 0));
  const xModel = solveThreeByThree(normal, products("mapX"));
  const yModel = solveThreeByThree(normal, products("mapY"));
  if (!xModel || !yModel) return null;
  const lng = longitude - centerLng;
  const lat = latitude - centerLat;
  return {
    x: xModel[0] * lng + xModel[1] * lat + xModel[2],
    y: yModel[0] * lng + yModel[1] * lat + yModel[2],
  };
}

/**
 * 反投影：图片/矢量底图坐标 -> GCJ-02 经纬度。
 * 与 projectGpsToManifestPoint 互为逆运算，用同一批校准点拟合仿射模型。
 * 校准点少于 3 个时返回 null（无法解三元一次方程组）。
 */
function buildManifestToGpsProjector(manifest: any) {
  const points = (Array.isArray(manifest?.positioning?.calibrationPoints)
    ? manifest.positioning.calibrationPoints
    : [])
    .map((point: any) => ({
      longitude: Number(point.longitude ?? point.lng),
      latitude: Number(point.latitude ?? point.lat),
      mapX: Number(point.mapX ?? point.x),
      mapY: Number(point.mapY ?? point.y),
    }))
    .filter((point: any) => Object.values(point).every(Number.isFinite));
  if (points.length < 3) return null;

  const centerX = points.reduce((sum: number, p: any) => sum + p.mapX, 0) / points.length;
  const centerY = points.reduce((sum: number, p: any) => sum + p.mapY, 0) / points.length;
  const rows: number[][] = points.map((p: any) => [p.mapX - centerX, p.mapY - centerY, 1]);
  const normal = [0, 1, 2].map((row) =>
    [0, 1, 2].map((column) => rows.reduce((sum: number, item: number[]) => sum + item[row] * item[column], 0)),
  );
  const products = (key: "longitude" | "latitude") =>
    [0, 1, 2].map((column) => rows.reduce((sum: number, item: number[], index: number) => sum + item[column] * points[index][key], 0));
  const lngModel = solveThreeByThree(normal, products("longitude"));
  const latModel = solveThreeByThree(normal, products("latitude"));
  if (!lngModel || !latModel) return null;

  return (mapX: number, mapY: number) => {
    const x = mapX - centerX;
    const y = mapY - centerY;
    return {
      longitude: lngModel[0] * x + lngModel[1] * y + lngModel[2],
      latitude: latModel[0] * x + latModel[1] * y + latModel[2],
    };
  };
}

function isValidLngLat(longitude: unknown, latitude: unknown) {
  const lng = Number(longitude);
  const lat = Number(latitude);
  return Number.isFinite(lng) && Number.isFinite(lat)
    && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
    && !(lng === 0 && lat === 0);
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasNonCollinearPairs(
  points: Array<Record<string, any>>,
  xKey: string,
  yKey: string,
  tolerance: number,
) {
  for (let first = 0; first < points.length - 2; first += 1) {
    for (let second = first + 1; second < points.length - 1; second += 1) {
      for (let third = second + 1; third < points.length; third += 1) {
        const a = points[first];
        const b = points[second];
        const c = points[third];
        const twiceArea = (Number(b[xKey]) - Number(a[xKey])) * (Number(c[yKey]) - Number(a[yKey]))
          - (Number(c[xKey]) - Number(a[xKey])) * (Number(b[yKey]) - Number(a[yKey]));
        if (Number.isFinite(twiceArea) && Math.abs(twiceArea) > tolerance) return true;
      }
    }
  }
  return false;
}

function calibrationPointsReady(points: Array<Record<string, any>>) {
  const valid = points.map((point) => ({
    mapX: finiteNumber(point?.mapX ?? point?.x),
    mapY: finiteNumber(point?.mapY ?? point?.y),
    longitude: finiteNumber(point?.longitude ?? point?.lng),
    latitude: finiteNumber(point?.latitude ?? point?.lat),
  })).filter((point) =>
    point.mapX !== null
    && point.mapY !== null
    && isValidLngLat(point.longitude, point.latitude)) as Array<Record<string, any>>;
  return valid.length >= 3
    && hasNonCollinearPairs(valid, "mapX", "mapY", 1e-10)
    && hasNonCollinearPairs(valid, "longitude", "latitude", 1e-12);
}

function canonicalJson(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .reduce((result, key) => {
      result[key] = canonicalJson(value[key]);
      return result;
    }, {} as Record<string, any>);
}

function sameJson(left: any, right: any) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

export function isNativeGcj02Manifest(manifest: any) {
  const coordinateSystem = manifest?.coordinateSystem && typeof manifest.coordinateSystem === "object"
    ? manifest.coordinateSystem
    : {};
  const type = String(coordinateSystem.type || manifest?.baseSource || "").trim().toLowerCase();
  const source = String(coordinateSystem.source || "").trim().toLowerCase();
  const unit = String(coordinateSystem.unit || "").trim().toLowerCase();
  // CAD/image/projected manifests always store canvas coordinates, even though
  // their calibration output and rider samples are GCJ-02.
  if (["image", "cad-vector", "projected"].includes(type)) return false;
  return type === "amap"
    || type === "gcj02"
    || source === "gcj02"
    || unit === "degree"
    || String(manifest?.amap?.provider || "").trim().toLowerCase() === "amap";
}

function distanceMeters(
  left: { longitude: number; latitude: number },
  right: { longitude: number; latitude: number },
) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function median(numbers: number[]) {
  const sorted = [...numbers].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

@Injectable()
export class CampusMapCollectionService {
  constructor(private readonly prisma: PrismaService) {}

  async createTask(
    regionId: string,
    dto: CreateCollectionTaskDto,
    adminId: string,
  ) {
    const input = parseTask(dto);
    await this.assertTargetPlaces(regionId, input.targetPlaceIds);
    await this.assertTargetFeatures(regionId, input.targetFeatureIds);
    const linkedPlaceIds = await this.resolveDatabasePlaceIds(regionId, input.targetPlaceIds);
    this.assertStableTargetPlaces(input.targetPlaceIds, linkedPlaceIds);
    await this.assertRiderOnlyAssignments(
      regionId,
      input.allowedClients,
      input.collectorUserIds,
    );
    return this.prisma.campusMapCollectionTask.create({
      data: {
        regionId,
        name: input.name,
        instructions: input.instructions,
        status: input.status,
        taskType: input.taskType,
        allowedClients: input.allowedClients as Prisma.InputJsonValue,
        objectTypes: input.objectTypes as Prisma.InputJsonValue,
        targetPlaceIds: input.targetPlaceIds as Prisma.InputJsonValue,
        targetFeatureIds: input.targetFeatureIds as Prisma.InputJsonValue,
        boundary: input.boundary as Prisma.InputJsonValue | undefined,
        priority: input.priority,
        dueAt: input.dueAt,
        createdBy: adminId,
        assignments: {
          create: input.collectorUserIds.map((userId) => ({
            userId,
            assignedBy: adminId,
          })),
        },
        placeLinks: {
          create: linkedPlaceIds.map((placeId, sortOrder) => ({ placeId, sortOrder })),
        },
      },
      include: { assignments: true, placeLinks: true, _count: { select: { sessions: true } } },
    });
  }

  async listTasks(regionId: string, filters: CollectionTaskFilters = {}) {
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
    const status = filters.status ? String(filters.status) : undefined;
    if (
      status &&
      !COLLECTION_TASK_STATUSES.includes(
        status as (typeof COLLECTION_TASK_STATUSES)[number],
      )
    ) {
      throw new BadRequestException("采集任务状态无效");
    }
    const where = { regionId, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.campusMapCollectionTask.findMany({
        where,
        include: { assignments: true, _count: { select: { sessions: true } } },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.campusMapCollectionTask.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async listRiderTasks(userId: string) {
    const rider = await this.requireOfficialRider(userId);
    const tasks = await this.prisma.campusMapCollectionTask.findMany({
      where: {
        regionId: rider.regionId,
        status: { in: ["ready", "collecting"] },
        assignments: { some: { userId } },
      },
      select: {
        id: true,
        regionId: true,
        name: true,
        instructions: true,
        status: true,
        taskType: true,
        allowedClients: true,
        objectTypes: true,
        targetPlaceIds: true,
        targetFeatureIds: true,
        priority: true,
        dueAt: true,
        sessions: {
          where: { collectorUserId: userId },
          select: {
            id: true,
            clientSessionId: true,
            status: true,
            objects: {
              where: { reviewStatus: "resample" },
              select: {
                id: true,
                clientObjectId: true,
                objectType: true,
                properties: true,
                reviewNote: true,
                reviewedAt: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return Promise.all(tasks
      .filter((task) => this.jsonStringArray(task.allowedClients).includes("rider_app"))
      .map(async (task) => this.toRiderTask(
        task,
        await this.resolveTargetPlaces(task.regionId, this.jsonStringArray(task.targetPlaceIds)),
      )));
  }

  async getRiderTask(userId: string, taskId: string) {
    const rider = await this.requireOfficialRider(userId);
    const task = await this.prisma.campusMapCollectionTask.findFirst({
      where: {
        id: taskId,
        regionId: rider.regionId,
        status: { in: ["ready", "collecting"] },
        assignments: { some: { userId } },
      },
      select: {
        id: true,
        regionId: true,
        name: true,
        instructions: true,
        status: true,
        taskType: true,
        allowedClients: true,
        objectTypes: true,
        targetPlaceIds: true,
        targetFeatureIds: true,
        priority: true,
        dueAt: true,
        sessions: {
          where: { collectorUserId: userId },
          select: {
            id: true,
            clientSessionId: true,
            status: true,
            objects: {
              where: { reviewStatus: "resample" },
              select: {
                id: true,
                clientObjectId: true,
                objectType: true,
                properties: true,
                reviewNote: true,
                reviewedAt: true,
              },
            },
          },
        },
      },
    });
    if (
      !task ||
      !this.jsonStringArray(task.allowedClients).includes("rider_app")
    ) {
      throw new NotFoundException("采集任务不存在或未分配给你");
    }
    const templates = await this.prisma.campusMapMarkerTemplate.findMany({
      where: {
        enabled: true,
        OR: [{ regionId: null }, { regionId: rider.regionId }],
      },
      orderBy: [{ pinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const manifest = await this.loadRegionManifest(task.regionId);
    const trustedJunctions = await this.loadTrustedRouteJunctions(this.prisma, task.regionId, manifest);
    return {
      task: this.toRiderTask(
        task,
        await this.resolveTargetPlaces(task.regionId, this.jsonStringArray(task.targetPlaceIds)),
      ),
      templates: templates.map((template) =>
        this.toCollectorTemplate(template),
      ),
      // 现场参考底图：让骑手看到校园矢量图，判断路线是否走对
      referenceMap: this.buildRiderReferenceMap(
        manifest,
        this.jsonStringArray(task.targetFeatureIds),
      ),
      // 已审核路口与底图校准是两个独立能力。即使 CAD 底图暂不可投影，骑手仍可
      // 在路线表单里显式选择附近路口，形成跨会话、分叉和闭环拓扑。
      junctionCatalog: {
        version: 1,
        coordinateType: "gcj02",
        linkRadiusMeters: 12,
        items: trustedJunctions.map((junction) => ({
          anchorKey: junction.key,
          longitude: junction.longitude,
          latitude: junction.latitude,
          label: junction.label,
        })),
      },
    };
  }

  async getTask(regionId: string, taskId: string) {
    const task = await this.prisma.campusMapCollectionTask.findFirst({
      where: { id: taskId, regionId },
      include: {
        assignments: true,
        sessions: {
          orderBy: { startedAt: "desc" },
          include: {
            _count: {
              select: {
                points: true,
                markers: true,
                objects: true,
                attachments: true,
              },
            },
          },
        },
      },
    });
    if (!task) throw new NotFoundException("采集任务不存在");
    return task;
  }

  async getSession(regionId: string, taskId: string, sessionId: string) {
    const session = await this.prisma.campusMapCollectionSession.findFirst({
      where: { id: sessionId, taskId, task: { regionId } },
      include: {
        points: { orderBy: { recordedAt: "asc" }, take: 5_000 },
        markers: {
          orderBy: { recordedAt: "asc" },
          include: { bindings: true, attachments: true },
        },
        objects: {
          orderBy: { recordedAt: "asc" },
          include: { attachments: true },
        },
        attachments: true,
      },
    });
    if (!session) throw new NotFoundException("采集会话不存在");
    return {
      ...session,
      objects: this.attachEvidenceMarkers(session.objects, session.markers),
    };
  }

  async reviewCollectionObject(
    regionId: string,
    objectId: string,
    dto: ReviewCollectionObjectDto,
    adminId: string,
  ) {
    const input = parseObjectReview(dto);
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.campusMapCollectionObject.findFirst({
        where: { id: objectId, session: { task: { regionId } } },
        include: {
          attachments: true,
          session: {
            select: {
              id: true,
              taskId: true,
              startedAt: true,
              endedAt: true,
              task: { select: { id: true, taskType: true, status: true } },
            },
          },
        },
      });
      if (!snapshot) throw new NotFoundException("采集对象不存在");
      if (snapshot.session?.task?.status === "cancelled") {
        throw new ConflictException("采集任务已取消，不能审核或合并采集对象");
      }
      const taskId = String(snapshot.session?.taskId || "");
      const sessionId = String(snapshot.sessionId || snapshot.session?.id || "");
      const taskStatus = String(snapshot.session?.task?.status || "");
      if (!taskId || !sessionId || !taskStatus) {
        throw new ConflictException("采集对象关联的任务或会话不完整，请刷新后重试");
      }
      // 审核与骑手写入使用同一锁顺序：任务 → 会话 → 对象。对象锁还带上审核快照，
      // 防止两个管理员同时从 pending 出发，分别把同一对象“通过并合并”和“要求重采”。
      const taskClaim = await tx.campusMapCollectionTask.updateMany({
        where: { id: taskId, status: taskStatus },
        data: { status: taskStatus },
      });
      if (taskClaim.count !== 1) {
        throw new ConflictException("采集任务状态已变化，本次审核未保存，请刷新后重试");
      }
      const sessionClaim = await tx.campusMapCollectionSession.updateMany({
        where: { id: sessionId, taskId },
        data: { lastBatchNo: { increment: 0 } },
      });
      if (sessionClaim.count !== 1) {
        throw new ConflictException("采集会话状态已变化，本次审核未保存，请刷新后重试");
      }
      const objectClaim = await tx.campusMapCollectionObject.updateMany({
        where: {
          id: objectId,
          sessionId,
          reviewStatus: snapshot.reviewStatus,
          appliedToDraftAt: snapshot.appliedToDraftAt || null,
        },
        data: { reviewStatus: snapshot.reviewStatus },
      });
      if (objectClaim.count !== 1) {
        throw new ConflictException("采集对象已被其他审核员处理，本次审核未保存，请刷新后重试");
      }
      const object = await tx.campusMapCollectionObject.findFirst({
        where: { id: objectId, sessionId, session: { task: { regionId } } },
        include: {
          attachments: true,
          session: {
            select: {
              id: true,
              taskId: true,
              startedAt: true,
              endedAt: true,
              task: { select: { id: true, taskType: true, status: true } },
            },
          },
        },
      });
      if (!object) throw new ConflictException("采集对象状态已变化，本次审核未保存，请刷新后重试");
      if (object.session?.task?.status === "cancelled") {
        throw new ConflictException("采集任务已取消，不能审核或合并采集对象");
      }
      if (input.decision !== "approved" && object.appliedToDraftAt) {
        throw new ConflictException("该对象已合并到地图草稿，不能直接降级审核状态；请先在草稿中删除对应变更后再新建复核记录");
      }
      const reviewedAt = new Date();
      let draftApply: Record<string, any> = { applied: false, reason: "review_only" };
      if (input.decision === "approved") {
        draftApply = await this.applyApprovedObject(tx, regionId, object, input, adminId, reviewedAt);
      }
      const reviewed = await tx.campusMapCollectionObject.update({
        where: { id: objectId },
        data: {
          reviewStatus: input.decision,
          reviewNote: input.note,
          reviewedBy: adminId,
          reviewedAt,
          ...(draftApply.applied ? {
            appliedToDraftAt: reviewedAt,
            appliedDraftId: draftApply.draftId,
            appliedDraftRevision: draftApply.draftRevision,
            applyFingerprint: draftApply.fingerprint,
            applyResult: draftApply as Prisma.InputJsonValue,
          } : {}),
        },
      });
      if (object.session?.taskId) {
        const [unresolved, task] = await Promise.all([
          tx.campusMapCollectionObject.count({
            where: {
              session: { taskId: object.session.taskId },
              reviewStatus: { in: ["pending", "resample", "held"] },
            },
          }),
          tx.campusMapCollectionTask.findUnique({
            where: { id: object.session.taskId },
            include: {
              assignments: { select: { userId: true } },
              sessions: { select: { id: true, collectorUserId: true, status: true, uploadComplete: true } },
            },
          }),
        ]);
        if (task) {
          if (task.status === "cancelled") {
            throw new ConflictException("采集任务已取消，不能审核或合并采集对象");
          }
          const completedCollectors = new Set(
            task.sessions
              .filter((item: any) => item.status === "completed" && item.uploadComplete)
              .map((item: any) => item.collectorUserId),
          );
          const allAssignmentsCompleted = task.assignments.length === 0
            || task.assignments.every((assignment: any) => completedCollectors.has(assignment.userId));
          const hasActiveSession = task.sessions.some((item: any) =>
            ["recording", "paused", "uploading", "finishing"].includes(item.status),
          );
          const status = input.decision === "resample" || hasActiveSession || !allAssignmentsCompleted
            ? "collecting"
            : unresolved > 0 ? "review" : "completed";
          const taskUpdated = await tx.campusMapCollectionTask.updateMany({
            where: { id: object.session.taskId, status: { not: "cancelled" } },
            data: { status },
          });
          if (taskUpdated.count !== 1) {
            throw new ConflictException("采集任务已取消，审核结果未保存");
          }
        }
      }
      return { ...reviewed, draftApply };
    });
  }

  async listObjects(
    regionId: string,
    filters: {
      reviewStatus?: string;
      taskId?: string;
      objectType?: string;
      page: number;
      pageSize: number;
    },
  ) {
    const sessionWhere: Prisma.CampusMapCollectionSessionWhereInput = {
      task: { regionId },
    };
    if (filters.taskId) sessionWhere.taskId = filters.taskId;
    const where: Prisma.CampusMapCollectionObjectWhereInput = {
      session: sessionWhere,
      ...(filters.reviewStatus ? { reviewStatus: filters.reviewStatus } : {}),
      ...(filters.objectType ? { objectType: filters.objectType } : {}),
    };
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
    const [items, total] = await Promise.all([
      this.prisma.campusMapCollectionObject.findMany({
        where,
        include: {
          session: {
            select: {
              id: true,
              taskId: true,
              collectorUserId: true,
              startedAt: true,
              status: true,
              task: { select: { name: true, regionId: true } },
            },
          },
          attachments: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.campusMapCollectionObject.count({ where }),
    ]);
    const markerReferences: Array<{ sessionId: string; clientMarkerId: string }> = items.flatMap((object: any) =>
      this.markerClientIds(object).map((clientMarkerId) => ({
        sessionId: String(object.sessionId || object.session?.id || ""),
        clientMarkerId,
      }))).filter((reference) => reference.sessionId);
    const previousRouteObjectIds = [...new Set(items.flatMap((object: any) => {
      if (object?.objectType !== "road") return [];
      const properties = object?.properties && typeof object.properties === "object" && !Array.isArray(object.properties)
        ? object.properties as Record<string, unknown>
        : {};
      const previousRouteObjectId = String(properties.previousRouteObjectId || "").trim();
      return previousRouteObjectId ? [previousRouteObjectId] : [];
    }))];
    const [markers, previousRoutes] = await Promise.all([
      markerReferences.length
        ? this.prisma.campusMapCollectionMarker.findMany({
            where: { OR: markerReferences },
            include: { bindings: true, attachments: true, template: true },
          })
        : [],
      previousRouteObjectIds.length
        ? this.prisma.campusMapCollectionObject.findMany({
            where: {
              id: { in: previousRouteObjectIds },
              session: { task: { regionId } },
            },
            select: {
              id: true,
              sessionId: true,
              objectType: true,
              reviewStatus: true,
              appliedToDraftAt: true,
              properties: true,
              applyResult: true,
            },
          })
        : [],
    ]);
    const previousRouteById = new Map(previousRoutes.map((route: any) => [String(route.id), route]));
    const sharedSourceObjectIds = [...new Set(previousRoutes.flatMap((route: any) => {
      const applyResult = route?.applyResult && typeof route.applyResult === "object" && !Array.isArray(route.applyResult)
        ? route.applyResult as Record<string, any>
        : {};
      const anchors = applyResult.routeEndpointAnchors && typeof applyResult.routeEndpointAnchors === "object" && !Array.isArray(applyResult.routeEndpointAnchors)
        ? applyResult.routeEndpointAnchors as Record<string, any>
        : null;
      const sharedFromObjectId = String(anchors?.end?.sharedFromObjectId || "").trim();
      return sharedFromObjectId ? [sharedFromObjectId] : [];
    }))];
    const sharedSources = sharedSourceObjectIds.length
      ? await this.prisma.campusMapCollectionObject.findMany({
          where: {
            id: { in: sharedSourceObjectIds },
            objectType: "road",
            reviewStatus: "approved",
            appliedToDraftAt: { not: null },
            session: { task: { regionId, status: { not: "cancelled" } } },
          },
          select: { id: true, applyResult: true },
        })
      : [];
    const sharedSourceById = new Map(sharedSources.map((route: any) => [String(route.id), route]));
    const decoratedItems = this.attachEvidenceMarkers(items, markers).map((object: any) => {
      const routeDependency = this.routeDependencySummary(object, previousRouteById, sharedSourceById);
      return routeDependency ? { ...object, routeDependency } : object;
    });
    return { items: decoratedItems, total, page, pageSize };
  }

  async updateTask(
    regionId: string,
    taskId: string,
    dto: UpdateCollectionTaskDto,
    adminId: string,
  ) {
    const current = await this.prisma.campusMapCollectionTask.findFirst({
      where: { id: taskId, regionId },
      include: {
        assignments: true,
        sessions: { select: { id: true, status: true } },
      },
    });
    if (!current) throw new NotFoundException("采集任务不存在");
    const sessions = Array.isArray(current.sessions) ? current.sessions : [];
    const hasActiveSession = sessions.some((session) =>
      ["recording", "paused", "uploading", "finishing"].includes(session.status));
    const structuralChanges: Array<[unknown, unknown]> = [
      [dto.taskType, current.taskType],
      [dto.collectorUserIds, current.assignments.map((item) => item.userId)],
      [dto.allowedClients, this.jsonStringArray(current.allowedClients, ["miniapp"])],
      [dto.objectTypes, this.jsonStringArray(current.objectTypes, ["road"])],
      [dto.targetPlaceIds, this.jsonStringArray(current.targetPlaceIds)],
      [dto.targetFeatureIds, this.jsonStringArray(current.targetFeatureIds)],
      [dto.boundary, current.boundary],
    ];
    const changesStructure = structuralChanges.some(([requested, existing]) =>
      requested !== undefined && JSON.stringify(requested) !== JSON.stringify(existing));
    if (sessions.length && changesStructure) {
      throw new ConflictException("采集任务已产生会话，不能再修改类型、地点、采集人或采集范围；请新建任务");
    }
    if (dto.status === "completed" && current.status !== "completed") {
      throw new ConflictException("采集任务只能在全部上传与审核闭环后由系统标记完成");
    }
    if (hasActiveSession
      && dto.status !== undefined
      && dto.status !== current.status
      && dto.status !== "cancelled") {
      throw new ConflictException("存在正在采集或上传的会话，不能手动更改任务状态");
    }
    if (["completed", "cancelled"].includes(current.status)
      && dto.status !== undefined && dto.status !== current.status) {
      throw new ConflictException("已结束的采集任务不能重新打开");
    }
    if (dto.status === "cancelled" && current.status !== "cancelled") {
      return this.prisma.$transaction(async (tx) => {
        const cancelledAt = new Date();
        // 先锁定并取消任务，再释放会话租约；start/finish 使用相同锁顺序。
        const cancelled = await tx.campusMapCollectionTask.updateMany({
          where: {
            id: taskId,
            regionId,
            status: { notIn: ["completed", "cancelled"] },
          },
          data: { status: "cancelled" },
        });
        if (cancelled.count !== 1) {
          throw new ConflictException("采集任务状态已变化，取消失败");
        }
        await tx.campusMapCollectionSession.updateMany({
          where: {
            taskId,
            status: { in: ["recording", "paused", "uploading", "finishing"] },
          },
          data: {
            status: "abandoned",
            endedAt: cancelledAt,
            uploadComplete: false,
            activeKey: null,
          },
        });
        return tx.campusMapCollectionTask.findUnique({
          where: { id: taskId },
          include: { assignments: true, placeLinks: true, _count: { select: { sessions: true } } },
        });
      });
    }
    const collectorUserIds =
      dto.collectorUserIds === undefined
        ? current.assignments.map((item) => item.userId)
        : dto.collectorUserIds;
    const input = parseTask({
      name: dto.name ?? current.name,
      instructions: dto.instructions ?? current.instructions ?? undefined,
      status: dto.status ?? current.status,
      taskType: dto.taskType ?? current.taskType,
      collectorUserIds,
      allowedClients:
        dto.allowedClients ??
        this.jsonStringArray(current.allowedClients, ["miniapp"]),
      objectTypes:
        dto.objectTypes ?? this.jsonStringArray(current.objectTypes, ["road"]),
      targetPlaceIds:
        dto.targetPlaceIds ?? this.jsonStringArray(current.targetPlaceIds),
      targetFeatureIds:
        dto.targetFeatureIds ?? this.jsonStringArray(current.targetFeatureIds),
      boundary:
        dto.boundary ??
        (current.boundary as Record<string, unknown> | null),
      priority: dto.priority ?? current.priority,
      dueAt:
        dto.dueAt === undefined
          ? current.dueAt?.toISOString() ?? null
          : dto.dueAt,
    });
    await this.assertRiderOnlyAssignments(
      regionId,
      input.allowedClients,
      input.collectorUserIds,
    );
    await this.assertTargetPlaces(regionId, input.targetPlaceIds);
    await this.assertTargetFeatures(regionId, input.targetFeatureIds);
    const linkedPlaceIds = await this.resolveDatabasePlaceIds(regionId, input.targetPlaceIds);
    if (dto.targetPlaceIds !== undefined) {
      this.assertStableTargetPlaces(input.targetPlaceIds, linkedPlaceIds);
    }
    const taskData = {
      name: input.name,
      instructions: input.instructions,
      // 管理员只改名称/说明时不回写旧状态，避免把审核刚置为 completed 的任务复活。
      ...(dto.status === undefined ? {} : { status: input.status }),
      taskType: input.taskType,
      allowedClients: input.allowedClients as Prisma.InputJsonValue,
      objectTypes: input.objectTypes as Prisma.InputJsonValue,
      targetPlaceIds: input.targetPlaceIds as Prisma.InputJsonValue,
      targetFeatureIds: input.targetFeatureIds as Prisma.InputJsonValue,
      boundary:
        dto.boundary === undefined
          ? undefined
          : input.boundary === null
            ? Prisma.DbNull
            : (input.boundary as Prisma.InputJsonValue),
      priority: input.priority,
      dueAt: input.dueAt,
    };
    return this.prisma.$transaction(async (tx) => {
      // 用初读版本对任务行做 CAS 并持锁。startSession/取消任务也先锁任务，
      // 因此不会在骑手已开始采集后还换掉人员、目标或把状态覆盖回去。
      const claimedTask = await tx.campusMapCollectionTask.updateMany({
        where: {
          id: taskId,
          regionId,
          status: current.status,
          updatedAt: current.updatedAt,
        },
        data: { status: current.status },
      });
      if (claimedTask.count !== 1) {
        throw new ConflictException("采集任务已被其他操作更新，请刷新后重试");
      }
      if (dto.collectorUserIds !== undefined) {
        await tx.campusMapCollectionAssignment.deleteMany({
          where: { taskId },
        });
        if (input.collectorUserIds.length) {
          await tx.campusMapCollectionAssignment.createMany({
            data: input.collectorUserIds.map((userId) => ({
              taskId,
              userId,
              assignedBy: adminId,
            })),
          });
        }
      }
      if (dto.targetPlaceIds !== undefined) {
        await tx.campusMapCollectionTaskPlace.deleteMany({ where: { taskId } });
        if (linkedPlaceIds.length) {
          await tx.campusMapCollectionTaskPlace.createMany({
            data: linkedPlaceIds.map((placeId, sortOrder) => ({ taskId, placeId, sortOrder })),
          });
        }
      }
      return tx.campusMapCollectionTask.update({
        where: { id: taskId },
        data: taskData,
        include: { assignments: true, placeLinks: true, _count: { select: { sessions: true } } },
      });
    });
  }

  listTemplates(regionId: string) {
    return this.prisma.campusMapMarkerTemplate.findMany({
      where: { OR: [{ regionId: null }, { regionId }] },
      orderBy: [{ pinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async createTemplate(
    regionId: string,
    dto: MarkerTemplateDto,
    adminId: string,
  ) {
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

  async updateTemplate(
    regionId: string,
    templateId: string,
    dto: Partial<MarkerTemplateDto>,
    adminId: string,
  ) {
    const current = await this.prisma.campusMapMarkerTemplate.findFirst({
      where: { id: templateId, regionId },
    });
    if (!current) throw new NotFoundException("标记模板不存在");
    const input = parseTemplate({
      label: dto.label ?? current.label,
      description: dto.description ?? current.description ?? undefined,
      icon: dto.icon ?? current.icon ?? undefined,
      color: dto.color ?? current.color ?? undefined,
      behavior: dto.behavior ?? current.behavior,
      fieldSchema:
        dto.fieldSchema ??
        (current.fieldSchema as Array<Record<string, unknown>>),
      allowedBindings:
        dto.allowedBindings ??
        (current.allowedBindings as MarkerTemplateDto["allowedBindings"]),
      pinned: dto.pinned ?? current.pinned,
      requirePhoto: dto.requirePhoto ?? current.requirePhoto,
      requireNote: dto.requireNote ?? current.requireNote,
      requireStationarySample:
        dto.requireStationarySample ?? current.requireStationarySample,
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
    const task = await this.prisma.campusMapCollectionTask.findFirst({
      where: { id: taskId, regionId },
    });
    if (!task) throw new NotFoundException("采集任务不存在");

    const accessCode = randomBytes(16).toString("base64url");
    const expiresAt = new Date(Date.now() + ACCESS_CODE_TTL_MS);
    await this.prisma.campusMapCollectionTask.update({
      where: { id: taskId },
      data: {
        accessCodeHash: createHash("sha256").update(accessCode).digest("hex"),
        accessCodeExpiresAt: expiresAt,
      },
    });
    return { accessCode, expiresAt };
  }

  async resolveCollectorContext(accessCode: string, userId: string) {
    const code = String(accessCode || "").trim();
    if (!code) throw new BadRequestException("缺少采集任务码");
    const task = await this.prisma.campusMapCollectionTask.findFirst({
      where: {
        accessCodeHash: createHash("sha256").update(code).digest("hex"),
      },
      include: { assignments: true },
    });
    if (!task) throw new BadRequestException("采集任务码无效");
    if (
      !task.accessCodeExpiresAt ||
      task.accessCodeExpiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException("采集任务码已过期");
    }
    if (!["ready", "collecting"].includes(task.status))
      throw new BadRequestException("采集任务当前不可执行");
    if (!task.assignments.some((item) => item.userId === userId))
      throw new ForbiddenException("你未被分配到这个采集任务");

    const templates = await this.prisma.campusMapMarkerTemplate.findMany({
      where: {
        enabled: true,
        OR: [{ regionId: null }, { regionId: task.regionId }],
      },
      orderBy: [{ pinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const safeTask = {
      id: task.id,
      regionId: task.regionId,
      name: task.name,
      instructions: task.instructions,
      status: task.status,
    };
    const safeTemplates = templates.map((template) =>
      this.toCollectorTemplate(template),
    );
    return {
      task: safeTask,
      templates: safeTemplates,
      accessCodeExpiresAt: task.accessCodeExpiresAt,
    };
  }

  async startSession(
    taskId: string,
    userId: string,
    dto: StartCollectionSessionDto,
  ) {
    const input = parseStartSession(dto);
    const existing = await this.prisma.campusMapCollectionSession.findUnique({
      where: { clientSessionId: input.clientSessionId },
    });
    if (existing) {
      if (existing.taskId !== taskId || existing.collectorUserId !== userId) {
        throw new ForbiddenException("客户端会话标识已被占用");
      }
      return existing;
    }

    const activeKey = `${taskId}:${userId}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const taskClaim = await tx.campusMapCollectionTask.updateMany({
          where: { id: taskId, status: { in: ["ready", "collecting"] } },
          data: { status: "collecting" },
        });
        if (taskClaim.count !== 1) {
          throw new ConflictException("采集任务状态已变化，无法开始新会话");
        }
        // 任务行持锁后再核对分配人和允许端，堵住“校验后被管理员移除”的竞态窗口。
        const task = await tx.campusMapCollectionTask.findFirst({
          where: {
            id: taskId,
            status: { in: ["ready", "collecting"] },
            assignments: { some: { userId } },
          },
          select: { id: true, allowedClients: true },
        });
        if (!task) throw new ForbiddenException("无权开始这个采集任务");
        if (!this.jsonStringArray(task.allowedClients).includes(input.sourceClient)) {
          throw new ForbiddenException("这个任务不允许当前采集端");
        }
        return tx.campusMapCollectionSession.create({
          data: {
            taskId,
            collectorUserId: userId,
            ...input,
            activeKey,
            device: input.device as Prisma.InputJsonValue,
          },
        });
      });
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== "P2002") throw error;
      const retry = await this.prisma.campusMapCollectionSession.findUnique({
        where: { clientSessionId: input.clientSessionId },
      });
      if (retry) {
        if (retry.taskId !== taskId || retry.collectorUserId !== userId) {
          throw new ForbiddenException("客户端会话标识已被占用");
        }
        return retry;
      }
      const activeSession = await this.prisma.campusMapCollectionSession.findUnique({
        where: { activeKey },
      });
      if (activeSession) {
        throw new ConflictException(`该任务已有未结束采集会话 ${activeSession.id}，请继续上传或先放弃旧会话`);
      }
      throw error;
    }
  }

  async startRiderSession(
    taskId: string,
    userId: string,
    dto: StartCollectionSessionDto,
  ) {
    await this.requireOfficialRider(userId);
    return this.startSession(taskId, userId, {
      ...dto,
      sourceClient: "rider_app",
    });
  }

  async abandonSession(sessionId: string, userId: string) {
    const session = await this.prisma.campusMapCollectionSession.findFirst({
      where: {
        id: sessionId,
        collectorUserId: userId,
        status: { in: ["recording", "paused", "uploading"] },
      },
      select: { id: true },
    });
    if (!session) throw new NotFoundException("未找到可放弃的采集会话");
    const abandoned = await this.prisma.campusMapCollectionSession.updateMany({
      where: {
        id: sessionId,
        collectorUserId: userId,
        status: { in: ["recording", "paused", "uploading"] },
      },
      data: {
        status: "abandoned",
        endedAt: new Date(),
        uploadComplete: false,
        activeKey: null,
      },
    });
    if (abandoned.count !== 1) throw new ConflictException("采集会话状态已变化，请刷新后重试");
    return this.prisma.campusMapCollectionSession.findUnique({ where: { id: sessionId } });
  }

  async uploadPointBatch(
    sessionId: string,
    userId: string,
    batchNo: number,
    dto: UploadPointBatchDto,
  ) {
    const input = parsePointBatch(batchNo, dto);
    const session = await this.prisma.campusMapCollectionSession.findFirst({
      where: {
        id: sessionId,
        collectorUserId: userId,
        status: { in: ["recording", "paused", "uploading"] },
        task: { status: { in: ["ready", "collecting"] } },
      },
      select: { id: true, taskId: true, lastBatchNo: true, startedAt: true, endedAt: true },
    });
    if (!session) throw new ForbiddenException("无权上传这个采集会话");
    const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Number.NEGATIVE_INFINITY;
    const endedAt = session.endedAt ? new Date(session.endedAt).getTime() : Number.POSITIVE_INFINITY;
    const latestAllowed = Date.now() + 5 * 60 * 1000;
    if (input.points.some((point) => {
      const recordedAt = point.recordedAt.getTime();
      return recordedAt < startedAt || recordedAt > endedAt || recordedAt > latestAllowed;
    })) {
      throw new BadRequestException("轨迹点时间必须位于采集会话期间内，且不能明显晚于当前时间");
    }

    return this.prisma.$transaction(async (tx) => {
      await this.claimWritableCollectionTask(tx, session.taskId);
      // 先对会话行做条件空更新，MySQL/PostgreSQL 都会持有行锁到事务结束；
      // 这样并发批次不会同时基于同一个 lastStored 通过校验。
      const claimedSession = await tx.campusMapCollectionSession.updateMany({
        where: {
          id: sessionId,
          collectorUserId: userId,
          status: { in: ["recording", "paused", "uploading"] },
        },
        data: { lastBatchNo: { increment: 0 } },
      });
      if (claimedSession.count !== 1) {
        throw new ConflictException("采集会话状态已变化，请刷新后重试");
      }
      const lockedSession = await tx.campusMapCollectionSession.findUnique({
        where: { id: sessionId },
        select: { lastBatchNo: true },
      });
      const [collisions, lastStored] = await Promise.all([
        tx.campusMapCollectionPoint.findMany({
          where: {
            sessionId,
            OR: [
              { clientPointId: { in: input.points.map((point) => point.clientPointId) } },
              { pointSeq: { in: input.points.map((point) => point.pointSeq) } },
            ],
          },
          select: {
            clientPointId: true,
            pointSeq: true,
            recordedAt: true,
            longitude: true,
            latitude: true,
          },
        }),
        tx.campusMapCollectionPoint.findFirst({
          where: { sessionId },
          select: { pointSeq: true, recordedAt: true },
          orderBy: { pointSeq: "desc" },
        }),
      ]);
      const collisionByClientId = new Map(collisions.map((point: any) => [point.clientPointId, point]));
      for (const point of input.points) {
        const collision = collisionByClientId.get(point.clientPointId);
        const sequenceCollision = collisions.find((storedPoint: any) => storedPoint.pointSeq === point.pointSeq);
        if ((collision && (collision.pointSeq !== point.pointSeq
          || new Date(collision.recordedAt).getTime() !== point.recordedAt.getTime()
          || Math.abs(collision.longitude - point.longitude) > 1e-9
          || Math.abs(collision.latitude - point.latitude) > 1e-9))
          || (sequenceCollision && sequenceCollision.clientPointId !== point.clientPointId)) {
          throw new ConflictException("轨迹点 clientPointId 或 pointSeq 与已 ACK 数据冲突");
        }
      }
      const newPoints = input.points.filter((point) => !collisionByClientId.has(point.clientPointId));
      if (newPoints.length && lastStored) {
        const lastSequence = Number(lastStored.pointSeq);
        const lastRecordedAt = new Date(lastStored.recordedAt).getTime();
        if (newPoints[0].pointSeq <= lastSequence || newPoints[0].recordedAt.getTime() <= lastRecordedAt) {
          throw new ConflictException("跨批轨迹点的 pointSeq 和采集时间必须整体递增");
        }
      }
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
          orderBy: { pointSeq: "asc" },
        }),
        tx.campusMapCollectionPoint.count({ where: { sessionId } }),
      ]);
      await tx.campusMapCollectionSession.update({
        where: { id: sessionId },
        data: {
          pointCount,
          lastBatchNo: Math.max(Number(lockedSession?.lastBatchNo ?? session.lastBatchNo), batchNo),
        },
      });
      return {
        batchNo,
        acknowledgedPointIds: stored.map((point) => point.clientPointId),
        pointCount,
      };
    });
  }

  async finishSession(
    sessionId: string,
    userId: string,
    dto: FinishCollectionSessionDto,
  ) {
    const input = parseFinishSession(dto);
    const session = await this.prisma.campusMapCollectionSession.findFirst({
      where: { id: sessionId, collectorUserId: userId },
      include: { task: { select: { status: true } } },
    });
    if (!session) throw new ForbiddenException("无权完成这个采集会话");
    if (session.task?.status === "cancelled") {
      throw new ConflictException("采集任务已取消，不能完成采集会话");
    }
    if (session.status === "completed" && session.uploadComplete)
      return session;
    if (session.task && !["ready", "collecting"].includes(session.task.status)) {
      throw new ConflictException("采集任务当前状态不允许完成会话");
    }
    if (!["recording", "paused", "uploading"].includes(session.status)) {
      throw new ConflictException("采集会话已结束或已放弃，不能再次完成");
    }

    return this.prisma.$transaction(async (tx) => {
      // 完成会话先锁任务行，与取消任务保持一致锁顺序，避免死锁和状态复活。
      const taskStatus = session.task?.status || "collecting";
      const taskClaim = await tx.campusMapCollectionTask.updateMany({
        where: { id: session.taskId, status: taskStatus },
        data: { status: taskStatus },
      });
      if (taskClaim.count !== 1) {
        throw new ConflictException("采集任务状态已变化，不能完成会话");
      }
      const claimed = await tx.campusMapCollectionSession.updateMany({
        where: {
          id: sessionId,
          collectorUserId: userId,
          status: { in: ["recording", "paused", "uploading"] },
          task: { status: { not: "cancelled" } },
        },
        data: { status: "finishing" },
      });
      if (claimed.count !== 1) {
        const current = await tx.campusMapCollectionSession.findUnique({ where: { id: sessionId } });
        if (current?.status === "completed" && current.uploadComplete) return current;
        throw new ConflictException("采集会话状态已变化，不能完成");
      }
      const [pointCount, markerCount, objectCount] = await Promise.all([
        tx.campusMapCollectionPoint.count({ where: { sessionId } }),
        tx.campusMapCollectionMarker.count({ where: { sessionId } }),
        tx.campusMapCollectionObject.count({ where: { sessionId } }),
      ]);
      if (
        pointCount !== input.clientPointCount ||
        markerCount !== input.clientMarkerCount ||
        objectCount !== input.clientObjectCount
      ) {
        throw new ConflictException({
          message: "仍有采集数据未完成上传",
          serverPointCount: pointCount,
          serverMarkerCount: markerCount,
          serverObjectCount: objectCount,
        });
      }
      const completed = await tx.campusMapCollectionSession.update({
        where: { id: sessionId },
        data: {
          status: "completed",
          endedAt: input.endedAt,
          pointCount,
          markerCount,
          objectCount,
          uploadComplete: true,
          activeKey: null,
        },
      });
      const task = await tx.campusMapCollectionTask.findUnique({
        where: { id: session.taskId },
        include: {
          assignments: { select: { userId: true } },
          sessions: { select: { id: true, collectorUserId: true, status: true, uploadComplete: true } },
        },
      });
      if (task) {
        if (task.status === "cancelled") {
          throw new ConflictException("采集任务已取消，会话完成结果未保存");
        }
        const completedCollectors = new Set(
          task.sessions
            .filter((item: any) => item.status === "completed" && item.uploadComplete)
            .map((item: any) => item.collectorUserId),
        );
        completedCollectors.add(userId);
        const allAssignmentsCompleted = task.assignments.length === 0
          || task.assignments.every((assignment: any) => completedCollectors.has(assignment.userId));
        const hasActiveSession = task.sessions.some((item: any) =>
          item.id !== sessionId && ["recording", "paused", "uploading", "finishing"].includes(item.status),
        );
        const taskUpdated = await tx.campusMapCollectionTask.updateMany({
          where: { id: session.taskId, status: { not: "cancelled" } },
          data: { status: allAssignmentsCompleted && !hasActiveSession ? "review" : "collecting" },
        });
        if (taskUpdated.count !== 1) {
          throw new ConflictException("采集任务已取消，会话完成结果未保存");
        }
      }
      return completed;
    });
  }

  async createCollectionObject(
    sessionId: string,
    userId: string,
    dto: CreateCollectionObjectDto,
  ) {
    const input = parseCollectionObject(dto);
    const session = await this.prisma.campusMapCollectionSession.findFirst({
      where: {
        id: sessionId,
        collectorUserId: userId,
        status: { in: ["recording", "paused", "uploading"] },
        task: { status: { in: ["ready", "collecting"] } },
      },
      select: {
        id: true,
        taskId: true,
        status: true,
        task: { select: { regionId: true, objectTypes: true, targetPlaceIds: true } },
      },
    });
    if (!session) throw new ForbiddenException("无权添加这个采集会话的对象");
    if (session.task && !this.jsonStringArray(session.task.objectTypes).includes(input.objectType)) {
      throw new BadRequestException("该任务未允许上传此类采集对象");
    }
    if (input.objectType === "place_verification") {
      const targetPlaceId = String(input.properties.targetPlaceId || "").trim();
      const allowedTargets = this.jsonStringArray(session.task?.targetPlaceIds);
      const stableAllowedTargets = session.task
        ? await this.resolveDatabasePlaceIds(session.task.regionId, allowedTargets)
        : [];
      if (allowedTargets.length && !allowedTargets.includes(targetPlaceId) && !stableAllowedTargets.includes(targetPlaceId)) {
        throw new BadRequestException("地点核验对象不在该任务的指定地点内");
      }
      if (session.task) await this.assertTargetPlaces(session.task.regionId, [targetPlaceId]);
    }
    if (input.objectType === "road" && session.task) {
      const allowedTargets = this.jsonStringArray(session.task.targetPlaceIds);
      if (allowedTargets.length) {
        const stableAllowedTargets = await this.resolveDatabasePlaceIds(session.task.regionId, allowedTargets);
        const allowed = new Set([...allowedTargets, ...stableAllowedTargets]);
        const invalidConnection = input.bindings.find((binding) =>
          binding.relationType === "connects" && !allowed.has(binding.targetId));
        if (invalidConnection) {
          throw new BadRequestException("道路采集绑定的连接地点不在该任务指定范围内");
        }
      }
    }

    const existing = await this.prisma.campusMapCollectionObject.findUnique({
      where: {
        sessionId_clientObjectId: {
          sessionId,
          clientObjectId: input.clientObjectId,
        },
      },
      include: { attachments: true },
    });
    if (existing) {
      this.assertObjectRetryMatches(existing, input);
      return {
        ...existing,
        uploadAck: {
          accepted: true,
          duplicate: true,
          serverObjectId: existing.id,
          clientObjectId: input.clientObjectId,
        },
      };
    }

    const resampleOfObjectId = String(input.properties.resampleOfObjectId || "").trim();
    const resampleSource = resampleOfObjectId
      ? await this.prisma.campusMapCollectionObject.findFirst({
          where: {
            id: resampleOfObjectId,
            objectType: input.objectType,
            reviewStatus: "resample",
            session: { taskId: session.taskId, collectorUserId: userId },
          },
          select: {
            id: true,
            properties: true,
            applyResult: true,
            reviewNote: true,
            reviewedBy: true,
            reviewedAt: true,
          },
        })
      : null;
    if (resampleOfObjectId && !resampleSource) {
      throw new BadRequestException("补采替代的原对象不存在、不属于当前任务/采集人，或已不是待补采状态");
    }
    if (resampleSource && input.objectType === "place_verification") {
      const sourceProperties = resampleSource.properties && typeof resampleSource.properties === "object" && !Array.isArray(resampleSource.properties)
        ? resampleSource.properties as Record<string, unknown>
        : {};
      if (String(sourceProperties.targetPlaceId || "") !== String(input.properties.targetPlaceId || "")) {
        throw new BadRequestException("地点补采必须替代同一 targetPlaceId 的原对象");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await this.claimWritableCollectionTask(tx, session.taskId);
      await this.claimWritableCollectionSession(tx, sessionId, userId);
      // 上传前的幂等查询可能与另一个并发请求同时得到“尚不存在”。会话写锁之后
      // 必须再次查询，避免第二个请求裸露 Prisma P2002 或重复写附件。
      const racedExisting = await tx.campusMapCollectionObject.findUnique({
        where: {
          sessionId_clientObjectId: {
            sessionId,
            clientObjectId: input.clientObjectId,
          },
        },
        include: { attachments: true },
      });
      if (racedExisting) {
        this.assertObjectRetryMatches(racedExisting, input);
        return {
          ...racedExisting,
          uploadAck: {
            accepted: true,
            duplicate: true,
            serverObjectId: racedExisting.id,
            clientObjectId: input.clientObjectId,
          },
        };
      }
      if (input.objectType === "road") {
        const markerClientIds = this.markerClientIds(input);
        if (markerClientIds.length) {
          const [markers, otherRoads] = await Promise.all([
            tx.campusMapCollectionMarker.findMany({
              where: { sessionId, clientMarkerId: { in: markerClientIds } },
              select: { clientMarkerId: true },
            }),
            tx.campusMapCollectionObject.findMany({
              where: { sessionId, objectType: "road" },
              select: { properties: true },
            }),
          ]);
          if (new Set(markers.map((marker: any) => marker.clientMarkerId)).size !== markerClientIds.length) {
            throw new BadRequestException("路线引用的沿途旁注不存在或不属于当前采集会话");
          }
          const alreadyLinked = new Set(otherRoads.flatMap((road: any) => this.markerClientIds(road)));
          if (markerClientIds.some((markerId) => alreadyLinked.has(markerId))) {
            throw new ConflictException("沿途旁注已绑定其他路线分段，不能重复引用");
          }
        }
      }
      const object = await tx.campusMapCollectionObject.create({
        data: {
          sessionId,
          clientObjectId: input.clientObjectId,
          objectType: input.objectType,
          geometry: input.geometry as Prisma.InputJsonValue,
          properties: input.properties as Prisma.InputJsonValue,
          longitude: input.longitude,
          latitude: input.latitude,
          accuracy: input.accuracy,
          recordedAt: input.recordedAt,
          quality: input.quality as Prisma.InputJsonValue | undefined,
          bindings: input.bindings as Prisma.InputJsonValue,
          attachments: {
            create: input.attachments.map((attachment) => ({
              kind: attachment.kind || "photo",
              url: attachment.url,
              storageKey: attachment.storageKey,
              mimeType: attachment.mimeType,
              byteSize: attachment.byteSize || 0,
              checksum: attachment.checksum,
              metadata: attachment.metadata as
                | Prisma.InputJsonValue
                | undefined,
            })),
          },
        },
        include: { attachments: true },
      });
      const objectCount = await tx.campusMapCollectionObject.count({
        where: { sessionId },
      });
      await tx.campusMapCollectionSession.update({
        where: { id: sessionId },
        data: { objectCount },
      });
      if (resampleSource) {
        const superseded = await tx.campusMapCollectionObject.updateMany({
          where: { id: resampleSource.id, reviewStatus: "resample" },
          data: {
            reviewStatus: "superseded",
            applyResult: {
              previousDecision: "resample",
              previousApplyResult: resampleSource.applyResult || null,
              supersededByObjectId: object.id,
              supersededAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        if (superseded.count !== 1) {
          throw new ConflictException("待补采对象状态已变更，请刷新任务后重试");
        }
      }
      return {
        ...object,
        uploadAck: {
          accepted: true,
          duplicate: false,
          serverObjectId: object.id,
          clientObjectId: input.clientObjectId,
          ...(resampleSource ? { supersedesObjectId: resampleSource.id } : {}),
        },
      };
    });
  }

  private assertObjectRetryMatches(existing: any, input: ReturnType<typeof parseCollectionObject>) {
    const normalizeAttachments = (attachments: any[]) => (attachments || [])
      .map((attachment: any) => {
        const metadata = canonicalJson(attachment.metadata);
        return canonicalJson({
          kind: attachment.kind || "photo",
          url: attachment.url,
          storageKey: attachment.storageKey ?? null,
          mimeType: attachment.mimeType ?? null,
          byteSize: attachment.byteSize || 0,
          checksum: attachment.checksum ?? null,
          metadata: metadata && Object.keys(metadata).length ? metadata : null,
        });
      })
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const storedPayload = {
      objectType: existing.objectType,
      geometry: existing.geometry,
      properties: existing.properties,
      longitude: existing.longitude ?? null,
      latitude: existing.latitude ?? null,
      accuracy: existing.accuracy ?? null,
      recordedAt: existing.recordedAt,
      quality: existing.quality ?? null,
      bindings: existing.bindings,
      attachments: normalizeAttachments(existing.attachments || []),
    };
    const incomingPayload = {
      objectType: input.objectType,
      geometry: input.geometry,
      properties: input.properties,
      longitude: input.longitude ?? null,
      latitude: input.latitude ?? null,
      accuracy: input.accuracy ?? null,
      recordedAt: input.recordedAt,
      quality: input.quality ?? null,
      bindings: input.bindings,
      attachments: normalizeAttachments(input.attachments),
    };
    if (!sameJson(storedPayload, incomingPayload)) {
      throw new ConflictException("clientObjectId 已存在，但上传内容与服务器记录不一致");
    }
  }

  async createMarker(
    sessionId: string,
    userId: string,
    dto: CreateCollectionMarkerDto,
  ) {
    const input = parseMarker(dto);
    const session = await this.prisma.campusMapCollectionSession.findFirst({
      where: {
        id: sessionId,
        collectorUserId: userId,
        status: { in: ["recording", "paused", "uploading"] },
        task: { status: { in: ["ready", "collecting"] } },
      },
      include: { task: { select: { regionId: true } } },
    });
    if (!session) throw new ForbiddenException("无权添加这个采集会话的标记");

    const existing = await this.prisma.campusMapCollectionMarker.findUnique({
      where: {
        sessionId_clientMarkerId: {
          sessionId,
          clientMarkerId: input.clientMarkerId,
        },
      },
      include: { bindings: true, attachments: true },
    });
    if (existing) {
      this.assertMarkerRetryMatches(existing, input);
      return {
        ...existing,
        uploadAck: {
          accepted: true,
          duplicate: true,
          serverMarkerId: existing.id,
          clientMarkerId: input.clientMarkerId,
        },
      };
    }

    const template = await this.prisma.campusMapMarkerTemplate.findFirst({
      where: {
        id: input.templateId,
        enabled: true,
        OR: [{ regionId: null }, { regionId: session.task.regionId }],
      },
    });
    if (!template) throw new BadRequestException("标记模板不存在或已停用");
    if (template.requirePhoto && input.attachments.length === 0)
      throw new BadRequestException("这个标记需要现场照片");
    if (template.requireNote && !input.note)
      throw new BadRequestException("这个标记需要填写备注");
    if (
      template.requireStationarySample &&
      Number(input.stationarySampleCount || 0) < 3
    ) {
      throw new BadRequestException("这个标记需要至少三次站定采样");
    }
    const fieldValues = validateMarkerFieldValues(
      template.fieldSchema,
      input.fieldValues,
    );

    const allowed = template.allowedBindings as {
      targetTypes?: unknown;
      relationTypes?: unknown;
    };
    const targetTypes = Array.isArray(allowed?.targetTypes)
      ? allowed.targetTypes.map(String)
      : [];
    const relationTypes = Array.isArray(allowed?.relationTypes)
      ? allowed.relationTypes.map(String)
      : [];
    for (const binding of input.bindings) {
      if (
        !targetTypes.includes(binding.targetType) ||
        !relationTypes.includes(binding.relationType) ||
        !BINDING_RELATIONS.includes(
          binding.relationType as (typeof BINDING_RELATIONS)[number],
        )
      ) {
        throw new BadRequestException("标记绑定不符合模板约束");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await this.claimWritableCollectionTask(tx, session.taskId);
      await this.claimWritableCollectionSession(tx, sessionId, userId);
      // 会话行锁让同一会话内的并发重试串行化；锁后再次查询，避免两个相同
      // clientMarkerId 同时越过事务外预查后，一个收到裸 P2002 或误清本地证据。
      const racedExisting = await tx.campusMapCollectionMarker.findUnique({
        where: {
          sessionId_clientMarkerId: {
            sessionId,
            clientMarkerId: input.clientMarkerId,
          },
        },
        include: { bindings: true, attachments: true },
      });
      if (racedExisting) {
        this.assertMarkerRetryMatches(racedExisting, input);
        return {
          ...racedExisting,
          uploadAck: {
            accepted: true,
            duplicate: true,
            serverMarkerId: racedExisting.id,
            clientMarkerId: input.clientMarkerId,
          },
        };
      }
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
          fieldValues: fieldValues as Prisma.InputJsonValue,
          note: input.note,
          bindings: { create: input.bindings },
          attachments: {
            create: input.attachments.map((attachment) => ({
              kind: attachment.kind || "photo",
              url: attachment.url,
              storageKey: attachment.storageKey,
              mimeType: attachment.mimeType,
              byteSize: attachment.byteSize || 0,
              checksum: attachment.checksum,
              metadata: attachment.metadata as
                | Prisma.InputJsonValue
                | undefined,
            })),
          },
        },
      });
      const markerCount = await tx.campusMapCollectionMarker.count({
        where: { sessionId },
      });
      await tx.campusMapCollectionSession.update({
        where: { id: sessionId },
        data: { markerCount },
      });
      return {
        ...marker,
        uploadAck: {
          accepted: true,
          duplicate: false,
          serverMarkerId: marker.id,
          clientMarkerId: input.clientMarkerId,
        },
      };
    });
  }

  private assertMarkerRetryMatches(existing: any, input: ReturnType<typeof parseMarker>) {
    const ordered = (items: any[]) => items
      .map((item) => canonicalJson(item))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const attachments = (items: any[]) => ordered(items.map((attachment) => ({
      kind: attachment.kind || "photo",
      url: attachment.url,
      storageKey: attachment.storageKey ?? null,
      mimeType: attachment.mimeType ?? null,
      byteSize: attachment.byteSize || 0,
      checksum: attachment.checksum ?? null,
      metadata: attachment.metadata ?? null,
    })));
    const bindings = (items: any[]) => ordered(items.map((binding) => ({
      targetType: binding.targetType,
      targetId: binding.targetId,
      relationType: binding.relationType,
    })));
    const storedPayload = {
      templateId: existing.templateId,
      longitude: existing.longitude,
      latitude: existing.latitude,
      accuracy: existing.accuracy,
      recordedAt: existing.recordedAt,
      fieldValues: existing.fieldValues,
      note: existing.note ?? null,
      bindings: bindings(existing.bindings || []),
      attachments: attachments(existing.attachments || []),
    };
    const incomingPayload = {
      templateId: input.templateId,
      longitude: input.longitude,
      latitude: input.latitude,
      accuracy: input.accuracy,
      recordedAt: input.recordedAt,
      fieldValues: input.fieldValues,
      note: input.note ?? null,
      bindings: bindings(input.bindings || []),
      attachments: attachments(input.attachments || []),
    };
    if (!sameJson(storedPayload, incomingPayload)) {
      throw new ConflictException("clientMarkerId 已存在，但上传内容与服务器记录不一致");
    }
  }

  private async requireOfficialRider(userId: string) {
    const rider = await this.prisma.regionRider.findUnique({
      where: { userId },
      select: { regionId: true, riderType: true, verifyStatus: true },
    });
    if (
      !rider ||
      rider.verifyStatus !== "approved" ||
      String(rider.riderType).toLowerCase() !== "official"
    ) {
      throw new ForbiddenException("仅已审核的官方骑手可执行现场采集任务");
    }
    return rider;
  }

  private async claimWritableCollectionTask(tx: any, taskId: string) {
    const claimed = await tx.campusMapCollectionTask.updateMany({
      where: { id: taskId, status: { in: ["ready", "collecting"] } },
      data: { status: "collecting" },
    });
    if (claimed.count !== 1) {
      throw new ConflictException("采集任务已取消或状态已变化，本次数据未写入");
    }
  }

  private async claimWritableCollectionSession(tx: any, sessionId: string, userId: string) {
    const claimed = await tx.campusMapCollectionSession.updateMany({
      where: {
        id: sessionId,
        collectorUserId: userId,
        status: { in: ["recording", "paused", "uploading"] },
      },
      data: { lastBatchNo: { increment: 0 } },
    });
    if (claimed.count !== 1) {
      throw new ConflictException("采集会话状态已变化，本次数据未写入");
    }
  }

  private async assertRiderOnlyAssignments(
    regionId: string,
    allowedClients: string[],
    collectorUserIds: string[],
  ) {
    if (
      allowedClients.length !== 1 ||
      allowedClients[0] !== "rider_app" ||
      !collectorUserIds.length
    ) {
      return;
    }
    const riders = await this.prisma.regionRider.findMany({
      where: {
        userId: { in: collectorUserIds },
        regionId,
        riderType: "official",
        verifyStatus: "approved",
      },
      select: { userId: true },
    });
    if (new Set(riders.map((rider) => rider.userId)).size !== collectorUserIds.length) {
      throw new BadRequestException("采集人员必须是本区域已审核的官方骑手");
    }
  }

  private toRiderTask(task: {
    id: string;
    regionId: string;
    name: string;
    instructions: string | null;
    status: string;
    taskType: string;
    allowedClients: Prisma.JsonValue;
    objectTypes: Prisma.JsonValue;
    targetPlaceIds: Prisma.JsonValue | null;
    targetFeatureIds?: Prisma.JsonValue | null;
    priority: number;
    dueAt: Date | null;
    sessions: Array<{
      id: string;
      clientSessionId?: string;
      status?: string;
      objects?: Array<{
        id: string;
        clientObjectId: string;
        objectType: string;
        properties: Prisma.JsonValue;
        reviewNote: string | null;
        reviewedAt: Date | null;
      }>;
    }>;
  }, targets: CampusPlaceTarget[] = []) {
    const activeSession = task.sessions.find((session) =>
      ["recording", "paused", "uploading"].includes(String(session.status || "")));
    return {
      id: task.id,
      regionId: task.regionId,
      name: task.name,
      instructions: task.instructions,
      status: task.status,
      taskType: task.taskType || this.inferLegacyTaskType(this.jsonStringArray(task.objectTypes, ["road"])),
      objectTypes: this.jsonStringArray(task.objectTypes, ["road"]),
      targetPlaceIds: this.jsonStringArray(task.targetPlaceIds),
      targetFeatureIds: this.jsonStringArray(task.targetFeatureIds ?? null),
      targets,
      priority: task.priority,
      dueAt: task.dueAt,
      sessionCount: task.sessions.length,
      activeSession: activeSession
        ? {
            id: activeSession.id,
            clientSessionId: activeSession.clientSessionId,
            status: activeSession.status,
          }
        : null,
      resampleRequests: task.sessions.flatMap((session) => (session.objects || []).map((object) => {
        const properties = object.properties && typeof object.properties === "object" && !Array.isArray(object.properties)
          ? object.properties as Record<string, unknown>
          : {};
        return {
          objectId: object.id,
          objectType: object.objectType,
          targetPlaceId: String(properties.targetPlaceId || "") || null,
          clientSegmentId: String(properties.clientSegmentId || properties.segmentId || object.clientObjectId),
          reviewNote: object.reviewNote,
          reviewedAt: object.reviewedAt,
        };
      })),
    };
  }

  private jsonStringArray(value: Prisma.JsonValue, fallback: string[] = []) {
    if (!Array.isArray(value)) return fallback;
    return value.map(String);
  }

  private inferLegacyTaskType(objectTypes: string[]) {
    if (objectTypes.length === 1 && objectTypes[0] === "road") return "route_collection";
    if (objectTypes.length === 1 && objectTypes[0] === "place_verification") return "place_verification";
    return "mixed";
  }

  private markerClientIds(object: any): string[] {
    const properties = object?.properties && typeof object.properties === "object" && !Array.isArray(object.properties)
      ? object.properties
      : {};
    return [...new Set<string>((Array.isArray(properties.markerClientIds) ? properties.markerClientIds : [])
      .map(String)
      .map((value: string) => value.trim())
      .filter(Boolean))];
  }

  private attachEvidenceMarkers(objects: any[], markers: any[]) {
    const safeObjects = Array.isArray(objects) ? objects : [];
    const safeMarkers = Array.isArray(markers) ? markers : [];
    const byKey = new Map(safeMarkers.map((marker: any) => [
      `${String(marker.sessionId || "")}:${String(marker.clientMarkerId || "")}`,
      marker,
    ]));
    return safeObjects.map((object: any) => {
      const sessionId = String(object.sessionId || object.session?.id || "");
      const markerClientIds = this.markerClientIds(object);
      if (!markerClientIds.length) return object;
      return {
        ...object,
        markers: markerClientIds
          .map((clientMarkerId) => byKey.get(`${sessionId}:${clientMarkerId}`))
          .filter(Boolean),
      };
    });
  }

  private routeDependencySummary(
    object: any,
    previousRouteById: Map<string, any>,
    sharedSourceById: Map<string, any>,
  ) {
    if (object?.objectType !== "road") return null;
    const properties = object?.properties && typeof object.properties === "object" && !Array.isArray(object.properties)
      ? object.properties as Record<string, unknown>
      : {};
    const previousRouteObjectId = String(properties.previousRouteObjectId || "").trim();
    const sharedStartAnchorPointId = String(properties.sharedStartAnchorPointId || "").trim();
    if (!previousRouteObjectId && !sharedStartAnchorPointId) return null;
    const previous = previousRouteById.get(previousRouteObjectId);
    let status = "missing";
    if (Boolean(previousRouteObjectId) !== Boolean(sharedStartAnchorPointId)
      || previousRouteObjectId === String(object.id || "")) status = "invalid";
    else if (!previous) status = "missing";
    else if (String(previous.sessionId || "") !== String(object.sessionId || object.session?.id || "")
      || previous.objectType !== "road") status = "invalid";
    else if (previous.reviewStatus === "approved" && previous.appliedToDraftAt) {
      const previousProperties = previous.properties
        && typeof previous.properties === "object"
        && !Array.isArray(previous.properties)
        ? previous.properties as Record<string, unknown>
        : {};
      const previousPointIds = Array.isArray(previousProperties.clientPointIds)
        ? previousProperties.clientPointIds.map(String).filter(Boolean)
        : [];
      const previousResult = previous.applyResult
        && typeof previous.applyResult === "object"
        && !Array.isArray(previous.applyResult)
        ? previous.applyResult as Record<string, any>
        : {};
      const previousAnchors = previousResult.routeEndpointAnchors
        && typeof previousResult.routeEndpointAnchors === "object"
        && !Array.isArray(previousResult.routeEndpointAnchors)
        ? previousResult.routeEndpointAnchors as Record<string, any>
        : null;
      const expectedAnchorKey = createHash("sha256")
        .update(`${String(previous.sessionId || "")}:${sharedStartAnchorPointId}`)
        .digest("hex");
      const previousEnd = previousAnchors?.end && typeof previousAnchors.end === "object" && !Array.isArray(previousAnchors.end)
        ? previousAnchors.end as Record<string, any>
        : null;
      const sharedFromObjectId = String(previousEnd?.sharedFromObjectId || "").trim();
      const sharedFromEndpoint = String(previousEnd?.sharedFromEndpoint || "").trim();
      const source = sharedFromObjectId ? sharedSourceById.get(sharedFromObjectId) : null;
      const sourceResult = source?.applyResult && typeof source.applyResult === "object" && !Array.isArray(source.applyResult)
        ? source.applyResult as Record<string, any>
        : {};
      const sourceAnchors = sourceResult.routeEndpointAnchors && typeof sourceResult.routeEndpointAnchors === "object" && !Array.isArray(sourceResult.routeEndpointAnchors)
        ? sourceResult.routeEndpointAnchors as Record<string, any>
        : null;
      const sourceAnchor = ["start", "end"].includes(sharedFromEndpoint)
        && sourceAnchors?.[sharedFromEndpoint] && typeof sourceAnchors[sharedFromEndpoint] === "object"
        ? sourceAnchors[sharedFromEndpoint] as Record<string, any>
        : null;
      const trustedAnchorKey = String(previousEnd?.key || "") === expectedAnchorKey
        || (!!source
          && Number(sourceAnchors?.version) === 1
          && String(sourceAnchor?.key || "") === String(previousEnd?.key || ""));
      status = previousPointIds.length
        && previousPointIds[previousPointIds.length - 1] === sharedStartAnchorPointId
        && Number(previousAnchors?.version) === 1
        && String(previousEnd?.pointId || "") === sharedStartAnchorPointId
        && /^[a-f0-9]{64}$/.test(String(previousEnd?.key || ""))
        && isValidLngLat(previousEnd?.longitude, previousEnd?.latitude)
        && trustedAnchorKey
        ? "ready"
        : "anchor_invalid";
    }
    else if (previous.reviewStatus === "approved") status = "not_applied";
    else if (["pending", "held"].includes(previous.reviewStatus)) status = "waiting_review";
    else if (previous.reviewStatus === "resample") status = "resample_required";
    else status = "unavailable";
    return {
      previousRouteObjectId: previousRouteObjectId || null,
      sharedStartAnchorPointId: sharedStartAnchorPointId || null,
      status,
      ready: status === "ready",
      previousReviewStatus: previous?.reviewStatus || null,
      previousAppliedToDraftAt: previous?.appliedToDraftAt || null,
    };
  }

  private manifestFeatures(manifest: any) {
    return (Array.isArray(manifest?.layers) ? manifest.layers : [])
      .flatMap((layer: any) => Array.isArray(layer?.inlineData?.features) ? layer.inlineData.features : [])
      .filter((feature: any) => feature && feature.properties);
  }

  private async resolveTargetPlaces(regionId: string, ids: string[]): Promise<CampusPlaceTarget[]> {
    if (!ids.length) return [];
    const repository = (this.prisma as any).campusMapProject;
    const databasePlaces = repository?.findMany ? await repository.findMany({
      where: {
        regionId,
        OR: [
          { id: { in: ids } },
          { artworkFeatureKey: { in: ids } },
        ],
      },
      select: {
        id: true,
        artworkFeatureKey: true,
        officialName: true,
        displayName: true,
        semanticType: true,
        officialNumber: true,
        artworkAnchorX: true,
        artworkAnchorY: true,
        longitude: true,
        latitude: true,
      },
    }) : [];
    const databaseByRequestedId = new Map<string, any>();
    for (const place of databasePlaces) {
      databaseByRequestedId.set(String(place.id), place);
      if (place.artworkFeatureKey) databaseByRequestedId.set(String(place.artworkFeatureKey), place);
    }
    const map = await this.prisma.campusMap.findUnique({
      where: { regionId },
      select: {
        draft: { select: { manifest: true } },
        activeVersion: { select: { manifest: true } },
      },
    });
    const manifest: any = map?.draft?.manifest || map?.activeVersion?.manifest;
    const wanted = new Set(ids);
    const byId = new Map(this.manifestFeatures(manifest).map((feature: any) => [String(feature.properties.id || ""), feature]));
    const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
    return ids.flatMap((id) => {
      const databasePlace = databaseByRequestedId.get(id);
      if (databasePlace) {
        return [{
          id: String(databasePlace.id),
          title: String(databasePlace.displayName || databasePlace.officialName || id),
          semanticType: String(databasePlace.semanticType || "building"),
          officialNumber: Number(databasePlace.officialNumber) || null,
          mapX: numeric(databasePlace.artworkAnchorX),
          mapY: numeric(databasePlace.artworkAnchorY),
          longitude: numeric(databasePlace.longitude),
          latitude: numeric(databasePlace.latitude),
        }];
      }
      const feature: any = byId.get(id);
      if (!feature || !wanted.has(id)) return [];
      const coordinates = feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates)
        ? feature.geometry.coordinates
        : [];
      const props = feature.properties || {};
      const officialNumber = Number(props.officialNumber);
      return [{
        id,
        title: String(props.officialName || props.title || props.name || id),
        semanticType: String(props.semanticType || props.category || "building"),
        officialNumber: Number.isInteger(officialNumber) && officialNumber > 0 ? officialNumber : null,
        mapX: numeric(coordinates[0]),
        mapY: numeric(coordinates[1]),
        longitude: numeric(props.longitude),
        latitude: numeric(props.latitude),
      }];
    });
  }

  private async resolveDatabasePlaceIds(regionId: string, ids: string[]) {
    if (!ids.length) return [];
    const repository = (this.prisma as any).campusMapProject;
    if (!repository?.findMany) return [];
    const rows = await repository.findMany({
      where: {
        regionId,
        OR: [{ id: { in: ids } }, { artworkFeatureKey: { in: ids } }],
      },
      select: { id: true, artworkFeatureKey: true },
    });
    const wanted = new Set(ids);
    const ordered = ids.flatMap((requestedId) => {
      const found = rows.find((row: any) => row.id === requestedId || row.artworkFeatureKey === requestedId);
      return found && wanted.has(requestedId) ? [found.id] : [];
    });
    return [...new Set(ordered)];
  }

  /** 读取区域地图 manifest（草稿优先，回退已发布版本） */
  private async loadRegionManifest(regionId: string) {
    const map = await this.prisma.campusMap.findUnique({
      where: { regionId },
      select: {
        draft: { select: { manifest: true } },
        activeVersion: { select: { manifest: true } },
      },
    });
    return (map?.draft?.manifest || map?.activeVersion?.manifest) as any;
  }

  /** 抽稀：点数超限时均匀取样，始终保留首尾点 */
  private thinPoints<T>(points: T[], limit = MAX_REFERENCE_POINTS_PER_FEATURE): T[] {
    if (points.length <= limit) return points;
    const step = (points.length - 1) / (limit - 1);
    const sampled: T[] = [];
    for (let index = 0; index < limit; index += 1) {
      sampled.push(points[Math.round(index * step)]);
    }
    return sampled;
  }

  /**
   * 构建骑手端参考底图：把校园地图的道路中线和建筑轮廓转成 GCJ-02 折线，
   * 让骑手在采集时能看到自己相对校园矢量图的位置，判断路线走没走对。
   */
  private buildRiderReferenceMap(manifest: any, targetFeatureIds: string[] = []) {
    const empty = (reason: string) => ({ enabled: false, reason, features: [] as RiderReferenceFeature[] });
    if (!manifest) return empty("no_manifest");
    const allFeatures = this.manifestFeatures(manifest);
    if (!allFeatures.length) return empty("no_features");

    const nativeGcj02 = isNativeGcj02Manifest(manifest);
    const project = nativeGcj02 ? null : buildManifestToGpsProjector(manifest);
    // 图片、CAD 矢量和其他投影底图都不是经纬度，缺少校准时不得将图面坐标当作 GCJ-02。
    if (!nativeGcj02 && !project) return empty("calibration_insufficient");

    const toLngLat = (pair: unknown) => {
      if (!Array.isArray(pair) || pair.length < 2) return null;
      const first = Number(pair[0]);
      const second = Number(pair[1]);
      if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
      if (project) {
        const projected = project(first, second);
        return isValidLngLat(projected.longitude, projected.latitude) ? projected : null;
      }
      return isValidLngLat(first, second) ? { longitude: first, latitude: second } : null;
    };

    const collected: RiderReferenceFeature[] = [];
    const targetIds = new Set(targetFeatureIds.map(String).filter(Boolean));
    for (const feature of allFeatures) {
      const props = feature.properties || {};
      const semanticType = String(props.semanticType || props.category || props.type || "building");
      const sourceLayer = String(props.sourceLayer || props.Layer || "").toLowerCase();
      const isRoad = semanticType === "road"
        || sourceLayer.includes("road")
        || sourceLayer.includes("中线");
      // 未建成/未匹配几何的建筑没有可靠轮廓，不作为现场参考
      if (!isRoad) {
        const construction = String(props.constructionStatus || "built");
        if (construction !== "built") continue;
        if (String(props.geometryStatus || "") === "unmatched") continue;
      }

      const geometry = feature.geometry || {};
      const geometryType = String(geometry.type || "");
      let rawPoints: unknown[] = [];
      let kind: RiderReferenceFeature["kind"] = isRoad ? "road" : "building";
      if (geometryType === "LineString") {
        rawPoints = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
        kind = "road";
      } else if (geometryType === "Polygon") {
        const rings = geometry.coordinates;
        rawPoints = Array.isArray(rings) && Array.isArray(rings[0]) ? rings[0] : [];
        kind = isRoad ? "road" : "building";
      } else if (geometryType === "Point") {
        rawPoints = [geometry.coordinates];
        kind = "poi";
      } else {
        continue;
      }

      const points = rawPoints
        .map(toLngLat)
        .filter((point): point is { longitude: number; latitude: number } => point !== null);
      // 折线/轮廓至少要两点才画得出来；点位保留单点
      if (kind === "poi" ? points.length < 1 : points.length < 2) continue;

      const officialNumber = Number(props.officialNumber);
      const featureId = String(props.id || feature.id || `${kind}-${collected.length}`);
      collected.push({
        id: featureId,
        title: String(props.officialName || props.title || props.name || ""),
        semanticType,
        officialNumber: Number.isInteger(officialNumber) && officialNumber > 0 ? officialNumber : null,
        kind,
        targeted: targetIds.has(featureId),
        points: this.thinPoints(points),
      });
    }

    if (!collected.length) return empty("no_projectable_features");
    // 道路和建筑是骑手判断路线的主要依据，超限时优先保留
    const weight = (item: RiderReferenceFeature) => (item.kind === "road" ? 0 : item.kind === "building" ? 1 : 2);
    collected.sort((left, right) => weight(left) - weight(right));
    return {
      enabled: true,
      reason: undefined as string | undefined,
      features: collected.slice(0, MAX_REFERENCE_FEATURES),
    };
  }

  private async loadTrustedRouteJunctions(
    client: any,
    regionId: string,
    manifest: any,
  ): Promise<TrustedRouteJunction[]> {
    const sourceObjectIds = [...new Set(this.manifestFeatures(manifest)
      .filter((feature: any) => String(feature?.properties?.collectionSource || "") === "rider_app_approved")
      .map((feature: any) => String(feature?.properties?.sourceObjectId || "").trim())
      .filter(Boolean))];
    if (!sourceObjectIds.length) return [];
    const rows = await client.campusMapCollectionObject.findMany({
      where: {
        id: { in: sourceObjectIds },
        objectType: "road",
        reviewStatus: "approved",
        appliedToDraftAt: { not: null },
        session: { task: { regionId, status: { not: "cancelled" } } },
      },
      select: {
        id: true,
        properties: true,
        applyResult: true,
        reviewedAt: true,
      },
      orderBy: { reviewedAt: "asc" },
    });
    const byKey = new Map<string, TrustedRouteJunction>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const properties = row.properties && typeof row.properties === "object" && !Array.isArray(row.properties)
        ? row.properties as Record<string, unknown>
        : {};
      const applyResult = row.applyResult && typeof row.applyResult === "object" && !Array.isArray(row.applyResult)
        ? row.applyResult as Record<string, any>
        : {};
      const routeQuality = applyResult.routeQuality && typeof applyResult.routeQuality === "object" && !Array.isArray(applyResult.routeQuality)
        ? applyResult.routeQuality as Record<string, any>
        : null;
      const anchors = applyResult.routeEndpointAnchors && typeof applyResult.routeEndpointAnchors === "object" && !Array.isArray(applyResult.routeEndpointAnchors)
        ? applyResult.routeEndpointAnchors as Record<string, any>
        : null;
      if (applyResult.applied !== true || routeQuality?.source !== "server_ack" || Number(anchors?.version) !== 1) continue;
      for (const endpoint of ["start", "end"] as const) {
        const anchor = anchors?.[endpoint] && typeof anchors[endpoint] === "object" && !Array.isArray(anchors[endpoint])
          ? anchors[endpoint] as Record<string, any>
          : null;
        if (!anchor) continue;
        const key = String(anchor?.key || "").trim().toLowerCase();
        const accuracy = Number(anchor?.accuracy);
        if (!/^[a-f0-9]{64}$/.test(key)
          || !isValidLngLat(anchor?.longitude, anchor?.latitude)
          || !Number.isFinite(accuracy)
          || accuracy <= 0
          || accuracy > 8
          || !String(anchor?.pointId || "").trim()) continue;
        if (byKey.has(key)) continue;
        const routeTitle = String(properties.title || properties.name || `路线 ${String(row.id).slice(-6)}`);
        byKey.set(key, {
          key,
          longitude: Number(anchor.longitude),
          latitude: Number(anchor.latitude),
          accuracy,
          pointId: String(anchor.pointId),
          sourceObjectId: String(row.id),
          sourceEndpoint: endpoint,
          label: `${routeTitle} · ${endpoint === "start" ? "起点" : "终点"}`,
        });
      }
    }
    return [...byKey.values()].slice(0, 1000);
  }

  private async assertTargetPlaces(regionId: string, ids: string[]) {
    if (!ids.length) return;
    const places = await this.resolveTargetPlaces(regionId, ids);
    if (places.length !== ids.length) {
      throw new BadRequestException("采集任务绑定的地图地点不存在，请先保存校园地图草稿");
    }
  }

  private async assertTargetFeatures(regionId: string, ids: string[]) {
    if (!ids.length) return;
    const manifest = await this.loadRegionManifest(regionId);
    const available = new Set(this.manifestFeatures(manifest)
      .map((feature: any) => String(feature?.properties?.id || feature?.id || "").trim())
      .filter(Boolean));
    const missing = ids.filter((id) => !available.has(id));
    if (missing.length) {
      throw new BadRequestException(`采集任务指定的地图图形不存在：${missing.join("、")}`);
    }
  }

  private assertStableTargetPlaces(requestedIds: string[], databasePlaceIds: string[]) {
    const requestedCount = new Set(requestedIds).size;
    if (requestedCount > 0 && new Set(databasePlaceIds).size !== requestedCount) {
      throw new BadRequestException("新建采集任务只能绑定稳定地点档案，请先建立地点档案后再保存任务");
    }
  }

  private async applyApprovedObject(
    tx: any,
    regionId: string,
    object: any,
    review: {
      targetPlaceId?: string;
      applyFields: string[];
      promoteAttachmentIds: string[];
    },
    adminId: string,
    reviewedAt: Date,
  ) {
    const properties = object.properties && typeof object.properties === "object" && !Array.isArray(object.properties)
      ? object.properties as Record<string, unknown>
      : {};
    const bindings = Array.isArray(object.bindings) ? object.bindings as Array<Record<string, unknown>> : [];
    let requestedTargetId = String(
      review.targetPlaceId || properties.targetPlaceId || bindings.find((binding) => binding?.targetId)?.targetId || "",
    ).trim();
    let placeVerification: PlaceVerificationResult | null = null;
    if (object.objectType === "place_verification") {
      const objectTargetId = String(properties.targetPlaceId || "").trim();
      const reviewTargetId = String(review.targetPlaceId || "").trim();
      const verificationTargetIds = [...new Set(bindings
        .filter((binding) => String(binding?.targetType || "") === "place"
          && String(binding?.relationType || "") === "verifies")
        .map((binding) => String(binding?.targetId || "").trim())
        .filter(Boolean))];
      if (!objectTargetId
        || verificationTargetIds.length !== 1
        || verificationTargetIds[0] !== objectTargetId) {
        throw new BadRequestException("地点核验对象的 properties/binding 必须绑定同一 targetPlaceId");
      }
      if (reviewTargetId && reviewTargetId !== objectTargetId) {
        throw new BadRequestException("地点核验审核不能改绑到其他 targetPlaceId");
      }
      requestedTargetId = objectTargetId;
      placeVerification = await this.validatePlaceVerificationEvidence(tx, object, properties);
    }
    const applyFields = object.objectType === "road" && review.applyFields.length === 0
      ? ["geometry"]
      : review.applyFields;
    if (applyFields.includes("entrance") && !placeVerification) {
      throw new BadRequestException("主入口只能从完成强证据校验的地点核验对象中合并");
    }
    if (object.objectType !== "road" && applyFields.length === 0) {
      return { applied: false, reason: "no_explicit_apply_fields" };
    }
    const fingerprint = createHash("sha256").update(JSON.stringify({
      objectId: object.id,
      objectType: object.objectType,
      ...(object.objectType === "place_verification"
        ? { placeCalibrationApplyVersion: PLACE_CALIBRATION_APPLY_VERSION }
        : {}),
      geometry: object.geometry,
      properties,
      applyFields: [...applyFields].sort(),
      promoteAttachmentIds: [...review.promoteAttachmentIds].sort(),
      requestedTargetId,
    })).digest("hex");
    const previousApplyResult = object.applyResult
        && typeof object.applyResult === "object"
        && !Array.isArray(object.applyResult)
        ? object.applyResult as Record<string, unknown>
        : {};
    const previousRouteAnchors = previousApplyResult.routeEndpointAnchors
      && typeof previousApplyResult.routeEndpointAnchors === "object"
      && !Array.isArray(previousApplyResult.routeEndpointAnchors)
      ? previousApplyResult.routeEndpointAnchors as Record<string, unknown>
      : null;
    const canReuseAppliedResult = object.objectType !== "road"
      || Number(previousRouteAnchors?.version) === 1;
    if (object.applyFingerprint === fingerprint && object.appliedToDraftAt && canReuseAppliedResult) {
      return {
        ...previousApplyResult,
        applied: true,
        idempotent: true,
        fingerprint,
        draftId: object.appliedDraftId,
        draftRevision: object.appliedDraftRevision,
      };
    }

    const map = await tx.campusMap.findUnique({
      where: { regionId },
      select: { id: true, draft: { select: { id: true, manifest: true, revision: true } } },
    });
    if (!map?.draft) throw new BadRequestException("请先创建该学校的校园地图草稿");
    const manifest: any = JSON.parse(JSON.stringify(map.draft.manifest));
    const audit: Record<string, any> = {
      applied: true,
      idempotent: false,
      fingerprint,
      draftId: map.draft.id,
      draftRevision: map.draft.revision + 1,
      objectType: object.objectType,
      applyFields,
      promotedAttachmentIds: [],
    };
    if (placeVerification) {
      audit.locationVerification = placeVerification.locationVerification;
      audit.photoVerification = placeVerification.photoVerification;
    }

    if (object.objectType === "road") {
      if (!applyFields.includes("geometry")) {
        return { applied: false, reason: "road_geometry_not_selected" };
      }
      const roadCoordinates = Array.isArray(object.geometry?.coordinates) ? object.geometry.coordinates : [];
      const clientReportedQuality = object.quality && typeof object.quality === "object" ? object.quality : {};
      if (object.geometry?.type !== "LineString" || roadCoordinates.length < 2) {
        throw new BadRequestException("道路采集结果至少需要两个有效轨迹点");
      }
      if (properties.coordinateType && String(properties.coordinateType).toLowerCase() !== "gcj02") {
        throw new BadRequestException("道路采集坐标必须为 GCJ-02");
      }
      const sourceCoordinates: Array<[number, number]> = roadCoordinates.map((coordinate: unknown) => {
        if (!Array.isArray(coordinate) || !isValidLngLat(coordinate[0], coordinate[1])) {
          throw new BadRequestException("道路采集包含无效 GCJ-02 轨迹点");
        }
        return [Number(coordinate[0]), Number(coordinate[1])] as [number, number];
      });
      const clientPointIds = Array.isArray(properties.clientPointIds)
        ? properties.clientPointIds.map(String).map((id) => id.trim()).filter(Boolean)
        : [];
      if (clientPointIds.length !== sourceCoordinates.length
        || new Set(clientPointIds).size !== clientPointIds.length) {
        throw new BadRequestException("道路采集必须提供与几何点一一对应的唯一 clientPointIds");
      }
      const segmentStartedAt = new Date(String(properties.segmentStartedAt || ""));
      const segmentEndedAt = new Date(String(properties.segmentEndedAt || ""));
      if (Number.isNaN(segmentStartedAt.getTime())
        || Number.isNaN(segmentEndedAt.getTime())
        || segmentEndedAt <= segmentStartedAt) {
        throw new BadRequestException("道路采集必须提供有效 segmentStartedAt/segmentEndedAt");
      }
      const sessionStartedAt = object.session?.startedAt ? new Date(object.session.startedAt) : null;
      const sessionEndedAt = object.session?.endedAt ? new Date(object.session.endedAt) : null;
      if ((sessionStartedAt && segmentStartedAt < sessionStartedAt)
        || (sessionEndedAt && segmentEndedAt > sessionEndedAt)
        || (object.recordedAt && segmentEndedAt > new Date(object.recordedAt))) {
        throw new BadRequestException("道路分段时间必须位于所属采集会话和对象记录时间内");
      }
      const acknowledgedPoints = await tx.campusMapCollectionPoint.findMany({
        where: { sessionId: object.sessionId, clientPointId: { in: clientPointIds } },
        select: {
          clientPointId: true,
          pointSeq: true,
          longitude: true,
          latitude: true,
          accuracy: true,
          recordedAt: true,
        },
      });
      const acknowledgedById = new Map<string, any>(
        acknowledgedPoints.map((point: any) => [String(point.clientPointId), point]),
      );
      if (acknowledgedById.size !== clientPointIds.length) {
        throw new BadRequestException("道路几何引用了尚未被服务器 ACK 的轨迹点");
      }
      let previousPointSeq = -1;
      let previousRecordedAt = Number.NEGATIVE_INFINITY;
      const orderedAcknowledgedPoints: any[] = [];
      clientPointIds.forEach((clientPointId, index) => {
        const acknowledged = acknowledgedById.get(clientPointId);
        const recordedAt = new Date(acknowledged.recordedAt);
        if (Number(acknowledged.pointSeq) <= previousPointSeq
          || recordedAt.getTime() <= previousRecordedAt
          || recordedAt < segmentStartedAt
          || recordedAt > segmentEndedAt
          || distanceMeters(
            { longitude: sourceCoordinates[index][0], latitude: sourceCoordinates[index][1] },
            { longitude: Number(acknowledged.longitude), latitude: Number(acknowledged.latitude) },
          ) > 2) {
          throw new BadRequestException("道路几何与服务器 ACK 轨迹点的顺序、时间或坐标不一致");
        }
        previousPointSeq = Number(acknowledged.pointSeq);
        previousRecordedAt = recordedAt.getTime();
        orderedAcknowledgedPoints.push(acknowledged);
      });
      const serverRouteQuality = this.calculateServerRouteQuality(orderedAcknowledgedPoints);
      if (serverRouteQuality.sampleCount < 5) {
        throw new BadRequestException("道路采集服务器 ACK 样本点至少为 5");
      }
      if (serverRouteQuality.medianAccuracy > 10) {
        throw new BadRequestException("道路采集服务器 ACK 点中位精度必须在 10 米以内，请重新采集");
      }
      if (serverRouteQuality.maxAccuracy > 20) {
        throw new BadRequestException("道路采集服务器 ACK 点最大精度必须在 20 米以内，请重新采集");
      }
      if (serverRouteQuality.distanceMeters < 10) {
        throw new BadRequestException("道路采集服务器 ACK 轨迹距离不足 10 米，请重新采集");
      }
      if (serverRouteQuality.durationSeconds <= 0 || serverRouteQuality.maximumGapSeconds > 30) {
        throw new BadRequestException("道路采集服务器 ACK 轨迹时长或断点间隔无效，请重新采集");
      }
      const routeAnchorFromPoint = (point: any, sharedFromObjectId = ""): any => ({
        key: createHash("sha256")
          .update(`${String(object.sessionId)}:${String(point.clientPointId)}`)
          .digest("hex"),
        pointId: String(point.clientPointId),
        longitude: Number(point.longitude),
        latitude: Number(point.latitude),
        accuracy: Number(point.accuracy),
        pointSeq: Number(point.pointSeq),
        recordedAt: point.recordedAt instanceof Date
          ? point.recordedAt.toISOString()
          : new Date(point.recordedAt).toISOString(),
        ...(sharedFromObjectId ? { sharedFromObjectId } : {}),
      });
      const currentFirstPoint = orderedAcknowledgedPoints[0];
      const currentLastPoint = orderedAcknowledgedPoints[orderedAcknowledgedPoints.length - 1];
      let startRouteAnchor = routeAnchorFromPoint(currentFirstPoint);
      let endRouteAnchor = routeAnchorFromPoint(currentLastPoint);
      const previousRouteObjectId = String(properties.previousRouteObjectId || "").trim();
      const sharedStartAnchorPointId = String(properties.sharedStartAnchorPointId || "").trim();
      const startJunctionAnchorKey = String(properties.startJunctionAnchorKey || "").trim().toLowerCase();
      const endJunctionAnchorKey = String(properties.endJunctionAnchorKey || "").trim().toLowerCase();
      if (Boolean(previousRouteObjectId) !== Boolean(sharedStartAnchorPointId)) {
        throw new BadRequestException("相邻路线必须同时提供上一段对象和共享路口 ACK 点");
      }
      if (startJunctionAnchorKey && previousRouteObjectId) {
        throw new BadRequestException("路线起点不能同时选择已审核路口和上一段离线依赖");
      }
      if (startJunctionAnchorKey && startJunctionAnchorKey === endJunctionAnchorKey) {
        throw new BadRequestException("同一路口环线必须在中途分段，路线起终点不能选择同一锚点");
      }
      const requestedJunctionKeys = [...new Set([startJunctionAnchorKey, endJunctionAnchorKey].filter(Boolean))];
      const trustedJunctions = requestedJunctionKeys.length
        ? await this.loadTrustedRouteJunctions(tx, regionId, manifest)
        : [];
      const trustedJunctionByKey = new Map(trustedJunctions.map((junction) => [junction.key, junction]));
      const anchorFromCatalog = (
        currentPoint: any,
        anchorKey: string,
        endpointLabel: "起点" | "终点",
      ) => {
        const junction = trustedJunctionByKey.get(anchorKey);
        if (!junction) {
          throw new BadRequestException(`路线${endpointLabel}选择的已审核路口不存在或已失效，请刷新任务后重试`);
        }
        const currentAccuracy = Number(currentPoint.accuracy);
        if (!Number.isFinite(currentAccuracy) || currentAccuracy <= 0 || currentAccuracy > 8) {
          throw new BadRequestException(`路线${endpointLabel}定位精度必须在 8 米以内才能连接已审核路口`);
        }
        if (distanceMeters(
          { longitude: junction.longitude, latitude: junction.latitude },
          { longitude: Number(currentPoint.longitude), latitude: Number(currentPoint.latitude) },
        ) > 12) {
          throw new BadRequestException(`路线${endpointLabel}距离所选已审核路口超过 12 米，请回到路口重采`);
        }
        return {
          key: junction.key,
          pointId: String(currentPoint.clientPointId),
          longitude: junction.longitude,
          latitude: junction.latitude,
          accuracy: currentAccuracy,
          pointSeq: Number(currentPoint.pointSeq),
          recordedAt: currentPoint.recordedAt instanceof Date
            ? currentPoint.recordedAt.toISOString()
            : new Date(currentPoint.recordedAt).toISOString(),
          sharedFromObjectId: junction.sourceObjectId,
          sharedFromEndpoint: junction.sourceEndpoint,
          junctionSourcePointId: junction.pointId,
        };
      };
      if (startJunctionAnchorKey) {
        startRouteAnchor = anchorFromCatalog(currentFirstPoint, startJunctionAnchorKey, "起点");
      }
      if (endJunctionAnchorKey) {
        endRouteAnchor = anchorFromCatalog(currentLastPoint, endJunctionAnchorKey, "终点");
      }
      if (previousRouteObjectId) {
        if (previousRouteObjectId === String(object.id)) {
          throw new BadRequestException("相邻路线不能把自身作为上一段路线");
        }
        const previousRoute = await tx.campusMapCollectionObject.findFirst({
          where: {
            id: previousRouteObjectId,
            sessionId: object.sessionId,
            objectType: "road",
            reviewStatus: "approved",
            appliedToDraftAt: { not: null },
          },
          select: { id: true, properties: true, applyResult: true },
        });
        if (!previousRoute) {
          throw new BadRequestException("请先审核并合并上一段路线，再审核当前相邻路段");
        }
        const previousProperties = previousRoute.properties
          && typeof previousRoute.properties === "object"
          && !Array.isArray(previousRoute.properties)
          ? previousRoute.properties as Record<string, unknown>
          : {};
        const previousPointIds = Array.isArray(previousProperties.clientPointIds)
          ? previousProperties.clientPointIds.map(String).filter(Boolean)
          : [];
        if (!previousPointIds.length
          || previousPointIds[previousPointIds.length - 1] !== sharedStartAnchorPointId) {
          throw new BadRequestException("共享路口 ACK 点不是上一段路线的末点");
        }
        const previousResult = previousRoute.applyResult
          && typeof previousRoute.applyResult === "object"
          && !Array.isArray(previousRoute.applyResult)
          ? previousRoute.applyResult as Record<string, any>
          : {};
        const previousAnchors = previousResult.routeEndpointAnchors
          && typeof previousResult.routeEndpointAnchors === "object"
          && !Array.isArray(previousResult.routeEndpointAnchors)
          ? previousResult.routeEndpointAnchors as Record<string, any>
          : null;
        if (Number(previousAnchors?.version) !== 1
          || String(previousAnchors?.end?.pointId || "") !== sharedStartAnchorPointId
          || !/^[a-f0-9]{64}$/.test(String(previousAnchors?.end?.key || ""))
          || !isValidLngLat(previousAnchors?.end?.longitude, previousAnchors?.end?.latitude)) {
          throw new BadRequestException("上一段路线缺少可信路口锚点，请先重新审核上一段路线");
        }
        const previousEnd = previousAnchors!.end as Record<string, any>;
        const sharedPoint = await tx.campusMapCollectionPoint.findUnique({
          where: {
            sessionId_clientPointId: {
              sessionId: object.sessionId,
              clientPointId: sharedStartAnchorPointId,
            },
          },
          select: {
            clientPointId: true,
            pointSeq: true,
            longitude: true,
            latitude: true,
            accuracy: true,
            recordedAt: true,
          },
        });
        const sharedRecordedAt = sharedPoint ? new Date(sharedPoint.recordedAt).getTime() : Number.NaN;
        const currentStartedAt = new Date(currentFirstPoint.recordedAt).getTime();
        if (!sharedPoint
          || !isValidLngLat(sharedPoint.longitude, sharedPoint.latitude)
          || !Number.isFinite(Number(sharedPoint.accuracy))
          || Number(sharedPoint.accuracy) <= 0
          || Number(sharedPoint.accuracy) > 8
          || Number(sharedPoint.pointSeq) >= Number(currentFirstPoint.pointSeq)
          || !Number.isFinite(sharedRecordedAt)
          || sharedRecordedAt >= currentStartedAt) {
          throw new BadRequestException("共享路口 ACK 点的坐标、精度或采集顺序无效");
        }
        if (distanceMeters(
          { longitude: Number(previousEnd.longitude), latitude: Number(previousEnd.latitude) },
          { longitude: Number(currentFirstPoint.longitude), latitude: Number(currentFirstPoint.latitude) },
        ) > 12) {
          throw new BadRequestException("当前路段起点距离上一段共享路口超过 12 米，请回到路口重采");
        }
        startRouteAnchor = {
          key: String(previousEnd.key),
          pointId: String(sharedPoint.clientPointId),
          longitude: Number(previousEnd.longitude),
          latitude: Number(previousEnd.latitude),
          accuracy: Number(sharedPoint.accuracy),
          pointSeq: Number(sharedPoint.pointSeq),
          recordedAt: sharedPoint.recordedAt instanceof Date
            ? sharedPoint.recordedAt.toISOString()
            : new Date(sharedPoint.recordedAt).toISOString(),
          sharedFromObjectId: previousRoute.id,
          sharedFromEndpoint: "end",
          junctionSourcePointId: String(previousEnd.pointId),
        };
      }
      const routeEndpointAnchors = {
        version: 1,
        start: startRouteAnchor,
        end: endRouteAnchor,
      };
      const routeFeatureAnchors = {
        version: 1,
        start: {
          key: startRouteAnchor.key,
          longitude: startRouteAnchor.longitude,
          latitude: startRouteAnchor.latitude,
          ...(startRouteAnchor.sharedFromObjectId
            ? {
                sharedFromObjectId: startRouteAnchor.sharedFromObjectId,
                sharedFromEndpoint: startRouteAnchor.sharedFromEndpoint,
              }
            : {}),
        },
        end: {
          key: endRouteAnchor.key,
          longitude: endRouteAnchor.longitude,
          latitude: endRouteAnchor.latitude,
          ...(endRouteAnchor.sharedFromObjectId
            ? {
                sharedFromObjectId: endRouteAnchor.sharedFromObjectId,
                sharedFromEndpoint: endRouteAnchor.sharedFromEndpoint,
              }
            : {}),
        },
      };
      const authoritativeCoordinates: Array<[number, number]> = orderedAcknowledgedPoints.map((point) => [
        Number(point.longitude),
        Number(point.latitude),
      ]);
      const nativeGcj02 = isNativeGcj02Manifest(manifest);
      const draftCoordinates = nativeGcj02
        ? authoritativeCoordinates
        : authoritativeCoordinates.map(([longitude, latitude]) => {
            const projected = projectGpsToManifestPoint(manifest, longitude, latitude);
            if (!projected) {
              throw new BadRequestException("当前图片/CAD 底图缺少至少 3 个有效校准点，不能合并路线");
            }
            return [projected.x, projected.y];
          });
      const attachmentIds = new Set((object.attachments || []).map((attachment: any) => String(attachment.id)));
      if (review.promoteAttachmentIds.some((id) => !attachmentIds.has(id))) {
        throw new BadRequestException("选中的路线证据不属于该采集对象");
      }
      const evidence = applyFields.includes("media")
        ? (object.attachments || [])
            .filter((attachment: any) => review.promoteAttachmentIds.includes(String(attachment.id)))
            .map((attachment: any) => ({
              id: attachment.id,
              url: attachment.url,
              kind: attachment.kind,
              mimeType: attachment.mimeType,
              metadata: attachment.metadata || null,
            }))
        : [];
      const layer = this.ensureOperatorLayer(manifest, "operator_routes", "现场采集路线");
      const stableFeatureId = `collection-route-${object.id}`;
      const feature = {
        type: "Feature",
        geometry: { ...object.geometry, coordinates: draftCoordinates },
        properties: {
          ...properties,
          id: stableFeatureId,
          sourceObjectId: object.id,
          sourceSessionId: object.sessionId,
          semanticType: "road",
          geometryStatus: "verified_line",
          coordinateType: "gcj02",
          geometryCoordinateType: nativeGcj02
            ? "gcj02"
            : String(manifest?.coordinateSystem?.type || manifest?.baseSource || "projected"),
          sourceGeometryGcj02: { type: "LineString", coordinates: authoritativeCoordinates },
          collectionSource: "rider_app_approved",
          routeEndpointAnchors: routeFeatureAnchors,
          collectedAt: object.recordedAt,
          reviewedAt,
          reviewedBy: adminId,
          quality: {
            ...serverRouteQuality,
            source: "server_ack",
            clientReported: clientReportedQuality,
          },
          evidence,
        },
      };
      const index = layer.inlineData.features.findIndex((item: any) => String(item?.properties?.sourceObjectId || item?.properties?.id) === object.id || item?.properties?.id === stableFeatureId);
      if (index >= 0) layer.inlineData.features[index] = feature;
      else layer.inlineData.features.push(feature);
      layer.featureCount = layer.inlineData.features.length;
      audit.featureId = stableFeatureId;
      audit.routeQuality = {
        ...serverRouteQuality,
        source: "server_ack",
        clientReported: clientReportedQuality,
      };
      audit.routeEndpointAnchors = routeEndpointAnchors;
      audit.routeEvidenceAttachmentIds = evidence.map((attachment: any) => attachment.id);
    } else {
      if (!requestedTargetId) throw new BadRequestException("地点审核缺少 targetPlaceId");
      const place = await tx.campusMapProject.findFirst({
        where: {
          regionId,
          OR: [{ id: requestedTargetId }, { artworkFeatureKey: requestedTargetId }],
        },
      });
      if (!place) throw new BadRequestException("地点档案不存在或不属于当前学校");
      const data: Record<string, any> = { updatedBy: adminId };
      const longitude = Number(object.longitude);
      const latitude = Number(object.latitude);
      if (applyFields.includes("location")) {
        if (!isValidLngLat(longitude, latitude)) throw new BadRequestException("审核位置时缺少有效 GCJ-02 坐标");
        const accuracy = Number(object.accuracy);
        if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 8) {
          throw new BadRequestException("现场定位精度必须在 8 米以内，请重新采集");
        }
        let acceptedLongitude = longitude;
        let acceptedLatitude = latitude;
        let acceptedAccuracy = accuracy;
        if (object.objectType === "place_verification") {
          if (!placeVerification) throw new BadRequestException("地点核验证据校验未完成");
          acceptedLongitude = placeVerification.acceptedLongitude;
          acceptedLatitude = placeVerification.acceptedLatitude;
          acceptedAccuracy = placeVerification.acceptedAccuracy;
        }
        Object.assign(data, {
          longitude: acceptedLongitude,
          latitude: acceptedLatitude,
          coordinateType: "gcj02",
          coordinateStatus: "verified",
          coordinateSource: "rider_app_approved",
          coordinateAccuracy: acceptedAccuracy,
          coordinateCollectedAt: placeVerification?.acceptedRecordedAt || object.recordedAt,
          geometryStatus: place.geometryStatus === "verified_polygon" ? place.geometryStatus : "verified_point",
        });
      }
      if (applyFields.includes("address")) {
        data.addressDescription = String(properties.addressDescription || "").trim() || place.addressDescription;
        data.addressCandidate = String(properties.addressCandidate || properties.formattedAddress || "").trim() || place.addressCandidate;
      }
      if (applyFields.includes("constructionStatus")) {
        const value = String(properties.constructionStatus || "");
        if (!["built", "under_construction", "planned", "renovating"].includes(value)) throw new BadRequestException("现场建设状态无效");
        data.constructionStatus = value;
      }
      if (applyFields.includes("serviceStatus")) {
        const value = String(properties.serviceStatus || properties.openStatus || "");
        if (!["unknown", "open", "limited", "unopened", "closed", "temporarily_closed"].includes(value)) throw new BadRequestException("现场服务状态无效");
        data.serviceStatus = value;
      }
      await tx.campusMapProject.update({ where: { id: place.id }, data });

      if (object.objectType === "place_verification"
        && placeVerification
        && applyFields.includes("entrance")) {
        const entranceCandidate = properties.entranceCandidate
          && typeof properties.entranceCandidate === "object"
          && !Array.isArray(properties.entranceCandidate)
          ? properties.entranceCandidate as Record<string, unknown>
          : null;
        if (!entranceCandidate) {
          throw new BadRequestException("合并主入口时缺少骑手提交的入口候选证据");
        }
        const candidateLongitude = Number(entranceCandidate.longitude);
        const candidateLatitude = Number(entranceCandidate.latitude);
        const candidateAccuracy = Number(entranceCandidate.accuracy);
        const candidateName = String(entranceCandidate.name || "").trim();
        const candidateCoordinateType = String(entranceCandidate.coordinateType || "").toLowerCase();
        const candidateServiceStatus = String(entranceCandidate.serviceStatus || "");
        if (!candidateName || candidateName.length > 80
          || candidateCoordinateType !== "gcj02"
          || !isValidLngLat(candidateLongitude, candidateLatitude)
          || !Number.isFinite(candidateAccuracy)
          || candidateAccuracy <= 0
          || candidateAccuracy > 8
          || !["unknown", "open", "limited", "unopened", "closed", "temporarily_closed"].includes(candidateServiceStatus)) {
          throw new BadRequestException("入口候选必须包含名称、开放状态及精度在 8 米内的有效 GCJ-02 坐标");
        }
        if (distanceMeters(
          { longitude: candidateLongitude, latitude: candidateLatitude },
          { longitude: placeVerification.acceptedLongitude, latitude: placeVerification.acceptedLatitude },
        ) > 3) {
          throw new BadRequestException("入口候选坐标与服务器 ACK 站定采样中位点偏差超过 3 米");
        }
        const existingPrimaryEntrance = await tx.campusMapPlaceEntrance.findFirst({
          where: { placeId: place.id, isPrimary: true },
          select: { id: true },
        });
        await tx.campusMapPlaceEntrance.updateMany({
          where: {
            placeId: place.id,
            ...(existingPrimaryEntrance ? { id: { not: existingPrimaryEntrance.id } } : {}),
          },
          data: { isPrimary: false, updatedBy: adminId },
        });
        const entranceData = {
          name: candidateName,
          longitude: placeVerification.acceptedLongitude,
          latitude: placeVerification.acceptedLatitude,
          coordinateType: "gcj02",
          accuracy: placeVerification.acceptedAccuracy,
          addressDescription: String(entranceCandidate.addressDescription || properties.addressDescription || "").trim() || null,
          serviceStatus: candidateServiceStatus,
          isPrimary: true,
          sourceType: "rider_collection",
          updatedBy: adminId,
        };
        const primaryEntrance = existingPrimaryEntrance
          ? await tx.campusMapPlaceEntrance.update({
              where: { id: existingPrimaryEntrance.id },
              data: entranceData,
            })
          : await tx.campusMapPlaceEntrance.create({
              data: { ...entranceData, placeId: place.id, createdBy: adminId },
            });
        audit.primaryEntranceId = primaryEntrance.id;
      }

      if (applyFields.includes("media")) {
        const attachmentIds = new Set((object.attachments || []).map((attachment: any) => String(attachment.id)));
        if (review.promoteAttachmentIds.some((id) => !attachmentIds.has(id))) {
          throw new BadRequestException("选中的现场照片不属于该采集对象");
        }
        for (const attachment of object.attachments || []) {
          if (!review.promoteAttachmentIds.includes(String(attachment.id))) continue;
          const metadata = attachment.metadata && typeof attachment.metadata === "object" ? attachment.metadata : {};
          const mediaType = this.evidenceMediaType(metadata);
          await tx.campusMapPlaceMedia.upsert({
            where: { collectionAttachmentId: attachment.id },
            create: {
              placeId: place.id,
              collectionAttachmentId: attachment.id,
              mediaType,
              sourceType: "rider",
              url: attachment.url,
              storageKey: attachment.storageKey,
              mimeType: attachment.mimeType,
              byteSize: attachment.byteSize,
              checksum: attachment.checksum,
              reviewStatus: "approved",
              isPublic: true,
              capturedAt: this.optionalObjectDate(metadata.capturedAt),
              captureLongitude: this.optionalObjectNumber(metadata.captureLongitude ?? metadata.longitude),
              captureLatitude: this.optionalObjectNumber(metadata.captureLatitude ?? metadata.latitude),
              captureAccuracy: this.optionalObjectNumber(metadata.accuracy),
              metadata: metadata as Prisma.InputJsonValue,
              createdBy: adminId,
            },
            update: { placeId: place.id, reviewStatus: "approved", isPublic: true, mediaType },
          });
          audit.promotedAttachmentIds.push(attachment.id);
        }
      }

      const updatedPlace = await tx.campusMapProject.findUnique({
        where: { id: place.id },
        include: {
          media: { where: { isPublic: true, reviewStatus: "approved" }, orderBy: { sortOrder: "asc" } },
          entrances: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        },
      });
      const feature = this.findPlaceFeature(manifest, updatedPlace, requestedTargetId);
      if (feature) {
        feature.properties = {
          ...feature.properties,
          id: place.id,
          placeId: place.id,
          officialNumber: updatedPlace.officialNumber,
          officialName: updatedPlace.officialName,
          title: updatedPlace.displayName || updatedPlace.officialName,
          constructionStatus: updatedPlace.constructionStatus,
          serviceStatus: updatedPlace.serviceStatus,
          unavailableMessage: updatedPlace.serviceStatus === "open" ? "" : updatedPlace.unavailableMessage,
          publishStatus: updatedPlace.publishStatus,
          longitude: updatedPlace.coordinateStatus === "verified" ? updatedPlace.longitude : null,
          latitude: updatedPlace.coordinateStatus === "verified" ? updatedPlace.latitude : null,
          coordinateStatus: updatedPlace.coordinateStatus,
          coordinateSource: updatedPlace.coordinateSource,
          coordinateAccuracy: updatedPlace.coordinateAccuracy,
          coordinateCollectedAt: updatedPlace.coordinateCollectedAt,
          addressDescription: updatedPlace.addressDescription,
          entrances: (updatedPlace.entrances || []).map((entrance: any) => ({
            id: entrance.id,
            name: entrance.name,
            longitude: entrance.longitude,
            latitude: entrance.latitude,
            coordinateType: "gcj02",
            serviceStatus: entrance.serviceStatus,
            isPrimary: entrance.isPrimary,
            address: entrance.addressDescription,
          })),
          coverUrl: updatedPlace.coverUrl || updatedPlace.media.find((item: any) => item.mediaType === "cover")?.url || null,
        };
        if (applyFields.includes("location") && updatedPlace.longitude != null && updatedPlace.latitude != null) {
          const projected = projectGpsToManifestPoint(manifest, updatedPlace.longitude, updatedPlace.latitude);
          if (projected && feature.geometry?.type === "Point") feature.geometry.coordinates = [projected.x, projected.y];
        }
      }
      if (object.objectType === "place_verification"
        && placeVerification
        && applyFields.includes("location")) {
        audit.calibration = this.mergeApprovedPlaceCalibrationPoint(
          manifest,
          updatedPlace || place,
          feature,
          object,
          placeVerification,
          reviewedAt,
        );
      }
      const catalog = Array.isArray(manifest.placeCatalog) ? manifest.placeCatalog : [];
      const snapshot = this.placeSnapshot(updatedPlace);
      const snapshotIndex = catalog.findIndex((item: any) => String(item?.id) === place.id);
      if (snapshotIndex >= 0) catalog[snapshotIndex] = snapshot;
      else catalog.push(snapshot);
      manifest.placeCatalog = catalog;
      audit.placeId = place.id;
    }

    const draftUpdate = await tx.campusMapDraft.updateMany({
      where: { id: map.draft.id, revision: map.draft.revision },
      data: {
        manifest: manifest as Prisma.InputJsonValue,
        revision: { increment: 1 },
        updatedBy: adminId,
      },
    });
    if (draftUpdate.count !== 1) {
      throw new ConflictException("地图草稿已被其他管理员更新，请刷新后重新审核该采集对象");
    }
    return audit;
  }

  private ensureOperatorLayer(manifest: any, id: string, title: string) {
    if (!Array.isArray(manifest.layers)) manifest.layers = [];
    let layer = manifest.layers.find((item: any) => item?.id === id);
    if (!layer) {
      layer = {
        id,
        role: id,
        title,
        load: "inline",
        enabled: true,
        inlineData: { type: "FeatureCollection", features: [] },
        featureCount: 0,
      };
      manifest.layers.push(layer);
    }
    if (!layer.inlineData || !Array.isArray(layer.inlineData.features)) {
      layer.inlineData = { type: "FeatureCollection", features: [] };
    }
    return layer;
  }

  private findPlaceFeature(manifest: any, place: any, requestedTargetId: string) {
    return this.manifestFeatures(manifest).find((feature: any) => {
      const properties = feature.properties || {};
      return [properties.id, properties.placeId, properties.artworkFeatureKey]
        .map(String)
        .includes(requestedTargetId)
        || String(properties.id || "") === String(place.id)
        || Number(properties.officialNumber) === Number(place.officialNumber);
    });
  }

  private mergeApprovedPlaceCalibrationPoint(
    manifest: any,
    place: any,
    feature: any,
    object: any,
    verification: PlaceVerificationResult,
    reviewedAt: Date,
  ) {
    if (isNativeGcj02Manifest(manifest)) {
      return { applied: false, reason: "native_gcj02_not_required" };
    }
    const directX = finiteNumber(place?.artworkAnchorX);
    const directY = finiteNumber(place?.artworkAnchorY);
    let mapX = directX;
    let mapY = directY;
    if (mapX === null || mapY === null) {
      const geometry = feature?.geometry;
      if (geometry?.type === "Point" && Array.isArray(geometry.coordinates)) {
        mapX = finiteNumber(geometry.coordinates[0]);
        mapY = finiteNumber(geometry.coordinates[1]);
      } else if (geometry?.type === "Polygon" && Array.isArray(geometry.coordinates?.[0])) {
        const ring = geometry.coordinates[0]
          .map((coordinate: unknown) => Array.isArray(coordinate)
            ? [finiteNumber(coordinate[0]), finiteNumber(coordinate[1])]
            : [null, null])
          .filter((coordinate: Array<number | null>) => coordinate[0] !== null && coordinate[1] !== null);
        const uniqueRing = ring.length > 1
          && ring[0][0] === ring[ring.length - 1][0]
          && ring[0][1] === ring[ring.length - 1][1]
          ? ring.slice(0, -1)
          : ring;
        if (uniqueRing.length >= 3) {
          mapX = uniqueRing.reduce((sum, coordinate) => sum + Number(coordinate[0]), 0) / uniqueRing.length;
          mapY = uniqueRing.reduce((sum, coordinate) => sum + Number(coordinate[1]), 0) / uniqueRing.length;
        }
      }
    }
    if (mapX === null || mapY === null) {
      return {
        applied: false,
        reason: "artwork_anchor_missing",
        placeId: String(place?.id || ""),
      };
    }

    const positioning = manifest.positioning
      && typeof manifest.positioning === "object"
      && !Array.isArray(manifest.positioning)
      ? { ...manifest.positioning }
      : {};
    const calibrationPoints = Array.isArray(positioning.calibrationPoints)
      ? positioning.calibrationPoints.map((point: any) => ({ ...point }))
      : [];
    const placeId = String(place?.id || "").trim();
    const stableId = `place-calibration-${placeId || String(object.id)}`;
    const sameAnchor = (point: any) => {
      const x = finiteNumber(point?.mapX ?? point?.x);
      const y = finiteNumber(point?.mapY ?? point?.y);
      return x !== null && y !== null
        && Math.abs(x - Number(mapX)) <= 1e-6
        && Math.abs(y - Number(mapY)) <= 1e-6;
    };
    const existingIndex = calibrationPoints.findIndex((point: any) =>
      String(point?.id || "") === stableId
      || (placeId && String(point?.sourcePlaceId || "") === placeId)
      || sameAnchor(point));
    const existing = existingIndex >= 0 ? calibrationPoints[existingIndex] : {};
    const point = {
      ...existing,
      id: stableId,
      title: String(existing.title || `采集校准 · ${place?.displayName || place?.officialName || place?.title || placeId || "地点"}`),
      longitude: verification.acceptedLongitude,
      latitude: verification.acceptedLatitude,
      mapX: Number(mapX),
      mapY: Number(mapY),
      source: "approved_place_verification",
      sourcePlaceId: placeId || undefined,
      sourceCollectionObjectId: String(object.id),
      accuracy: verification.acceptedAccuracy,
      collectedAt: verification.acceptedRecordedAt.toISOString(),
      reviewedAt: reviewedAt.toISOString(),
    };
    if (existingIndex >= 0) calibrationPoints[existingIndex] = point;
    else calibrationPoints.push(point);
    const ready = calibrationPointsReady(calibrationPoints);
    const validPointCount = calibrationPoints.filter((item: any) =>
      finiteNumber(item?.mapX ?? item?.x) !== null
      && finiteNumber(item?.mapY ?? item?.y) !== null
      && isValidLngLat(item?.longitude ?? item?.lng, item?.latitude ?? item?.lat)).length;
    manifest.positioning = {
      ...positioning,
      enabled: ready,
      coordinateType: "gcj02",
      permissionPurpose: String(positioning.permissionPurpose
        || "用于在校园地图中显示你所在的位置，并计算到目标地点的距离"),
      calibrationPoints,
    };
    return {
      applied: true,
      action: existingIndex >= 0 ? "updated" : "created",
      pointId: point.id,
      placeId: placeId || null,
      pointCount: validPointCount,
      requiredPointCount: 3,
      remainingPointCount: Math.max(0, 3 - validPointCount),
      ready,
      source: "approved_place_verification",
    };
  }

  private placeSnapshot(place: any) {
    return {
      id: place.id,
      officialNumber: place.officialNumber,
      officialName: place.officialName,
      title: place.displayName || place.officialName,
      semanticType: place.semanticType,
      constructionStatus: place.constructionStatus,
      serviceStatus: place.serviceStatus,
      unavailableMessage: place.serviceStatus === "open" ? "" : String(place.unavailableMessage || ""),
      publishStatus: place.publishStatus,
      visibilityScope: place.visibilityScope,
      searchable: place.searchable,
      navigable: place.navigable,
      artworkFeatureKey: place.artworkFeatureKey,
      artworkAnchorX: place.artworkAnchorX,
      artworkAnchorY: place.artworkAnchorY,
      longitude: place.coordinateStatus === "verified" ? place.longitude : null,
      latitude: place.coordinateStatus === "verified" ? place.latitude : null,
      coordinateStatus: place.coordinateStatus,
      addressDescription: place.addressDescription,
      description: place.description,
      coverUrl: place.coverUrl || place.media?.find((item: any) => item.mediaType === "cover")?.url || null,
      media: (place.media || []).map((item: any) => ({
        id: item.id,
        mediaType: item.mediaType,
        url: item.url,
        mimeType: item.mimeType,
        sortOrder: item.sortOrder,
      })),
      entrances: (place.entrances || []).map((entrance: any) => ({
        id: entrance.id,
        name: entrance.name,
        longitude: entrance.longitude,
        latitude: entrance.latitude,
        coordinateType: "gcj02",
        serviceStatus: entrance.serviceStatus,
        isPrimary: entrance.isPrimary,
        address: entrance.addressDescription,
      })),
    };
  }

  private optionalObjectNumber(value: unknown) {
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private calculateServerRouteQuality(points: any[]) {
    const accuracies = points.map((point) => Number(point.accuracy));
    if (accuracies.some((accuracy) => !Number.isFinite(accuracy) || accuracy <= 0)) {
      throw new BadRequestException("道路采集服务器 ACK 点包含无效定位精度");
    }
    if (accuracies.length > 0
      && (accuracies[0] > 8 || accuracies[accuracies.length - 1] > 8)) {
      throw new BadRequestException("道路分段起点和终点精度必须在 8 米以内，请在路口等待定位稳定后重采");
    }
    const recordedTimes = points.map((point) => new Date(point.recordedAt).getTime());
    if (recordedTimes.some((value) => !Number.isFinite(value))) {
      throw new BadRequestException("道路采集服务器 ACK 点包含无效采集时间");
    }
    let routeDistance = 0;
    let maximumGapSeconds = 0;
    for (let index = 1; index < points.length; index += 1) {
      routeDistance += distanceMeters(
        { longitude: Number(points[index - 1].longitude), latitude: Number(points[index - 1].latitude) },
        { longitude: Number(points[index].longitude), latitude: Number(points[index].latitude) },
      );
      maximumGapSeconds = Math.max(
        maximumGapSeconds,
        (recordedTimes[index] - recordedTimes[index - 1]) / 1000,
      );
    }
    return {
      sampleCount: points.length,
      acceptedPointCount: points.length,
      medianAccuracy: median(accuracies),
      maxAccuracy: Math.max(...accuracies),
      startAccuracy: accuracies[0],
      endAccuracy: accuracies[accuracies.length - 1],
      distanceMeters: routeDistance,
      durationSeconds: points.length > 1
        ? (recordedTimes[recordedTimes.length - 1] - recordedTimes[0]) / 1000
        : 0,
      maximumGapSeconds,
    };
  }

  private async validatePlaceVerificationEvidence(
    tx: any,
    object: any,
    properties: Record<string, unknown>,
  ): Promise<PlaceVerificationResult> {
    const candidateLongitude = Number(object.longitude);
    const candidateLatitude = Number(object.latitude);
    const candidateAccuracy = Number(object.accuracy);
    if (!isValidLngLat(candidateLongitude, candidateLatitude)
      || !Number.isFinite(candidateAccuracy)
      || candidateAccuracy <= 0
      || candidateAccuracy > 8) {
      throw new BadRequestException("地点核验候选坐标必须是精度在 8 米内的有效 GCJ-02 坐标");
    }
    const geometryCoordinate = object.geometry?.type === "Point" ? object.geometry.coordinates : null;
    if (!Array.isArray(geometryCoordinate)
      || !isValidLngLat(geometryCoordinate[0], geometryCoordinate[1])
      || distanceMeters(
        { longitude: Number(geometryCoordinate[0]), latitude: Number(geometryCoordinate[1]) },
        { longitude: candidateLongitude, latitude: candidateLatitude },
      ) > 2) {
      throw new BadRequestException("地点核验几何坐标与候选坐标不一致");
    }
    const clientPointIds = Array.isArray(properties.clientPointIds)
      ? properties.clientPointIds.map(String).map((id) => id.trim()).filter(Boolean)
      : [];
    if (clientPointIds.length !== 5 || new Set(clientPointIds).size !== 5) {
      throw new BadRequestException("地点核验必须引用 5 个有序且唯一的服务器 ACK 定位点");
    }
    const sessionStartedAt = object.session?.startedAt
      ? new Date(object.session.startedAt).getTime()
      : Number.NaN;
    const objectRecordedAt = object.recordedAt
      ? new Date(object.recordedAt).getTime()
      : Number.NaN;
    const sessionEndedAt = object.session?.endedAt
      ? new Date(object.session.endedAt).getTime()
      : objectRecordedAt;
    if (!object.sessionId
      || !Number.isFinite(sessionStartedAt)
      || !Number.isFinite(sessionEndedAt)
      || !Number.isFinite(objectRecordedAt)
      || objectRecordedAt < sessionStartedAt
      || sessionEndedAt < sessionStartedAt) {
      throw new BadRequestException("地点核验缺少可用的采集会话时间");
    }
    const acknowledgedPoints = await tx.campusMapCollectionPoint.findMany({
      where: { sessionId: object.sessionId, clientPointId: { in: clientPointIds } },
      select: {
        clientPointId: true,
        pointSeq: true,
        longitude: true,
        latitude: true,
        accuracy: true,
        recordedAt: true,
      },
    });
    const acknowledgedById = new Map<string, any>(
      (acknowledgedPoints || []).map((point: any) => [String(point.clientPointId), point]),
    );
    if (acknowledgedById.size !== clientPointIds.length) {
      throw new BadRequestException("地点核验引用了非本会话或尚未被服务器 ACK 的定位点");
    }
    let previousPointSeq = -1;
    let previousRecordedAt = Number.NEGATIVE_INFINITY;
    const samples = clientPointIds.map((clientPointId) => {
      const point = acknowledgedById.get(clientPointId);
      const longitude = Number(point?.longitude);
      const latitude = Number(point?.latitude);
      const accuracy = Number(point?.accuracy);
      const pointSeq = Number(point?.pointSeq);
      const recordedAt = new Date(point?.recordedAt).getTime();
      if (!isValidLngLat(longitude, latitude)
        || !Number.isFinite(accuracy)
        || accuracy <= 0
        || !Number.isInteger(pointSeq)
        || pointSeq <= previousPointSeq
        || !Number.isFinite(recordedAt)
        || recordedAt <= previousRecordedAt
        || recordedAt < sessionStartedAt
        || recordedAt > objectRecordedAt
        || recordedAt > sessionEndedAt) {
        throw new BadRequestException("地点核验的服务器 ACK 定位点顺序、时间或坐标无效");
      }
      previousPointSeq = pointSeq;
      previousRecordedAt = recordedAt;
      return { clientPointId, pointSeq, longitude, latitude, accuracy, recordedAt };
    });
    const goodSampleCount = samples.filter((sample) => sample.accuracy <= 8).length;
    if (goodSampleCount < 3) {
      throw new BadRequestException("地点位置至少需要 3 次精度在 8 米内的服务器 ACK 站定采样");
    }
    const acceptedLongitude = median(samples.map((sample) => sample.longitude));
    const acceptedLatitude = median(samples.map((sample) => sample.latitude));
    const acceptedAccuracy = median(samples.map((sample) => sample.accuracy));
    if (acceptedAccuracy > 8) {
      throw new BadRequestException("地点站定采样中位精度必须在 8 米以内");
    }
    const acceptedPoint = { longitude: acceptedLongitude, latitude: acceptedLatitude };
    const candidatePoint = { longitude: candidateLongitude, latitude: candidateLatitude };
    const maximumDrift = Math.max(...samples.map((sample) => distanceMeters(sample, acceptedPoint)));
    if (maximumDrift > 12) {
      throw new BadRequestException("地点站定采样最大漂移超过 12 米，请重新采集");
    }
    const candidateDelta = distanceMeters(candidatePoint, acceptedPoint);
    if (candidateDelta > 3) {
      throw new BadRequestException("地点候选坐标与站定采样中位点偏差超过 3 米，请重新采集");
    }

    const evidenceTypes = new Set<string>();
    const capturedTimes = new Set<number>();
    let maximumCandidateDistance = 0;
    let maximumMedianDistance = 0;
    const attachments = Array.isArray(object.attachments) ? object.attachments : [];
    for (const attachment of attachments) {
      const kind = String(attachment?.kind || "photo").toLowerCase();
      const mimeType = String(attachment?.mimeType || "").toLowerCase();
      if (!(kind === "photo" || kind === "image" || mimeType.startsWith("image/"))) {
        throw new BadRequestException("地点核验证据必须全部为现场图片");
      }
      const metadata = attachment?.metadata && typeof attachment.metadata === "object" && !Array.isArray(attachment.metadata)
        ? attachment.metadata as Record<string, unknown>
        : {};
      const capturedAt = new Date(String(metadata.capturedAt || "")).getTime();
      const captureLongitude = Number(metadata.captureLongitude ?? metadata.longitude);
      const captureLatitude = Number(metadata.captureLatitude ?? metadata.latitude);
      const captureAccuracy = Number(metadata.accuracy ?? metadata.captureAccuracy);
      if (!Number.isFinite(capturedAt)
        || capturedAt < sessionStartedAt - PLACE_PHOTO_SESSION_TOLERANCE_MS
        || capturedAt > sessionEndedAt + PLACE_PHOTO_SESSION_TOLERANCE_MS
        || capturedAt < previousRecordedAt
        || capturedAt > objectRecordedAt) {
        throw new BadRequestException("地点核验图片拍摄时间必须位于采集会话期间内");
      }
      if (capturedTimes.has(capturedAt)) {
        throw new BadRequestException("两张现场照片的拍摄时间不能重复，请分别使用相机现场拍摄");
      }
      capturedTimes.add(capturedAt);
      if (!isValidLngLat(captureLongitude, captureLatitude)
        || !Number.isFinite(captureAccuracy)
        || captureAccuracy <= 0
        || captureAccuracy > MAX_PLACE_PHOTO_ACCURACY_METERS
        || String(metadata.coordinateType || "gcj02").toLowerCase() !== "gcj02"
        || String(metadata.source || "").toLowerCase() !== "camera") {
        throw new BadRequestException("地点核验图片必须包含精度在 20 米内的 GCJ-02 拍摄坐标和 camera 来源");
      }
      const capturePoint = { longitude: captureLongitude, latitude: captureLatitude };
      const candidateDistance = distanceMeters(capturePoint, candidatePoint);
      const medianDistance = distanceMeters(capturePoint, acceptedPoint);
      if (candidateDistance > MAX_PLACE_PHOTO_DISTANCE_METERS
        || medianDistance > MAX_PLACE_PHOTO_DISTANCE_METERS) {
        throw new BadRequestException("地点核验图片拍摄位置距核验坐标不能超过 20 米");
      }
      maximumCandidateDistance = Math.max(maximumCandidateDistance, candidateDistance);
      maximumMedianDistance = Math.max(maximumMedianDistance, medianDistance);
      const mediaType = String(metadata.mediaType || "").toLowerCase();
      const evidenceType = String(metadata.evidenceType || "").toLowerCase();
      if (mediaType === "facade" || evidenceType === "building_front") evidenceTypes.add("facade");
      if (mediaType === "entrance" || evidenceType === "entrance_or_sign") evidenceTypes.add("entrance");
      if (mediaType === "construction" || evidenceType === "construction_progress") evidenceTypes.add("construction");
    }
    if (!evidenceTypes.has("facade") || !evidenceTypes.has("entrance")) {
      throw new BadRequestException("地点核验必须同时包含建筑正面和入口/标识照片");
    }
    if (["under_construction", "renovating"].includes(String(properties.constructionStatus || ""))
      && !evidenceTypes.has("construction")) {
      throw new BadRequestException("施工中的地点核验必须包含施工进度照片");
    }
    return {
      acceptedLongitude,
      acceptedLatitude,
      acceptedAccuracy,
      acceptedRecordedAt: new Date(previousRecordedAt),
      locationVerification: {
        acceptedSampleCount: samples.length,
        goodSampleCount,
        medianLongitude: acceptedLongitude,
        medianLatitude: acceptedLatitude,
        medianAccuracy: acceptedAccuracy,
        maximumDrift,
        candidateDelta,
        clientPointIds,
        firstSampleAt: new Date(samples[0].recordedAt).toISOString(),
        lastSampleAt: new Date(previousRecordedAt).toISOString(),
        source: "server_ack",
      },
      photoVerification: {
        validatedPhotoCount: attachments.length,
        evidenceTypes: [...evidenceTypes].sort(),
        maximumCandidateDistance,
        maximumMedianDistance,
        sessionToleranceSeconds: PLACE_PHOTO_SESSION_TOLERANCE_MS / 1000,
      },
    };
  }

  private evidenceMediaType(metadata: Record<string, any>) {
    const allowed = new Set(["cover", "gallery", "facade", "entrance", "signage", "construction"]);
    const direct = String(metadata.mediaType || "");
    if (allowed.has(direct)) return direct;
    const evidence = String(metadata.evidenceType || "");
    const mapping: Record<string, string> = {
      building_front: "facade",
      entrance_or_sign: "entrance",
      construction_progress: "construction",
    };
    return mapping[evidence] || (allowed.has(evidence) ? evidence : "gallery");
  }

  private optionalObjectDate(value: unknown) {
    if (!value) return null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toCollectorTemplate(template: any) {
    return {
      id: template.id,
      regionId: template.regionId,
      label: template.label,
      description: template.description,
      icon: template.icon,
      color: template.color,
      behavior: template.behavior,
      fieldSchema: template.fieldSchema,
      allowedBindings: template.allowedBindings,
      pinned: template.pinned,
      requirePhoto: template.requirePhoto,
      requireNote: template.requireNote,
      requireStationarySample: template.requireStationarySample,
      enabled: template.enabled,
      sortOrder: template.sortOrder,
    };
  }
}
