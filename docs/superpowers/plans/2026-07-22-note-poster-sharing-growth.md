# 笔记分享海报与拉新归因 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让已登录用户可把任意笔记生成可运营的图文海报，分享到站内和微信；新用户从该海报回流并完成首次注册时，安全、原子地结算既有“分享有礼”奖励。

**Architecture:** 新增独立的 `PostShareLink` 和 `PostShareVisit` 作为内容传播和匿名打开的事实来源。笔记分享服务只负责授权、短码、小程序码、模板配置和访问留痕；现有 `OperationService` 继续作为 `ShareInvite/ShareReward` 的唯一结算者，并新增短码认领入口在同一事务内锁定邀请和奖励。

**Tech Stack:** NestJS、Prisma、Redis、微信小程序码、Vue 3/Element Plus 管理后台、uni-app 编译后的微信小程序运行产物。

## Global Constraints

- 海报页不得调用后台管理员二维码接口，也不得因生成二维码触发登录跳转。
- 图文、纯文字、音频笔记都必须生成含封面占位、文字和小程序码的海报。
- 不新建奖励账本；奖励必须复用 `ShareSettings`、`ShareInvite`、`ShareReward`、钱包和优惠券的现有结算规则。
- 分享码不可猜、一次只可被一名新用户认领；站内分享只记传播事件，不发拉新奖励。
- 微信的好友、群和朋友圈选择必须调用原生能力；取消不可记为分享成功。
- 所有新增写操作必须验证当前用户身份、笔记可访问性、活动状态和反刷条件。
- 当前工作目录含用户未提交改动；只 stage/commit 本计划新增或本功能明确修改的文件。

---

### Task 1: 传播事实表与 Prisma 访问层

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202607220001_add_post_share_links/migration.sql`
- Test: `backend/src/modules/post-share/post-share.service.spec.ts`

**Interfaces:**
- Produces `PostShareLink { code, postId, sharerId, regionId, channel, templateVersion, status, openedAt, claimedAt, claimUserId }`
- Produces `PostShareVisit { linkId, visitorId, openedAt, ip, userAgent }`, unique on `[linkId, visitorId]`.
- Adds inverse Prisma relations on `User` and `Post`; uses `code` and `claimUserId` unique indexes to enforce idempotency in the database.

- [ ] **Step 1: Write the failing service test**

```ts
it('does not create a second active link for the same sharer, post and template version', async () => {
  prisma.postShareLink.findFirst.mockResolvedValue({ code: 'Ab3K9x', status: 'ACTIVE' });
  await expect(service.createLink('u1', 'p1', {})).resolves.toMatchObject({ code: 'Ab3K9x' });
  expect(prisma.postShareLink.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test and verify it fails because `PostShareService` does not exist**

Run: `cd backend && npm test -- post-share.service.spec.ts --runInBand`

- [ ] **Step 3: Add the models and a forward-only migration**

Create `PostShareLink` with non-null foreign keys to `Post` and sharer `User`, nullable region/claimer, and `ACTIVE | CLAIMED | INVALID` status. Create `PostShareVisit` with an opaque client visitor id and no personal profile data. Add database unique constraints for `code` and `claimUserId` and indexes for `postId + sharerId + templateVersion`, `regionId + createdAt`, and `linkId + openedAt`.

- [ ] **Step 4: Generate Prisma client and run the targeted test**

Run: `cd backend && npm run db:generate && npm test -- post-share.service.spec.ts --runInBand`

- [ ] **Step 5: Commit the schema slice**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202607220001_add_post_share_links/migration.sql backend/src/modules/post-share/post-share.service.spec.ts
git commit -m "feat: add post share attribution records"
```

### Task 2: 分享码、访问留痕与普通用户小程序码

**Files:**
- Create: `backend/src/modules/post-share/post-share.module.ts`
- Create: `backend/src/modules/post-share/post-share.controller.ts`
- Create: `backend/src/modules/post-share/post-share.service.ts`
- Modify: `backend/src/modules/operation/operation.module.ts`
- Test: `backend/src/modules/post-share/post-share.service.spec.ts`

**Interfaces:**
- `POST /api/post-shares` (JWT): body `{ postId, channel? }` returns `{ code, postId, path, qrcodeUrl, template, shareImageFields }`.
- `GET /api/post-shares/:code` (public): query/header visitor id; returns `{ postId, code, regionId }` and upserts `PostShareVisit`.
- `PostShareService.createLink(userId, postId, options)` uses `PostService.detail(postId, userId)` before issuing a code.

- [ ] **Step 1: Extend the failing test with authorization, code and visit expectations**

```ts
it('creates a short code only for a visible post and records the first anonymous visit', async () => {
  postService.detail.mockResolvedValue({ id: 'p1', region_id: 'r1' });
  prisma.postShareLink.create.mockResolvedValue({ id: 'l1', code: 'Ab3K9x', postId: 'p1', regionId: 'r1' });
  await expect(service.createLink('u1', 'p1', { channel: 'wx_friend' })).resolves.toMatchObject({ code: 'Ab3K9x' });
  await service.resolve('Ab3K9x', { visitorId: 'device-a' });
  expect(prisma.postShareVisit.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { linkId_visitorId: { linkId: 'l1', visitorId: 'device-a' } } }));
});
```

- [ ] **Step 2: Run it and verify the missing-controller/service failure**

Run: `cd backend && npm test -- post-share.service.spec.ts --runInBand`

- [ ] **Step 3: Implement one focused `PostShareService`**

Use `crypto.randomBytes(...).toString('base64url')` and retry only on the Prisma unique-code conflict. Reuse a still-active link for the same post, sharer and poster template version; create the code with a 30-day expiry. Generate the QR through injected `UploadService.generateQrcode({ scene: 's=' + code, page: 'pagesB/post/post', width: 430, checkPath: true })`, never through `/upload/unlimited-qrcode`. Cache only the QR URL on the link and return it.

- [ ] **Step 4: Register the module and controller**

Import `PostModule`, `UploadModule`, and `ContentExtModule` in `PostShareModule`; import `PostShareModule` in `OperationModule`. Protect creation with `JwtGuard`; keep resolving public so an unregistered QR visitor can reach the note.

- [ ] **Step 5: Run the focused tests and Nest compile**

Run: `cd backend && npm test -- post-share.service.spec.ts --runInBand && npx tsc --noEmit`

- [ ] **Step 6: Commit the delivery slice**

```bash
git add backend/src/modules/post-share backend/src/modules/operation/operation.module.ts
git commit -m "feat: create attributed post share links"
```

### Task 3: 首次注册认领与现有分享有礼的原子结算

**Files:**
- Modify: `backend/src/modules/operation/operation.controller.ts`
- Modify: `backend/src/modules/operation/operation.service.ts`
- Modify: `backend/src/modules/post-share/post-share.service.ts`
- Test: `backend/src/modules/operation/operation.service.spec.ts`

**Interfaces:**
- `POST /api/share/claim-post-share` (JWT), body `{ code }`, passes request IP, UA and `x-device-id`.
- `OperationService.claimPostShare(userId, code, requestMeta)` returns existing reward result shape plus `claimed: boolean`.
- `PostShareLink.claimUserId` is written in the same transaction as `ShareInvite` and both `ShareReward` records.

- [ ] **Step 1: Write failing transaction tests**

```ts
it('rejects a pre-existing account and does not create an invite', async () => {
  prisma.postShareLink.findUnique.mockResolvedValue(activeLinkWithPreexistingUser);
  await expect(service.claimPostShare('existing-user', 'Ab3K9x', meta)).rejects.toThrow('仅限首次注册用户');
  expect(prisma.shareInvite.create).not.toHaveBeenCalled();
});

it('claims once and creates the existing invite and reward records atomically', async () => {
  prisma.$transaction.mockImplementation((fn) => fn(transactionClient));
  await expect(service.claimPostShare('new-user', 'Ab3K9x', meta)).resolves.toMatchObject({ claimed: true });
  expect(transactionClient.postShareLink.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ claimUserId: 'new-user' }) }));
  expect(transactionClient.shareInvite.create).toHaveBeenCalled();
  expect(transactionClient.shareReward.createMany).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and confirm the tests fail on `claimPostShare`**

Run: `cd backend && npm test -- operation.service.spec.ts --runInBand`

- [ ] **Step 3: Extract the shared reward writer without changing reward rules**

Move the existing invite creation/reward/coupon writer from `beInvited` into a private transaction helper taking validated `inviterId`, `inviteeId`, `regionId`, and request metadata. Keep the existing generic endpoint compatible, but require the existing `userLimit`, time window, account status, whitelist/blacklist, phone/student verification, per-day/total, IP/device, budget and release-mode rules for both paths.

- [ ] **Step 4: Implement strict short-code claim validation**

Inside one transaction, load the active non-expired link and matching pre-registration visit for the caller device; reject self-invites, deleted/unpublished posts, a user created before that visit, any existing invite, or a link already claimed. Lock the link by conditional `updateMany({ where: { id, status: 'ACTIVE', claimUserId: null }, data: ... })` and continue only if count is one. Store rejected reason through an audit/event record without creating money records.

- [ ] **Step 5: Run tests**

Run: `cd backend && npm test -- operation.service.spec.ts post-share.service.spec.ts --runInBand`

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/operation/operation.controller.ts backend/src/modules/operation/operation.service.ts backend/src/modules/post-share/post-share.service.ts backend/src/modules/operation/operation.service.spec.ts
git commit -m "feat: reward first-time post share registrations"
```

### Task 4: 可运营的笔记海报模板

**Files:**
- Modify: `backend/src/modules/content-ext/content-ext.service.ts`
- Modify: `admin/src/views/content/ContentSettings.vue`
- Test: `backend/src/modules/content-ext/content-ext.service.spec.ts`

**Interfaces:**
- Public response from `PostShareService.createLink` includes the active normalized template.
- Admin `GET/PUT /admin/content-ext/poster-config` stores `version`, `backgroundUrl`, `frameUrl`, `logoUrl`, `textPlaceholderUrl`, `qrcodeFrameUrl`, `ctaText`, colors, and fixed safe-area coordinates.

- [ ] **Step 1: Write a failing config normalization test**

```ts
it('returns a complete publishable template when legacy config is empty', async () => {
  prisma.config.findUnique.mockResolvedValue(null);
  expect(await service.getPosterConfig()).toMatchObject({
    version: 1, ctaText: '扫码查看笔记', textPlaceholderUrl: '', safeAreas: expect.any(Object),
  });
});
```

- [ ] **Step 2: Run it and verify the legacy four-field response fails**

Run: `cd backend && npm test -- content-ext.service.spec.ts --runInBand`

- [ ] **Step 3: Normalize template config server-side**

Keep one global default plus optional `regionOverrides[regionId]`. Validate URLs, clamp every safe-area coordinate to the 750×1200 design canvas, increment `version` only when a valid config is saved, and return the normalized selected template to the client.

- [ ] **Step 4: Expand the admin form**

Add upload controls for background, transparent content frame, logo, text-only placeholder and QR frame; add CTA and fixed position/size fields plus a small preview. Do not add a drag editor or a second activity configuration page.

- [ ] **Step 5: Run tests and admin typecheck**

Run: `cd backend && npm test -- content-ext.service.spec.ts --runInBand && cd ../admin && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/content-ext/content-ext.service.ts backend/src/modules/content-ext/content-ext.service.spec.ts admin/src/views/content/ContentSettings.vue
git commit -m "feat: manage note poster templates"
```

### Task 5: 小程序回流、海报绘制与原生微信分享

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/api/lmapi.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesB/post/post.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesC/post/posterShare.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/components/xiaoyi-ShareNotes/xiaoyi-ShareNotes.js`

**Interfaces:**
- `api_lmapi.createPostShare(postId, channel)`, `resolvePostShare(code)`, and `claimPostShare(code)`.
- Detail page resolves `scene=s=<code>` or `shareCode=<code>`, stores the code before auth, loads the returned post id, and claims only after a freshly completed registration.
- Poster receives backend template and QR URL; native share path is `/pagesB/post/post?shareCode=<code>`.

- [ ] **Step 1: Add a failing executable request-contract check**

Create `/Users/nianbaidediannao/Desktop/前端文件/tools/post-share-contract-check.cjs` with assertions that the API wrapper calls `/api/post-shares`, the poster no longer calls `/upload/unlimited-qrcode`, and detail-page code resolves `s=` before loading a post.

- [ ] **Step 2: Run the check and verify it fails**

Run: `node /Users/nianbaidediannao/Desktop/前端文件/tools/post-share-contract-check.cjs`

- [ ] **Step 3: Replace the admin QR call**

Have poster creation call `createPostShare`, use returned `qrcodeUrl` and template fields in the existing painter, select the first image as cover, and use `textPlaceholderUrl` when no image exists. Keep title/summary/anonymous author data from the formatted post response.

- [ ] **Step 4: Make every external channel return to the same code**

Use the generated poster as `imageUrl`; return the short-code path from `onShareAppMessage`, query from `onShareTimeline`, and use `showShareImageMenu` only when available. Saving or opening an image menu must not create a reward or mark a completed share.

- [ ] **Step 5: Persist and consume pre-registration source**

On post detail load, resolve the code and save it as `pendingPostShareCode`. After the normal first-registration completion hook writes a new token/user, call `claimPostShare` once and clear storage only on an accepted or terminal rejection result; no route is allowed to trigger login just to make a QR.

- [ ] **Step 6: Run the contract check and syntax checks**

Run: `node /Users/nianbaidediannao/Desktop/前端文件/tools/post-share-contract-check.cjs && node --check /Users/nianbaidediannao/Desktop/前端文件/pagesB/post/post.js && node --check /Users/nianbaidediannao/Desktop/前端文件/pagesC/post/posterShare.js`

### Task 6: 站内联系人与群聊的一致笔记卡片

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/components/xiaoyi-ShareNotes/xiaoyi-ShareNotes.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesA/news/PrivateChat/components/ChatItem.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesA/news/GroupChat/GroupChat.js`
- Modify: `/Users/nianbaidediannao/Desktop/前端文件/pagesA/news/PrivateChat/PrivateChat.js`

**Interfaces:**
- New payload prefix is `note-share:v2:` followed by JSON with `postId,title,summary,coverUrl,authorName,authorAvatar,circleName,regionId,shareCode,createdAt`.
- All parsing accepts legacy `notes:` records for history; newly sent cards always use v2.

- [ ] **Step 1: Add parser assertions to the contract check**

```js
assert.deepEqual(parseNoteShare('note-share:v2:{"postId":"p1","title":"标题"}').postId, 'p1');
assert.equal(parseNoteShare('notes:标题|摘要|p1|作者||封面|0').postId, 'p1');
```

- [ ] **Step 2: Run the check and confirm v2 fails before implementation**

Run: `node /Users/nianbaidediannao/Desktop/前端文件/tools/post-share-contract-check.cjs`

- [ ] **Step 3: Implement one defensive parser and one v2 serializer**

Keep the helper adjacent to the existing share component and copy the small parser into the two compiled chat runtimes. Reject malformed JSON to a non-clickable text card; never interpolate user content into a route. Send through the established WebSocket private/group APIs, preserving group membership, mute, block and client idempotency behavior.

- [ ] **Step 4: Make both renderers use the same display contract**

Render cover, title, summary and source; click opens only `/pagesB/post/post?id=<encoded postId>`. Keep legacy card display working until old history expires.

- [ ] **Step 5: Run the contract and syntax checks**

Run: `node /Users/nianbaidediannao/Desktop/前端文件/tools/post-share-contract-check.cjs && node --check /Users/nianbaidediannao/Desktop/前端文件/components/xiaoyi-ShareNotes/xiaoyi-ShareNotes.js && node --check /Users/nianbaidediannao/Desktop/前端文件/pagesA/news/GroupChat/GroupChat.js`

### Task 7: End-to-end verification and operational handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-07-22-note-poster-growth-design.md` only if verification exposes a changed contract.
- Test: focused backend specs and mini-program contract check.

- [ ] **Step 1: Run focused backend suite**

Run: `cd backend && npm test -- post-share.service.spec.ts operation.service.spec.ts content-ext.service.spec.ts upload.service.spec.ts --runInBand`

- [ ] **Step 2: Build backend and admin**

Run: `cd backend && npm run build && cd ../admin && npm run typecheck && npm run build`

- [ ] **Step 3: Run mini-program static checks**

Run: `node /Users/nianbaidediannao/Desktop/前端文件/tools/post-share-contract-check.cjs`

- [ ] **Step 4: DevTools acceptance matrix**

Verify on WeChat Developer Tools: image post; text-only post; private contact; group; Friend/Group native share; Moments; save image; unauthenticated scan then registration; existing user scan; activity closed; repeated code claim; deleted post. Record each result separately as static/build/runtime evidence.

- [ ] **Step 5: Commit only feature-owned files**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202607220001_add_post_share_links/migration.sql backend/src/modules/post-share backend/src/modules/operation/operation.controller.ts backend/src/modules/operation/operation.module.ts backend/src/modules/operation/operation.service.ts backend/src/modules/content-ext/content-ext.service.ts backend/src/modules/content-ext/content-ext.service.spec.ts admin/src/views/content/ContentSettings.vue docs/superpowers/specs/2026-07-22-note-poster-growth-design.md
git commit -m "feat: close note poster sharing growth loop"
```
