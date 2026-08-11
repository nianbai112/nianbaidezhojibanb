import { NewUiCompatController } from './new-ui-compat.controller';

describe('NewUiCompatController SQL LIKE boundary', () => {
  it('escapes backslash, percent and underscore as literal search text', () => {
    const controller = new NewUiCompatController({} as any, {} as any, {} as any);
    expect((controller as any).escapeSqlLike('100%_school\\name')).toBe('100\\%\\_school\\\\name');
  });
});
