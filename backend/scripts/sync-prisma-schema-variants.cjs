#!/usr/bin/env node
const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const prismaDir = path.resolve(__dirname, '..', 'prisma')
const sourcePath = path.join(prismaDir, 'schema.prisma')
const checkOnly = process.argv.includes('--check')
const generateClient = process.argv.includes('--generate')

if (!existsSync(sourcePath)) throw new Error(`Prisma 主 schema 不存在：${sourcePath}`)

const source = readFileSync(sourcePath, 'utf8')
if (!/provider\s*=\s*"(?:mysql|postgresql)"/.test(source)) {
  throw new Error('Prisma 主 schema 缺少 mysql 或 postgresql datasource provider')
}

function variant(provider) {
  let content = source.replace(/provider\s*=\s*"(?:mysql|postgresql)"/, `provider = "${provider}"`)
  if (provider === 'mysql') {
    content = content.replace(/^\s*previewFeatures\s*=\s*\[[^\]]*"fullTextSearch"[^\]]*\]\s*\r?\n?/m, '')
  }
  return content
}

function configuredProvider() {
  const envPath = path.resolve(__dirname, '..', '.env')
  const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  const envValue = (key) => envText.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') || ''
  const provider = process.env.DB_PROVIDER || envValue('DB_PROVIDER')
  const databaseUrl = process.env.DATABASE_URL || envValue('DATABASE_URL')
  const value = String(provider || (String(databaseUrl).startsWith('mysql://') ? 'mysql' : 'postgresql')).toLowerCase()
  return value === 'mysql' ? 'mysql' : 'postgresql'
}

const variants = new Map([
  ['postgresql', path.join(prismaDir, 'schema.postgresql.prisma')],
  ['mysql', path.join(prismaDir, 'schema.mysql.prisma')],
])

let stale = false
for (const [provider, filePath] of variants) {
  const expected = variant(provider)
  const current = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
  if (current === expected) continue
  stale = true
  if (!checkOnly) writeFileSync(filePath, expected)
}

if (checkOnly) {
  if (stale) {
    console.error('Prisma 方言 schema 未同步；请运行 npm run db:sync-schemas')
    process.exit(1)
  }
  console.log('Prisma 方言 schema 已同步')
  process.exit(0)
}

console.log(stale ? '已同步 Prisma PostgreSQL/MySQL schema' : 'Prisma PostgreSQL/MySQL schema 已是最新')

if (generateClient) {
  const provider = configuredProvider()
  const schemaPath = variants.get(provider)
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'generate', '--schema', schemaPath], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' })
  process.exit(result.status || 0)
}
