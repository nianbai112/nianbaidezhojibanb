import { LicenseRuntimeService } from './license-runtime.service';

describe('LicenseRuntimeService package URL boundary', () => {
  const service = new LicenseRuntimeService({} as any, { get: jest.fn() } as any);

  it('only accepts HTTPS packages from the configured license origin', () => {
    expect((service as any).trustedPackageUrl(
      'https://license.example.com/packages/app.zip',
      'https://license.example.com/api',
    )).toBe('https://license.example.com/packages/app.zip');

    for (const url of [
      'http://license.example.com/packages/app.zip',
      'https://127.0.0.1/packages/app.zip',
      'https://license.example.com@127.0.0.1/packages/app.zip',
      'https://cdn.example.com/packages/app.zip',
    ]) {
      expect(() => (service as any).trustedPackageUrl(url, 'https://license.example.com/api')).toThrow(
        '更新包地址不可信',
      );
    }
  });
});
