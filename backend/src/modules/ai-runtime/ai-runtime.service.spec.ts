import { AiRuntimeService } from './ai-runtime.service';

/**
 * 审核"阀门"行为回归测试:
 * 1. AI 故障类(未配置/超时/解析失败)必须强制转人工,不受 manualFallback=false 影响
 * 2. AI 明确"拿不准"时,manualFallback=false 才允许按策略自动裁决
 * 3. reviewSampleRate 抽检比例只对 AI 放行内容生效
 */
describe('AiRuntimeService.moderateContent 阀门与抽检', () => {
  let prisma: any;
  let configService: any;
  let service: AiRuntimeService;

  const baseOpsConfig = {
    enabled: true,
    provider: 'deepseek',
    apiKey: 'sk-test-key',
    apiBaseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    reviewSampleRate: 0,
  };

  const setup = (opsValue: any = baseOpsConfig) => {
    prisma = {
      config: { findUnique: jest.fn().mockResolvedValue({ value: opsValue }) },
      sensitiveWord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    configService = { get: jest.fn().mockReturnValue(undefined) };
    service = new AiRuntimeService(prisma, configService);
  };

  const mockAiReply = (reply: any) =>
    jest.spyOn(service, 'callChatDetailed').mockResolvedValue({
      content: JSON.stringify(reply),
      callLogId: 'log-1',
    } as any);

  afterEach(() => jest.restoreAllMocks());

  it('AI 未配置时,即使 manualFallback=false 也必须转人工(故障安全)', async () => {
    setup({ enabled: false, apiKey: '' });
    const result = await service.moderateContent({
      type: 'post',
      content: '普通校园帖子',
      approvalType: 'ai',
      manualFallback: false,
    });
    expect(result.decision).toBe('manual');
    expect(result.fallbackType).toBe('ai_not_configured');
  });

  it('AI 调用超时时,即使 manualFallback=false 也必须转人工(故障安全)', async () => {
    setup();
    jest.spyOn(service, 'callChatDetailed').mockRejectedValue(
      Object.assign(new Error('AI 服务请求超时'), { errorCode: 'timeout', callLogId: 'log-err' }),
    );
    const result = await service.moderateContent({
      type: 'post',
      content: '普通校园帖子',
      approvalType: 'ai',
      manualFallback: false,
    });
    expect(result.decision).toBe('manual');
    expect(result.labels).toContain('ai_error');
  });

  it('AI 返回无法解析时,即使 manualFallback=false 也必须转人工(故障安全)', async () => {
    setup();
    jest.spyOn(service, 'callChatDetailed').mockResolvedValue({
      content: '这不是JSON',
      callLogId: 'log-2',
    } as any);
    const result = await service.moderateContent({
      type: 'post',
      content: '普通校园帖子',
      approvalType: 'ai',
      manualFallback: false,
    });
    expect(result.decision).toBe('manual');
    expect(result.fallbackType).toBe('parse_failed');
  });

  it('AI 明确"拿不准"且 manualFallback=false 时,按策略自动裁决(低分自动通过)', async () => {
    setup();
    mockAiReply({ decision: 'manual', reason: '内容边界模糊', labels: [], score: 0.3 });
    const result = await service.moderateContent({
      type: 'post',
      content: '普通校园帖子',
      approvalType: 'ai',
      manualFallback: false,
    });
    expect(result.decision).toBe('approve');
    expect(result.labels).toContain('no_manual_fallback');
  });

  it('AI 明确"拿不准"且 manualFallback=false 时,高分/高危自动拒绝', async () => {
    setup();
    mockAiReply({ decision: 'manual', reason: '疑似诈骗引流', labels: ['fraud'], score: 0.8 });
    const result = await service.moderateContent({
      type: 'post',
      content: '加微信领红包',
      approvalType: 'ai',
      manualFallback: false,
    });
    expect(result.decision).toBe('reject');
  });

  it('AI 明确"拿不准"且 manualFallback=true 时,保持转人工', async () => {
    setup();
    mockAiReply({ decision: 'manual', reason: '内容边界模糊', labels: [], score: 0.3 });
    const result = await service.moderateContent({
      type: 'post',
      content: '普通校园帖子',
      approvalType: 'ai',
      manualFallback: true,
    });
    expect(result.decision).toBe('manual');
  });

  it('reviewSampleRate=100 时,AI 放行的内容全部转人工抽检', async () => {
    setup({ ...baseOpsConfig, reviewSampleRate: 100 });
    mockAiReply({ decision: 'approve', reason: '内容正常', labels: [], score: 0.05 });
    const result = await service.moderateContent({
      type: 'post',
      content: '普通校园帖子',
      approvalType: 'ai',
      manualFallback: false,
    });
    expect(result.decision).toBe('manual');
    expect(result.labels).toContain('random_sampling');
    expect(result.fallbackType).toBe('random_sampling');
  });

  it('reviewSampleRate=0 时,AI 放行直接通过', async () => {
    setup();
    mockAiReply({ decision: 'approve', reason: '内容正常', labels: [], score: 0.05 });
    const result = await service.moderateContent({
      type: 'post',
      content: '普通校园帖子',
      approvalType: 'ai',
      manualFallback: false,
    });
    expect(result.decision).toBe('approve');
  });

  it('reviewSampleRate 只影响 approve,AI 拒绝不受影响', async () => {
    setup({ ...baseOpsConfig, reviewSampleRate: 100 });
    mockAiReply({ decision: 'reject', reason: '色情低俗', labels: ['porn'], score: 0.95 });
    const result = await service.moderateContent({
      type: 'post',
      content: '违规内容',
      approvalType: 'ai',
      manualFallback: false,
    });
    expect(result.decision).toBe('reject');
    expect(result.labels).not.toContain('random_sampling');
  });

  it('reviewSampleRate 配置越界时被钳制到 0-100', async () => {
    setup({ ...baseOpsConfig, reviewSampleRate: 999 });
    const config = await service.getRuntimeConfig();
    expect(config.reviewSampleRate).toBe(100);
  });

  it('带图内容使用多模态消息并留下图片审核证据', async () => {
    setup({ ...baseOpsConfig, model: 'deepseek-v4-flash-vision-exp' });
    const call = mockAiReply({ decision: 'reject', reason: '图片包含违规内容', labels: ['illegal'], score: 0.95 });

    const result = await service.moderateContent({
      type: 'post',
      content: '你好',
      imageUrls: ['https://cdn.example.com/risk.jpg'],
      approvalType: 'ai',
      manualFallback: false,
    });

    const [messages, options] = call.mock.calls[0];
    expect(options).toEqual(expect.objectContaining({ source: 'content_review_multimodal' }));
    expect(messages[1].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text' }),
      { type: 'image_url', image_url: { url: 'https://cdn.example.com/risk.jpg' } },
    ]));
    expect(result.decision).toBe('reject');
    expect(result.labels).toEqual(expect.arrayContaining(['image_reviewed', 'multimodal_review']));
  });

  it('带图内容返回无法解析时必须转人工而不是按文字放行', async () => {
    setup({ ...baseOpsConfig, model: 'deepseek-v4-flash-vision-exp' });
    jest.spyOn(service, 'callChatDetailed').mockResolvedValue({ content: '', callLogId: 'log-image-empty' } as any);

    const result = await service.moderateContent({
      type: 'post',
      content: '你好',
      imageUrls: ['https://cdn.example.com/unknown.jpg'],
      approvalType: 'ai',
      manualFallback: false,
    });

    expect(result.decision).toBe('manual');
    expect(result.labels).toContain('image_review_failed');
    expect(result.fallbackType).toBe('parse_failed');
  });

  it('图片地址无法提供给模型时必须转人工', async () => {
    setup({ ...baseOpsConfig, model: 'deepseek-v4-flash-vision-exp' });
    const call = jest.spyOn(service, 'callChatDetailed');

    const result = await service.moderateContent({
      type: 'post',
      content: '你好',
      imageUrls: ['/uploads/private.jpg'],
      approvalType: 'ai',
      manualFallback: false,
    });

    expect(result.decision).toBe('manual');
    expect(result.fallbackType).toBe('image_unreachable');
    expect(call).not.toHaveBeenCalled();
  });
});


describe('AiRuntimeService private conversation logging', () => {
  afterEach(() => jest.restoreAllMocks());
  function setupPrivate(riskControl = {}) {
    const prisma: any = {
      config: { findUnique: jest.fn().mockResolvedValue({ value: { enabled: true, provider: 'deepseek', apiKey: 'fixture-key', apiBaseUrl: 'https://example.invalid/v1', model: 'test', riskControl } }) },
      aiCallLog: { create: jest.fn().mockResolvedValue({ id: 'private-log' }), update: jest.fn().mockResolvedValue({}) },
      aiQuotaUsage: { upsert: jest.fn().mockResolvedValue({}), aggregate: jest.fn() },
    };
    return { prisma, service: new AiRuntimeService(prisma, { get: jest.fn() } as any) };
  }
  it('keeps private prompts and answers out of common call logs', async () => {
    const { service, prisma } = setupPrivate();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'PRIVATE_ANSWER_FIXTURE' } }], usage: { total_tokens: 12 } }) } as any);
    const result = await service.callChatDetailed([{ role: 'user', content: 'PRIVATE_PROMPT_FIXTURE' }], { privateContent: true });
    expect(result.content).toBe('PRIVATE_ANSWER_FIXTURE');
    const logText = JSON.stringify([prisma.aiCallLog.create.mock.calls, prisma.aiCallLog.update.mock.calls]);
    expect(logText).not.toContain('PRIVATE_PROMPT_FIXTURE');
    expect(logText).not.toContain('PRIVATE_ANSWER_FIXTURE');
  });
  it.each([0, 500, undefined])('sends the correct output limit for %s without turning zero into a default', async (maxTokens) => {
    const { service } = setupPrivate();
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'fixture' }, finish_reason: 'length' }], usage: { total_tokens: 12 } }) } as any);
    const result = await service.callChatDetailed([{ role: 'user', content: 'fixture' }], { maxTokens, taskId: 'job-fixture' });
    const payload = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    if (maxTokens === 0) expect(payload).not.toHaveProperty('max_tokens');
    else expect(payload.max_tokens).toBe(maxTokens ?? 1000);
    expect(result.finishReason).toBe('length');
  });
  it('redacts provider errors that echo private input', async () => {
    const { service, prisma } = setupPrivate();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500, text: async () => 'PRIVATE_PROVIDER_ECHO' } as any);
    await expect(service.callChatDetailed([{ role: 'user', content: 'PRIVATE_PROMPT_FIXTURE' }], { privateContent: true })).rejects.toThrow();
    expect(JSON.stringify(prisma.aiCallLog.update.mock.calls)).not.toContain('PRIVATE_PROVIDER_ECHO');
  });
  it('does not call the provider if configured quota data cannot be read', async () => {
    const { service, prisma } = setupPrivate({ maxDailyCalls: 10 });
    prisma.aiQuotaUsage.aggregate.mockRejectedValue(new Error('fixture quota database unavailable'));
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    await expect(service.callChatDetailed([{ role: 'user', content: 'PRIVATE_PROMPT_FIXTURE' }], { privateContent: true })).rejects.toThrow('fixture quota database unavailable');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
