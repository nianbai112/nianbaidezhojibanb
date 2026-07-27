import { SchoolService } from './school.service';

describe('SchoolService', () => {
  const createPrisma = () => ({
    school: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  });

  it('builds provider-safe keyword filters for public school search', async () => {
    const prisma = createPrisma();
    const service = new SchoolService(prisma as any);

    await service.list({ keyword: ' 云 ', page: 1, page_size: 10 } as any);

    const where = prisma.school.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: '云' } },
      { shortName: { contains: '云' } },
      { campusName: { contains: '云' } },
      { province: { contains: '云' } },
      { city: { contains: '云' } },
    ]);
    expect(JSON.stringify(where)).not.toContain('"mode"');
  });
});
