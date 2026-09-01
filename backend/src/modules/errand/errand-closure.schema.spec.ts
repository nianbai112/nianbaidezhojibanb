import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('errand closure schema', () => {
  const schema = readFileSync(
    join(process.cwd(), 'prisma/schema.prisma'),
    'utf8',
  );
  const migration = readFileSync(
    join(process.cwd(), 'prisma/migrations/202609010001_errand_marketing_risk_closure/migration.sql'),
    'utf8',
  );

  it('stores receipt authority and auditable settlement linkage', () => {
    expect(schema).toContain('receiptConfirmDeadline DateTime?');
    expect(schema).toContain('receiptConfirmedAt     DateTime?');
    expect(schema).toContain('receiptConfirmedBy     String?');
    expect(schema).toContain('settlementEligibleAt   DateTime?');
    expect(schema).toContain('pricingSnapshot        Json?');
    expect(schema).toContain('model RiderSettlementItem');
    expect(schema).toContain('@@unique([settlementId, orderType, orderId])');
    expect(schema).toContain('model RiderLiability');
    expect(schema).toContain('@@unique([orderId, refundId])');
    expect(schema).toContain('model ErrandReview');
    expect(schema).toContain('actionKey String?');
    expect(schema).toContain('sourceType String?');
    expect(schema).toContain('sourceId   String?');
    expect(schema).toContain('orderId     String?');
    expect(schema).toContain('actionKey   String?  @unique');
    expect(schema).toContain('model ErrandAssigneeMutex');
    expect(schema).toContain('@@map("errand_assignee_mutexes")');
    expect(schema).toContain('model ErrandSettlementHold');
    expect(schema).toContain('orderId        String      @unique');
    expect(schema).toContain('@@map("errand_settlement_holds")');
    expect(schema).toContain('model MarketingCampaignBudgetCounter');
    expect(schema).toContain('@@unique([campaignId, scopeKey])');
    expect(schema).toContain('@@map("marketing_campaign_budget_counters")');
  });

  it('backfills campaign counters and completed marketing-order holds', () => {
    expect(migration).toContain('marketing_cooling_period_backfill');
    expect(migration).toContain('legacy_already_paid');
    expect(migration).toContain('ON CONFLICT ("orderId") DO NOTHING');
    expect(migration).toContain('marketing_campaign_budget_counters');
    expect(migration).toContain('INTERVAL \'48 hours\'');
  });
});
