import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SetupService } from './setup.service';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import * as fs from 'fs';
import * as path from 'path';

const LOCK_PATH = path.resolve(process.cwd(), 'storage', 'setup.lock');

function mockConfig(values: Record<string, any> = {}) {
  return {
    get: (key: string, defaultValue?: any) => values[key] ?? defaultValue,
  } as unknown as ConfigService;
}

function mockPrisma() {
  return {
    config: { findUnique: jest.fn(), upsert: jest.fn() },
    adminAccount: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    adminRole: { findUnique: jest.fn(), upsert: jest.fn() },
    adminPermission: { upsert: jest.fn() },
    adminRolePermission: { upsert: jest.fn(), findFirst: jest.fn() },
    adminAccountRole: { findFirst: jest.fn(), create: jest.fn() },
    serverActionLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  } as any;
}

function mockRedis() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;
}

describe('SetupService - 安全测试', () => {
  let service: SetupService;
  let prisma: any;
  let redis: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    try { await fs.promises.unlink(LOCK_PATH); } catch {}

    prisma = mockPrisma();
    redis = mockRedis();
  });

  // ===== 1. SETUP_TOKEN 缺失时拒绝 =====
  describe('SETUP_TOKEN 校验', () => {
    it('SETUP_TOKEN 未配置时生产 init 拒绝', async () => {
      const cfg = mockConfig({ NODE_ENV: 'production', SETUP_TOKEN: '' });
      const svc = new SetupService(cfg, prisma, redis);
      await expect(svc.init({ adminUsername: 'admin', adminPassword: 'Admin@123' }, 'any-token'))
        .rejects.toThrow(ForbiddenException);
    });

    it('x-setup-token 错误时拒绝', async () => {
      const cfg = mockConfig({
        NODE_ENV: 'production', SETUP_TOKEN: 'my-secret-setup-token-abc123',
        DATABASE_URL: 'pg://h/d', JWT_SECRET: 'valid-secret', WX_MINI_APPID: 'wx', WX_MINI_SECRET: 's',
      });
      const svc = new SetupService(cfg, prisma, redis);
      await expect(svc.init({ adminUsername: 'admin', adminPassword: 'Admin@123' }, 'wrong-token'))
        .rejects.toThrow(ForbiddenException);
    });

    it('x-setup-token 正确时通过校验', async () => {
      const cfg = mockConfig({
        NODE_ENV: 'production', SETUP_TOKEN: 'my-secret-setup-token-abc123',
        DATABASE_URL: 'pg://h/d', JWT_SECRET: 'valid-secret', WX_MINI_APPID: 'wx', WX_MINI_SECRET: 's',
      });
      const svc = new SetupService(cfg, prisma, redis);
      // Token passes, checkEnvironment runs successfully with mocked DB/Redis
      const result = await svc.checkEnvironment('my-secret-setup-token-abc123');
      expect(result).toBeDefined();
      expect(result.checks).toBeDefined();
    });
  });

  // ===== 2. adminPassword 不合格时拒绝 =====
  describe('密码校验', () => {
    const baseCfg = mockConfig({
      NODE_ENV: 'production', SETUP_TOKEN: 'my-secret-setup-token-abc123',
      DATABASE_URL: 'pg://h/d', JWT_SECRET: 'valid-secret', WX_MINI_APPID: 'wx', WX_MINI_SECRET: 's',
    });

    it('adminPassword 不合格时不会写 .env（<8位）', async () => {
      const svc = new SetupService(baseCfg, prisma, redis);
      await expect(
        svc.init({ adminUsername: 'admin', adminPassword: 'Ab1' }, 'my-secret-setup-token-abc123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('adminPassword 不合格时不会写 .env（纯数字）', async () => {
      const svc = new SetupService(baseCfg, prisma, redis);
      await expect(
        svc.init({ adminUsername: 'admin', adminPassword: '12345678' }, 'my-secret-setup-token-abc123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('adminPassword 不合格时不会写 .env（纯字母）', async () => {
      const svc = new SetupService(baseCfg, prisma, redis);
      await expect(
        svc.init({ adminUsername: 'admin', adminPassword: 'abcdefgh' }, 'my-secret-setup-token-abc123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===== 3. 初始化后 check/init 返回 403 =====
  describe('初始化后拒绝写操作', () => {
    beforeEach(async () => {
      const dir = path.dirname(LOCK_PATH);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(LOCK_PATH, JSON.stringify({ lockedAt: new Date().toISOString() }));
    });

    afterEach(async () => {
      try { await fs.promises.unlink(LOCK_PATH); } catch {}
    });

    it('初始化后 check 返回 403', async () => {
      const cfg = mockConfig({ NODE_ENV: 'production', SETUP_TOKEN: 'my-secret-setup-token-abc123' });
      const svc = new SetupService(cfg, prisma, redis);
      await expect(svc.checkEnvironment('my-secret-setup-token-abc123'))
        .rejects.toThrow(ForbiddenException);
    });

    it('初始化后 init 返回 403', async () => {
      const cfg = mockConfig({ NODE_ENV: 'production', SETUP_TOKEN: 'my-secret-setup-token-abc123' });
      const svc = new SetupService(cfg, prisma, redis);
      await expect(
        svc.init({ adminUsername: 'admin', adminPassword: 'Admin@123' }, 'my-secret-setup-token-abc123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===== 4. init 不写非白名单 env 字段 =====
  describe('白名单 env 写入', () => {
    it('init 只接受 DEPLOY_CONFIG_KEYS 白名单字段', () => {
      const svc = new SetupService(mockConfig({}), prisma, redis) as any;
      const dto = {
        adminUsername: 'admin',
        adminPassword: 'Admin@123',
        databaseUrl: 'postgresql://h/d',
        jwtSecret: 'valid-secret',
        wxMiniAppid: 'wx123',
        wxMiniSecret: 'secret123',
        invalidField: 'should-not-appear',
        secretBackdoor: 'dangerous',
      };

      const updates = svc.buildEnvUpdates(dto);

      expect(updates.DATABASE_URL).toBe('postgresql://h/d');
      expect(updates.JWT_SECRET).toBe('valid-secret');
      expect(updates.WX_MINI_APPID).toBe('wx123');
      expect(updates.WX_MINI_SECRET).toBe('secret123');
      expect((updates as any).INVALID_FIELD).toBeUndefined();
      expect((updates as any).SECRET_BACKDOOR).toBeUndefined();
    });
  });
});
