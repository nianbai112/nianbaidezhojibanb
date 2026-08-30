import { AnalyticsService } from './analytics.service';
import { RiderAiAdvisoryService } from './rider-ai-advisory.service';
import { RiderLearningStore } from './rider-learning-store';

const date = (value: string) => new Date(value);

function createAnalyticsService(prismaOverrides: any = {}) {
  const prisma: any = {
    regionRider: {
      count: jest.fn()
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(4),
    },
    errandOrder: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'errand-1',
          status: 'completed',
          createdAt: date('2026-06-30T08:00:00Z'),
          acceptTime: date('2026-06-30T08:05:00Z'),
          completeTime: date('2026-06-30T08:40:00Z'),
          deliverTime: date('2026-06-30T08:38:00Z'),
          remark: JSON.stringify({ delivery_time: '2026-06-30T08:50:00Z' }),
        },
        {
          id: 'errand-2',
          status: 'completed',
          createdAt: date('2026-06-30T09:00:00Z'),
          acceptTime: date('2026-06-30T09:10:00Z'),
          completeTime: date('2026-06-30T11:00:00Z'),
          deliverTime: date('2026-06-30T10:55:00Z'),
          remark: JSON.stringify({ delivery_time: '2026-06-30T10:00:00Z' }),
        },
        {
          id: 'errand-3',
          status: 'cancelled',
          createdAt: date('2026-06-30T10:00:00Z'),
          acceptTime: null,
          cancelTime: date('2026-06-30T10:10:00Z'),
          remark: null,
        },
      ]),
    },
    order: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'takeaway-1',
          status: 'COMPLETED',
          createdAt: date('2026-06-30T12:00:00Z'),
          acceptTime: date('2026-06-30T12:02:00Z'),
          completeTime: date('2026-06-30T12:25:00Z'),
          deliverTime: date('2026-06-30T12:24:00Z'),
          receiveTime: date('2026-06-30T12:25:00Z'),
          remark: null,
        },
      ]),
    },
    deliveryRiskEvent: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'risk-1', orderId: 'errand-2', orderType: 'errand', eventLevel: 'error' },
      ]),
    },
    ...prismaOverrides,
  };
  const learningStore: any = {
    listSnapshots: jest.fn().mockResolvedValue([]),
    summarizeSnapshots: jest.fn().mockReturnValue({
      total_snapshots: 0,
      by_level: {},
      by_algorithm: {},
      top_tags: [],
      evidence_required: 0,
      blocked: 0,
      high_risk: 0,
      attention_items: ['继续积累履约结果用于后续校准'],
    }),
  };
  const advisory: any = {};
  return { service: new AnalyticsService(prisma, learningStore, advisory), prisma };
}

describe('AnalyticsService rider algorithm learning metrics', () => {
  it('returns acceptance, timeout, cancel and incident rates for rider learning', async () => {
    const { service, prisma } = createAnalyticsService();

    const result = await service.getRiderAlgorithmAnalytics({
      startDate: '2026-06-30',
      endDate: '2026-06-30',
    });

    const metrics = (result.data as any).fulfillment_metrics;
    expect(metrics.errand).toMatchObject({
      total_orders: 3,
      accepted_orders: 2,
      completed_orders: 2,
      cancelled_orders: 1,
      timeout_orders: 1,
      incident_orders: 1,
      acceptance_rate: 66.67,
      timeout_rate: 33.33,
      cancel_rate: 33.33,
      incident_rate: 33.33,
    });
    expect(metrics.takeaway.acceptance_rate).toBe(100);
    expect(metrics.overall).toMatchObject({
      total_orders: 4,
      accepted_orders: 3,
      timeout_orders: 1,
      incident_orders: 1,
      acceptance_rate: 75,
      timeout_rate: 25,
      incident_rate: 25,
    });
    expect(prisma.errandOrder.count).toHaveBeenCalledWith({
      where: { status: { in: ['pending_accept', 'accepted', 'in_progress', 'arrived'] }, refundStatus: { notIn: ['refunding', 'refunded'] } },
    });
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: {
        deliveryMode: { in: ['platform_rider', 'rider_delivery'] }, status: { in: ['PAID', 'SHIPPED'] },
        refundStatus: { notIn: ['refunding', 'refunded'] },
      },
    });
    expect(prisma.errandOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ refundStatus: { notIn: ['refunding', 'refunded'] } }),
    }));
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ refundStatus: { notIn: ['refunding', 'refunded'] } }),
    }));
  });
});

describe('RiderAiAdvisoryService fulfillment suggestions', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('serializes AI analysis across Worker instances with a renewing Redis lock', async () => {
    const configRows: Record<string, any> = {};
    const prisma: any = {
      config: {
        findUnique: jest.fn(({ where }) => Promise.resolve(configRows[where.key] || null)),
        upsert: jest.fn(({ where, create, update }) => {
          configRows[where.key] = { key: where.key, value: update?.value || create?.value };
          return Promise.resolve(configRows[where.key]);
        }),
      },
    };
    const redis = {
      withRenewingLock: jest.fn((_key, _ttl, task) => task()),
    };
    const service = new RiderAiAdvisoryService(prisma, redis as any);

    await service.runAnalysis({ fulfillment_metrics: { overall: {} } }, 'scheduled');

    expect(redis.withRenewingLock).toHaveBeenCalledWith(
      'analytics:rider-ai-analysis',
      15 * 60,
      expect.any(Function),
    );
  });

  it('generates suggestions from low acceptance, timeout, cancel and incident rates', async () => {
    const configRows: Record<string, any> = {};
    const prisma: any = {
      config: {
        findUnique: jest.fn(({ where }) => Promise.resolve(configRows[where.key] || null)),
        upsert: jest.fn(({ where, create, update }) => {
          configRows[where.key] = { key: where.key, value: update?.value || create?.value };
          return Promise.resolve(configRows[where.key]);
        }),
      },
    };
    const service = new RiderAiAdvisoryService(prisma);

    const result = await service.runAnalysis({
      summary: { high_risk: 0, top_tags: [], evidence_required: 0 },
      fulfillment_metrics: {
        overall: {
          total_orders: 40,
          acceptance_rate: 62,
          timeout_rate: 18,
          cancel_rate: 16,
          incident_rate: 4,
        },
      },
    });

    const titles = result.data.suggestions.map((item: any) => item.title).join('\n');
    expect(titles).toContain('接单成功率');
    expect(titles).toContain('超时率');
    expect(titles).toContain('取消率');
    expect(titles).toContain('风险事故率');
  });

  it('calls the configured model and stores model suggestions when AI is enabled', async () => {
    const configRows: Record<string, any> = {
      rider_ai_advisory_config_v1: {
        value: {
          enabled: true,
          provider: 'openai_compatible',
          apiBaseUrl: 'https://ai.example.com/v1',
          apiKey: 'test-key',
          model: 'campus-rider-model',
          temperature: 0.2,
          maxTokens: 800,
          dailyCallLimit: 20,
          dailyCostLimit: 20,
          analysisInterval: 'manual',
          analysisScope: 'errand',
          regionScope: 'all',
        },
      },
    };
    const prisma: any = {
      config: {
        findUnique: jest.fn(({ where }) => Promise.resolve(configRows[where.key] || null)),
        upsert: jest.fn(({ where, create, update }) => {
          configRows[where.key] = { key: where.key, value: update?.value || create?.value };
          return Promise.resolve(configRows[where.key]);
        }),
      },
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              suggestions: [{
                suggestion_type: 'eta',
                target_algorithm: 'errand',
                title: '模型建议校准高峰 ETA',
                suggested_change: '晚高峰为蛋糕和液体订单增加 8 分钟缓冲',
                current_metric_evidence: '超时率 18%',
                expected_impact: '降低高风险订单超时投诉',
                risk_warning: '需人工确认后生效',
                confidence: 'high',
              }],
            }),
          },
        }],
        usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
      }),
    } as any);
    const service = new RiderAiAdvisoryService(prisma);

    const result = await service.runAnalysis({
      summary: { high_risk: 3, top_tags: [{ tag: 'cake', count: 2 }], evidence_required: 1 },
      fulfillment_metrics: { overall: { total_orders: 40, timeout_rate: 18 } },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://ai.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    expect(result.data.log.status).toBe('completed_model_advisory');
    expect(result.data.log.total_tokens).toBe(200);
    expect(result.data.suggestions.map((item: any) => item.title)).toContain('模型建议校准高峰 ETA');
  });

  it('summarizes rider learning outcomes for later algorithm learning', () => {
    const store = new RiderLearningStore({} as any);

    const summary = store.summarizeSnapshots([
      { event_type: 'order_created', outcome_label: 'created', risk: { risk_level: 'low', risk_tags: [] } },
      { event_type: 'order_accepted', outcome_label: 'accepted', risk: { risk_level: 'low', risk_tags: [] } },
      { event_type: 'order_completed', outcome_label: 'completed', risk: { risk_level: 'high', risk_tags: ['cake'] } },
      { event_type: 'order_completed', outcome_label: 'timeout', risk: { risk_level: 'high', risk_tags: ['liquid'] } },
      { event_type: 'order_cancelled', outcome_label: 'cancelled', risk: { risk_level: 'low', risk_tags: [] } },
      { event_type: 'risk_incident', outcome_label: 'incident', risk: { risk_level: 'restricted', risk_tags: ['fragile'] } },
    ]);

    expect(summary.by_outcome).toMatchObject({
      created: 1,
      accepted: 1,
      completed: 1,
      timeout: 1,
      cancelled: 1,
      incident: 1,
    });
    expect(summary.outcome_rates).toMatchObject({
      acceptance_rate: 100,
      completion_rate: 100,
      cancel_rate: 100,
      timeout_rate: 100,
      incident_rate: 100,
    });
  });

  it('marks scheduled AI analysis due only when enabled and next run has arrived', async () => {
    const configRows: Record<string, any> = {
      rider_ai_advisory_config_v1: {
        value: {
          enabled: true,
          analysisInterval: 'hourly',
          nextRunAt: '2026-06-30T09:00:00.000Z',
        },
      },
    };
    const prisma: any = {
      config: {
        findUnique: jest.fn(({ where }) => Promise.resolve(configRows[where.key] || null)),
      },
    };
    const service = new RiderAiAdvisoryService(prisma);

    await expect(service.shouldRunScheduledAnalysis(new Date('2026-06-30T09:01:00.000Z'))).resolves.toMatchObject({ due: true });
    await expect(service.shouldRunScheduledAnalysis(new Date('2026-06-30T08:59:00.000Z'))).resolves.toMatchObject({ due: false });

    configRows.rider_ai_advisory_config_v1.value.enabled = false;
    await expect(service.shouldRunScheduledAnalysis(new Date('2026-06-30T09:01:00.000Z'))).resolves.toMatchObject({ due: false });
  });
});
