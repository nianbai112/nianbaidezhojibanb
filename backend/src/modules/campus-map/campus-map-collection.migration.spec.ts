import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('campus collection MySQL migration', () => {
  it('keeps every explicit index name within MySQL\'s 64-byte limit', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../../prisma/additive-migrations/mysql/202608100001_campus_collection_rider_professional.sql',
      ),
      'utf8',
    );
    const indexNames = [...sql.matchAll(/\b(?:UNIQUE\s+)?INDEX\s+`([^`]+)`/g)].map(
      (match) => match[1],
    );

    expect(indexNames.filter((name) => Buffer.byteLength(name, 'utf8') > 64)).toEqual([]);
  });
});
