import { readFileSync } from 'fs';
import { SystemAdminService } from './system-admin.service';

describe('SystemAdminService external content boundaries', () => {
  const service = new SystemAdminService({} as any, {} as any);

  it('only accepts HTTPS WeChat article URLs on the official hostname', () => {
    expect((service as any).trustedWechatArticlePath('https://mp.weixin.qq.com/s/abc?scene=1')).toBe('/s/abc?scene=1');
    for (const url of ['http://mp.weixin.qq.com/s/a', 'https://127.0.0.1/a', 'https://mp.weixin.qq.com@127.0.0.1/a']) {
      expect(() => (service as any).trustedWechatArticlePath(url)).toThrow('文章链接不可信');
    }
  });

  it('sends test email content as text rather than executable HTML', () => {
    const source = readFileSync(__filename.replace('.security.spec.ts', '.ts'), 'utf8');
    expect(source).not.toMatch(/html:\s*dto\.content/);
    expect(source).toMatch(/text:\s*String\(dto\.content/);
  });
});
