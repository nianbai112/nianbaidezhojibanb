import { Test, TestingModule } from "@nestjs/testing";
import { NotImplementedException } from "@nestjs/common";
import { CircleService } from "./circle.service";
import { PrismaService } from "../../common/services/prisma.service";
import { MallService } from "../mall/mall.service";

describe("CircleService - 核心功能", () => {
  let circleService: CircleService;

  const mockCircleFindMany = jest.fn().mockResolvedValue([]);
  const mockCircleFindUnique = jest.fn();
  const mockCircleCreate = jest.fn();
  const mockCircleUpdate = jest.fn();
  const mockCircleCount = jest.fn().mockResolvedValue(0);
  const mockMemberFindMany = jest.fn().mockResolvedValue([]);
  const mockMemberFindUnique = jest.fn();
  const mockMemberCreate = jest.fn();
  const mockMemberDelete = jest.fn();
  const mockMemberCount = jest.fn().mockResolvedValue(0);
  const mockMemberUpdate = jest.fn();
  const mockTopicGroupFindMany = jest.fn().mockResolvedValue([]);
  const mockTopicGroupDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const mockConversationFindFirst = jest.fn().mockResolvedValue(null);
  const mockConversationCreate = jest.fn();
  const mockConversationMemberCreate = jest.fn();

  const mockPrisma: any = {
    circle: {
      findMany: mockCircleFindMany,
      findUnique: mockCircleFindUnique,
      create: mockCircleCreate,
      update: mockCircleUpdate,
      count: mockCircleCount,
    },
    circleMember: {
      findMany: mockMemberFindMany,
      findUnique: mockMemberFindUnique,
      create: mockMemberCreate,
      delete: mockMemberDelete,
      update: mockMemberUpdate,
      count: mockMemberCount,
    },
    circleTopicGroup: {
      findMany: mockTopicGroupFindMany,
      deleteMany: mockTopicGroupDeleteMany,
    },
    conversation: {
      findFirst: mockConversationFindFirst,
      create: mockConversationCreate,
    },
    conversationMember: {
      create: mockConversationMemberCreate,
    },
    $transaction: jest.fn((fn: Function) => fn(mockPrisma)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircleService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    circleService = module.get<CircleService>(CircleService);
  });

  it("inviteMember 应正常邀请成员", async () => {
    mockMemberFindUnique.mockResolvedValue(null);
    mockMemberCreate.mockResolvedValue({ id: "cm-1" });

    const result = await circleService.inviteMember("circle-1", "user-1", { inviteeId: "user-2" });
    expect(result.success).toBe(true);
    expect(mockMemberCreate).toHaveBeenCalled();
    expect(mockCircleUpdate).toHaveBeenCalled();
  });

  it("createGroupChat 应创建群聊", async () => {
    mockCircleFindUnique.mockResolvedValue({ id: "circle-1", name: "测试圈子", members: [{ userId: "user-1" }] });
    mockConversationCreate.mockResolvedValue({ id: "conv-1" });

    const result = await circleService.createGroupChat("circle-1", "user-1", {}, {});
    expect(result.id).toBe("conv-1");
    expect(mockConversationCreate).toHaveBeenCalled();
  });

  it("getPendingMembers 应返回成员列表", async () => {
    mockMemberFindMany.mockResolvedValue([{ id: "cm-1", userId: "user-1" }]);

    const result = await circleService.getPendingMembers("circle-1", {});
    expect(Array.isArray(result)).toBe(true);
  });

  it("auditMember 应审核成员", async () => {
    mockMemberFindUnique.mockResolvedValue({ id: "member-1", circleId: "circle-1" });

    const result = await circleService.auditMember("circle-1", "member-1", "user-1", { status: "approved" });
    expect(result.success).toBe(true);
    expect(mockMemberUpdate).toHaveBeenCalled();
  });

  it("search 应返回搜索结果", async () => {
    mockCircleFindMany.mockResolvedValue([{ id: "circle-1", name: "测试" }]);

    const result = await circleService.search({ keyword: "test" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("getHotKeywords 应返回热门关键词", async () => {
    const result = await circleService.getHotKeywords({});
    expect(result.keywords).toBeDefined();
    expect(Array.isArray(result.keywords)).toBe(true);
  });

  it("join 应正常落库（非假成功）", async () => {
    mockCircleFindUnique.mockResolvedValue({ id: "circle-1", memberCount: 5 });
    mockMemberFindUnique.mockResolvedValue(null);
    mockMemberCreate.mockResolvedValue({ id: "cm-1" });

    const result = await circleService.join("circle-1", "user-1");
    expect(result.success).toBe(true);
    expect(mockMemberCreate).toHaveBeenCalled();
    expect(mockCircleUpdate).toHaveBeenCalled();
  });
});

describe("MallService - 未实现功能抛出异常", () => {
  let mallService: MallService;

  const mockPrisma: any = {
    mallBanner: { findMany: jest.fn().mockResolvedValue([]) },
    mallCategory: { findMany: jest.fn().mockResolvedValue([]) },
    mallProduct: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    mallMerchant: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    mallCart: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    mallOrder: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    mallPromotion: { findMany: jest.fn().mockResolvedValue([]) },
    favorite: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    product: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: Function) => fn(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MallService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    mallService = module.get<MallService>(MallService);
  });

  it("addFavorite 应正常落库（非假成功）", async () => {
    mockPrisma.favorite.findFirst.mockResolvedValue(null);
    mockPrisma.favorite.create.mockResolvedValue({
      id: "fav-1",
      targetId: "p-1",
    });
    const result = await mallService.addFavorite("user-1", {
      product_id: "p-1",
    });
    expect(result.id).toBe("fav-1");
    expect(mockPrisma.favorite.create).toHaveBeenCalledWith({
      data: { userId: "user-1", targetType: "product", targetId: "p-1" },
    });
  });

  it("getFavorites 应返回商品收藏列表（非假成功）", async () => {
    mockPrisma.favorite.findMany.mockResolvedValue([
      { id: "fav-1", targetId: "p-1" },
    ]);
    mockPrisma.favorite.count.mockResolvedValue(1);
    mockPrisma.product.findMany.mockResolvedValue([
      { id: "p-1", name: "商品" },
    ]);
    const result = await mallService.getFavorites("user-1", {});
    expect(result.total).toBe(1);
    expect(result.list[0].product?.name).toBe("商品");
  });

  it("removeFavorite 应正常删除（非假成功）", async () => {
    mockPrisma.favorite.findFirst.mockResolvedValue({ id: "fav-1" });
    mockPrisma.favorite.delete.mockResolvedValue({ id: "fav-1" });
    const result = await mallService.removeFavorite("p-1", "user-1");
    expect(result.success).toBe(true);
    expect(mockPrisma.favorite.delete).toHaveBeenCalledWith({
      where: { id: "fav-1" },
    });
  });

  it("removeCartItem 应正常落库（非假成功）", async () => {
    mockPrisma.mallCart.deleteMany.mockResolvedValue({ count: 1 });
    const result = await mallService.removeCartItem("cart-1", "user-1");
    expect(result.success).toBe(true);
    expect(mockPrisma.mallCart.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cart-1", userId: "user-1" } }),
    );
  });
});
