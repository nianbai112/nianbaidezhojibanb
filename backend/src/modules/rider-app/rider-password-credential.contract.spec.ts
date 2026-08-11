import {
  normalizeRiderPasswordUsername,
  parseRiderPasswordCredentialInput,
} from './rider-password-credential.contract';

describe('rider password credential contract', () => {
  it('normalizes a case-insensitive login name', () => {
    expect(normalizeRiderPasswordUsername('  Campus.Test  ')).toBe('campus.test');
  });

  it('requires a 10-64 character password containing letters and numbers', () => {
    expect(() => parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: 'user-1', enabled: true, password: 'short1',
    }, false)).toThrow('密码');
    expect(parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: 'user-1', enabled: true, password: 'Campus2026!',
    }, false).password).toBe('Campus2026!');
  });

  it('allows an empty password only when a hash already exists', () => {
    expect(parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: 'user-1', enabled: true, password: '',
    }, true).password).toBeUndefined();
  });

  it('rejects an invalid username', () => {
    expect(() => parseRiderPasswordCredentialInput({
      username: 'bad name', userId: 'user-1', password: 'Valid2026!'
    }, false)).toThrow('账号');
  });

  it('requires a bound rider user id', () => {
    expect(() => parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: '', password: 'Valid2026!'
    }, false)).toThrow('骑手');
  });

  it('rejects an invalid expiry timestamp', () => {
    expect(() => parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: 'user-1', password: 'Valid2026!', expiresAt: 'invalid'
    }, false)).toThrow('失效时间');
  });

  it('defaults enabled to true', () => {
    expect(parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: 'user-1', password: 'Valid2026!'
    }, false).enabled).toBe(true);
  });

  it('accepts an ASCII password inside both policy and bcrypt byte limits', () => {
    const password = `${'a'.repeat(62)}1A`;
    expect(Buffer.byteLength(password, 'utf8')).toBe(64);
    expect(parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: 'user-1', password
    }, false).password).toBe(password);
  });

  it('rejects a multibyte password that exceeds bcrypt\'s 72-byte limit', () => {
    const password = `${'密'.repeat(24)}1A`;
    expect(password.length).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(password, 'utf8')).toBeGreaterThan(72);
    expect(() => parseRiderPasswordCredentialInput({
      username: 'campus.test', userId: 'user-1', password
    }, false)).toThrow('72');
  });
});
