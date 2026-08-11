import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('errand closure schema', () => {
  const schema = readFileSync(
    join(process.cwd(), 'prisma/schema.prisma'),
    'utf8',
  );

  it('stores receipt authority and auditable settlement linkage', () => {
    expect(schema).toContain('receiptConfirmDeadline DateTime?');
    expect(schema).toContain('receiptConfirmedAt     DateTime?');
    expect(schema).toContain('receiptConfirmedBy     String?');
    expect(schema).toContain('settlementEligibleAt   DateTime?');
    expect(schema).toContain('pricingSnapshot        Json?');
    expect(schema).toContain('model RiderSettlementItem');
    expect(schema).toContain('@@unique([orderType, orderId])');
    expect(schema).toContain('model RiderLiability');
    expect(schema).toContain('@@unique([orderId, refundId])');
    expect(schema).toContain('model ErrandReview');
    expect(schema).toContain('actionKey String?');
    expect(schema).toContain('sourceType String?');
    expect(schema).toContain('sourceId   String?');
    expect(schema).toContain('orderId     String?');
    expect(schema).toContain('actionKey   String?  @unique');
  });
});
