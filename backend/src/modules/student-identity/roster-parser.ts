import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { identityKey, studentText } from './student-identity.policy';

export type RosterRow = {
  studentId: string;
  realName: string;
  identityKey: string;
  row: number;
};
export const ROSTER_MAX_ROWS = 10000;

export function parseRoster(buffer: Buffer): RosterRow[] {
  if (!buffer?.length || buffer.length > 2 * 1024 * 1024)
    throw new BadRequestException('请上传不超过2MB的名册');
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(buffer, {
      type: 'buffer',
      sheetRows: ROSTER_MAX_ROWS + 2,
      cellFormula: true,
      cellText: false,
    });
  } catch {
    throw new BadRequestException('无法读取名册，请使用有效的xls或xlsx文件');
  }
  const sheets = book.SheetNames.map((name) => book.Sheets[name]).filter(
    (s) => !!s['!ref'],
  );
  const populated = sheets.filter(
    (s) => XLSX.utils.decode_range(s['!ref']!).e.r >= 1,
  );
  if (populated.length !== 1)
    throw new BadRequestException('名册须包含且仅包含一张有学生数据的工作表');
  const sheet = populated[0];
  const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref']!);
  if (range.e.r > ROSTER_MAX_ROWS || range.e.c > 63)
    throw new BadRequestException('名册最多10000行学生、64列');
  const headers: string[] = [];
  for (let c = 0; c <= range.e.c; c++)
    headers.push(
      String(sheet[XLSX.utils.encode_cell({ r: 0, c })]?.v || '').trim(),
    );
  const idColumns = headers
    .map((h, i) => (['校内学籍号', '学号', 'studentId'].includes(h) ? i : -1))
    .filter((i) => i >= 0);
  const nameColumns = headers
    .map((h, i) => (['姓名', 'realName'].includes(h) ? i : -1))
    .filter((i) => i >= 0);
  if (idColumns.length !== 1 || nameColumns.length !== 1)
    throw new BadRequestException(
      '首行须包含唯一的“学号/校内学籍号”和“姓名”列',
    );
  const rows: RosterRow[] = [];
  const seen = new Set<string>();
  for (let r = 1; r <= range.e.r; r++) {
    const idCell = sheet[XLSX.utils.encode_cell({ r, c: idColumns[0] })];
    const nameCell = sheet[XLSX.utils.encode_cell({ r, c: nameColumns[0] })];
    if (!idCell?.v && !nameCell?.v) continue;
    if (idCell?.f || nameCell?.f || idCell?.t !== 's' || nameCell?.t !== 's') {
      throw new BadRequestException(
        `第${r + 1}行：学号和姓名必须是文本，不能使用数值单元格或公式`,
      );
    }
    const studentId = studentText(idCell.v, `第${r + 1}行学号`);
    const realName = studentText(nameCell.v, `第${r + 1}行姓名`);
    const key = identityKey(studentId);
    if (seen.has(key))
      throw new BadRequestException(`第${r + 1}行：学号重复，请先核对学校名册`);
    seen.add(key);
    rows.push({ studentId, realName, identityKey: key, row: r + 1 });
  }
  if (!rows.length) throw new BadRequestException('名册没有学生记录');
  return rows;
}
