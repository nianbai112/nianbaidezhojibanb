import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../../common/services/redis.service";
import { PrismaService } from "../../common/services/prisma.service";
import { UploadService } from "./upload.service";
import axios from "axios";

/** 构造一个模拟的 Multer 文件对象 */
function makeFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "test.jpg",
    encoding: "7bit",
    mimetype: "image/jpeg",
    buffer: Buffer.from("fake-image-data"),
    size: 1024,
    ...overrides,
  } as Express.Multer.File;
}

/** 返回包含完整 COS + WX 配置的 ConfigService mock */
function makeConfig(overrides: Record<string, any> = {}): ConfigService {
  const values: Record<string, any> = {
    COS_SECRET_ID: "test-id",
    COS_SECRET_KEY: "test-key",
    COS_BUCKET: "test-bucket",
    COS_REGION: "ap-guangzhou",
    COS_DOMAIN: "https://cdn.example.com",
    UPLOAD_IMAGE_MAX_SIZE_MB: 10,
    UPLOAD_VIDEO_MAX_SIZE_MB: 100,
    WX_MINI_APPID: "wx-test-appid",
    WX_MINI_SECRET: "wx-test-secret",
    ...overrides,
  };
  return { get: (key: string) => values[key] } as ConfigService;
}

/** RedisService mock */
function makeRedis(): RedisService {
  return {
    get: jest.fn().mockResolvedValue(null), // 默认无缓存
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    getLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn(),
    lpush: jest.fn(),
    brpop: jest.fn(),
    hset: jest.fn(),
    hget: jest.fn(),
    hdel: jest.fn(),
    hgetall: jest.fn(),
    zadd: jest.fn(),
    zincrby: jest.fn(),
    zrevrange: jest.fn(),
    zrem: jest.fn(),
    getClient: jest.fn(),
  } as unknown as RedisService;
}

function makePrisma(value: Record<string, any> | null = null): PrismaService {
  return {
    config: {
      findUnique: jest.fn().mockResolvedValue(value ? { value } : null),
    },
  } as unknown as PrismaService;
}

// 劫持 cos-nodejs-sdk-v5
jest.mock("cos-nodejs-sdk-v5", () => {
  const mock = jest.fn().mockImplementation(() => ({
    putObject: jest.fn((_params: any, cb: any) => {
      cb(null, {
        statusCode: 200,
        Location: "https://cdn.example.com/test-key",
      });
    }),
  }));
  return mock;
});

// 劫持 axios
jest.mock("axios");
const mockAxios = axios as jest.Mocked<typeof axios>;

describe("UploadService", () => {
  let service: UploadService;
  let mockCOS: any;
  let redis: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockCOS = require("cos-nodejs-sdk-v5");
    mockCOS.mockImplementation(() => ({
      putObject: jest.fn((_params: any, cb: any) => {
        cb(null, {
          statusCode: 200,
          Location: "https://cdn.example.com/test-key",
        });
      }),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: ConfigService, useValue: makeConfig() },
        { provide: RedisService, useValue: makeRedis() },
        { provide: PrismaService, useValue: makePrisma() },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    redis = module.get<RedisService>(RedisService);

    // 默认 axios mock：成功的 getwxacodeunlimit 响应（返回假图片 buffer）
    mockAxios.get.mockResolvedValue({
      data: { access_token: "mock_access_token", expires_in: 7200 },
    });
    mockAxios.post.mockResolvedValue({
      data: Buffer.from(
        "mock-qrcode-jpeg-data-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      ),
      headers: { "content-type": "image/jpeg" },
    });
  });

  // ============ 空文件校验 ============
  it("should reject null file", async () => {
    await expect(
      service.upload(null as any, { type: "image", folder: "test" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("should reject file with no buffer", async () => {
    const file = makeFile({ buffer: undefined, size: 100 });
    await expect(
      service.upload(file, { type: "image", folder: "test" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("should reject zero-size file", async () => {
    const file = makeFile({ size: 0 });
    await expect(
      service.upload(file, { type: "image", folder: "test" }),
    ).rejects.toThrow(BadRequestException);
  });

  // ============ 图片格式校验 ============
  it("should accept valid JPG image", async () => {
    const result = await service.upload(makeFile({ mimetype: "image/jpeg" }), {
      type: "image",
      folder: "test",
    });
    expect(result.url).toContain("https://");
    expect(result.type).toBe("image");
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("should reject unsupported image MIME", async () => {
    await expect(
      service.upload(makeFile({ mimetype: "image/bmp" }), {
        type: "image",
        folder: "test",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ============ COS 配置缺失 ============
  it("should throw BadRequestException when COS_SECRET_ID missing", async () => {
    const badModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: makeConfig({ COS_SECRET_ID: undefined }),
        },
        { provide: RedisService, useValue: makeRedis() },
        { provide: PrismaService, useValue: makePrisma() },
      ],
    }).compile();
    const svc = badModule.get<UploadService>(UploadService);
    await expect(
      svc.upload(makeFile(), { type: "image", folder: "test" }),
    ).rejects.toThrow(BadRequestException);
  });

  // ============ 危险类型拦截 ============
  it("should reject HTML file", async () => {
    await expect(
      service.upload(makeFile({ mimetype: "text/html" }), {
        type: "image",
        folder: "test",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("should reject EXE by extension even if MIME forged", async () => {
    await expect(
      service.upload(
        makeFile({ mimetype: "image/jpeg", originalname: "virus.exe" }),
        { type: "image", folder: "test" },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ============ 安全 key ============
  it("should generate random key not using original filename", async () => {
    const result = await service.upload(
      makeFile({ originalname: "../../../etc/passwd.jpg" }),
      { type: "image", folder: "test" },
    );
    expect(result.key).not.toContain("passwd");
    expect(result.key).not.toContain("..");
    expect(result.key).toMatch(/^test\/\d+_[a-f0-9]{32}\.jpg$/);
  });

  // ============ 返回结构 ============
  it("should return complete UploadResult", async () => {
    const result = await service.upload(makeFile(), {
      type: "image",
      folder: "test",
    });
    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("key");
    expect(result).toHaveProperty("size");
    expect(result).toHaveProperty("mimeType");
    expect(result).toHaveProperty("type");
    expect(result.url).toMatch(/^https:\/\//);
  });

  // ============ 小程序码生成 ============

  describe("generateQrcode", () => {
    it("should reject missing scene", async () => {
      await expect(service.generateQrcode({ scene: "" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should reject scene over 32 chars", async () => {
      await expect(
        service.generateQrcode({ scene: "a".repeat(33) }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject width out of range", async () => {
      await expect(
        service.generateQrcode({ scene: "test", width: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw when WX_MINI_APPID missing", async () => {
      const badModule = await Test.createTestingModule({
        providers: [
          UploadService,
          {
            provide: ConfigService,
            useValue: makeConfig({ WX_MINI_APPID: undefined }),
          },
          { provide: RedisService, useValue: makeRedis() },
          { provide: PrismaService, useValue: makePrisma() },
        ],
      }).compile();
      const svc = badModule.get<UploadService>(UploadService);
      await expect(svc.generateQrcode({ scene: "test" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should use cached access_token", async () => {
      redis.get = jest.fn().mockResolvedValue("cached_token_abc");

      const result = await service.generateQrcode({
        scene: "test",
        page: "pages/index/index",
      });

      // 不应该调用微信 token 接口
      expect(mockAxios.get).not.toHaveBeenCalled();
      // 应该调用了 getwxacodeunlimit
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining(
          "wxa/getwxacodeunlimit?access_token=cached_token_abc",
        ),
        expect.objectContaining({ scene: "test", page: "pages/index/index" }),
        expect.any(Object),
      );
      expect(result.url).toContain("https://");
      expect(result.type).toBe("image");
      expect(result.mimeType).toBe("image/jpeg");
    });

    it("should fetch new token when cache miss", async () => {
      redis.get = jest.fn().mockResolvedValue(null);

      mockAxios.get.mockResolvedValueOnce({
        data: { access_token: "fresh_token_xyz", expires_in: 7200 },
      });

      const result = await service.generateQrcode({ scene: "somedata" });

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining("cgi-bin/token"),
        expect.objectContaining({
          params: expect.objectContaining({ grant_type: "client_credential" }),
        }),
      );
      expect(redis.set).toHaveBeenCalledWith(
        "wx:access_token:wx-test-appid",
        "fresh_token_xyz",
        6900,
      );
      expect(result.url).toContain("https://");
    });

    it("should handle WeChat API error", async () => {
      redis.get = jest.fn().mockResolvedValue(null);
      mockAxios.get.mockResolvedValueOnce({
        data: { errcode: 40013, errmsg: "invalid appid" },
      });

      await expect(service.generateQrcode({ scene: "test" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should handle WeChat qrcode JSON error response", async () => {
      redis.get = jest.fn().mockResolvedValue("valid_token");
      mockAxios.post.mockResolvedValueOnce({
        data: JSON.stringify({ errcode: 41030, errmsg: "page not found" }),
        headers: { "content-type": "application/json" },
      });

      await expect(
        service.generateQrcode({ scene: "test", page: "nonexistent" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject too-small buffer response", async () => {
      redis.get = jest.fn().mockResolvedValue("valid_token");
      mockAxios.post.mockResolvedValueOnce({
        data: Buffer.from("tiny"),
        headers: { "content-type": "image/jpeg" },
      });

      await expect(service.generateQrcode({ scene: "test" })).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
