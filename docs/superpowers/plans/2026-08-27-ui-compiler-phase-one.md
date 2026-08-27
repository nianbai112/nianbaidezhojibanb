# UI Compiler Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working PageDocument v2 and component-registry loop: four reference components can be nested, validated, migrated from v1, saved as an isolated v2 draft, reloaded, and previewed in an experimental admin studio without publishing or touching the Mini Program source tree.

**Architecture:** Add a small CommonJS TypeScript workspace package as the canonical UI contract shared by NestJS and Vue. The backend exposes the serialized registry and an authenticated v2 draft/validation API backed by the existing `Config` table; the admin adds an experimental, lazy-loaded studio whose tree operations are pure and tested. This phase deliberately stops before dynamic publication, Mini Program runtime changes, native WXML compilation, build artifacts, or database migrations.

**Tech Stack:** Node.js 22, TypeScript 5.7, npm workspaces, Node test runner, NestJS 11, Prisma 5, Vue 3, Vite 6, Element Plus.

**Spec:** `docs/superpowers/specs/2026-08-27-ui-compiler-platform-design.md`

## Global Constraints

- Work from an isolated Git worktree created with `superpowers:using-git-worktrees`; the current checkout has unrelated user changes.
- Do not modify `/Users/nianbaidediannao/Desktop/前端文件` in phase one.
- Do not add Handlebars, EJS, a drag-and-drop dependency, a schema-validation dependency, or a new database table.
- Keep `PageDocument v2` as the canonical saved contract; editor selection, panel state, drag state, undo history, and zoom never enter the document.
- No arbitrary JavaScript, WXML, WXSS, CSS strings, URL endpoints, or executable expressions may enter the contract.
- A draft save must not publish, build a code package, write the Mini Program source tree, or modify the legacy v1 draft/published keys.
- Reuse permissions `layout:view` and `layout:edit`; phase one exposes no v2 publish permission or endpoint.
- Use TDD for every non-trivial behavior and commit after every task.
- Do not change the current TMagic, ActivityStudio, HomeEditor, MessageEditor, ProfileEditor, `LayoutBuilder`, public layout endpoints, or Mini Program renderer in this phase.

## File Structure

### Shared contract workspace

- `packages/ui-contract/package.json`: CommonJS workspace package metadata and build/test scripts.
- `packages/ui-contract/tsconfig.json`: emits JavaScript and declarations into `dist`.
- `packages/ui-contract/src/types.ts`: PageDocument, node, schema, registry, diagnostic, and migration types only.
- `packages/ui-contract/src/document.ts`: empty document creation, normalization, tree walking, and stable serialization.
- `packages/ui-contract/src/registry.ts`: registry construction, lookup, and JSON-safe serialization.
- `packages/ui-contract/src/components/container.ts`: reference container manifest.
- `packages/ui-contract/src/components/text.ts`: reference text manifest.
- `packages/ui-contract/src/components/image.ts`: reference image manifest.
- `packages/ui-contract/src/components/button.ts`: reference button manifest.
- `packages/ui-contract/src/validate.ts`: structural, tree, prop, and slot validation.
- `packages/ui-contract/src/migrate-v1.ts`: deterministic v1 flat-layout migration.
- `packages/ui-contract/src/index.ts`: public exports only.
- `packages/ui-contract/test/*.test.cjs`: executable contract tests against built output.

### Backend

- `backend/src/modules/ui-compiler/ui-compiler.service.ts`: registry, validation, migration-on-read, and isolated v2 draft persistence.
- `backend/src/modules/ui-compiler/ui-compiler.controller.ts`: authenticated admin endpoints; no publish endpoint.
- `backend/src/modules/ui-compiler/ui-compiler.module.ts`: Nest module wiring.
- `backend/src/modules/ui-compiler/ui-compiler.service.spec.ts`: service contract tests with a Prisma mock.
- `backend/src/modules/ui-compiler/ui-compiler.controller.spec.ts`: route/permission and delegation checks.
- `backend/src/app.module.ts`: import the new module.

### Admin

- `admin/src/views/miniapp/ui-compiler/uiCompilerApi.ts`: v2 registry/draft/validation request functions.
- `admin/src/views/miniapp/ui-compiler/uiDocumentModel.mjs`: pure immutable tree editing operations.
- `admin/src/views/miniapp/ui-compiler/uiDocumentModel.test.mjs`: node insertion, move, cycle, update, and removal tests.
- `admin/src/views/miniapp/ui-compiler/UiCompilerStudio.vue`: orchestration, region/page selection, registry loading, validation, and draft save.
- `admin/src/views/miniapp/ui-compiler/UiCanvasNode.vue`: recursive preview and native drag/drop events.
- `admin/src/views/miniapp/ui-compiler/UiPropertyPanel.vue`: schema-driven property controls using the existing `FieldInput`.
- `admin/src/views/miniapp/ui-compiler/uiCompilerStudio.contract.test.mjs`: source-level guard that the experimental studio is lazy-loaded and exposes no publish path.
- `admin/src/views/miniapp/designer/DesignerStudio.vue`: add one experimental “新内核” tab without changing existing tabs.

### Workspace wiring

- `package.json`: register `packages/ui-contract` and build it before app workspaces.
- `package-lock.json`: record the workspace package and local dependencies.
- `backend/package.json`: depend on `@lingmeng/ui-contract` and build it first.
- `admin/package.json`: depend on `@lingmeng/ui-contract`; build/typecheck it first and add the focused Node test command.

---

### Task 1: Create the shared workspace and PageDocument core

**Files:**
- Create: `packages/ui-contract/package.json`
- Create: `packages/ui-contract/tsconfig.json`
- Create: `packages/ui-contract/src/types.ts`
- Create: `packages/ui-contract/src/document.ts`
- Create: `packages/ui-contract/src/index.ts`
- Create: `packages/ui-contract/test/document.test.cjs`
- Modify: `package.json`
- Modify: `backend/package.json`
- Modify: `admin/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `createEmptyPageDocument(input: CreatePageDocumentInput): PageDocument`
- Produces: `normalizePageDocument(input: PageDocument): PageDocument`
- Produces: `walkNodes(root: PageNode): PageNode[]`
- Produces: `findNode(root: PageNode, id: string): PageNode | null`
- Produces: `stableStringifyPageDocument(document: PageDocument): string`
- Produces: exported types `PageDocument`, `PageNode`, `PageInfo`, `NodeLayout`, `NodeStyle`, `DataBinding`, and `ActionBinding`

- [ ] **Step 1: Add the workspace package shell, register it, and write failing document tests**

Create `packages/ui-contract/package.json` with this exact public shape:

```json
{
  "name": "@lingmeng/ui-contract",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.json",
    "test": "npm run build && node --test test/*.test.cjs"
  },
  "devDependencies": {
    "typescript": "5.7.3"
  }
}
```

Create `packages/ui-contract/test/document.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createEmptyPageDocument,
  findNode,
  normalizePageDocument,
  stableStringifyPageDocument,
  walkNodes,
} = require('../dist')

test('creates a v2 flow document with a page root', () => {
  const document = createEmptyPageDocument({
    id: 'home-global',
    pageKey: 'home',
    title: '首页',
    regionId: 'global',
    releaseMode: 'mixed',
  })
  assert.equal(document.schemaVersion, 2)
  assert.equal(document.page.layoutMode, 'flow')
  assert.equal(document.page.releaseMode, 'mixed')
  assert.deepEqual(document.root.children, [])
})

test('normalizes nodes and serializes equivalent objects identically', () => {
  const base = createEmptyPageDocument({ id: 'x', pageKey: 'home', title: '首页', regionId: 'global' })
  base.root.children.push({
    type: 'text', id: 'text_1', componentVersion: 1, enabled: true,
    props: { content: '你好' }, style: {}, layout: {}, bindings: {}, actions: {}, children: [],
  })
  const reordered = JSON.parse(JSON.stringify(base))
  reordered.root.children[0].props = { content: '你好' }
  const normalized = normalizePageDocument(reordered)
  assert.equal(walkNodes(normalized.root).length, 2)
  assert.equal(findNode(normalized.root, 'text_1').props.content, '你好')
  assert.equal(stableStringifyPageDocument(base), stableStringifyPageDocument(reordered))
})
```

Add `packages/ui-contract` to the root `workspaces` array and run `npm install` so npm recognizes the local package. Do not add document implementation files yet.

- [ ] **Step 2: Run the document test and verify RED**

Run:

```bash
npm --workspace @lingmeng/ui-contract test
```

Expected: FAIL because `src/index.ts` and the exported document functions do not exist.

- [ ] **Step 3: Wire the workspace and implement the minimum document contract**

Add `@lingmeng/ui-contract: "*"` to both app dependencies. Add `build:ui-contract` to root scripts and make the root `build` call it first. Add `prebuild` to backend and `prebuild` plus `pretypecheck` to admin so direct workspace builds cannot use stale contract output. Run `npm install` again to update the workspace dependency entries in `package-lock.json`.

Use these exact root entries:

```json
{
  "workspaces": ["backend", "admin", "site", "packages/ui-contract"],
  "scripts": {
    "build:ui-contract": "npm --workspace @lingmeng/ui-contract run build",
    "build": "npm run build:ui-contract && npm run build:backend && npm run build:admin && npm run build:site"
  }
}
```

Add `"prepare": "npm run build"` to `packages/ui-contract/package.json` after the source files exist. Both `backend/package.json` and `admin/package.json` receive `"@lingmeng/ui-contract": "*"` under dependencies and these scripts:

```json
{
  "prebuild": "npm --workspace @lingmeng/ui-contract run build",
  "prestart:dev": "npm --workspace @lingmeng/ui-contract run build"
}
```

For admin, name the development hook `predev` instead of `prestart:dev`, and additionally add:

```json
{
  "predev": "npm --workspace @lingmeng/ui-contract run build",
  "pretypecheck": "npm --workspace @lingmeng/ui-contract run build"
}
```

Define these exact discriminants in `types.ts`:

```ts
export type ReleaseMode = 'compiled' | 'dynamic' | 'mixed'
export type LayoutMode = 'flow' | 'grid' | 'absolute'
export type NodeLayout = Record<string, unknown>
export type NodeStyle = Record<string, unknown>

export interface DataBinding {
  source: string
  params?: Record<string, string | number | boolean>
}

export interface ActionBinding {
  type: string
  target?: string
  params?: Record<string, string | number | boolean>
}

export interface CreatePageDocumentInput {
  id: string
  pageKey: string
  title: string
  regionId: string
  releaseMode?: ReleaseMode
  layoutMode?: LayoutMode
  theme?: string
}

export interface PageInfo {
  key: string
  title: string
  releaseMode: ReleaseMode
  layoutMode: LayoutMode
  theme: string
  regionId: string
}

export interface PageNode {
  id: string
  type: string
  componentVersion: number
  enabled: boolean
  props: Record<string, unknown>
  style: NodeStyle
  layout: NodeLayout
  bindings: Record<string, DataBinding>
  actions: Record<string, ActionBinding>
  visibility?: Record<string, unknown>
  children: PageNode[]
  migrationError?: { code: string; message: string; originalType: string }
}

export interface PageDocument {
  schemaVersion: 2
  id: string
  revision: number
  page: PageInfo
  root: PageNode
  settings: Record<string, unknown>
  metadata: { createdBy?: string; updatedAt?: string }
}
```

Implement `document.ts` with deterministic recursive key sorting. `stableStringifyPageDocument` must omit `metadata` and `revision` before serialization so timestamps and save counters do not change the semantic representation. Extend the test by setting a different `revision` and `metadata.updatedAt` on `reordered` while still expecting the same stable string. `normalizePageDocument` must fill missing node maps/arrays, never mutate the input, and preserve unknown serializable fields only inside the declared maps.

- [ ] **Step 4: Run focused tests and builds**

Run:

```bash
npm --workspace @lingmeng/ui-contract test
npm --workspace @lingmeng/ui-contract run build
```

Expected: 2 tests PASS and TypeScript emits `dist/index.js` plus declarations.

- [ ] **Step 5: Commit the contract foundation**

```bash
git add package.json package-lock.json backend/package.json admin/package.json packages/ui-contract
git commit -m "feat: add PageDocument v2 contract workspace"
```

---

### Task 2: Add the registry and four reference manifests

**Files:**
- Create: `packages/ui-contract/src/registry.ts`
- Create: `packages/ui-contract/src/components/container.ts`
- Create: `packages/ui-contract/src/components/text.ts`
- Create: `packages/ui-contract/src/components/image.ts`
- Create: `packages/ui-contract/src/components/button.ts`
- Create: `packages/ui-contract/test/registry.test.cjs`
- Modify: `packages/ui-contract/src/types.ts`
- Modify: `packages/ui-contract/src/index.ts`

**Interfaces:**
- Consumes: `PageNode` and target/layout discriminants from Task 1.
- Produces: `referenceManifests: readonly ComponentManifest[]`
- Produces: `createComponentRegistry(manifests): ComponentRegistry`
- Produces: `getComponentManifest(registry, type): ComponentManifest | null`
- Produces: `listComponentManifests(registry): ComponentManifest[]`
- Produces: `serializeComponentRegistry(registry): ComponentManifest[]`

- [ ] **Step 1: Write failing registry tests**

Create `packages/ui-contract/test/registry.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createComponentRegistry,
  defaultRegistry,
  getComponentManifest,
  listComponentManifests,
  serializeComponentRegistry,
} = require('../dist')

test('ships exactly four reference components in phase one', () => {
  assert.deepEqual(
    listComponentManifests(defaultRegistry).map((item) => item.type).sort(),
    ['button', 'container', 'image', 'text'],
  )
  assert.equal(getComponentManifest(defaultRegistry, 'container').slots[0].name, 'default')
  assert.equal(getComponentManifest(defaultRegistry, 'text').targets.dynamic, true)
})

test('rejects duplicate component types', () => {
  const manifest = getComponentManifest(defaultRegistry, 'text')
  assert.throws(() => createComponentRegistry([manifest, manifest]), /duplicate component type: text/)
})

test('serializes the registry without executable values', () => {
  const serialized = serializeComponentRegistry(defaultRegistry)
  assert.equal(JSON.stringify(serialized).includes('function'), false)
  assert.equal(serialized.find((item) => item.type === 'button').propsSchema.text.default, '按钮')
})
```

- [ ] **Step 2: Run the registry test and verify RED**

Run:

```bash
npm --workspace @lingmeng/ui-contract test
```

Expected: FAIL because registry exports and manifests do not exist.

- [ ] **Step 3: Define schema types and manifests**

Add these schema types to `types.ts`:

```ts
export type PropControl = 'text' | 'textarea' | 'number' | 'switch' | 'color' | 'image' | 'select'

export interface PropFieldSchema {
  type: 'string' | 'number' | 'boolean'
  label: string
  control: PropControl
  default: string | number | boolean
  required?: boolean
  min?: number
  max?: number
  maxLength?: number
  options?: Array<{ label: string; value: string | number | boolean }>
}

export interface ComponentManifest {
  type: string
  name: string
  category: 'layout' | 'base' | 'display' | 'form' | 'business'
  version: number
  icon: string
  targets: { compiled: boolean; dynamic: boolean }
  layoutModes: Array<'flow' | 'grid' | 'absolute'>
  propsSchema: Record<string, PropFieldSchema>
  slots: Array<{ name: string; accepts: string[]; min: number; max: number }>
  previewKey: string
}

export type ComponentRegistry = ReadonlyMap<string, ComponentManifest>
```

Manifest requirements:

- `container`: layout category, accepts `*`, maximum 100 children, props `direction`, `gap`, `padding`, and `background`.
- `text`: base category, no slots, props `content`, `fontSize`, `color`, `align`, and `bold`.
- `image`: base category, no slots, props `src`, `mode`, `alt`, and `borderRadius`.
- `button`: base category, no slots, props `text`, `variant`, `background`, `color`, and `radius`.
- All four target both `compiled` and `dynamic`; all support `flow` and `grid`; only these four reference components may also declare `absolute` in phase one.

`serializeComponentRegistry` must return deep-cloned, type-sorted plain objects so the backend can return them as JSON without leaking a `Map`.

- [ ] **Step 4: Run the registry and document tests**

Run:

```bash
npm --workspace @lingmeng/ui-contract test
```

Expected: all document and registry tests PASS.

- [ ] **Step 5: Commit the registry**

```bash
git add packages/ui-contract
git commit -m "feat: register reference UI components"
```

---

### Task 3: Validate PageDocument structure, props, and slots

**Files:**
- Create: `packages/ui-contract/src/validate.ts`
- Create: `packages/ui-contract/test/validate.test.cjs`
- Modify: `packages/ui-contract/src/types.ts`
- Modify: `packages/ui-contract/src/index.ts`

**Interfaces:**
- Consumes: `PageDocument`, `ComponentRegistry`, and `defaultRegistry`.
- Produces: `validatePageDocument(input: unknown, registry?, limits?): ValidationResult`
- Produces: `ValidationResult = { valid: boolean; diagnostics: Diagnostic[]; document?: PageDocument }`
- Produces: exported type `Diagnostic`
- Uses exact default limits: maximum 200 non-root nodes and maximum depth 12.

- [ ] **Step 1: Write failing validation tests**

Create tests for one valid nested document and these exact failures:

```js
test('accepts container with text image and button children', () => {
  const document = fixtureDocument([
    fixtureNode('container', 'container_1', [
      fixtureNode('text', 'text_1'),
      fixtureNode('image', 'image_1'),
      fixtureNode('button', 'button_1'),
    ]),
  ])
  const result = validatePageDocument(document)
  assert.equal(result.valid, true)
  assert.deepEqual(result.diagnostics, [])
})

test('reports stable diagnostics for unsafe and invalid nodes', () => {
  const document = fixtureDocument([
    fixtureNode('text', 'duplicate'),
    { ...fixtureNode('text', 'duplicate'), props: { content: 42 }, children: [fixtureNode('button', 'child')] },
  ])
  document.settings = { unsafe: () => true }
  const result = validatePageDocument(document)
  assert.equal(result.valid, false)
  assert.deepEqual(result.diagnostics.map((item) => item.code).sort(), [
    'document.executable-value',
    'node.duplicate-id',
    'props.type',
    'slots.not-allowed',
  ])
})
```

Also test `node.limit`, `node.depth`, unknown component, unsupported release target, invalid root type, invalid page key, component prop min/max/maxLength, unknown style keys, and non-empty bindings/actions/visibility.

- [ ] **Step 2: Run validation tests and verify RED**

Run:

```bash
npm --workspace @lingmeng/ui-contract test
```

Expected: FAIL because `validatePageDocument` is not exported.

- [ ] **Step 3: Implement deterministic validation**

Use a single recursive traversal with a `WeakSet<object>` to detect executable/cyclic input before normalization. Emit diagnostics in traversal order with this shape:

```ts
export interface Diagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  nodeId?: string
  path?: string
}

export interface ValidationResult {
  valid: boolean
  diagnostics: Diagnostic[]
  document?: PageDocument
}
```

Validation order must be: top-level contract, executable/cycle scan, root, node IDs/count/depth, manifest target, props, style/layout, bindings/actions/visibility, slots. The validator must never throw for user input; it returns diagnostics. Only programmer misuse, such as a malformed registry, may throw.

The root type is the built-in `page` and does not require a registry manifest. All other types do. `compiled` pages require `targets.compiled`; `dynamic` pages require `targets.dynamic`; `mixed` pages accept both but every node must support at least one target. Phase one does not infer dynamic-slot placement.

Phase one permits only these node style keys: `width`, `height`, `marginTop`, `marginBottom`, `marginX`, `padding`, `background`, `borderRadius`, and `opacity`. Numeric keys require finite numbers; `background` accepts only an empty string, a hex color, `rgb(...)`, or `rgba(...)`; `opacity` is 0 through 1. Root layout permits only `{ display: 'flex', direction: 'column', gap: finiteNumber }`; reference component layouts stay empty because their phase-one layout controls live in validated props.

Bindings, actions, and visibility are contract fields reserved for later phases but must be empty in phase one. Emit `bindings.phase-one-disabled`, `actions.phase-one-disabled`, or `visibility.phase-one-disabled` when a submitted document tries to use them.

- [ ] **Step 4: Run all shared contract tests**

Run:

```bash
npm --workspace @lingmeng/ui-contract test
```

Expected: all document, registry, and validation tests PASS.

- [ ] **Step 5: Commit validation**

```bash
git add packages/ui-contract
git commit -m "feat: validate PageDocument v2"
```

---

### Task 4: Migrate legacy flat layouts without data loss

**Files:**
- Create: `packages/ui-contract/src/migrate-v1.ts`
- Create: `packages/ui-contract/test/migrate-v1.test.cjs`
- Modify: `packages/ui-contract/src/types.ts`
- Modify: `packages/ui-contract/src/index.ts`

**Interfaces:**
- Consumes: `createEmptyPageDocument`, `normalizePageDocument`, and `defaultRegistry`.
- Produces: `migrateV1Layout(input, context, registry?): MigrationResult`
- Produces: `MigrationResult = { document: PageDocument; diagnostics: Diagnostic[]; sourceVersion: 1 | 2 }`
- Context: `{ pageKey: string; title: string; regionId: string; releaseMode?: ReleaseMode }`

- [ ] **Step 1: Write failing migration tests**

Create tests with the exact observable behavior:

```js
test('sorts v1 components and maps config to props', () => {
  const result = migrateV1Layout({
    components: [
      { id: 'button_1', type: 'button', order: 2, enabled: true, config: { text: '进入' }, style: {} },
      { id: 'text_1', type: 'text', order: 1, enabled: false, config: { content: '标题' }, style: { marginTop: 8 } },
    ],
    settings: { showAuthGuide: true },
  }, { pageKey: 'home', title: '首页', regionId: 'global', releaseMode: 'mixed' })
  assert.deepEqual(result.document.root.children.map((node) => node.id), ['text_1', 'button_1'])
  assert.equal(result.document.root.children[0].props.content, '标题')
  assert.equal(result.document.root.children[0].enabled, false)
  assert.equal(result.document.settings.showAuthGuide, true)
})

test('preserves unknown v1 components as blocked migration nodes', () => {
  const result = migrateV1Layout({
    components: [{ id: 'legacy_1', type: 'old-widget', order: 0, config: { secret: 'kept' }, style: {} }],
    settings: {},
  }, { pageKey: 'home', title: '首页', regionId: 'global' })
  const node = result.document.root.children[0]
  assert.equal(node.type, 'legacy-unknown')
  assert.equal(node.props.originalType, 'old-widget')
  assert.deepEqual(node.props.originalConfig, { secret: 'kept' })
  assert.equal(node.migrationError.code, 'migration.unknown-component')
})

test('returns an existing v2 document without remigrating it', () => {
  const v2 = createEmptyPageDocument({ id: 'x', pageKey: 'home', title: '首页', regionId: 'global' })
  const result = migrateV1Layout(v2, { pageKey: 'ignored', title: '忽略', regionId: 'ignored' })
  assert.equal(result.sourceVersion, 2)
  assert.equal(result.document.id, 'x')
})
```

- [ ] **Step 2: Run migration tests and verify RED**

Run:

```bash
npm --workspace @lingmeng/ui-contract test
```

Expected: FAIL because `migrateV1Layout` does not exist.

- [ ] **Step 3: Implement v1 migration**

Known v1 components map directly only when a phase-one manifest exists. Their `config` becomes `props`; only the phase-one style whitelist from Task 3 is copied, and dropped style keys produce `migration.unsupported-style` warning diagnostics. Unknown components become `legacy-unknown` nodes with:

```ts
{
  type: 'legacy-unknown',
  props: {
    originalType: old.type,
    originalConfig: old.config ?? {},
    originalStyle: old.style ?? {},
  },
  migrationError: {
    code: 'migration.unknown-component',
    message: `组件 ${old.type} 尚未注册，已保留原始数据`,
    originalType: old.type,
  },
}
```

Generate missing IDs deterministically as `${safeType}_${index + 1}`; do not use timestamps or random values in migration. Duplicate IDs receive the suffix `__2`, `__3`, and so on, with a warning diagnostic. Migration output is normalized but not declared publishable; the validator must reject `legacy-unknown` until a manifest or explicit conversion exists.

- [ ] **Step 4: Run shared tests**

Run:

```bash
npm --workspace @lingmeng/ui-contract test
```

Expected: all shared contract tests PASS.

- [ ] **Step 5: Commit migration**

```bash
git add packages/ui-contract
git commit -m "feat: migrate legacy layouts to PageDocument v2"
```

---

### Task 5: Expose authenticated v2 registry and draft APIs

**Files:**
- Create: `backend/src/modules/ui-compiler/ui-compiler.service.ts`
- Create: `backend/src/modules/ui-compiler/ui-compiler.controller.ts`
- Create: `backend/src/modules/ui-compiler/ui-compiler.module.ts`
- Create: `backend/src/modules/ui-compiler/ui-compiler.service.spec.ts`
- Create: `backend/src/modules/ui-compiler/ui-compiler.controller.spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: shared `defaultRegistry`, `migrateV1Layout`, `normalizePageDocument`, `serializeComponentRegistry`, and `validatePageDocument`.
- Produces: `GET /admin/ui-pages/registry`
- Produces: `GET /admin/ui-pages/:pageKey/:regionId/draft`
- Produces: `POST /admin/ui-pages/:pageKey/:regionId/validate`
- Produces: `PUT /admin/ui-pages/:pageKey/:regionId/draft`
- Produces: `validateDraft(pageKey: string, regionId: string, input: unknown)`
- Produces: `saveDraft(pageKey: string, regionId: string, input: unknown, operatorId: string, ip: string)`
- Persists only key `ui.page.v2.${pageKey}.${regionId}.draft` in the existing `Config` table.

- [ ] **Step 1: Write failing service tests**

Use a Prisma mock with `config.findUnique`, `config.upsert`, and `adminOperationLog.create`. Cover these exact cases:

```ts
it('returns a saved v2 draft before legacy data', async () => {
  prisma.config.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(where.key.startsWith('ui.page.v2.') ? { value: v2Document } : { value: legacyLayout }),
  );
  const result = await service.getDraft('home', 'global');
  expect(result.data.source).toBe('v2-draft');
  expect(result.data.document).toEqual(v2Document);
});

it('migrates the legacy draft in memory without writing it', async () => {
  prisma.config.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ value: legacyLayout })
    .mockResolvedValueOnce(null);
  const result = await service.getDraft('home', 'global');
  expect(result.data.source).toBe('v1-draft-migrated');
  expect(result.data.document.schemaVersion).toBe(2);
  expect(prisma.config.upsert).not.toHaveBeenCalled();
});

it('rejects an invalid document and never writes a draft', async () => {
  await expect(service.saveDraft('home', 'global', invalidDocument, 'admin-1', '127.0.0.1'))
    .rejects.toThrow('PageDocument 校验失败');
  expect(prisma.config.upsert).not.toHaveBeenCalled();
});

it('writes only the isolated v2 draft key', async () => {
  await service.saveDraft('home', 'global', validDocument, 'admin-1', '127.0.0.1');
  expect(prisma.config.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { key: 'ui.page.v2.home.global.draft' },
  }));
  expect(JSON.stringify(prisma.config.upsert.mock.calls)).not.toContain('_published');
});
```

Also test invalid `pageKey`, invalid `regionId`, registry serialization, empty fallback, legacy published fallback, and audit-log failure not failing a successful save.

Add an optimistic-concurrency test: when the stored v2 draft has revision 4 and the submitted document has revision 3, `saveDraft` throws `ConflictException` with `草稿已被其他编辑覆盖，请刷新后重试` and does not call `upsert`.

- [ ] **Step 2: Run the service spec and verify RED**

Run:

```bash
npm --workspace @lingmeng/ui-contract run build
npm --workspace backend test -- --runInBand src/modules/ui-compiler/ui-compiler.service.spec.ts
```

Expected: FAIL because the module and service do not exist.

- [ ] **Step 3: Implement the service**

Use these exact lookup keys in order:

```ts
const v2DraftKey = `ui.page.v2.${pageKey}.${regionId}.draft`;
const legacyDraftKey = `layout_${pageKey}_${regionId}_draft`;
const legacyPublishedKey = `layout_${pageKey}_${regionId}_published`;
```

Validation regexes:

```ts
const PAGE_KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;
const REGION_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
```

`getDraft` returns one of `v2-draft`, `v1-draft-migrated`, `v1-published-migrated`, or `empty`. Legacy reads are migration previews only and must not write. For an empty `ui-lab` page, create ID `ui-lab-${regionId}`, title `UI 实验页`, release mode `dynamic`, and revision 0. For an empty `home` page, use title `首页` and release mode `mixed`.

`saveDraft` first reads the current v2 key. If it exists and its revision differs from the submitted revision, throw `ConflictException`; otherwise normalize and validate, then upsert only the v2 key with group `ui-page-v2`. It increments `revision` from the submitted revision by one, updates metadata, and logs `save_draft` under module `ui-compiler`.

`validateDraft` returns diagnostics and a normalized document when valid; it never saves.

- [ ] **Step 4: Write and run controller tests**

The controller spec must verify that:

- the class uses `JwtGuard`, `AdminGuard`, and `AdminPermissionGuard`;
- registry and draft reads require `layout:view`;
- validate and save require `layout:edit`;
- there is no method or route containing `publish`, `build`, or `code`;
- each route delegates to the corresponding service method.

Implement this controller surface; keep static `registry` before parameterized routes:

```ts
@ApiTags('UI 编译平台')
@Controller('admin/ui-pages')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@ApiBearerAuth()
export class UiCompilerController {
  constructor(private readonly service: UiCompilerService) {}

  @Get('registry')
  @RequirePermission('layout:view')
  registry() {
    return this.service.registry();
  }

  @Get(':pageKey/:regionId/draft')
  @RequirePermission('layout:view')
  getDraft(@Param('pageKey') pageKey: string, @Param('regionId') regionId: string) {
    return this.service.getDraft(pageKey, regionId);
  }

  @Post(':pageKey/:regionId/validate')
  @RequirePermission('layout:edit')
  validate(
    @Param('pageKey') pageKey: string,
    @Param('regionId') regionId: string,
    @Body() body: { document?: unknown },
  ) {
    return this.service.validateDraft(pageKey, regionId, body?.document);
  }

  @Put(':pageKey/:regionId/draft')
  @RequirePermission('layout:edit')
  saveDraft(
    @Param('pageKey') pageKey: string,
    @Param('regionId') regionId: string,
    @Body() body: { document?: unknown },
    @CurrentUser('sub') operatorId: string,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    return this.service.saveDraft(pageKey, regionId, body?.document, operatorId, ip);
  }
}
```

Run:

```bash
npm --workspace backend test -- --runInBand src/modules/ui-compiler/ui-compiler.controller.spec.ts
```

Expected: FAIL before the controller exists, then PASS after implementation.

- [ ] **Step 5: Wire the module and run backend checks**

Add `UiCompilerModule` to `AppModule`. Run:

```bash
npm --workspace backend test -- --runInBand src/modules/ui-compiler/ui-compiler.service.spec.ts src/modules/ui-compiler/ui-compiler.controller.spec.ts
npm --workspace backend run build
```

Expected: focused tests PASS and Nest/TypeScript build exits 0.

- [ ] **Step 6: Commit the backend draft boundary**

```bash
git add backend/src/modules/ui-compiler backend/src/app.module.ts
git commit -m "feat: add isolated UI compiler draft API"
```

---

### Task 6: Build pure admin tree operations and API functions

**Files:**
- Create: `admin/src/views/miniapp/ui-compiler/uiDocumentModel.mjs`
- Create: `admin/src/views/miniapp/ui-compiler/uiDocumentModel.test.mjs`
- Create: `admin/src/views/miniapp/ui-compiler/uiCompilerApi.ts`
- Modify: `admin/package.json`

**Interfaces:**
- Consumes: serialized component manifests and PageDocument returned by Task 5.
- Produces: `createNodeFromManifest(manifest, id): PageNode`
- Produces: `insertNode(document, parentId, node, index?): PageDocument`
- Produces: `moveNode(document, nodeId, targetParentId, targetIndex?): PageDocument`
- Produces: `removeNode(document, nodeId): PageDocument`
- Produces: `updateNodeProps(document, nodeId, patch): PageDocument`
- Produces: `flattenDocument(document): Array<{ node, parentId, depth }>`
- Produces API functions `loadUiRegistry`, `loadUiDraft`, `validateUiDraft`, and `saveUiDraft`.

- [ ] **Step 1: Write failing tree-model tests**

Create `uiDocumentModel.test.mjs` with a minimal root document and serialized container/text manifests. Test:

```js
test('creates defaults and inserts a text node into a container', () => {
  const container = createNodeFromManifest(containerManifest, 'container_1')
  const text = createNodeFromManifest(textManifest, 'text_1')
  let next = insertNode(documentFixture(), 'root', container)
  next = insertNode(next, 'container_1', text)
  assert.equal(next.root.children[0].children[0].props.content, '文本内容')
  assert.equal(documentFixture().root.children.length, 0)
})

test('rejects moving a container into its own descendant', () => {
  const nested = documentWithNestedContainers()
  assert.throws(() => moveNode(nested, 'container_1', 'container_2'), /不能移动到自身或后代节点/)
})

test('moves, updates and removes without mutating the input', () => {
  const original = documentWithTextAndButton()
  const moved = moveNode(original, 'button_1', 'container_1', 0)
  const updated = updateNodeProps(moved, 'button_1', { text: '立即进入' })
  const removed = removeNode(updated, 'text_1')
  assert.equal(updated.root.children[0].children[0].props.text, '立即进入')
  assert.equal(flattenDocument(removed).some((item) => item.node.id === 'text_1'), false)
  assert.notDeepEqual(removed, original)
})
```

- [ ] **Step 2: Run model tests and verify RED**

Run:

```bash
node --test admin/src/views/miniapp/ui-compiler/uiDocumentModel.test.mjs
```

Expected: FAIL because `uiDocumentModel.mjs` does not exist.

- [ ] **Step 3: Implement immutable tree operations**

Use `structuredClone` once at each public operation boundary. Reject these operations with explicit errors:

- inserting into a missing parent;
- inserting into a non-container node;
- duplicate node ID;
- moving or removing root;
- moving into self or a descendant;
- updating a missing node.

`createNodeFromManifest` fills every prop from `field.default` and creates empty `style`, `layout`, `bindings`, `actions`, and `children`. Do not add editor-only keys.

Use this operation pattern so every edit clones once and all helpers mutate only the clone:

```js
const clone = (value) => structuredClone(value)

function locate(node, id, parent = null, depth = 0) {
  if (node.id === id) return { node, parent, depth }
  for (const child of node.children || []) {
    const found = locate(child, id, node, depth + 1)
    if (found) return found
  }
  return null
}

export function createNodeFromManifest(manifest, id) {
  return {
    id,
    type: manifest.type,
    componentVersion: manifest.version,
    enabled: true,
    props: Object.fromEntries(Object.entries(manifest.propsSchema).map(([key, field]) => [key, clone(field.default)])),
    style: {},
    layout: {},
    bindings: {},
    actions: {},
    children: [],
  }
}

export function insertNode(document, parentId, node, index) {
  const next = clone(document)
  if (locate(next.root, node.id)) throw new Error(`节点 ID 已存在: ${node.id}`)
  const target = locate(next.root, parentId)
  if (!target) throw new Error(`父节点不存在: ${parentId}`)
  if (target.node.type !== 'page' && target.node.type !== 'container') throw new Error('目标节点不允许包含子节点')
  const at = Number.isInteger(index) ? Math.max(0, Math.min(index, target.node.children.length)) : target.node.children.length
  target.node.children.splice(at, 0, clone(node))
  return next
}
```

Implement `moveNode` by locating and detaching the source from the clone, checking the target against the source subtree before insertion, then inserting at the clamped target index. `removeNode` detaches and discards the located non-root node. `updateNodeProps` merges only into the located node's `props`. `flattenDocument` performs pre-order traversal and includes the root.

- [ ] **Step 4: Add typed API functions**

Implement these exact paths in `uiCompilerApi.ts`:

```ts
export const uiCompilerPaths = {
  registry: '/admin/ui-pages/registry',
  draft: (pageKey: string, regionId: string) => `/admin/ui-pages/${pageKey}/${regionId}/draft`,
  validate: (pageKey: string, regionId: string) => `/admin/ui-pages/${pageKey}/${regionId}/validate`,
}

export function loadUiRegistry() {
  return request.get(uiCompilerPaths.registry)
}

export function loadUiDraft(pageKey: string, regionId: string) {
  return request.get(uiCompilerPaths.draft(pageKey, regionId))
}

export function validateUiDraft(pageKey: string, regionId: string, document: PageDocument) {
  return request.post(uiCompilerPaths.validate(pageKey, regionId), { document })
}

export function saveUiDraft(pageKey: string, regionId: string, document: PageDocument) {
  return request.put(uiCompilerPaths.draft(pageKey, regionId), { document })
}
```

There is intentionally no publish/build/code-package function.

- [ ] **Step 5: Run focused tests and admin typecheck**

Add this exact script to admin:

```json
{
  "test:ui-compiler": "node --test src/views/miniapp/ui-compiler/*.test.mjs"
}
```

Then run:

```bash
npm --workspace admin run test:ui-compiler
npm --workspace admin run typecheck
```

Expected: model tests PASS and Vue TypeScript check exits 0.

- [ ] **Step 6: Commit the admin model and API**

```bash
git add admin/package.json admin/src/views/miniapp/ui-compiler
git commit -m "feat: add UI document editor model"
```

---

### Task 7: Add the experimental nested editor loop

**Files:**
- Create: `admin/src/views/miniapp/ui-compiler/UiCompilerStudio.vue`
- Create: `admin/src/views/miniapp/ui-compiler/UiCanvasNode.vue`
- Create: `admin/src/views/miniapp/ui-compiler/UiPropertyPanel.vue`
- Create: `admin/src/views/miniapp/ui-compiler/uiCompilerStudio.contract.test.mjs`
- Modify: `admin/src/views/miniapp/designer/DesignerStudio.vue`

**Interfaces:**
- Consumes: Task 5 API and Task 6 model functions.
- Produces: lazy tab query `?mode=designer&page=compiler` labeled `新内核`.
- Produces: nested add/move/select/edit/validate/save/reload loop for `container`, `text`, `image`, and `button`.
- Does not produce any publish, dynamic runtime, or code-package behavior.

- [ ] **Step 1: Write the failing studio contract test**

Create `uiCompilerStudio.contract.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const studio = fs.readFileSync(new URL('./UiCompilerStudio.vue', import.meta.url), 'utf8')
const designer = fs.readFileSync(new URL('../designer/DesignerStudio.vue', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('./uiCompilerApi.ts', import.meta.url), 'utf8')

test('loads the v2 studio lazily from the existing designer', () => {
  assert.match(designer, /defineAsyncComponent\(\(\) => import\('@\/views\/miniapp\/ui-compiler\/UiCompilerStudio.vue'\)\)/)
  assert.match(designer, /value: 'compiler'/)
  assert.match(studio, /saveUiDraft/)
  assert.match(studio, /validateUiDraft/)
})

test('phase one has no publish or code-package API', () => {
  assert.doesNotMatch(api, /publish/i)
  assert.doesNotMatch(api, /miniapp\/code/i)
  assert.doesNotMatch(studio, /发布|生成代码包/)
})
```

- [ ] **Step 2: Run the studio contract and verify RED**

Run:

```bash
node --test admin/src/views/miniapp/ui-compiler/uiCompilerStudio.contract.test.mjs
```

Expected: FAIL because the Vue files and designer entry do not exist yet.

- [ ] **Step 3: Implement the recursive canvas**

`UiCanvasNode.vue` receives `node`, `selectedId`, and `manifestsByType`. It emits `select`, `drop-node`, and `remove`. Use native HTML drag data containing only the source node ID. Render phase-one nodes as follows:

- `container`: bordered Flex wrapper using `direction`, `gap`, `padding`, and `background`; recursively render children.
- `text`: text content using `fontSize`, `color`, `align`, and `bold`.
- `image`: actual image when `src` is non-empty, otherwise a clear image placeholder; always render `alt` as accessible text/attribute.
- `button`: non-submitting preview button using text, variant, background, color, and radius.
- unknown or migration-error node: warning card preserving the node ID and original type.

The canvas must not execute actions, fetch data, upload images, or navigate.

- [ ] **Step 4: Implement the schema-driven property panel**

`UiPropertyPanel.vue` receives `node` and `manifest`. Convert each `PropFieldSchema` to the existing `FieldInput` shape:

```ts
const inputMap = {
  text: 'text',
  textarea: 'textarea',
  number: 'number',
  switch: 'switch',
  color: 'color',
  image: 'image',
  select: 'select',
} as const
```

Because `FieldInput` mutates its `model`, never pass `node.props` directly. Maintain a local reactive copy keyed by `node.id`, reset it when selection changes, and deep-watch the local copy to emit a cloned full prop patch. The parent applies that patch through `updateNodeProps`, preserving immutable document updates.

Show node ID, component version, target badges, and migration error. Do not expose style, data binding, actions, raw JSON editing, or component-version editing in phase one.

- [ ] **Step 5: Implement studio orchestration**

`UiCompilerStudio.vue` must:

1. load regions from `/admin/regions` and default to `global` when none is selected;
2. load the serialized registry once;
3. expose a page selector with `ui-lab` (default, labeled `UI 实验页`) and `home` (labeled `首页迁移预览`), then load the v2 draft or in-memory v1 migration for the selected page and region;
4. add a selected manifest under the selected container, or root when no container is selected;
5. support native drag moves through `moveNode`;
6. show validation diagnostics grouped by node;
7. call validation before save and refuse to save when `valid === false`;
8. call `saveUiDraft` only after validation passes;
9. show the returned incremented revision and `v2-draft` source;
10. warn clearly when the loaded source is a migrated v1 preview and explain that saving creates an isolated v2 draft without changing the current page.

Use one explicit `保存 v2 草稿` button and one `校验` button. Do not autosave in phase one; explicit save keeps the first persistence loop auditable.

- [ ] **Step 6: Add the lazy experimental tab**

In `DesignerStudio.vue`, add:

```ts
const UiCompilerStudio = defineAsyncComponent(() => import('@/views/miniapp/ui-compiler/UiCompilerStudio.vue'))
```

Add `{ label: '新内核', value: 'compiler', icon: Tools }` to `pages`, track `compilerVisited`, and mount the component only after the tab is visited. Do not change the component or behavior for `home`, `containers`, `message`, `profile`, or `tmagic`.

- [ ] **Step 7: Run focused and production checks**

Run:

```bash
npm --workspace admin run test:ui-compiler
npm --workspace admin run typecheck
npm --workspace admin run build
```

Expected: all UI compiler Node tests PASS, Vue typecheck exits 0, and Vite production build exits 0. Existing bundle-size warnings are allowed; new type or build errors are not.

- [ ] **Step 8: Perform the local browser acceptance loop**

Start backend and admin in separate terminals, then verify:

1. open UI 编辑器 → 设计器 → 新内核;
2. choose a region and load `UI 实验页` (`ui-lab`);
3. add `container`, then nest `text`, `image`, and `button`;
4. edit text and button properties;
5. move the button before the text;
6. validate and see no errors;
7. save the v2 draft;
8. reload the browser and confirm the same tree and props return;
9. switch the new studio page selector to `首页迁移预览`, confirm existing v1 content is shown as an unsaved migration preview, and do not save it;
10. open the existing 首页、消息页、我的页和活动页 tabs and confirm they still load;
11. inspect network requests and confirm no `/publish` or `/admin/miniapp/code` request occurred.

Record the page key, region, returned revision, and request paths in the execution notes. Do not use production data or publish anything.

- [ ] **Step 9: Commit the experimental editor**

```bash
git add admin/src/views/miniapp/ui-compiler admin/src/views/miniapp/designer/DesignerStudio.vue
git commit -m "feat: add experimental PageDocument editor"
```

---

## Phase-One Final Verification

Run from the repository root in this order:

```bash
npm --workspace @lingmeng/ui-contract test
npm --workspace backend test -- --runInBand src/modules/ui-compiler/ui-compiler.service.spec.ts src/modules/ui-compiler/ui-compiler.controller.spec.ts
npm --workspace admin run test:ui-compiler
npm --workspace backend run build
npm --workspace admin run typecheck
npm --workspace admin run build
git diff --check HEAD~7..HEAD
git status --short
```

Required evidence:

- all shared, backend, and admin focused tests pass;
- backend and admin production builds exit 0;
- the browser loop proves nested create/edit/save/reload;
- no Mini Program file changed;
- no Prisma schema or migration changed;
- no v2 publish/build endpoint exists;
- no legacy editor behavior changed;
- commits contain only phase-one files plus workspace wiring.

## Stop Point

Stop after phase-one verification and review. Do not begin the dynamic activity runtime, home dynamic slot, native template compiler, WXML generation, build workspace, component expansion, or old-editor deletion without a separately approved phase-two plan.
