#!/usr/bin/env node
// Read-only diagnostics. Does not send messages, retry deliveries, or change data.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
const clean = (value) => String(value || '')
  .replace(/(?:postgres(?:ql)?|mysql):\/\/[^\s'"<>]+/gi, '[数据库连接已隐藏]')
  .replace(/((?:access_token|password|secret|api_key)=)[^\s&'"<>]+/gi, '$1[已隐藏]')
  .slice(0, 2400);
async function main() {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  const report = {};
  async function check(name, query, summarize = (value) => value) {
    try { report[name] = { ok: true, result: summarize(await query()) }; }
    catch (error) { report[name] = { ok: false, name: error.name, code: error.code, message: clean(error.message) }; }
  }
  try {
    await check('日志完整字段读取', () => db.serverLog.findMany({ take: 20, orderBy: { createdAt: 'desc' } }), (rows) => ({ rows: rows.length }));
    await check('日志列表字段读取', () => db.serverLog.findMany({ take: 20, orderBy: { createdAt: 'desc' }, select: { id: true, level: true, module: true, message: true, path: true, ip: true, method: true, statusCode: true, durationMs: true, createdAt: true } }), (rows) => ({ rows: rows.length }));
    await check('监控接口近期错误', () => db.serverLog.findMany({ where: { level: 'error', path: { contains: '/ops/' } }, take: 5, orderBy: { createdAt: 'desc' }, select: { path: true, createdAt: true, detail: true } }), (rows) => rows.map((row) => ({ path: row.path, createdAt: row.createdAt, error: clean(row.detail?.stack || row.detail?.name || '历史记录无错误堆栈') })));
    await check('微信发送分类统计', () => db.wechatMessageLog.groupBy({ by: ['platformType', 'templateType', 'status', 'errorCode'], _count: { _all: true } }));
    console.log(JSON.stringify(report, null, 2));
    if (Object.values(report).some((item) => !item.ok)) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
main().catch((error) => { console.error(clean(error.message)); process.exitCode = 1; });
