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
});
