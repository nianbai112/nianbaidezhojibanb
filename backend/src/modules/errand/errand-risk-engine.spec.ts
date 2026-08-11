import { assessErrandRisk } from './errand-risk-engine';

describe('errand risk engine scene awareness', () => {
  it('does not infer cake risk for express pickup text', () => {
    const risk = assessErrandRisk({
      service_type: 'express_pickup',
      description: '帮我取蛋糕店旁边驿站的快递',
      tasks: [{ item_name: '蛋糕店旁边快递柜包裹' }],
    });

    expect(risk.risk_tags).not.toContain('cake');
    expect(risk.learning_snapshot.has_cake).toBe(false);
  });

  it('infers cake risk for food delivery', () => {
    const risk = assessErrandRisk({
      service_type: 'food_delivery',
      description: '帮我取一个生日蛋糕',
    });

    expect(risk.risk_tags).toContain('cake');
    expect(risk.learning_snapshot.has_cake).toBe(true);
  });

  it('uses configured ETA buffer as a backend floor', () => {
    const risk = assessErrandRisk({
      service_type: 'food_delivery',
      cake: true,
      configured_extra_eta_minutes: 14,
    });

    expect(risk.extra_eta_minutes).toBeGreaterThanOrEqual(14);
  });
});
