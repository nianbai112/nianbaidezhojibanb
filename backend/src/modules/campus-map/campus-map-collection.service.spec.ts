import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { CampusMapCollectionService } from "./campus-map-collection.service";
import {
  parseCollectionObject,
  parseMarker,
  parseObjectReview,
  parsePointBatch,
  parseStartSession,
  parseTask,
} from "./campus-map-collection.contract";

describe("CampusMapCollectionService", () => {
  const createPrisma = () => ({
    regionRider: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    campusMapCollectionTask: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campusMap: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    campusMapDraft: {
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campusMapProject: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    campusMapPlaceMedia: {
      upsert: jest.fn(),
    },
    campusMapPlaceEntrance: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    campusMapCollectionTaskPlace: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    campusMapCollectionAssignment: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    campusMapMarkerTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    campusMapCollectionSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campusMapCollectionPoint: {
      createMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    campusMapCollectionMarker: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      count: jest.fn(),
    },
    campusMapCollectionObject: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  });

  const makeTransactional = () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(makePlaceVerificationAckPoints());
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
    return prisma;
  };

  it("rejects zero accuracy consistently at point, object and marker contracts", () => {
    expect(() => parsePointBatch(0, {
      coordinateType: "gcj02",
      points: [{
        clientPointId: "point-zero", pointSeq: 0, longitude: 106.5, latitude: 29.6,
        accuracy: 0, recordedAt: "2026-08-26T00:00:00.000Z",
      }],
    })).toThrow("轨迹点精度无效");
    expect(() => parseCollectionObject({
      clientObjectId: "road-zero", objectType: "road",
      geometry: { type: "LineString", coordinates: [[106.5, 29.6], [106.5002, 29.6]] },
      properties: {}, accuracy: 0, recordedAt: "2026-08-26T00:00:10.000Z",
    } as any)).toThrow("采集对象精度无效");
    expect(() => parseMarker({
      clientMarkerId: "marker-zero", templateId: "template-1",
      longitude: 106.5, latitude: 29.6, accuracy: 0,
      recordedAt: "2026-08-26T00:00:00.000Z", fieldValues: {},
    } as any)).toThrow("标记精度无效");
  });

  const makePlaceVerificationAckPoints = () => Array.from({ length: 5 }, (_, index) => ({
    clientPointId: `place-point-${index + 1}`,
    pointSeq: index,
    longitude: 106.5 + (index - 2) * 0.000001,
    latitude: 29.6,
    accuracy: [3, 4, 5, 9, 7][index],
    recordedAt: new Date(`2026-08-26T01:00:${String(index * 3).padStart(2, "0")}.000Z`),
  }));

  const makePlaceVerificationEvidence = (
    targetPlaceId = "place-1",
    constructionStatus = "built",
  ) => ({
    sessionId: "session-1",
    objectType: "place_verification",
    geometry: { type: "Point", coordinates: [106.5, 29.6] },
    properties: {
      targetPlaceId,
      constructionStatus,
      clientPointIds: makePlaceVerificationAckPoints().map((point) => point.clientPointId),
      entranceCandidate: {
        name: "测试地点主入口",
        longitude: 106.5,
        latitude: 29.6,
        accuracy: 4,
        coordinateType: "gcj02",
        addressDescription: "测试地点东侧",
        serviceStatus: "open",
      },
    },
    bindings: [{ targetType: "place", targetId: targetPlaceId, relationType: "verifies" }],
    longitude: 106.5,
    latitude: 29.6,
    accuracy: 4,
    recordedAt: new Date("2026-08-26T01:01:00.000Z"),
    quality: {
      stationarySamples: [
        { longitude: 120, latitude: 40, accuracy: 1 },
      ],
    },
    attachments: [
      {
        id: "photo-facade",
        kind: "image",
        url: "https://files.example/facade.jpg",
        mimeType: "image/jpeg",
        metadata: {
          evidenceType: "building_front",
          capturedAt: "2026-08-26T01:00:15.000Z",
          captureLongitude: 106.5,
          captureLatitude: 29.6,
          accuracy: 5,
          coordinateType: "gcj02",
          source: "camera",
        },
      },
      {
        id: "photo-entrance",
        kind: "image",
        url: "https://files.example/entrance.jpg",
        mimeType: "image/jpeg",
        metadata: {
          evidenceType: "entrance_or_sign",
          capturedAt: "2026-08-26T01:00:30.000Z",
          captureLongitude: 106.5,
          captureLatitude: 29.6,
          accuracy: 6,
          coordinateType: "gcj02",
          source: "camera",
        },
      },
      ...(["under_construction", "renovating"].includes(constructionStatus) ? [{
        id: "photo-construction",
        kind: "image",
        url: "https://files.example/construction.jpg",
        mimeType: "image/jpeg",
        metadata: {
          evidenceType: "construction_progress",
          capturedAt: "2026-08-26T01:00:45.000Z",
          captureLongitude: 106.5,
          captureLatitude: 29.6,
          accuracy: 6,
          coordinateType: "gcj02",
          source: "camera",
        },
      }] : []),
    ],
    session: {
      startedAt: new Date("2026-08-26T01:00:00.000Z"),
      endedAt: new Date("2026-08-26T01:02:00.000Z"),
    },
  });

  it("keeps the professional task contract instead of silently dropping rider fields", () => {
    const boundary = {
      type: "Polygon",
      coordinates: [
        [
          [106.5, 29.6],
          [106.51, 29.6],
          [106.51, 29.61],
          [106.5, 29.6],
        ],
      ],
    };

    expect(
      parseTask({
        name: "一期室外采集",
        status: "ready",
        collectorUserIds: ["rider-1"],
        allowedClients: ["rider_app"],
        objectTypes: ["road", "building", "entrance", "facility", "issue"],
        targetPlaceIds: ["place-library", "place-library", "place-gate"],
        boundary,
        priority: 1,
        dueAt: "2026-08-20T12:00:00.000Z",
      } as any),
    ).toMatchObject({
      allowedClients: ["rider_app"],
      objectTypes: ["road", "building", "entrance", "facility", "issue"],
      targetPlaceIds: ["place-library", "place-gate"],
      boundary,
      priority: 1,
      dueAt: new Date("2026-08-20T12:00:00.000Z"),
    });
    expect(() =>
      parseTask({
        name: "错误任务",
        allowedClients: ["desktop"],
      } as any),
    ).toThrow("采集端无效");
  });

  it("validates explicit route/place/mixed task types while retaining legacy inference", () => {
    expect(parseTask({
      name: "地点核验",
      taskType: "place_verification",
      objectTypes: ["place_verification"],
      targetPlaceIds: ["place-1"],
    })).toMatchObject({ taskType: "place_verification", objectTypes: ["place_verification"] });
    expect(parseTask({ name: "道路", taskType: "route_collection", objectTypes: ["road"] }))
      .toMatchObject({ taskType: "route_collection" });
    expect(() => parseTask({ name: "错误地点任务", taskType: "place_verification", objectTypes: ["building"] }))
      .toThrow("地点核验任务");
    expect(parseTask({ name: "旧专业任务", objectTypes: ["road", "building", "entrance"] }))
      .toMatchObject({ taskType: "mixed" });
  });

  it("normalizes explicit reviewed-junction keys and rejects conflicting route topology", () => {
    const base: any = {
      clientObjectId: "road-junction-contract",
      objectType: "road",
      geometry: { type: "LineString", coordinates: [[106.5, 29.6], [106.5002, 29.6]] },
      properties: {},
      recordedAt: "2026-08-26T01:00:00.000Z",
      accuracy: 5,
    };
    const parsed = parseCollectionObject({
      ...base,
      properties: { startJunctionAnchorKey: "A".repeat(64), endJunctionAnchorKey: "B".repeat(64) },
    });
    expect(parsed.properties).toMatchObject({
      startJunctionAnchorKey: "a".repeat(64),
      endJunctionAnchorKey: "b".repeat(64),
    });
    expect(() => parseCollectionObject({
      ...base,
      properties: {
        startJunctionAnchorKey: "a".repeat(64),
        previousRouteObjectId: "road-parent",
        sharedStartAnchorPointId: "point-parent-end",
      },
    })).toThrow("不能同时选择已审核路口");
    expect(() => parseCollectionObject({
      ...base,
      properties: { startJunctionAnchorKey: "c".repeat(64), endJunctionAnchorKey: "c".repeat(64) },
    })).toThrow("起终点不能选择同一锚点");
  });

  it("accepts semantic place verification bindings and normalizes legacy photo evidence metadata", () => {
    const parsed = parseCollectionObject({
      clientObjectId: "verify-1",
      objectType: "place_verification",
      geometry: { type: "Point", coordinates: [106.5, 29.6] },
      properties: {
        targetPlaceId: "place-1",
        constructionStatus: "renovating",
        serviceStatus: "limited",
        clientPointIds: [" p1 ", "p2", "p3", "p4", "p5"],
      },
      recordedAt: "2026-08-26T01:00:00.000Z",
      longitude: 106.5,
      latitude: 29.6,
      accuracy: 6,
      bindings: [{ targetType: "place", targetId: "place-1", relationType: "verifies" }],
      attachments: [{
        kind: "image",
        url: "https://files.example/front.jpg",
        evidenceType: "building_front",
        capturedAt: "2026-08-26T01:00:00.000Z",
        captureLongitude: 106.5,
        captureLatitude: 29.6,
        accuracy: 5,
        source: "camera",
      } as any, {
        kind: "image",
        url: "https://files.example/entrance.jpg",
        metadata: {
          evidenceType: "entrance_or_sign",
          capturedAt: "2026-08-26T01:00:01.000Z",
          captureLongitude: 106.5,
          captureLatitude: 29.6,
          accuracy: 5,
          source: "camera",
          coordinateType: "gcj02",
        },
      }, {
        kind: "image",
        url: "https://files.example/construction.jpg",
        metadata: {
          evidenceType: "construction_progress",
          capturedAt: "2026-08-26T01:00:02.000Z",
          captureLongitude: 106.5,
          captureLatitude: 29.6,
          accuracy: 5,
          source: "camera",
          coordinateType: "gcj02",
        },
      }],
    });
    expect(parsed.bindings).toEqual([{ targetType: "place", targetId: "place-1", relationType: "verifies" }]);
    expect(parsed.properties.clientPointIds).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(parsed.attachments[0].metadata).toMatchObject({
      evidenceType: "building_front",
      captureLongitude: 106.5,
      accuracy: 5,
      source: "camera",
    });
    expect(() => parseObjectReview({
      decision: "approved",
      note: "照片合格",
      promoteAttachmentIds: ["attachment-1"],
    })).toThrow("必须显式选择 media");
  });

  it("rejects incomplete or mismatched place verification evidence before storage", () => {
    const base: any = {
      clientObjectId: "verify-invalid",
      objectType: "place_verification",
      geometry: { type: "Point", coordinates: [106.5, 29.6] },
      properties: {
        targetPlaceId: "place-1",
        constructionStatus: "built",
        clientPointIds: ["p1", "p2", "p3", "p4", "p5"],
      },
      recordedAt: "2026-08-26T01:00:00.000Z",
      longitude: 106.5,
      latitude: 29.6,
      accuracy: 5,
      bindings: [{ targetType: "place", targetId: "place-1", relationType: "verifies" }],
      attachments: [{
        kind: "image",
        url: "https://files.example/front.jpg",
        metadata: {
          evidenceType: "building_front",
          capturedAt: "2026-08-26T01:00:00.000Z",
          captureLongitude: 106.5,
          captureLatitude: 29.6,
          accuracy: 5,
          source: "camera",
        },
      }],
    };
    expect(() => parseCollectionObject({
      ...base,
      properties: { targetPlaceId: "place-1", constructionStatus: "built" },
    })).toThrow("5 个有序且唯一的 clientPointIds");
    expect(() => parseCollectionObject({
      ...base,
      properties: { ...base.properties, clientPointIds: ["p1", "p1", "p2", "p3", "p4"] },
    })).toThrow("5 个有序且唯一的 clientPointIds");
    expect(() => parseCollectionObject(base)).toThrow("建筑正面和入口/标识照片");
    expect(() => parseCollectionObject({
      ...base,
      bindings: [{ targetType: "place", targetId: "place-2", relationType: "verifies" }],
    })).toThrow("绑定同一 targetPlaceId");
    expect(() => parseCollectionObject({
      ...base,
      properties: { ...base.properties, constructionStatus: "renovating" },
      attachments: [
        ...base.attachments,
        {
          kind: "image",
          url: "https://files.example/entrance.jpg",
          metadata: {
            evidenceType: "entrance_or_sign",
            capturedAt: "2026-08-26T01:00:01.000Z",
            captureLongitude: 106.5,
            captureLatitude: 29.6,
            accuracy: 5,
            source: "camera",
          },
        },
      ],
    })).toThrow("施工进度照片");
  });

  it("defaults legacy sessions to miniapp and rejects unknown source clients", () => {
    const base = {
      clientSessionId: "client-session-1",
      coordinateType: "gcj02",
      startedAt: "2026-08-13T01:00:00.000Z",
      device: { model: "phone" },
    };

    expect(parseStartSession(base)).toMatchObject({ sourceClient: "miniapp" });
    expect(
      parseStartSession({ ...base, sourceClient: "rider_app" } as any),
    ).toMatchObject({ sourceClient: "rider_app" });
    expect(() =>
      parseStartSession({ ...base, sourceClient: "desktop" } as any),
    ).toThrow("采集会话来源无效");
  });

  it("lists only active tasks assigned to the approved official rider", async () => {
    const prisma = createPrisma();
    prisma.regionRider.findUnique.mockResolvedValue({
      userId: "rider-1",
      regionId: "region-1",
      riderType: "official",
      verifyStatus: "approved",
    });
    prisma.campusMapCollectionTask.findMany.mockResolvedValue([
      {
        id: "task-1",
        regionId: "region-1",
        name: "一期道路采集",
        instructions: "沿道路中心线行走",
        status: "ready",
        allowedClients: ["rider_app"],
        objectTypes: ["road", "entrance"],
        priority: 1,
        dueAt: new Date("2026-08-20T12:00:00.000Z"),
        sessions: [{ id: "session-1" }],
        createdBy: "admin-secret",
        accessCodeHash: "private-hash",
      },
      {
        id: "task-miniapp",
        regionId: "region-1",
        name: "小程序轻量采集",
        instructions: null,
        status: "ready",
        allowedClients: ["miniapp"],
        objectTypes: ["road"],
        priority: 3,
        dueAt: null,
        sessions: [],
      },
    ]);
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.listRiderTasks("rider-1")).resolves.toEqual([
      {
        id: "task-1",
        regionId: "region-1",
        name: "一期道路采集",
        instructions: "沿道路中心线行走",
        status: "ready",
        taskType: "mixed",
        objectTypes: ["road", "entrance"],
        priority: 1,
        dueAt: new Date("2026-08-20T12:00:00.000Z"),
        sessionCount: 1,
        activeSession: null,
        targetPlaceIds: [],
        targetFeatureIds: [],
        targets: [],
        resampleRequests: [],
      },
    ]);
    expect(prisma.campusMapCollectionTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          regionId: "region-1",
          status: { in: ["ready", "collecting"] },
          assignments: { some: { userId: "rider-1" } },
        },
      }),
    );
  });

  it("rejects campus task discovery for a non-official rider", async () => {
    const prisma = createPrisma();
    prisma.regionRider.findUnique.mockResolvedValue({
      userId: "rider-1",
      regionId: "region-1",
      riderType: "part_time",
      verifyStatus: "approved",
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.listRiderTasks("rider-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.campusMapCollectionTask.findMany).not.toHaveBeenCalled();
  });

  it("returns rider-safe task detail with marker templates", async () => {
    const prisma = createPrisma();
    prisma.regionRider.findUnique.mockResolvedValue({
      userId: "rider-1",
      regionId: "region-1",
      riderType: "official",
      verifyStatus: "approved",
    });
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      regionId: "region-1",
      name: "一期道路采集",
      instructions: null,
      status: "ready",
      allowedClients: ["rider_app"],
      objectTypes: ["road"],
      targetPlaceIds: ["place-library"],
      priority: 3,
      dueAt: null,
      sessions: [],
    });
    prisma.campusMapMarkerTemplate.findMany.mockResolvedValue([
      {
        id: "template-1",
        regionId: "region-1",
        label: "东门",
        description: null,
        icon: "gate",
        color: "#137547",
        behavior: "entrance",
        fieldSchema: [],
        allowedBindings: {},
        pinned: true,
        requirePhoto: false,
        requireNote: false,
        requireStationarySample: false,
        enabled: true,
        sortOrder: 1,
        createdBy: "admin-secret",
        updatedBy: "admin-secret",
      },
    ]);
    prisma.campusMap.findUnique.mockResolvedValue({
      draft: {
        manifest: {
          layers: [{
            id: "operator_pois",
            inlineData: {
              type: "FeatureCollection",
              features: [{
                type: "Feature",
                geometry: { type: "Point", coordinates: [1200, 900] },
                properties: { id: "place-library", title: "图书馆", semanticType: "library" },
              }],
            },
          }],
        },
      },
      activeVersion: null,
    });
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.getRiderTask("rider-1", "task-1");

    expect(result.task).toMatchObject({
      id: "task-1",
      objectTypes: ["road"],
      sessionCount: 0,
      targetPlaceIds: ["place-library"],
      targets: [{ id: "place-library", title: "图书馆", semanticType: "library", mapX: 1200, mapY: 900, longitude: null, latitude: null }],
    });
    expect(result.task).not.toHaveProperty("createdBy");
    expect(result.templates[0]).not.toHaveProperty("createdBy");
    expect(result.templates[0]).not.toHaveProperty("updatedBy");
    expect(result.junctionCatalog).toEqual({
      version: 1,
      coordinateType: "gcj02",
      linkRadiusMeters: 12,
      items: [],
    });
  });

  it("builds the rider junction catalog only from approved server-ACK route evidence in the current draft", async () => {
    const prisma = createPrisma();
    const startKey = "1".repeat(64);
    const endKey = "2".repeat(64);
    prisma.campusMapCollectionObject.findMany.mockResolvedValue([{
      id: "route-source",
      properties: { title: "图书馆东路" },
      reviewedAt: new Date("2026-08-26T01:00:00.000Z"),
      applyResult: {
        applied: true,
        routeQuality: { source: "server_ack" },
        routeEndpointAnchors: {
          version: 1,
          start: { key: startKey, pointId: "source-start", longitude: 106.5, latitude: 29.6, accuracy: 4 },
          end: { key: endKey, pointId: "source-end", longitude: 106.5003, latitude: 29.6, accuracy: 5 },
        },
      },
    }]);
    const manifest = {
      layers: [{
        id: "operator_routes",
        inlineData: { features: [{ properties: { collectionSource: "rider_app_approved", sourceObjectId: "route-source" } }] },
      }],
    };
    const service = new CampusMapCollectionService(prisma as any);

    const junctions = await (service as any).loadTrustedRouteJunctions(prisma, "region-1", manifest);

    expect(junctions).toEqual([
      expect.objectContaining({ key: startKey, sourceObjectId: "route-source", sourceEndpoint: "start" }),
      expect.objectContaining({ key: endKey, sourceObjectId: "route-source", sourceEndpoint: "end" }),
    ]);
    expect(prisma.campusMapCollectionObject.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["route-source"] },
        reviewStatus: "approved",
        appliedToDraftAt: { not: null },
      }),
    }));
  });

  it("reverse-projects CAD reference features and refuses uncalibrated canvas coordinates", () => {
    const service = new CampusMapCollectionService(createPrisma() as any);
    const cadManifest = {
      baseSource: "cad-vector",
      coordinateSystem: { type: "cad-vector", unit: "meter" },
      positioning: {
        calibrationPoints: [
          { mapX: 0, mapY: 0, longitude: 106.5, latitude: 29.6 },
          { mapX: 1000, mapY: 0, longitude: 106.51, latitude: 29.6 },
          { mapX: 0, mapY: 1000, longitude: 106.5, latitude: 29.61 },
        ],
      },
      layers: [{
        inlineData: {
          features: [{
            type: "Feature",
            geometry: { type: "LineString", coordinates: [[0, 0], [100, 100]] },
            properties: { id: "road-1", title: "东侧路", semanticType: "road" },
          }],
        },
      }],
    };
    const projected = (service as any).buildRiderReferenceMap(cadManifest, ["road-1"]);
    expect(projected.enabled).toBe(true);
    expect(projected.features[0]).toMatchObject({ id: "road-1", targeted: true });
    expect(projected.features[0].points[0].longitude).toBeCloseTo(106.5, 6);
    expect(projected.features[0].points[0].latitude).toBeCloseTo(29.6, 6);
    expect(projected.features[0].points[1].longitude).toBeCloseTo(106.501, 6);
    expect((service as any).buildRiderReferenceMap({
      ...cadManifest,
      positioning: { calibrationPoints: cadManifest.positioning.calibrationPoints.slice(0, 2) },
    })).toEqual({ enabled: false, reason: "calibration_insufficient", features: [] });
  });

  it("returns only the assigned rider's resample requests with actionable context", async () => {
    const prisma = createPrisma();
    prisma.regionRider.findUnique.mockResolvedValue({
      userId: "rider-1",
      regionId: "region-1",
      riderType: "official",
      verifyStatus: "approved",
    });
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      regionId: "region-1",
      name: "地点复核",
      instructions: null,
      status: "collecting",
      taskType: "place_verification",
      allowedClients: ["rider_app"],
      objectTypes: ["place_verification"],
      targetPlaceIds: [],
      priority: 1,
      dueAt: null,
      sessions: [{
        id: "session-own",
        objects: [{
          id: "object-resample",
          clientObjectId: "segment-7",
          objectType: "place_verification",
          properties: { targetPlaceId: "place-7", clientSegmentId: "place-segment-7" },
          reviewNote: "入口照片模糊，请重拍",
          reviewedAt: new Date("2026-08-26T02:00:00.000Z"),
        }],
      }],
    });
    prisma.campusMapMarkerTemplate.findMany.mockResolvedValue([]);
    prisma.campusMap.findUnique.mockResolvedValue(null);
    const service = new CampusMapCollectionService(prisma as any);
    const result: any = await service.getRiderTask("rider-1", "task-1");
    expect(result.task.resampleRequests).toEqual([{
      objectId: "object-resample",
      objectType: "place_verification",
      targetPlaceId: "place-7",
      clientSegmentId: "place-segment-7",
      reviewNote: "入口照片模糊，请重拍",
      reviewedAt: new Date("2026-08-26T02:00:00.000Z"),
    }]);
    expect(prisma.campusMapCollectionTask.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        sessions: expect.objectContaining({ where: { collectorUserId: "rider-1" } }),
      }),
    }));
  });

  it("includes collected objects and their evidence in the admin session detail", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      objects: [],
    });
    const service = new CampusMapCollectionService(prisma as any);

    await service.getSession("region-1", "task-1", "session-1");

    expect(prisma.campusMapCollectionSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          objects: {
            orderBy: { recordedAt: "asc" },
            include: { attachments: true },
          },
        }),
      }),
    );
  });

  it("records an admin review without changing immutable object geometry or properties", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionObject.findFirst.mockResolvedValue({
      id: "object-1",
      sessionId: "session-1",
      reviewStatus: "pending",
      appliedToDraftAt: null,
      session: { id: "session-1", taskId: "task-1", task: { id: "task-1", status: "review" } },
    });
    prisma.campusMapCollectionObject.update.mockResolvedValue({
      id: "object-1",
      reviewStatus: "approved",
      reviewNote: "与卫星图一致",
    });
    const service = new CampusMapCollectionService(prisma as any);

    await service.reviewCollectionObject(
      "region-1",
      "object-1",
      { decision: "approved", note: "与卫星图一致" },
      "admin-1",
    );

    expect(prisma.campusMapCollectionObject.findFirst).toHaveBeenCalledWith({
      where: {
        id: "object-1",
        session: { task: { regionId: "region-1" } },
      },
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
    expect(prisma.campusMapCollectionObject.update).toHaveBeenCalledWith({
      where: { id: "object-1" },
      data: {
        reviewStatus: "approved",
        reviewNote: "与卫星图一致",
        reviewedBy: "admin-1",
        reviewedAt: expect.any(Date),
      },
    });
    expect(
      prisma.campusMapCollectionObject.update.mock.calls[0][0].data,
    ).not.toHaveProperty("geometry");
    expect(
      prisma.campusMapCollectionObject.update.mock.calls[0][0].data,
    ).not.toHaveProperty("properties");
  });

  it("writes an approved bound location and explicitly selected entrance into the draft without publishing", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionObject.findFirst.mockResolvedValue({
      ...makePlaceVerificationEvidence("place-library"),
      id: "object-1",
      sessionId: "session-1",
      reviewStatus: "pending",
      appliedToDraftAt: null,
      geometry: { type: "Point", coordinates: [106.5, 29.6] },
      accuracy: 3.2,
      session: {
        id: "session-1",
        taskId: "task-1",
        startedAt: new Date("2026-08-26T01:00:00.000Z"),
        endedAt: new Date("2026-08-26T01:02:00.000Z"),
        task: { id: "task-1", taskType: "place_verification", status: "review" },
      },
    });
    prisma.campusMapCollectionObject.update.mockResolvedValue({ id: "object-1", reviewStatus: "approved" });
    prisma.campusMap.findUnique.mockResolvedValue({
      id: "map-1",
      draft: {
        id: "draft-1",
        revision: 2,
        manifest: {
          positioning: { enabled: false, calibrationPoints: [] },
          layers: [{
            id: "operator_pois",
            inlineData: {
              type: "FeatureCollection",
              features: [{
                type: "Feature",
                geometry: { type: "Point", coordinates: [1200, 900] },
                properties: { id: "place-library", title: "图书馆" },
              }],
            },
          }],
        },
      },
    });
    const place = {
      id: "place-library",
      regionId: "region-1",
      officialNumber: 7,
      officialName: "图书馆",
      displayName: null,
      semanticType: "building",
      constructionStatus: "built",
      serviceStatus: "open",
      publishStatus: "published",
      visibilityScope: "phase1_active",
      searchable: true,
      navigable: true,
      geometryStatus: "verified_point",
      artworkFeatureKey: null,
      artworkAnchorX: 1200,
      artworkAnchorY: 900,
      coordinateStatus: "verified",
      coordinateSource: "rider_app_approved",
      coordinateAccuracy: 3.2,
      coordinateCollectedAt: new Date("2026-08-25T01:00:00.000Z"),
      longitude: 106.5,
      latitude: 29.6,
      addressDescription: null,
      description: null,
      coverUrl: null,
      media: [],
    };
    prisma.campusMapProject.findFirst.mockResolvedValue(place);
    prisma.campusMapProject.findUnique.mockResolvedValue(place);
    prisma.campusMapProject.update.mockResolvedValue(place);
    prisma.campusMapPlaceEntrance.findFirst.mockResolvedValue(null);
    prisma.campusMapPlaceEntrance.updateMany.mockResolvedValue({ count: 0 });
    prisma.campusMapPlaceEntrance.create.mockResolvedValue({ id: "entrance-primary-1" });
    prisma.campusMapCollectionObject.count.mockResolvedValue(0);
    const service = new CampusMapCollectionService(prisma as any);

    await service.reviewCollectionObject(
      "region-1",
      "object-1",
      { decision: "approved", note: "现场定位精度合格", applyFields: ["location", "entrance"] },
      "admin-1",
    );

    expect(prisma.campusMapDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "draft-1", revision: 2 },
      data: expect.objectContaining({
        revision: { increment: 1 },
        updatedBy: "admin-1",
        manifest: expect.objectContaining({ layers: expect.any(Array) }),
      }),
    });
    const manifest = prisma.campusMapDraft.updateMany.mock.calls[0][0].data.manifest;
    expect(manifest.layers[0].inlineData.features[0].properties).toMatchObject({
      longitude: 106.5,
      latitude: 29.6,
      coordinateSource: "rider_app_approved",
    });
    expect(prisma.campusMapProject.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "place-library" },
      data: expect.objectContaining({
        longitude: 106.5,
        latitude: 29.6,
        coordinateCollectedAt: new Date("2026-08-26T01:00:12.000Z"),
      }),
    }));
    expect(prisma.campusMapPlaceEntrance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        placeId: "place-library",
        longitude: 106.5,
        latitude: 29.6,
        isPrimary: true,
        sourceType: "rider_collection",
        createdBy: "admin-1",
      }),
    });
    expect(prisma.campusMapPlaceMedia.upsert).not.toHaveBeenCalled();
  });

  it("does not silently replace the primary entrance when an admin selects location only", async () => {
    const prisma = makeTransactional();
    const evidence: any = {
      ...makePlaceVerificationEvidence("place-library"),
      id: "location-only-object",
      session: {
        startedAt: new Date("2026-08-26T01:00:00.000Z"),
        endedAt: new Date("2026-08-26T01:02:00.000Z"),
      },
    };
    const place: any = {
      id: "place-library",
      officialNumber: 7,
      officialName: "图书馆",
      displayName: null,
      semanticType: "building",
      constructionStatus: "built",
      serviceStatus: "open",
      publishStatus: "published",
      visibilityScope: "phase1_active",
      searchable: true,
      navigable: true,
      geometryStatus: "verified_point",
      coordinateStatus: "verified",
      longitude: 106.5,
      latitude: 29.6,
      media: [],
      entrances: [{ id: "existing-main", name: "原主入口", isPrimary: true }],
    };
    prisma.campusMap.findUnique.mockResolvedValue({
      id: "map-1",
      draft: { id: "draft-1", revision: 1, manifest: { coordinateSystem: { type: "amap" }, layers: [] } },
    });
    prisma.campusMapProject.findFirst.mockResolvedValue(place);
    prisma.campusMapProject.update.mockResolvedValue(place);
    prisma.campusMapProject.findUnique.mockResolvedValue(place);
    const service = new CampusMapCollectionService(prisma as any);

    await (service as any).applyApprovedObject(
      prisma,
      "region-1",
      evidence,
      { targetPlaceId: "place-library", applyFields: ["location"], promoteAttachmentIds: [] },
      "admin-1",
      new Date("2026-08-26T02:00:00.000Z"),
    );

    expect(prisma.campusMapPlaceEntrance.findFirst).not.toHaveBeenCalled();
    expect(prisma.campusMapPlaceEntrance.updateMany).not.toHaveBeenCalled();
    expect(prisma.campusMapPlaceEntrance.update).not.toHaveBeenCalled();
    expect(prisma.campusMapPlaceEntrance.create).not.toHaveBeenCalled();
  });

  it("merges an approved route into a stable operator_routes draft feature and completes review", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionObject.findFirst.mockResolvedValue({
      id: "road-object-1",
      sessionId: "session-1",
      reviewStatus: "pending",
      objectType: "road",
      geometry: {
        type: "LineString",
        coordinates: [
          [106.5, 29.6],
          [106.50003, 29.60001],
          [106.50006, 29.60002],
          [106.50009, 29.60003],
          [106.50012, 29.60004],
        ],
      },
      properties: {
        title: "图书馆东路",
        coordinateType: "gcj02",
        routeId: "route-east",
        clientPointIds: ["point-1", "point-2", "point-3", "point-4", "point-5"],
        segmentStartedAt: "2026-08-26T00:00:00.000Z",
        segmentEndedAt: "2026-08-26T00:00:20.000Z",
      },
      bindings: [],
      attachments: [{
        id: "route-photo-1",
        kind: "photo",
        url: "https://files.example/route.jpg",
        mimeType: "image/jpeg",
        metadata: { capturedAt: "2026-08-26T01:00:00.000Z", source: "camera" },
      }],
      quality: {
        sampleCount: 999,
        acceptedPointCount: 999,
        medianAccuracy: 1,
        maxAccuracy: 1,
        distanceMeters: 999,
        durationSeconds: 999,
        maximumGapSeconds: 0,
        rejectedQualityEventCount: 77,
      },
      recordedAt: new Date("2026-08-26T01:00:00.000Z"),
      appliedToDraftAt: null,
      session: {
        id: "session-1",
        taskId: "task-road",
        startedAt: new Date("2026-08-26T00:00:00.000Z"),
        endedAt: new Date("2026-08-26T01:00:00.000Z"),
        task: { id: "task-road", taskType: "route_collection", status: "review" },
      },
    });
    prisma.campusMap.findUnique.mockResolvedValue({
      id: "map-1",
      draft: {
        id: "draft-1",
        revision: 4,
        manifest: {
          baseSource: "cad-vector",
          coordinateSystem: { type: "cad-vector", unit: "meter" },
          positioning: {
            enabled: true,
            calibrationPoints: [
              { longitude: 106.5, latitude: 29.6, mapX: 0, mapY: 0 },
              { longitude: 106.51, latitude: 29.6, mapX: 1000, mapY: 0 },
              { longitude: 106.5, latitude: 29.61, mapX: 0, mapY: 1000 },
            ],
          },
          layers: [],
        },
      },
    });
    prisma.campusMapCollectionObject.update.mockResolvedValue({ id: "road-object-1", reviewStatus: "approved" });
    prisma.campusMapCollectionObject.count.mockResolvedValue(0);
    prisma.campusMapCollectionTask.findUnique.mockResolvedValue({
      id: "task-road",
      assignments: [{ userId: "rider-1" }],
      sessions: [{ id: "session-1", collectorUserId: "rider-1", status: "completed", uploadComplete: true }],
    });
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue([
      { clientPointId: "point-1", pointSeq: 0, longitude: 106.5, latitude: 29.6, accuracy: 4, recordedAt: new Date("2026-08-26T00:00:00.000Z") },
      { clientPointId: "point-2", pointSeq: 1, longitude: 106.50003, latitude: 29.60001, accuracy: 5, recordedAt: new Date("2026-08-26T00:00:05.000Z") },
      { clientPointId: "point-3", pointSeq: 2, longitude: 106.50006, latitude: 29.60002, accuracy: 6, recordedAt: new Date("2026-08-26T00:00:10.000Z") },
      { clientPointId: "point-4", pointSeq: 3, longitude: 106.50009, latitude: 29.60003, accuracy: 7, recordedAt: new Date("2026-08-26T00:00:15.000Z") },
      { clientPointId: "point-5", pointSeq: 4, longitude: 106.50012, latitude: 29.60004, accuracy: 8, recordedAt: new Date("2026-08-26T00:00:20.000Z") },
    ]);
    const service = new CampusMapCollectionService(prisma as any);

    const result: any = await service.reviewCollectionObject(
      "region-1",
      "road-object-1",
      {
        decision: "approved",
        note: "路线有效",
        applyFields: ["geometry", "media"],
        promoteAttachmentIds: ["route-photo-1"],
      },
      "admin-1",
    );

    const manifest = prisma.campusMapDraft.updateMany.mock.calls[0][0].data.manifest;
    const feature = manifest.layers.find((layer: any) => layer.id === "operator_routes").inlineData.features[0];
    expect(feature).toMatchObject({
      geometry: { type: "LineString" },
      properties: {
        id: "collection-route-road-object-1",
        sourceObjectId: "road-object-1",
        collectionSource: "rider_app_approved",
        quality: {
          acceptedPointCount: 5,
          medianAccuracy: 6,
          startAccuracy: 4,
          endAccuracy: 8,
          durationSeconds: 20,
          maximumGapSeconds: 5,
          source: "server_ack",
          clientReported: { acceptedPointCount: 999, medianAccuracy: 1 },
        },
        geometryCoordinateType: "cad-vector",
        sourceGeometryGcj02: { type: "LineString" },
        evidence: [{ id: "route-photo-1", url: "https://files.example/route.jpg" }],
      },
    });
    expect(feature.geometry.coordinates[1][0]).toBeCloseTo(3, 3);
    expect(feature.geometry.coordinates[1][1]).toBeCloseTo(1, 3);
    expect(feature.properties.quality.sampleCount).toBe(5);
    expect(feature.properties.quality.distanceMeters).toBeGreaterThan(10);
    expect(feature.properties.quality.distanceMeters).toBeLessThan(20);
    expect(result.draftApply).toMatchObject({ applied: true, draftRevision: 5, featureId: "collection-route-road-object-1" });
    expect(prisma.campusMapCollectionTask.updateMany).toHaveBeenCalledWith({
      where: { id: "task-road", status: { not: "cancelled" } },
      data: { status: "completed" },
    });
    expect(prisma.campusMap.update).not.toHaveBeenCalled();
  });

  it("ignores incomplete client route quality but rejects an uncalibrated CAD merge", async () => {
    const prisma = makeTransactional();
    const service = new CampusMapCollectionService(prisma as any);
    const coordinates = [
      [106.5, 29.6],
      [106.50003, 29.60001],
      [106.50006, 29.60002],
      [106.50009, 29.60003],
      [106.50012, 29.60004],
    ];
    const object: any = {
      id: "road-invalid",
      sessionId: "session-1",
      objectType: "road",
      geometry: { type: "LineString", coordinates },
      properties: {
        coordinateType: "gcj02",
        clientPointIds: ["point-1", "point-2", "point-3", "point-4", "point-5"],
        segmentStartedAt: "2026-08-26T00:00:00.000Z",
        segmentEndedAt: "2026-08-26T00:00:20.000Z",
      },
      quality: { sampleCount: 5, acceptedPointCount: 5 },
      bindings: [],
      attachments: [],
      recordedAt: new Date("2026-08-26T00:00:20.000Z"),
      session: {
        startedAt: new Date("2026-08-26T00:00:00.000Z"),
        endedAt: new Date("2026-08-26T00:00:20.000Z"),
      },
    };
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(
      coordinates.map(([longitude, latitude], pointSeq) => ({
        clientPointId: `point-${pointSeq + 1}`,
        pointSeq,
        longitude,
        latitude,
        accuracy: 5,
        recordedAt: new Date(`2026-08-26T00:00:${String(pointSeq * 5).padStart(2, "0")}.000Z`),
      })),
    );
    prisma.campusMap.findUnique.mockResolvedValue({
      draft: {
        id: "draft-1",
        revision: 1,
        manifest: {
          coordinateSystem: { type: "cad-vector" },
          positioning: { enabled: true, calibrationPoints: [{ mapX: 0, mapY: 0, longitude: 106.5, latitude: 29.6 }] },
          layers: [],
        },
      },
    });
    await expect((service as any).applyApprovedObject(
      prisma, "region-1", object, { applyFields: ["geometry"], promoteAttachmentIds: [] }, "admin-1", new Date(),
    )).rejects.toThrow("缺少至少 3 个有效校准点");
  });

  it("preserves server ACK evidence when an already applied route is approved again", async () => {
    const prisma = makeTransactional();
    const service = new CampusMapCollectionService(prisma as any);
    const object: any = {
      id: "road-idempotent",
      objectType: "road",
      geometry: { type: "LineString", coordinates: [[106.5, 29.6], [106.5002, 29.6]] },
      properties: { coordinateType: "gcj02" },
      bindings: [],
      applyFingerprint: "",
      appliedToDraftAt: new Date("2026-08-26T01:00:00.000Z"),
      appliedDraftId: "draft-1",
      appliedDraftRevision: 5,
      applyResult: {
        applied: true,
        fingerprint: "legacy-value",
        draftId: "draft-1",
        draftRevision: 5,
        routeQuality: { source: "server_ack", sampleCount: 6, maximumGapSeconds: 4 },
        routeEvidenceAttachmentIds: ["route-photo-1"],
        routeEndpointAnchors: {
          version: 1,
          start: { key: "a".repeat(64), pointId: "point-1", longitude: 106.5, latitude: 29.6 },
          end: { key: "b".repeat(64), pointId: "point-6", longitude: 106.5002, latitude: 29.6 },
        },
      },
    };
    const review = { targetPlaceId: "", applyFields: ["geometry"], promoteAttachmentIds: [] };
    object.applyFingerprint = createHash("sha256").update(JSON.stringify({
      objectId: object.id,
      objectType: object.objectType,
      geometry: object.geometry,
      properties: object.properties,
      applyFields: ["geometry"],
      promoteAttachmentIds: [],
      requestedTargetId: "",
    })).digest("hex");

    const result = await (service as any).applyApprovedObject(
      prisma, "region-1", object, review, "admin-1", new Date("2026-08-26T02:00:00.000Z"),
    );

    expect(result).toMatchObject({
      applied: true,
      idempotent: true,
      fingerprint: object.applyFingerprint,
      draftId: "draft-1",
      draftRevision: 5,
      routeQuality: { source: "server_ack", sampleCount: 6 },
      routeEvidenceAttachmentIds: ["route-photo-1"],
      routeEndpointAnchors: { version: 1 },
    });
    expect(prisma.campusMap.findUnique).not.toHaveBeenCalled();
  });

  it("verifies and records a shared server ACK junction between adjacent route segments", async () => {
    const prisma = makeTransactional();
    const service = new CampusMapCollectionService(prisma as any);
    const sharedAnchorKey = createHash("sha256").update("session-1:shared-point").digest("hex");
    const currentPoints = Array.from({ length: 5 }, (_, index) => ({
      clientPointId: `current-${index + 1}`,
      pointSeq: index + 5,
      longitude: 106.50016 + index * 0.00004,
      latitude: 29.6,
      accuracy: 5,
      recordedAt: new Date(`2026-08-26T00:00:${String(25 + index * 5).padStart(2, "0")}.000Z`),
    }));
    const object: any = {
      id: "road-current",
      sessionId: "session-1",
      objectType: "road",
      geometry: { type: "LineString", coordinates: currentPoints.map((point) => [point.longitude, point.latitude]) },
      properties: {
        coordinateType: "gcj02",
        clientPointIds: currentPoints.map((point) => point.clientPointId),
        segmentStartedAt: "2026-08-26T00:00:25.000Z",
        segmentEndedAt: "2026-08-26T00:00:45.000Z",
        previousRouteObjectId: "road-previous",
        sharedStartAnchorPointId: "shared-point",
      },
      quality: {}, bindings: [], attachments: [],
      recordedAt: new Date("2026-08-26T00:00:45.000Z"),
      session: {
        startedAt: new Date("2026-08-26T00:00:00.000Z"),
        endedAt: new Date("2026-08-26T00:01:00.000Z"),
      },
    };
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(currentPoints);
    prisma.campusMapCollectionPoint.findUnique.mockResolvedValue({
      clientPointId: "shared-point", pointSeq: 4, longitude: 106.50015, latitude: 29.6,
      accuracy: 5, recordedAt: new Date("2026-08-26T00:00:20.000Z"),
    });
    prisma.campusMapCollectionObject.findFirst.mockResolvedValue({
      id: "road-previous",
      properties: { clientPointIds: ["previous-1", "shared-point"] },
      applyResult: {
        routeEndpointAnchors: {
          version: 1,
          end: { key: sharedAnchorKey, pointId: "shared-point", longitude: 106.50015, latitude: 29.6 },
        },
      },
    });
    prisma.campusMap.findUnique.mockResolvedValue({
      draft: {
        id: "draft-1", revision: 3,
        manifest: { coordinateSystem: { type: "amap", source: "gcj02", unit: "degree" }, layers: [] },
      },
    });

    const result = await (service as any).applyApprovedObject(
      prisma, "region-1", object,
      { applyFields: ["geometry"], promoteAttachmentIds: [] },
      "admin-1", new Date("2026-08-26T01:00:00.000Z"),
    );

    expect(result.routeEndpointAnchors).toMatchObject({
      version: 1,
      start: { key: sharedAnchorKey, pointId: "shared-point", sharedFromObjectId: "road-previous" },
      end: { pointId: "current-5" },
    });
    const savedManifest = prisma.campusMapDraft.updateMany.mock.calls[0][0].data.manifest;
    const feature = savedManifest.layers[0].inlineData.features[0];
    expect(feature.properties.routeEndpointAnchors.start).toEqual({
      key: sharedAnchorKey,
      longitude: 106.50015,
      latitude: 29.6,
      sharedFromObjectId: "road-previous",
      sharedFromEndpoint: "end",
    });
    expect(feature.properties.routeEndpointAnchors.start).not.toHaveProperty("pointId");
  });

  it("requires accurate route endpoints so adjacent rider segments can form one junction", () => {
    const service = new CampusMapCollectionService(createPrisma() as any);
    const points = Array.from({ length: 5 }, (_, index) => ({
      longitude: 106.5 + index * 0.00004,
      latitude: 29.6,
      accuracy: index === 0 ? 9 : 5,
      recordedAt: new Date(`2026-08-26T00:00:${String(index * 5).padStart(2, "0")}.000Z`),
    }));

    expect(() => (service as any).calculateServerRouteQuality(points))
      .toThrow("起点和终点精度必须在 8 米以内");
  });

  it("rejects a route geometry that does not match the server-ACKed session points", async () => {
    const prisma = makeTransactional();
    const service = new CampusMapCollectionService(prisma as any);
    const coordinates = [
      [106.5, 29.6],
      [106.50003, 29.60001],
      [106.50006, 29.60002],
      [106.50009, 29.60003],
      [106.50012, 29.60004],
    ];
    prisma.campusMap.findUnique.mockResolvedValue({
      draft: { id: "draft-1", revision: 1, manifest: { coordinateSystem: { type: "amap" }, layers: [] } },
    });
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(
      coordinates.map(([longitude, latitude], pointSeq) => ({
        clientPointId: `point-${pointSeq + 1}`,
        pointSeq,
        longitude: pointSeq === 2 ? longitude + 0.01 : longitude,
        latitude,
        recordedAt: new Date(`2026-08-26T00:00:${String(pointSeq * 5).padStart(2, "0")}.000Z`),
      })),
    );

    await expect((service as any).applyApprovedObject(
      prisma,
      "region-1",
      {
        id: "road-mismatch",
        sessionId: "session-1",
        objectType: "road",
        geometry: { type: "LineString", coordinates },
        properties: {
          coordinateType: "gcj02",
          clientPointIds: ["point-1", "point-2", "point-3", "point-4", "point-5"],
          segmentStartedAt: "2026-08-26T00:00:00.000Z",
          segmentEndedAt: "2026-08-26T00:00:20.000Z",
        },
        quality: {
          sampleCount: 5,
          acceptedPointCount: 5,
          medianAccuracy: 5,
          maxAccuracy: 8,
          distanceMeters: 15,
          durationSeconds: 20,
          maximumGapSeconds: 5,
          rejectedQualityEventCount: 0,
        },
        bindings: [],
        attachments: [],
        recordedAt: new Date("2026-08-26T00:00:20.000Z"),
        session: {
          startedAt: new Date("2026-08-26T00:00:00.000Z"),
          endedAt: new Date("2026-08-26T00:00:20.000Z"),
        },
      },
      { applyFields: ["geometry"], promoteAttachmentIds: [] },
      "admin-1",
      new Date(),
    )).rejects.toThrow("道路几何与服务器 ACK 轨迹点的顺序、时间或坐标不一致");
    expect(prisma.campusMapDraft.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a route when server-ACKed accuracy fails even if client quality claims it passes", async () => {
    const prisma = makeTransactional();
    const service = new CampusMapCollectionService(prisma as any);
    const coordinates = [
      [106.5, 29.6],
      [106.50003, 29.60001],
      [106.50006, 29.60002],
      [106.50009, 29.60003],
      [106.50012, 29.60004],
    ];
    prisma.campusMap.findUnique.mockResolvedValue({
      draft: { id: "draft-1", revision: 1, manifest: { coordinateSystem: { type: "amap" }, layers: [] } },
    });
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(
      coordinates.map(([longitude, latitude], pointSeq) => ({
        clientPointId: `point-${pointSeq + 1}`,
        pointSeq,
        longitude,
        latitude,
          accuracy: pointSeq === 2 ? 25 : 5,
        recordedAt: new Date(`2026-08-26T00:00:${String(pointSeq * 5).padStart(2, "0")}.000Z`),
      })),
    );

    await expect((service as any).applyApprovedObject(
      prisma,
      "region-1",
      {
        id: "road-bad-server-accuracy",
        sessionId: "session-1",
        objectType: "road",
        geometry: { type: "LineString", coordinates },
        properties: {
          coordinateType: "gcj02",
          clientPointIds: ["point-1", "point-2", "point-3", "point-4", "point-5"],
          segmentStartedAt: "2026-08-26T00:00:00.000Z",
          segmentEndedAt: "2026-08-26T00:00:20.000Z",
        },
        quality: {
          sampleCount: 5,
          acceptedPointCount: 5,
          medianAccuracy: 1,
          maxAccuracy: 1,
          distanceMeters: 999,
          durationSeconds: 20,
          maximumGapSeconds: 1,
        },
        bindings: [],
        attachments: [],
        recordedAt: new Date("2026-08-26T00:00:20.000Z"),
        session: {
          startedAt: new Date("2026-08-26T00:00:00.000Z"),
          endedAt: new Date("2026-08-26T00:00:20.000Z"),
        },
      },
      { applyFields: ["geometry"], promoteAttachmentIds: [] },
      "admin-1",
      new Date(),
    )).rejects.toThrow("服务器 ACK 点最大精度必须在 20 米以内");
    expect(prisma.campusMapDraft.updateMany).not.toHaveBeenCalled();
  });

  it("rejects drifting server-ACKed stationary samples despite forged stable client quality", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(
      makePlaceVerificationAckPoints().map((point, index) => ({
        ...point,
        longitude: [106.4998, 106.4999, 106.5, 106.5001, 106.5002][index],
        accuracy: 4,
      })),
    );
    const service = new CampusMapCollectionService(prisma as any);
    const evidence: any = makePlaceVerificationEvidence("place-1");
    evidence.quality = {
      stationarySamples: Array.from({ length: 5 }, () => ({ longitude: 106.5, latitude: 29.6, accuracy: 1 })),
    };
    await expect((service as any).applyApprovedObject(
      prisma,
      "region-1",
      {
        ...evidence,
        id: "verify-drift",
      },
      { targetPlaceId: "place-1", applyFields: ["location"], promoteAttachmentIds: [] },
      "admin-1",
      new Date(),
    )).rejects.toThrow("最大漂移超过 12 米");
    expect(prisma.campusMapProject.update).not.toHaveBeenCalled();
  });

  it("rejects place point ids that are not all ACKed by the same session", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(makePlaceVerificationAckPoints().slice(0, 4));
    const service = new CampusMapCollectionService(prisma as any);
    const evidence: any = makePlaceVerificationEvidence("place-1");

    await expect((service as any).validatePlaceVerificationEvidence(
      prisma,
      evidence,
      evidence.properties,
    )).rejects.toThrow("非本会话或尚未被服务器 ACK");
    expect(prisma.campusMapCollectionPoint.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        sessionId: "session-1",
        clientPointId: { in: evidence.properties.clientPointIds },
      },
    }));
  });

  it("ignores forged client stationary samples and derives the accepted point from server ACK rows", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(makePlaceVerificationAckPoints());
    const service = new CampusMapCollectionService(prisma as any);
    const evidence: any = makePlaceVerificationEvidence("place-1");

    const result = await (service as any).validatePlaceVerificationEvidence(
      prisma,
      evidence,
      evidence.properties,
    );
    expect(result).toMatchObject({
      acceptedLongitude: 106.5,
      acceptedLatitude: 29.6,
      acceptedAccuracy: 5,
      locationVerification: {
        acceptedSampleCount: 5,
        goodSampleCount: 4,
        clientPointIds: evidence.properties.clientPointIds,
        source: "server_ack",
      },
    });
  });

  it("rejects place photos outside the session window or farther than 20 meters", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(makePlaceVerificationAckPoints());
    const service = new CampusMapCollectionService(prisma as any);
    const outsideSession: any = makePlaceVerificationEvidence("place-1");
    outsideSession.attachments[0].metadata.capturedAt = "2026-08-26T00:57:59.000Z";
    await expect((service as any).validatePlaceVerificationEvidence(
      prisma,
      outsideSession,
      outsideSession.properties,
    )).rejects.toThrow("拍摄时间必须位于采集会话期间内");

    const tooFar: any = makePlaceVerificationEvidence("place-1");
    tooFar.attachments[1].metadata.captureLongitude = 106.501;
    await expect((service as any).validatePlaceVerificationEvidence(
      prisma,
      tooFar,
      tooFar.properties,
    )).rejects.toThrow("拍摄位置距核验坐标不能超过 20 米");
  });

  it("reports duplicate place photo capture times separately from session-window failures", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(makePlaceVerificationAckPoints());
    const service = new CampusMapCollectionService(prisma as any);
    const duplicateTime: any = makePlaceVerificationEvidence("place-1");
    duplicateTime.attachments[1].metadata.capturedAt = duplicateTime.attachments[0].metadata.capturedAt;

    await expect((service as any).validatePlaceVerificationEvidence(
      prisma,
      duplicateTime,
      duplicateTime.properties,
    )).rejects.toThrow("两张现场照片的拍摄时间不能重复");
  });

  it("allows different photo capture times to share one GPS fix timestamp", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(makePlaceVerificationAckPoints());
    const service = new CampusMapCollectionService(prisma as any);
    const sharedLocationTime: any = makePlaceVerificationEvidence("place-1");
    sharedLocationTime.attachments.forEach((attachment: any) => {
      attachment.metadata.locationRecordedAt = "2026-08-26T01:00:12.000Z";
    });

    await expect((service as any).validatePlaceVerificationEvidence(
      prisma,
      sharedLocationTime,
      sharedLocationTime.properties,
    )).resolves.toMatchObject({
      photoVerification: { validatedPhotoCount: 2 },
    });
  });

  it("rejects inaccurate or incomplete place photo evidence during approval validation", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue(makePlaceVerificationAckPoints());
    const service = new CampusMapCollectionService(prisma as any);
    const inaccurate: any = makePlaceVerificationEvidence("place-1");
    inaccurate.attachments[0].metadata.accuracy = 20.1;
    await expect((service as any).validatePlaceVerificationEvidence(
      prisma,
      inaccurate,
      inaccurate.properties,
    )).rejects.toThrow("精度在 20 米内");

    const noEntrance: any = makePlaceVerificationEvidence("place-1");
    noEntrance.attachments = noEntrance.attachments.filter((attachment: any) => attachment.id !== "photo-entrance");
    await expect((service as any).validatePlaceVerificationEvidence(
      prisma,
      noEntrance,
      noEntrance.properties,
    )).rejects.toThrow("建筑正面和入口/标识照片");

    const noConstruction: any = makePlaceVerificationEvidence("place-1", "renovating");
    noConstruction.attachments = noConstruction.attachments.filter((attachment: any) => attachment.id !== "photo-construction");
    await expect((service as any).validatePlaceVerificationEvidence(
      prisma,
      noConstruction,
      noConstruction.properties,
    )).rejects.toThrow("施工进度照片");
  });

  it("prevents an admin review from rebinding place verification to another target", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionObject.findFirst.mockResolvedValue({
      ...makePlaceVerificationEvidence("place-1"),
      id: "verify-target-lock",
      sessionId: "session-1",
      reviewStatus: "pending",
      appliedToDraftAt: null,
      session: {
        id: "session-1",
        startedAt: new Date("2026-08-26T01:00:00.000Z"),
        endedAt: new Date("2026-08-26T01:02:00.000Z"),
        taskId: "task-1",
        task: { id: "task-1", taskType: "place_verification", status: "review" },
      },
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.reviewCollectionObject(
      "region-1",
      "verify-target-lock",
      {
        decision: "approved",
        note: "试图改绑",
        targetPlaceId: "place-2",
        applyFields: ["location"],
      },
      "admin-1",
    )).rejects.toThrow("不能改绑到其他 targetPlaceId");
    expect(prisma.campusMap.findUnique).not.toHaveBeenCalled();
    expect(prisma.campusMapCollectionObject.update).not.toHaveBeenCalled();
  });

  it("blocks silent downgrade after an object has already been applied to the draft", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionObject.findFirst.mockResolvedValue({
      id: "road-object-1",
      appliedToDraftAt: new Date(),
      session: { taskId: "task-road", task: { id: "task-road", taskType: "route_collection" } },
      attachments: [],
    });
    const service = new CampusMapCollectionService(prisma as any);
    await expect(service.reviewCollectionObject(
      "region-1",
      "road-object-1",
      { decision: "void", note: "不再采用" },
      "admin-1",
    )).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.campusMapCollectionObject.update).not.toHaveBeenCalled();
  });

  it("rejects review and draft application after the collection task is cancelled", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionObject.findFirst.mockResolvedValue({
      id: "cancelled-object",
      objectType: "road",
      attachments: [],
      appliedToDraftAt: null,
      session: {
        taskId: "task-cancelled",
        startedAt: new Date("2026-08-26T01:00:00.000Z"),
        endedAt: new Date("2026-08-26T01:02:00.000Z"),
        task: { id: "task-cancelled", taskType: "route_collection", status: "cancelled" },
      },
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.reviewCollectionObject(
      "region-1",
      "cancelled-object",
      { decision: "approved", note: "不应合并", applyFields: ["geometry"] },
      "admin-1",
    )).rejects.toThrow("采集任务已取消");
    expect(prisma.campusMap.findUnique).not.toHaveBeenCalled();
    expect(prisma.campusMapDraft.updateMany).not.toHaveBeenCalled();
    expect(prisma.campusMapCollectionObject.update).not.toHaveBeenCalled();
    expect(prisma.campusMapCollectionTask.updateMany).not.toHaveBeenCalled();
  });

  it("cannot resurrect a task cancelled while its object review is in flight", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionObject.findFirst.mockResolvedValue({
      id: "review-race-object",
      sessionId: "session-1",
      reviewStatus: "pending",
      attachments: [],
      appliedToDraftAt: null,
      session: {
        id: "session-1",
        taskId: "task-review-race",
        startedAt: new Date("2026-08-26T01:00:00.000Z"),
        endedAt: new Date("2026-08-26T01:02:00.000Z"),
        task: { id: "task-review-race", taskType: "route_collection", status: "review" },
      },
    });
    prisma.campusMapCollectionObject.update.mockResolvedValue({ id: "review-race-object", reviewStatus: "resample" });
    prisma.campusMapCollectionObject.count.mockResolvedValue(1);
    prisma.campusMapCollectionTask.findUnique.mockResolvedValue({
      id: "task-review-race",
      status: "review",
      assignments: [{ userId: "rider-1" }],
      sessions: [{ id: "session-1", collectorUserId: "rider-1", status: "completed", uploadComplete: true }],
    });
    prisma.campusMapCollectionTask.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.reviewCollectionObject(
      "region-1",
      "review-race-object",
      { decision: "resample", note: "请补采" },
      "admin-1",
    )).rejects.toThrow("审核结果未保存");
    expect(prisma.campusMapCollectionTask.updateMany).toHaveBeenCalledWith({
      where: { id: "task-review-race", status: { not: "cancelled" } },
      data: { status: "collecting" },
    });
    expect(prisma.campusMapCollectionTask.update).not.toHaveBeenCalled();
  });

  it("does not complete review while another assigned rider still has an active session", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionObject.findFirst.mockResolvedValue({
      ...makePlaceVerificationEvidence("place-1"),
      id: "verify-1",
      sessionId: "session-1",
      reviewStatus: "pending",
      appliedToDraftAt: null,
      session: {
        id: "session-1",
        startedAt: new Date("2026-08-26T01:00:00.000Z"),
        endedAt: new Date("2026-08-26T01:02:00.000Z"),
        taskId: "task-1",
        task: { id: "task-1", taskType: "place_verification", status: "review" },
      },
    });
    prisma.campusMapCollectionObject.update.mockResolvedValue({ id: "verify-1", reviewStatus: "approved" });
    prisma.campusMapCollectionObject.count.mockResolvedValue(0);
    prisma.campusMapCollectionTask.findUnique.mockResolvedValue({
      id: "task-1",
      assignments: [{ userId: "rider-1" }, { userId: "rider-2" }],
      sessions: [
        { id: "session-1", collectorUserId: "rider-1", status: "completed", uploadComplete: true },
        { id: "session-2", collectorUserId: "rider-2", status: "recording", uploadComplete: false },
      ],
    });
    const service = new CampusMapCollectionService(prisma as any);
    await service.reviewCollectionObject(
      "region-1", "verify-1", { decision: "approved", note: "档案无需合并" }, "admin-1",
    );
    expect(prisma.campusMapCollectionTask.updateMany).toHaveBeenCalledWith({
      where: { id: "task-1", status: { not: "cancelled" } },
      data: { status: "collecting" },
    });
  });

  it("lists objects scoped to the region with optional review and task filters", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionObject.findMany.mockResolvedValue([
      {
        id: "object-1",
        sessionId: "session-1",
        objectType: "road",
        properties: { markerClientIds: ["marker-note-1"] },
        reviewStatus: "pending",
        session: { id: "session-1", task: { name: "一期道路采集" } },
        attachments: [],
      },
    ]);
    prisma.campusMapCollectionObject.count.mockResolvedValue(1);
    prisma.campusMapCollectionMarker.findMany.mockResolvedValue([{
      id: "marker-1",
      sessionId: "session-1",
      clientMarkerId: "marker-note-1",
      note: "路口地砖松动",
      attachments: [],
    }]);
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.listObjects("region-1", {
      reviewStatus: "pending",
      taskId: "task-1",
      page: 1,
      pageSize: 20,
    });

    expect(prisma.campusMapCollectionObject.findMany).toHaveBeenCalledWith({
      where: {
        session: { taskId: "task-1", task: { regionId: "region-1" } },
        reviewStatus: "pending",
      },
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
      skip: 0,
      take: 20,
    });
    expect(result).toEqual({
      items: [
        {
          id: "object-1",
          sessionId: "session-1",
          objectType: "road",
          properties: { markerClientIds: ["marker-note-1"] },
          reviewStatus: "pending",
          session: { id: "session-1", task: { name: "一期道路采集" } },
          attachments: [],
          markers: [expect.objectContaining({ id: "marker-1", note: "路口地砖松动" })],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(prisma.campusMapCollectionMarker.findMany).toHaveBeenCalledWith({
      where: { OR: [{ sessionId: "session-1", clientMarkerId: "marker-note-1" }] },
      include: { bindings: true, attachments: true, template: true },
    });
  });

  it("summarizes route predecessor readiness without an N+1 query", async () => {
    const prisma = createPrisma();
    const routeAnchorKey = createHash("sha256")
      .update("session-1:point-parent-end")
      .digest("hex");
    prisma.campusMapCollectionObject.findMany
      .mockResolvedValueOnce([
        {
          id: "road-child-1",
          sessionId: "session-1",
          objectType: "road",
          properties: {
            previousRouteObjectId: "road-parent-1",
            sharedStartAnchorPointId: "point-parent-end",
          },
          reviewStatus: "pending",
          session: { id: "session-1", task: { name: "连续道路采集" } },
          attachments: [],
        },
        {
          id: "road-child-2",
          sessionId: "session-1",
          objectType: "road",
          properties: {
            previousRouteObjectId: "road-parent-1",
            sharedStartAnchorPointId: "point-parent-end",
          },
          reviewStatus: "pending",
          session: { id: "session-1", task: { name: "连续道路采集" } },
          attachments: [],
        },
      ])
      .mockResolvedValueOnce([{
        id: "road-parent-1",
        sessionId: "session-1",
        objectType: "road",
        reviewStatus: "approved",
        appliedToDraftAt: new Date("2026-08-26T01:00:00.000Z"),
        properties: { clientPointIds: ["point-parent-start", "point-parent-end"] },
        applyResult: {
          routeEndpointAnchors: {
            version: 1,
            end: { pointId: "point-parent-end", key: routeAnchorKey, longitude: 106.5, latitude: 29.6 },
          },
        },
      }]);
    prisma.campusMapCollectionObject.count.mockResolvedValue(2);
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.listObjects("region-1", {
      reviewStatus: "pending",
      page: 1,
      pageSize: 20,
    });

    expect(prisma.campusMapCollectionObject.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.campusMapCollectionObject.findMany.mock.calls[1][0]).toEqual({
      where: {
        id: { in: ["road-parent-1"] },
        session: { task: { regionId: "region-1" } },
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
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].routeDependency).toEqual({
      previousRouteObjectId: "road-parent-1",
      sharedStartAnchorPointId: "point-parent-end",
      status: "ready",
      ready: true,
      previousReviewStatus: "approved",
      previousAppliedToDraftAt: new Date("2026-08-26T01:00:00.000Z"),
    });
  });

  it("marks incomplete and forged route predecessor evidence as unsafe for admin approval", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionObject.findMany.mockResolvedValueOnce([
      {
        id: "road-half-linked",
        sessionId: "session-1",
        objectType: "road",
        properties: { sharedStartAnchorPointId: "point-parent-end" },
        reviewStatus: "pending",
        session: { id: "session-1", task: { name: "连续道路采集" } },
        attachments: [],
      },
      {
        id: "road-child-forged",
        sessionId: "session-1",
        objectType: "road",
        properties: {
          previousRouteObjectId: "road-parent-forged",
          sharedStartAnchorPointId: "point-parent-end",
        },
        reviewStatus: "pending",
        session: { id: "session-1", task: { name: "连续道路采集" } },
        attachments: [],
      },
    ]).mockResolvedValueOnce([{
      id: "road-parent-forged",
      sessionId: "session-1",
      objectType: "road",
      reviewStatus: "approved",
      appliedToDraftAt: new Date("2026-08-26T01:00:00.000Z"),
      properties: { clientPointIds: ["point-parent-end"] },
      applyResult: {
        routeEndpointAnchors: {
          version: 1,
          end: { pointId: "point-parent-end", key: "forged-anchor-key" },
        },
      },
    }]);
    prisma.campusMapCollectionObject.count.mockResolvedValue(2);
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.listObjects("region-1", {
      reviewStatus: "pending",
      page: 1,
      pageSize: 20,
    });

    expect(result.items[0].routeDependency).toEqual(expect.objectContaining({
      previousRouteObjectId: null,
      sharedStartAnchorPointId: "point-parent-end",
      status: "invalid",
      ready: false,
    }));
    expect(result.items[1].routeDependency).toEqual(expect.objectContaining({
      previousRouteObjectId: "road-parent-forged",
      status: "anchor_invalid",
      ready: false,
    }));
  });

  it("returns a short-lived access code while persisting only its SHA-256 hash", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      regionId: "region-1",
    });
    prisma.campusMapCollectionTask.update.mockResolvedValue({ id: "task-1" });
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.rotateAccessCode(
      "region-1",
      "task-1",
      "admin-1",
    );

    expect(result.accessCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.campusMapCollectionTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        accessCodeHash: createHash("sha256")
          .update(result.accessCode)
          .digest("hex"),
        accessCodeExpiresAt: result.expiresAt,
      },
    });
  });

  it("rejects expired access codes before returning collector context", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      status: "ready",
      accessCodeExpiresAt: new Date(Date.now() - 1_000),
      assignments: [{ userId: "user-1" }],
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(
      service.resolveCollectorContext("expired-code", "user-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campusMapMarkerTemplate.findMany).not.toHaveBeenCalled();
  });

  it("rejects an authenticated user who is not assigned to the task", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      status: "ready",
      accessCodeExpiresAt: new Date(Date.now() + 60_000),
      assignments: [{ userId: "another-user" }],
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(
      service.resolveCollectorContext("valid-code", "user-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns only collector-safe task fields in the mobile context", async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      regionId: "region-1",
      name: "一期道路采集",
      instructions: "沿道路中心线行走",
      status: "ready",
      createdBy: "admin-secret-id",
      accessCodeHash: "private-hash",
      accessCodeExpiresAt: new Date(Date.now() + 60_000),
      assignments: [{ userId: "user-1", assignedBy: "admin-secret-id" }],
    });
    prisma.campusMapMarkerTemplate.findMany.mockResolvedValue([
      {
        id: "template-1",
        regionId: "region-1",
        label: "教学楼入口",
        description: null,
        icon: "gate",
        color: "#137547",
        behavior: "entrance",
        fieldSchema: [],
        allowedBindings: {
          targetTypes: ["building"],
          relationTypes: ["entrance_of"],
        },
        pinned: true,
        requirePhoto: false,
        requireNote: false,
        requireStationarySample: true,
        enabled: true,
        sortOrder: 1,
        createdBy: "admin-secret-id",
        updatedBy: "admin-secret-id",
      },
    ]);
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.resolveCollectorContext(
      "valid-code",
      "user-1",
    );

    expect(result.task).toEqual({
      id: "task-1",
      regionId: "region-1",
      name: "一期道路采集",
      instructions: "沿道路中心线行走",
      status: "ready",
    });
    expect(result.task).not.toHaveProperty("createdBy");
    expect(result.task).not.toHaveProperty("assignments");
    expect(result.task).not.toHaveProperty("accessCodeHash");
    expect(result.templates[0]).not.toHaveProperty("createdBy");
    expect(result.templates[0]).not.toHaveProperty("updatedBy");
  });

  it("returns the existing owned session when a client retries the same session id", async () => {
    const prisma = createPrisma();
    const existing = {
      id: "session-1",
      taskId: "task-1",
      collectorUserId: "user-1",
      clientSessionId: "client-session-1",
    };
    prisma.campusMapCollectionSession.findUnique.mockResolvedValue(existing);
    const service = new CampusMapCollectionService(prisma as any);

    await expect(
      service.startSession("task-1", "user-1", {
        clientSessionId: "client-session-1",
        coordinateType: "gcj02",
        startedAt: "2026-08-09T01:00:00.000Z",
        device: { model: "Xiaomi 17 Pro" },
      }),
    ).resolves.toBe(existing);
    expect(prisma.campusMapCollectionSession.create).not.toHaveBeenCalled();
  });

  it("moves a ready task to collecting when the first session starts", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findUnique.mockResolvedValue(null);
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      allowedClients: ["rider_app"],
    });
    prisma.campusMapCollectionSession.create.mockResolvedValue({ id: "session-1", taskId: "task-1" });
    const service = new CampusMapCollectionService(prisma as any);
    await expect(service.startSession("task-1", "rider-1", {
      clientSessionId: "client-session-new",
      coordinateType: "gcj02",
      sourceClient: "rider_app",
      startedAt: "2026-08-26T01:00:00.000Z",
      device: { model: "phone" },
    })).resolves.toMatchObject({ id: "session-1" });
    expect(prisma.campusMapCollectionTask.updateMany).toHaveBeenCalledWith({
      where: { id: "task-1", status: { in: ["ready", "collecting"] } },
      data: { status: "collecting" },
    });
    expect(prisma.campusMapCollectionSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: "task-1",
        collectorUserId: "rider-1",
        clientSessionId: "client-session-new",
        activeKey: "task-1:rider-1",
      }),
    });
  });

  it("rechecks assignment and client permission after locking the task", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findUnique.mockResolvedValue(null);
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue(null);
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.startSession("task-1", "removed-rider", {
      clientSessionId: "client-session-after-removal",
      coordinateType: "gcj02",
      sourceClient: "rider_app",
      startedAt: "2026-08-26T01:00:00.000Z",
      device: { model: "phone" },
    })).rejects.toThrow("无权开始这个采集任务");
    expect(prisma.campusMapCollectionSession.create).not.toHaveBeenCalled();
  });

  it("enforces one active session per rider and supports explicit abandon recovery", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findUnique.mockImplementation(({ where }: any) => {
      if (where.activeKey) {
        return { id: "session-old", clientSessionId: "old-client", status: "recording" };
      }
      if (where.id) return { id: "session-old", status: "abandoned" };
      return null;
    });
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({ id: "task-1", allowedClients: ["rider_app"] });
    prisma.campusMapCollectionSession.create.mockRejectedValue({ code: "P2002", meta: { target: ["activeKey"] } });
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-old",
      clientSessionId: "old-client",
      status: "recording",
    });
    const service = new CampusMapCollectionService(prisma as any);
    await expect(service.startSession("task-1", "rider-1", {
      clientSessionId: "new-client",
      coordinateType: "gcj02",
      sourceClient: "rider_app",
      startedAt: "2026-08-26T01:00:00.000Z",
      device: { model: "phone" },
    })).rejects.toThrow("已有未结束采集会话 session-old");

    await expect(service.abandonSession("session-old", "rider-1"))
      .resolves.toMatchObject({ status: "abandoned" });
    expect(prisma.campusMapCollectionSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: "session-old",
        collectorUserId: "rider-1",
        status: { in: ["recording", "paused", "uploading"] },
      },
      data: {
        status: "abandoned",
        endedAt: expect.any(Date),
        uploadComplete: false,
        activeKey: null,
      },
    });
  });

  it("uses the database activeKey constraint to allow only one concurrent active session", async () => {
    const prisma = makeTransactional();
    let activeSession: any = null;
    const byClientSessionId = new Map<string, any>();
    prisma.campusMapCollectionSession.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.clientSessionId) return byClientSessionId.get(where.clientSessionId) ?? null;
      if (where.activeKey) return activeSession?.activeKey === where.activeKey ? activeSession : null;
      return null;
    });
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({ id: "task-1", allowedClients: ["rider_app"] });
    prisma.campusMapCollectionSession.create.mockImplementation(async ({ data }: any) => {
      if (activeSession) throw { code: "P2002", meta: { target: ["activeKey"] } };
      activeSession = { id: "session-winner", ...data };
      byClientSessionId.set(data.clientSessionId, activeSession);
      return activeSession;
    });
    const service = new CampusMapCollectionService(prisma as any);
    const start = (clientSessionId: string) => service.startSession("task-1", "rider-1", {
      clientSessionId,
      coordinateType: "gcj02",
      sourceClient: "rider_app",
      startedAt: "2026-08-26T01:00:00.000Z",
      device: { model: "phone" },
    });

    const results = await Promise.allSettled([start("concurrent-a"), start("concurrent-b")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ConflictException);
    expect(String(rejected?.reason?.message)).toContain("session-winner");
    expect(prisma.campusMapCollectionSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.campusMapCollectionSession.create).toHaveBeenCalledTimes(2);
  });

  it("rejects starting a rider session for a miniapp-only task", async () => {
    const prisma = makeTransactional();
    prisma.regionRider.findUnique.mockResolvedValue({
      userId: "rider-1",
      regionId: "region-1",
      riderType: "official",
      verifyStatus: "approved",
    });
    prisma.campusMapCollectionSession.findUnique.mockResolvedValue(null);
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      allowedClients: ["miniapp"],
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(
      service.startRiderSession("task-1", "rider-1", {
        clientSessionId: "client-session-1",
        coordinateType: "gcj02",
        sourceClient: "rider_app",
        startedAt: "2026-08-13T01:00:00.000Z",
        device: { model: "phone" },
      }),
    ).rejects.toThrow("这个任务不允许当前采集端");
    expect(prisma.campusMapCollectionSession.create).not.toHaveBeenCalled();
  });

  it("rejects oversized or invalid GCJ-02 point batches before writing", async () => {
    const prisma = makeTransactional();
    const service = new CampusMapCollectionService(prisma as any);
    const point = {
      clientPointId: "point-1",
      pointSeq: 0,
      recordedAt: "2026-08-09T01:00:01.000Z",
      longitude: 106.5,
      latitude: 29.6,
      accuracy: 6,
    };

    await expect(
      service.uploadPointBatch("session-1", "user-1", 0, {
        coordinateType: "gcj02",
        points: Array.from({ length: 101 }, (_, index) => ({
          ...point,
          clientPointId: `point-${index}`,
          pointSeq: index,
        })),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.uploadPointBatch("session-1", "user-1", 0, {
        coordinateType: "gcj02",
        points: [{ ...point, longitude: 999 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("acknowledges the same stored point ids when a batch is retried", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      collectorUserId: "user-1",
      status: "recording",
      lastBatchNo: -1,
      startedAt: new Date("2026-08-09T01:00:00.000Z"),
      endedAt: null,
    });
    prisma.campusMapCollectionPoint.createMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 0 });
    const storedPoints = [
      {
        clientPointId: "point-1",
        pointSeq: 0,
        recordedAt: new Date("2026-08-09T01:00:01.000Z"),
        longitude: 106.5,
        latitude: 29.6,
      },
      {
        clientPointId: "point-2",
        pointSeq: 1,
        recordedAt: new Date("2026-08-09T01:00:02.000Z"),
        longitude: 106.5001,
        latitude: 29.6001,
      },
    ];
    prisma.campusMapCollectionPoint.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(storedPoints.map(({ clientPointId }) => ({ clientPointId })))
      .mockResolvedValueOnce(storedPoints)
      .mockResolvedValueOnce(storedPoints.map(({ clientPointId }) => ({ clientPointId })));
    prisma.campusMapCollectionPoint.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ pointSeq: 1, recordedAt: storedPoints[1].recordedAt });
    prisma.campusMapCollectionPoint.count.mockResolvedValue(2);
    prisma.campusMapCollectionSession.update.mockResolvedValue({
      id: "session-1",
    });
    const service = new CampusMapCollectionService(prisma as any);
    const dto = {
      coordinateType: "gcj02",
      points: [
        {
          clientPointId: "point-1",
          pointSeq: 0,
          recordedAt: "2026-08-09T01:00:01.000Z",
          longitude: 106.5,
          latitude: 29.6,
          accuracy: 6,
        },
        {
          clientPointId: "point-2",
          pointSeq: 1,
          recordedAt: "2026-08-09T01:00:02.000Z",
          longitude: 106.5001,
          latitude: 29.6001,
          accuracy: 7,
        },
      ],
    };

    const first = await service.uploadPointBatch("session-1", "user-1", 0, dto);
    const retry = await service.uploadPointBatch("session-1", "user-1", 0, dto);

    expect(first).toEqual({
      batchNo: 0,
      acknowledgedPointIds: ["point-1", "point-2"],
      pointCount: 2,
    });
    expect(retry).toEqual(first);
  });

  it("rejects cross-batch sequence rollback and points outside the session time window", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      collectorUserId: "user-1",
      status: "recording",
      lastBatchNo: 0,
      startedAt: new Date("2026-08-09T01:00:00.000Z"),
      endedAt: new Date("2026-08-09T02:00:00.000Z"),
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.uploadPointBatch("session-1", "user-1", 1, {
      coordinateType: "gcj02",
      points: [{
        clientPointId: "too-early",
        pointSeq: 11,
        recordedAt: "2026-08-09T00:59:59.000Z",
        longitude: 106.5,
        latitude: 29.6,
        accuracy: 5,
      }],
    })).rejects.toThrow("轨迹点时间必须位于采集会话期间内");
    expect(prisma.$transaction).not.toHaveBeenCalled();

    prisma.campusMapCollectionPoint.findMany.mockResolvedValueOnce([]);
    prisma.campusMapCollectionPoint.findFirst.mockResolvedValueOnce({
      pointSeq: 10,
      recordedAt: new Date("2026-08-09T01:10:00.000Z"),
    });
    await expect(service.uploadPointBatch("session-1", "user-1", 1, {
      coordinateType: "gcj02",
      points: [{
        clientPointId: "sequence-rollback",
        pointSeq: 9,
        recordedAt: "2026-08-09T01:11:00.000Z",
        longitude: 106.5001,
        latitude: 29.6001,
        accuracy: 5,
      }],
    })).rejects.toThrow("跨批轨迹点的 pointSeq 和采集时间必须整体递增");
    expect(prisma.campusMapCollectionPoint.createMany).not.toHaveBeenCalled();
  });

  it("does not write a point batch when the parent task is cancelled during upload", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      taskId: "task-cancelled",
      lastBatchNo: -1,
      startedAt: new Date("2026-08-26T01:00:00.000Z"),
      endedAt: null,
    });
    prisma.campusMapCollectionTask.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.uploadPointBatch("session-1", "rider-1", 0, {
      coordinateType: "gcj02",
      points: [{
        clientPointId: "point-after-cancel",
        pointSeq: 0,
        recordedAt: "2026-08-26T01:00:03.000Z",
        longitude: 106.5,
        latitude: 29.6,
        accuracy: 5,
      }],
    })).rejects.toThrow("采集任务已取消或状态已变化");
    expect(prisma.campusMapCollectionPoint.createMany).not.toHaveBeenCalled();
  });

  it("returns the existing object when the same client object id is retried", async () => {
    const prisma = createPrisma();
    const dto = {
      clientObjectId: "client-object-1",
      objectType: "road",
      geometry: {
        type: "LineString",
        coordinates: [
          [106.5, 29.6],
          [106.5001, 29.6001],
        ],
      },
      properties: { surface: "asphalt" },
      recordedAt: "2026-08-13T01:00:00.000Z",
      accuracy: 6,
      longitude: 106.5001,
      latitude: 29.6001,
      quality: { sampleCount: 2, sourceClient: "rider_app" },
      bindings: [],
      attachments: [
        { kind: "photo", url: "https://files.example/road-a.jpg" },
        { kind: "photo", url: "https://files.example/road-b.jpg" },
      ],
    };
    const existing = {
      id: "object-1",
      sessionId: "session-1",
      clientObjectId: "client-object-1",
      objectType: dto.objectType,
      geometry: dto.geometry,
      properties: dto.properties,
      recordedAt: new Date(dto.recordedAt),
      accuracy: dto.accuracy,
      longitude: dto.longitude,
      latitude: dto.latitude,
      quality: dto.quality,
      bindings: dto.bindings,
      attachments: dto.attachments.slice().reverse(),
    };
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      collectorUserId: "user-1",
      status: "recording",
    });
    prisma.campusMapCollectionObject.findUnique.mockResolvedValue(existing);
    const service = new CampusMapCollectionService(prisma as any);

    await expect(
      (service as any).createCollectionObject("session-1", "user-1", dto),
    ).resolves.toMatchObject({
      id: "object-1",
      uploadAck: { accepted: true, duplicate: true, serverObjectId: "object-1" },
    });
    await expect((service as any).createCollectionObject("session-1", "user-1", {
      ...dto,
      properties: { surface: "concrete" },
    })).rejects.toThrow("clientObjectId 已存在，但上传内容与服务器记录不一致");
    expect(prisma.campusMapCollectionObject.create).not.toHaveBeenCalled();
  });

  it("rechecks object idempotency after taking the writable session lock", async () => {
    const prisma = makeTransactional();
    const dto = {
      clientObjectId: "client-race",
      objectType: "road",
      geometry: { type: "LineString", coordinates: [[106.5, 29.6], [106.5001, 29.6001]] },
      properties: { surface: "asphalt" },
      recordedAt: "2026-08-13T01:00:00.000Z",
      accuracy: 6,
      longitude: 106.5001,
      latitude: 29.6001,
      quality: { sampleCount: 2, sourceClient: "rider_app" },
      bindings: [],
      attachments: [],
    };
    const existing = {
      id: "object-race-winner",
      sessionId: "session-1",
      clientObjectId: dto.clientObjectId,
      objectType: dto.objectType,
      geometry: dto.geometry,
      properties: dto.properties,
      recordedAt: new Date(dto.recordedAt),
      accuracy: dto.accuracy,
      longitude: dto.longitude,
      latitude: dto.latitude,
      quality: dto.quality,
      bindings: dto.bindings,
      attachments: [],
    };
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1", taskId: "task-1", collectorUserId: "user-1", status: "recording",
    });
    prisma.campusMapCollectionObject.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const service = new CampusMapCollectionService(prisma as any);

    await expect((service as any).createCollectionObject("session-1", "user-1", dto))
      .resolves.toMatchObject({
        id: "object-race-winner",
        uploadAck: { accepted: true, duplicate: true, serverObjectId: "object-race-winner" },
      });
    expect(prisma.campusMapCollectionSession.updateMany).toHaveBeenCalled();
    expect(prisma.campusMapCollectionObject.create).not.toHaveBeenCalled();
  });

  it("checks route marker ownership only after taking the writable session lock", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1", taskId: "task-1", collectorUserId: "user-1", status: "recording",
    });
    prisma.campusMapCollectionObject.findUnique.mockResolvedValue(null);
    prisma.campusMapCollectionMarker.findMany.mockResolvedValue([{ clientMarkerId: "marker-1" }]);
    prisma.campusMapCollectionObject.findMany.mockResolvedValue([]);
    prisma.campusMapCollectionObject.create.mockResolvedValue({ id: "road-with-marker" });
    prisma.campusMapCollectionObject.count.mockResolvedValue(1);
    const service = new CampusMapCollectionService(prisma as any);

    await (service as any).createCollectionObject("session-1", "user-1", {
      clientObjectId: "road-with-marker",
      objectType: "road",
      geometry: { type: "LineString", coordinates: [[106.5, 29.6], [106.5001, 29.6001]] },
      properties: { markerClientIds: ["marker-1"] },
      recordedAt: "2026-08-13T01:00:00.000Z",
      accuracy: 6,
      longitude: 106.5001,
      latitude: 29.6001,
      quality: { sampleCount: 2, sourceClient: "rider_app" },
      bindings: [],
      attachments: [],
    });

    expect(prisma.campusMapCollectionSession.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(prisma.campusMapCollectionMarker.findMany.mock.invocationCallOrder[0]);
    expect(prisma.campusMapCollectionSession.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(prisma.campusMapCollectionObject.findMany.mock.invocationCallOrder[0]);
  });

  it("stores an immutable road object and updates the session object count", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      collectorUserId: "user-1",
      status: "recording",
    });
    prisma.campusMapCollectionObject.findUnique.mockResolvedValue(null);
    prisma.campusMapCollectionObject.create.mockImplementation(
      ({ data }: any) => ({ id: "object-1", ...data }),
    );
    prisma.campusMapCollectionObject.count.mockResolvedValue(1);
    prisma.campusMapCollectionSession.update.mockResolvedValue({
      id: "session-1",
      objectCount: 1,
    });
    const service = new CampusMapCollectionService(prisma as any);

    const result = await (service as any).createCollectionObject(
      "session-1",
      "user-1",
      {
        clientObjectId: "client-object-1",
        objectType: "road",
        geometry: {
          type: "LineString",
          coordinates: [
            [106.5, 29.6],
            [106.5001, 29.6001],
          ],
        },
        properties: { name: "图书馆东侧步道", surface: "asphalt" },
        recordedAt: "2026-08-13T01:00:00.000Z",
        accuracy: 6,
        longitude: 106.5001,
        latitude: 29.6001,
        quality: { sampleCount: 2, sourceClient: "rider_app" },
        bindings: [],
        attachments: [
          { kind: "photo", url: "https://files/road.jpg", byteSize: 123 },
        ],
      },
    );

    expect(result).toMatchObject({
      id: "object-1",
      clientObjectId: "client-object-1",
      objectType: "road",
    });
    expect(prisma.campusMapCollectionObject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: "session-1",
          clientObjectId: "client-object-1",
          geometry: {
            type: "LineString",
            coordinates: [
              [106.5, 29.6],
              [106.5001, 29.6001],
            ],
          },
          attachments: {
            create: [
              expect.objectContaining({ url: "https://files/road.jpg" }),
            ],
          },
        }),
      }),
    );
    expect(prisma.campusMapCollectionSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { objectCount: 1 },
    });
  });

  it("does not write a collected object when cancellation wins the task lock", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      taskId: "task-cancelled",
      status: "recording",
      task: { regionId: "region-1", objectTypes: ["road"], targetPlaceIds: [] },
    });
    prisma.campusMapCollectionObject.findUnique.mockResolvedValue(null);
    prisma.campusMapCollectionTask.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.createCollectionObject("session-1", "rider-1", {
      clientObjectId: "road-after-cancel",
      objectType: "road",
      geometry: { type: "LineString", coordinates: [[106.5, 29.6], [106.5002, 29.6]] },
      properties: { clientPointIds: ["point-1", "point-2"] },
      recordedAt: "2026-08-26T01:00:10.000Z",
      quality: {},
      bindings: [],
      attachments: [],
    })).rejects.toThrow("采集任务已取消或状态已变化");
    expect(prisma.campusMapCollectionObject.create).not.toHaveBeenCalled();
  });

  it("supersedes the same rider's resample object when its replacement is uploaded", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-new",
      taskId: "task-1",
      task: { regionId: "region-1", objectTypes: ["road"], targetPlaceIds: [] },
    });
    prisma.campusMapCollectionObject.findUnique.mockResolvedValue(null);
    prisma.campusMapCollectionObject.findFirst.mockResolvedValue({
      id: "road-resample-old",
      properties: { clientSegmentId: "segment-old" },
      applyResult: null,
      reviewNote: "轨迹断点太长",
      reviewedBy: "admin-1",
      reviewedAt: new Date("2026-08-26T01:00:00.000Z"),
    });
    prisma.campusMapCollectionObject.create.mockImplementation(({ data }: any) => ({ id: "road-new", ...data }));
    prisma.campusMapCollectionObject.count.mockResolvedValue(1);
    prisma.campusMapCollectionSession.update.mockResolvedValue({ id: "session-new" });
    const service = new CampusMapCollectionService(prisma as any);
    const result: any = await service.createCollectionObject("session-new", "rider-1", {
      clientObjectId: "road-new-client",
      objectType: "road",
      geometry: { type: "LineString", coordinates: [[106.5, 29.6], [106.5001, 29.6001]] },
      properties: { resampleOfObjectId: "road-resample-old", clientSegmentId: "segment-new" },
      recordedAt: "2026-08-26T02:00:00.000Z",
      quality: {},
      bindings: [],
      attachments: [],
    });
    expect(result.uploadAck).toMatchObject({
      accepted: true,
      supersedesObjectId: "road-resample-old",
      serverObjectId: "road-new",
    });
    expect(prisma.campusMapCollectionObject.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "road-resample-old",
        objectType: "road",
        reviewStatus: "resample",
        session: { taskId: "task-1", collectorUserId: "rider-1" },
      }),
    }));
    expect(prisma.campusMapCollectionObject.updateMany).toHaveBeenCalledWith({
      where: { id: "road-resample-old", reviewStatus: "resample" },
      data: expect.objectContaining({
        reviewStatus: "superseded",
        applyResult: expect.objectContaining({
          previousDecision: "resample",
          supersededByObjectId: "road-new",
        }),
      }),
    });
  });

  it("keeps an incomplete session open when client and server counts differ", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      collectorUserId: "user-1",
      status: "recording",
      pointCount: 2,
      markerCount: 1,
      uploadComplete: false,
    });
    prisma.campusMapCollectionPoint.count.mockResolvedValue(2);
    prisma.campusMapCollectionMarker.count.mockResolvedValue(1);
    prisma.campusMapCollectionObject.count.mockResolvedValue(0);
    const service = new CampusMapCollectionService(prisma as any);

    await expect(
      service.finishSession("session-1", "user-1", {
        clientPointCount: 3,
        clientMarkerCount: 1,
        clientObjectCount: 0,
        endedAt: "2026-08-09T02:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.campusMapCollectionSession.update).not.toHaveBeenCalled();
  });

  it("rejects finishing any session whose task has been cancelled", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-cancelled",
      taskId: "task-cancelled",
      collectorUserId: "user-1",
      status: "recording",
      uploadComplete: false,
      task: { status: "cancelled" },
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.finishSession("session-cancelled", "user-1", {
      clientPointCount: 0,
      clientMarkerCount: 0,
      clientObjectCount: 0,
      endedAt: "2026-08-26T02:00:00.000Z",
    })).rejects.toThrow("采集任务已取消");
    expect(prisma.campusMapCollectionSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.campusMapCollectionSession.update).not.toHaveBeenCalled();
    expect(prisma.campusMapCollectionTask.updateMany).not.toHaveBeenCalled();
  });

  it("finishes a fully uploaded session idempotently", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst
      .mockResolvedValueOnce({
        id: "session-1",
        collectorUserId: "user-1",
        status: "recording",
        uploadComplete: false,
      })
      .mockResolvedValueOnce({
        id: "session-1",
        collectorUserId: "user-1",
        status: "completed",
        uploadComplete: true,
        task: { status: "review" },
        pointCount: 2,
        markerCount: 1,
        endedAt: new Date("2026-08-09T02:00:00.000Z"),
      });
    prisma.campusMapCollectionPoint.count.mockResolvedValue(2);
    prisma.campusMapCollectionMarker.count.mockResolvedValue(1);
    prisma.campusMapCollectionObject.count.mockResolvedValue(1);
    prisma.campusMapCollectionSession.update.mockResolvedValue({
      id: "session-1",
      status: "completed",
      uploadComplete: true,
      pointCount: 2,
      markerCount: 1,
      objectCount: 1,
      endedAt: new Date("2026-08-09T02:00:00.000Z"),
    });
    const service = new CampusMapCollectionService(prisma as any);
    const dto = {
      clientPointCount: 2,
      clientMarkerCount: 1,
      clientObjectCount: 1,
      endedAt: "2026-08-09T02:00:00.000Z",
    };

    const first = await service.finishSession("session-1", "user-1", dto);
    const retry = await service.finishSession("session-1", "user-1", dto);

    expect(first).toMatchObject({
      status: "completed",
      uploadComplete: true,
      pointCount: 2,
      markerCount: 1,
      objectCount: 1,
    });
    expect(retry).toMatchObject({
      status: "completed",
      uploadComplete: true,
      pointCount: 2,
      markerCount: 1,
    });
    expect(prisma.campusMapCollectionSession.update).toHaveBeenCalledTimes(1);
  });

  it("moves a task to review only after every assigned rider has completed upload", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-2", taskId: "task-1", collectorUserId: "rider-2", status: "recording", uploadComplete: false,
    });
    prisma.campusMapCollectionPoint.count.mockResolvedValue(2);
    prisma.campusMapCollectionMarker.count.mockResolvedValue(0);
    prisma.campusMapCollectionObject.count.mockResolvedValue(1);
    prisma.campusMapCollectionSession.update.mockResolvedValue({ id: "session-2", status: "completed", uploadComplete: true });
    prisma.campusMapCollectionTask.findUnique.mockResolvedValue({
      id: "task-1",
      assignments: [{ userId: "rider-1" }, { userId: "rider-2" }],
      sessions: [
        { id: "session-1", collectorUserId: "rider-1", status: "completed", uploadComplete: true },
        { id: "session-2", collectorUserId: "rider-2", status: "recording", uploadComplete: false },
      ],
    });
    const service = new CampusMapCollectionService(prisma as any);
    await service.finishSession("session-2", "rider-2", {
      clientPointCount: 2,
      clientMarkerCount: 0,
      clientObjectCount: 1,
      endedAt: "2026-08-26T02:00:00.000Z",
    });
    expect(prisma.campusMapCollectionTask.updateMany).toHaveBeenCalledWith({
      where: { id: "task-1", status: { not: "cancelled" } },
      data: { status: "review" },
    });
  });

  it("keeps legacy mini-program completion compatible when object count is omitted", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      collectorUserId: "user-1",
      status: "recording",
      uploadComplete: false,
    });
    prisma.campusMapCollectionPoint.count.mockResolvedValue(2);
    prisma.campusMapCollectionMarker.count.mockResolvedValue(1);
    prisma.campusMapCollectionObject.count.mockResolvedValue(0);
    prisma.campusMapCollectionSession.update.mockResolvedValue({
      id: "session-1",
      status: "completed",
      uploadComplete: true,
      objectCount: 0,
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(
      service.finishSession("session-1", "user-1", {
        clientPointCount: 2,
        clientMarkerCount: 1,
        endedAt: "2026-08-13T02:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      status: "completed",
      uploadComplete: true,
      objectCount: 0,
    });
  });

  it("keeps a session open when collected object counts differ", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      collectorUserId: "user-1",
      status: "recording",
      uploadComplete: false,
    });
    prisma.campusMapCollectionPoint.count.mockResolvedValue(2);
    prisma.campusMapCollectionMarker.count.mockResolvedValue(1);
    prisma.campusMapCollectionObject.count.mockResolvedValue(1);
    const service = new CampusMapCollectionService(prisma as any);

    await expect(
      service.finishSession("session-1", "user-1", {
        clientPointCount: 2,
        clientMarkerCount: 1,
        clientObjectCount: 2,
        endedAt: "2026-08-13T02:00:00.000Z",
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.campusMapCollectionSession.update).not.toHaveBeenCalled();
  });

  it("stores an immutable template snapshot and multiple allowed bindings", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      collectorUserId: "user-1",
      status: "recording",
      task: { regionId: "region-1" },
    });
    prisma.campusMapCollectionMarker.findUnique.mockResolvedValue(null);
    prisma.campusMapMarkerTemplate.findFirst.mockResolvedValue({
      id: "template-1",
      regionId: "region-1",
      label: "图书馆东门",
      icon: "gate",
      color: "#dc2626",
      behavior: "entrance",
      fieldSchema: [{ key: "door", type: "text", label: "门名称" }],
      requirePhoto: false,
      requireNote: false,
      requireStationarySample: false,
      allowedBindings: {
        targetTypes: ["building", "entrance"],
        relationTypes: ["entrance_of", "connects"],
      },
    });
    prisma.campusMapCollectionMarker.create.mockImplementation(
      ({ data }: any) => ({ id: "marker-1", ...data }),
    );
    prisma.campusMapCollectionMarker.count.mockResolvedValue(1);
    prisma.campusMapCollectionSession.update.mockResolvedValue({
      id: "session-1",
    });
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.createMarker("session-1", "user-1", {
      clientMarkerId: "client-marker-1",
      templateId: "template-1",
      recordedAt: "2026-08-09T01:10:00.000Z",
      longitude: 106.5,
      latitude: 29.6,
      accuracy: 5,
      fieldValues: { door: "east" },
      bindings: [
        {
          targetType: "building",
          targetId: "building-29",
          relationType: "entrance_of",
        },
        {
          targetType: "entrance",
          targetId: "entrance-east",
          relationType: "connects",
        },
      ],
      attachments: [],
    });

    expect(result).toMatchObject({
      id: "marker-1",
      templateLabelSnapshot: "图书馆东门",
      behaviorSnapshot: "entrance",
    });
    expect(prisma.campusMapCollectionMarker.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateLabelSnapshot: "图书馆东门",
        templateIconSnapshot: "gate",
        templateColorSnapshot: "#dc2626",
        behaviorSnapshot: "entrance",
        bindings: {
          create: [
            {
              targetType: "building",
              targetId: "building-29",
              relationType: "entrance_of",
            },
            {
              targetType: "entrance",
              targetId: "entrance-east",
              relationType: "connects",
            },
          ],
        },
      }),
    });
  });

  it("accepts only byte-equivalent marker retries for the same clientMarkerId", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1", collectorUserId: "user-1", status: "recording",
      task: { regionId: "region-1" },
    });
    const existing = {
      id: "marker-1", sessionId: "session-1", clientMarkerId: "marker-retry",
      templateId: "template-1", longitude: 106.5, latitude: 29.6, accuracy: 5,
      recordedAt: new Date("2026-08-26T01:00:00.000Z"),
      fieldValues: { condition: "normal" }, note: "路口正常",
      bindings: [{ targetType: "place", targetId: "place-1", relationType: "references" }],
      attachments: [{
        kind: "photo", url: "https://cdn.example/marker.jpg", storageKey: null,
        mimeType: "image/jpeg", byteSize: 100, checksum: null, metadata: { source: "camera" },
      }],
    };
    prisma.campusMapCollectionMarker.findUnique.mockResolvedValue(existing);
    const service = new CampusMapCollectionService(prisma as any);
    const payload: any = {
      clientMarkerId: "marker-retry", templateId: "template-1",
      recordedAt: "2026-08-26T01:00:00.000Z",
      longitude: 106.5, latitude: 29.6, accuracy: 5,
      fieldValues: { condition: "normal" }, note: "路口正常",
      bindings: [{ targetType: "place", targetId: "place-1", relationType: "references" }],
      attachments: [{
        kind: "photo", url: "https://cdn.example/marker.jpg", mimeType: "image/jpeg",
        byteSize: 100, metadata: { source: "camera" },
      }],
    };

    await expect(service.createMarker("session-1", "user-1", payload)).resolves.toMatchObject({
      id: "marker-1",
      uploadAck: { accepted: true, duplicate: true, serverMarkerId: "marker-1" },
    });
    await expect(service.createMarker("session-1", "user-1", {
      ...payload,
      note: "同一个 ID 却换了新备注",
    })).rejects.toThrow("clientMarkerId 已存在，但上传内容与服务器记录不一致");
    expect(prisma.campusMapCollectionMarker.create).not.toHaveBeenCalled();
  });

  it("does not write a marker when cancellation wins the task lock", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      taskId: "task-cancelled",
      status: "recording",
      task: { regionId: "region-1" },
    });
    prisma.campusMapCollectionMarker.findUnique.mockResolvedValue(null);
    prisma.campusMapMarkerTemplate.findFirst.mockResolvedValue({
      id: "template-1",
      label: "路口",
      icon: null,
      color: null,
      behavior: "note",
      fieldSchema: [],
      requirePhoto: false,
      requireNote: false,
      requireStationarySample: false,
      allowedBindings: { targetTypes: [], relationTypes: [] },
    });
    prisma.campusMapCollectionTask.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.createMarker("session-1", "rider-1", {
      clientMarkerId: "marker-after-cancel",
      templateId: "template-1",
      recordedAt: "2026-08-26T01:00:10.000Z",
      longitude: 106.5,
      latitude: 29.6,
      accuracy: 5,
      fieldValues: {},
      bindings: [],
      attachments: [],
    })).rejects.toThrow("采集任务已取消或状态已变化");
    expect(prisma.campusMapCollectionMarker.create).not.toHaveBeenCalled();
  });

  it("rejects a marker whose required custom field is missing", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: "session-1",
      collectorUserId: "user-1",
      status: "recording",
      task: { regionId: "region-1" },
    });
    prisma.campusMapCollectionMarker.findUnique.mockResolvedValue(null);
    prisma.campusMapMarkerTemplate.findFirst.mockResolvedValue({
      id: "template-1",
      label: "道路障碍",
      behavior: "barrier",
      fieldSchema: [
        {
          key: "passable",
          type: "select",
          label: "是否可通行",
          required: true,
          options: ["可以", "不可以"],
        },
      ],
      requirePhoto: false,
      requireNote: false,
      requireStationarySample: false,
      allowedBindings: { targetTypes: [], relationTypes: [] },
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(
      service.createMarker("session-1", "user-1", {
        clientMarkerId: "client-marker-1",
        templateId: "template-1",
        recordedAt: "2026-08-09T01:10:00.000Z",
        longitude: 106.5,
        latitude: 29.6,
        accuracy: 5,
        fieldValues: {},
        bindings: [],
        attachments: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campusMapCollectionMarker.create).not.toHaveBeenCalled();
  });

  it("creates a scoped task with unique collector assignments", async () => {
    const prisma = makeTransactional();
    prisma.regionRider.findMany.mockResolvedValue([
      { userId: "user-1" },
      { userId: "user-2" },
    ]);
    prisma.campusMapCollectionTask.create.mockImplementation(
      ({ data }: any) => ({ id: "task-1", ...data }),
    );
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.createTask(
      "region-1",
      {
        name: "一期步行道路采集",
        instructions: "从第三校门走到图书馆",
        status: "ready",
        collectorUserIds: ["user-1", "user-1", "user-2"],
        allowedClients: ["rider_app"],
        objectTypes: ["road", "entrance"],
        priority: 2,
        dueAt: "2026-08-20T12:00:00.000Z",
      },
      "admin-1",
    );

    expect(result).toMatchObject({
      id: "task-1",
      regionId: "region-1",
      status: "ready",
    });
    expect(prisma.campusMapCollectionTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        regionId: "region-1",
        name: "一期步行道路采集",
        allowedClients: ["rider_app"],
        objectTypes: ["road", "entrance"],
        boundary: undefined,
        priority: 2,
        dueAt: new Date("2026-08-20T12:00:00.000Z"),
        createdBy: "admin-1",
        assignments: {
          create: [
            { userId: "user-1", assignedBy: "admin-1" },
            { userId: "user-2", assignedBy: "admin-1" },
          ],
        },
      }),
      include: expect.any(Object),
    });
  });

  it("rejects a rider-only task when an assignee is not an approved official rider in the region", async () => {
    const prisma = createPrisma();
    prisma.regionRider.findMany.mockResolvedValue([{ userId: "user-1" }]);
    const service = new CampusMapCollectionService(prisma as any);

    await expect(
      service.createTask(
        "region-1",
        {
          name: "一期道路采集",
          status: "ready",
          collectorUserIds: ["user-1", "part-time-user"],
          allowedClients: ["rider_app"],
          objectTypes: ["road"],
        },
        "admin-1",
      ),
    ).rejects.toThrow("采集人员必须是本区域已审核的官方骑手");
    expect(prisma.campusMapCollectionTask.create).not.toHaveBeenCalled();
  });

  it("updates professional task fields without reverting them to legacy defaults", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      regionId: "region-1",
      name: "旧任务",
      instructions: null,
      status: "draft",
      allowedClients: ["rider_app"],
      objectTypes: ["road"],
      boundary: null,
      priority: 3,
      dueAt: null,
      assignments: [{ userId: "rider-1" }],
    });
    prisma.regionRider.findMany.mockResolvedValue([{ userId: "rider-1" }]);
    prisma.campusMapCollectionTask.update.mockResolvedValue({ id: "task-1" });
    const service = new CampusMapCollectionService(prisma as any);

    await service.updateTask(
      "region-1",
      "task-1",
      {
        name: "道路与入口补采",
        status: "ready",
        collectorUserIds: ["rider-1"],
        allowedClients: ["rider_app"],
        objectTypes: ["road", "entrance"],
        priority: 1,
        dueAt: "2026-08-21T12:00:00.000Z",
      },
      "admin-1",
    );

    expect(prisma.campusMapCollectionTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          allowedClients: ["rider_app"],
          objectTypes: ["road", "entrance"],
          boundary: undefined,
          priority: 1,
          dueAt: new Date("2026-08-21T12:00:00.000Z"),
        }),
      }),
    );
  });

  it("rejects a stale admin edit instead of reviving a task changed by collection or review", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      regionId: "region-1",
      name: "现场采集",
      instructions: null,
      status: "review",
      taskType: "route_collection",
      allowedClients: ["rider_app"],
      objectTypes: ["road"],
      targetPlaceIds: [],
      boundary: null,
      priority: 1,
      dueAt: null,
      updatedAt: new Date("2026-08-26T01:00:00.000Z"),
      assignments: [{ userId: "rider-1" }],
      sessions: [],
    });
    prisma.regionRider.findMany.mockResolvedValue([{ userId: "rider-1" }]);
    prisma.campusMapCollectionTask.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.updateTask(
      "region-1", "task-1", { name: "过期的名称修改" }, "admin-1",
    )).rejects.toThrow("采集任务已被其他操作更新");
    expect(prisma.campusMapCollectionTask.update).not.toHaveBeenCalled();
  });

  it("protects task structure and completion while collection sessions exist, but cancellation closes active leases", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      regionId: "region-1",
      name: "现场路线采集",
      instructions: null,
      status: "collecting",
      taskType: "route_collection",
      allowedClients: ["rider_app"],
      objectTypes: ["road"],
      targetPlaceIds: [],
      boundary: null,
      priority: 1,
      dueAt: null,
      assignments: [{ userId: "rider-1" }],
      sessions: [{ id: "session-1", status: "recording" }],
    });
    prisma.regionRider.findMany.mockResolvedValue([{ userId: "rider-1" }]);
    prisma.campusMapCollectionTask.findUnique.mockResolvedValue({ id: "task-1", status: "cancelled" });
    const service = new CampusMapCollectionService(prisma as any);
    await expect(service.updateTask(
      "region-1", "task-1", { objectTypes: ["place_verification"] }, "admin-1",
    )).rejects.toThrow("不能再修改类型、地点、采集人或采集范围");
    await expect(service.updateTask(
      "region-1", "task-1", { status: "completed" }, "admin-1",
    )).rejects.toThrow("由系统标记完成");
    await expect(service.updateTask(
      "region-1", "task-1", { status: "cancelled" }, "admin-1",
    )).resolves.toMatchObject({ status: "cancelled" });
    expect(prisma.campusMapCollectionTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "task-1",
        regionId: "region-1",
        status: { notIn: ["completed", "cancelled"] },
      },
      data: expect.objectContaining({ status: "cancelled" }),
    }));
    expect(prisma.campusMapCollectionSession.updateMany).toHaveBeenCalledWith({
      where: {
        taskId: "task-1",
        status: { in: ["recording", "paused", "uploading", "finishing"] },
      },
      data: {
        status: "abandoned",
        endedAt: expect.any(Date),
        uploadComplete: false,
        activeKey: null,
      },
    });
    expect(prisma.campusMapCollectionTask.update).not.toHaveBeenCalled();
  });

  it("clears an existing task deadline when the admin submits null", async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: "task-1",
      regionId: "region-1",
      name: "道路采集",
      instructions: null,
      status: "draft",
      allowedClients: ["rider_app"],
      objectTypes: ["road"],
      boundary: null,
      priority: 3,
      dueAt: new Date("2026-08-21T12:00:00.000Z"),
      assignments: [{ userId: "rider-1" }],
    });
    prisma.regionRider.findMany.mockResolvedValue([{ userId: "rider-1" }]);
    prisma.campusMapCollectionTask.update.mockResolvedValue({ id: "task-1" });
    const service = new CampusMapCollectionService(prisma as any);

    await service.updateTask(
      "region-1",
      "task-1",
      { dueAt: null },
      "admin-1",
    );

    expect(prisma.campusMapCollectionTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dueAt: null }),
      }),
    );
  });

  it("validates template behavior before persisting custom fields and bindings", async () => {
    const prisma = createPrisma();
    prisma.campusMapMarkerTemplate.create.mockImplementation(
      ({ data }: any) => ({ id: "template-1", ...data }),
    );
    const service = new CampusMapCollectionService(prisma as any);
    const dto = {
      label: "雨天积水",
      behavior: "passability_change",
      fieldSchema: [{ key: "depth", type: "number", label: "积水深度" }],
      allowedBindings: {
        targetTypes: ["road"],
        relationTypes: ["affects"],
      },
      color: "#eab308",
    };

    await expect(
      service.createTemplate(
        "region-1",
        { ...dto, behavior: "guess_route" },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createTemplate(
        "region-1",
        {
          ...dto,
          fieldSchema: [{ key: "bad key", type: "magic", label: "" }],
        },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const result = await service.createTemplate("region-1", dto, "admin-1");

    expect(result).toMatchObject({
      id: "template-1",
      label: "雨天积水",
      behavior: "passability_change",
    });
    expect(prisma.campusMapMarkerTemplate.create).toHaveBeenCalledTimes(1);
  });
});
