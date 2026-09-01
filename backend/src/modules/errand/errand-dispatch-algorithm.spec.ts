import { assessErrandDispatch } from './errand-dispatch-algorithm';

describe('errand dispatch deadline handling', () => {
  const now = new Date('2026-08-30T23:30:00+08:00');
  const baseOrder = {
    type: 'errand',
    status: 'pending_accept',
    service_type: 'express_pickup',
    delivery_time: '2026-08-31 00:05:00',
    delivery_address: '学生宿舍',
    tasks: [{ task_type: 'express_pickup', pickup_address: '快递站' }],
  };

  it('warns but still allows an immediate order whose original ETA is now tight', () => {
    const result = assessErrandDispatch({
      order: { ...baseOrder, delivery_mode: 'immediate' },
      rider: { active_orders_count: 0 },
      now,
    });

    expect(result.deadlineRisk).toBe(true);
    expect(result.canAccept).toBe(true);
    expect(result.riskLevel).toBe('warning');
    expect(result.reasonText).toContain('预计可能超时');
  });

  it('still blocks a scheduled order that cannot meet its appointment', () => {
    const result = assessErrandDispatch({
      order: { ...baseOrder, delivery_mode: 'scheduled' },
      rider: { active_orders_count: 0 },
      now,
    });

    expect(result.deadlineRisk).toBe(true);
    expect(result.canAccept).toBe(false);
    expect(result.riskLevel).toBe('blocked');
  });
});
