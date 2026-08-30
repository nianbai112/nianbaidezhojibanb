import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('campus map catalog integrity migrations', () => {
  const backendRoot = resolve(__dirname, '../../..');
  const read = (relativePath: string) => readFileSync(resolve(backendRoot, relativePath), 'utf8');

  it.each([
    'prisma/migrations/202608260001_campus_map_place_route_closure/migration.sql',
    'prisma/additive-migrations/postgresql/202608260001_campus_map_place_route_closure.sql',
  ])('backfills PostgreSQL task links only from exact ids or unique feature keys: %s', (file) => {
    const sql = read(file);
    expect(sql).toContain('place."id" = target.value');
    expect(sql).toContain('HAVING COUNT(*) = 1');
    expect(sql).not.toContain('(place."id" = target.value OR place."artworkFeatureKey" = target.value)');
    expect(sql).not.toMatch(/UPDATE\s+"campus_map_collection_tasks"\s+SET\s+"targetPlaceIds"/i);
    expect(sql).toContain('"objectTypes" = \'["building"]\'::jsonb');
    expect(sql).toContain('"objectTypes" = \'["place_verification"]\'::jsonb');
    expect(sql).toContain("THEN 'place_verification'");
  });

  it('backfills MySQL task links only from exact ids or unique feature keys', () => {
    const sql = read('prisma/additive-migrations/mysql/202608260001_campus_map_place_route_closure.sql');
    expect(sql).toContain('place.`id` = target.`value`');
    expect(sql).toContain('HAVING COUNT(*) = 1');
    expect(sql).not.toContain('(place.`id` = target.`value` OR place.`artworkFeatureKey` = target.`value`)');
    expect(sql).not.toMatch(/UPDATE\s+`campus_map_collection_tasks`\s+SET\s+`targetPlaceIds`/i);
    expect(sql).toContain("JSON_UNQUOTE(JSON_EXTRACT(`objectTypes`,'$[0]'))='building'");
    expect(sql).toContain("SET `objectTypes` = JSON_ARRAY('place_verification')");
  });

  it.each([
    'prisma/migrations/202608260003_campus_map_runtime_safety/migration.sql',
    'prisma/additive-migrations/postgresql/202608260003_campus_map_runtime_safety.sql',
  ])('keeps PostgreSQL legacy catalog and media behind manual review: %s', (file) => {
    const sql = read(file);
    expect(sql).toContain('ALTER COLUMN "photos" SET DEFAULT \'[]\'::jsonb');
    expect(sql).toContain('SET "publishStatus" = \'review\'');
    expect(sql).toContain('"coordinateStatus" = \'uncollected\'');
    expect(sql).toContain('SET "reviewStatus" = \'pending\', "isPublic" = false');
    expect(sql).toContain('"sourceType" = \'legacy_admin\'');
  });

  it('keeps MySQL legacy catalog and media behind manual review', () => {
    const sql = read('prisma/additive-migrations/mysql/202608260003_campus_map_runtime_safety.sql');
    expect(sql).toContain('`photos` JSON NOT NULL DEFAULT (JSON_ARRAY())');
    expect(sql).toContain("SET `publishStatus` = 'review'");
    expect(sql).toContain("`coordinateStatus` = 'uncollected'");
    expect(sql).toContain("SET `reviewStatus` = 'pending', `isPublic` = FALSE");
    expect(sql).toContain("`sourceType` = 'legacy_admin'");
  });
});
