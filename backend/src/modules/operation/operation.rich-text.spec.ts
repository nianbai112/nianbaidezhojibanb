import { OperationService } from './operation.service';

type Document = {
  id: string;
  regionId: string | null;
  type: string;
  title: string;
  content: string;
  version: string;
  scene: string | null;
  isRequired: boolean;
  isShow: boolean;
  sortOrder: number;
  updatedAt: Date;
  publishedAt: Date | null;
};

const document = (id: string, overrides: Partial<Document> = {}): Document => ({
  id,
  regionId: null,
  type: 'HELP',
  title: `Title ${id}`,
  content: `<p>Body ${id}</p>`,
  version: '1.0',
  scene: null,
  isRequired: false,
  isShow: true,
  sortOrder: 0,
  updatedAt: new Date('2026-09-28T00:00:00Z'),
  publishedAt: null,
  ...overrides,
});

// Read-only Prisma double that applies query predicates/order/projection. It
// deliberately has no campus-vs-global selection rule: that is the service's job.
function setup(rows: Document[]) {
  const matches = (row: Document, where: any = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return (value as any[]).some((branch) => matches(row, branch));
      if (key === 'AND') return (value as any[]).every((branch) => matches(row, branch));
      if (value && typeof value === 'object' && 'lte' in value) return (row as any)[key] != null && (row as any)[key] <= (value as any).lte;
      return (row as any)[key] === value;
    });
  const richTextContent = {
    findUnique: jest.fn(async ({ where }: any) => rows.find((row) => row.id === where.id) || null),
    findFirst: jest.fn(async ({ where }: any) => rows.find((row) => matches(row, where)) || null),
    findMany: jest.fn(async ({ where, orderBy = [], select }: any) => {
      const result = rows.filter((row) => matches(row, where)).sort((a, b) => {
        for (const clause of orderBy) {
          const [key, direction] = Object.entries(clause)[0];
          const left = (a as any)[key];
          const right = (b as any)[key];
          if (left < right) return direction === 'asc' ? -1 : 1;
          if (left > right) return direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
      return select ? result.map((row) => Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, (row as any)[key]]))) : result;
    }),
  };
  const service = new OperationService({ richTextContent } as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { service, richTextContent };
}

describe('public rich text publication boundary', () => {
  it('does not expose a scheduled document before its publication time even with its exact id', async () => {
    const { service } = setup([document('scheduled', { publishedAt: new Date(Date.now() + 86400000) })]);
    await expect(service.getRichTextContent('scheduled')).resolves.toBeNull();
  });
  it('does not return an unpublished document even when its exact id is known', async () => {
    const { service } = setup([document('draft', { isShow: false })]);
    await expect(service.getRichTextContent('draft')).resolves.toBeNull();
  });

  it('returns a published document without changing its public response fields', async () => {
    const published = document('published', { regionId: 'campus-other', type: 'ABOUT_US' });
    const { service } = setup([published]);
    // A published campus article is still public, not a private campus resource.
    await expect(service.getRichTextContent('published')).resolves.toEqual(published);
  });

  it('retains the existing not-found null contract', async () => {
    const { service } = setup([document('other')]);
    await expect(service.getRichTextContent('missing')).resolves.toBeNull();
  });

  it('does not disguise a database failure as an empty document', async () => {
    const { service, richTextContent } = setup([]);
    richTextContent.findFirst.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.getRichTextContent('published')).rejects.toThrow('database unavailable');
  });
});

describe('public rich text type selection', () => {
  it('ignores a future campus override and retains the already published global version', async () => {
    const { service } = setup([document('global'), document('future', { regionId: 'campus-a', publishedAt: new Date(Date.now() + 86400000) })]);
    expect((await service.getRegionContentTypes('campus-a')).types.map((row) => row.content_id)).toEqual(['global']);
  });
  it.each([
    { globalOrder: -20, campusOrder: 20 },
    { globalOrder: 20, campusOrder: -20 },
  ])('prefers campus overrides regardless of global sort order: %j', async ({ globalOrder, campusOrder }) => {
    const { service } = setup([
      document('global', { sortOrder: globalOrder }),
      document('campus', { regionId: 'campus-a', sortOrder: campusOrder }),
    ]);
    const response = await service.getRegionContentTypes('campus-a');
    expect(response.types.map((row) => row.content_id)).toEqual(['campus']);
  });

  it('keeps the lowest sort order in the same campus scope, not the last match', async () => {
    const { service } = setup([
      document('low-priority', { regionId: 'campus-a', sortOrder: 99 }),
      document('preferred', { regionId: 'campus-a', sortOrder: 1 }),
      document('middle', { regionId: 'campus-a', sortOrder: 20 }),
    ]);
    const response = await service.getRegionContentTypes('campus-a');
    expect(response.types[0].content_id).toBe('preferred');
  });

  it('uses the latest update when sort order is tied in one scope', async () => {
    const { service } = setup([
      document('older', { regionId: 'campus-a', updatedAt: new Date('2026-01-01T00:00:00Z') }),
      document('latest', { regionId: 'campus-a', updatedAt: new Date('2026-09-29T00:00:00Z') }),
    ]);
    expect((await service.getRegionContentTypes('campus-a')).types[0].content_id).toBe('latest');
  });

  it('uses stable id ordering when sort order and update time are tied', async () => {
    const rows = [document('b', { regionId: 'campus-a' }), document('a', { regionId: 'campus-a' })];
    for (const input of [rows, [...rows].reverse()]) {
      expect((await setup(input).service.getRegionContentTypes('campus-a')).types[0].content_id).toBe('a');
    }
  });

  it('falls back to the first sorted published global document when the campus version is hidden', async () => {
    const { service } = setup([
      document('campus-draft', { regionId: 'campus-a', isShow: false, sortOrder: -1 }),
      document('global-last', { sortOrder: 50 }),
      document('global-first', { sortOrder: 1 }),
      document('foreign', { regionId: 'campus-b', sortOrder: -10 }),
    ]);
    expect((await service.getRegionContentTypes('campus-a')).types.map((row) => row.content_id)).toEqual(['global-first']);
  });

  it('selects each content type independently and preserves both existing response aliases', async () => {
    const updatedAt = new Date('2026-09-29T00:00:00Z');
    const { service } = setup([
      document('global-help'),
      document('campus-help', { regionId: 'campus-a', scene: 'help', isRequired: true, version: 'v2', updatedAt }),
      document('global-about', { type: 'ABOUT_US', sortOrder: 1 }),
      document('other-school-about', { type: 'ABOUT_US', regionId: 'campus-b' }),
    ]);
    const response = await service.getRegionContentTypes('campus-a');
    expect(response.code).toBe(200);
    expect(response.data.types).toEqual(response.types);
    expect(response.types).toEqual([
      { type: 'HELP', content_id: 'campus-help', contentId: 'campus-help', title: 'Title campus-help', version: 'v2', scene: 'help', required: true, updated_at: updatedAt },
      { type: 'ABOUT_US', content_id: 'global-about', contentId: 'global-about', title: 'Title global-about', version: '1.0', scene: '', required: false, updated_at: new Date('2026-09-28T00:00:00Z') },
    ]);
  });

  it('returns an empty list when all documents are hidden or in another campus', async () => {
    const { service } = setup([
      document('draft', { isShow: false }),
      document('other', { regionId: 'campus-b' }),
    ]);
    await expect(service.getRegionContentTypes('campus-a')).resolves.toEqual({ code: 200, data: { types: [] }, types: [] });
  });

  it('propagates a database failure instead of returning a misleading empty configuration', async () => {
    const { service, richTextContent } = setup([]);
    richTextContent.findMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.getRegionContentTypes('campus-a')).rejects.toThrow('database unavailable');
  });
});
