import { BadRequestException } from '@nestjs/common';

export const COLLECTION_TASK_STATUSES = ['draft', 'ready', 'collecting', 'review', 'completed', 'cancelled'] as const;
export const COLLECTION_SESSION_STATUSES = ['recording', 'paused', 'uploading', 'completed', 'abandoned'] as const;
export const MARKER_BEHAVIORS = ['info', 'entrance', 'junction', 'passability_change', 'barrier', 'calibration_point'] as const;
export const BINDING_RELATIONS = ['belongs_to', 'entrance_of', 'connects', 'affects', 'blocks', 'alternative_to', 'references'] as const;
export const BINDING_TARGET_TYPES = ['building', 'entrance', 'road', 'road_node', 'road_edge', 'gate', 'area', 'phase', 'task', 'marker'] as const;
export const MARKER_FIELD_TYPES = ['text', 'number', 'select', 'multi', 'switch'] as const;
export const COLLECTION_CLIENTS = ['miniapp', 'rider_app'] as const;
export const COLLECTION_OBJECT_TYPES = ['road', 'building', 'entrance', 'facility', 'issue'] as const;
export const COLLECTION_OBJECT_REVIEW_STATUSES = ['pending', 'approved', 'resample', 'held', 'void'] as const;
export const MAX_POINTS_PER_BATCH = 100;

export type CreateCollectionTaskDto = {
  name: string;
  instructions?: string;
  status?: string;
  collectorUserIds?: string[];
  allowedClients?: string[];
  objectTypes?: string[];
  boundary?: Record<string, unknown>;
  priority?: number;
  dueAt?: string;
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

export type CreateCollectionObjectDto = {
  clientObjectId: string;
  objectType: string;
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: unknown;
  };
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

export function parseStartSession(dto: StartCollectionSessionDto) {
  const clientSessionId = String(dto?.clientSessionId || '').trim();
  if (!clientSessionId) throw new BadRequestException('缺少客户端会话标识');
  if (dto?.coordinateType !== 'gcj02') throw new BadRequestException('采集坐标必须为 GCJ-02');
  const startedAt = new Date(dto?.startedAt);
  if (Number.isNaN(startedAt.getTime())) throw new BadRequestException('采集开始时间无效');
  if (!dto?.device || typeof dto.device !== 'object' || Array.isArray(dto.device)) {
    throw new BadRequestException('缺少采集设备信息');
  }
  const sourceClient = String(dto.sourceClient || 'miniapp');
  if (!COLLECTION_CLIENTS.includes(sourceClient as (typeof COLLECTION_CLIENTS)[number])) {
    throw new BadRequestException('采集端无效');
  }
  return { clientSessionId, coordinateType: 'gcj02', sourceClient, startedAt, device: dto.device };
}

export function parseTask(dto: CreateCollectionTaskDto) {
  const name = String(dto?.name || '').trim();
  const status = String(dto?.status || 'draft');
  if (!name || name.length > 100) throw new BadRequestException('采集任务名称不能为空且不能超过 100 字');
  if (!COLLECTION_TASK_STATUSES.includes(status as (typeof COLLECTION_TASK_STATUSES)[number])) {
    throw new BadRequestException('采集任务状态无效');
  }
  const collectorUserIds = [...new Set((dto.collectorUserIds || []).map(String).map((id) => id.trim()).filter(Boolean))];
  if (status === 'ready' && collectorUserIds.length === 0) throw new BadRequestException('待采集任务至少需要一名采集人员');
  const allowedClients = [...new Set((dto.allowedClients || ['miniapp']).map(String))];
  if (!allowedClients.length || allowedClients.some((value) => !COLLECTION_CLIENTS.includes(value as (typeof COLLECTION_CLIENTS)[number]))) {
    throw new BadRequestException('采集端无效');
  }
  const objectTypes = [...new Set((dto.objectTypes || COLLECTION_OBJECT_TYPES).map(String))];
  if (!objectTypes.length || objectTypes.some((value) => !COLLECTION_OBJECT_TYPES.includes(value as (typeof COLLECTION_OBJECT_TYPES)[number]))) {
    throw new BadRequestException('采集对象类型无效');
  }
  const priority = dto.priority === undefined ? 3 : Number(dto.priority);
  if (!Number.isInteger(priority) || priority < 1 || priority > 5) throw new BadRequestException('任务优先级无效');
  const dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new BadRequestException('任务截止时间无效');
  if (dto.boundary !== undefined && (!dto.boundary || typeof dto.boundary !== 'object' || Array.isArray(dto.boundary))) {
    throw new BadRequestException('任务采集边界无效');
  }
  return {
    name,
    instructions: String(dto.instructions || '').trim() || undefined,
    status,
    collectorUserIds,
    allowedClients,
    objectTypes,
    boundary: dto.boundary,
    priority,
    dueAt,
  };
}

function coordinate(value: unknown) {
  if (!Array.isArray(value) || value.length < 2) throw new BadRequestException('采集对象坐标无效');
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new BadRequestException('采集对象经度无效');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new BadRequestException('采集对象纬度无效');
  return [longitude, latitude];
}

export function parseCollectionObject(dto: CreateCollectionObjectDto) {
  const clientObjectId = String(dto?.clientObjectId || '').trim();
  const objectType = String(dto?.objectType || '').trim();
  const recordedAt = new Date(dto?.recordedAt);
  if (!clientObjectId || clientObjectId.length > 128) throw new BadRequestException('采集对象标识无效');
  if (!COLLECTION_OBJECT_TYPES.includes(objectType as (typeof COLLECTION_OBJECT_TYPES)[number])) {
    throw new BadRequestException('采集对象类型无效');
  }
  if (Number.isNaN(recordedAt.getTime())) throw new BadRequestException('采集对象时间无效');
  if (!dto?.properties || typeof dto.properties !== 'object' || Array.isArray(dto.properties)) {
    throw new BadRequestException('采集对象属性无效');
  }
  if (!dto?.geometry || typeof dto.geometry !== 'object') throw new BadRequestException('采集对象几何无效');

  const expectedGeometry = objectType === 'road' ? 'LineString' : objectType === 'building' ? 'Polygon' : 'Point';
  if (dto.geometry.type !== expectedGeometry) throw new BadRequestException('采集对象几何类型无效');
  if (expectedGeometry === 'Point') {
    coordinate(dto.geometry.coordinates);
  } else if (expectedGeometry === 'LineString') {
    const points = dto.geometry.coordinates;
    if (!Array.isArray(points) || points.length < 2 || points.length > 10_000) throw new BadRequestException('道路轨迹至少需要两个点');
    points.forEach(coordinate);
  } else {
    const rings = dto.geometry.coordinates;
    if (!Array.isArray(rings) || rings.length !== 1 || !Array.isArray(rings[0]) || rings[0].length < 4 || rings[0].length > 10_000) {
      throw new BadRequestException('建筑轮廓至少需要三个顶点并闭合');
    }
    const normalized = rings[0].map(coordinate);
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) throw new BadRequestException('建筑轮廓必须闭合');
  }
  if (dto.accuracy !== undefined && (!Number.isFinite(dto.accuracy) || dto.accuracy < 0)) {
    throw new BadRequestException('采集对象精度无效');
  }

  const bindingKeys = new Set<string>();
  const bindings = (dto.bindings || []).map((binding) => {
    const targetType = String(binding?.targetType || '').trim();
    const targetId = String(binding?.targetId || '').trim();
    const relationType = String(binding?.relationType || '').trim();
    const key = `${targetType}:${targetId}:${relationType}`;
    if (
      !BINDING_TARGET_TYPES.includes(targetType as (typeof BINDING_TARGET_TYPES)[number])
      || !BINDING_RELATIONS.includes(relationType as (typeof BINDING_RELATIONS)[number])
      || !targetId
      || bindingKeys.has(key)
    ) throw new BadRequestException('采集对象绑定无效或重复');
    bindingKeys.add(key);
    return { targetType, targetId, relationType };
  });
  const attachments = (dto.attachments || []).map((attachment) => {
    const url = String(attachment?.url || '').trim();
    if (!url) throw new BadRequestException('附件地址不能为空');
    if (attachment.byteSize !== undefined && (!Number.isInteger(attachment.byteSize) || attachment.byteSize < 0)) {
      throw new BadRequestException('附件大小无效');
    }
    return { ...attachment, url };
  });

  return { ...dto, clientObjectId, objectType, recordedAt, bindings, attachments };
}

export function parseObjectReview(dto: ReviewCollectionObjectDto) {
  const decision = String(dto?.decision || '').trim();
  const note = String(dto?.note || '').trim();
  if (!COLLECTION_OBJECT_REVIEW_STATUSES.slice(1).includes(decision as any)) {
    throw new BadRequestException('采集对象审核决定无效');
  }
  if (!note || note.length > 500) throw new BadRequestException('审核理由不能为空且不能超过 500 字');
  return { decision, note };
}

export function parseTemplate(dto: MarkerTemplateDto) {
  const label = String(dto?.label || '').trim();
  const behavior = String(dto?.behavior || '');
  if (!label || label.length > 50) throw new BadRequestException('标记模板名称不能为空且不能超过 50 字');
  if (!MARKER_BEHAVIORS.includes(behavior as (typeof MARKER_BEHAVIORS)[number])) {
    throw new BadRequestException('标记模板系统行为无效');
  }
  const rawFieldSchema = Array.isArray(dto.fieldSchema) ? dto.fieldSchema : [];
  if (rawFieldSchema.length > 20) throw new BadRequestException('一个标记模板最多包含 20 个自定义字段');
  const fieldKeys = new Set<string>();
  const fieldSchema = rawFieldSchema.map((raw) => {
    const key = String(raw?.key || '').trim();
    const label = String(raw?.label || '').trim();
    const type = String(raw?.type || '');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || fieldKeys.has(key)) {
      throw new BadRequestException('标记字段 key 格式无效或重复');
    }
    if (!label || label.length > 50) throw new BadRequestException('标记字段名称不能为空且不能超过 50 字');
    if (!MARKER_FIELD_TYPES.includes(type as (typeof MARKER_FIELD_TYPES)[number])) {
      throw new BadRequestException('标记字段类型无效');
    }
    fieldKeys.add(key);
    const options = ['select', 'multi'].includes(type)
      ? [...new Set((Array.isArray(raw.options) ? raw.options : []).map(String).map((value) => value.trim()).filter(Boolean))]
      : [];
    if (['select', 'multi'].includes(type) && (options.length === 0 || options.length > 20)) {
      throw new BadRequestException('选择字段必须配置 1 至 20 个选项');
    }
    return {
      key,
      label,
      type,
      required: Boolean(raw.required),
      ...(options.length ? { options } : {}),
      ...(raw.placeholder ? { placeholder: String(raw.placeholder).slice(0, 100) } : {}),
    };
  });
  const bindings = dto.allowedBindings || {};
  const targetTypes = [...new Set((bindings.targetTypes || []).map(String))];
  const relationTypes = [...new Set((bindings.relationTypes || []).map(String))];
  if (targetTypes.some((value) => !BINDING_TARGET_TYPES.includes(value as (typeof BINDING_TARGET_TYPES)[number]))) {
    throw new BadRequestException('标记模板绑定对象类型无效');
  }
  if (relationTypes.some((value) => !BINDING_RELATIONS.includes(value as (typeof BINDING_RELATIONS)[number]))) {
    throw new BadRequestException('标记模板绑定关系无效');
  }
  if (dto.sortOrder !== undefined && !Number.isInteger(dto.sortOrder)) throw new BadRequestException('标记模板排序值无效');
  return {
    label,
    description: String(dto.description || '').trim() || undefined,
    icon: String(dto.icon || '').trim() || undefined,
    color: String(dto.color || '').trim() || undefined,
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
  const fields = Array.isArray(fieldSchema) ? fieldSchema as Array<Record<string, unknown>> : [];
  const allowedKeys = new Set(fields.map((field) => String(field.key)));
  if (Object.keys(values).some((key) => !allowedKeys.has(key))) {
    throw new BadRequestException('标记包含模板之外的自定义字段');
  }
  const normalized: Record<string, unknown> = {};
  for (const field of fields) {
    const key = String(field.key);
    const label = String(field.label || key);
    const type = String(field.type);
    const value = values[key];
    const missing = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (missing) {
      if (field.required) throw new BadRequestException(`标记字段“${label}”不能为空`);
      continue;
    }
    if (type === 'text') {
      if (typeof value !== 'string' || value.length > 500) throw new BadRequestException(`标记字段“${label}”格式无效`);
      normalized[key] = value;
    } else if (type === 'number') {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new BadRequestException(`标记字段“${label}”必须是数字`);
      normalized[key] = number;
    } else if (type === 'switch') {
      if (typeof value !== 'boolean') throw new BadRequestException(`标记字段“${label}”必须是开关值`);
      normalized[key] = value;
    } else if (type === 'select') {
      const options = Array.isArray(field.options) ? field.options.map(String) : [];
      if (typeof value !== 'string' || !options.includes(value)) throw new BadRequestException(`标记字段“${label}”选项无效`);
      normalized[key] = value;
    } else if (type === 'multi') {
      const options = Array.isArray(field.options) ? field.options.map(String) : [];
      if (!Array.isArray(value) || value.some((item) => !options.includes(String(item)))) {
        throw new BadRequestException(`标记字段“${label}”选项无效`);
      }
      normalized[key] = [...new Set(value.map(String))];
    }
  }
  return normalized;
}

export function parsePointBatch(batchNo: number, dto: UploadPointBatchDto) {
  if (!Number.isInteger(batchNo) || batchNo < 0) throw new BadRequestException('轨迹批次号无效');
  if (dto?.coordinateType !== 'gcj02') throw new BadRequestException('采集坐标必须为 GCJ-02');
  if (!Array.isArray(dto?.points) || dto.points.length === 0 || dto.points.length > MAX_POINTS_PER_BATCH) {
    throw new BadRequestException(`每批轨迹点必须为 1 至 ${MAX_POINTS_PER_BATCH} 个`);
  }

  const pointIds = new Set<string>();
  const pointSequences = new Set<number>();
  const points = dto.points.map((point) => {
    const clientPointId = String(point?.clientPointId || '').trim();
    const recordedAt = new Date(point?.recordedAt);
    if (!clientPointId || pointIds.has(clientPointId)) throw new BadRequestException('轨迹点标识为空或重复');
    if (!Number.isInteger(point?.pointSeq) || point.pointSeq < 0 || pointSequences.has(point.pointSeq)) {
      throw new BadRequestException('轨迹点序号无效或重复');
    }
    if (Number.isNaN(recordedAt.getTime())) throw new BadRequestException('轨迹点时间无效');
    if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
      throw new BadRequestException('轨迹点经度无效');
    }
    if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
      throw new BadRequestException('轨迹点纬度无效');
    }
    if (!Number.isFinite(point.accuracy) || point.accuracy < 0) throw new BadRequestException('轨迹点精度无效');
    for (const value of [point.speed, point.heading, point.altitude]) {
      if (value !== undefined && !Number.isFinite(value)) throw new BadRequestException('轨迹点附加数值无效');
    }
    pointIds.add(clientPointId);
    pointSequences.add(point.pointSeq);
    return { ...point, clientPointId, recordedAt };
  });

  return { batchNo, points };
}

export function parseFinishSession(dto: FinishCollectionSessionDto) {
  if (!Number.isInteger(dto?.clientPointCount) || dto.clientPointCount < 0) {
    throw new BadRequestException('客户端轨迹点数量无效');
  }
  if (!Number.isInteger(dto?.clientMarkerCount) || dto.clientMarkerCount < 0) {
    throw new BadRequestException('客户端标记数量无效');
  }
  const clientObjectCount = dto.clientObjectCount ?? 0;
  if (!Number.isInteger(clientObjectCount) || clientObjectCount < 0) {
    throw new BadRequestException('客户端采集对象数量无效');
  }
  const endedAt = new Date(dto?.endedAt);
  if (Number.isNaN(endedAt.getTime())) throw new BadRequestException('采集结束时间无效');
  return { ...dto, clientObjectCount, endedAt };
}

export function parseMarker(dto: CreateCollectionMarkerDto) {
  const clientMarkerId = String(dto?.clientMarkerId || '').trim();
  const templateId = String(dto?.templateId || '').trim();
  const recordedAt = new Date(dto?.recordedAt);
  if (!clientMarkerId || !templateId) throw new BadRequestException('缺少标记或模板标识');
  if (Number.isNaN(recordedAt.getTime())) throw new BadRequestException('标记时间无效');
  if (!Number.isFinite(dto.longitude) || dto.longitude < -180 || dto.longitude > 180) {
    throw new BadRequestException('标记经度无效');
  }
  if (!Number.isFinite(dto.latitude) || dto.latitude < -90 || dto.latitude > 90) {
    throw new BadRequestException('标记纬度无效');
  }
  if (!Number.isFinite(dto.accuracy) || dto.accuracy < 0) throw new BadRequestException('标记精度无效');
  if (!dto.fieldValues || typeof dto.fieldValues !== 'object' || Array.isArray(dto.fieldValues)) {
    throw new BadRequestException('标记字段值无效');
  }

  const bindingKeys = new Set<string>();
  const bindings = (dto.bindings || []).map((binding) => {
    const targetType = String(binding?.targetType || '').trim();
    const targetId = String(binding?.targetId || '').trim();
    const relationType = String(binding?.relationType || '').trim();
    const key = `${targetType}:${targetId}:${relationType}`;
    if (!targetType || !targetId || !relationType || bindingKeys.has(key)) {
      throw new BadRequestException('标记绑定为空或重复');
    }
    bindingKeys.add(key);
    return { targetType, targetId, relationType };
  });
  const attachments = (dto.attachments || []).map((attachment) => {
    const url = String(attachment?.url || '').trim();
    if (!url) throw new BadRequestException('附件地址不能为空');
    if (attachment.byteSize !== undefined && (!Number.isInteger(attachment.byteSize) || attachment.byteSize < 0)) {
      throw new BadRequestException('附件大小无效');
    }
    return { ...attachment, url };
  });

  return {
    ...dto,
    clientMarkerId,
    templateId,
    recordedAt,
    note: String(dto.note || '').trim() || undefined,
    bindings,
    attachments,
  };
}
