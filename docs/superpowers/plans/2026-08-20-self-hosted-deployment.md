# Self-Hosted Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and deploy a verified authorization-free Lingmeng release to the user's Ubuntu server.

**Architecture:** Remove the disconnected commercial-license subsystem, repair the existing native deployment path, and create a deterministic release generator that stages only runtime artifacts. Install Node, MySQL, Redis, Nginx and PM2 natively, then deploy behind localhost-only service ports.

**Tech Stack:** NestJS 11, Prisma 5, Vue 3, Vite 6, Node.js 22, MySQL 8, Redis 7, Nginx, PM2, Bash.

**Spec:** `docs/superpowers/specs/2026-08-20-self-hosted-deployment-design.md`

## Global Constraints

- Preserve authentication, admin permissions, regional data scope and all unrelated dirty-worktree changes.
- Never package `.env`, tokens, keys, logs, uploads, storage, Git metadata, dependencies or iCloud placeholders.
- Use version `1.0.45-selfhosted.1` for every generated artifact.
- Do not expose ports 3000, 3306 or 6379 publicly.
- Every behavior change gets a failing test before implementation.

---

### Task 1: Lock the Self-Hosted Contract

**Files:**
- Create: `utils/self-hosted-release.spec.cjs`
- Create: `utils/self-hosted-release.cjs`

**Interfaces:**
- Produces: `buildSelfHostedRelease({ sourceRoot, outputDir, version })` and a CLI.

- [ ] Write tests that require no registered or packaged license runtime, reject sensitive/dataless input, require matching versions, and produce a manifest.
- [ ] Run the test and confirm failure because the generator does not exist.
- [ ] Implement only the staging, validation, hashing and ZIP behavior required by the tests.
- [ ] Re-run the tests and confirm they pass.

### Task 2: Remove Commercial Licensing Residue

**Files:**
- Delete: `backend/src/modules/license-runtime/**`
- Delete: `admin/src/views/system/LicenseRuntime.vue`
- Delete: `admin/src/views/system/MiniProgramDownload.vue`
- Modify: `backend/src/guards/admin.guard.ts`
- Modify: `backend/src/guards/jwt.guard.ts`
- Modify: `backend/src/config/env.validation.ts`
- Modify: `backend/.env.example`
- Modify: `deploy/env.backend.example`
- Modify: `admin/src/layout/MainLayout.vue`
- Modify: `admin/src/router/index.ts`
- Modify: `.gitignore`

**Interfaces:**
- Preserves: JWT login, admin/role guards, setup wizard and business authorization.
- Removes: all `/admin/license-runtime/**` routes and commercial-license environment keys.

- [ ] Extend the release test to fail on every remaining runtime/UI/config marker.
- [ ] Verify the marker test fails against the current tree.
- [ ] Remove the bounded files and references.
- [ ] Regenerate the API contract and verify license routes disappear.
- [ ] Run backend compile and focused guard/config tests.

### Task 3: Repair First-Install and Container Entrypoints

**Files:**
- Modify: `deploy/scripts/install.sh`
- Modify: `deploy/env.backend.example`
- Modify: `backend/src/main.ts`
- Modify: `backend/Dockerfile`
- Create: `backend/src/config/setup-cors.ts`
- Create: `backend/src/config/setup-cors.spec.ts`

**Interfaces:**
- Produces: setup-mode CORS selection and a source/release-layout-aware installer.

- [ ] Write failing setup-mode CORS and installer contract tests.
- [ ] Implement setup-only CORS fallback protected by `SETUP_TOKEN`.
- [ ] Make the installer resolve the repository/package root, generate missing secrets, and check the selected database client.
- [ ] Align Docker entrypoint with `dist/src/main.js` even though Docker is not the chosen production path.
- [ ] Run focused tests and shell syntax checks.

### Task 4: Restore Release Build Health

**Files:**
- Modify: `admin/src/views/finance/CommissionOverview.vue`
- Modify: `admin/src/views/finance/FinanceOverview.vue`
- Modify: root/backend/admin/site version metadata and `deploy/VERSION`.

**Interfaces:**
- Produces: a version-consistent, type-clean source tree.

- [ ] Use the existing type-check failures as RED evidence.
- [ ] Apply the smallest type-safe fixes.
- [ ] Run backend TypeScript, admin typecheck, site tests and migration self-check.
- [ ] Run full backend, admin and site builds.

### Task 5: Generate and Verify the Release

**Files:**
- Generate: `/Users/nianbaidediannao/Desktop/更新包/lingmeng-selfhosted-1.0.45-selfhosted.1.zip`

**Interfaces:**
- Consumes: successful Task 4 builds.
- Produces: a directly uploadable self-hosted archive plus manifest and SHA-256.

- [ ] Run the release generator.
- [ ] Test ZIP decompression and recompute every manifest hash.
- [ ] Scan for licensing markers, secrets, dependencies, logs, symlinks and dataless files.
- [ ] Inspect the staged application entrypoint and Nginx/PM2 configuration.

### Task 6: Install and Deploy the Server

**Files:**
- Remote: `/opt/lingmeng/**`, `/etc/nginx/sites-available/lingmeng`, PM2 state and local service configuration.

**Interfaces:**
- Consumes: verified Task 5 archive.
- Produces: running self-hosted application on `117.72.217.123`.

- [ ] Rotate to generated application/database/Redis secrets without printing them in chat.
- [ ] Install Node 22, MySQL 8, Redis 7, Nginx, PM2 and unzip.
- [ ] Create local-only database/Redis configuration and application directories.
- [ ] Upload and verify the archive SHA-256 before extraction.
- [ ] Run the installer, migrations, PM2 and Nginx configuration.
- [ ] Verify localhost health/setup, public site/admin/API, authenticated login flow and WebSocket upgrade.
- [ ] Restrict host/cloud-facing ports and record remaining domain/SSL gates.
