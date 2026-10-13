import * as XLSX from 'xlsx';
import { validate } from 'class-validator';
import { parseRoster } from './roster-parser';
import {
  identityKey,
  studentText,
  effectiveStudentIdentity,
} from './student-identity.policy';
import { ReviewStudentIdentityDto } from './student-identity.dto';

const file = (rows: any[][]) => {
  const b = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(b, { type: 'buffer', bookType: 'biff8' });
};
describe('school roster validation', () => {
  it('preserves text identifiers, leading zeros, symbols and distinct case', () => {
    const rows = parseRoster(
      file([
        ['校内学籍号', '性别', '姓名'],
        ['00Ab-01', '', '同名'],
        ['00ab-01', '', '同名'],
        ['20260000000001', '', '学生甲'],
      ]),
    );
    expect(rows.map((r) => r.studentId)).toEqual([
      '00Ab-01',
      '00ab-01',
      '20260000000001',
    ]);
    expect(identityKey(rows[0].studentId)).not.toBe(
      identityKey(rows[1].studentId),
    );
  });
  it('rejects numeric IDs rather than silently changing their meaning', () =>
    expect(() =>
      parseRoster(
        file([
          ['学号', '姓名'],
          [12345678901234, '学生'],
        ]),
      ),
    ).toThrow('文本'));
  it('rejects repeated IDs even when the names differ', () =>
    expect(() =>
      parseRoster(
        file([
          ['学号', '姓名'],
          ['001', '甲'],
          ['001', '乙'],
        ]),
      ),
    ).toThrow('重复'));
  it('rejects incomplete rows and conflicting header definitions', () => {
    expect(() =>
      parseRoster(
        file([
          ['学号', '姓名'],
          ['001', ''],
        ]),
      ),
    ).toThrow();
    expect(() =>
      parseRoster(
        file([
          ['学号', '校内学籍号', '姓名'],
          ['001', '002', '甲'],
        ]),
      ),
    ).toThrow('唯一');
  });
  it('rejects spreadsheet formulas and control characters', () => {
    expect(() => studentText('ab\ncd', '学号')).toThrow('控制字符');
    const b = XLSX.utils.book_new(),
      sheet = XLSX.utils.aoa_to_sheet([
        ['学号', '姓名'],
        ['001', '学生'],
      ]);
    sheet.A2 = { t: 's', v: '001', f: '"001"' };
    XLSX.utils.book_append_sheet(b, sheet, 'Sheet1');
    expect(() =>
      parseRoster(XLSX.write(b, { type: 'buffer', bookType: 'xlsx' })),
    ).toThrow('公式');
  });
  it('requires a concrete application version before review', async () => {
    const review = Object.assign(new ReviewStudentIdentityDto(), {
      status: 'approved',
    });
    expect((await validate(review)).map((e) => e.property)).toEqual(
      expect.arrayContaining(['applicationId', 'submissionVersion']),
    );
  });
  it('refuses a global approved flag without an active school binding', () => {
    expect(effectiveStudentIdentity({ status: 'APPROVED' }, 'u', 'r')).toBe(
      false,
    );
    expect(
      effectiveStudentIdentity(
        {
          status: 'APPROVED',
          schoolId: 's',
          school: {
            id: 's',
            isEnabled: true,
            regionId: 'r',
            studentVerificationMode: 'ROSTER',
          },
          proofMethod: 'ROSTER_MATCH',
        },
        'u',
        'r',
      ),
    ).toBe(false);
  });
});
