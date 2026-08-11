# Business Analytics Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing read-only business analytics pages into a permission-safe operating loop that detects evidence-based issues, assigns actions, records application evidence, verifies outcomes, and gives region operators and super administrators role-appropriate recommendations.

**Architecture:** Keep `AnalyticsService` as the sole metric reader, add one persistent `BusinessInsight` model as the task and verification source of truth, and add a focused `BusinessInsightService` for rules and state transitions. Deterministic rules create evidence; AI may only rewrite and prioritize server-calculated evidence. Existing `AdminDataScopeService`, `AdminOperationLog`, `SystemAlert`, `Config`, and business action pages are reused.

**Tech Stack:** NestJS, TypeScript, Prisma/PostgreSQL, Jest, Vue 3, Pinia, Element Plus, Axios; no new runtime dependency.

## Global Constraints

- Business timezone is exactly `Asia/Shanghai` (`UTC+08:00`, no daylight-saving switch).
- `AnalyticsQueryDto` accepts `startDate`, `endDate`, `regionId`, `businessType=all|takeaway|errand|mall|second_hand`, and `granularity=day|week|month`.
- Day granularity is limited to 93 days; week granularity is limited to 366 days; a reversed or invalid date returns HTTP 400.
- Every analytics request gets the administrator ID from `@CurrentUser('sub')`; a query parameter may narrow but never widen the server-resolved data scope.
- Paid count and GMV use `PaymentOrder.status='paid'` and `PaymentOrder.payTime`; refunds use `PaymentRefund.status='success'` and `PaymentRefund.refundedAt`.
- Add exactly one business table, `business_insights`; rules and feature flags stay in `Config`, history stays in `AdminOperationLog`, and critical/failure escalation stays in `SystemAlert`.
- The permissions are exactly `analytics:view`, `analytics:insight:manage`, `analytics:insight:verify`, `analytics:ai:run`, and `analytics:ai:config`.
- The feature flags are exactly `business_insight_read_enabled`, `business_insight_write_enabled`, `business_insight_verify_enabled`, and `business_insight_ai_enrichment_enabled`.
- The closed-loop state names are exactly `detected`, `accepted`, `in_progress`, `verifying`, `effective`, `ineffective`, `worsened`, `inconclusive`, `dismissed`, `rolled_back`, and `closed`.
- Analytics never directly changes pricing, dispatch, refund, marketing, or content configuration; `actionRoute` links to the owner module and `changeSnapshot` stores its operation/object reference.
- Existing analytics routes and old region/rider endpoints remain callable during rollout; migrations are additive and historical data is never deleted during rollback.
- Do not create a rules table, event table, workflow engine, queue dependency, chart dependency, or second analytics framework.
- Local tests/builds prove local implementation only; real database scale, multi-role login, scheduled execution, and deployment remain separate runtime gates.

---

## File Structure

### Backend files to create

- `backend/src/modules/analytics/dto/analytics.dto.ts` — validated query, insight action, rule configuration, and repair DTOs.
- `backend/src/modules/analytics/analytics-period.ts` — pure Asia/Shanghai date-window parsing, granularity selection, labels, and response metadata.
- `backend/src/modules/analytics/business-insight.rules.ts` — typed default deterministic rules, fingerprint construction, condition evaluation, and outcome evaluation.
- `backend/src/modules/analytics/business-insight.service.ts` — scoped insight query, generation, transitions, verification, repair, audit timeline, alerts, flags, and scheduled entry points.
- `backend/src/modules/analytics/analytics-period.spec.ts` — date/time/range tests.
- `backend/src/modules/analytics/business-insight.rules.spec.ts` — rule and outcome unit tests.
- `backend/src/modules/analytics/business-insight.service.spec.ts` — scope, dedupe, transition, verification, alert, and repair tests.
- `backend/src/modules/analytics/analytics.controller.spec.ts` — identity forwarding and permission-decorator tests.
- `backend/prisma/migrations/202607220005_business_insights/migration.sql` — additive table, indexes, and foreign keys.
- `admin/src/types/business-insight.ts` — shared analytics response and insight types.
- `admin/src/views/analytics/BusinessInsights.vue` — role-aware insight work queue and detail drawer.
- `backend/scripts/inspect-business-insights.ts` — read-only repair report and explicit repair modes.
- `docs/runbooks/business-insights.md` — flags, rollout, monitoring, repair, and rollback runbook.

### Backend files to modify

- `backend/src/common/services/admin-data-scope.service.ts` — add multi-region-safe scope resolution.
- `backend/src/modules/analytics/analytics.controller.ts` — typed DTOs, current administrator identity, split permissions, insight endpoints.
- `backend/src/modules/analytics/analytics.module.ts` — register focused services.
- `backend/src/modules/analytics/analytics.service.ts` — consume resolved scope/window, fix metric authorities, metadata, and aggregation.
- `backend/src/modules/analytics/analytics.service.spec.ts` — regression tests for scope, date, region, payment, refund, and query count.
- `backend/src/modules/analytics/rider-ai-advisory.service.ts` — enforce call/cost/scope limits and expose safe configuration.
- `backend/prisma/schema.prisma` — add the model and two relation arrays.
- `backend/prisma/seed.ts` — create and map permissions.
- `backend/src/modules/setup/setup.service.ts` — keep installer-created roles in sync.

### Admin files to modify

- `admin/src/api/admin.ts` — typed insight API functions.
- `admin/src/views/common/moduleTabs.ts` — put the action queue first and remove the duplicated rider tab from the combined business page.
- `admin/src/router/access.ts` — keep the page readable with `analytics:view`; buttons remain capability-gated in the page.
- `admin/src/router/menus.ts` — keep one rider-analysis entry and rename the combined entry to reflect decisions.
- `admin/src/views/analytics/AnalyticsOverview.vue` — show scope/period/freshness/quality and actionable insight summary.
- `admin/src/views/analytics/OrderAnalytics.vue` — fix tuple typing and show metric authority labels.
- `admin/src/views/analytics/SecondHandAnalytics.vue` — fix tuple typing and show metric authority labels.
- `admin/src/views/analytics/UserAnalytics.vue` and `admin/src/views/analytics/ContentAnalytics.vue` — consume unified metadata and preserve filters.
- `admin/src/views/analytics/RiderAnalytics.vue` — use split AI permissions and link formal suggestions to insights.
- `admin/src/views/dashboard/RegionOpsWorkbench.vue` — read formal insight tasks with old endpoint fallback.

---

### Task 1: Validated Business Period and Multi-Region Scope Foundation

**Files:**
- Create: `backend/src/modules/analytics/analytics-period.ts`
- Create: `backend/src/modules/analytics/analytics-period.spec.ts`
- Create: `backend/src/modules/analytics/dto/analytics.dto.ts`
- Modify: `backend/src/common/services/admin-data-scope.service.ts`
- Create: `backend/src/common/services/admin-data-scope.service.spec.ts`

**Interfaces:**
- Produces: `parseAnalyticsPeriod(query: AnalyticsQueryDto, now?: Date): AnalyticsPeriod`.
- Produces: `analyticsMeta(period, scope, extras): AnalyticsMeta`.
- Produces: `AdminDataScopeService.resolveRegionIds(accountId?: string, requestedRegionId?: string | null): Promise<string[] | undefined>` where `undefined` means global super-admin scope only.

- [ ] **Step 1: Write failing period and scope tests**

```ts
it('rejects reversed, invalid and overlong daily windows', () => {
  expect(() => parseAnalyticsPeriod({ startDate: '2026-07-03', endDate: '2026-07-02' })).toThrow(BadRequestException);
  expect(() => parseAnalyticsPeriod({ startDate: 'not-a-date', endDate: '2026-07-02' })).toThrow(BadRequestException);
  expect(() => parseAnalyticsPeriod({ startDate: '2026-01-01', endDate: '2026-07-02', granularity: 'day' })).toThrow(BadRequestException);
});

it('uses Shanghai natural-day boundaries', () => {
  const period = parseAnalyticsPeriod({ startDate: '2026-07-01', endDate: '2026-07-01' });
  expect(period.start.toISOString()).toBe('2026-06-30T16:00:00.000Z');
  expect(period.end.toISOString()).toBe('2026-07-01T15:59:59.999Z');
  expect(period.granularity).toBe('day');
});

it('returns all authorized regions when a regional account omits regionId', async () => {
  jest.spyOn(service, 'getAdminContext').mockResolvedValue({ accountId: 'a1', isSuperAdmin: false, roleIds: [], roleCodes: [], regionIds: ['r1', 'r2'] });
  await expect(service.resolveRegionIds('a1')).resolves.toEqual(['r1', 'r2']);
  await expect(service.resolveRegionIds('a1', 'r3')).rejects.toThrow(ForbiddenException);
});
```

- [ ] **Step 2: Run tests and confirm the missing APIs fail**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/analytics-period.spec.ts src/common/services/admin-data-scope.service.spec.ts`

Expected: FAIL because `analytics-period.ts`, `parseAnalyticsPeriod`, and `resolveRegionIds` do not exist.

- [ ] **Step 3: Add the validated DTO and period implementation**

```ts
// backend/src/modules/analytics/dto/analytics.dto.ts
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class AnalyticsQueryDto {
  @IsOptional() @IsDateString({ strict: true }) startDate?: string;
  @IsOptional() @IsDateString({ strict: true }) endDate?: string;
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @IsIn(['all', 'takeaway', 'errand', 'mall', 'second_hand']) businessType?: string;
  @IsOptional() @IsIn(['day', 'week', 'month']) granularity?: 'day' | 'week' | 'month';
}

export class RiderAiConfigDto {
  @IsBoolean() enabled!: boolean;
  @IsString() provider!: string;
  @IsOptional() @IsString() apiBaseUrl?: string;
  @IsOptional() @IsString() apiKey?: string;
  @IsString() model!: string;
  @IsNumber() @Min(0) @Max(2) temperature!: number;
  @IsInt() @Min(1) @Max(32768) maxTokens!: number;
  @IsInt() @Min(0) dailyCallLimit!: number;
  @IsNumber() @Min(0) dailyCostLimit!: number;
  @IsNumber() @Min(0) promptPricePerMillion!: number;
  @IsNumber() @Min(0) completionPricePerMillion!: number;
  @IsIn(['manual', 'hourly', 'daily']) analysisInterval!: string;
  @IsIn(['all', 'errand', 'takeaway']) analysisScope!: string;
  @IsIn(['all', 'selected']) regionScope!: string;
  @IsOptional() @IsString() regionId?: string;
}

export class RiderAiRunDto {
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @IsIn(['all', 'errand', 'takeaway']) analysisScope?: string;
  @IsOptional() @IsString() trigger_type?: string;
}

export class RiderSuggestionStatusDto {
  @IsIn(['accepted', 'dismissed', 'applied']) status!: string;
  @IsOptional() @IsString() note?: string;
}
```

```ts
// backend/src/modules/analytics/analytics-period.ts
import { BadRequestException } from '@nestjs/common';
import { AnalyticsQueryDto } from './dto/analytics.dto';

export type AnalyticsPeriod = { start: Date; end: Date; startLabel: string; endLabel: string; granularity: 'day' | 'week' | 'month'; timezone: 'Asia/Shanghai' };
export type AnalyticsScope = { type: 'global' | 'region'; regionIds: string[] };

const DAY = 86_400_000;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

function shanghaiBoundary(value: string, end: boolean) {
  if (!dateOnly.test(value)) throw new BadRequestException(`无效日期：${value}`);
  const parsed = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}+08:00`);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`无效日期：${value}`);
  return parsed;
}

export function formatShanghaiDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

export function analyticsBucketLabel(value: Date, granularity: 'day' | 'week' | 'month') {
  const day = formatShanghaiDate(value);
  if (granularity === 'day') return day;
  if (granularity === 'month') return day.slice(0, 7);
  const localNoon = new Date(`${day}T12:00:00+08:00`);
  const weekday = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }).format(localNoon) === 'Sun' ? 7 : localNoon.getUTCDay());
  return formatShanghaiDate(new Date(localNoon.getTime() - (weekday - 1) * DAY));
}

export function parseAnalyticsPeriod(query: AnalyticsQueryDto, now = new Date()): AnalyticsPeriod {
  const today = formatShanghaiDate(now);
  const defaultEnd = new Date(shanghaiBoundary(today, false).getTime() - DAY);
  const defaultStart = new Date(defaultEnd.getTime() - 6 * DAY);
  const start = query.startDate ? shanghaiBoundary(query.startDate, false) : shanghaiBoundary(formatShanghaiDate(defaultStart), false);
  const end = query.endDate ? shanghaiBoundary(query.endDate, true) : shanghaiBoundary(formatShanghaiDate(defaultEnd), true);
  if (start > end) throw new BadRequestException('开始日期不能晚于结束日期');
  const days = Math.floor((end.getTime() - start.getTime()) / DAY) + 1;
  const granularity = query.granularity || (days <= 93 ? 'day' : days <= 366 ? 'week' : 'month');
  if (granularity === 'day' && days > 93) throw new BadRequestException('日粒度最多查询93天');
  if (granularity === 'week' && days > 366) throw new BadRequestException('周粒度最多查询366天');
  return { start, end, startLabel: formatShanghaiDate(start), endLabel: formatShanghaiDate(end), granularity, timezone: 'Asia/Shanghai' };
}

export function analyticsMeta(period: AnalyticsPeriod, scope: AnalyticsScope, extras: { freshnessAt?: Date; sampleSize?: number; quality?: 'complete' | 'partial'; warnings?: string[] } = {}) {
  return { scope, period: { start: period.startLabel, end: period.endLabel, granularity: period.granularity }, timezone: period.timezone, generatedAt: new Date().toISOString(), freshnessAt: (extras.freshnessAt || new Date()).toISOString(), sampleSize: extras.sampleSize || 0, quality: extras.quality || 'complete', warnings: extras.warnings || [] };
}
```

- [ ] **Step 4: Add safe multi-region resolution**

```ts
async resolveRegionIds(accountId?: string, requestedRegionId?: string | null): Promise<string[] | undefined> {
  const requested = requestedRegionId ? String(requestedRegionId) : '';
  const ctx = await this.getAdminContext(accountId);
  if (ctx.isSuperAdmin) return requested ? [requested] : undefined;
  if (requested) {
    if (!ctx.regionIds.includes(requested)) throw new ForbiddenException('无权访问该区域数据');
    return [requested];
  }
  if (!ctx.regionIds.length) throw new ForbiddenException('当前管理员未绑定区域数据范围');
  return ctx.regionIds;
}
```

- [ ] **Step 5: Run focused tests and commit**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/analytics-period.spec.ts src/common/services/admin-data-scope.service.spec.ts`

Expected: PASS with no failed suites.

```bash
git add backend/src/modules/analytics/analytics-period.ts backend/src/modules/analytics/analytics-period.spec.ts backend/src/modules/analytics/dto/analytics.dto.ts backend/src/common/services/admin-data-scope.service.ts backend/src/common/services/admin-data-scope.service.spec.ts
git commit -m "fix: secure analytics periods and region scope"
```

### Task 2: P0 Controller Identity, Permissions, and Metric Authority

**Files:**
- Modify: `backend/src/modules/analytics/analytics.controller.ts`
- Modify: `backend/src/modules/analytics/analytics.module.ts`
- Modify: `backend/src/modules/analytics/analytics.service.ts`
- Modify: `backend/src/modules/analytics/analytics.service.spec.ts`
- Create: `backend/src/modules/analytics/analytics.controller.spec.ts`

**Interfaces:**
- Consumes: `resolveRegionIds()` and `parseAnalyticsPeriod()` from Task 1.
- Produces: every read method signature `method(accountId: string, query: AnalyticsQueryDto)`.
- Produces: every read response `{ data: T; meta: AnalyticsMeta }`.

- [ ] **Step 1: Write failing scope and payment-authority tests**

```ts
it('uses profile.regionId and an IN filter for every authorized region', async () => {
  await service.getUserAnalytics('admin-1', { startDate: '2026-07-01', endDate: '2026-07-07' });
  expect(prisma.user.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ profile: { is: { regionId: { in: ['r1', 'r2'] } } } }]) }) }));
});

it('calculates paid count and GMV from payTime only', async () => {
  await service.getOrderAnalytics('admin-1', { startDate: '2026-07-01', endDate: '2026-07-07' });
  expect(prisma.paymentOrder.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'paid', payTime: { gte: expect.any(Date), lte: expect.any(Date) } }) }));
});

it('calculates successful refunds from refundedAt only', async () => {
  await service.getFinanceAnalytics('admin-1', { startDate: '2026-07-01', endDate: '2026-07-07' });
  expect(prisma.paymentRefund.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'success', refundedAt: { gte: expect.any(Date), lte: expect.any(Date) } }) }));
});

it('reads a 31-day trend with one model query', async () => {
  prisma.user.findMany.mockResolvedValue([{ createdAt: new Date('2026-07-01T01:00:00Z') }]);
  await service.getUserAnalytics('admin-1', { startDate: '2026-07-01', endDate: '2026-07-31' });
  expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused service test and confirm it fails**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/analytics.service.spec.ts`

Expected: FAIL because current methods do not take `accountId`, use `profile.region`, and filter payment facts by `createdAt`.

- [ ] **Step 3: Inject scope and normalize one request context for all read methods**

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly riderLearningStore: RiderLearningStore,
  private readonly riderAiAdvisory: RiderAiAdvisoryService,
  private readonly adminDataScope: AdminDataScopeService,
) {}

private async requestContext(accountId: string, query: AnalyticsQueryDto) {
  const period = parseAnalyticsPeriod(query);
  const regionIds = await this.adminDataScope.resolveRegionIds(accountId, query.regionId);
  return {
    period,
    regionIds,
    scope: { type: regionIds ? 'region' as const : 'global' as const, regionIds: regionIds || [] },
    businessType: query.businessType || 'all',
  };
}

private userRegionWhere(regionIds?: string[]) {
  if (!regionIds) return {};
  return { OR: [
    { profile: { is: { regionId: { in: regionIds } } } },
    { addresses: { some: { regionId: { in: regionIds } } } },
    { posts: { some: { regionId: { in: regionIds } } } },
  ] };
}
```

- [ ] **Step 4: Replace serial daily queries with one read and local bucketing**

```ts
private async getTrend(model: string, dateField: string, period: AnalyticsPeriod, where: Record<string, unknown> = {}) {
  const rows = await (this.prisma as any)[model].findMany({ where: { ...where, [dateField]: { gte: period.start, lte: period.end } }, select: { [dateField]: true } });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = analyticsBucketLabel(row[dateField], period.granularity);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 5: Replace payment/refund time filters and return metadata**

```ts
const paymentWhere = {
  status: 'paid',
  payTime: { gte: ctx.period.start, lte: ctx.period.end },
  ...(bizTypes.length ? { bizType: { in: bizTypes } } : {}),
};
const paid = await this.prisma.paymentOrder.aggregate({ where: paymentWhere, _count: true, _sum: { amount: true } });
const refunds = await this.prisma.paymentRefund.aggregate({
  where: { status: 'success', refundedAt: { gte: ctx.period.start, lte: ctx.period.end }, payment: paymentWhere },
  _count: true,
  _sum: { amount: true },
});
return {
  data: { paidCount: paid._count, gmv: this.sumValue(paid, 'amount'), refundCount: refunds._count, refundAmount: this.sumValue(refunds, 'amount') },
  meta: analyticsMeta(ctx.period, ctx.scope, { sampleSize: paid._count }),
};
```

- [ ] **Step 6: Forward current identity and split AI permissions**

```ts
@Get('overview')
@RequirePermission('analytics:view')
getOverview(@CurrentUser('sub') accountId: string, @Query() query: AnalyticsQueryDto) {
  return this.analyticsService.getOverview(accountId, query);
}

@Put('riders/ai-config')
@RequirePermission('analytics:ai:config')
saveRiderAiConfig(@CurrentUser('sub') accountId: string, @Body() dto: RiderAiConfigDto) {
  return this.analyticsService.saveRiderAiConfig(accountId, dto);
}

@Post('riders/ai-run')
@RequirePermission('analytics:ai:run')
runRiderAiAnalysis(@CurrentUser('sub') accountId: string, @Body() dto: RiderAiRunDto) {
  return this.analyticsService.runRiderAiAnalysis(accountId, dto);
}

@Get('riders/ai-config')
@RequirePermission('analytics:ai:config')
getRiderAiConfig() { return this.analyticsService.getRiderAiConfig(); }

@Get('riders/ai-status')
@RequirePermission('analytics:view')
getRiderAiStatus() { return this.analyticsService.getRiderAiStatus(); }

@Put('riders/ai-suggestions/:id/status')
@RequirePermission('analytics:insight:manage')
updateRiderAiSuggestionStatus(@CurrentUser('sub') accountId: string, @Param('id') id: string, @Body() dto: RiderSuggestionStatusDto) {
  return this.analyticsService.updateRiderAiSuggestionStatus(accountId, id, dto);
}
```

- [ ] **Step 7: Run controller/service tests, TypeScript, and commit**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/analytics.service.spec.ts src/modules/analytics/analytics.controller.spec.ts`

Expected: PASS; controller tests show the account ID is forwarded and write endpoints no longer use `analytics:view`.

Run: `cd backend && npx tsc --noEmit --incremental false -p tsconfig.json`

Expected: exit code 0.

```bash
git add backend/src/modules/analytics/analytics.controller.ts backend/src/modules/analytics/analytics.controller.spec.ts backend/src/modules/analytics/analytics.module.ts backend/src/modules/analytics/analytics.service.ts backend/src/modules/analytics/analytics.service.spec.ts
git commit -m "fix: make analytics metrics scoped and authoritative"
```

### Task 3: Persistent Business Insight Model and Additive Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202607220005_business_insights/migration.sql`

**Interfaces:**
- Produces: Prisma delegate `prisma.businessInsight` and the schema fields used by every later task.

- [ ] **Step 1: Add exact Prisma model and relation arrays**

```prisma
model BusinessInsight {
  id                String        @id @default(cuid())
  fingerprint       String        @unique
  ruleKey           String
  source            String        @default("rule")
  scopeType         String        @default("region")
  regionId          String?
  region            Region?       @relation(fields: [regionId], references: [id], onDelete: SetNull)
  businessType      String
  metricKey         String
  severity          String        @default("medium")
  status            String        @default("detected")
  title             String
  summary           String?
  evidence          Json
  recommendation    Json
  actionRoute       String?
  ownerId           String?
  owner             AdminAccount? @relation(fields: [ownerId], references: [id], onDelete: SetNull)
  baselineValue     Decimal?       @db.Decimal(18, 4)
  currentValue      Decimal?       @db.Decimal(18, 4)
  targetValue       Decimal?       @db.Decimal(18, 4)
  periodStart       DateTime
  periodEnd         DateTime
  dueAt             DateTime?
  appliedAt         DateTime?
  verificationDueAt DateTime?
  verifiedAt        DateTime?
  verificationValue Decimal?       @db.Decimal(18, 4)
  outcome           String?
  operatorNote      String?
  changeSnapshot    Json?
  rollbackSnapshot  Json?
  lastDetectedAt    DateTime       @default(now())
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  @@index([regionId, status, severity])
  @@index([ownerId, status, dueAt])
  @@index([status, verificationDueAt])
  @@index([ruleKey, periodStart, periodEnd])
  @@map("business_insights")
}
```

Add `businessInsights BusinessInsight[]` to both `Region` and `AdminAccount`.

- [ ] **Step 2: Add an idempotent additive SQL migration**

```sql
CREATE TABLE IF NOT EXISTS "business_insights" (
  "id" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "ruleKey" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'rule', "scopeType" TEXT NOT NULL DEFAULT 'region',
  "regionId" TEXT, "businessType" TEXT NOT NULL, "metricKey" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'medium', "status" TEXT NOT NULL DEFAULT 'detected',
  "title" TEXT NOT NULL, "summary" TEXT, "evidence" JSONB NOT NULL,
  "recommendation" JSONB NOT NULL, "actionRoute" TEXT, "ownerId" TEXT,
  "baselineValue" DECIMAL(18,4), "currentValue" DECIMAL(18,4), "targetValue" DECIMAL(18,4),
  "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3), "appliedAt" TIMESTAMP(3), "verificationDueAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3), "verificationValue" DECIMAL(18,4), "outcome" TEXT,
  "operatorNote" TEXT, "changeSnapshot" JSONB, "rollbackSnapshot" JSONB,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_insights_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "business_insights_fingerprint_key" ON "business_insights"("fingerprint");
CREATE INDEX IF NOT EXISTS "business_insights_regionId_status_severity_idx" ON "business_insights"("regionId", "status", "severity");
CREATE INDEX IF NOT EXISTS "business_insights_ownerId_status_dueAt_idx" ON "business_insights"("ownerId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "business_insights_status_verificationDueAt_idx" ON "business_insights"("status", "verificationDueAt");
CREATE INDEX IF NOT EXISTS "business_insights_ruleKey_periodStart_periodEnd_idx" ON "business_insights"("ruleKey", "periodStart", "periodEnd");
DO $$ BEGIN ALTER TABLE "business_insights" ADD CONSTRAINT "business_insights_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "business_insights" ADD CONSTRAINT "business_insights_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 3: Validate schema and generated client, then commit**

Run: `cd backend && npx prisma validate && npm run db:generate`

Expected: Prisma schema validation succeeds and the generated client exposes `BusinessInsight`.

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202607220005_business_insights/migration.sql
git commit -m "feat: add persistent business insights"
```

### Task 4: Deterministic Rule Registry, Fingerprints, and Outcomes

**Files:**
- Create: `backend/src/modules/analytics/business-insight.rules.ts`
- Create: `backend/src/modules/analytics/business-insight.rules.spec.ts`

**Interfaces:**
- Produces: `InsightRule`, `MetricEvidence`, `evaluateRule`, `insightFingerprint`, and `evaluateOutcome`.

- [ ] **Step 1: Write failing pure-function tests**

```ts
it('does not conclude below the minimum sample', () => {
  expect(evaluateRule(rule, { current: 20, baseline: 10, sampleSize: 4, quality: 'complete' })).toEqual({ matched: false, reason: 'sample_too_small' });
});

it('makes the same fingerprint for concurrent copies of one bucket', () => {
  expect(insightFingerprint('refund_rate_high', ['r2', 'r1'], 'takeaway', '2026-07-01/2026-07-07')).toBe(insightFingerprint('refund_rate_high', ['r1', 'r2'], 'takeaway', '2026-07-01/2026-07-07'));
});

it.each([
  [{ current: 8, target: 10, direction: 'lte', guardBreached: false, sampleSize: 30 }, 'effective'],
  [{ current: 12, target: 10, direction: 'lte', guardBreached: false, sampleSize: 30 }, 'ineffective'],
  [{ current: 8, target: 10, direction: 'lte', guardBreached: true, sampleSize: 30 }, 'worsened'],
  [{ current: 8, target: 10, direction: 'lte', guardBreached: false, sampleSize: 2, minSample: 10 }, 'inconclusive'],
])('evaluates verification outcome', (input, expected) => expect(evaluateOutcome(input as any)).toBe(expected));
```

- [ ] **Step 2: Run the unit test and confirm missing exports fail**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/business-insight.rules.spec.ts`

Expected: FAIL because the rule module does not exist.

- [ ] **Step 3: Implement typed rule evaluation with eight real rule keys**

```ts
export type InsightRule = {
  enabled: boolean; ruleKey: string; metricKey: string; businessTypes: string[];
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'drop_pct'; threshold: number;
  minSample: number; observeHours: number; severity: 'low' | 'medium' | 'high' | 'critical';
  title: string; recommendation: string[]; actionRoute: string; targetValue: number;
  guardMetricKey?: string; rollbackHint?: string;
};
export type MetricEvidence = { current: number; baseline: number; sampleSize: number; quality: 'complete' | 'partial'; warnings?: string[] };

export const DEFAULT_INSIGHT_RULES: InsightRule[] = [
  { enabled: true, ruleKey: 'paid_gmv_drop', metricKey: 'paid_gmv', businessTypes: ['takeaway','errand','mall','second_hand'], operator: 'drop_pct', threshold: 30, minSample: 10, observeHours: 24, severity: 'high', title: '支付GMV明显下降', recommendation: ['核查支付失败与可售供给','检查履约中断订单'], actionRoute: '/finance/payments', targetValue: 0 },
  { enabled: true, ruleKey: 'acceptance_rate_low', metricKey: 'acceptance_rate', businessTypes: ['takeaway','errand'], operator: 'lt', threshold: 80, minSample: 20, observeHours: 24, severity: 'high', title: '接单率偏低', recommendation: ['检查在线骑手供给','检查价格与派单范围'], actionRoute: '/errand/dispatch', targetValue: 80 },
  { enabled: true, ruleKey: 'timeout_rate_high', metricKey: 'timeout_rate', businessTypes: ['takeaway','errand'], operator: 'gt', threshold: 10, minSample: 20, observeHours: 24, severity: 'high', title: '履约超时率偏高', recommendation: ['核查高峰时段和异常路线'], actionRoute: '/order/center', targetValue: 10 },
  { enabled: true, ruleKey: 'cancel_rate_high', metricKey: 'cancel_rate', businessTypes: ['takeaway','errand'], operator: 'gt', threshold: 10, minSample: 20, observeHours: 24, severity: 'high', title: '取消率偏高', recommendation: ['拆分未支付和无人接单原因'], actionRoute: '/order/center', targetValue: 10 },
  { enabled: true, ruleKey: 'incident_rate_high', metricKey: 'incident_rate', businessTypes: ['takeaway','errand'], operator: 'gt', threshold: 1, minSample: 20, observeHours: 24, severity: 'critical', title: '履约风险事故率偏高', recommendation: ['核查高风险任务证据与叠单规则'], actionRoute: '/errand/abnormal', targetValue: 1 },
  { enabled: true, ruleKey: 'refund_rate_high', metricKey: 'successful_refund_rate', businessTypes: ['takeaway','errand','mall','second_hand'], operator: 'gt', threshold: 8, minSample: 20, observeHours: 48, severity: 'critical', title: '成功退款金额率异常', recommendation: ['核查退款原因与责任方'], actionRoute: '/finance/refunds', targetValue: 8 },
  { enabled: true, ruleKey: 'content_supply_low', metricKey: 'valid_content_supply', businessTypes: ['all'], operator: 'lt', threshold: 10, minSample: 1, observeHours: 24, severity: 'medium', title: '有效内容供给不足', recommendation: ['检查待审核内容和区域活动'], actionRoute: '/content/audit', targetValue: 10 },
  { enabled: true, ruleKey: 'active_merchant_low', metricKey: 'active_merchant_rate', businessTypes: ['takeaway','mall'], operator: 'lt', threshold: 60, minSample: 5, observeHours: 24, severity: 'high', title: '活跃商家率偏低', recommendation: ['检查停业和商品下架商家'], actionRoute: '/merchant/list', targetValue: 60 },
  { enabled: true, ruleKey: 'second_hand_inventory_high', metricKey: 'second_hand_stale_inventory', businessTypes: ['second_hand'], operator: 'gt', threshold: 30, minSample: 10, observeHours: 72, severity: 'medium', title: '二手长期未售库存偏高', recommendation: ['核查待审核、下架和长期未售商品'], actionRoute: '/features/second-hand', targetValue: 30 },
  { enabled: true, ruleKey: 'data_quality_partial', metricKey: 'data_quality', businessTypes: ['all'], operator: 'gt', threshold: 0, minSample: 1, observeHours: 1, severity: 'critical', title: '业务数据口径不完整', recommendation: ['核查支付事实与业务订单差异'], actionRoute: '/system/observability', targetValue: 0 },
];

export function insightFingerprint(ruleKey: string, regionIds: string[], businessType: string, periodBucket: string) {
  return [ruleKey, [...regionIds].sort().join(',' ) || 'global', businessType, periodBucket].join(':');
}

export function evaluateRule(rule: InsightRule, evidence: MetricEvidence) {
  if (!rule.enabled) return { matched: false, reason: 'disabled' };
  if (evidence.sampleSize < rule.minSample) return { matched: false, reason: 'sample_too_small' };
  const matched = rule.operator === 'drop_pct' ? evidence.baseline > 0 && ((evidence.baseline - evidence.current) / evidence.baseline) * 100 >= rule.threshold : ({ lt: evidence.current < rule.threshold, lte: evidence.current <= rule.threshold, gt: evidence.current > rule.threshold, gte: evidence.current >= rule.threshold } as const)[rule.operator];
  return { matched, reason: matched ? 'threshold_matched' : 'threshold_not_matched' };
}

export function evaluateOutcome(input: { current: number; target: number; direction: 'lte' | 'gte'; guardBreached: boolean; sampleSize: number; minSample?: number }) {
  if (input.sampleSize < (input.minSample || 1)) return 'inconclusive';
  if (input.guardBreached) return 'worsened';
  const reached = input.direction === 'lte' ? input.current <= input.target : input.current >= input.target;
  return reached ? 'effective' : 'ineffective';
}
```

- [ ] **Step 4: Run tests and commit**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/business-insight.rules.spec.ts`

Expected: PASS.

```bash
git add backend/src/modules/analytics/business-insight.rules.ts backend/src/modules/analytics/business-insight.rules.spec.ts
git commit -m "feat: define deterministic business insight rules"
```

### Task 5: Insight Generation, Dedupe, Query, and Critical Alerts

**Files:**
- Create: `backend/src/modules/analytics/business-insight.service.ts`
- Create: `backend/src/modules/analytics/business-insight.service.spec.ts`
- Modify: `backend/src/modules/analytics/dto/analytics.dto.ts`
- Modify: `backend/src/modules/analytics/analytics.service.ts`
- Modify: `backend/src/modules/analytics/analytics.module.ts`

**Interfaces:**
- Consumes: `AnalyticsService.readMetric(accountId, metricKey, query)` returning `{ current, baseline, sampleSize, quality, warnings, period, scope }`.
- Produces: `generate(accountId, dto)`, `list(accountId, query)`, `summary(accountId, query)`, and `detail(accountId, id)`.

- [ ] **Step 1: Add list/generation DTOs and a metric snapshot interface**

```ts
export class InsightListDto {
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @IsIn(['all', 'takeaway', 'errand', 'mall', 'second_hand']) businessType?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'critical']) severity?: string;
  @IsOptional() @IsIn(['detected','accepted','in_progress','verifying','effective','ineffective','worsened','inconclusive','dismissed','rolled_back','closed','open']) status?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsBoolean() overdue?: boolean;
  @IsOptional() @IsString() metricKey?: string;
  @IsOptional() @IsInt() @Min(1) page = 1;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class GenerateInsightsDto extends AnalyticsQueryDto {
  @IsOptional() @IsString() ruleKey?: string;
}
```

```ts
export type InsightMetricSnapshot = {
  current: number; baseline: number; sampleSize: number;
  quality: 'complete' | 'partial'; warnings: string[];
  direction: 'lte' | 'gte'; guardBreached: boolean; minSample: number;
  period: AnalyticsPeriod; scope: AnalyticsScope;
};
```

- [ ] **Step 2: Write failing dedupe, scope, and alert tests**

```ts
it('upserts one fingerprint and refreshes evidence instead of duplicating', async () => {
  await Promise.all([service.generate('admin-1', dto), service.generate('admin-1', dto)]);
  expect(prisma.businessInsight.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { fingerprint: expect.stringContaining('refund_rate_high') }, update: expect.objectContaining({ lastDetectedAt: expect.any(Date) }) }));
});

it('rejects detail outside the administrator scope', async () => {
  prisma.businessInsight.findUnique.mockResolvedValue({ id: 'i1', regionId: 'r2' });
  adminDataScope.assertRegionAccess.mockRejectedValue(new ForbiddenException());
  await expect(service.detail('admin-r1', 'i1')).rejects.toThrow(ForbiddenException);
});

it('creates one pending alert for a critical insight', async () => {
  await service.generate('admin-1', { regionId: 'r1', businessType: 'takeaway' });
  expect(prisma.systemAlert.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'business_insight', level: 'critical', businessId: expect.any(String) }) }));
});
```

- [ ] **Step 3: Run test and confirm the missing service fails**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/business-insight.service.spec.ts`

Expected: FAIL because `BusinessInsightService` does not exist.

- [ ] **Step 4: Expose one metric registry backed by existing analytics methods**

```ts
async readMetric(accountId: string, metricKey: string, query: AnalyticsQueryDto): Promise<InsightMetricSnapshot> {
  const period = parseAnalyticsPeriod(query);
  const duration = period.end.getTime() - period.start.getTime() + 1;
  const previousQuery = { ...query, startDate: formatShanghaiDate(new Date(period.start.getTime() - duration)), endDate: formatShanghaiDate(new Date(period.end.getTime() - duration)) };
  const read = async (q: AnalyticsQueryDto) => {
    const [orders, riders, content, merchants, secondHand] = await Promise.all([
      this.getOrderAnalytics(accountId, q), this.getRiderAlgorithmAnalytics(accountId, q),
      this.getContentAnalytics(accountId, q), this.getMerchantAnalytics(accountId, q), this.getSecondHandAnalytics(accountId, q),
    ]);
    const order = orders.data as any; const rider = riders.data as any; const contentData = content.data as any; const merchant = merchants.data as any; const second = secondHand.data as any;
    const values: Record<string, number> = {
      paid_gmv: Number(order.gmv || 0), successful_refund_rate: this.percent(Number(order.refundAmount || 0), Number(order.gmv || 0)),
      acceptance_rate: Number(rider.fulfillment_metrics?.overall?.acceptance_rate || 0), timeout_rate: Number(rider.fulfillment_metrics?.overall?.timeout_rate || 0),
      cancel_rate: Number(rider.fulfillment_metrics?.overall?.cancel_rate || 0), incident_rate: Number(rider.fulfillment_metrics?.overall?.incident_rate || 0), valid_content_supply: Number(contentData.validPosts || 0),
      active_merchant_rate: this.percent(Number(merchant.active || 0), Number(merchant.total || 0)), data_quality: [orders.meta, riders.meta, content.meta, merchants.meta, secondHand.meta].filter(meta => meta.quality === 'partial').length,
      second_hand_stale_inventory: Number(second.staleInventoryRate || 0),
    };
    return { value: values[metricKey] ?? 0, meta: orders.meta, sampleSize: Math.max(Number(orders.meta.sampleSize || 0), Number(riders.meta.sampleSize || 0), Number(secondHand.meta.sampleSize || 0)), warnings: [orders.meta, riders.meta, content.meta, merchants.meta, secondHand.meta].flatMap(meta => meta.warnings || []) };
  };
  const [current, baseline] = await Promise.all([read(query), read(previousQuery)]);
  const lowerIsBetter = ['successful_refund_rate', 'timeout_rate', 'cancel_rate', 'incident_rate', 'second_hand_stale_inventory', 'data_quality'].includes(metricKey);
  return { current: current.value, baseline: baseline.value, sampleSize: current.sampleSize, quality: current.warnings.length ? 'partial' : 'complete', warnings: current.warnings, direction: lowerIsBetter ? 'lte' : 'gte', guardBreached: false, minSample: 1, period, scope: current.meta.scope };
}
```

- [ ] **Step 5: Implement flag reads, scoped list/detail, and transactional upsert**

```ts
const RULE_CONFIG_KEY = 'business_insight_rules_v1';
const FLAG_DEFAULTS = { business_insight_read_enabled: false, business_insight_write_enabled: false, business_insight_verify_enabled: false, business_insight_ai_enrichment_enabled: false };

private async flag(key: keyof typeof FLAG_DEFAULTS) {
  const row = await this.prisma.config.findUnique({ where: { key } });
  return row ? Boolean(row.value) : FLAG_DEFAULTS[key];
}

async getRules(): Promise<{ version: 1; rules: InsightRule[] }> {
  const row = await this.prisma.config.findUnique({ where: { key: RULE_CONFIG_KEY } });
  const value = row?.value as any;
  return value?.version === 1 && Array.isArray(value.rules) ? value : { version: 1, rules: DEFAULT_INSIGHT_RULES };
}

async list(accountId: string, query: InsightListDto) {
  if (!(await this.flag('business_insight_read_enabled'))) return { list: [], total: 0, disabled: true };
  const regionIds = await this.adminDataScope.resolveRegionIds(accountId, query.regionId);
  const where = { ...(regionIds ? { regionId: { in: regionIds } } : {}), ...(query.status ? { status: query.status } : {}), ...(query.severity ? { severity: query.severity } : {}), ...(query.businessType ? { businessType: query.businessType } : {}), ...(query.ownerId ? { ownerId: query.ownerId } : {}) };
  const [list, total] = await Promise.all([this.prisma.businessInsight.findMany({ where, orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { region: { select: { id: true, name: true } }, owner: { select: { id: true, realName: true } } } }), this.prisma.businessInsight.count({ where })]);
  return { list, total };
}

async detail(accountId: string, id: string) {
  const insight = await this.prisma.businessInsight.findUnique({ where: { id }, include: { region: true, owner: { select: { id: true, realName: true } } } });
  if (!insight) throw new NotFoundException('洞察不存在');
  await this.adminDataScope.assertRegionAccess(accountId, insight.regionId);
  const timeline = await this.prisma.adminOperationLog.findMany({ where: { module: 'business_insight', targetId: id }, orderBy: { createdAt: 'asc' }, include: { account: { select: { id: true, realName: true } } } });
  return { ...insight, timeline };
}
```

- [ ] **Step 6: Implement generate using the unique fingerprint as the concurrency guard**

```ts
const saved = await this.prisma.businessInsight.upsert({
  where: { fingerprint },
  create: { fingerprint, ruleKey: rule.ruleKey, source: 'rule', scopeType: metric.scope.type, regionId, businessType, metricKey: rule.metricKey, severity: rule.severity, status: 'detected', title: rule.title, summary, evidence: metric, recommendation: { actions: rule.recommendation, risk: [...(metric.warnings || []), ...(rule.rollbackHint ? [rule.rollbackHint] : [])] }, actionRoute: rule.actionRoute, baselineValue: metric.baseline, currentValue: metric.current, targetValue: rule.targetValue, periodStart: metric.period.start, periodEnd: metric.period.end, lastDetectedAt: now },
  update: { summary, evidence: metric, recommendation: { actions: rule.recommendation, risk: [...(metric.warnings || []), ...(rule.rollbackHint ? [rule.rollbackHint] : [])] }, baselineValue: metric.baseline, currentValue: metric.current, targetValue: rule.targetValue, lastDetectedAt: now },
});
if (rule.severity === 'critical') await this.upsertCriticalAlert(saved);
```

```ts
private async upsertCriticalAlert(insight: { id: string; regionId: string | null; title: string; summary: string | null; evidence: unknown }) {
  const existing = await this.prisma.systemAlert.findFirst({ where: { type: 'business_insight', businessId: insight.id, status: { in: ['pending', 'processing'] } } });
  const data = { level: 'critical', title: insight.title, message: insight.summary, regionId: insight.regionId, detail: insight.evidence as any };
  return existing ? this.prisma.systemAlert.update({ where: { id: existing.id }, data }) : this.prisma.systemAlert.create({ data: { type: 'business_insight', businessId: insight.id, status: 'pending', ...data } });
}
```

- [ ] **Step 7: Run tests, TypeScript, and commit**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/business-insight.service.spec.ts src/modules/analytics/business-insight.rules.spec.ts`

Expected: PASS, including two concurrent generation calls producing one fingerprint target.

Run: `cd backend && npx tsc --noEmit --incremental false -p tsconfig.json`

Expected: exit code 0.

```bash
git add backend/src/modules/analytics/business-insight.service.ts backend/src/modules/analytics/business-insight.service.spec.ts backend/src/modules/analytics/dto/analytics.dto.ts backend/src/modules/analytics/analytics.module.ts backend/src/modules/analytics/analytics.service.ts
git commit -m "feat: generate scoped business insights"
```

### Task 6: Transactional State Machine, Verification, Audit, and Repair

**Files:**
- Modify: `backend/src/modules/analytics/dto/analytics.dto.ts`
- Modify: `backend/src/modules/analytics/business-insight.service.ts`
- Modify: `backend/src/modules/analytics/business-insight.service.spec.ts`
- Create: `backend/scripts/inspect-business-insights.ts`

**Interfaces:**
- Produces: `accept`, `start`, `apply`, `dismiss`, `verify`, `rollback`, `close`, `verifyDue`, and `repair`.

- [ ] **Step 1: Add explicit action DTOs**

```ts
export class AcceptInsightDto { @IsString() ownerId!: string; @IsDateString() dueAt!: string; @IsOptional() @IsString() note?: string; }
export class StartInsightDto { @IsString() note!: string; }
export class ApplyInsightDto { @IsString() note!: string; @IsObject() changeSnapshot!: Record<string, unknown>; @IsInt() @Min(1) @Max(720) observeHours!: number; }
export class DismissInsightDto { @IsString() @MinLength(3) reason!: string; }
export class RollbackInsightDto { @IsString() reason!: string; @IsObject() rollbackSnapshot!: Record<string, unknown>; }
export class VerifyInsightDto { @IsOptional() @IsString() note?: string; }
export class CloseInsightDto { @IsOptional() @IsString() note?: string; }
```

- [ ] **Step 2: Write failing transition, idempotency, and outcome tests**

```ts
it('requires an owner when accepting', async () => await expect(service.accept('a1', 'i1', { ownerId: '', dueAt: '2026-07-30' } as any)).rejects.toThrow(BadRequestException));
it('returns the row unchanged for a repeated transition', async () => { prisma.businessInsight.findUnique.mockResolvedValue({ id: 'i1', status: 'accepted', regionId: 'r1', ownerId: 'a1' }); await expect(service.accept('a1', 'i1', dto)).resolves.toMatchObject({ status: 'accepted' }); });
it('returns 409 for an illegal transition', async () => { prisma.businessInsight.findUnique.mockResolvedValue({ id: 'i1', status: 'detected', regionId: 'r1' }); await expect(service.start('a1', 'i1', { note: '开始处理' })).rejects.toThrow(ConflictException); });
it('writes outcome and audit in one transaction', async () => { await service.verify('verifier', 'i1', {}); expect(prisma.$transaction).toHaveBeenCalled(); expect(tx.businessInsight.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'effective', outcome: 'effective', verifiedAt: expect.any(Date) }) })); expect(tx.adminOperationLog.create).toHaveBeenCalled(); });
```

- [ ] **Step 3: Implement one transition primitive and explicit transition map**

```ts
export const INSIGHT_TRANSITIONS: Record<string, string[]> = {
  detected: ['accepted', 'dismissed'], accepted: ['in_progress', 'dismissed'],
  in_progress: ['verifying'], verifying: ['effective', 'ineffective', 'worsened', 'inconclusive'],
  worsened: ['in_progress', 'rolled_back'], ineffective: ['in_progress', 'closed'],
  effective: ['closed'], inconclusive: ['verifying', 'closed'], dismissed: [], rolled_back: ['closed'], closed: [],
};

private async transition(accountId: string, id: string, next: string, data: Record<string, unknown>, detail: Record<string, unknown>) {
  const current = await this.requireScoped(accountId, id);
  if (current.status === next) return current;
  if (!INSIGHT_TRANSITIONS[current.status]?.includes(next)) throw new ConflictException({ message: `当前状态 ${current.status} 不能执行该操作`, currentStatus: current.status, allowed: INSIGHT_TRANSITIONS[current.status] || [] });
  return this.prisma.$transaction(async tx => {
    const updated = await tx.businessInsight.update({ where: { id }, data: { status: next, ...data } });
    await tx.adminOperationLog.create({ data: { accountId, action: next, module: 'business_insight', targetId: id, targetType: 'business_insight', detail: { from: current.status, to: next, ...detail } } });
    return updated;
  });
}

async accept(accountId: string, id: string, dto: AcceptInsightDto) {
  if (!dto.ownerId) throw new BadRequestException('接受洞察时必须指定负责人');
  const insight = await this.requireScoped(accountId, id);
  await this.adminDataScope.assertRegionAccess(dto.ownerId, insight.regionId, '负责人无权处理该区域');
  return this.transition(accountId, id, 'accepted', { ownerId: dto.ownerId, dueAt: new Date(dto.dueAt), operatorNote: dto.note }, { ownerId: dto.ownerId, dueAt: dto.dueAt, note: dto.note });
}

async start(accountId: string, id: string, dto: StartInsightDto) {
  return this.transition(accountId, id, 'in_progress', { operatorNote: dto.note }, { note: dto.note, startedAt: new Date().toISOString() });
}

async apply(accountId: string, id: string, dto: ApplyInsightDto) {
  if (!dto.changeSnapshot.operationLogId && !dto.changeSnapshot.objectId) throw new BadRequestException('应用记录必须包含 operationLogId 或 objectId');
  const appliedAt = new Date();
  const verificationDueAt = new Date(appliedAt.getTime() + dto.observeHours * 3_600_000);
  return this.transition(accountId, id, 'verifying', { operatorNote: dto.note, changeSnapshot: dto.changeSnapshot, appliedAt, verificationDueAt }, { note: dto.note, changeSnapshot: dto.changeSnapshot, observeHours: dto.observeHours, verificationDueAt });
}

async dismiss(accountId: string, id: string, dto: DismissInsightDto) {
  return this.transition(accountId, id, 'dismissed', { operatorNote: dto.reason }, { reason: dto.reason });
}

async rollback(accountId: string, id: string, dto: RollbackInsightDto) {
  if (!dto.rollbackSnapshot.operationLogId && !dto.rollbackSnapshot.objectId) throw new BadRequestException('回滚记录必须包含 operationLogId 或 objectId');
  return this.transition(accountId, id, 'rolled_back', { rollbackSnapshot: dto.rollbackSnapshot, operatorNote: dto.reason }, { reason: dto.reason, rollbackSnapshot: dto.rollbackSnapshot });
}

async close(accountId: string, id: string, dto: CloseInsightDto) {
  return this.transition(accountId, id, 'closed', { operatorNote: dto.note }, { note: dto.note });
}
```

- [ ] **Step 4: Implement verification and failure escalation**

```ts
async verify(accountId: string, id: string, dto: VerifyInsightDto) {
  if (!(await this.flag('business_insight_verify_enabled'))) throw new ServiceUnavailableException('洞察复测功能未启用');
  const insight = await this.requireScoped(accountId, id);
  if (insight.status !== 'verifying') return this.transition(accountId, id, insight.status, {}, {});
  const metric = await this.analytics.readMetric(accountId, insight.metricKey, { regionId: insight.regionId || undefined, businessType: insight.businessType, startDate: formatShanghaiDate(insight.periodStart), endDate: formatShanghaiDate(insight.periodEnd) });
  const outcome = evaluateOutcome({ current: metric.current, target: Number(insight.targetValue), direction: metric.direction, guardBreached: metric.guardBreached, sampleSize: metric.sampleSize, minSample: metric.minSample });
  return this.transition(accountId, id, outcome, { outcome, verificationValue: metric.current, verifiedAt: new Date() }, { note: dto.note, metric });
}
```

- [ ] **Step 5: Add read-only inspection and explicit repair modes**

```ts
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/services/prisma.service';
import { BusinessInsightService, INSIGHT_TRANSITIONS } from '../src/modules/analytics/business-insight.service';

type RepairMode = 'report' | 'dismiss-invalid' | 'retry-due';
async function main() {
  const mode = (process.argv[2] || 'report') as RepairMode;
  if (!['report', 'dismiss-invalid', 'retry-due'].includes(mode)) throw new Error('mode must be report, dismiss-invalid, or retry-due');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const insightService = app.get(BusinessInsightService);
  const summary = await prisma.businessInsight.groupBy({ by: ['status'], _count: true });
  const invalid = await prisma.businessInsight.findMany({ where: { OR: [{ evidence: { equals: Prisma.DbNull } }, { status: { notIn: Object.keys(INSIGHT_TRANSITIONS) } }] }, select: { id: true, status: true, fingerprint: true } });
  const due = await prisma.businessInsight.findMany({ where: { status: 'verifying', verificationDueAt: { lte: new Date() } }, select: { id: true, fingerprint: true } });
  if (mode === 'dismiss-invalid' && invalid.length) await prisma.businessInsight.updateMany({ where: { id: { in: invalid.map(item => item.id) } }, data: { status: 'dismissed', operatorNote: 'repair:dismiss-invalid' } });
  if (mode === 'retry-due') for (const item of due) await insightService.verifySystem(item.id);
  console.log(JSON.stringify({ mode, summary, invalid, due, changed: mode === 'dismiss-invalid' ? invalid.length : mode === 'retry-due' ? due.length : 0 }, null, 2));
  await app.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
```

- [ ] **Step 6: Run service tests and commit**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/business-insight.service.spec.ts`

Expected: PASS for legal/illegal/idempotent transitions, four outcomes, audit transaction, and repair report.

```bash
git add backend/src/modules/analytics/dto/analytics.dto.ts backend/src/modules/analytics/business-insight.service.ts backend/src/modules/analytics/business-insight.service.spec.ts backend/scripts/inspect-business-insights.ts
git commit -m "feat: close the insight action and verification loop"
```

### Task 7: Insight API, Scheduler Entry Points, Rules, Flags, and Role Seeds

**Files:**
- Modify: `backend/src/modules/analytics/analytics.controller.ts`
- Modify: `backend/src/modules/analytics/analytics.module.ts`
- Modify: `backend/src/modules/analytics/business-insight.service.ts`
- Modify: `backend/src/modules/analytics/dto/analytics.dto.ts`
- Modify: `backend/src/modules/analytics/analytics.controller.spec.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/src/modules/setup/setup.service.ts`

**Interfaces:**
- Produces: the exact `/admin/analytics/insights` API from the approved design.
- Produces: hourly detection and 15-minute due-verification methods guarded by feature flags and existing Redis locking.

- [ ] **Step 1: Write controller permission and role-map tests**

```ts
expect(permissionOf(controller, 'listInsights')).toEqual(['analytics:view']);
expect(permissionOf(controller, 'acceptInsight')).toEqual(['analytics:insight:manage']);
expect(permissionOf(controller, 'verifyInsight')).toEqual(['analytics:insight:verify']);
expect(permissionOf(controller, 'generateInsights')).toEqual(['analytics:insight:manage']);
expect(permissionOf(controller, 'saveRules')).toEqual(['analytics:ai:config']);
```

- [ ] **Step 2: Add validated rule/repair DTOs**

```ts
export class InsightRuleDto {
  @IsBoolean() enabled!: boolean;
  @IsString() ruleKey!: string;
  @IsString() metricKey!: string;
  @IsArray() @IsIn(['all', 'takeaway', 'errand', 'mall', 'second_hand'], { each: true }) businessTypes!: string[];
  @IsIn(['lt', 'lte', 'gt', 'gte', 'drop_pct']) operator!: string;
  @IsNumber() threshold!: number;
  @IsInt() @Min(1) minSample!: number;
  @IsInt() @Min(1) @Max(720) observeHours!: number;
  @IsIn(['low', 'medium', 'high', 'critical']) severity!: string;
  @IsString() title!: string;
  @IsString({ each: true }) recommendation!: string[];
  @IsString() actionRoute!: string;
  @IsNumber() targetValue!: number;
  @IsOptional() @IsString() guardMetricKey?: string;
  @IsString() rollbackHint!: string;
}
export class SaveInsightRulesDto { @IsInt() @Min(1) version = 1; @ValidateNested({ each: true }) @Type(() => InsightRuleDto) rules!: InsightRuleDto[]; }
export class RepairInsightsDto { @IsIn(['report', 'dismiss-invalid', 'retry-due']) mode!: string; @IsOptional() @IsString() reason?: string; }
export class SaveInsightFlagsDto {
  @IsBoolean() business_insight_read_enabled!: boolean;
  @IsBoolean() business_insight_write_enabled!: boolean;
  @IsBoolean() business_insight_verify_enabled!: boolean;
  @IsBoolean() business_insight_ai_enrichment_enabled!: boolean;
}
```

Add `IsArray` and `ValidateNested` to the `class-validator` import and `Type` from `class-transformer`.

- [ ] **Step 3: Add explicit endpoints without generic status mutation**

```ts
@Get('insights') @RequirePermission('analytics:view') listInsights(@CurrentUser('sub') accountId: string, @Query() query: InsightListDto) { return this.insights.list(accountId, query); }
@Get('insights/summary') @RequirePermission('analytics:view') insightSummary(@CurrentUser('sub') accountId: string, @Query() query: InsightListDto) { return this.insights.summary(accountId, query); }
@Get('insights/:id') @RequirePermission('analytics:view') insightDetail(@CurrentUser('sub') accountId: string, @Param('id') id: string) { return this.insights.detail(accountId, id); }
@Post('insights/:id/accept') @RequirePermission('analytics:insight:manage') acceptInsight(@CurrentUser('sub') accountId: string, @Param('id') id: string, @Body() dto: AcceptInsightDto) { return this.insights.accept(accountId, id, dto); }
@Post('insights/:id/start') @RequirePermission('analytics:insight:manage') startInsight(@CurrentUser('sub') accountId: string, @Param('id') id: string, @Body() dto: StartInsightDto) { return this.insights.start(accountId, id, dto); }
@Post('insights/:id/apply') @RequirePermission('analytics:insight:manage') applyInsight(@CurrentUser('sub') accountId: string, @Param('id') id: string, @Body() dto: ApplyInsightDto) { return this.insights.apply(accountId, id, dto); }
@Post('insights/:id/dismiss') @RequirePermission('analytics:insight:manage') dismissInsight(@CurrentUser('sub') accountId: string, @Param('id') id: string, @Body() dto: DismissInsightDto) { return this.insights.dismiss(accountId, id, dto); }
@Post('insights/:id/verify') @RequirePermission('analytics:insight:verify') verifyInsight(@CurrentUser('sub') accountId: string, @Param('id') id: string, @Body() dto: VerifyInsightDto) { return this.insights.verify(accountId, id, dto); }
@Post('insights/:id/rollback') @RequirePermission('analytics:insight:verify') rollbackInsight(@CurrentUser('sub') accountId: string, @Param('id') id: string, @Body() dto: RollbackInsightDto) { return this.insights.rollback(accountId, id, dto); }
@Post('insights/:id/close') @RequirePermission('analytics:insight:manage') closeInsight(@CurrentUser('sub') accountId: string, @Param('id') id: string, @Body() dto: CloseInsightDto) { return this.insights.close(accountId, id, dto); }
@Post('insights/generate') @RequirePermission('analytics:insight:manage') generateInsights(@CurrentUser('sub') accountId: string, @Body() dto: GenerateInsightsDto) { return this.insights.generate(accountId, dto); }
@Get('insights-config/rules') @RequirePermission('analytics:ai:config') getRules() { return this.insights.getRules(); }
@Put('insights-config/rules') @RequirePermission('analytics:ai:config') saveRules(@CurrentUser('sub') accountId: string, @Body() dto: SaveInsightRulesDto) { return this.insights.saveRules(accountId, dto); }
@Get('insights-config/flags') @RequirePermission('analytics:ai:config') getInsightFlags() { return this.insights.getFlags(); }
@Put('insights-config/flags') @RequirePermission('analytics:ai:config') saveInsightFlags(@CurrentUser('sub') accountId: string, @Body() dto: SaveInsightFlagsDto) { return this.insights.saveFlags(accountId, dto); }
@Post('insights-config/repair') @RequirePermission('analytics:ai:config') repairInsights(@CurrentUser('sub') accountId: string, @Body() dto: RepairInsightsDto) { return this.insights.repair(accountId, dto); }
```

`BusinessInsightService.generate()` must additionally enforce the approved role boundary before resolving scope:

```ts
const admin = await this.adminDataScope.getAdminContext(accountId);
if (!admin.isSuperAdmin && !admin.roleCodes.includes('platform_ops')) throw new ForbiddenException('仅平台运营或超级管理员可手动生成洞察');
```

`saveRules`, `saveFlags`, and `repair` must call this guard before writing:

```ts
private async requireSuperAdmin(accountId: string) {
  const admin = await this.adminDataScope.getAdminContext(accountId);
  if (!admin.isSuperAdmin) throw new ForbiddenException('仅超级管理员可修改全局规则、开关或执行修复');
}
```

Persist rules and flags together with an operation log in one transaction:

```ts
async saveRules(accountId: string, dto: SaveInsightRulesDto) {
  await this.requireSuperAdmin(accountId);
  return this.prisma.$transaction(async tx => {
    const saved = await tx.config.upsert({ where: { key: 'business_insight_rules_v1' }, create: { key: 'business_insight_rules_v1', group: 'analytics', value: dto as any, createdBy: accountId, updatedBy: accountId }, update: { value: dto as any, updatedBy: accountId } });
    await tx.adminOperationLog.create({ data: { accountId, action: 'save_rules', module: 'business_insight', targetId: saved.id, targetType: 'config', detail: { version: dto.version, ruleKeys: dto.rules.map(rule => rule.ruleKey) } } });
    return saved.value;
  });
}

async saveFlags(accountId: string, dto: SaveInsightFlagsDto) {
  await this.requireSuperAdmin(accountId);
  return this.prisma.$transaction(async tx => {
    for (const [key, value] of Object.entries(dto)) await tx.config.upsert({ where: { key }, create: { key, group: 'analytics', value, createdBy: accountId, updatedBy: accountId }, update: { value, updatedBy: accountId } });
    await tx.adminOperationLog.create({ data: { accountId, action: 'save_flags', module: 'business_insight', targetType: 'config', detail: dto as any } });
    return dto;
  });
}
```

- [ ] **Step 4: Add four permissions to both installation paths**

```ts
{ code: 'analytics:insight:manage', name: '处置业务洞察', module: 'analytics', action: 'insight:manage' },
{ code: 'analytics:insight:verify', name: '复测业务洞察', module: 'analytics', action: 'insight:verify' },
{ code: 'analytics:ai:run', name: '运行分析AI', module: 'analytics', action: 'ai:run' },
{ code: 'analytics:ai:config', name: '配置分析AI与规则', module: 'analytics', action: 'ai:config' },
```

Map `region_manager` to `analytics:view` and `analytics:insight:manage`; map `platform_ops` to those plus `analytics:insight:verify`; the existing all-permissions loop gives `super_admin` all five permissions.

- [ ] **Step 5: Add scheduled entry points with safe failure isolation**

```ts
@Interval(60 * 60 * 1000)
async detectScheduled() {
  if (!(await this.flag('business_insight_write_enabled'))) return;
  await this.redis.withLock('analytics:insight:detect', 55 * 60, async () => this.generateSystemScopes());
}

@Interval(15 * 60 * 1000)
async verifyScheduled() {
  if (!(await this.flag('business_insight_verify_enabled'))) return;
  const due = await this.prisma.businessInsight.findMany({ where: { status: 'verifying', verificationDueAt: { lte: new Date() } }, select: { id: true } });
  for (const item of due) await this.verifySystem(item.id).catch(error => this.recordScheduledFailure('verify', item.id, error));
}
```

Each detection and verification batch must emit one structured log through the existing `LoggerService`; three consecutive failures create one pending `SystemAlert`:

```ts
this.logger.log(JSON.stringify({ event: 'business_insight_detection', rules: result.rules, regions: result.regions, created: result.created, deduped: result.deduped, failed: result.failed, partial: result.partial, durationMs: Date.now() - startedAt }), 'BusinessInsightService');
if (result.failed > 0) await this.recordFailureCount('detection'); else await this.clearFailureCount('detection');
```

- [ ] **Step 6: Run tests, seed compile, and commit**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/analytics.controller.spec.ts src/modules/analytics/business-insight.service.spec.ts`

Expected: PASS.

Run: `cd backend && npx tsc --noEmit --incremental false -p tsconfig.json`

Expected: exit code 0.

```bash
git add backend/src/modules/analytics/analytics.controller.ts backend/src/modules/analytics/analytics.controller.spec.ts backend/src/modules/analytics/analytics.module.ts backend/src/modules/analytics/business-insight.service.ts backend/src/modules/analytics/dto/analytics.dto.ts backend/prisma/seed.ts backend/src/modules/setup/setup.service.ts
git commit -m "feat: expose insight workflow with role permissions"
```

### Task 8: Typed Admin API and Role-Aware Insight Work Queue

**Files:**
- Create: `admin/src/types/business-insight.ts`
- Create: `admin/src/views/analytics/BusinessInsights.vue`
- Modify: `admin/src/api/admin.ts`
- Modify: `admin/src/views/common/moduleTabs.ts`
- Modify: `admin/src/router/menus.ts`
- Modify: `admin/src/router/access.ts`

**Interfaces:**
- Consumes: Task 7 endpoints.
- Produces: `BusinessInsights.vue` with summary, filters, owner/due date, action route, detail timeline, apply evidence, verification, and rollback record.

- [ ] **Step 1: Add exact shared types and API functions**

```ts
export type InsightStatus = 'detected'|'accepted'|'in_progress'|'verifying'|'effective'|'ineffective'|'worsened'|'inconclusive'|'dismissed'|'rolled_back'|'closed';
export interface BusinessInsight { id: string; fingerprint: string; ruleKey: string; regionId?: string; region?: { id: string; name: string }; businessType: string; metricKey: string; severity: 'low'|'medium'|'high'|'critical'; status: InsightStatus; title: string; summary?: string; evidence: Record<string, unknown>; recommendation: { actions?: string[]; risk?: string[] }; actionRoute?: string; ownerId?: string; owner?: { id: string; realName: string }; baselineValue?: number; currentValue?: number; targetValue?: number; dueAt?: string; verificationDueAt?: string; outcome?: string; timeline?: Array<Record<string, unknown>>; }
export interface InsightPage { list: BusinessInsight[]; total: number; disabled?: boolean }
```

```ts
export const getBusinessInsights = (params: Record<string, unknown>) => request.get<any, InsightPage>('/admin/analytics/insights', { params });
export const getBusinessInsightSummary = (params: Record<string, unknown>) => request.get('/admin/analytics/insights/summary', { params });
export const getBusinessInsight = (id: string) => request.get(`/admin/analytics/insights/${id}`);
export const acceptBusinessInsight = (id: string, data: { ownerId: string; dueAt: string; note?: string }) => request.post(`/admin/analytics/insights/${id}/accept`, data);
export const startBusinessInsight = (id: string, data: { note: string }) => request.post(`/admin/analytics/insights/${id}/start`, data);
export const applyBusinessInsight = (id: string, data: { note: string; changeSnapshot: Record<string, unknown>; observeHours: number }) => request.post(`/admin/analytics/insights/${id}/apply`, data);
export const verifyBusinessInsight = (id: string, data: { note?: string }) => request.post(`/admin/analytics/insights/${id}/verify`, data);
export const getBusinessInsightRules = () => request.get('/admin/analytics/insights-config/rules');
export const saveBusinessInsightRules = (data: Record<string, unknown>) => request.put('/admin/analytics/insights-config/rules', data);
export const getBusinessInsightFlags = () => request.get('/admin/analytics/insights-config/flags');
export const saveBusinessInsightFlags = (data: Record<string, boolean>) => request.put('/admin/analytics/insights-config/flags', data);
export const repairBusinessInsights = (data: { mode: 'report'|'dismiss-invalid'|'retry-due'; reason?: string }) => request.post('/admin/analytics/insights-config/repair', data);
```

- [ ] **Step 2: Build the page around capabilities, not role names**

```ts
const auth = useAuthStore();
const canManage = computed(() => auth.permissions.includes('analytics:insight:manage'));
const canVerify = computed(() => auth.permissions.includes('analytics:insight:verify'));
const canConfigureAi = computed(() => auth.permissions.includes('analytics:ai:config'));
const filters = reactive({ regionId: '', businessType: '', severity: '', status: '', ownerId: '', overdue: false, page: 1, pageSize: 20 });
const openActionRoute = (row: BusinessInsight) => row.actionRoute && router.push({ path: row.actionRoute, query: { insightId: row.id, regionId: row.regionId } });
```

```vue
<template>
  <div class="insight-page">
    <PageHeader title="运营建议" description="从异常证据到处理、复测和结果的工作队列">
      <el-button v-if="canConfigureAi" @click="settingsOpen = true">规则与开关</el-button>
    </PageHeader>
    <StatGrid :items="[
      { label: '我的待办', value: summary.mine || 0 }, { label: '逾期', value: summary.overdue || 0 },
      { label: '高风险', value: summary.highRisk || 0 }, { label: '待复测', value: summary.verifying || 0 },
      { label: '处理效果', value: `${summary.effectiveRate || 0}%` },
    ]" />
    <section class="glass-card">
      <SearchPanel><el-select v-model="filters.regionId" placeholder="区域" clearable /><el-select v-model="filters.businessType" placeholder="业务" clearable /><el-select v-model="filters.severity" placeholder="风险" clearable /><el-select v-model="filters.status" placeholder="状态" clearable /><el-button type="primary" @click="load">查询</el-button></SearchPanel>
      <el-table :data="page.list" v-loading="loading">
        <el-table-column label="问题/证据" min-width="280"><template #default="{ row }"><strong>{{ row.title }}</strong><div>{{ row.summary }}</div></template></el-table-column>
        <el-table-column label="区域" prop="region.name" width="130" /><el-table-column label="负责人" prop="owner.realName" width="120" />
        <el-table-column label="截止时间" prop="dueAt" width="180" /><el-table-column label="状态" prop="status" width="120" />
        <el-table-column label="下一步" width="280"><template #default="{ row }"><el-button @click="openDetail(row)">查看证据</el-button><el-button v-if="canManage && row.actionRoute" type="primary" @click="openActionRoute(row)">去处理</el-button><el-button v-if="canVerify && row.status === 'verifying'" @click="verify(row)">立即复测</el-button></template></el-table-column>
      </el-table>
    </section>
    <el-drawer v-model="detailOpen" title="洞察详情" size="720px">
      <h3>发生了什么</h3><p>{{ selected?.summary }}</p>
      <h3>指标口径</h3><EvidencePanel :insight="selected" />
      <h3>建议动作</h3><ActionList :actions="selected?.recommendation?.actions || []" />
      <h3>风险与回滚</h3><ActionList :actions="selected?.recommendation?.risk || []" />
      <h3>应用记录</h3><pre>{{ selected?.changeSnapshot || '尚未提交' }}</pre>
      <h3>复测结果</h3><p>{{ selected?.outcome || '等待复测' }}</p>
      <h3>操作时间线</h3><InsightTimeline :items="selected?.timeline || []" />
      <InsightActions v-if="canManage || canVerify" :insight="selected" :can-manage="canManage" :can-verify="canVerify" @changed="reloadSelected" />
    </el-drawer>
    <el-drawer v-if="canConfigureAi" v-model="settingsOpen" title="规则、功能开关与修复">
      <InsightRuleEditor v-model="ruleConfig" /><InsightFlagEditor v-model="flags" />
      <el-button @click="runRepair('report')">检查数据</el-button><el-button @click="runRepair('retry-due')">重试到期复测</el-button>
    </el-drawer>
  </div>
</template>
```

Create the small page-local components `EvidencePanel`, `ActionList`, `InsightTimeline`, `InsightActions`, `InsightRuleEditor`, and `InsightFlagEditor` inside `BusinessInsights.vue`; they receive only the props shown above and emit `changed` or `update:modelValue`. Mutating controls use `canManage` or `canVerify`; AI key, global rules, feature flags, and repair controls use `canConfigureAi` only.

- [ ] **Step 3: Make the combined page decision-first and remove rider duplication**

```ts
business: [
  { key: 'insights', title: '运营建议', icon: 'Compass', component: asyncPage(() => import('@/views/analytics/BusinessInsights.vue')) },
  { key: 'overview', title: '业务总览', icon: 'DataLine', component: asyncPage(() => import('@/views/analytics/AnalyticsOverview.vue')) },
  { key: 'users', title: '用户', icon: 'User', component: asyncPage(() => import('@/views/analytics/UserAnalytics.vue')) },
  { key: 'content', title: '内容', icon: 'Document', component: asyncPage(() => import('@/views/analytics/ContentAnalytics.vue')) },
  { key: 'orders', title: '交易履约', icon: 'Tickets', component: asyncPage(() => import('@/views/analytics/OrderAnalytics.vue')) },
  { key: 'second-hand', title: '二手', icon: 'Goods', component: asyncPage(() => import('@/views/analytics/SecondHandAnalytics.vue')) },
]
```

Keep `/analytics/riders` as the single dedicated rider entry. Rename `/insights/business` from `业务分析` to `业务决策`.

- [ ] **Step 4: Run admin checks and commit**

Run: `cd admin && npm run typecheck 2>&1 | tee /tmp/business-insight-typecheck.log; ! rg 'src/(views/analytics|types/business-insight|api/admin.ts|views/common/moduleTabs.ts)' /tmp/business-insight-typecheck.log`

Expected: the full command exits 0 because no type error points to files changed in this task; pre-existing errors outside this scope may remain in the captured log.

Run: `cd admin && npm run build`

Expected: Vite build exits 0.

```bash
git add admin/src/types/business-insight.ts admin/src/views/analytics/BusinessInsights.vue admin/src/api/admin.ts admin/src/views/common/moduleTabs.ts admin/src/router/menus.ts admin/src/router/access.ts
git commit -m "feat: add role-aware business insight work queue"
```

### Task 9: Evidence Metadata, Filter Continuity, and Analytics Type Repairs

**Files:**
- Modify: `admin/src/views/analytics/AnalyticsOverview.vue`
- Modify: `admin/src/views/analytics/UserAnalytics.vue`
- Modify: `admin/src/views/analytics/ContentAnalytics.vue`
- Modify: `admin/src/views/analytics/OrderAnalytics.vue`
- Modify: `admin/src/views/analytics/SecondHandAnalytics.vue`

**Interfaces:**
- Consumes: unified `{ data, meta }` responses from Task 2.
- Produces: visible scope, period, freshness, sample size, quality, warnings, and consistent query filters.

- [ ] **Step 1: Replace untyped date ranges with exact tuples**

```ts
type DateRange = [Date, Date] | [];
const dateRange = ref<DateRange>([]);
function params() {
  const result: Record<string, string | undefined> = { regionId: filters.regionId || undefined };
  if (dateRange.value.length === 2) {
    const { startDate, endDate } = formatDateRangeParams(dateRange.value);
    result.startDate = startDate;
    result.endDate = endDate;
  }
  return result;
}
```

- [ ] **Step 2: Preserve both payload and metadata**

```ts
function normalized<T>(response: any): { data: T; meta: AnalyticsMeta | null } {
  if (response && typeof response === 'object' && 'meta' in response && 'data' in response) return response;
  return { data: response as T, meta: null };
}
const qualityLabel = computed(() => meta.value?.quality === 'partial' ? `数据不完整：${meta.value.warnings.join('；')}` : '数据完整');
```

Add labels `累计`, `所选周期`, `当前`, or `较上一等长周期` to every statistic card; show `支付事实：payTime` beside GMV/paid count and `退款事实：refundedAt` beside refund metrics.

- [ ] **Step 3: Link evidence drill-down back to the insight queue**

```ts
function viewRelatedInsights(metricKey: string) {
  router.push({ path: '/insights/business', query: { sub: 'insights', metricKey, regionId: filters.regionId || undefined, startDate: currentParams.startDate, endDate: currentParams.endDate } });
}
```

- [ ] **Step 4: Run scoped typecheck, build, and commit**

Run: `cd admin && npm run typecheck 2>&1 | tee /tmp/analytics-typecheck.log; ! rg 'src/views/analytics/' /tmp/analytics-typecheck.log`

Expected: no analytics-view type error, including the former tuple failures in `AnalyticsOverview.vue`, `OrderAnalytics.vue`, and `SecondHandAnalytics.vue`.

Run: `cd admin && npm run build`

Expected: Vite build exits 0.

```bash
git add admin/src/views/analytics/AnalyticsOverview.vue admin/src/views/analytics/UserAnalytics.vue admin/src/views/analytics/ContentAnalytics.vue admin/src/views/analytics/OrderAnalytics.vue admin/src/views/analytics/SecondHandAnalytics.vue
git commit -m "fix: expose trustworthy analytics evidence"
```

### Task 10: Region Workbench Compatibility and Rider AI Guardrails

**Files:**
- Modify: `backend/src/modules/admin/admin.module.ts`
- Modify: `backend/src/modules/admin/admin.controller.ts`
- Modify: `backend/src/modules/admin/admin.service.ts`
- Modify: `admin/src/views/dashboard/RegionOpsWorkbench.vue`
- Modify: `admin/src/views/analytics/RiderAnalytics.vue`
- Modify: `backend/src/modules/analytics/rider-ai-advisory.service.ts`
- Modify: `backend/src/modules/analytics/analytics.service.spec.ts`

**Interfaces:**
- Consumes: formal insight list and workflow APIs.
- Produces: old task response adapter backed by insights when read flag is enabled; old Redis tasks remain fallback only.
- Produces: AI quota decision `{ allowed, reason: 'ok'|'call_limit'|'cost_limit', calls, estimatedCost }`.

- [ ] **Step 1: Write failing AI call/cost/scope tests**

```ts
it('does not call the model after the Shanghai daily call limit', async () => { logsToday.mockResolvedValue({ calls: 20, estimatedCost: 1 }); const result = await service.runAnalysis(input); expect(global.fetch).not.toHaveBeenCalled(); expect(result.data.log.status).toBe('quota_skipped'); });
it('does not call the model after the configured cost limit', async () => { logsToday.mockResolvedValue({ calls: 1, estimatedCost: 20 }); const result = await service.runAnalysis(input); expect(global.fetch).not.toHaveBeenCalled(); expect(result.data.log.quota_reason).toBe('cost_limit'); });
it('passes only the configured region and business scope to metric collection', async () => { await service.runScheduledAnalysis(); expect(analytics.getRiderAlgorithmAnalytics).toHaveBeenCalledWith('system', expect.objectContaining({ regionId: 'r1', businessType: 'errand' })); });
```

- [ ] **Step 2: Enforce quota before fetch and calculate cost from usage**

```ts
const quota = await this.dailyQuota(config, new Date());
if (!quota.allowed) return this.storeRunLog({ status: 'quota_skipped', quota_reason: quota.reason, calls_today: quota.calls, estimated_cost_today: quota.estimatedCost });
const response = await fetch(modelUrl, request);
const usage = body.usage || {};
const estimatedCost = (Number(usage.prompt_tokens || 0) / 1_000_000) * config.promptPricePerMillion + (Number(usage.completion_tokens || 0) / 1_000_000) * config.completionPricePerMillion;
```

Configuration reads for users without `analytics:ai:config` return `{ enabled, provider, model, isConfigured: Boolean(apiKey), dailyCallLimit, dailyCostLimit, lastRun }` and never return `apiKey`.

- [ ] **Step 3: Adapt the region workbench and rider page**

Export `BusinessInsightService` from `AnalyticsModule`, import `AnalyticsModule` in `AdminModule`, inject the service into `AdminService`, and adapt the old endpoints without restoring manual completion:

```ts
async regionOpsTasks(accountId: string, regionId: string) {
  const formal = await this.businessInsights.list(accountId, { regionId, status: 'open', page: 1, pageSize: 50 });
  if (!formal.disabled) return { tasks: formal.list.map(item => ({ id: item.id, title: item.title, description: item.summary, priority: item.severity, status: item.status, actionRoute: item.actionRoute, dueAt: item.dueAt, insight: true })) };
  const cached = await this.redis.get(`ops:tasks:${regionId}`);
  return { tasks: cached ? JSON.parse(cached) : [], legacy: true };
}

async completeRegionOpsTask(accountId: string, regionId: string, taskId: string) {
  await this.adminDataScope.assertRegionAccess(accountId, regionId);
  throw new ConflictException({ message: '正式运营任务不能直接完成，请提交应用记录并进入复测', insightId: taskId, action: `/admin/analytics/insights/${taskId}/apply` });
}

async generateRegionOpsTasks(accountId: string, regionId: string) {
  return this.businessInsights.generate(accountId, { regionId, businessType: 'all' });
}
```

```ts
@Get('admin/ops/regions/:regionId/tasks')
@RequirePermission('analytics:view')
regionOpsTasks(@CurrentUser('sub') accountId: string, @Param('regionId') regionId: string) { return this.adminService.regionOpsTasks(accountId, regionId); }

@Post('admin/ops/regions/:regionId/tasks/:taskId/complete')
@RequirePermission('analytics:insight:manage')
completeRegionOpsTask(@CurrentUser('sub') accountId: string, @Param('regionId') regionId: string, @Param('taskId') taskId: string) { return this.adminService.completeRegionOpsTask(accountId, regionId, taskId); }

@Post('admin/ops/regions/:regionId/tasks/generate')
@RequirePermission('analytics:insight:manage')
generateRegionOpsTasks(@CurrentUser('sub') accountId: string, @Param('regionId') regionId: string) { return this.adminService.generateRegionOpsTasks(accountId, regionId); }
```

```ts
async function loadTasks() {
  try {
    const result = await getBusinessInsights({ regionId: filters.regionId, ownerId: auth.account?.id, status: 'open', page: 1, pageSize: 50 });
    tasks.value = result.list.map(toRegionTask);
  } catch {
    tasks.value = await loadLegacyRegionTasks();
  }
}
```

Remove the direct `完成` action. Replace it with `接受`, `开始处理`, `去业务页面`, and `提交应用记录`. Rider suggestions display `已生成正式洞察` with its ID when linked; unlinked historical suggestions remain read-only.

- [ ] **Step 4: Run backend/admin checks and commit**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/analytics.service.spec.ts`

Expected: PASS for quota, cost, scope, and deterministic fallback.

Run: `cd admin && npm run build`

Expected: Vite build exits 0.

```bash
git add backend/src/modules/admin/admin.module.ts backend/src/modules/admin/admin.controller.ts backend/src/modules/admin/admin.service.ts backend/src/modules/analytics/analytics.module.ts backend/src/modules/analytics/rider-ai-advisory.service.ts backend/src/modules/analytics/analytics.service.spec.ts admin/src/views/dashboard/RegionOpsWorkbench.vue admin/src/views/analytics/RiderAnalytics.vue
git commit -m "feat: migrate operator tasks and enforce AI limits"
```

### Task 11: Runbook, Full Local Verification, and Runtime Acceptance Gate

**Files:**
- Create: `docs/runbooks/business-insights.md`
- Modify only if a focused failure proves necessary: files changed in Tasks 1–10.

**Interfaces:**
- Produces: an operator runbook and an evidence table that separates implementation, local verification, and deployment/runtime proof.

- [ ] **Step 1: Write the runbook with exact rollout and rollback controls**

```md
# 业务洞察运行手册

## 上线顺序
1. 部署数据库迁移和后端，四个功能开关保持 false。
2. 验证旧分析页后开启 business_insight_read_enabled。
3. 影子区域开启 business_insight_write_enabled，只允许超级管理员查看。
4. 试点运营员验收后开启 business_insight_verify_enabled。
5. 指标、误报率和成本稳定后开启 business_insight_ai_enrichment_enabled。

## 回滚顺序
1. 关闭 business_insight_ai_enrichment_enabled。
2. 关闭 business_insight_verify_enabled。
3. 关闭 business_insight_write_enabled。
4. 关闭 business_insight_read_enabled。
5. 保留 business_insights、AdminOperationLog、SystemAlert 和 Config 历史。

## 告警检查
- 连续三次检测失败、复测失败、critical 逾期、复测积压、数据两个周期未更新、AI 成本接近上限。
- 每小时记录规则数、区域数、新建数、去重数、失败数、耗时和 partial 比例。

## 修复命令
- 只读报告：`npx ts-node scripts/inspect-business-insights.ts report`
- 标记非法记录：`npx ts-node scripts/inspect-business-insights.ts dismiss-invalid`
- 重试到期复测：`npx ts-node scripts/inspect-business-insights.ts retry-due`
```

- [ ] **Step 2: Run focused backend tests**

Run: `cd backend && npm test -- --runInBand src/modules/analytics/analytics-period.spec.ts src/modules/analytics/analytics.service.spec.ts src/modules/analytics/analytics.controller.spec.ts src/modules/analytics/business-insight.rules.spec.ts src/modules/analytics/business-insight.service.spec.ts`

Expected: all listed suites and tests pass.

- [ ] **Step 3: Run schema and backend compile checks**

Run: `cd backend && npx prisma validate && npm run db:generate && npx tsc --noEmit --incremental false -p tsconfig.json`

Expected: all three commands exit 0.

- [ ] **Step 4: Run admin scoped typecheck and build**

Run: `cd admin && npm run typecheck 2>&1 | tee /tmp/business-analytics-final-typecheck.log; ! rg 'src/(views/analytics|views/dashboard/RegionOpsWorkbench|types/business-insight|api/admin.ts|views/common/moduleTabs.ts)' /tmp/business-analytics-final-typecheck.log`

Expected: no error in the changed analytics/insight scope. Record unrelated pre-existing failures separately rather than reporting the whole repository as type-clean.

Run: `cd admin && npm run build`

Expected: Vite build exits 0.

- [ ] **Step 5: Run local database and multi-role acceptance**

Use a disposable local database with regions `A` and `B`, accounts `super_admin`, `platform_ops`, `region_manager_A`, and `region_manager_B`:

1. Deploy `202607220005_business_insights` and seed permissions.
2. Create a refund-rate anomaly only in region A.
3. Generate insights as platform operations; verify one fingerprint and one critical alert.
4. Confirm region A can list, accept, start, apply, and see its timeline.
5. Confirm region B gets HTTP 403 for direct detail and action requests against the same ID.
6. Move the due time into the past and run verification; confirm a real outcome and verification value.
7. Confirm super admin sees cross-region summary while regional accounts do not see the AI key or global rules.
8. Disable each feature flag in rollback order; confirm the old analytics pages still load and stored insight history remains.

Expected: all eight observations are captured with request IDs or screenshots; deployment remains marked unverified until repeated in the target environment.

- [ ] **Step 6: Commit documentation and final evidence**

```bash
git add docs/runbooks/business-insights.md
git commit -m "docs: add business insight rollout runbook"
```

---

## Self-Review Record

- Spec coverage: Tasks 1–2 cover P0 scope, dates, metric authority, metadata, and permission splitting; Tasks 3–7 cover the persistent model, rules, generation, dedupe, state machine, verification, audit, alerting, flags, scheduling, APIs, and role seeds; Tasks 8–10 cover role UI, real action routes, workbench compatibility, rider migration, and AI guardrails; Task 11 covers repair, monitoring, rollout, rollback, and multi-role acceptance.
- Dependency check: later services consume signatures defined in earlier tasks; `BusinessInsight` field names match the Prisma model, SQL migration, TypeScript types, and API usage.
- Minimality check: one new business table, four focused backend files, one new admin page, no new dependency, no automatic cross-domain changes.
- Runtime truth check: the plan explicitly separates automated checks, disposable local database acceptance, and target deployment proof.
