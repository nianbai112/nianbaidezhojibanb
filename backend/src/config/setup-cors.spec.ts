import { resolveCorsOrigin, resolveListenHost } from './setup-cors';

describe('resolveCorsOrigin', () => {
  it('allows temporary broad CORS only while the protected setup wizard is active', () => {
    expect(resolveCorsOrigin({ nodeEnv: 'production', setupWizard: true, corsOrigin: '' })).toBe(true);
  });

  it('rejects missing production origins after setup is complete', () => {
    expect(() =>
      resolveCorsOrigin({ nodeEnv: 'production', setupWizard: false, corsOrigin: '' }),
    ).toThrow('CORS_ORIGIN is required');
  });

  it('returns the configured origin list', () => {
    expect(
      resolveCorsOrigin({
        nodeEnv: 'production',
        setupWizard: false,
        corsOrigin: 'https://example.com, https://admin.example.com',
      }),
    ).toEqual(['https://example.com', 'https://admin.example.com']);
  });
});

describe('resolveListenHost', () => {
  it('binds production to loopback by default', () => {
    expect(resolveListenHost({ nodeEnv: 'production' })).toBe('127.0.0.1');
  });

  it('keeps development reachable on all interfaces by default', () => {
    expect(resolveListenHost({ nodeEnv: 'development' })).toBe('0.0.0.0');
  });

  it('respects an explicit host', () => {
    expect(resolveListenHost({ nodeEnv: 'production', host: '10.0.0.8' })).toBe('10.0.0.8');
  });
});
