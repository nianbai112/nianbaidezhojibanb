# 校园现场采集后台与骑手端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改小程序的前提下，交付后台可派发给真实官方骑手、骑手 App 可完成道路/建筑/入口/设施/异常采集、后台可审核且原始数据不直接发布的第一版闭环。

**Architecture:** 复用现有 `CampusMapCollectionTask/Session/Point/Marker`、GCJ-02 和 50 点幂等批次，增加骑手端任务发现、通用几何对象和审核动作。后台继续使用现有校园地图采集抽屉，改为真实用户远程选择并叠加审核对象；骑手 App 使用独立于配送定位的校园采集状态机与缓存队列。

**Tech Stack:** NestJS、Prisma、Jest、Vue 3、Element Plus、UniApp、Android UTS、Node `node:test`。

## Global Constraints

- 本次不得修改 `/Users/nianbaidediannao/Desktop/前端文件` 或任何小程序源码。
- 第一版只使用手机自身定位、方向、速度、海拔、摄像头、麦克风和本地存储。
- 第一版仅采集室外道路、室外设施、建筑和建筑入口，不做楼内楼层、走廊、房间或室内导航。
- 坐标统一为 GCJ-02；CAD 平面坐标不得直接当经纬度。
- 原始点、原始对象和原始媒体只追加，不提供原地修改或删除接口。
- 骑手配送定位与校园采集使用不同会话、缓存键、上传接口和服务状态。
- 所有采集数据先审核，再进入地图草稿；本计划不允许采集接口直接发布线上地图。
- 后台/后端仓库与骑手端分别验证和交付，保留所有无关未提交改动。

---

### Task 1: 扩展统一任务、会话和几何对象数据契约

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202608100001_campus_collection_rider_professional/migration.sql`
- Create: `backend/prisma/additive-migrations/mysql/202608100001_campus_collection_rider_professional.sql`
- Create: `backend/prisma/additive-migrations/postgresql/202608100001_campus_collection_rider_professional.sql`
- Modify: `backend/src/modules/campus-map/campus-map-collection.contract.ts`
- Test: `backend/src/modules/campus-map/campus-map-collection.service.spec.ts`

**Interfaces:**
- Produces: `CreateCollectionTaskDto.allowedClients/objectTypes/boundary/priority/dueAt`。
- Produces: `StartCollectionSessionDto.sourceClient`，仅接受 `rider_app` 或兼容旧数据的 `miniapp`。
- Produces: `CreateCollectionObjectDto`，包含 `clientObjectId/objectType/geometry/properties/recordedAt/accuracy/bindings/attachments`。

- [ ] **Step 1: 写任务和对象校验失败测试**

```ts
it('accepts rider-only outdoor tasks and rejects unsupported clients', () => {
  expect(parseTask({ name: '一期采集', status: 'ready', collectorUserIds: ['u1'], allowedClients: ['rider_app'], objectTypes: ['road', 'building', 'entrance', 'facility', 'issue'] })).toMatchObject({ allowedClients: ['rider_app'] });
  expect(() => parseTask({ name: '错误任务', allowedClients: ['desktop'] as any })).toThrow('采集端无效');
});

it('validates a GCJ-02 line object without mutating geometry', () => {
  const input = { clientObjectId: 'o1', objectType: 'road', geometry: { type: 'LineString', coordinates: [[106.5, 29.6], [106.5001, 29.6001]] }, properties: { surface: 'asphalt' }, recordedAt: '2026-08-10T01:00:00.000Z', accuracy: 6 };
  expect(parseCollectionObject(input as any).geometry).toEqual(input.geometry);
});
```

- [ ] **Step 2: 运行测试并确认因新契约缺失而失败**

Run: `npm --workspace backend test -- campus-map-collection.service.spec.ts --runInBand`
Expected: FAIL，提示 `parseCollectionObject` 未定义或新字段未返回。

- [ ] **Step 3: 最小实现契约与 Prisma 模型**

```prisma
model CampusMapCollectionObject {
  id             String                     @id @default(cuid())
  sessionId      String
  session        CampusMapCollectionSession @relation(fields: [sessionId], references: [id], onDelete: Restrict)
  clientObjectId String
  objectType     String
  geometry       Json
  properties     Json
  longitude      Float?
  latitude       Float?
  accuracy       Float?
  recordedAt     DateTime
  reviewStatus   String                     @default("pending")
  reviewNote     String?                    @db.Text
  reviewedBy     String?
  reviewedAt     DateTime?
  quality        Json?
  createdAt      DateTime                   @default(now())
  updatedAt      DateTime                   @updatedAt

  @@unique([sessionId, clientObjectId])
  @@index([sessionId, objectType, recordedAt])
  @@index([reviewStatus, updatedAt])
  @@map("campus_map_collection_objects")
}
```

在 `CampusMapCollectionTask` 增加 JSON 任务范围字段，在 `CampusMapCollectionSession` 增加 `sourceClient` 和 `objectCount`，并补充三套等价 SQL。

- [ ] **Step 4: 生成 Prisma Client 并运行聚焦测试**

Run: `npm --workspace backend run db:generate && npm --workspace backend test -- campus-map-collection.service.spec.ts --runInBand`
Expected: PASS。

- [ ] **Step 5: 提交共享数据契约**

```bash
git add backend/prisma backend/src/modules/campus-map/campus-map-collection.contract.ts backend/src/modules/campus-map/campus-map-collection.service.spec.ts
git commit -m "feat(campus-map): add professional collection objects"
```

### Task 2: 骑手任务发现、官方骑手鉴权与幂等会话

**Files:**
- Modify: `backend/src/modules/campus-map/campus-map-collection.service.ts`
- Modify: `backend/src/modules/campus-map/campus-map-collection.controller.ts`
- Modify: `backend/src/modules/campus-map/campus-map-collection.controller.spec.ts`
- Modify: `backend/src/modules/campus-map/campus-map-collection.service.spec.ts`

**Interfaces:**
- Produces: `GET /rider-app/campus-collection/tasks`。
- Produces: `GET /rider-app/campus-collection/tasks/:taskId`。
- Produces: `POST /rider-app/campus-collection/tasks/:taskId/sessions`。
- Consumes: `sourceClient: 'rider_app'` 和任务的 `allowedClients`。

- [ ] **Step 1: 写官方骑手和任务分配权限失败测试**

```ts
it('returns only assigned rider-app tasks in the rider region', async () => {
  prisma.regionRider.findUnique.mockResolvedValue({ userId: 'u1', regionId: 'r1', riderType: 'official', verifyStatus: 'approved' });
  prisma.campusMapCollectionTask.findMany.mockResolvedValue([{ id: 't1', regionId: 'r1', allowedClients: ['rider_app'], assignments: [{ userId: 'u1' }] }]);
  await expect(service.listRiderTasks('u1')).resolves.toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试并确认新服务方法缺失**

Run: `npm --workspace backend test -- campus-map-collection.service.spec.ts campus-map-collection.controller.spec.ts --runInBand`
Expected: FAIL，提示 `listRiderTasks` 未定义。

- [ ] **Step 3: 实现统一官方骑手校验和安全任务响应**

```ts
private async requireAssignedOfficialRider(userId: string, taskId?: string) {
  const rider = await this.prisma.regionRider.findUnique({ where: { userId } });
  if (!rider || rider.verifyStatus !== 'approved' || rider.riderType !== 'official') throw new ForbiddenException('仅已认证官方骑手可采集');
  return rider;
}
```

列表只返回 `ready/collecting`、同区域、已分配且允许 `rider_app` 的任务；详情不得暴露管理员 ID 或其他采集人员隐私。

- [ ] **Step 4: 运行后端聚焦测试**

Run: `npm --workspace backend test -- campus-map-collection.service.spec.ts campus-map-collection.controller.spec.ts --runInBand`
Expected: PASS。

- [ ] **Step 5: 提交骑手任务接口**

```bash
git add backend/src/modules/campus-map/campus-map-collection.*
git commit -m "feat(campus-map): expose assigned rider collection tasks"
```

### Task 3: 几何对象上传、审核与审计状态

**Files:**
- Modify: `backend/src/modules/campus-map/campus-map-collection.service.ts`
- Modify: `backend/src/modules/campus-map/campus-map-collection.controller.ts`
- Modify: `backend/src/modules/campus-map/campus-map-collection.service.spec.ts`
- Modify: `backend/src/modules/campus-map/campus-map-collection.controller.spec.ts`

**Interfaces:**
- Produces: `POST /rider-app/campus-collection/sessions/:sessionId/objects`。
- Produces: `PATCH /admin/campus-map/collections/:regionId/objects/:objectId/review`。
- Review body: `{ decision: 'approved'|'resample'|'held'|'void', note: string }`。

- [ ] **Step 1: 写对象幂等与原始数据只读测试**

```ts
it('returns the existing object when the same client object id is retried', async () => {
  prisma.campusMapCollectionObject.findUnique.mockResolvedValue({ id: 'o1', clientObjectId: 'client-o1' });
  await expect(service.createCollectionObject('s1', 'u1', objectDto)).resolves.toMatchObject({ id: 'o1' });
  expect(prisma.campusMapCollectionObject.create).not.toHaveBeenCalled();
});

it('records an admin review without changing raw geometry', async () => {
  await service.reviewCollectionObject('r1', 'o1', { decision: 'approved', note: '与卫星图一致' }, 'a1');
  expect(prisma.campusMapCollectionObject.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ geometry: expect.anything() }) }));
});
```

- [ ] **Step 2: 运行测试并确认新行为缺失**

Run: `npm --workspace backend test -- campus-map-collection.service.spec.ts campus-map-collection.controller.spec.ts --runInBand`
Expected: FAIL。

- [ ] **Step 3: 实现对象写入与审核状态映射**

```ts
async reviewCollectionObject(regionId: string, objectId: string, dto: ReviewCollectionObjectDto, adminId: string) {
  const input = parseObjectReview(dto);
  const object = await this.prisma.campusMapCollectionObject.findFirst({ where: { id: objectId, session: { task: { regionId } } } });
  if (!object) throw new NotFoundException('采集对象不存在');
  return this.prisma.campusMapCollectionObject.update({
    where: { id: objectId },
    data: { reviewStatus: input.decision, reviewNote: input.note, reviewedBy: adminId, reviewedAt: new Date() },
  });
}
```

`approved/resample/held/void` 分别保存审核状态、备注、管理员和时间；对象创建仅在会话属于当前骑手且状态可写时允许。完成会话时同时核对 `clientObjectCount`。

- [ ] **Step 4: 运行聚焦测试与差异检查**

Run: `npm --workspace backend test -- campus-map-collection.service.spec.ts campus-map-collection.controller.spec.ts --runInBand && git diff --check`
Expected: PASS，且无空白错误。

- [ ] **Step 5: 提交对象上传和审核**

```bash
git add backend/src/modules/campus-map/campus-map-collection.*
git commit -m "feat(campus-map): review immutable collected objects"
```

### Task 4: 后台真实用户选择和专业任务配置

**Files:**
- Modify: `admin/src/api/admin.ts`
- Modify: `admin/src/views/region/components/campus-map/CampusMapCollectionDrawer.vue`
- Modify: `admin/src/views/region/components/campus-map/campusMapCollectionModel.mjs`
- Create: `admin/src/views/region/components/campus-map/campusMapCollectionModel.test.mjs`

**Interfaces:**
- Consumes: `/admin/users?keyword=&regionId=&userType=rider&status=active`。
- Produces: task payload with `collectorUserIds`, `allowedClients: ['rider_app']`, outdoor `objectTypes`, `priority`, `dueAt`。

- [ ] **Step 1: 写用户选项和任务载荷单元测试**

```js
test('maps admin user rows to identifiable rider options', () => {
  assert.deepEqual(toCollectorOption({ id: 'u1', nickname: '小王', phone: '13800138000', uid: 8 }), { value: 'u1', label: '小王', phone: '138****8000', uid: 8 });
});
```

- [ ] **Step 2: 运行测试并确认辅助函数缺失**

Run: `node --test admin/src/views/region/components/campus-map/campusMapCollectionModel.test.mjs`
Expected: FAIL。

- [ ] **Step 3: 实现 Element Plus 远程多选**

```vue
<el-select v-model="taskForm.collectorUserIds" multiple filterable remote :remote-method="searchCollectors" :loading="collectorLoading">
  <el-option v-for="item in collectorOptions" :key="item.value" :value="item.value" :label="`${item.label} · UID ${item.uid}`">
    <span>{{ item.label }}</span><small>{{ item.phone }} · UID {{ item.uid }}</small>
  </el-option>
</el-select>
```

使用 `el-select multiple filterable remote`，选项显示头像、昵称、掩码手机号和 UID；保存只提交选中的真实用户主键。移除二维码主操作，将“生成采集入口”改为“查看骑手任务状态”。

- [ ] **Step 4: 运行模型测试和后台类型检查**

Run: `node --test admin/src/views/region/components/campus-map/campusMapCollectionModel.test.mjs && npm --workspace admin run typecheck`
Expected: PASS。

- [ ] **Step 5: 提交后台任务配置**

```bash
git add admin/src/api/admin.ts admin/src/views/region/components/campus-map
git commit -m "feat(admin): assign campus collection tasks to riders"
```

### Task 5: 后台几何审核工作台

**Files:**
- Modify: `admin/src/api/admin.ts`
- Modify: `admin/src/views/region/components/campus-map/CampusMapCollectionDrawer.vue`
- Modify: `admin/src/views/region/components/campus-map/campusMapCollectionModel.mjs`
- Modify: `admin/src/views/region/components/campus-map/campusMapCollectionModel.test.mjs`

**Interfaces:**
- Consumes: session `points/markers/objects/attachments`。
- Consumes: object review endpoint from Task 3。

- [ ] **Step 1: 写 GeoJSON 转换和质量分级失败测试**

```js
test('keeps raw road and building geometry separate by type', () => {
  const features = toCollectionFeatures([{ id: 'r', objectType: 'road', geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] } }]);
  assert.equal(features.features[0].properties.objectType, 'road');
});
```

- [ ] **Step 2: 运行测试并确认转换函数缺失**

Run: `node --test admin/src/views/region/components/campus-map/campusMapCollectionModel.test.mjs`
Expected: FAIL。

- [ ] **Step 3: 增加审核标签页和操作**

```vue
<el-button type="success" @click="reviewObject(selectedObject.id, 'approved')">通过</el-button>
<el-button type="warning" @click="reviewObject(selectedObject.id, 'resample')">退回补采</el-button>
<el-button @click="reviewObject(selectedObject.id, 'held')">暂存</el-button>
<el-button type="danger" @click="reviewObject(selectedObject.id, 'void')">作废</el-button>
```

展示道路、建筑、入口、设施、异常的不同样式、原始精度、属性、照片/语音、采集人和时间；支持通过、退回补采、暂存、作废并要求理由。第一版只审核，不自动写入已发布地图。

- [ ] **Step 4: 运行模型测试、类型检查和后台构建**

Run: `node --test admin/src/views/region/components/campus-map/campusMapCollectionModel.test.mjs && npm --workspace admin run typecheck && npm --workspace admin run build`
Expected: PASS。

- [ ] **Step 5: 提交审核工作台**

```bash
git add admin/src/api/admin.ts admin/src/views/region/components/campus-map
git commit -m "feat(admin): review professional campus collection data"
```

### Task 6: 骑手端独立校园采集队列与 API

**Files:**
- Create: `/Users/nianbaidediannao/Desktop/骑手端app/api/campus-collection.js`
- Create: `/Users/nianbaidediannao/Desktop/骑手端app/api/campus-collection-tracker.js`
- Create: `/Users/nianbaidediannao/Desktop/骑手端app/tests/campus-collection-tracker.test.mjs`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/api/upload.js`

**Interfaces:**
- Produces: `CAMPUS_COLLECTION_STORAGE_KEY = 'rider_campus_collection_v1'`。
- Produces: `createCampusCollectionState`, `appendCampusPoint`, `buildPendingBatches`, `acknowledgeCampusBatch`, `appendCampusObject`, `restoreCampusSession`。
- Consumes: Task 2 and Task 3 rider endpoints。

- [ ] **Step 1: 写独立队列、50 点批次和 ACK 测试**

```js
test('campus points never reuse the delivery location queue', () => {
  const state = appendCampusPoint(createCampusCollectionState({ taskId: 't1' }), point('p1'));
  assert.equal(state.storageKey, 'rider_campus_collection_v1');
  assert.deepEqual(buildPendingBatches(state, 50)[0].points.map((item) => item.clientPointId), ['p1']);
});
```

- [ ] **Step 2: 运行骑手端测试并确认模块缺失**

Run: `npm --prefix '/Users/nianbaidediannao/Desktop/骑手端app' test`
Expected: FAIL，提示新模块不存在。

- [ ] **Step 3: 实现纯状态机和 API 包装**

```js
export const CAMPUS_COLLECTION_STORAGE_KEY = 'rider_campus_collection_v1'

export function acknowledgeCampusBatch(state, acknowledgedPointIds = []) {
  const ids = new Set(acknowledgedPointIds.map(String))
  return { ...state, points: state.points.filter((point) => !ids.has(String(point.clientPointId))) }
}
```

不修改现有 `rider_location_queue_v1`；校园点保留 GCJ-02、accuracy/speed/heading/altitude/recordedAt，只有服务端 ACK 后才从本地队列移除。

- [ ] **Step 4: 运行全部骑手端 Node 测试**

Run: `npm --prefix '/Users/nianbaidediannao/Desktop/骑手端app' test`
Expected: PASS。

- [ ] **Step 5: 保存可恢复快照**

将骑手端修改文件清单和 SHA-256 写入同级时间戳快照目录；不复制 `unpackage` 构建缓存。

### Task 7: 骑手工作台入口、任务列表和五种采集模式

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/pages.json`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/pages/workbench/workbench.vue`
- Create: `/Users/nianbaidediannao/Desktop/骑手端app/pages/campus-collection/tasks.vue`
- Create: `/Users/nianbaidediannao/Desktop/骑手端app/pages/campus-collection/collect.vue`
- Create: `/Users/nianbaidediannao/Desktop/骑手端app/pages/campus-collection/object-form.vue`
- Create: `/Users/nianbaidediannao/Desktop/骑手端app/tests/campus-collection-pages.test.mjs`

**Interfaces:**
- Consumes: Task 6 API/state functions。
- Produces: road/building/entrance/facility/issue modes。

- [ ] **Step 1: 写路由、入口和五模式静态回归测试**

```js
test('registers the three collector pages and all outdoor modes', () => {
  const pages = JSON.parse(readFileSync(new URL('../pages.json', import.meta.url))).pages.map((item) => item.path);
  assert.ok(pages.includes('pages/campus-collection/tasks'));
  for (const mode of ['road', 'building', 'entrance', 'facility', 'issue']) assert.ok(source.includes(`value: '${mode}'`));
});
```

- [ ] **Step 2: 运行测试并确认页面未注册**

Run: `npm --prefix '/Users/nianbaidediannao/Desktop/骑手端app' test`
Expected: FAIL。

- [ ] **Step 3: 实现第一版专业采集页面**

```js
const collectionModes = [
  { value: 'road', label: '道路' },
  { value: 'building', label: '建筑' },
  { value: 'entrance', label: '入口' },
  { value: 'facility', label: '设施' },
  { value: 'issue', label: '异常' },
]
```

```vue
<map class="collection-map" :latitude="center.latitude" :longitude="center.longitude" :polyline="polylines" :markers="markers" :polygons="polygons" show-location />
```

工作台卡片展示待办、当前任务、距离、对象数和待补传数；任务页只显示已分配任务；采集页使用原生 `map`、`polyline`、`markers` 和 `polygons`，固定显示精度/距离/时长/点数/待上传量；对象表单根据模式采集几何、属性、照片、语音、备注和建筑入口绑定。

- [ ] **Step 4: 运行骑手端测试**

Run: `npm --prefix '/Users/nianbaidediannao/Desktop/骑手端app' test`
Expected: PASS。

### Task 8: 校园会话后台定位、暂停恢复与设备检查

**Files:**
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/App.vue`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/api/campus-collection-tracker.js`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/uni_modules/rider-background-location/utssdk/app-android/index.uts`
- Modify: `/Users/nianbaidediannao/Desktop/骑手端app/tests/campus-collection-tracker.test.mjs`

**Interfaces:**
- Produces: explicit campus session state `idle/recording/paused/uploading/completed`。
- Produces: foreground service notification text that distinguishes delivery from campus collection。

- [ ] **Step 1: 写暂停、恢复和错误保护测试**

```js
test('paused samples are retained as quality events but not road vertices', () => {
  const paused = pauseCampusCollection(createCampusCollectionState({ taskId: 't1' }));
  const next = appendCampusPoint(paused, point('p1'));
  assert.equal(next.points.length, 0);
  assert.equal(next.qualityEvents.at(-1).type, 'sample_while_paused');
});
```

- [ ] **Step 2: 运行测试并确认状态行为缺失**

Run: `npm --prefix '/Users/nianbaidediannao/Desktop/骑手端app' test`
Expected: FAIL。

- [ ] **Step 3: 接入显式校园采集服务状态**

```js
export function pauseCampusCollection(state) {
  return { ...state, status: 'paused', pausedAt: new Date().toISOString() }
}

export function shouldRecordCampusPoint(state) {
  return state?.status === 'recording' && state?.taskId && state?.sessionId
}
```

仅在用户点击开始后启动；暂停不写有效道路点；完成、取消或任务失效立即停止；登录失效保留本地数据；前台服务通知写明“校园地图采集中”，不复用配送会话的 ACK 或删除逻辑。

- [ ] **Step 4: 运行骑手端全部测试并检查 UTS 编译输入**

Run: `npm --prefix '/Users/nianbaidediannao/Desktop/骑手端app' test`
Expected: PASS；HBuilderX 构建留作设备层验收，不把 Node 测试等同于 Android 成功。

### Task 9: 跨仓验证与真机验收清单

**Files:**
- Create: `docs/campus-map/2026-08-10-rider-collection-device-acceptance.md`
- Modify: `docs/superpowers/plans/2026-08-10-campus-field-collection-backend-admin-rider.md`

**Interfaces:**
- Consumes: Tasks 1-8 全部交付。

- [ ] **Step 1: 运行后端聚焦与全量相关检查**

Run: `npm --workspace backend test -- campus-map-collection.service.spec.ts campus-map-collection.controller.spec.ts --runInBand && npm --workspace backend run build`
Expected: PASS。

- [ ] **Step 2: 运行后台检查**

Run: `node --test admin/src/views/region/components/campus-map/campusMapCollectionModel.test.mjs && npm --workspace admin run typecheck && npm --workspace admin run build`
Expected: PASS。

- [ ] **Step 3: 运行骑手端检查**

Run: `npm --prefix '/Users/nianbaidediannao/Desktop/骑手端app' test`
Expected: PASS。

- [ ] **Step 4: 执行安全与范围检查**

Run: `git diff --check && git status --short && git diff --name-only | rg '^前端文件/' && exit 1 || true`
Expected: 后台仓库无空白错误，且没有小程序路径变更。

- [ ] **Step 5: 写真机验收清单**

清单必须逐项记录小米真机权限、精度、锁屏、切后台、断网、补传、闪退恢复、道路、建筑、多个入口、设施、异常、照片、语音、后台审核结果；未执行项明确标记为“待真机验证”。
