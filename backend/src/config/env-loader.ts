import * as fs from 'node:fs';
import * as path from 'node:path';

type EnvRecord = Record<string, unknown>;

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const env: Record<string, string> = {};
  const content = fs.readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function stringify(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function hasValue(value: unknown): boolean {
  return stringify(value) !== '';
}

export function resolveProjectRoot(cwd = process.cwd()): string {
  return path.basename(cwd) === 'backend' ? path.resolve(cwd, '..') : cwd;
}

export function getEnvFilePaths(projectRoot = resolveProjectRoot()): string[] {
  const backendRoot = path.join(projectRoot, 'backend');
  return [
    path.join(projectRoot, '.env.local'),
    path.join(projectRoot, '.env'),
    path.join(backendRoot, '.env.local'),
    path.join(backendRoot, '.env'),
  ];
}

export function buildDatabaseUrl(config: EnvRecord): string {
  if (hasValue(config.DATABASE_URL)) return stringify(config.DATABASE_URL);

  const provider = stringify(config.DB_PROVIDER).toLowerCase() || 'mysql';
  const host = stringify(config.DB_HOST);
  const user = stringify(config.DB_USER);
  const password = stringify(config.DB_PASSWORD);
  const database = stringify(config.DB_NAME);
  if (!host || !user || !database) return '';

  const port = stringify(config.DB_PORT) || (provider === 'postgresql' || provider === 'postgres' ? '5432' : '3306');
  const schema = stringify(config.DB_SCHEMA) || 'public';
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  const dbName = encodeURIComponent(database);

  if (provider === 'postgresql' || provider === 'postgres') {
    return `postgresql://${auth}@${host}:${port}/${dbName}?schema=${encodeURIComponent(schema)}`;
  }

  return `mysql://${auth}@${host}:${port}/${dbName}`;
}

export function normalizeEnvAliases(config: EnvRecord): Record<string, unknown> {
  const normalized = { ...config };
  const databaseUrl = buildDatabaseUrl(normalized);
  if (databaseUrl && !hasValue(normalized.DATABASE_URL)) {
    normalized.DATABASE_URL = databaseUrl;
  }

  if (!hasValue(normalized.SETUP_WIZARD) && hasValue(normalized.DB_IS_INSTALLED)) {
    normalized.SETUP_WIZARD = stringify(normalized.DB_IS_INSTALLED) === '1' ? 'false' : 'true';
  }

  if (!hasValue(normalized.JWT_SECRET_ADMIN) && hasValue(normalized.ADMIN_JWT_SECRET)) {
    normalized.JWT_SECRET_ADMIN = stringify(normalized.ADMIN_JWT_SECRET);
  }

  if (!hasValue(normalized.THROTTLE_TTL) && hasValue(normalized.RATE_LIMIT_WINDOW_MS)) {
    const windowMs = Number(normalized.RATE_LIMIT_WINDOW_MS);
    if (Number.isFinite(windowMs) && windowMs > 0) {
      normalized.THROTTLE_TTL = String(Math.ceil(windowMs / 1000));
    }
  }

  if (!hasValue(normalized.THROTTLE_LIMIT) && hasValue(normalized.RATE_LIMIT_MAX)) {
    normalized.THROTTLE_LIMIT = stringify(normalized.RATE_LIMIT_MAX);
  }

  return normalized;
}

export function loadProjectEnv(): Record<string, string> {
  const loaded: Record<string, string> = {};
  for (const filePath of getEnvFilePaths()) {
    Object.assign(loaded, parseEnvFile(filePath));
  }

  const normalized = normalizeEnvAliases({ ...loaded, ...process.env }) as Record<string, string>;
  for (const [key, value] of Object.entries(normalized)) {
    if (value === undefined || value === null || value === '') continue;
    process.env[key] = String(value);
  }

  return normalized;
}
