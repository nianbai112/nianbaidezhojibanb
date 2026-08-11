# Merchant Platform Identity and Console Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first locally complete merchant-platform foundation: correct administrator permission semantics, multi-store merchant organizations and staff roles, an isolated merchant Web session and console, three visible platform-admin entry points, safe legacy-category ownership, and dry-run-first migration tooling.

**Architecture:** Keep the existing NestJS application, Merchant store model, Vue administrator build, user identity, SMS provider, and regional admin data-scope service authoritative. Add one MerchantIdentityModule as the shared merchant authorization boundary; issue merchant-only JWTs with audience merchant_web; derive every store action from server-side membership and roles; add /merchant-console routes inside the existing Vue build with independent storage, HTTP, state, layout, and guards; preserve Merchant.userId only as a temporary compatibility read while backfill and double-read evidence are collected.

**Tech Stack:** NestJS, Prisma, PostgreSQL/MySQL schema parity, Redis, Jest, Node test runner, Vue 3, Pinia, Vue Router, Axios, Element Plus, TypeScript.

## Global Constraints

- This plan covers only stage 0 item M0-01 and stage 1 of the approved master design. Redis lock repair, payment idempotency, rider pagination, graceful shutdown, readiness, rate limiting, merchant order operations, merchant finance, mini-program UX, rider workflows, and production high availability require separate plans.
- Do not create a second order, payment, refund, user, merchant, admin, SMS, or agreement subsystem.
- Do not copy Boolc or Keloop source code, text, icons, visual assets, credentials, tokens, or private data. The external products were workflow references only.
- Before implementation, load superpowers:using-git-worktrees and create an isolated worktree from commit e13189b or a newer reviewed clean baseline. Never implement this plan in the current dirty checkout.
- The current dirty checkout contains user-owned campus-map and editor work. Inspect git status before every task and stage only the exact files named by that task.
- Use Node 22 for dependency install, Prisma generation, backend tests, admin typecheck, and builds. Record node --version in the acceptance evidence.
- Use test-driven development for every behavioral change: add a failing test, run it and verify the expected failure, implement the smallest change, rerun the focused test, then commit.
- Keep backend/prisma/schema.prisma, schema.postgresql.prisma, and schema.mysql.prisma structurally equivalent by editing the main schema and running the repository schema-sync tool.
- Deliver additive PostgreSQL and MySQL migration SQL. Do not delete Merchant.userId, rename existing tables, overwrite historical owners, or mutate production data.
- Audit and backfill commands default to read-only. Only --apply may write, and this plan must not run --apply against production.
- Administrator, ordinary-user, and merchant access tokens are separate security realms. A token issued for one realm must be rejected by the other two.
- Merchant Web must use LM_MERCHANT_* browser keys only. It must never read, write, clear, or send LM_ADMIN_* or ordinary mini-program tokens.
- The backend is the authorization boundary. Frontend allowedActions control visibility only; every write request performs a fresh server-side authorization check.
- API responses use 401 for expired merchant sessions, 403 for a known store without permission, 404 when hiding an inaccessible resource, 409 for role/state conflicts, 422 for field-level business validation, and 429 for the existing SMS throttle.
- No fake metrics, dead menus, placeholder buttons, or simulated successful writes. A not-yet-built business module appears as an explicitly disabled future entry or is omitted.
- Local unit tests, local integration tests, disposable-database migration evidence, browser evidence, deployed production, and real traffic are separate gates. This plan ends at local evidence.
- The approved merchant-finance documents remain downstream consumers:
  - docs/superpowers/specs/2026-07-26-merchant-finance-payout-funding-design.md
  - docs/superpowers/plans/2026-07-26-merchant-finance-payout-funding.md
  They must consume MerchantAccessService and the merchant console realm produced here instead of creating another merchant identity stack.

---

## Execution Kickoff Checklist

Complete these read-only checks before Task 1. They do not create a task commit:

~~~bash
git status --short --branch
git worktree list --porcelain
git show --stat --oneline e13189b
git fsck --full --no-reflogs
git log --oneline --decorate --all -- docs/superpowers/specs/2026-07-29-takeout-four-surface-platform-master-design.md
node --version
~~~

- Treat e13189b as the minimum approved design baseline; if a newer candidate baseline exists, review its diff before choosing it.
- Inspect codex/merchant-finance-v2 and any linked worktree read-only. Reuse only individually readable, relevant commits after comparing them with this plan; do not merge a stale branch or worktree wholesale.
- Load superpowers:using-git-worktrees, create a dedicated codex/merchant-platform-foundation branch/worktree, and prove its initial status is clean.
- If git fsck reports missing objects for the stale finance branch, record that as a branch-specific blocker and continue from the approved clean baseline; do not repair or delete user Git objects without separate authorization.
- Switch to Node 22 before installing, generating Prisma, testing, or building.

### Task 1: M0-01 — Fix administrator any-permission semantics

**Files:**

- Modify: backend/src/guards/admin.guard.ts
- Modify: backend/src/guards/admin.guard.spec.ts

**Interfaces consumed:**

- Metadata key admin_permissions from RequirePermission.
- Metadata key admin_permissions_any from RequirePermissionAny.
- request.user = { sub, isAdmin } populated by JwtGuard.

**Interface produced:**

- AdminPermissionGuard evaluates all required-all permissions and at least one required-any permission before allowing a non-super-admin request.

- [ ] **Step 1: Add focused failing tests**

Add an AdminPermissionGuard describe block with table-driven cases for:

1. neither metadata key: allow without a database query;
2. only admin_permissions_any and one matching permission: allow;
3. only admin_permissions_any and no matching permission: reject;
4. admin_permissions plus admin_permissions_any: require all of the first set and one of the second;
5. super_admin and SUPER_ADMIN: allow;
6. missing or non-admin request user: reject.

Use a reflector mock that returns metadata by key:

~~~ts
const reflector = {
  getAllAndOverride: jest.fn((key: string) => metadata[key]),
};

const context = {
  getHandler: () => function handler() {},
  getClass: () => class Controller {},
  switchToHttp: () => ({
    getRequest: () => ({ user: requestUser }),
  }),
} as any;
~~~

- [ ] **Step 2: Run the new tests and confirm the security regression**

Run:

~~~bash
npm --prefix backend test -- admin.guard.spec.ts --runInBand
~~~

Expected: the only-any rejection case fails because the current guard returns before reading admin_permissions_any.

- [ ] **Step 3: Read both metadata keys before the empty-requirement return**

Replace the early logic with:

~~~ts
const requiredAll = this.reflector.getAllAndOverride<string[]>(
  'admin_permissions',
  [context.getHandler(), context.getClass()],
) ?? [];
const requiredAny = this.reflector.getAllAndOverride<string[]>(
  'admin_permissions_any',
  [context.getHandler(), context.getClass()],
) ?? [];

if (requiredAll.length === 0 && requiredAny.length === 0) {
  return true;
}
~~~

After loading the permission set, enforce both conditions:

~~~ts
const missingAll = requiredAll.filter((code) => !userPermissions.has(code));
if (missingAll.length > 0) {
  throw new UnauthorizedException('缺少权限: ' + missingAll.join(', '));
}

if (
  requiredAny.length > 0
  && !requiredAny.some((code) => userPermissions.has(code))
) {
  throw new UnauthorizedException(
    '缺少权限: ' + requiredAny.join(' 或 '),
  );
}
~~~

Do not refactor AdminGuard, SuperAdminGuard, roles, or database queries beyond what this fix requires.

- [ ] **Step 4: Run focused and guard regression tests**

Run:

~~~bash
npm --prefix backend test -- admin.guard.spec.ts --runInBand
~~~

Expected: PASS, including the original AdminGuard and SuperAdminGuard tests.

- [ ] **Step 5: Commit the isolated security fix**

~~~bash
git add backend/src/guards/admin.guard.ts backend/src/guards/admin.guard.spec.ts
git commit -m "fix: enforce administrator any-permission metadata"
~~~

### Task 2: Define the five-role merchant permission contract

**Files:**

- Create: backend/src/modules/merchant-identity/merchant-permissions.ts
- Create: backend/src/modules/merchant-identity/merchant-permissions.spec.ts

**Interfaces consumed:**

- Approved roles: owner, manager, order_clerk, product_clerk, finance.
- Approved capability matrix in the master design.

**Interfaces produced:**

~~~ts
export type MerchantRoleKey =
  | 'owner'
  | 'manager'
  | 'order_clerk'
  | 'product_clerk'
  | 'finance';

export type MerchantPermission =
  | 'merchant:dashboard:view'
  | 'merchant:order:view'
  | 'merchant:order:manage'
  | 'merchant:refund:view'
  | 'merchant:refund:handle'
  | 'merchant:product:view'
  | 'merchant:product:manage'
  | 'merchant:inventory:manage'
  | 'merchant:store:view'
  | 'merchant:store:update'
  | 'merchant:staff:view'
  | 'merchant:staff:manage'
  | 'merchant:finance:view'
  | 'merchant:settlement:manage'
  | 'merchant:payout-account:manage'
  | 'merchant:printer:view'
  | 'merchant:printer:manage';
~~~

- [ ] **Step 1: Write the failing contract tests**

Test the complete matrix, deduplication, unknown-role rejection, grant boundaries, and last-owner policy:

~~~ts
expect(permissionsForRoles(['owner']))
  .toEqual(expect.arrayContaining(MERCHANT_PERMISSIONS));
expect(permissionsForRoles(['order_clerk'])).toEqual([
  'merchant:dashboard:view',
  'merchant:order:view',
  'merchant:order:manage',
  'merchant:refund:view',
  'merchant:refund:handle',
  'merchant:printer:view',
]);
expect(() => permissionsForRoles(['custom_admin']))
  .toThrow('未知商户角色');
expect(canManageRoleSet(['manager'], ['order_clerk'])).toBe(true);
expect(canManageRoleSet(['manager'], ['finance'])).toBe(false);
expect(canManageRoleSet(['owner'], ['finance'])).toBe(true);
~~~

Also assert that finance cannot manage payout accounts and manager cannot view finance.

- [ ] **Step 2: Run the test and confirm the module is missing**

Run:

~~~bash
npm --prefix backend test -- merchant-permissions.spec.ts --runInBand
~~~

Expected: FAIL because merchant-permissions.ts does not exist.

- [ ] **Step 3: Implement immutable role and permission constants**

Implement these exports:

~~~ts
export const MERCHANT_ROLE_KEYS = [
  'owner',
  'manager',
  'order_clerk',
  'product_clerk',
  'finance',
] as const;

export const MERCHANT_PERMISSIONS = [
  'merchant:dashboard:view',
  'merchant:order:view',
  'merchant:order:manage',
  'merchant:refund:view',
  'merchant:refund:handle',
  'merchant:product:view',
  'merchant:product:manage',
  'merchant:inventory:manage',
  'merchant:store:view',
  'merchant:store:update',
  'merchant:staff:view',
  'merchant:staff:manage',
  'merchant:finance:view',
  'merchant:settlement:manage',
  'merchant:payout-account:manage',
  'merchant:printer:view',
  'merchant:printer:manage',
] as const;
~~~

Use a readonly ROLE_PERMISSIONS record with this exact policy:

- owner: every permission;
- manager: dashboard, order view/manage, refund view/handle, product view/manage, inventory manage, store view/update, staff view/manage, printer view/manage;
- order_clerk: dashboard, order view/manage, refund view/handle, printer view;
- product_clerk: dashboard, product view/manage, inventory manage, store view, printer view;
- finance: dashboard, refund view, finance view, settlement manage.

Implement:

~~~ts
export function isMerchantRoleKey(value: string): value is MerchantRoleKey;
export function permissionsForRoles(
  roles: readonly string[],
): MerchantPermission[];
export function canManageRoleSet(
  actorRoles: readonly MerchantRoleKey[],
  targetRoles: readonly MerchantRoleKey[],
): boolean;
export function assertAtLeastOneOwner(
  currentOwnerCount: number,
  removesOwner: boolean,
): void;
~~~

Only owner may grant or change owner, manager, or finance. Manager may manage order_clerk and product_clerk. No action may remove the final owner.

- [ ] **Step 4: Run focused tests**

Run:

~~~bash
npm --prefix backend test -- merchant-permissions.spec.ts --runInBand
~~~

Expected: PASS.

- [ ] **Step 5: Commit the shared permission contract**

~~~bash
git add backend/src/modules/merchant-identity/merchant-permissions.ts backend/src/modules/merchant-identity/merchant-permissions.spec.ts
git commit -m "feat: define merchant role permission contract"
~~~

### Task 3: Add merchant organization, membership, store-role, and category-scope schema

**Files:**

- Create: backend/src/modules/merchant-identity/merchant-identity.schema.spec.ts
- Modify: backend/prisma/schema.prisma
- Modify: backend/prisma/schema.postgresql.prisma
- Modify: backend/prisma/schema.mysql.prisma
- Create: backend/prisma/migrations/202607290001_merchant_platform_identity/migration.sql
- Create: backend/prisma/additive-migrations/postgresql/202607290001_merchant_platform_identity.sql
- Create: backend/prisma/additive-migrations/mysql/202607290001_merchant_platform_identity.sql

**Interfaces consumed:**

- Existing User, Merchant, Category, Product, and Merchant.userId data.
- Schema synchronization command backend/scripts/sync-prisma-schema-variants.cjs.

**Interfaces produced:**

- MerchantOrganization is the operating entity.
- Merchant remains a store and gains optional organizationId.
- MerchantMember represents a phone/user membership.
- MerchantMemberStoreRole maps a member to a built-in role at a store.
- Category explicitly distinguishes platform templates from store-owned categories.

- [ ] **Step 1: Write a failing three-schema contract test**

Read all three Prisma schema files and assert the models, relations, unique keys, category scope, and retained legacy field:

~~~ts
const schemaFiles = [
  'prisma/schema.prisma',
  'prisma/schema.postgresql.prisma',
  'prisma/schema.mysql.prisma',
];

it.each(schemaFiles)('%s contains merchant identity contract', (file) => {
  const schema = readFileSync(resolve(process.cwd(), file), 'utf8');
  expect(schema).toContain('model MerchantOrganization');
  expect(schema).toContain('model MerchantMember');
  expect(schema).toContain('model MerchantMemberStoreRole');
  expect(schema).toMatch(/organizationId\s+String\?/);
  expect(schema).toMatch(/sessionVersion\s+Int\s+@default\(1\)/);
  expect(schema).toContain('@@unique([organizationId, phone])');
  expect(schema).toContain('@@unique([memberId, merchantId, roleKey])');
  expect(schema).toMatch(/scopeType\s+String\s+@default\("platform"\)/);
  expect(schema).toMatch(/userId\s+String\?/);
});
~~~

- [ ] **Step 2: Run and observe missing-schema failures**

Run:

~~~bash
npm --prefix backend test -- merchant-identity.schema.spec.ts --runInBand
~~~

Expected: FAIL for MerchantOrganization.

- [ ] **Step 3: Add the exact Prisma models and named relations**

Add:

~~~prisma
model MerchantOrganization {
  id          String   @id @default(cuid())
  name        String
  status      String   @default("active")
  ownerUserId String
  ownerUser   User     @relation("MerchantOrganizationOwner", fields: [ownerUserId], references: [id], onDelete: Restrict)
  shops       Merchant[]
  members     MerchantMember[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([ownerUserId, status])
  @@map("merchant_organizations")
}

model MerchantMember {
  id             String               @id @default(cuid())
  organizationId String
  organization   MerchantOrganization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String?
  user           User?                @relation("MerchantOrganizationMembers", fields: [userId], references: [id], onDelete: SetNull)
  phone          String
  status         String               @default("invited")
  sessionVersion Int                  @default(1)
  invitedById    String?
  invitedBy      User?                @relation("MerchantMemberInviter", fields: [invitedById], references: [id], onDelete: SetNull)
  roles          MerchantMemberStoreRole[]
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  @@unique([organizationId, phone])
  @@unique([organizationId, userId])
  @@index([userId, status])
  @@map("merchant_members")
}

model MerchantMemberStoreRole {
  id         String         @id @default(cuid())
  memberId   String
  member     MerchantMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  merchantId String
  merchant   Merchant       @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  roleKey    String
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt

  @@unique([memberId, merchantId, roleKey])
  @@index([merchantId, roleKey])
  @@map("merchant_member_store_roles")
}
~~~

Add named User relations:

~~~prisma
ownedMerchantOrganizations MerchantOrganization[] @relation("MerchantOrganizationOwner")
merchantMemberships        MerchantMember[]       @relation("MerchantOrganizationMembers")
invitedMerchantMembers     MerchantMember[]       @relation("MerchantMemberInviter")
~~~

Add to Merchant:

~~~prisma
organizationId String?
organization   MerchantOrganization?    @relation(fields: [organizationId], references: [id], onDelete: SetNull)
memberRoles    MerchantMemberStoreRole[]
scopedCategories Category[]             @relation("MerchantScopedCategories")
~~~

Name the existing Merchant-to-Category relation MerchantBusinessCategory on both sides. Add to Category:

~~~prisma
scopeType    String    @default("platform")
merchantId   String?
scopeMerchant Merchant? @relation("MerchantScopedCategories", fields: [merchantId], references: [id], onDelete: Cascade)
~~~

Add index:

~~~prisma
@@index([merchantId, businessType, type, status])
~~~

Retain Merchant.userId and its relation unchanged.

- [ ] **Step 4: Synchronize schema variants**

Run:

~~~bash
npm --prefix backend run db:sync-schemas
npm --prefix backend run db:sync-schemas -- --check
~~~

Expected: the check reports all schema variants synchronized.

- [ ] **Step 5: Add additive PostgreSQL and MySQL migration SQL**

The PostgreSQL migration and additive copy must:

1. create merchant_organizations, merchant_members, merchant_member_store_roles;
2. add merchants.organizationId, categories.scopeType default platform, categories.merchantId;
3. add foreign keys and the exact unique/index contract;
4. leave all legacy categories as platform with null merchantId;
5. perform no owner backfill and delete no data.

The MySQL additive script must use the repository information_schema/idempotent procedure style and be safe to rerun. It must create the same logical tables, columns, foreign keys, and indexes without introducing database enums.

- [ ] **Step 6: Generate Prisma and run schema tests**

Run:

~~~bash
npm --prefix backend run db:generate
npm --prefix backend test -- merchant-identity.schema.spec.ts --runInBand
npm --prefix backend run db:sync-schemas -- --check
~~~

Expected: PASS.

- [ ] **Step 7: Commit only the schema foundation**

~~~bash
git add backend/prisma/schema.prisma backend/prisma/schema.postgresql.prisma backend/prisma/schema.mysql.prisma backend/prisma/migrations/202607290001_merchant_platform_identity/migration.sql backend/prisma/additive-migrations/postgresql/202607290001_merchant_platform_identity.sql backend/prisma/additive-migrations/mysql/202607290001_merchant_platform_identity.sql backend/src/modules/merchant-identity/merchant-identity.schema.spec.ts
git commit -m "feat: add merchant organization identity schema"
~~~

### Task 4: Build read-only audit and explicit backfill tooling

**Files:**

- Create: backend/scripts/merchant-platform-foundation.helpers.cjs
- Create: backend/scripts/merchant-platform-foundation.helpers.test.cjs
- Create: backend/scripts/audit-merchant-platform-foundation.cjs
- Create: backend/scripts/backfill-merchant-platform-foundation.cjs
- Modify: backend/package.json
- Create: docs/runbooks/merchant-platform-foundation-migration.md

**Interfaces consumed:**

- Legacy Merchant.userId, Merchant.name, Merchant.organizationId, User.phone.
- Legacy Category rows and Product category references.
- New MerchantOrganization, MerchantMember, and MerchantMemberStoreRole models.

**Interfaces produced:**

- npm run merchant-platform:audit performs read-only inventory.
- npm run merchant-platform:backfill performs dry-run by default.
- npm run merchant-platform:backfill -- --apply is the only write path.

- [ ] **Step 1: Write failing pure planning tests with node:test**

Test classifyMerchantOwners and buildBackfillPlan using fixed fixtures:

~~~js
const rows = [
  { id: 'shop-a', name: 'A店', userId: 'user-1', organizationId: null, user: { phone: '13800000001' } },
  { id: 'shop-b', name: 'B店', userId: 'user-1', organizationId: null, user: { phone: '13800000001' } },
  { id: 'shop-c', name: 'C店', userId: null, organizationId: null, user: null },
];

assert.deepEqual(classifyMerchantOwners(rows).ready[0].shopIds, [
  'shop-a',
  'shop-b',
]);
assert.equal(classifyMerchantOwners(rows).unresolved[0].reason, 'missing_user');
~~~

Also test:

- owner missing phone is unresolved;
- stores already sharing an organization are unchanged;
- a user whose stores point to different organizations is a conflict;
- category audit classifies every legacy null-scope row as platform-template and reports cross-store usage;
- rerunning a planned, already-applied fixture produces zero writes.

- [ ] **Step 2: Run and confirm the helper is missing**

Run:

~~~bash
node --test backend/scripts/merchant-platform-foundation.helpers.test.cjs
~~~

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement deterministic, side-effect-free planning helpers**

Export:

~~~js
module.exports = {
  classifyMerchantOwners,
  classifyLegacyCategories,
  buildBackfillPlan,
  summarizeBackfillPlan,
};
~~~

The summary must contain numeric counts for:

~~~js
{
  storesScanned: 0,
  alreadyLinkedStores: 0,
  organizationsToCreate: 0,
  membershipsToCreate: 0,
  ownerRolesToCreate: 0,
  unresolvedOwners: 0,
  organizationConflicts: 0,
  legacyCategories: 0,
  sharedCategoryReferences: 0,
}
~~~

- [ ] **Step 4: Implement the read-only audit command**

audit-merchant-platform-foundation.cjs may issue findMany/count/groupBy queries only. It prints one JSON document containing summary, unresolved rows, conflicts, and the planned organization grouping. It must never call create, update, upsert, delete, executeRaw, or transaction.

Both CLI entrypoints must handle --help and exit before creating PrismaClient or reading DATABASE_URL.

Add package script:

~~~json
"merchant-platform:audit": "node scripts/audit-merchant-platform-foundation.cjs"
~~~

- [ ] **Step 5: Implement dry-run-first backfill**

backfill-merchant-platform-foundation.cjs:

- parses process.argv.includes('--apply');
- always builds and prints the full plan before any write;
- returns exit code 2 when conflicts or unresolved owners exist and --apply is present;
- does no writes without --apply;
- uses one transaction per owner group when --apply is present;
- reuses an existing consistent organization or creates one named from the first stable store name plus “经营主体”;
- upserts MerchantMember by organizationId_phone with status active;
- creates owner roles with createMany and skipDuplicates;
- updates only stores still having organizationId null;
- never deletes or clears Merchant.userId;
- never rewrites category ownership; legacy categories remain platform templates.

Add package script:

~~~json
"merchant-platform:backfill": "node scripts/backfill-merchant-platform-foundation.cjs"
~~~

- [ ] **Step 6: Write the migration runbook**

The runbook must include these gates in order:

1. resolve DATABASE_URL target and print database host/name without credentials;
2. create a database backup and record its path or provider snapshot ID;
3. run audit;
4. run dry-run backfill;
5. resolve every conflict;
6. apply migration only to a disposable local clone;
7. run backfill with --apply only on that clone;
8. rerun audit and dry-run, expecting zero new writes;
9. record rollback as database restore, not reverse SQL;
10. state that production execution needs a separate user confirmation.

- [ ] **Step 7: Run pure tests and command help without touching a database**

Run:

~~~bash
node --test backend/scripts/merchant-platform-foundation.helpers.test.cjs
node backend/scripts/audit-merchant-platform-foundation.cjs --help
node backend/scripts/backfill-merchant-platform-foundation.cjs --help
~~~

Expected: helper tests PASS; both commands print usage and exit 0 without constructing PrismaClient or opening a database connection. Database audit/dry-run evidence is deferred to Task 15 after the exact disposable target and backup are confirmed.

- [ ] **Step 8: Commit tooling and runbook**

~~~bash
git add backend/scripts/merchant-platform-foundation.helpers.cjs backend/scripts/merchant-platform-foundation.helpers.test.cjs backend/scripts/audit-merchant-platform-foundation.cjs backend/scripts/backfill-merchant-platform-foundation.cjs backend/package.json docs/runbooks/merchant-platform-foundation-migration.md
git commit -m "feat: add merchant identity migration audit tooling"
~~~

### Task 5: Implement MerchantAccessService as the single store authorization boundary

**Files:**

- Create: backend/src/modules/merchant-identity/merchant-access.types.ts
- Create: backend/src/modules/merchant-identity/merchant-access.service.ts
- Create: backend/src/modules/merchant-identity/merchant-access.service.spec.ts
- Create: backend/src/modules/merchant-identity/merchant-identity.module.ts
- Modify: backend/src/app.module.ts

**Interfaces consumed:**

- Merchant organization/member/store-role schema.
- permissionsForRoles from Task 2.
- Temporary Merchant.userId legacy ownership.

**Interfaces produced:**

~~~ts
export type MerchantAccessContext = {
  userId: string;
  memberId: string | null;
  organizationId: string | null;
  merchantId: string;
  roles: MerchantRoleKey[];
  permissions: MerchantPermission[];
  source: 'member' | 'legacy_owner';
};

export type MerchantShopAccess = {
  merchantId: string;
  organizationId: string;
  name: string;
  logo: string | null;
  status: string;
  regionId: string | null;
  roles: MerchantRoleKey[];
  allowedActions: MerchantPermission[];
};
~~~

- [ ] **Step 1: Write failing authorization matrix tests**

Cover:

- active member with the requested store role is allowed;
- permission absent from role is 403;
- store belongs to another organization is 403;
- invited, disabled, suspended, closed, rejected, and missing identities are rejected;
- role rows for another store do not grant access;
- legacy Merchant.userId owner receives owner permissions with source legacy_owner;
- listAccessibleShops returns only active/approved stores with valid roles;
- unknown role rows fail closed and are not silently treated as owner.

Use Prisma mocks with explicit findUnique/findMany results. Never test by passing merchantId from a DTO into a service mock that automatically trusts it.

- [ ] **Step 2: Run and observe missing-service failure**

Run:

~~~bash
npm --prefix backend test -- merchant-access.service.spec.ts --runInBand
~~~

Expected: FAIL because MerchantAccessService does not exist.

- [ ] **Step 3: Implement normalized access resolution**

Expose:

~~~ts
async requireStorePermission(
  userId: string,
  merchantId: string,
  permission: MerchantPermission,
): Promise<MerchantAccessContext>;

async listAccessibleShops(
  userId: string,
  organizationId?: string,
): Promise<MerchantShopAccess[]>;

async assertActiveSession(input: {
  userId: string;
  memberId: string;
  organizationId: string;
  sessionVersion: number;
}): Promise<MerchantMember>;
~~~

Resolution order:

1. load the store and its organization status;
2. load active membership and roles for that exact merchantId;
3. validate each role with isMerchantRoleKey;
4. derive permissions from the contract;
5. reject if the requested permission is absent;
6. only if no new membership exists and Merchant.userId equals userId, return legacy_owner;
7. never infer ownership from phone, request body, query string, or frontend state.

The legacy fallback is allowed for existing mini-program merchant calls only. Merchant Web login in Task 6 must require a real MerchantMember and must never issue a merchant token from the fallback.

- [ ] **Step 4: Register and export the module**

MerchantIdentityModule imports PrismaModule and exports MerchantAccessService. Register it in AppModule. Do not import ShopModule, PaymentModule, or AdminModule into MerchantIdentityModule.

- [ ] **Step 5: Run focused tests and compile**

Run:

~~~bash
npm --prefix backend test -- merchant-permissions.spec.ts merchant-access.service.spec.ts --runInBand
npm --prefix backend run build
~~~

Expected: PASS and successful backend build.

- [ ] **Step 6: Commit the access boundary**

~~~bash
git add backend/src/modules/merchant-identity/merchant-access.types.ts backend/src/modules/merchant-identity/merchant-access.service.ts backend/src/modules/merchant-identity/merchant-access.service.spec.ts backend/src/modules/merchant-identity/merchant-identity.module.ts backend/src/app.module.ts
git commit -m "feat: add merchant store authorization boundary"
~~~

### Task 6: Add merchant-only phone authentication, token separation, and agreement consent

**Files:**

- Modify: backend/src/modules/auth/auth.service.ts
- Create: backend/src/modules/auth/auth.phone-identity.spec.ts
- Modify: backend/src/common/services/redis.service.ts
- Modify: backend/src/common/services/redis.service.spec.ts
- Modify: backend/src/guards/jwt.guard.ts
- Create: backend/src/guards/jwt.guard.spec.ts
- Create: backend/src/modules/merchant-identity/dto/merchant-auth.dto.ts
- Create: backend/src/modules/merchant-identity/merchant-auth.service.ts
- Create: backend/src/modules/merchant-identity/merchant-auth.service.spec.ts
- Create: backend/src/modules/merchant-identity/merchant-auth.controller.ts
- Create: backend/src/modules/merchant-identity/merchant-jwt.guard.ts
- Create: backend/src/modules/merchant-identity/merchant-jwt.guard.spec.ts
- Modify: backend/src/modules/merchant-identity/merchant-identity.module.ts

**Interfaces consumed:**

- Existing AuthService SMS send and verification logic.
- Existing User identity and MERCHANT_RULES rich-text agreement.
- MerchantMember active/invited membership and sessionVersion.
- RedisService.

**Interfaces produced:**

- POST /merchant-web/auth/phone/send-code
- POST /merchant-web/auth/phone/login
- POST /merchant-web/auth/select-organization
- POST /merchant-web/auth/refresh
- POST /merchant-web/auth/logout
- Merchant JWT audience merchant_web, tokenType merchant, tokenUse access or refresh.

- [ ] **Step 1: Write failing AuthService identity-extraction tests**

Add tests proving authenticatePhoneIdentity:

- rejects an empty/invalid code through the existing verifier;
- finds an existing non-deleted user by normalized phone;
- creates one user and profile defaults when no user exists;
- updates login metadata;
- does not issue ordinary-user access or refresh tokens;
- preserves the current phoneLogin response by having phoneLogin call the new method and then generate ordinary-user tokens.

The public method contract is:

~~~ts
async authenticatePhoneIdentity(
  dto: {
    phone?: string;
    mobile?: string;
    code?: string;
    loginDevice?: MiniLoginDeviceInput;
  },
  ip?: string,
  ua?: string,
  method = '手机号验证码登录',
): Promise<User>;
~~~

- [ ] **Step 2: Run and confirm the method is missing**

Run:

~~~bash
npm --prefix backend test -- auth.phone-identity.spec.ts --runInBand
~~~

Expected: FAIL because authenticatePhoneIdentity is not exported.

- [ ] **Step 3: Extract identity authentication without changing user login behavior**

Move only normalize, verify, find/create, login-metadata update, default profile, and public UID work into authenticatePhoneIdentity. Keep initial-region binding, ordinary token generation, existing agreement recording, profile-cache clearing, and formatted mini-program response in phoneLogin.

After refactoring, phoneLogin follows this shape:

~~~ts
const user = await this.authenticatePhoneIdentity(
  dto,
  ip,
  ua,
  '手机号验证码登录',
);
await this.bindInitialRegion(user.id, dto.region_id || dto.regionId);
const tokens = await this.generateTokens(user.id, user.openid);
await this.recordLoginAgreementConsent(
  user.id,
  dto.region_id || dto.regionId,
).catch(() => undefined);
await this.clearUserProfileCache(user.id);
const studentVerify = await this.prisma.studentVerify.findUnique({
  where: { userId: user.id },
});
return this.formatLoginResponse(user, tokens, studentVerify);
~~~

- [ ] **Step 4: Add and test atomic Redis get-and-delete**

Add:

~~~ts
async getAndDelete(key: string): Promise<string | null> {
  return this.redis.eval(
    "local value = redis.call('GET', KEYS[1]); "
      + "if value then redis.call('DEL', KEYS[1]); end; "
      + "return value",
    1,
    key,
  ) as Promise<string | null>;
}
~~~

The Redis unit test must prove it invokes one Lua operation and returns the consumed value. This method is used only for one-time merchant organization-selection tickets in this task; do not alter lock-release logic here.

- [ ] **Step 5: Write failing merchant auth and token-realm tests**

MerchantAuthService tests cover:

- agreementAccepted must be true;
- no active/invited merchant membership returns 403;
- invited membership with matching phone binds userId and becomes active;
- one active organization issues tokens immediately;
- multiple active organizations returns organization choices and a random 300-second login ticket;
- select-organization atomically consumes the ticket and rejects replay;
- disabled membership, suspended organization, or inactive user rejects;
- refresh requires tokenType merchant, tokenUse refresh, audience merchant_web, matching Redis token hash, matching member/user/org/sessionVersion;
- logout removes merchant_refresh for that member;
- role/status mutation makes old tokens invalid through sessionVersion.

MerchantJwtGuard tests cover missing token, wrong audience, wrong tokenType, wrong tokenUse, expired token, inactive membership, stale sessionVersion, and valid access token.

Generic JwtGuard tests prove a merchant token is rejected before ordinary-user endpoint access:

~~~ts
if (payload.tokenType === 'merchant') {
  throw new UnauthorizedException('商户令牌不能访问用户接口');
}
~~~

- [ ] **Step 6: Implement merchant DTO validation**

Use class-validator:

~~~ts
export class MerchantPhoneLoginDto {
  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @IsString()
  @Length(4, 8)
  code!: string;

  @Equals(true)
  agreementAccepted!: true;

  @IsOptional()
  @IsString()
  agreementVersion?: string;
}

export class SelectMerchantOrganizationDto {
  @IsString()
  loginTicket!: string;

  @IsString()
  organizationId!: string;
}

export class MerchantRefreshDto {
  @IsString()
  refreshToken!: string;
}
~~~

- [ ] **Step 7: Implement login, membership binding, agreement recording, and token issue**

After authenticatePhoneIdentity:

1. find MerchantMember rows with matching phone or userId;
2. in a transaction, bind matching invited rows to userId only if no conflicting userId exists, then set status active;
3. load only active organizations and memberships;
4. upsert UserAgreementConsent for the latest visible RichTextContent where type is MERCHANT_RULES, source merchant-web-login, and the chosen version equals the current document version;
5. never silently swallow merchant agreement persistence failure;
6. issue immediately for one organization or create an atomic one-time selection ticket for multiple organizations.

The access-token payload is:

~~~ts
{
  sub: user.id,
  tokenType: 'merchant',
  tokenUse: 'access',
  merchantMemberId: member.id,
  merchantOrganizationId: member.organizationId,
  merchantSessionVersion: member.sessionVersion,
}
~~~

The refresh payload uses tokenUse refresh. Sign both with JWT_SECRET, audience merchant_web, access expiry 2h, refresh expiry 7d. Store only the SHA-256 hash of the current refresh token at merchant_refresh:memberId for seven days.

Return:

~~~ts
type MerchantTokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: 7200;
  organization: {
    id: string;
    name: string;
  };
};
~~~

- [ ] **Step 8: Implement the merchant guard and controller**

MerchantJwtGuard verifies:

~~~ts
await this.jwtService.verifyAsync(token, {
  secret: this.configService.get('JWT_SECRET'),
  audience: 'merchant_web',
});
~~~

Then require tokenType merchant, tokenUse access, and MerchantAccessService.assertActiveSession. Attach the normalized session to request.merchantSession.

merchant-auth.controller.ts must call the existing AuthService.sendPhoneLoginCode for send-code, preserve its throttle behavior, and never introduce a second SMS provider path.

- [ ] **Step 9: Run focused auth, Redis, guard, and existing SMS tests**

Run:

~~~bash
npm --prefix backend test -- auth.phone-identity.spec.ts auth.sms.spec.ts redis.service.spec.ts jwt.guard.spec.ts merchant-auth.service.spec.ts merchant-jwt.guard.spec.ts --runInBand
npm --prefix backend run build
~~~

Expected: PASS and successful backend build.

- [ ] **Step 10: Commit merchant authentication**

~~~bash
git add backend/src/modules/auth/auth.service.ts backend/src/modules/auth/auth.phone-identity.spec.ts backend/src/common/services/redis.service.ts backend/src/common/services/redis.service.spec.ts backend/src/guards/jwt.guard.ts backend/src/guards/jwt.guard.spec.ts backend/src/modules/merchant-identity/dto/merchant-auth.dto.ts backend/src/modules/merchant-identity/merchant-auth.service.ts backend/src/modules/merchant-identity/merchant-auth.service.spec.ts backend/src/modules/merchant-identity/merchant-auth.controller.ts backend/src/modules/merchant-identity/merchant-jwt.guard.ts backend/src/modules/merchant-identity/merchant-jwt.guard.spec.ts backend/src/modules/merchant-identity/merchant-identity.module.ts
git commit -m "feat: add isolated merchant web authentication"
~~~

### Task 7: Add merchant session and accessible-shop APIs

**Files:**

- Create: backend/src/modules/merchant-identity/merchant-session.service.ts
- Create: backend/src/modules/merchant-identity/merchant-session.service.spec.ts
- Create: backend/src/modules/merchant-identity/merchant-session.controller.ts
- Create: backend/src/modules/merchant-identity/merchant-session.controller.spec.ts
- Modify: backend/src/modules/merchant-identity/merchant-identity.module.ts

**Interfaces consumed:**

- request.merchantSession from MerchantJwtGuard.
- MerchantAccessService.listAccessibleShops.

**Interfaces produced:**

- GET /merchant-web/session
- GET /merchant-web/shops

- [ ] **Step 1: Write failing service and controller tests**

Test:

- session response includes member, organization, shops, and allowedActions;
- shops include only stores with effective roles in the token organization;
- a member with no accessible shop receives an empty shops array plus a clear accountState no_store_access;
- legacy_owner is never accepted as a merchant-Web session;
- controller uses MerchantJwtGuard and never accepts merchantId from request body;
- disabled membership after token issuance returns 401 through the guard.

- [ ] **Step 2: Run and observe missing modules**

Run:

~~~bash
npm --prefix backend test -- merchant-session.service.spec.ts merchant-session.controller.spec.ts --runInBand
~~~

Expected: FAIL because the session service/controller do not exist.

- [ ] **Step 3: Implement narrow response models**

Return:

~~~ts
export type MerchantSessionView = {
  user: {
    id: string;
    nickname: string | null;
    phoneMasked: string;
  };
  member: {
    id: string;
    status: 'active';
    sessionVersion: number;
  };
  organization: {
    id: string;
    name: string;
    status: 'active';
  };
  shops: MerchantShopAccess[];
  accountState: 'ready' | 'no_store_access';
};
~~~

Mask the phone as 138****0000. Do not return openid, unionid, full phone, token claims, or Prisma relation objects.

- [ ] **Step 4: Implement protected endpoints**

Both routes use MerchantJwtGuard. The service takes only the verified userId/memberId/organizationId from request.merchantSession and calls listAccessibleShops with that organization. It does not accept organizationId or merchantId from query parameters.

- [ ] **Step 5: Run focused tests and compile**

Run:

~~~bash
npm --prefix backend test -- merchant-session.service.spec.ts merchant-session.controller.spec.ts merchant-access.service.spec.ts --runInBand
npm --prefix backend run build
~~~

Expected: PASS.

- [ ] **Step 6: Commit session APIs**

~~~bash
git add backend/src/modules/merchant-identity/merchant-session.service.ts backend/src/modules/merchant-identity/merchant-session.service.spec.ts backend/src/modules/merchant-identity/merchant-session.controller.ts backend/src/modules/merchant-identity/merchant-session.controller.spec.ts backend/src/modules/merchant-identity/merchant-identity.module.ts
git commit -m "feat: add merchant session and shop access APIs"
~~~

### Task 8: Implement merchant employee lifecycle, role conflict protection, and audit

**Files:**

- Create: backend/src/modules/merchant-identity/dto/merchant-member.dto.ts
- Create: backend/src/modules/merchant-identity/merchant-audit.service.ts
- Create: backend/src/modules/merchant-identity/merchant-audit.service.spec.ts
- Create: backend/src/modules/merchant-identity/merchant-member.service.ts
- Create: backend/src/modules/merchant-identity/merchant-member.service.spec.ts
- Create: backend/src/modules/merchant-identity/merchant-member.controller.ts
- Create: backend/src/modules/merchant-identity/merchant-member.controller.spec.ts
- Modify: backend/src/modules/merchant-identity/merchant-identity.module.ts

**Interfaces consumed:**

- MerchantAccessService.
- Five-role contract and canManageRoleSet.
- AuditLog and AdminOperationLog.

**Interfaces produced:**

- GET /merchant-web/shops/:merchantId/members
- POST /merchant-web/shops/:merchantId/members
- PUT /merchant-web/shops/:merchantId/members/:memberId/roles
- PUT /merchant-web/shops/:merchantId/members/:memberId/status

- [ ] **Step 1: Write failing DTO and lifecycle tests**

Cover:

- staff:view may list members, staff:manage is required for writes;
- phone is normalized and unique inside the organization;
- owner may add any built-in role;
- manager may add/change order_clerk and product_clerk only;
- manager cannot change owner, manager, or finance;
- member from another organization returns 404;
- roles may be assigned only to the route merchantId;
- duplicate role writes are idempotent;
- expectedSessionVersion mismatch returns 409 with current version;
- role/status changes increment sessionVersion and delete merchant_refresh;
- the final effective owner cannot be removed or disabled;
- each successful and failed sensitive mutation emits an audit result without secret/token data.

- [ ] **Step 2: Run and confirm missing service failures**

Run:

~~~bash
npm --prefix backend test -- merchant-audit.service.spec.ts merchant-member.service.spec.ts merchant-member.controller.spec.ts --runInBand
~~~

Expected: FAIL because the member services do not exist.

- [ ] **Step 3: Implement validated DTOs**

~~~ts
export class CreateMerchantMemberDto {
  @Matches(/^1\d{10}$/)
  phone!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(MERCHANT_ROLE_KEYS, { each: true })
  roleKeys!: MerchantRoleKey[];
}

export class UpdateMerchantMemberRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(MERCHANT_ROLE_KEYS, { each: true })
  roleKeys!: MerchantRoleKey[];

  @IsInt()
  @Min(1)
  expectedSessionVersion!: number;
}

export class UpdateMerchantMemberStatusDto {
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled';

  @IsInt()
  @Min(1)
  expectedSessionVersion!: number;

  @IsString()
  @Length(2, 200)
  reason!: string;
}
~~~

- [ ] **Step 4: Implement audit writers**

MerchantAuditService exposes:

~~~ts
logMerchant(input: {
  actorUserId: string;
  action: AuditAction;
  targetId: string;
  detail: Record<string, unknown>;
  ip?: string;
  ua?: string;
}): Promise<void>;

logAdmin(input: {
  accountId: string;
  action: string;
  targetId: string;
  targetType: string;
  detail: Record<string, unknown>;
  ip?: string;
  ua?: string;
}): Promise<void>;
~~~

Use module merchant_identity. Details contain organizationId, merchantId, targetMemberId, before, after, reason, requestId, and result. They must omit phone except masked form and omit all codes/tokens.

- [ ] **Step 5: Implement transaction-safe member writes**

For create:

1. require staff:manage;
2. validate role-grant boundary;
3. upsert member by organizationId_phone;
4. bind an existing User with the same phone when unambiguous; otherwise keep userId null and status invited;
5. create route-store roles with skipDuplicates;
6. audit.

For role/status update:

1. load actor and target inside one transaction;
2. verify expectedSessionVersion;
3. count effective owners before a removal/disable;
4. apply exact target role set for only the route store;
5. increment target sessionVersion;
6. commit;
7. delete merchant_refresh:targetMemberId;
8. audit before/after.

- [ ] **Step 6: Implement controllers with verified route scope**

All endpoints use MerchantJwtGuard. The actor user ID comes from request.merchantSession. The service calls MerchantAccessService for the route merchantId; it never trusts a DTO organizationId.

- [ ] **Step 7: Run focused tests and compile**

Run:

~~~bash
npm --prefix backend test -- merchant-permissions.spec.ts merchant-access.service.spec.ts merchant-audit.service.spec.ts merchant-member.service.spec.ts merchant-member.controller.spec.ts --runInBand
npm --prefix backend run build
~~~

Expected: PASS.

- [ ] **Step 8: Commit member lifecycle**

~~~bash
git add backend/src/modules/merchant-identity/dto/merchant-member.dto.ts backend/src/modules/merchant-identity/merchant-audit.service.ts backend/src/modules/merchant-identity/merchant-audit.service.spec.ts backend/src/modules/merchant-identity/merchant-member.service.ts backend/src/modules/merchant-identity/merchant-member.service.spec.ts backend/src/modules/merchant-identity/merchant-member.controller.ts backend/src/modules/merchant-identity/merchant-member.controller.spec.ts backend/src/modules/merchant-identity/merchant-identity.module.ts
git commit -m "feat: add merchant staff role management"
~~~

### Task 9: Add region-scoped platform administration APIs and permission seeds

**Files:**

- Create: backend/src/modules/merchant-identity/dto/admin-merchant-identity.dto.ts
- Create: backend/src/modules/merchant-identity/merchant-identity.admin.service.ts
- Create: backend/src/modules/merchant-identity/merchant-identity.admin.service.spec.ts
- Create: backend/src/modules/merchant-identity/merchant-identity.admin.controller.ts
- Create: backend/src/modules/merchant-identity/merchant-identity.admin.controller.spec.ts
- Modify: backend/src/modules/merchant-identity/merchant-identity.module.ts
- Modify: backend/prisma/seed.ts
- Modify: backend/src/modules/setup/setup.service.ts
- Create: backend/src/modules/setup/merchant-identity-permissions.spec.ts

**Interfaces consumed:**

- AdminDataScopeService.
- JwtGuard, AdminGuard, AdminPermissionGuard, SuperAdminGuard.
- MerchantAuditService.logAdmin.

**Interfaces produced:**

- GET /admin/merchant-organizations
- GET /admin/merchant-organizations/:id
- GET /admin/merchant-organizations/:id/shops
- GET /admin/merchant-organizations/:id/members
- POST /admin/merchant-organizations/:id/owner-recovery
- PUT /admin/merchant-members/:id/status
- GET /admin/merchant-portal/status
- New admin permissions:
  - merchant:organization:view
  - merchant:organization:manage
  - merchant:member:view
  - merchant:member:manage
  - merchant:portal:view

- [ ] **Step 1: Write failing data-scope, guard-metadata, and seed-parity tests**

Service tests prove:

- superadmin sees all organizations;
- regional admin list applies shops.some.regionId.in to its regionIds;
- regional admin detail cannot see an organization with no in-scope store;
- member role details are filtered to in-scope shops;
- owner recovery is superadmin-only;
- org-wide member disable is superadmin-only;
- portal status counts only visible organizations/stores for regional admins;
- every endpoint carries the exact permission decorator.

Seed parity test reads seed.ts and setup.service.ts and requires all five permission codes in both sources.

- [ ] **Step 2: Run and observe expected missing API/permission failures**

Run:

~~~bash
npm --prefix backend test -- merchant-identity.admin.service.spec.ts merchant-identity.admin.controller.spec.ts merchant-identity-permissions.spec.ts --runInBand
~~~

Expected: FAIL.

- [ ] **Step 3: Implement data-scope helpers in the service**

Use:

~~~ts
const scope = await this.adminDataScope.getAdminContext(accountId);
const organizationWhere = scope.isSuperAdmin
  ? {}
  : {
      shops: {
        some: {
          regionId: { in: scope.regionIds },
        },
      },
    };
~~~

If a non-super-admin has no regionIds, the filter must yield zero rows, not all rows. Never accept operatorId from query/body; use the administrator token sub.

- [ ] **Step 4: Implement exact owner-recovery safety**

DTO:

~~~ts
export class RecoverMerchantOwnerDto {
  @Matches(/^1\d{10}$/)
  newOwnerPhone!: string;

  @IsString()
  expectedCurrentOwnerUserId!: string;

  @Equals(true)
  revokePreviousOwner!: true;

  @IsString()
  @Length(5, 300)
  reason!: string;
}
~~~

The transaction:

1. locks/loads the organization and compares expectedCurrentOwnerUserId;
2. resolves newOwnerPhone to exactly one existing ACTIVE User and rejects missing or ambiguous matches;
3. upserts the replacement member active;
4. gives the replacement owner role on every organization store;
5. removes owner roles from the previous owner only after replacement roles exist;
6. updates ownerUserId;
7. increments sessionVersion for both affected members;
8. commits and revokes both refresh tokens;
9. writes an AdminOperationLog with before/after and reason.

Do not create a fake User or synthetic openid from the admin endpoint.

- [ ] **Step 5: Add guarded controllers**

Use class-level:

~~~ts
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
~~~

Map permissions:

- organization list/detail/shops: merchant:organization:view;
- members: merchant:member:view;
- portal status: merchant:portal:view;
- member status: merchant:member:manage plus service-level superadmin;
- owner recovery: merchant:organization:manage plus SuperAdminGuard.

- [ ] **Step 6: Add seed/setup permission parity**

Add the five codes with module merchant and explicit view/manage action. Grant all to super_admin. Grant organization/member/portal view plus member manage only to the existing regional operations role if that role already has merchant:view; do not broaden finance or content-auditor roles.

- [ ] **Step 7: Run focused tests and compile**

Run:

~~~bash
npm --prefix backend test -- merchant-identity.admin.service.spec.ts merchant-identity.admin.controller.spec.ts merchant-identity-permissions.spec.ts admin.guard.spec.ts --runInBand
npm --prefix backend run build
~~~

Expected: PASS.

- [ ] **Step 8: Commit platform APIs and permissions**

~~~bash
git add backend/src/modules/merchant-identity/dto/admin-merchant-identity.dto.ts backend/src/modules/merchant-identity/merchant-identity.admin.service.ts backend/src/modules/merchant-identity/merchant-identity.admin.service.spec.ts backend/src/modules/merchant-identity/merchant-identity.admin.controller.ts backend/src/modules/merchant-identity/merchant-identity.admin.controller.spec.ts backend/src/modules/merchant-identity/merchant-identity.module.ts backend/prisma/seed.ts backend/src/modules/setup/setup.service.ts backend/src/modules/setup/merchant-identity-permissions.spec.ts
git commit -m "feat: add scoped merchant identity administration"
~~~

### Task 10: Close legacy category ownership and mutation gaps

**Files:**

- Modify: backend/src/modules/shop/shop.module.ts
- Modify: backend/src/modules/shop/shop.service.ts
- Create: backend/src/modules/shop/shop.category-ownership.spec.ts
- Modify: backend/src/modules/admin/admin.service.ts
- Create: backend/src/modules/admin/admin.category-scope.spec.ts

**Interfaces consumed:**

- Category.scopeType and Category.merchantId.
- MerchantAccessService permission merchant:product:manage.
- Existing ShopController route signatures and mini-program merchant_id compatibility.
- Existing administrator category management.

**Interfaces produced:**

- Merchant-created categories are always store scoped and owned.
- Merchant update/delete cannot mutate platform templates or another store category.
- Administrator category CRUD remains platform-template CRUD.

- [ ] **Step 1: Write failing category isolation tests**

Cover:

- createCategory resolves merchant from the authenticated user plus merchant_id and writes scopeType store and merchantId;
- create without a resolvable merchant rejects;
- update/delete load the current category first;
- merchant may update/delete its own store category with product:manage;
- merchant cannot change merchantId or scopeType in DTO;
- merchant cannot update/delete platform category;
- merchant cannot update/delete another store category;
- public getCategories returns platform templates by default;
- store-category management query returns only the authorized store categories;
- admin create/update preserves scopeType platform and merchantId null;
- admin delete cannot delete a store-owned category through the global category endpoint.

- [ ] **Step 2: Run and observe the current ownership failures**

Run:

~~~bash
npm --prefix backend test -- shop.category-ownership.spec.ts admin.category-scope.spec.ts --runInBand
~~~

Expected: FAIL because updateCategory and deleteCategory currently perform no ownership check and Category has no enforced scope behavior.

- [ ] **Step 3: Import the shared access boundary**

Add MerchantIdentityModule to ShopModule imports. Do not reimplement role or ownership checks in ShopService.

- [ ] **Step 4: Enforce store scope for merchant category writes**

The write flow is:

~~~ts
const merchant = await this.resolveMerchantForUser(userId, dto);
await this.merchantAccess.requireStorePermission(
  userId,
  merchant.id,
  'merchant:product:manage',
);

const data = await this.normalizeCategoryPayload(dto, userId, isUpdate);
delete data.scopeType;
delete data.merchantId;

return this.prisma.category.create({
  data: {
    ...data,
    scopeType: 'store',
    merchantId: merchant.id,
  },
});
~~~

For update/delete, load the category first, require scopeType store and merchantId, call requireStorePermission for that persisted merchantId, then update only allowed fields. Ignore or reject DTO merchant_id changes.

- [ ] **Step 5: Preserve public and admin semantics**

Public getCategories without a store-management context filters scopeType platform. Existing products may continue referencing platform categories. Administrator global category CRUD always writes platform/null and rejects store-owned row mutation with 409 plus the dedicated store-management guidance.

- [ ] **Step 6: Run focused tests, existing shop/admin tests, and compile**

Run:

~~~bash
npm --prefix backend test -- shop.category-ownership.spec.ts admin.category-scope.spec.ts --runInBand
npm --prefix backend run build
~~~

Expected: PASS.

- [ ] **Step 7: Commit category isolation**

~~~bash
git add backend/src/modules/shop/shop.module.ts backend/src/modules/shop/shop.service.ts backend/src/modules/shop/shop.category-ownership.spec.ts backend/src/modules/admin/admin.service.ts backend/src/modules/admin/admin.category-scope.spec.ts
git commit -m "fix: isolate merchant category ownership"
~~~

### Task 11: Add three visible platform-admin menus and real pages

**Files:**

- Modify: admin/src/api/merchant.ts
- Create: admin/src/views/merchant/MerchantOrganizations.vue
- Create: admin/src/views/merchant/MerchantAccessControl.vue
- Create: admin/src/views/merchant/MerchantPortalStatus.vue
- Modify: admin/src/router/index.ts
- Modify: admin/src/router/menus.ts
- Modify: admin/src/router/access.ts
- Create: minitest/merchant-platform-admin-surface.test.cjs

**Interfaces consumed:**

- Administrator APIs from Task 9.
- Existing admin request client, MainLayout, PageHeader, EmptyState, StatusTag, Element Plus, router permissions, and menu groups.

**Interfaces produced:**

- /merchant/organizations
- /merchant/access-control
- /merchant/portal-status
- Visible entries “商户组织与门店”, “商户账号与权限”, and “商户入口状态” under 外卖中心.

- [ ] **Step 1: Write a failing source-contract mini test**

The node:test file reads the router, menus, access rules, API module, and three page files. Require:

~~~js
const requiredPaths = [
  '/merchant/organizations',
  '/merchant/access-control',
  '/merchant/portal-status',
];
const requiredPermissions = [
  'merchant:organization:view',
  'merchant:member:view',
  'merchant:portal:view',
];
~~~

For each path assert one router registration, one menu registration, one access rule, and a real lazy-loaded Vue file. Assert each page contains loading, empty, and error-state handling and imports a real API function.

- [ ] **Step 2: Run and observe missing-page failures**

Run:

~~~bash
node --test minitest/merchant-platform-admin-surface.test.cjs
~~~

Expected: FAIL because the three paths/pages do not exist.

- [ ] **Step 3: Add typed API wrappers**

Add narrow response types and functions:

~~~ts
export type MerchantOrganizationListItem = {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'closed';
  owner: {
    id: string;
    nickname: string | null;
    phoneMasked: string;
  };
  shopCount: number;
  memberCount: number;
  regions: Array<{ id: string; name: string }>;
  updatedAt: string;
};

export const getMerchantOrganizations = (
  params: Record<string, unknown> = {},
) => getPage('/admin/merchant-organizations', params);

export const getMerchantOrganization = (id: string) =>
  request.get('/admin/merchant-organizations/' + id);

export const getMerchantOrganizationShops = (id: string) =>
  request.get('/admin/merchant-organizations/' + id + '/shops');

export const getMerchantOrganizationMembers = (id: string) =>
  request.get('/admin/merchant-organizations/' + id + '/members');

export const recoverMerchantOrganizationOwner = (
  id: string,
  data: Record<string, unknown>,
) => postAction(
  '/admin/merchant-organizations/' + id + '/owner-recovery',
  data,
);

export const updateAdminMerchantMemberStatus = (
  id: string,
  data: Record<string, unknown>,
) => putAction('/admin/merchant-members/' + id + '/status', data);

export const getMerchantPortalStatus = () =>
  request.get('/admin/merchant-portal/status');
~~~

- [ ] **Step 4: Build MerchantOrganizations.vue**

The page includes:

- PageHeader with purpose and refresh;
- keyword, status, and region filters;
- paginated table for organization, owner masked phone, stores, members, regions, status, updated time;
- loading skeleton/table loading;
- EmptyState when list is empty;
- inline error alert with retry;
- detail drawer with real organization, shops, and members tabs;
- owner recovery dialog visible only when the current admin permission set contains merchant:organization:manage;
- owner recovery confirmation requiring the replacement phone, expectedCurrentOwnerUserId, revokePreviousOwner checked, and a reason;
- successful mutation refreshes detail and list.

Do not show full phone, openid, tokens, or fake GMV.

- [ ] **Step 5: Build MerchantAccessControl.vue**

The page loads organizations and selected organization members. It displays:

- member masked phone/nickname/status/session version;
- store-by-store built-in roles;
- allowed administrator actions based on current permissions;
- disable/enable action only when merchant:member:manage is present;
- expectedSessionVersion in every status write;
- 409 response as a conflict alert followed by a refetch.

This page does not invent custom-role editing.

- [ ] **Step 6: Build MerchantPortalStatus.vue**

Render only server-returned status values:

- organizations linked/unlinked;
- active/invited/disabled memberships;
- stores with/without organization;
- legacy fallback count;
- category-scope counts;
- migration conflicts;
- portal readiness state and blocking reasons.

Use status cards plus a blocking-reasons table. A missing API is an error state, not “all normal”.

- [ ] **Step 7: Register route, menu, and permission mappings together**

Add routes:

~~~ts
{
  path: 'merchant/organizations',
  component: () => import('@/views/merchant/MerchantOrganizations.vue'),
  meta: { title: '商户组织与门店' },
},
{
  path: 'merchant/access-control',
  component: () => import('@/views/merchant/MerchantAccessControl.vue'),
  meta: { title: '商户账号与权限' },
},
{
  path: 'merchant/portal-status',
  component: () => import('@/views/merchant/MerchantPortalStatus.vue'),
  meta: { title: '商户入口状态' },
},
~~~

Add matching menu items beneath the existing 外卖中心 workbench and before ordinary merchant management. Add exact access rules using the three view permissions. Do not remove or rename existing merchant routes.

- [ ] **Step 8: Run mini test, typecheck, and production build**

Run:

~~~bash
node --test minitest/merchant-platform-admin-surface.test.cjs
npm --prefix admin run typecheck
npm --prefix admin run build
~~~

Expected: PASS and successful Vite build.

- [ ] **Step 9: Commit the administrator surface**

~~~bash
git add admin/src/api/merchant.ts admin/src/views/merchant/MerchantOrganizations.vue admin/src/views/merchant/MerchantAccessControl.vue admin/src/views/merchant/MerchantPortalStatus.vue admin/src/router/index.ts admin/src/router/menus.ts admin/src/router/access.ts minitest/merchant-platform-admin-surface.test.cjs
git commit -m "feat: add merchant identity admin surfaces"
~~~

### Task 12: Create an isolated merchant-console browser realm

**Files:**

- Create: admin/src/merchant-console/merchant-console-contract.mjs
- Create: admin/src/api/merchant-console-request.ts
- Create: admin/src/api/merchant-auth.ts
- Create: admin/src/api/merchant-console.ts
- Create: admin/src/stores/merchant-auth.ts
- Create: admin/src/layout/MerchantConsoleLayout.vue
- Modify: admin/src/router/index.ts
- Create: minitest/merchant-console-realm.test.mjs

**Interfaces consumed:**

- Merchant auth/session endpoints from Tasks 6 and 7.
- Existing Vite environment base URL and Pinia application.

**Interfaces produced:**

- Independent LM_MERCHANT_* storage contract.
- Merchant-only Axios client with single-flight refresh.
- /merchant-console route realm and layout.

- [ ] **Step 1: Write failing pure realm/storage tests**

merchant-console-contract.mjs exports:

~~~js
export const MERCHANT_STORAGE_KEYS = Object.freeze({
  accessToken: 'LM_MERCHANT_TOKEN',
  refreshToken: 'LM_MERCHANT_REFRESH_TOKEN',
  organizationId: 'LM_MERCHANT_ORGANIZATION_ID',
  shopId: 'LM_MERCHANT_SHOP_ID',
  loginTicket: 'LM_MERCHANT_LOGIN_TICKET',
});

export function resolveRouteRealm(pathname) {
  return pathname === '/merchant-console'
    || pathname.startsWith('/merchant-console/')
    ? 'merchant'
    : 'admin';
}
~~~

The test asserts no value contains ADMIN, user, openid, or generic token names; merchant routes resolve merchant and administrator routes resolve admin.

- [ ] **Step 2: Run and confirm the contract is missing**

Run:

~~~bash
node --test minitest/merchant-console-realm.test.mjs
~~~

Expected: FAIL.

- [ ] **Step 3: Implement the contract and merchant API modules**

merchant-auth.ts exposes send code, login, select organization, refresh, logout. merchant-console.ts exposes session, shops, member APIs, and store-profile APIs. Every function uses merchant-console-request.ts, never admin/src/api/request.ts.

- [ ] **Step 4: Implement a separate Axios client**

Requirements:

- baseURL matches the existing backend configuration;
- request interceptor reads only LM_MERCHANT_TOKEN;
- Authorization is absent for public merchant auth routes;
- one shared refreshPromise handles concurrent 401 responses;
- each request retries at most once using a private _merchantRetried flag;
- refresh reads only LM_MERCHANT_REFRESH_TOKEN;
- refresh success replaces merchant tokens and retries the original request;
- refresh failure clears all LM_MERCHANT_* keys and redirects to /merchant-console/login;
- it never reads, clears, or sends LM_ADMIN_TOKEN, admin_token, or ordinary user tokens;
- network/403/409/422 errors remain available to the page and are not converted to empty success.

Use this single-flight pattern:

~~~ts
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = performRefresh()
      .then((result) => result.accessToken)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}
~~~

- [ ] **Step 5: Implement the Pinia merchant auth store**

State:

~~~ts
{
  accessToken: string;
  refreshToken: string;
  session: MerchantSessionView | null;
  organizations: MerchantOrganizationChoice[];
  loginTicket: string;
  currentShopId: string;
  loading: boolean;
}
~~~

Actions:

- login;
- selectOrganization;
- loadSession;
- selectShop;
- logout;
- clearMerchantState.

selectShop verifies the ID exists in session.shops before persisting it. clearMerchantState clears every LM_MERCHANT_* key and no other keys.

- [ ] **Step 6: Add the merchant route tree before the administrator catch-all tree**

Routes:

~~~ts
{
  path: '/merchant-console/login',
  component: () => import('@/views/merchant-console/Login.vue'),
  meta: { merchantPublic: true, title: '商户登录' },
},
{
  path: '/merchant-console/select-organization',
  component: () => import('@/views/merchant-console/OrganizationSelect.vue'),
  meta: { merchantSelection: true, title: '选择经营主体' },
},
{
  path: '/merchant-console/select-shop',
  component: () => import('@/views/merchant-console/ShopSelect.vue'),
  meta: { merchantAuth: true, title: '选择门店' },
},
{
  path: '/merchant-console',
  component: MerchantConsoleLayout,
  meta: { merchantAuth: true },
  children: [
    { path: '', redirect: '/merchant-console/overview' },
    { path: 'overview', component: () => import('@/views/merchant-console/Overview.vue') },
    { path: 'members', component: () => import('@/views/merchant-console/Members.vue') },
    { path: 'store', component: () => import('@/views/merchant-console/StoreProfile.vue') },
  ],
},
~~~

At the first line of router.beforeEach, branch on resolveRouteRealm:

- merchant public route: never call getSetupStatus or admin auth;
- merchant selection route: require a non-expired in-memory/sessionStorage login ticket, not an access token;
- merchant protected route: require merchant token and load merchant session;
- administrator realm: retain existing setup/admin flow unchanged.

- [ ] **Step 7: Build MerchantConsoleLayout**

The layout contains:

- merchant product mark without copying external assets;
- current organization and store switcher;
- menu entries 工作台, 员工与权限, 门店资料 filtered by allowedActions;
- account/session menu and logout;
- desktop sidebar plus mobile drawer;
- skip-to-content link, visible keyboard focus, semantic nav/main, and 44px touch targets;
- no administrator menus or administrator account controls.

- [ ] **Step 8: Extend the realm test with source isolation checks**

Read merchant-console-request.ts, merchant-auth store, router, and layout. Assert:

- LM_ADMIN does not appear in merchant client/store/layout;
- admin/src/api/request.ts is not imported;
- router guard checks the merchant realm before getSetupStatus;
- all declared merchant routes have real lazy-loaded files;
- logout calls clearMerchantState.

- [ ] **Step 9: Run realm test, typecheck, and build**

Run:

~~~bash
node --test minitest/merchant-console-realm.test.mjs
npm --prefix admin run typecheck
npm --prefix admin run build
~~~

Expected: PASS.

- [ ] **Step 10: Commit the isolated browser realm**

~~~bash
git add admin/src/merchant-console/merchant-console-contract.mjs admin/src/api/merchant-console-request.ts admin/src/api/merchant-auth.ts admin/src/api/merchant-console.ts admin/src/stores/merchant-auth.ts admin/src/layout/MerchantConsoleLayout.vue admin/src/router/index.ts minitest/merchant-console-realm.test.mjs
git commit -m "feat: add isolated merchant console realm"
~~~

### Task 13: Build merchant login, organization/store selection, workbench, and store profile

**Files:**

- Create: backend/src/modules/merchant-identity/dto/merchant-store-profile.dto.ts
- Create: backend/src/modules/merchant-identity/merchant-store-profile.service.ts
- Create: backend/src/modules/merchant-identity/merchant-store-profile.service.spec.ts
- Create: backend/src/modules/merchant-identity/merchant-store-profile.controller.ts
- Create: backend/src/modules/merchant-identity/merchant-store-profile.controller.spec.ts
- Modify: backend/src/modules/merchant-identity/merchant-identity.module.ts
- Create: admin/src/views/merchant-console/Login.vue
- Create: admin/src/views/merchant-console/OrganizationSelect.vue
- Create: admin/src/views/merchant-console/ShopSelect.vue
- Create: admin/src/views/merchant-console/Overview.vue
- Create: admin/src/views/merchant-console/StoreProfile.vue
- Create: admin/src/views/merchant-console/merchant-console-view-model.mjs
- Create: minitest/merchant-console-core-pages.test.mjs

**Interfaces consumed:**

- Merchant auth/session/shop APIs.
- Existing Merchant fields with reliable backend persistence.
- Public GET /api/agreements/MERCHANT_RULES.

**Interfaces produced:**

- GET /merchant-web/shops/:merchantId/profile
- PUT /merchant-web/shops/:merchantId/profile
- Five real merchant-console core pages.

- [ ] **Step 1: Write failing backend store-profile tests**

Cover:

- store:view is required to read;
- store:update is required to write;
- response includes only persisted reliable fields;
- route merchantId is checked by MerchantAccessService;
- DTO cannot change organizationId, userId, regionId, status, rating, saleCount, or finance fields;
- business hours validation rejects malformed intervals and overlap;
- 409 is returned when expectedUpdatedAt differs from current updatedAt;
- successful update writes an AuditLog before/after record.

- [ ] **Step 2: Define the allowed profile DTO**

~~~ts
export class BusinessHourDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  end!: string;
}

export class UpdateMerchantStoreProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 30)
  contactPerson?: string;

  @IsOptional()
  @Matches(/^1\d{10}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  cover?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessHourDto)
  businessHours!: BusinessHourDto[];

  @IsISO8601()
  expectedUpdatedAt!: string;
}
~~~

Import ValidateNested from class-validator and Type from class-transformer so each interval is actually validated.

The service serializes validated hours into the existing businessHours field without changing its storage type.

- [ ] **Step 3: Implement protected profile endpoints and run tests**

Both endpoints use MerchantJwtGuard and verified request.merchantSession.userId. Run:

~~~bash
npm --prefix backend test -- merchant-store-profile.service.spec.ts merchant-store-profile.controller.spec.ts --runInBand
~~~

Expected: PASS.

- [ ] **Step 4: Write failing pure page-model and source-contract tests**

merchant-console-view-model.mjs exports:

~~~js
export function resolveLoginNext(result) {
  if (result.requiresOrganizationSelection) {
    return '/merchant-console/select-organization';
  }
  return '/merchant-console/select-shop';
}

export function firstUsableShop(shops) {
  return shops.find((shop) =>
    shop.status === 'approved'
    && Array.isArray(shop.allowedActions)
    && shop.allowedActions.includes('merchant:dashboard:view')
  ) || null;
}

export function profileEditable(allowedActions) {
  return allowedActions.includes('merchant:store:update');
}
~~~

Test single/multiple organization paths, no-store state, disabled store, and read-only profile.

- [ ] **Step 5: Build Login.vue**

Requirements:

- phone and verification code with validation and accessible labels;
- code button uses existing backend throttle and countdown;
- fetch and link current MERCHANT_RULES;
- unchecked agreement blocks submit client-side; backend also validates;
- submit has loading lock;
- error states distinguish invalid code, no merchant account, disabled account, rate limit, and network failure;
- one organization persists tokens and continues to store selection;
- multiple organizations persists only the short-lived login ticket and choices, not access tokens;
- no default test credentials are embedded.

- [ ] **Step 6: Build organization and store selection**

OrganizationSelect.vue:

- requires loginTicket plus non-empty organization choices;
- shows organization name and active-store count only;
- select calls the one-time endpoint;
- ticket replay/expiry clears pending state and returns to merchant login.

ShopSelect.vue:

- loads session;
- lists only session.shops;
- shows role labels, store status, region, and allowed-action summary;
- stores a selection only after verifying it belongs to session;
- empty state explains that the platform administrator or owner must assign a store role;
- switching organization requires logout and re-authentication in phase 1.

- [ ] **Step 7: Build Overview.vue without fake business numbers**

Show:

- current organization/store;
- effective role labels;
- store status and contact information;
- real account/session warnings;
- action cards only for capabilities delivered in this milestone: employees/permissions and store profile;
- a non-clickable “后续经营能力” section listing orders, products, finance, and printers as planned, not working links.

Do not call legacy dashboard endpoints with merchant tokens and do not fabricate pending-order, GMV, revenue, or rider counts.

- [ ] **Step 8: Build StoreProfile.vue**

Load the new profile endpoint. Display reliable fields in read-only mode for store:view. Enable save only for store:update. Send expectedUpdatedAt. On 409, show “资料已被其他人更新”, reload latest data, and preserve the user draft in memory for manual comparison. Provide loading skeleton, empty guard, validation messages, save progress, success state, and retry.

- [ ] **Step 9: Run frontend tests, typecheck, backend build, and admin build**

Run:

~~~bash
node --test minitest/merchant-console-core-pages.test.mjs
npm --prefix backend test -- merchant-store-profile.service.spec.ts merchant-store-profile.controller.spec.ts --runInBand
npm --prefix backend run build
npm --prefix admin run typecheck
npm --prefix admin run build
~~~

Expected: PASS.

- [ ] **Step 10: Commit core merchant pages**

~~~bash
git add backend/src/modules/merchant-identity/dto/merchant-store-profile.dto.ts backend/src/modules/merchant-identity/merchant-store-profile.service.ts backend/src/modules/merchant-identity/merchant-store-profile.service.spec.ts backend/src/modules/merchant-identity/merchant-store-profile.controller.ts backend/src/modules/merchant-identity/merchant-store-profile.controller.spec.ts backend/src/modules/merchant-identity/merchant-identity.module.ts admin/src/views/merchant-console/Login.vue admin/src/views/merchant-console/OrganizationSelect.vue admin/src/views/merchant-console/ShopSelect.vue admin/src/views/merchant-console/Overview.vue admin/src/views/merchant-console/StoreProfile.vue admin/src/views/merchant-console/merchant-console-view-model.mjs minitest/merchant-console-core-pages.test.mjs
git commit -m "feat: add merchant console core pages"
~~~

### Task 14: Build the merchant employee and built-in-role page

**Files:**

- Create: admin/src/views/merchant-console/Members.vue
- Create: admin/src/views/merchant-console/merchant-member-model.mjs
- Create: minitest/merchant-console-members.test.mjs
- Modify: admin/src/api/merchant-console.ts

**Interfaces consumed:**

- Merchant member APIs from Task 8.
- Current shop allowedActions.
- Five-role contract returned by the backend.

**Interfaces produced:**

- Usable employee list, add-member flow, role update, status change, and conflict recovery.

- [ ] **Step 1: Write failing pure role/action view-model tests**

Export and test:

~~~js
export const ROLE_LABELS = Object.freeze({
  owner: '店主',
  manager: '店长',
  order_clerk: '订单员',
  product_clerk: '商品员',
  finance: '财务员',
});

export function editableRoleKeys(actorRoles) {
  if (actorRoles.includes('owner')) {
    return Object.keys(ROLE_LABELS);
  }
  if (actorRoles.includes('manager')) {
    return ['order_clerk', 'product_clerk'];
  }
  return [];
}

export function canOpenMemberEditor(allowedActions) {
  return allowedActions.includes('merchant:staff:manage');
}
~~~

Test owner, manager, ordinary role, unknown role label fallback, and staff:view read-only state.

- [ ] **Step 2: Run and confirm the page/model are missing**

Run:

~~~bash
node --test minitest/merchant-console-members.test.mjs
~~~

Expected: FAIL.

- [ ] **Step 3: Add typed member API wrappers**

~~~ts
export const getMerchantMembers = (merchantId: string) =>
  merchantRequest.get(
    '/merchant-web/shops/' + merchantId + '/members',
  );

export const createMerchantMember = (
  merchantId: string,
  data: CreateMerchantMemberInput,
) => merchantRequest.post(
  '/merchant-web/shops/' + merchantId + '/members',
  data,
);

export const updateMerchantMemberRoles = (
  merchantId: string,
  memberId: string,
  data: UpdateMerchantMemberRolesInput,
) => merchantRequest.put(
  '/merchant-web/shops/' + merchantId + '/members/' + memberId + '/roles',
  data,
);

export const updateMerchantMemberStatus = (
  merchantId: string,
  memberId: string,
  data: UpdateMerchantMemberStatusInput,
) => merchantRequest.put(
  '/merchant-web/shops/' + merchantId + '/members/' + memberId + '/status',
  data,
);
~~~

- [ ] **Step 4: Build Members.vue**

The page includes:

- loading, empty, error, retry, and permission-denied states;
- table/cards responsive at mobile width;
- masked phone, nickname, status, current-store roles, invitation state, and last update;
- add member dialog with phone and role checkboxes;
- edit role dialog filtered by editableRoleKeys;
- disable/enable confirmation with reason;
- final-owner rejection rendered as a business message;
- 409 response triggers refetch and asks the operator to review the new version before retrying;
- read-only staff:view users see no mutation buttons;
- role explanations next to choices;
- keyboard focus returned to the triggering button when dialogs close.

- [ ] **Step 5: Add source-contract assertions**

The test reads Members.vue and asserts:

- all five Chinese role labels exist;
- no custom-role editor text or route exists;
- mutation calls include expectedSessionVersion;
- no full-phone display binding exists;
- loading, empty, 403, and 409 handling exist;
- every visible write button is gated by staff:manage.

- [ ] **Step 6: Run tests, typecheck, and build**

Run:

~~~bash
node --test minitest/merchant-console-members.test.mjs
npm --prefix admin run typecheck
npm --prefix admin run build
~~~

Expected: PASS.

- [ ] **Step 7: Commit the employee page**

~~~bash
git add admin/src/views/merchant-console/Members.vue admin/src/views/merchant-console/merchant-member-model.mjs admin/src/api/merchant-console.ts minitest/merchant-console-members.test.mjs
git commit -m "feat: add merchant employee role console"
~~~

### Task 15: Run integrated security, migration, build, and browser acceptance

**Files:**

- Create: backend/src/modules/merchant-identity/merchant-platform-security.spec.ts
- Create: minitest/merchant-platform-foundation-contract.test.cjs
- Create: docs/runbooks/merchant-platform-foundation-local-acceptance.md

**Interfaces consumed:**

- All outputs from Tasks 1–14.

**Interfaces produced:**

- Repeatable local acceptance commands and evidence for the first milestone.

- [ ] **Step 1: Add a cross-realm and cross-tenant security suite**

The suite uses Nest testing modules with mocked Prisma/JWT/Redis boundaries and covers this fixed matrix:

| Case | Expected |
|---|---|
| merchant token to ordinary JwtGuard endpoint | 401 |
| ordinary user token to MerchantJwtGuard | 401 |
| admin token to MerchantJwtGuard | 401 |
| merchant token for another organization | 401 or 403 before service write |
| active order_clerk requesting product manage | 403 |
| active manager requesting finance view | 403 |
| active finance requesting payout account manage | 403 |
| disabled member with otherwise valid token | 401 |
| stale sessionVersion | 401 |
| another-store role used on current store | 403 |
| region admin opening out-of-scope organization | 403/404 with no data |
| only-any administrator permission missing | 401 |

- [ ] **Step 2: Add a repository contract test**

merchant-platform-foundation-contract.test.cjs reads source/configuration and verifies:

- all three Prisma schemas contain the identity contract;
- Merchant.userId still exists;
- both migration dialects exist;
- backfill defaults to dry-run;
- all five admin permissions exist in seed and setup;
- three admin routes have routes, menus, permissions, pages, and APIs;
- merchant realm uses only LM_MERCHANT_* keys;
- five merchant routes have real pages;
- no external Boolc/Keloop URL, credential, captcha, or copied asset appears in new source.

- [ ] **Step 3: Run every focused test**

Run:

~~~bash
npm --prefix backend test -- admin.guard.spec.ts merchant-permissions.spec.ts merchant-identity.schema.spec.ts merchant-access.service.spec.ts auth.phone-identity.spec.ts auth.sms.spec.ts redis.service.spec.ts jwt.guard.spec.ts merchant-auth.service.spec.ts merchant-jwt.guard.spec.ts merchant-session.service.spec.ts merchant-session.controller.spec.ts merchant-audit.service.spec.ts merchant-member.service.spec.ts merchant-member.controller.spec.ts merchant-identity.admin.service.spec.ts merchant-identity.admin.controller.spec.ts merchant-identity-permissions.spec.ts shop.category-ownership.spec.ts admin.category-scope.spec.ts merchant-store-profile.service.spec.ts merchant-store-profile.controller.spec.ts merchant-platform-security.spec.ts --runInBand
node --test backend/scripts/merchant-platform-foundation.helpers.test.cjs
node --test minitest/merchant-platform-admin-surface.test.cjs minitest/merchant-console-realm.test.mjs minitest/merchant-console-core-pages.test.mjs minitest/merchant-console-members.test.mjs minitest/merchant-platform-foundation-contract.test.cjs
~~~

Expected: every listed suite PASS.

- [ ] **Step 4: Run schema, generated-client, and build gates**

Run under Node 22:

~~~bash
node --version
npm --prefix backend run db:sync-schemas -- --check
npm --prefix backend run db:generate
npm --prefix backend run build
npm --prefix admin run typecheck
npm --prefix admin run build
~~~

Expected: Node reports v22.x; schema check, generation, backend build, typecheck, and admin build all succeed. If an unrelated pre-existing dirty-file error appears, record its exact file and prove whether the same error exists at the isolated worktree baseline; do not call the milestone complete while a new related error remains.

- [ ] **Step 5: Confirm the disposable database and recovery point**

Before any database connection or write:

1. print the sanitized target host/database;
2. confirm it is a disposable local database;
3. record a backup/restore point;
4. show the exact migration and backfill commands;
5. stop for explicit confirmation.

Expected: no migration, audit, or backfill command has run yet.

- [ ] **Step 6: Migrate, dry-run, apply, and prove idempotency only after explicit confirmation**

After the user confirms the displayed database target and backup:

~~~bash
npm --prefix backend run db:migrate:deploy
npm --prefix backend run merchant-platform:audit
npm --prefix backend run merchant-platform:backfill
npm --prefix backend run merchant-platform:backfill -- --apply
npm --prefix backend run merchant-platform:audit
npm --prefix backend run merchant-platform:backfill
~~~

Expected: schema migration succeeds on the disposable clone; the first audit/dry-run prints structured counts; apply succeeds only with no unresolved/conflict rows; the following audit is healthy; the final dry-run reports zero planned writes. If conflicts exist, stop before --apply and resolve data instead of inventing owner identities.

- [ ] **Step 7: Write and follow the browser acceptance runbook**

The runbook requires an explicit browser choice before automation; ambient UI state is not consent to control a browser. Load product-design:audit for visual/UX acceptance and the selected browser-control skill.

Start the isolated local backend and admin app. Record actual ports. Execute:

1. open /merchant-console/login;
2. verify unchecked merchant agreement blocks login;
3. request a local test code through the real local SMS path;
4. log in as a backfilled owner;
5. if multiple organizations exist, choose one and prove ticket replay fails;
6. choose store A, refresh, and prove selection persists;
7. switch to store B and prove allowedActions change with roles;
8. create an order_clerk;
9. edit that member to product_clerk as owner;
10. sign in as manager and prove finance/owner roles are unavailable;
11. disable a member and prove the old merchant session becomes 401;
12. attempt a cross-store member/category/profile mutation and prove rejection;
13. update store profile, then simulate expectedUpdatedAt conflict and verify 409 recovery;
14. log out and prove every LM_MERCHANT_* key is cleared while LM_ADMIN_* is untouched;
15. log in to administrator console and verify all three new menu pages load real API states;
16. use a regional administrator fixture and verify out-of-scope organization data is absent;
17. capture desktop and mobile-width screenshots for login, store selection, workbench, members, store profile, and three administrator pages;
18. keyboard-check focus order, visible focus, dialog return focus, labels, and 44px targets.

No external reference-platform write and no production deployment occur.

- [ ] **Step 8: Record evidence and unresolved gates**

docs/runbooks/merchant-platform-foundation-local-acceptance.md contains:

- commit SHA and worktree;
- Node version;
- exact passing commands;
- sanitized local database name and backup reference;
- dry-run/apply/rerun counts;
- browser and viewport;
- screenshot paths;
- scenarios passed/failed;
- known unrelated baseline failures;
- explicit statements: production migration not run, deployment not run, real traffic not tested, real-money flows not tested.

- [ ] **Step 9: Commit the acceptance suite and runbook**

~~~bash
git add backend/src/modules/merchant-identity/merchant-platform-security.spec.ts minitest/merchant-platform-foundation-contract.test.cjs docs/runbooks/merchant-platform-foundation-local-acceptance.md
git commit -m "test: verify merchant platform foundation"
~~~

## Plan Self-Review

### Approved-design coverage

| Approved requirement | Tasks |
|---|---:|
| M0-01 administrator any-permission repair | 1, 15 |
| Five built-in merchant roles | 2, 8, 14, 15 |
| Organization, member, store-role schema | 3 |
| Three-schema and two-dialect parity | 3, 15 |
| Dry-run-first legacy migration | 4, 15 |
| Single MerchantAccessService boundary | 5, 8, 10, 13 |
| Separate merchant authentication realm | 6, 7, 12, 15 |
| Session invalidation after role/status change | 6, 8, 15 |
| Merchant agreement consent | 6, 13 |
| Region-scoped administrator APIs | 9, 11, 15 |
| Platform admin three visible menus | 11, 15 |
| Merchant login, selection, workbench, employees, profile, logout | 12–15 |
| Legacy category ownership closure | 3, 4, 10, 15 |
| No fake operations or fake metrics | 11–14 |
| Production/data/finance safety boundary | Global constraints, 4, 15 |

### Placeholder and ambiguity scan

- No task contains an unresolved placeholder, unspecified endpoint, unspecified role, or unspecified storage key.
- Every state-changing script has an explicit dry-run/write boundary.
- Every merchant write names its required server permission.
- Every UI route names a real page and API.
- Every task ends with a focused verification and a scoped commit.
- Downstream order, finance, user, rider, and high-availability work is explicitly excluded instead of being represented by empty menus.

### Type and contract consistency

- Role and permission strings originate in merchant-permissions.ts.
- Merchant access responses use allowedActions derived from server roles.
- Merchant Web reads organization/member/store identity only from its verified merchant session.
- Admin region scope uses AdminDataScopeService and administrator token sub.
- Merchant access token audience is merchant_web; tokenUse separates access and refresh.
- Category ownership uses persisted Category.merchantId, never DTO ownership.
- Merchant profile optimistic concurrency uses expectedUpdatedAt.
- Member role/status optimistic concurrency uses expectedSessionVersion.
- Merchant.userId remains only a temporary compatibility read and is not removed by this plan.

## Completion Definition

This plan is locally complete only when all fifteen task commits exist, every focused test and build gate passes, disposable-database dry-run/apply/rerun evidence is recorded, and the selected-browser acceptance passes. The final report must still state that production migration, deployment, real traffic, merchant daily operations, funds, user mini-program external-delivery UX, rider workflows, and high-availability acceptance remain unfinished and require their own plans.
