import { BadRequestException } from '@nestjs/common';

export const COLLECTION_TASK_STATUSES = ['draft', 'ready', 'collecting', 'review', 'completed', 'cancelled'] as const;
export const COLLECTION_SESSION_STATUSES = ['recording', 'paused', 'uploading', 'completed', 'abandoned'] as const;
export const MARKER_BEHAVIORS = ['info', 'entrance', 'junction', 'passability_change', 'barrier', 'calibration_point'] as const;
export const BINDING_RELATIONS = ['belongs_to', 'entrance_of', 'connects', 'affects', 'blocks', 'alternative_to', 'references'] as const;
export const BINDING_TARGET_TYPES = ['building', 'entrance', 'road', 'road_node', 'road_edge', 'gate', 'area', 'phase', 'task', 'marker'] as const;
export const MAX_POINTS_PER_BATCH = 100;

export type CreateCollectionTaskDto = {
  name: string;
  instructions?: string;
  status?: string;
  collectorUserIds?: string[];
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
  return { clientSessionId, coordinateType: 'gcj02', startedAt, device: dto.device };
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
  return {
    name,
    instructions: String(dto.instructions || '').trim() || undefined,
    status,
    collectorUserIds,
  };
}

export function parseTemplate(dto: MarkerTemplateDto) {
  const label = String(dto?.label || '').trim();
  const behavior = String(dto?.behavior || '');
  if (!label || label.length > 50) throw new BadRequestException('标记模板名称不能为空且不能超过 50 字');
  if (!MARKER_BEHAVIORS.includes(behavior as (typeof MARKER_BEHAVIORS)[number])) {
    throw new BadRequestException('标记模板系统行为无效');
  }
  const fieldSchema = Array.isArray(dto.fieldSchema) ? dto.fieldSchema : [];
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
  const endedAt = new Date(dto?.endedAt);
  if (Number.isNaN(endedAt.getTime())) throw new BadRequestException('采集结束时间无效');
  return { ...dto, endedAt };
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
