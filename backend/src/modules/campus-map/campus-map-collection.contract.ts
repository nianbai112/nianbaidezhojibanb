import { BadRequestException } from "@nestjs/common";

export const COLLECTION_TASK_STATUSES = [
  "draft",
  "ready",
  "collecting",
  "review",
  "completed",
  "cancelled",
] as const;
export const COLLECTION_SESSION_STATUSES = [
  "recording",
  "paused",
  "uploading",
  "completed",
  "abandoned",
] as const;
export const MARKER_BEHAVIORS = [
  "info",
  "entrance",
  "junction",
  "passability_change",
  "barrier",
  "calibration_point",
] as const;
export const BINDING_RELATIONS = [
  "belongs_to",
  "entrance_of",
  "connects",
  "affects",
  "blocks",
  "alternative_to",
  "references",
  "verifies",
] as const;
export const BINDING_TARGET_TYPES = [
  "building",
  "entrance",
  "road",
  "road_node",
  "road_edge",
  "gate",
  "area",
  "phase",
  "task",
  "marker",
  "place",
] as const;
export const MARKER_FIELD_TYPES = [
  "text",
  "number",
  "select",
  "multi",
  "switch",
] as const;
export const COLLECTION_OBJECT_TYPES = [
  "road",
  "place_verification",
  "building",
  "entrance",
  "facility",
  "issue",
] as const;
export const COLLECTION_TASK_TYPES = [
  "route_collection",
  "place_verification",
  "mixed",
] as const;
export const COLLECTION_APPLY_FIELDS = [
  "location",
  "entrance",
  "address",
  "constructionStatus",
  "serviceStatus",
  "geometry",
  "media",
] as const;
export const COLLECTION_CLIENTS = ["miniapp", "rider_app"] as const;
export const COLLECTION_OBJECT_REVIEW_DECISIONS = [
  "approved",
  "resample",
  "held",
  "void",
] as const;
export const MAX_POINTS_PER_BATCH = 100;

export type CreateCollectionTaskDto = {
  name: string;
  instructions?: string;
  status?: string;
  taskType?: string;
  collectorUserIds?: string[];
  allowedClients?: string[];
  objectTypes?: string[];
  targetPlaceIds?: string[];
  targetFeatureIds?: string[];
  boundary?: Record<string, unknown> | null;
  priority?: number;
  dueAt?: string | null;
};

export type UpdateCollectionTaskDto = Partial<CreateCollectionTaskDto>;

export type CollectionTaskFilters = {
  status?: string;
  page?: number;
  pageSize?: number;
};

export type MarkerTemplateDto = {
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  behavior: string;
  fieldSchema?: Array<Record<string, unknown>>;
  allowedBindings?: { targetTypes?: string[]; relationTypes?: string[] };
  pinned?: boolean;
  requirePhoto?: boolean;
  requireNote?: boolean;
  requireStationarySample?: boolean;
  enabled?: boolean;
  sortOrder?: number;
};

export type StartCollectionSessionDto = {
  clientSessionId: string;
  coordinateType: string;
  sourceClient?: string;
  startedAt: string;
  device: Record<string, unknown>;
};

export type CollectionPointDto = {
  clientPointId: string;
  pointSeq: number;
  recordedAt: string;
  longitude: number;
  latitude: number;
  accuracy: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  raw?: Record<string, unknown>;
};

export type UploadPointBatchDto = {
  coordinateType: string;
  points: CollectionPointDto[];
};

export type FinishCollectionSessionDto = {
  clientPointCount: number;
  clientMarkerCount: number;
  clientObjectCount?: number;
  endedAt: string;
};

export type CollectionMarkerBindingDto = {
  targetType: string;
  targetId: string;
  relationType: string;
};

export type CollectionAttachmentDto = {
  kind?: string;
  url: string;
  storageKey?: string;
  mimeType?: string;
  byteSize?: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
};

export type CreateCollectionMarkerDto = {
  clientMarkerId: string;
  templateId: string;
  recordedAt: string;
  longitude: number;
  latitude: number;
  accuracy: number;
  fieldValues: Record<string, unknown>;
  note?: string;
  stationarySampleCount?: number;
  bindings?: CollectionMarkerBindingDto[];
  attachments?: CollectionAttachmentDto[];
};

export type CreateCollectionObjectDto = {
  clientObjectId: string;
  objectType: string;
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
  recordedAt: string;
  accuracy?: number;
  longitude?: number;
  latitude?: number;
  quality?: Record<string, unknown>;
  bindings?: CollectionMarkerBindingDto[];
  attachments?: CollectionAttachmentDto[];
};

export type ReviewCollectionObjectDto = {
  decision: string;
  note: string;
  targetPlaceId?: string;
  applyFields?: string[];
  promoteAttachmentIds?: string[];
};

export function parseStartSession(dto: StartCollectionSessionDto) {
  const clientSessionId = String(dto?.clientSessionId || "").trim();
  if (!clientSessionId) throw new BadRequestException("缺少客户端会话标识");
  if (dto?.coordinateType !== "gcj02")
    throw new BadRequestException("采集坐标必须为 GCJ-02");
  const startedAt = new Date(dto?.startedAt);
  if (Number.isNaN(startedAt.getTime()))
    throw new BadRequestException("采集开始时间无效");
  if (
    !dto?.device ||
    typeof dto.device !== "object" ||
    Array.isArray(dto.device)
  ) {
    throw new BadRequestException("缺少采集设备信息");
  }
  const sourceClient = String(dto.sourceClient || "miniapp").trim();
  if (
    !COLLECTION_CLIENTS.includes(
      sourceClient as (typeof COLLECTION_CLIENTS)[number],
    )
  ) {
    throw new BadRequestException("采集会话来源无效");
  }
  return {
    clientSessionId,
    coordinateType: "gcj02",
    sourceClient,
    startedAt,
    device: dto.device,
  };
}

export function parseTask(dto: CreateCollectionTaskDto) {
  const name = String(dto?.name || "").trim();
  const status = String(dto?.status || "draft");
  if (!name || name.length > 100)
    throw new BadRequestException("采集任务名称不能为空且不能超过 100 字");
  if (
    !COLLECTION_TASK_STATUSES.includes(
      status as (typeof COLLECTION_TASK_STATUSES)[number],
    )
  ) {
    throw new BadRequestException("采集任务状态无效");
  }
  const collectorUserIds = [
    ...new Set(
      (dto.collectorUserIds || [])
        .map(String)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (status === "ready" && collectorUserIds.length === 0)
    throw new BadRequestException("待采集任务至少需要一名采集人员");
  const allowedClients = [
    ...new Set((dto.allowedClients || ["miniapp"]).map(String)),
  ];
  if (
    !allowedClients.length ||
    allowedClients.some(
      (client) =>
        !COLLECTION_CLIENTS.includes(
          client as (typeof COLLECTION_CLIENTS)[number],
        ),
    )
  ) {
    throw new BadRequestException("采集端无效");
  }
  const objectTypes = [
    ...new Set((dto.objectTypes || ["road"]).map(String)),
  ];
  if (
    !objectTypes.length ||
    objectTypes.some(
      (type) =>
        !COLLECTION_OBJECT_TYPES.includes(
          type as (typeof COLLECTION_OBJECT_TYPES)[number],
        ),
    )
  ) {
    throw new BadRequestException("采集对象类型无效");
  }
  const inferredTaskType = objectTypes.length === 1 && objectTypes[0] === "road"
    ? "route_collection"
    : objectTypes.length === 1 && objectTypes[0] === "place_verification"
      ? "place_verification"
      : "mixed";
  const taskType = String(dto.taskType || inferredTaskType).trim();
  const explicitTaskType = Boolean(String(dto.taskType || "").trim());
  if (!COLLECTION_TASK_TYPES.includes(taskType as (typeof COLLECTION_TASK_TYPES)[number])) {
    throw new BadRequestException("采集任务类型无效");
  }
  const targetPlaceIds = [
    ...new Set(
      (dto.targetPlaceIds || [])
        .map(String)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (targetPlaceIds.length > 100) {
    throw new BadRequestException("一个采集任务最多绑定 100 个地图地点");
  }
  const targetFeatureIds = [
    ...new Set(
      (dto.targetFeatureIds || [])
        .map(String)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (targetFeatureIds.length > 100) {
    throw new BadRequestException("一个采集任务最多指定 100 个地图图形");
  }
  if (explicitTaskType && taskType === "route_collection" && (objectTypes.length !== 1 || objectTypes[0] !== "road")) {
    throw new BadRequestException("路线采集任务的 objectTypes 必须为 road");
  }
  if (explicitTaskType && taskType === "place_verification" && (objectTypes.length !== 1 || objectTypes[0] !== "place_verification" || targetPlaceIds.length === 0)) {
    throw new BadRequestException("地点核验任务必须选择 place_verification 且至少绑定一个地点");
  }
  if (explicitTaskType && taskType === "mixed" && (!objectTypes.includes("road") || !objectTypes.includes("place_verification"))) {
    throw new BadRequestException("混合采集任务必须同时包含 road 和 place_verification");
  }
  const priority = dto.priority === undefined ? 3 : Number(dto.priority);
  if (!Number.isInteger(priority) || priority < 1 || priority > 5)
    throw new BadRequestException("任务优先级必须为 1 至 5");
  const dueAt = dto.dueAt === null ? null : dto.dueAt ? new Date(dto.dueAt) : undefined;
  if (dueAt && Number.isNaN(dueAt.getTime()))
    throw new BadRequestException("任务截止时间无效");
  if (
    dto.boundary !== undefined &&
    dto.boundary !== null &&
    (!dto.boundary ||
      typeof dto.boundary !== "object" ||
      Array.isArray(dto.boundary))
  ) {
    throw new BadRequestException("采集范围无效");
  }
  return {
    name,
    instructions: String(dto.instructions || "").trim() || undefined,
    status,
    taskType,
    collectorUserIds,
    allowedClients,
    objectTypes,
    targetPlaceIds,
    targetFeatureIds,
    boundary: dto.boundary,
    priority,
    dueAt,
  };
}

export function parseTemplate(dto: MarkerTemplateDto) {
  const label = String(dto?.label || "").trim();
  const behavior = String(dto?.behavior || "");
  if (!label || label.length > 50)
    throw new BadRequestException("标记模板名称不能为空且不能超过 50 字");
  if (
    !MARKER_BEHAVIORS.includes(behavior as (typeof MARKER_BEHAVIORS)[number])
  ) {
    throw new BadRequestException("标记模板系统行为无效");
  }
  const rawFieldSchema = Array.isArray(dto.fieldSchema) ? dto.fieldSchema : [];
  if (rawFieldSchema.length > 20)
    throw new BadRequestException("一个标记模板最多包含 20 个自定义字段");
  const fieldKeys = new Set<string>();
  const fieldSchema = rawFieldSchema.map((raw) => {
    const key = String(raw?.key || "").trim();
    const label = String(raw?.label || "").trim();
    const type = String(raw?.type || "");
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || fieldKeys.has(key)) {
      throw new BadRequestException("标记字段 key 格式无效或重复");
    }
    if (!label || label.length > 50)
      throw new BadRequestException("标记字段名称不能为空且不能超过 50 字");
    if (
      !MARKER_FIELD_TYPES.includes(type as (typeof MARKER_FIELD_TYPES)[number])
    ) {
      throw new BadRequestException("标记字段类型无效");
    }
    fieldKeys.add(key);
    const options = ["select", "multi"].includes(type)
      ? [
          ...new Set(
            (Array.isArray(raw.options) ? raw.options : [])
              .map(String)
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ]
      : [];
    if (
      ["select", "multi"].includes(type) &&
      (options.length === 0 || options.length > 20)
    ) {
      throw new BadRequestException("选择字段必须配置 1 至 20 个选项");
    }
    return {
      key,
      label,
      type,
      required: Boolean(raw.required),
      ...(options.length ? { options } : {}),
      ...(raw.placeholder
        ? { placeholder: String(raw.placeholder).slice(0, 100) }
        : {}),
    };
  });
  const bindings = dto.allowedBindings || {};
  const targetTypes = [...new Set((bindings.targetTypes || []).map(String))];
  const relationTypes = [
    ...new Set((bindings.relationTypes || []).map(String)),
  ];
  if (
    targetTypes.some(
      (value) =>
        !BINDING_TARGET_TYPES.includes(
          value as (typeof BINDING_TARGET_TYPES)[number],
        ),
    )
  ) {
    throw new BadRequestException("标记模板绑定对象类型无效");
  }
  if (
    relationTypes.some(
      (value) =>
        !BINDING_RELATIONS.includes(
          value as (typeof BINDING_RELATIONS)[number],
        ),
    )
  ) {
    throw new BadRequestException("标记模板绑定关系无效");
  }
  if (dto.sortOrder !== undefined && !Number.isInteger(dto.sortOrder))
    throw new BadRequestException("标记模板排序值无效");
  return {
    label,
    description: String(dto.description || "").trim() || undefined,
    icon: String(dto.icon || "").trim() || undefined,
    color: String(dto.color || "").trim() || undefined,
    behavior,
    fieldSchema,
    allowedBindings: { targetTypes, relationTypes },
    pinned: Boolean(dto.pinned),
    requirePhoto: Boolean(dto.requirePhoto),
    requireNote: Boolean(dto.requireNote),
    requireStationarySample: Boolean(dto.requireStationarySample),
    enabled: dto.enabled !== false,
    sortOrder: dto.sortOrder || 0,
  };
}

export function validateMarkerFieldValues(
  fieldSchema: unknown,
  values: Record<string, unknown>,
) {
  const fields = Array.isArray(fieldSchema)
    ? (fieldSchema as Array<Record<string, unknown>>)
    : [];
  const allowedKeys = new Set(fields.map((field) => String(field.key)));
  if (Object.keys(values).some((key) => !allowedKeys.has(key))) {
    throw new BadRequestException("标记包含模板之外的自定义字段");
  }
  const normalized: Record<string, unknown> = {};
  for (const field of fields) {
    const key = String(field.key);
    const label = String(field.label || key);
    const type = String(field.type);
    const value = values[key];
    const missing =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (missing) {
      if (field.required)
        throw new BadRequestException(`标记字段“${label}”不能为空`);
      continue;
    }
    if (type === "text") {
      if (typeof value !== "string" || value.length > 500)
        throw new BadRequestException(`标记字段“${label}”格式无效`);
      normalized[key] = value;
    } else if (type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number))
        throw new BadRequestException(`标记字段“${label}”必须是数字`);
      normalized[key] = number;
    } else if (type === "switch") {
      if (typeof value !== "boolean")
        throw new BadRequestException(`标记字段“${label}”必须是开关值`);
      normalized[key] = value;
    } else if (type === "select") {
      const options = Array.isArray(field.options)
        ? field.options.map(String)
        : [];
      if (typeof value !== "string" || !options.includes(value))
        throw new BadRequestException(`标记字段“${label}”选项无效`);
      normalized[key] = value;
    } else if (type === "multi") {
      const options = Array.isArray(field.options)
        ? field.options.map(String)
        : [];
      if (
        !Array.isArray(value) ||
        value.some((item) => !options.includes(String(item)))
      ) {
        throw new BadRequestException(`标记字段“${label}”选项无效`);
      }
      normalized[key] = [...new Set(value.map(String))];
    }
  }
  return normalized;
}

export function parsePointBatch(batchNo: number, dto: UploadPointBatchDto) {
  if (!Number.isInteger(batchNo) || batchNo < 0)
    throw new BadRequestException("轨迹批次号无效");
  if (dto?.coordinateType !== "gcj02")
    throw new BadRequestException("采集坐标必须为 GCJ-02");
  if (
    !Array.isArray(dto?.points) ||
    dto.points.length === 0 ||
    dto.points.length > MAX_POINTS_PER_BATCH
  ) {
    throw new BadRequestException(
      `每批轨迹点必须为 1 至 ${MAX_POINTS_PER_BATCH} 个`,
    );
  }

  const pointIds = new Set<string>();
  const pointSequences = new Set<number>();
  const points = dto.points.map((point) => {
    const clientPointId = String(point?.clientPointId || "").trim();
    const recordedAt = new Date(point?.recordedAt);
    if (!clientPointId || pointIds.has(clientPointId))
      throw new BadRequestException("轨迹点标识为空或重复");
    if (
      !Number.isInteger(point?.pointSeq) ||
      point.pointSeq < 0 ||
      pointSequences.has(point.pointSeq)
    ) {
      throw new BadRequestException("轨迹点序号无效或重复");
    }
    if (Number.isNaN(recordedAt.getTime()))
      throw new BadRequestException("轨迹点时间无效");
    if (
      !Number.isFinite(point.longitude) ||
      point.longitude < -180 ||
      point.longitude > 180
    ) {
      throw new BadRequestException("轨迹点经度无效");
    }
    if (
      !Number.isFinite(point.latitude) ||
      point.latitude < -90 ||
      point.latitude > 90
    ) {
      throw new BadRequestException("轨迹点纬度无效");
    }
    if (!Number.isFinite(point.accuracy) || point.accuracy <= 0)
      throw new BadRequestException("轨迹点精度无效");
    for (const value of [point.speed, point.heading, point.altitude]) {
      if (value !== undefined && !Number.isFinite(value))
        throw new BadRequestException("轨迹点附加数值无效");
    }
    pointIds.add(clientPointId);
    pointSequences.add(point.pointSeq);
    return { ...point, clientPointId, recordedAt };
  });
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].pointSeq <= points[index - 1].pointSeq
      || points[index].recordedAt.getTime() <= points[index - 1].recordedAt.getTime()) {
      throw new BadRequestException("轨迹点必须按 pointSeq 和采集时间严格递增上传");
    }
  }

  return { batchNo, points };
}

export function parseFinishSession(dto: FinishCollectionSessionDto) {
  if (!Number.isInteger(dto?.clientPointCount) || dto.clientPointCount < 0) {
    throw new BadRequestException("客户端轨迹点数量无效");
  }
  if (!Number.isInteger(dto?.clientMarkerCount) || dto.clientMarkerCount < 0) {
    throw new BadRequestException("客户端标记数量无效");
  }
  const clientObjectCount = dto?.clientObjectCount ?? 0;
  if (!Number.isInteger(clientObjectCount) || clientObjectCount < 0) {
    throw new BadRequestException("客户端采集对象数量无效");
  }
  const endedAt = new Date(dto?.endedAt);
  if (Number.isNaN(endedAt.getTime()))
    throw new BadRequestException("采集结束时间无效");
  return { ...dto, clientObjectCount, endedAt };
}

export function parseObjectReview(dto: ReviewCollectionObjectDto) {
  const decision = String(dto?.decision || "").trim();
  const note = String(dto?.note || "").trim();
  if (
    !COLLECTION_OBJECT_REVIEW_DECISIONS.includes(
      decision as (typeof COLLECTION_OBJECT_REVIEW_DECISIONS)[number],
    )
  ) {
    throw new BadRequestException("采集对象审核决定无效");
  }
  if (!note || note.length > 1_000) {
    throw new BadRequestException("审核原因不能为空且不能超过 1000 字");
  }
  const targetPlaceId = String(dto?.targetPlaceId || "").trim() || undefined;
  const applyFields = [...new Set((dto?.applyFields || []).map(String))];
  if (applyFields.some((field) => !COLLECTION_APPLY_FIELDS.includes(field as (typeof COLLECTION_APPLY_FIELDS)[number]))) {
    throw new BadRequestException("采集对象审核合并字段无效");
  }
  const promoteAttachmentIds = [
    ...new Set((dto?.promoteAttachmentIds || []).map(String).map((id) => id.trim()).filter(Boolean)),
  ];
  if (promoteAttachmentIds.length > 20) {
    throw new BadRequestException("一次最多提升 20 个附件");
  }
  if (promoteAttachmentIds.length && !applyFields.includes("media")) {
    throw new BadRequestException("提升现场照片时必须显式选择 media 合并字段");
  }
  return { decision, note, targetPlaceId, applyFields, promoteAttachmentIds };
}

function parseCoordinatePair(value: unknown) {
  if (!Array.isArray(value) || value.length < 2)
    throw new BadRequestException("采集对象坐标无效");
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new BadRequestException("采集对象坐标无效");
  }
  return [longitude, latitude];
}

export function parseCollectionObject(dto: CreateCollectionObjectDto) {
  const clientObjectId = String(dto?.clientObjectId || "").trim();
  const objectType = String(dto?.objectType || "").trim();
  let normalizedProperties: Record<string, unknown> = {};
  const recordedAt = new Date(dto?.recordedAt);
  if (!clientObjectId || clientObjectId.length > 120)
    throw new BadRequestException("采集对象标识无效");
  if (
    !COLLECTION_OBJECT_TYPES.includes(
      objectType as (typeof COLLECTION_OBJECT_TYPES)[number],
    )
  ) {
    throw new BadRequestException("采集对象类型无效");
  }
  if (Number.isNaN(recordedAt.getTime()))
    throw new BadRequestException("采集对象时间无效");
  if (
    !dto.geometry ||
    typeof dto.geometry !== "object" ||
    Array.isArray(dto.geometry)
  ) {
    throw new BadRequestException("采集对象几何无效");
  }
  if (
    !dto.properties ||
    typeof dto.properties !== "object" ||
    Array.isArray(dto.properties)
  ) {
    throw new BadRequestException("采集对象属性无效");
  }
  normalizedProperties = dto.properties;
  if (
    dto.quality !== undefined &&
    (!dto.quality ||
      typeof dto.quality !== "object" ||
      Array.isArray(dto.quality))
  ) {
    throw new BadRequestException("采集对象质量信息无效");
  }
  if (
    dto.accuracy !== undefined &&
    (!Number.isFinite(dto.accuracy) || dto.accuracy <= 0)
  ) {
    throw new BadRequestException("采集对象精度无效");
  }
  if (dto.longitude !== undefined || dto.latitude !== undefined)
    parseCoordinatePair([dto.longitude, dto.latitude]);

  const geometryType = String(dto.geometry.type || "");
  const coordinates = dto.geometry.coordinates;
  if (objectType === "road") {
    if (
      geometryType !== "LineString" ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      throw new BadRequestException("道路必须包含至少两个轨迹点");
    }
    coordinates.forEach(parseCoordinatePair);
    const previousRouteObjectId = String(dto.properties.previousRouteObjectId || "").trim();
    const sharedStartAnchorPointId = String(dto.properties.sharedStartAnchorPointId || "").trim();
    const startJunctionAnchorKey = String(dto.properties.startJunctionAnchorKey || "").trim().toLowerCase();
    const endJunctionAnchorKey = String(dto.properties.endJunctionAnchorKey || "").trim().toLowerCase();
    if (Boolean(previousRouteObjectId) !== Boolean(sharedStartAnchorPointId)) {
      throw new BadRequestException("相邻路线必须同时提供上一段对象和共享路口 ACK 点");
    }
    if (previousRouteObjectId.length > 120 || sharedStartAnchorPointId.length > 120) {
      throw new BadRequestException("相邻路线的对象或路口锚点标识过长");
    }
    if (startJunctionAnchorKey && (previousRouteObjectId || sharedStartAnchorPointId)) {
      throw new BadRequestException("路线起点不能同时选择已审核路口和上一段离线依赖");
    }
    if ((startJunctionAnchorKey && !/^[a-f0-9]{64}$/.test(startJunctionAnchorKey))
      || (endJunctionAnchorKey && !/^[a-f0-9]{64}$/.test(endJunctionAnchorKey))) {
      throw new BadRequestException("路线连接的已审核路口锚点无效");
    }
    if (startJunctionAnchorKey && startJunctionAnchorKey === endJunctionAnchorKey) {
      throw new BadRequestException("同一路口环线必须在中途分段，路线起终点不能选择同一锚点");
    }
    normalizedProperties = { ...dto.properties };
    delete normalizedProperties.previousRouteObjectId;
    delete normalizedProperties.sharedStartAnchorPointId;
    delete normalizedProperties.startJunctionAnchorKey;
    delete normalizedProperties.endJunctionAnchorKey;
    if (previousRouteObjectId && sharedStartAnchorPointId) {
      normalizedProperties.previousRouteObjectId = previousRouteObjectId;
      normalizedProperties.sharedStartAnchorPointId = sharedStartAnchorPointId;
    }
    if (startJunctionAnchorKey) normalizedProperties.startJunctionAnchorKey = startJunctionAnchorKey;
    if (endJunctionAnchorKey) normalizedProperties.endJunctionAnchorKey = endJunctionAnchorKey;
  } else if (objectType === "building") {
    if (Object.prototype.hasOwnProperty.call(dto.properties, "previousRouteObjectId")
      || Object.prototype.hasOwnProperty.call(dto.properties, "sharedStartAnchorPointId")
      || Object.prototype.hasOwnProperty.call(dto.properties, "startJunctionAnchorKey")
      || Object.prototype.hasOwnProperty.call(dto.properties, "endJunctionAnchorKey")) {
      throw new BadRequestException("非道路采集对象不能携带路线锚点");
    }
    const rings = coordinates;
    if (
      geometryType !== "Polygon" ||
      !Array.isArray(rings) ||
      !Array.isArray(rings[0]) ||
      rings[0].length < 4
    ) {
      throw new BadRequestException("建筑轮廓必须包含闭合多边形");
    }
    const ring = rings[0].map(parseCoordinatePair);
    if (
      ring[0][0] !== ring[ring.length - 1][0] ||
      ring[0][1] !== ring[ring.length - 1][1]
    ) {
      throw new BadRequestException("建筑轮廓必须闭合");
    }
  } else {
    if (Object.prototype.hasOwnProperty.call(dto.properties, "previousRouteObjectId")
      || Object.prototype.hasOwnProperty.call(dto.properties, "sharedStartAnchorPointId")
      || Object.prototype.hasOwnProperty.call(dto.properties, "startJunctionAnchorKey")
      || Object.prototype.hasOwnProperty.call(dto.properties, "endJunctionAnchorKey")) {
      throw new BadRequestException("非道路采集对象不能携带路线锚点");
    }
    if (geometryType !== "Point")
      throw new BadRequestException("地点核验、入口、设施和异常必须使用点坐标");
    parseCoordinatePair(coordinates);
  }
  if (objectType === "place_verification") {
    const targetPlaceId = String(dto.properties.targetPlaceId || "").trim();
    if (!targetPlaceId) throw new BadRequestException("地点核验对象必须绑定 targetPlaceId");
    const clientPointIds = Array.isArray(dto.properties.clientPointIds)
      ? dto.properties.clientPointIds.map(String).map((id) => id.trim()).filter(Boolean)
      : [];
    if (clientPointIds.length !== 5 || new Set(clientPointIds).size !== 5) {
      throw new BadRequestException("地点核验必须提供 5 个有序且唯一的 clientPointIds");
    }
    normalizedProperties = { ...dto.properties, targetPlaceId, clientPointIds };
    if (dto.longitude === undefined || dto.latitude === undefined) {
      throw new BadRequestException("地点核验对象必须上传 GCJ-02 定位");
    }
  }

  const bindingKeys = new Set<string>();
  const bindings = (dto.bindings || []).map((binding) => {
    const targetType = String(binding?.targetType || "").trim();
    const targetId = String(binding?.targetId || "").trim();
    const relationType = String(binding?.relationType || "").trim();
    const key = `${targetType}:${targetId}:${relationType}`;
    if (
      !BINDING_TARGET_TYPES.includes(
        targetType as (typeof BINDING_TARGET_TYPES)[number],
      ) ||
      !BINDING_RELATIONS.includes(
        relationType as (typeof BINDING_RELATIONS)[number],
      ) ||
      !targetId ||
      bindingKeys.has(key)
    ) {
      throw new BadRequestException("采集对象绑定无效或重复");
    }
    bindingKeys.add(key);
    return { targetType, targetId, relationType };
  });
  if ((dto.attachments || []).length > 20)
    throw new BadRequestException("采集对象附件不能超过 20 个");
  const attachments = (dto.attachments || []).map((attachment) => {
    const url = String(attachment?.url || "").trim();
    if (!url) throw new BadRequestException("附件地址不能为空");
    if (
      attachment.byteSize !== undefined &&
      (!Number.isInteger(attachment.byteSize) || attachment.byteSize < 0)
    ) {
      throw new BadRequestException("附件大小无效");
    }
    const legacy = attachment as CollectionAttachmentDto & Record<string, unknown>;
    const legacyMetadata = {
      ...(legacy.evidenceType ? { evidenceType: legacy.evidenceType } : {}),
      ...(legacy.mediaType ? { mediaType: legacy.mediaType } : {}),
      ...(legacy.capturedAt ? { capturedAt: legacy.capturedAt } : {}),
      ...(legacy.captureLongitude !== undefined || legacy.longitude !== undefined
        ? { captureLongitude: legacy.captureLongitude ?? legacy.longitude }
        : {}),
      ...(legacy.captureLatitude !== undefined || legacy.latitude !== undefined
        ? { captureLatitude: legacy.captureLatitude ?? legacy.latitude }
        : {}),
      ...(legacy.captureAccuracy !== undefined || legacy.accuracy !== undefined
        ? { accuracy: legacy.captureAccuracy ?? legacy.accuracy }
        : {}),
      ...(legacy.source ? { source: legacy.source } : {}),
      ...(legacy.coordinateType ? { coordinateType: legacy.coordinateType } : {}),
      ...(legacy.sourceClient ? { sourceClient: legacy.sourceClient } : {}),
    };
    return {
      ...attachment,
      url,
      metadata: { ...legacyMetadata, ...(attachment.metadata || {}) },
    };
  });

  if (objectType === "place_verification") {
    const targetPlaceId = String(dto.properties.targetPlaceId || "").trim();
    const verifiesTarget = bindings.some((binding) => binding.targetType === "place"
      && binding.relationType === "verifies"
      && binding.targetId === targetPlaceId);
    if (!verifiesTarget) {
      throw new BadRequestException("地点核验必须使用 place/verifies 绑定同一 targetPlaceId");
    }
    const evidence = new Set<string>();
    for (const attachment of attachments) {
      const kind = String(attachment.kind || "photo").toLowerCase();
      const mimeType = String(attachment.mimeType || "").toLowerCase();
      if (!(["photo", "image"].includes(kind) || mimeType.startsWith("image/"))) {
        throw new BadRequestException("地点核验证据必须是现场图片");
      }
      const metadata = attachment.metadata && typeof attachment.metadata === "object"
        ? attachment.metadata as Record<string, unknown>
        : {};
      const capturedAt = new Date(String(metadata.capturedAt || ""));
      const captureLongitude = Number(metadata.captureLongitude ?? metadata.longitude);
      const captureLatitude = Number(metadata.captureLatitude ?? metadata.latitude);
      const accuracy = Number(metadata.accuracy ?? metadata.captureAccuracy);
      const coordinateType = String(metadata.coordinateType || "gcj02").toLowerCase();
      if (Number.isNaN(capturedAt.getTime())
        || !Number.isFinite(captureLongitude) || captureLongitude < -180 || captureLongitude > 180
        || !Number.isFinite(captureLatitude) || captureLatitude < -90 || captureLatitude > 90
        || !Number.isFinite(accuracy) || accuracy <= 0
        || coordinateType !== "gcj02"
        || String(metadata.source || "").toLowerCase() !== "camera") {
        throw new BadRequestException("地点核验图片必须包含有效拍摄时间、GCJ-02 坐标、精度和 camera 来源");
      }
      const mediaType = String(metadata.mediaType || "").toLowerCase();
      const evidenceType = String(metadata.evidenceType || "").toLowerCase();
      if (mediaType === "facade" || evidenceType === "building_front") evidence.add("facade");
      if (mediaType === "entrance" || evidenceType === "entrance_or_sign") evidence.add("entrance");
      if (mediaType === "construction" || evidenceType === "construction_progress") evidence.add("construction");
    }
    if (!evidence.has("facade") || !evidence.has("entrance")) {
      throw new BadRequestException("地点核验必须同时上传建筑正面和入口/标识照片");
    }
    if (["under_construction", "renovating"].includes(String(dto.properties.constructionStatus || ""))
      && !evidence.has("construction")) {
      throw new BadRequestException("在建或改造中地点核验必须上传施工进度照片");
    }
  }

  return {
    ...dto,
    properties: normalizedProperties,
    clientObjectId,
    objectType,
    recordedAt,
    bindings,
    attachments,
  };
}

export function parseMarker(dto: CreateCollectionMarkerDto) {
  const clientMarkerId = String(dto?.clientMarkerId || "").trim();
  const templateId = String(dto?.templateId || "").trim();
  const recordedAt = new Date(dto?.recordedAt);
  if (!clientMarkerId || !templateId)
    throw new BadRequestException("缺少标记或模板标识");
  if (Number.isNaN(recordedAt.getTime()))
    throw new BadRequestException("标记时间无效");
  if (
    !Number.isFinite(dto.longitude) ||
    dto.longitude < -180 ||
    dto.longitude > 180
  ) {
    throw new BadRequestException("标记经度无效");
  }
  if (
    !Number.isFinite(dto.latitude) ||
    dto.latitude < -90 ||
    dto.latitude > 90
  ) {
    throw new BadRequestException("标记纬度无效");
  }
  if (!Number.isFinite(dto.accuracy) || dto.accuracy <= 0)
    throw new BadRequestException("标记精度无效");
  if (
    !dto.fieldValues ||
    typeof dto.fieldValues !== "object" ||
    Array.isArray(dto.fieldValues)
  ) {
    throw new BadRequestException("标记字段值无效");
  }

  const bindingKeys = new Set<string>();
  const bindings = (dto.bindings || []).map((binding) => {
    const targetType = String(binding?.targetType || "").trim();
    const targetId = String(binding?.targetId || "").trim();
    const relationType = String(binding?.relationType || "").trim();
    const key = `${targetType}:${targetId}:${relationType}`;
    if (!targetType || !targetId || !relationType || bindingKeys.has(key)) {
      throw new BadRequestException("标记绑定为空或重复");
    }
    bindingKeys.add(key);
    return { targetType, targetId, relationType };
  });
  const attachments = (dto.attachments || []).map((attachment) => {
    const url = String(attachment?.url || "").trim();
    if (!url) throw new BadRequestException("附件地址不能为空");
    if (
      attachment.byteSize !== undefined &&
      (!Number.isInteger(attachment.byteSize) || attachment.byteSize < 0)
    ) {
      throw new BadRequestException("附件大小无效");
    }
    return { ...attachment, url };
  });

  return {
    ...dto,
    clientMarkerId,
    templateId,
    recordedAt,
    note: String(dto.note || "").trim() || undefined,
    bindings,
    attachments,
  };
}
