# Full Code Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit all current backend/admin/site and compiled mini-program code, produce an evidence-backed prioritized defect list, and defer business-code repairs until the user selects findings.

**Architecture:** Treat the backend workspace and compiled mini-program as separate repositories. Run their native checks under Node.js 22.22.2, then inspect high-risk trust boundaries and the complete pending Git changes. The audit phase is read-only except for this report documentation and later upload-ignore rules approved by the user.

**Tech Stack:** Node.js 22.22.2, npm workspaces, NestJS, Prisma, Vue 3, TypeScript, Jest, Vite, Node test runner, Git and GitHub CLI.

## Global Constraints

- Do not modify business code during the audit phase.
- Do not print credential or private-key values.
- Do not run migrations, seeds, production services, external messages, real payments, refunds, settlements, or database writes.
- Keep backend/admin and compiled mini-program Git histories separate.
- Do not push directly to `main` and do not force-push.
- Classify local static checks, local runtime checks, device proof, database proof, deployment proof, and production proof separately.

---

### Task 1: Establish the Safe Audit Inventory

**Files:**
- Inspect: `.gitignore`
- Inspect: `backend/.gitignore`
- Inspect: `/Users/nianbaidediannao/Desktop/前端文件/.gitignore`
- Create later: `docs/code-audit-2026-07-27.md`

**Interfaces:**
- Consumes: both repositories' tracked, modified, deleted, untracked and ignored paths.
- Produces: a list of uploadable source paths and excluded local/runtime paths.

- [ ] **Step 1: Verify the required runtime**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --version
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run preflight:node
```

Expected: Node reports `v22.22.2` and the preflight command exits 0.

- [ ] **Step 2: Inventory Git changes and file sizes**

Run in each repository:

```bash
git status --short --branch
git diff --stat
find . -type f -not -path './.git/*' -not -path './node_modules/*' -size +20M -print
```

Expected: all pending paths are accounted for; large files are recorded for upload review.

- [ ] **Step 3: Identify sensitive-looking source paths without printing values**

Run in each repository:

```bash
git ls-files -co --exclude-standard -z | xargs -0 rg -Il --pcre2 '(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9_-]{20,})'
```

Expected: only filenames are printed; every match is manually classified as a value, placeholder or explanatory label.

### Task 2: Run Backend, Admin and Site Baselines

**Files:**
- Inspect: `package.json`
- Inspect: `backend/package.json`
- Inspect: `admin/package.json`
- Inspect: `site/package.json`

**Interfaces:**
- Consumes: installed workspace dependencies and the current working tree.
- Produces: exact command, exit code and error evidence for every failed quality gate.

- [ ] **Step 1: Build the backend**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build:backend
```

Expected: exit 0; otherwise capture the first root-cause compiler or schema failure.

- [ ] **Step 2: Run all backend Jest tests serially**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --workspace backend test -- --runInBand
```

Expected: exit 0 with zero failed suites; database- or service-dependent failures are classified separately.

- [ ] **Step 3: Check and build the admin**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run typecheck:admin
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build:admin
```

Expected: both commands exit 0; file-specific compiler failures become findings.

- [ ] **Step 4: Test and build the public site**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --workspace site test
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build:site
```

Expected: both commands exit 0.

- [ ] **Step 5: Check API contracts and dependency health**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run contract:api
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm audit --omit=dev
```

Expected: strict contract check exits 0; dependency advisories are recorded with package, severity and whether the vulnerable path is production-reachable.

### Task 3: Run the Compiled Mini-Program Baselines

**Files:**
- Inspect: `/Users/nianbaidediannao/Desktop/前端文件/**/*.js`
- Inspect: `/Users/nianbaidediannao/Desktop/前端文件/minitest/*.test.cjs`
- Inspect: `/Users/nianbaidediannao/Desktop/前端文件/app.json`
- Inspect: `/Users/nianbaidediannao/Desktop/前端文件/project.config.json`

**Interfaces:**
- Consumes: the compiled mini-program source and local contract tests.
- Produces: syntax, route, package-size and behavior-test findings.

- [ ] **Step 1: Parse every tracked and untracked JavaScript file**

Run:

```bash
git ls-files -co --exclude-standard -z -- '*.js' '*.cjs' | xargs -0 -n 1 /opt/homebrew/opt/node@22/bin/node --check
```

Expected: every file parses; each failure records its exact path and line.

- [ ] **Step 2: Run all mini-program contract tests**

Run:

```bash
/opt/homebrew/opt/node@22/bin/node --test minitest/*.test.cjs
```

Expected: zero failed tests; failures are grouped by product surface instead of fixed immediately.

- [ ] **Step 3: Validate project routes and upload contents**

Run:

```bash
/opt/homebrew/opt/node@22/bin/node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('app.json','utf8')); JSON.parse(fs.readFileSync('project.config.json','utf8')); console.log('project json ok')"
git status --short
```

Expected: JSON parsing succeeds and local/private project configuration remains excluded.

### Task 4: Review High-Risk Code Paths

**Files:**
- Inspect: `backend/src/guards/**/*.ts`
- Inspect: `backend/src/common/services/admin-data-scope.service.ts`
- Inspect: `backend/src/common/services/wallet.service.ts`
- Inspect: `backend/src/modules/{payment,finance,finance-admin,merchant,mall,shop,errand,websocket,message,notify}/**/*.ts`
- Inspect: `backend/prisma/schema*.prisma`
- Inspect: `backend/prisma/migrations/**/*.sql`
- Inspect: `admin/src/api/**/*.ts`
- Inspect: `admin/src/router/**/*.ts`
- Inspect: `admin/src/stores/auth.ts`
- Inspect: all pending front-end files and their callers.

**Interfaces:**
- Consumes: controller-to-service-to-database flows, permission metadata, region/data-scope checks, transaction boundaries and client retry/idempotency behavior.
- Produces: findings with severity, file/line, reproduction or data-flow evidence, impact and minimal repair direction.

- [ ] **Step 1: Trace authentication and authorization**

Search:

```bash
rg -n '@Public|UseGuards|RequirePermission|regionId|AdminDataScope|findUnique|findMany|updateMany|deleteMany' backend/src admin/src
```

Expected: every public or privileged route is checked for intended authentication, permission and regional scope.

- [ ] **Step 2: Trace money and settlement mutations**

Search:

```bash
rg -n '\$transaction|balance|wallet|refund|settlement|payout|subsidy|idempot|increment|decrement' backend/src backend/prisma
```

Expected: each money mutation is checked for transactionality, idempotency, ownership, status preconditions and rollback behavior.

- [ ] **Step 3: Trace messages and concurrent lifecycle transitions**

Search:

```bash
rg -n 'clientMessageId|pairKey|upsert|unique|transaction|WebSocket|ws-native|pending_pay|pending_accept|accepted|in_progress|arrived|completed' backend/src backend/prisma /Users/nianbaidediannao/Desktop/前端文件
```

Expected: duplicate delivery, reconnect, read-state and order-state transitions are checked across client and server.

- [ ] **Step 4: Inspect the complete pending diff**

Run:

```bash
git diff --check
git diff --name-status
git diff --numstat
git diff --unified=20
```

Expected: deletions, generated artifacts, accidental truncation, unresolved markers, unsafe defaults and missing tests are recorded.

### Task 5: Produce the Decision Report

**Files:**
- Create: `docs/code-audit-2026-07-27.md`

**Interfaces:**
- Consumes: all audit evidence from Tasks 1-4.
- Produces: the user's repair-selection checklist.

- [ ] **Step 1: Rank findings**

Use:

```text
P0 = credential/data/fund loss or unauthenticated critical action
P1 = broken build, authorization bypass, incorrect money/order state or reproducible data corruption
P2 = important functional defect, performance/reliability issue or incomplete validation
P3 = maintainability, dead code, misleading UI or non-blocking quality debt
```

Expected: duplicate symptoms sharing one root cause are one finding.

- [ ] **Step 2: Write each finding with evidence**

Each entry contains:

```text
ID, severity, affected surface, file and line, observed evidence,
user/business impact, minimal repair direction, and verification gate.
```

Expected: no finding is based only on speculation.

- [ ] **Step 3: Present the repair choices**

Run:

```bash
git diff --check -- docs/code-audit-2026-07-27.md
git status --short --branch
```

Expected: the report is readable, contains no secret values, and clearly separates local failures from unverified production behavior.

No business-code repair, preservation snapshot, remote repository creation or push occurs until the user selects findings from this report.
