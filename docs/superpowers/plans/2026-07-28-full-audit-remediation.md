# Full Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair every P0-P3 finding in `docs/code-audit-2026-07-27.md` without overwriting the user's existing backend, admin, site, or compiled mini-program changes.

**Architecture:** Keep the backend workspace and compiled mini-program as separate repositories. Repair trust boundaries in the controller/service/database layer first, then restore frontend contracts and engineering gates. Every non-trivial business fix starts with a focused failing regression test; the final gate reruns all backend, admin, site, contract, dependency, and mini-program checks under Node 22.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Jest, Vue 3, TypeScript, Vite, compiled WeChat mini-program, Node.js 22, npm workspaces, Git.

## Safety boundaries

- Do not read, move, upload, or stage database backup contents.
- Do not run migrations against a real/local business database; validate schema and migration SQL statically or against a disposable database only.
- Preserve all pre-existing dirty-worktree changes and inspect every touched diff before staging.
- Do not push until ignored paths and the staged index have both been checked.
- Do not create a public frontend repository; the accepted route is a separate private repository.

### Task 1: Close Git upload boundaries (P0-01, P2-06)

**Files:** `.gitignore`, `/Users/nianbaidediannao/Desktop/前端文件/.gitignore`, frontend Git index.

- [ ] Add backend storage, `.workbuddy`, and local work output to backend ignores.
- [ ] Add Playwright/Codex artifacts and the unused duplicate logo to frontend ignores.
- [ ] Remove already tracked frontend artifacts from the Git index while keeping local files.
- [ ] Prove no backup, screenshot, QR, or local audit artifact is staged.

### Task 2: Repair privileged access and regional finance scope (P1-01 to P1-04)

**Files:** admin compatibility controller, license runtime controller/service, finance admin controller/service, permission catalog/seeds, controller/service specs.

- [ ] Add a reusable server-side super-admin guard and protect the legacy compatibility and license/update/repair surfaces.
- [ ] Add resource-level region filters to finance overview, wallets, withdrawals, subsidy, and region-ledger reads/writes.
- [ ] Add a dedicated `finance:balance-adjust` permission and use it on canonical and compatibility endpoints.
- [ ] Add negative tests proving read-only and cross-region administrators are rejected.

### Task 3: Make money and membership mutations atomic (P1-05 to P1-08)

**Files:** admin service, finance admin service, membership service/schema/migration, top-up service, operation service and focused specs.

- [ ] Replace read-calculate-write balance changes with conditional/atomic database updates in one transaction.
- [ ] Normalize membership target types used by all callers and restoration flows.
- [ ] Add a membership usage idempotency key and conditional quota update.
- [ ] Put entitlement consumption and free-pin/second-hand fulfilment in the same transaction.
- [ ] Test insufficient funds, concurrent quota use, duplicate requests, and rollback on fulfilment failure.

### Task 4: Restore migration and admin runtime correctness (P1-09 to P1-11, P2-01, P2-02, P2-08)

**Files:** Prisma migration history/new migration, PostsManage, OperationLogs, AdminsPage, remaining Vue type-error files, backend mocks, robot creation UI/service.

- [ ] Revert the edited historical migration and append a new migration.
- [ ] Restore missing Vue state/helpers and clear every admin type error.
- [ ] Align password reset on PUT with an entered temporary password, shared strength validation, session revocation, and forced password change.
- [ ] Update only stale test doubles for the three known backend test failures.
- [ ] Remove the misleading robot password input and unused hashing.

### Task 5: Repair retry and API contracts (P2-04, P2-05)

**Files:** native WebSocket gateway/spec, contract checker/tests, compiled mini-program API export.

- [ ] On Prisma unique conflict, return the already stored private/group message acknowledgement with `duplicated: true`.
- [ ] Remove the deleted membership-benefit client wrapper.
- [ ] Infer the real request method from request/upload blocks and make strict mismatches exit non-zero.
- [ ] Add focused duplicate-message and GET/POST/removed-endpoint tests.

### Task 6: Dependency, bundle, migration-order, and lint governance (P2-03, P2-07, P3-01, P3-02)

**Files:** package manifests/lock, admin entry/Vite config/routes/components, unpublished migration directory names, lint scripts/config.

- [ ] Upgrade vulnerable direct dependencies and use narrowly scoped compatible overrides for vulnerable transitives; avoid force upgrades without tests.
- [ ] Switch Element Plus to on-demand loading and retain route lazy loading to bring the entry chunk below the configured budget.
- [ ] Give unpublished duplicate-prefix migrations unique increasing names without renaming published history.
- [ ] Add read-only `lint:check` and explicit `lint:fix` commands for backend/admin.

### Task 7: Full verification and separate Git delivery

- [ ] Run Prisma format/validate/generate, backend build, focused tests, and the full backend Jest suite serially.
- [ ] Run admin typecheck, lint check, and production build; record entry-chunk size.
- [ ] Run site tests/build and strict API contract tests.
- [ ] Run all compiled mini-program syntax and minitest checks.
- [ ] Run production dependency audit and classify any advisory that cannot be removed without a breaking framework migration.
- [ ] Run secret/path/index checks and inspect both repository diffs.
- [ ] Commit backend/admin/site and frontend separately, push the backend review branch, create a private frontend remote, and push its review branch only after every upload boundary check succeeds.
