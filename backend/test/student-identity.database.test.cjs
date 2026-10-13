/* Uses an explicitly selected disposable loopback database; never falls back to DATABASE_URL. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const url = new URL(
  process.env.STUDENT_IDENTITY_TEST_DATABASE_URL || 'http://invalid',
);
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.pathname, /^\/student_identity_test_[a-z0-9_]+$/);
process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../tsconfig.json');
require('ts-node').register({ transpileOnly: true });
const { PrismaClient } = require('@prisma/client'),
  XLSX = require('xlsx'),
  sharp = require('sharp');
const {
  StudentIdentityService,
} = require('../src/modules/student-identity/student-identity.service.ts');
const {
  UserAccessPolicyService,
} = require('../src/common/services/user-access-policy.service.ts');
const { SchoolService } = require('../src/modules/school/school.service.ts');
const {
  effectiveStudentIdentity,
  identityInclude,
} = require('../src/modules/student-identity/student-identity.policy.ts');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const prefix = `student-test-${randomUUID().slice(0, 8)}`,
  counters = new Map();
let checks = 0;
const redis = {
  incrementWindow: async (key) => {
    const n = (counters.get(key) || 0) + 1;
    counters.set(key, n);
    return n;
  },
  delPattern: async () => 0,
};
let regionA, regionB, schoolA, schoolB;
const scope = {
  getAdminContext: async (operator) => ({
    isSuperAdmin: operator === 'super',
    regionIds:
      operator === 'school-a'
        ? [regionA.id]
        : operator === 'school-b'
          ? [regionB.id]
          : [],
  }),
};
const service = new StudentIdentityService(db, redis, scope),
  access = new UserAccessPolicyService(db, redis);
function ok(value, message) {
  assert.ok(value, message);
  checks++;
}
async function rejects(task, pattern) {
  await assert.rejects(task, pattern);
  checks++;
}
async function user(label) {
  return db.user.create({
    data: { openid: `${prefix}-${label}`, nickname: `测试-${label}` },
  });
}
function workbook(rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['校内学籍号', '性别', '姓名'],
      ...rows.map(([id, name]) => [id, '', name]),
    ]),
    'Sheet1',
  );
  return XLSX.write(book, { type: 'buffer', bookType: 'biff8' });
}
const data = (school, id, name, materialId) => ({
  school_id: school.id,
  student_id: id,
  name,
  materialId,
});
const student = (id) =>
  db.schoolStudent.findUniqueOrThrow({
    where: {
      schoolId_identityKey: {
        schoolId: schoolA.id,
        identityKey: createHash('sha256').update(id).digest('hex'),
      },
    },
  });
const decision = (record, status = 'approved', extra = {}) => ({
  status,
  applicationId: record.id,
  submissionVersion: record.submission_version,
  ...extra,
});
let picture;
async function material(account) {
  return (await service.uploadMaterial(account.id, picture)).data.materialId;
}
async function main() {
  regionA = await db.region.create({
    data: {
      name: `${prefix}-A`,
      code: `${prefix}-a`,
      onlyStudentAuthUsers: true,
    },
  });
  regionB = await db.region.create({
    data: {
      name: `${prefix}-B`,
      code: `${prefix}-b`,
      onlyStudentAuthUsers: true,
    },
  });
  schoolA = await db.school.create({
    data: { name: `${prefix}-A校`, regionId: regionA.id },
  });
  schoolB = await db.school.create({
    data: { name: `${prefix}-B校`, regionId: regionB.id },
  });
  picture = await sharp({
    create: { width: 10, height: 10, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  const rows = [
      ['00Ab-01', '测试同名'],
      ['00ab-01', '测试同名'],
      ['20260000000001', '测试学生甲'],
      ['20260000000002', '测试学生乙'],
      ...Array.from({ length: 996 }, (_, i) => [
        String(30000000000000 + i),
        `测试学生${i}`,
      ]),
    ],
    file = workbook(rows);
  await rejects(
    () => service.preview(schoolA.id, file, 'synthetic.xls', 'school-b'),
    /无权/,
  );
  await rejects(
    () => service.preview(schoolA.id, file, 'synthetic.xls', ''),
    /管理员/,
  );
  const preview = await service.preview(
    schoolA.id,
    file,
    'synthetic.xls',
    'school-a',
  );
  ok(
    preview.summary.total === 1000 &&
      preview.summary.added === 1000 &&
      preview.summary.sameNameGroups === 1,
    'preview validates all 1000 synthetic rows',
  );
  ok(
    (await db.schoolStudent.count({ where: { schoolId: schoolA.id } })) === 0,
    'preview does not import',
  );
  await service.commit(schoolA.id, preview.batchId, 'school-a');
  ok(
    (await db.school.findUniqueOrThrow({ where: { id: schoolA.id } }))
      .studentVerificationMode === 'ROSTER',
    'committing a roster enables automatic matching for that school',
  );
  ok(
    (await service.commit(schoolA.id, preview.batchId, 'school-a'))
      .alreadyImported,
    'commit retry is idempotent',
  );
  ok(
    (await service.preview(schoolA.id, file, 'same.xls', 'school-a'))
      .alreadyImported,
    'same file never duplicates students',
  );
  ok(
    (await db.schoolStudent.count({ where: { schoolId: schoolA.id } })) ===
      1000,
    '1000 distinct identities imported',
  );
  ok(
    (await student('00Ab-01')).id !== (await student('00ab-01')).id,
    'identifiers preserve case and leading zeroes',
  );
  const second = await service.preview(
    schoolB.id,
    workbook([['00Ab-01', '其他学校学生']]),
    'b.xls',
    'school-b',
  );
  await service.commit(schoolB.id, second.batchId, 'school-b');
  ok(
    (await db.schoolStudent.count({
      where: {
        schoolId: { in: [schoolA.id, schoolB.id] },
        studentId: '00Ab-01',
      },
    })) === 2,
    'different schools may use the same identifier',
  );
  const conflict = await service.preview(
    schoolA.id,
    workbook([['00Ab-01', '错误姓名']]),
    'conflict.xls',
    'school-a',
  );
  ok(!conflict.canCommit, 'conflicting name cannot overwrite an identity');
  await rejects(
    () => service.commit(schoolA.id, conflict.batchId, 'school-a'),
    /冲突/,
  );
  const partial = await service.preview(
    schoolA.id,
    workbook([['00Ab-01', '测试同名']]),
    'partial.xls',
    'school-a',
  );
  ok(partial.summary.missing === 999, 'missing rows are disclosed');
  await service.commit(schoolA.id, partial.batchId, 'school-a');
  ok(
    (await db.schoolStudent.count({
      where: { schoolId: schoolA.id, enrollmentStatus: 'ACTIVE' },
    })) === 1000,
    'partial import never graduates omitted students',
  );
  const stale = await service.preview(
    schoolA.id,
    workbook([['new', '新增']]),
    'new.xls',
    'school-a',
  );
  schoolA = await db.school.findUniqueOrThrow({ where: { id: schoolA.id } });
  await service.policy(
    schoolA.id,
    { mode: 'ROSTER', revision: schoolA.rosterRevision },
    'school-a',
  );
  await rejects(
    () => service.commit(schoolA.id, stale.batchId, 'school-a'),
    /重新预览/,
  );
  const a = await user('owner'),
    b = await user('race-one'),
    c = await user('mismatch'),
    d = await user('race-two');
  const approved = (
    await service.submit(a.id, data(schoolA, '00Ab-01', '测试同名'))
  ).data;
  ok(
    approved.verification_status === 'approved' &&
      approved.proof_method === 'ROSTER_MATCH',
    'name and identifier match automatically approve WITHOUT any activation token or manual confirmation',
  );
  ok(
    (await student('00Ab-01')).boundUserId === a.id,
    'automatic approval binds the roster identity',
  );
  ok(
    (await service.submit(a.id, data(schoolA, '00Ab-01', '测试同名'))).data
      .submission_version === approved.submission_version,
    'same request retry does not mutate approval',
  );
  ok(
    (await service.submit(c.id, data(schoolA, '00Ab-01', '测试同名'))).data
      .requires_material,
    'claimed identity sends a second account to manual review',
  );
  const mismatch = (
    await service.submit(c.id, data(schoolA, '00ab-01', '填错姓名'))
  ).data;
  ok(mismatch.requires_material, 'name mismatch asks for manual evidence');
  ok(
    (await db.studentVerify.count({ where: { userId: c.id } })) === 0,
    'material prompt does not masquerade as a submitted or approved application',
  );
  const cMaterial = await material(c);
  const first = (
    await service.submit(c.id, data(schoolA, '00ab-01', '填错姓名', cMaterial))
  ).data;
  ok(
    first.verification_status === 'pending' &&
      first.proof_method === 'ROSTER_EXCEPTION',
    'mismatched identity with owned evidence enters manual queue',
  );
  ok(
    !(await student('00ab-01')).boundUserId,
    'manual queue does not reserve another identity',
  );
  const replacement = await material(c);
  const newer = (
    await service.submit(
      c.id,
      data(schoolA, '00ab-01', '填错姓名', replacement),
    )
  ).data;
  await rejects(
    () => service.review(c.id, decision(first), 'school-a'),
    /申请已更新/,
  );
  await rejects(
    () => service.review(c.id, decision(newer), 'school-b'),
    /无权/,
  );
  await rejects(
    () => service.review(c.id, decision(newer), 'school-a'),
    /名册对应姓名/,
  );
  const corrected = (
    await service.review(
      c.id,
      decision(newer, 'approved', { correctedRealName: '测试同名' }),
      'school-a',
    )
  ).data;
  ok(
    corrected.verification_status === 'approved' &&
      corrected.proof_method === 'SCHOOL_REVIEW',
    'ordinary manual review can correct input and approve without an extra identity confirmation step',
  );
  ok(
    (await student('00ab-01')).boundUserId === c.id,
    'corrected application is counted against its actual roster student',
  );
  const archive = await db.studentVerificationEvent.findFirstOrThrow({
    where: { userId: c.id, action: 'ARCHIVE_SUBMISSION' },
  });
  ok(
    archive.materialId === cMaterial && archive.detail.realName === '填错姓名',
    'old evidence and submitted identity stay in immutable history',
  );
  ok(
    (await service.material(cMaterial, 'school-a', true)).length > 0,
    'school can read superseded material',
  );
  await rejects(() => service.material(cMaterial, 'school-b', true), /无权/);
  const race = await Promise.allSettled([
    service.submit(b.id, data(schoolA, '20260000000001', '测试学生甲')),
    service.submit(d.id, data(schoolA, '20260000000001', '测试学生甲')),
  ]);
  ok(
    race.filter(
      (r) =>
        r.status === 'fulfilled' &&
        r.value.data.verification_status === 'approved',
    ).length === 1,
    'simultaneous exact matches approve exactly one account',
  );
  ok(
    (await db.studentVerify.count({
      where: {
        rosterStudentId: (await student('20260000000001')).id,
        status: 'APPROVED',
      },
    })) === 1,
    'database commits one owner',
  );
  const record = await db.studentVerify.findUniqueOrThrow({
    where: { userId: a.id },
    include: identityInclude,
  });
  ok(
    effectiveStudentIdentity(record, a.id, regionA.id) &&
      !effectiveStudentIdentity(record, a.id, regionB.id),
    'identity authorizes its school only',
  );
  await access.assertStudentProtectedAction(a.id, regionA.id, '测试服务');
  checks++;
  await rejects(
    () => access.assertStudentProtectedAction(a.id, regionB.id, '测试服务'),
    /本校/,
  );
  const outsider = await user('outside-roster');
  const outside = (
    await service.submit(
      outsider.id,
      data(schoolA, '外校内补录-006', '名册暂缺学生', await material(outsider)),
    )
  ).data;
  const outsideApproved = (
    await service.review(outsider.id, decision(outside), 'school-a')
  ).data;
  ok(
    outsideApproved.verification_status === 'approved' &&
      outsideApproved.proof_method === 'SCHOOL_EXCEPTION',
    'a legitimate student missing from the roster can pass manual review',
  );
  await access.assertStudentProtectedAction(
    outsider.id,
    regionA.id,
    '测试服务',
  );
  checks++;
  const disputed = await user('disputed');
  const dispute = (
    await service.submit(
      disputed.id,
      data(schoolA, '00Ab-01', '测试同名', await material(disputed)),
    )
  ).data;
  await rejects(
    () => service.review(disputed.id, decision(dispute), 'school-a'),
    /绑定争议/,
  );
  ok(
    (await student('00Ab-01')).boundUserId === a.id,
    'manual review cannot silently steal an existing binding',
  );
  const manual = await user('manual-school'),
    intruder = await user('intruder');
  const legacyPhoto = await user('legacy-photo');
  await rejects(
    () => service.submit(legacyPhoto.id, {
      ...data(schoolB, 'text-000', '人工测试'),
      photo_url: 'https://invalid.example/student.jpg',
    }),
    /不再接受公开学生证链接/,
  );
  ok(
    (await db.studentVerify.count({ where: { userId: legacyPhoto.id } })) === 0,
    'rejected public photo links never create an application',
  );
  const legacyPending = (
    await service.submit(legacyPhoto.id,
      data(schoolB, 'text-000', '人工测试', await material(legacyPhoto)),
    )
  ).data;
  ok(
    legacyPending.verification_status === 'pending',
    're-uploaded private material enters manual review',
  );
  const m = await material(manual);
  await rejects(
    () => service.submit(intruder.id, data(schoolB, 'text-000', '人工测试', m)),
    /本人上传/,
  );
  ok(
    (await db.studentVerify.count({ where: { userId: intruder.id } })) === 0 &&
      (await db.studentVerificationEvent.count({ where: { userId: intruder.id } })) === 0,
    'foreign material rejection leaves no application or approval audit row',
  );
  const pending = (
    await service.submit(manual.id, data(schoolB, 'text-000', '人工测试', m))
  ).data;
  ok(
    pending.verification_status === 'pending',
    'other schools retain manual mode',
  );
  ok(
    (await service.material(m, manual.id)).length > 0,
    'owner can read private material',
  );
  await rejects(() => service.material(m, intruder.id), /无权/);
  await rejects(() => service.material(m, 'school-a', true), /无权/);
  const reviews = await Promise.allSettled([
    service.review(manual.id, decision(pending), 'school-b'),
    service.review(
      manual.id,
      decision(pending, 'rejected', { reason: '材料不符合要求' }),
      'school-b',
    ),
  ]);
  ok(
    reviews.filter((r) => r.status === 'fulfilled').length === 1,
    'concurrent reviewers cannot overwrite one another',
  );
  const legacy = await user('legacy');
  await db.studentVerify.create({
    data: {
      userId: legacy.id,
      schoolId: schoolA.id,
      schoolName: schoolA.name,
      studentId: 'legacy-009',
      realName: '历史学生',
      status: 'APPROVED',
      proofMethod: 'LEGACY',
    },
  });
  ok(
    (await service.me(legacy.id)).data.verification_status === 'approved',
    'switching to roster automation preserves existing manual approvals',
  );
  const grad = await student('00Ab-01');
  await service.enrollment(
    schoolA.id,
    grad.id,
    {
      status: 'GRADUATED',
      version: grad.version,
      reason: '学校确认本年度毕业名单',
    },
    'school-a',
  );
  ok(
    (await service.me(a.id)).data.verification_status === 'revoked',
    'graduation removes school permission',
  );
  await rejects(
    () => access.assertStudentProtectedAction(a.id, regionA.id, '测试服务'),
    /本校/,
  );
  ok(
    (await db.user.findUniqueOrThrow({ where: { id: a.id } })).status ===
      'ACTIVE',
    'graduation does not ban the platform account',
  );
  ok(
    (await service.submit(a.id, data(schoolA, '00Ab-01', '测试同名'))).data
      .requires_material,
    'graduated row cannot automatically reapprove',
  );
  const graduated = await student('00Ab-01');
  await service.enrollment(
    schoolA.id,
    graduated.id,
    {
      status: 'ACTIVE',
      version: graduated.version,
      reason: '学校纠正学籍记录',
    },
    'school-a',
  );
  ok(
    (await service.me(a.id)).data.verification_status === 'revoked',
    'return does not silently reactivate approval',
  );
  ok(
    (await service.submit(a.id, data(schoolA, '00Ab-01', '测试同名'))).data
      .requires_material,
    'revoked identities require manual review and cannot bypass an administrative revocation',
  );
  const returning = (
    await service.submit(
      a.id,
      data(schoolA, '00Ab-01', '测试同名', await material(a)),
    )
  ).data;
  const rebound = (await service.review(a.id, decision(returning), 'school-a'))
    .data;
  ok(
    rebound.verification_status === 'approved',
    'returned student may regain school identity through manual review',
  );
  const bound = await student('00Ab-01');
  await service.release(
    schoolA.id,
    bound.id,
    {
      version: bound.version,
      identityConfirmed: true,
      reason: '学校核实账号绑定争议',
    },
    'school-a',
  );
  ok(
    !(await student('00Ab-01')).boundUserId &&
      (await service.me(a.id)).data.verification_status === 'revoked',
    'dispute release revokes old account and frees the binding',
  );
  const schoolService = new SchoolService(db, scope);
  await rejects(
    () =>
      schoolService.update(schoolB.id, { regionId: regionA.id }, 'school-a'),
    /无权/,
  );
  await rejects(
    () => schoolService.bindToRegion(regionA.id, [schoolB.id], 'school-a'),
    /无权/,
  );
  ok(
    (
      await schoolService.adminList({ page: 1, pageSize: 100 }, 'school-a')
    ).list.every((s) => s.regionId === regionA.id),
    'school list respects region ownership',
  );
  await db.region.update({
    where: { id: regionA.id },
    data: {
      onlyStudentAuthUsers: false,
      settings: { circleConfig: { require_student_auth_create: 1 } },
    },
  });
  await db.config.upsert({
    where: { key: `content.note_settings.${regionA.id}` },
    create: {
      key: `content.note_settings.${regionA.id}`,
      value: { require_student_auth_before_publish: 1 },
    },
    update: { value: { require_student_auth_before_publish: 1 } },
  });
  await rejects(
    () =>
      access.assertStudentProtectedAction(intruder.id, regionA.id, '创建圈子'),
    /本校/,
  );
  await rejects(
    () =>
      access.assertStudentProtectedAction(intruder.id, regionA.id, '发布笔记'),
    /本校/,
  );
  const list = await service.roster(
    schoolA.id,
    { page: 1, pageSize: 20 },
    'school-a',
  );
  ok(
    list.stats.active === 1000 &&
      list.stats.active ===
        ['none', 'pending', 'approved', 'rejected', 'revoked'].reduce(
          (n, key) => n + list.stats[key],
          0,
        ),
    'roster buckets reconcile to enrolled student count',
  );
  ok(
    list.stats.legacy.APPROVED === 1 && list.stats.outsideApproved === 1,
    'historical and manually approved missing-roster accounts are separate from roster counts',
  );
  ok(
    list.stats.manualPending ===
      (await db.studentVerify.count({
        where: { schoolId: schoolA.id, status: 'PENDING' },
      })),
    'manual queue count includes mismatches outside roster',
  );
  await rejects(
    () =>
      service.applications(
        { page: 1, pageSize: 20, schoolId: schoolA.id },
        'school-b',
      ),
    /无权/,
  );
  ok(
    (
      await service.applications({ page: 1, pageSize: 100 }, 'school-b')
    ).list.every((v) => v.school_id === schoolB.id),
    'applications are scoped to administrator schools',
  );
  console.log(
    JSON.stringify({
      result: 'passed',
      rule: 'exact school/name/identifier match auto-approves; mismatch goes to manual review',
      checks,
      importRows: 1000,
      productionDataUsed: false,
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
