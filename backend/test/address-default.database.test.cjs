// Run only through scripts/test-address-isolated.cjs. Real isolated PG; synthetic addresses only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = new URL(process.env.UNIAPPX_TEST_DATABASE_URL || 'http://invalid');
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.UNIAPPX_ISOLATED_PORT);
assert.match(url.pathname, /^\/address_test_uniappx_[a-f0-9]{12}$/);
assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(process.env.UNIAPPX_ISOLATED_ROOT || '/invalid'));
assert.ok(path.basename(process.cwd()).startsWith('uniappx-address-'));
assert.ok(fs.existsSync(path.join(process.cwd(), 'cluster/postmaster.pid')));
require('ts-node').register({ transpileOnly: true, project: path.resolve(__dirname, '../tsconfig.json') });
const { PrismaClient } = require('@prisma/client');
const { AddressService } = require('../src/modules/address/address.service.ts');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const service = new AddressService(db);
let checks = 0;
async function check(label, work) { await work(); checks += 1; console.log('PASS', label); }
const createUser = (key) => db.user.create({ data: { openid: `address-isolated-${key}`, nickname: '合成地址测试用户' } });
const payload = (regionId, extra = {}) => ({ contact: '合成测试联系人', phone: '13800000000', full_address: '合成测试校区', dormitory_number: '合成测试门牌', region_id: regionId, is_default: true, ...extra });
const defaults = (userId) => db.address.findMany({ where: { userId, isDefault: true } });
const snapshot = (userId) => db.address.findMany({ where: { userId }, orderBy: { id: 'asc' } });
// Force a real persistence failure after the preceding clear-default UPDATE has executed.
function failingService(method, change) {
  return new AddressService({
    $transaction: (work, options) => db.$transaction((tx) => {
      const address = new Proxy(tx.address, { get(target, key) {
        if (key === method) return (args) => target[method](change(args));
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      return work(new Proxy(tx, { get(target, key) { return key === 'address' ? address : Reflect.get(target, key); } }));
    }, options),
  });
}
// First two calls take PG snapshots before either mutates, guaranteeing a real serialization conflict.
// Retries enter the full service transaction without waiting on the first-pair barrier.
function concurrentService(userId) {
  let entered = 0, ready = 0, release, conflicts = 0;
  const barrier = new Promise((resolve) => { release = resolve; });
  const wrapped = new AddressService({
    $transaction: async (work, options) => {
      try {
        return await db.$transaction(async (tx) => {
          const initial = entered++ < 2;
          if (initial) {
            await tx.address.count({ where: { userId } });
            if (++ready === 2) release();
            await barrier;
          }
          return work(tx);
        }, options);
      } catch (error) {
        if (error.code === 'P2034') conflicts += 1;
        throw error;
      }
    },
  });
  return { service: wrapped, conflictCount: () => conflicts };
}

async function main() {
  const [identity] = await db.$queryRawUnsafe('SELECT current_database() AS name, host(inet_server_addr()) AS host, inet_server_port() AS port');
  assert.equal(identity.name, url.pathname.slice(1));
  assert.equal(identity.host, '127.0.0.1');
  assert.equal(String(identity.port), url.port);
  const a = await db.region.create({ data: { name: '合成地址测试校区A', code: 'address-isolated-a' } });
  const b = await db.region.create({ data: { name: '合成地址测试校区B', code: 'address-isolated-b' } });
  await check('global default spans owned campuses without affecting another user', async () => {
    const owner = await createUser('global'), other = await createUser('other');
    const old = await service.addAddress(owner.id, payload(a.id));
    const otherDefault = await service.addAddress(other.id, payload(a.id));
    const latest = await service.addAddress(owner.id, payload(b.id));
    assert.deepEqual((await defaults(owner.id)).map((row) => row.id), [latest.id]);
    assert.equal((await db.address.findUnique({ where: { id: old.id } })).isDefault, false);
    assert.deepEqual((await defaults(other.id)).map((row) => row.id), [otherDefault.id]);
    await service.updateAddress(old.id, owner.id, { is_default: true });
    assert.deepEqual((await defaults(owner.id)).map((row) => row.id), [old.id]);
    await assert.rejects(() => service.updateAddress(old.id, other.id, { is_default: true }), (error) => error.getStatus?.() === 404);
    assert.deepEqual((await defaults(other.id)).map((row) => row.id), [otherDefault.id]);
  });
  await check('ordinary create/update keeps current default and preserves unchanged address fields', async () => {
    const owner = await createUser('ordinary');
    const first = await service.addAddress(owner.id, payload(a.id));
    const ordinary = await service.addAddress(owner.id, payload(b.id, { is_default: false }));
    await service.updateAddress(ordinary.id, owner.id, { contact: '修改后的合成联系人' });
    assert.deepEqual((await defaults(owner.id)).map((row) => row.id), [first.id]);
    const saved = await db.address.findUnique({ where: { id: ordinary.id } });
    assert.equal(saved.regionId, b.id); assert.equal(saved.phone, '13800000000');
    assert.equal(saved.name, '修改后的合成联系人');
  });
  await check('explicitly removing default preserves legacy zero-default behavior', async () => {
    const owner = await createUser('unset');
    const first = await service.addAddress(owner.id, payload(a.id));
    await service.updateAddress(first.id, owner.id, { is_default: false });
    assert.equal((await defaults(owner.id)).length, 0);
    assert.equal(await db.address.count({ where: { userId: owner.id } }), 1);
  });
  await check('real insert constraint failure rolls back cleared previous default', async () => {
    const owner = await createUser('create-rollback');
    const old = await service.addAddress(owner.id, payload(a.id));
    const before = await snapshot(owner.id);
    const broken = failingService('create', (args) => ({ ...args, data: { ...args.data, id: old.id } }));
    await assert.rejects(() => broken.addAddress(owner.id, payload(b.id)), (error) => error.code === 'P2002');
    assert.deepEqual(await snapshot(owner.id), before);
  });
  await check('real update not-found failure rolls back both default clearing and target changes', async () => {
    const owner = await createUser('update-rollback');
    await service.addAddress(owner.id, payload(a.id));
    const target = await service.addAddress(owner.id, payload(b.id, { is_default: false }));
    const before = await snapshot(owner.id);
    const broken = failingService('update', (args) => ({ ...args, where: { id: 'absent-synthetic-address' } }));
    await assert.rejects(() => broken.updateAddress(target.id, owner.id, { is_default: true }), (error) => error.code === 'P2025');
    assert.deepEqual(await snapshot(owner.id), before);
  });
  await check('concurrent first default inserts retry a real PG conflict and leave exactly one default', async () => {
    const owner = await createUser('concurrent-empty');
    const pair = concurrentService(owner.id);
    const saved = await Promise.all([pair.service.addAddress(owner.id, payload(a.id)), pair.service.addAddress(owner.id, payload(b.id))]);
    assert.equal(saved.length, 2); assert.equal(await db.address.count({ where: { userId: owner.id } }), 2);
    assert.equal((await defaults(owner.id)).length, 1); assert.ok(pair.conflictCount() >= 1);
  });
  await check('concurrent new defaults with an existing default commit both rows but one default', async () => {
    const owner = await createUser('concurrent-existing');
    await service.addAddress(owner.id, payload(a.id));
    const pair = concurrentService(owner.id);
    await Promise.all([pair.service.addAddress(owner.id, payload(a.id)), pair.service.addAddress(owner.id, payload(b.id))]);
    assert.equal(await db.address.count({ where: { userId: owner.id } }), 3);
    assert.equal((await defaults(owner.id)).length, 1); assert.ok(pair.conflictCount() >= 1);
  });
  await check('concurrent cross-campus default changes remain globally unique', async () => {
    const owner = await createUser('concurrent-update');
    const first = await service.addAddress(owner.id, payload(a.id));
    const second = await service.addAddress(owner.id, payload(b.id, { is_default: false }));
    const pair = concurrentService(owner.id);
    await Promise.all([pair.service.updateAddress(first.id, owner.id, { is_default: true }), pair.service.updateAddress(second.id, owner.id, { is_default: true })]);
    assert.equal((await defaults(owner.id)).length, 1); assert.ok(pair.conflictCount() >= 1);
  });
  await check('overlapping create and default update retry safely without losing either operation', async () => {
    const owner = await createUser('concurrent-mixed');
    const old = await service.addAddress(owner.id, payload(a.id));
    const pair = concurrentService(owner.id);
    const [created, updated] = await Promise.all([
      pair.service.addAddress(owner.id, payload(b.id)),
      pair.service.updateAddress(old.id, owner.id, { is_default: true, contact: '并发保存的合成联系人' }),
    ]);
    assert.ok(created.id); assert.equal(updated.name, '并发保存的合成联系人');
    assert.equal((await db.address.findUnique({ where: { id: old.id } })).name, '并发保存的合成联系人');
    assert.equal(await db.address.count({ where: { userId: owner.id } }), 2);
    assert.equal((await defaults(owner.id)).length, 1); assert.ok(pair.conflictCount() >= 1);
  });
  console.log(`PASS: ${checks} real PostgreSQL address contracts; no HTTP, existing DB or real user data.`);
}
main().catch((error) => {
  console.error(String(error?.message || error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[isolated database URL]'));
  process.exitCode = 1;
}).finally(() => db.$disconnect());
