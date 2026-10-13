import { PHOTO_FREE_STUDENT_SCHOOL_ID } from '../student-identity/student-identity.policy';
import { SchoolService } from './school.service';

describe('SchoolService', () => {
  const createPrisma = () => ({
    school: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  });

  it('exposes the photo rule by school ID in public results', async () => {
    const prisma = createPrisma();
    prisma.school.findMany.mockResolvedValue([
      {
        id: PHOTO_FREE_STUDENT_SCHOOL_ID,
        name: '重庆城乡发展职业学院',
        studentVerificationMode: 'ROSTER',
      },
      { id: 'other-school', name: '其他学校' },
    ] as any);
    const result = await new SchoolService(prisma as any).list({
      page: 1,
      page_size: 10,
    } as any);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: PHOTO_FREE_STUDENT_SCHOOL_ID,
          student_card_required: false,
        }),
        expect.objectContaining({
          id: 'other-school',
          student_card_required: true,
        }),
      ]),
    );
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
