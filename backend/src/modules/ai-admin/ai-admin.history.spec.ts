import { AiAdminService } from './ai-admin.service';
describe('AI config history credential boundary', () => {
  it('selects only safe history columns and masks legacy maskedValue defensively', async () => {
    const prisma = { aiConfigVersion: { findMany: jest.fn().mockResolvedValue([{ id: 'version', value: { apiKey: 'raw-secret' }, maskedValue: { apiKey: 'legacy-secret', model: 'test-model' } }]), count: jest.fn().mockResolvedValue(1) } };
    const service = new AiAdminService(prisma as any, {} as any, {} as any);
    const result = await service.getConfigVersions({});
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(prisma.aiConfigVersion.findMany.mock.calls[0][0].select.value).toBeUndefined();
  });
  it('rolls settings back while preserving the current API key', async () => {
    const prisma = { config: { findUnique: jest.fn().mockResolvedValue({ value: { apiKey: 'current-secret' } }), upsert: jest.fn() }, aiConfigVersion: { findUnique: jest.fn().mockResolvedValue({ configKey: 'ai_ops_config', version: 1, value: { apiKey: 'old-secret', model: 'old-model' } }), findFirst: jest.fn().mockResolvedValue({ version: 2 }), create: jest.fn().mockResolvedValue({}) } };
    await new AiAdminService(prisma as any, {} as any, {} as any).rollbackConfigVersion('v1', 'admin');
    expect(prisma.config.upsert.mock.calls[0][0].update.value.apiKey).toBe('current-secret');
    expect(JSON.stringify(prisma.aiConfigVersion.create.mock.calls)).not.toContain('secret');
  });
});
