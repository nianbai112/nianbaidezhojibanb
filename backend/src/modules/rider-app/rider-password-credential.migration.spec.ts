import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backendRoot = resolve(__dirname, '../../..');
const readSql = (path: string) => readFileSync(resolve(backendRoot, path), 'utf8');

describe('rider password fixed-row migration', () => {
  const prismaMigration = readSql(
    'prisma/migrations/202608110003_rider_password_credential_fixed_id/migration.sql',
  );
  const postgresqlAdditive = readSql(
    'prisma/additive-migrations/postgresql/202608110003_rider_password_credential_fixed_id.sql',
  );
  const mysqlAdditive = readSql(
    'prisma/additive-migrations/mysql/202608110003_rider_password_credential_fixed_id.sql',
  );

  it('keeps the PostgreSQL deploy and additive migrations identical', () => {
    expect(postgresqlAdditive).toBe(prismaMigration);
  });

  it.each([prismaMigration, postgresqlAdditive])(
    'cleans dirty PostgreSQL singleton data before adding a table-scoped check',
    (sql) => {
      expect(sql.indexOf('DELETE FROM "rider_app_password_credentials"')).toBeGreaterThanOrEqual(0);
      expect(sql.indexOf('DELETE FROM "rider_app_password_credentials"')).toBeLessThan(sql.indexOf('ADD CONSTRAINT'));
      expect(sql).toContain("(\"id\" = 'rider-password-login') DESC");
      expect(sql).toContain("conrelid = 'rider_app_password_credentials'::regclass");
    },
  );

  it('cleans dirty MySQL data before enforcing the exact case-sensitive fixed id', () => {
    expect(mysqlAdditive.indexOf('DELETE credential')).toBeGreaterThanOrEqual(0);
    expect(mysqlAdditive.indexOf('DELETE credential')).toBeLessThan(mysqlAdditive.indexOf('ADD CONSTRAINT'));
    expect(mysqlAdditive).toContain("WHERE BINARY `id` <> BINARY 'rider-password-login'");
    expect(mysqlAdditive).toContain("CHECK (BINARY `id` = BINARY ''rider-password-login'')");
  });
});
