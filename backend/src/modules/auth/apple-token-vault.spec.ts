import { ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppleTokenVault } from './apple-token-vault';

const APP = 'com.synthetic.campus';
const SUBJECT = 'synthetic-subject';
const TOKEN = 'synthetic-apple-refresh-token';
function setup(extra: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    APPLE_TOKEN_ENCRYPTION_KEY_ID: 'key-a',
    APPLE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ 'key-a': randomBytes(32).toString('base64') }),
    ...extra,
  };
  return { values, vault: new AppleTokenVault({ get: (name: string) => values[name] } as any) };
}
function unavailable(work: () => unknown) {
  try { work(); throw new Error('Expected vault failure'); } catch (error: any) {
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ code: 'APPLE_TOKEN_VAULT_UNAVAILABLE' });
    expect(JSON.stringify(error)).not.toContain(TOKEN);
    return error;
  }
}
const mutate = (envelope: string, index: number) => {
  const parts = envelope.split('.');
  const bytes = Buffer.from(parts[index], 'base64url');
  bytes[0] ^= 1;
  parts[index] = bytes.toString('base64url');
  return parts.join('.');
};

describe('Apple refresh token AES-256-GCM vault', () => {
  it('encrypts real token bytes with randomized 96-bit IVs and restores only with valid AAD', () => {
    const { vault } = setup();
    const first = vault.seal(TOKEN, APP, SUBJECT), second = vault.seal(TOKEN, APP, SUBJECT);
    expect(first).not.toBe(second);
    expect(first).not.toContain(TOKEN);
    expect(first.split('.').slice(0, 2)).toEqual(['v1', 'key-a']);
    expect(Buffer.from(first.split('.')[2], 'base64url')).toHaveLength(12);
    expect(Buffer.from(first.split('.')[3], 'base64url')).toHaveLength(16);
    expect(vault.open(first, APP, SUBJECT)).toBe(TOKEN);
    expect(vault.open(second, APP, SUBJECT)).toBe(TOKEN);
  });
  it.each([2, 3, 4])('rejects bit changes in IV, authentication tag or ciphertext (part %i)', (index) => {
    const { vault } = setup();
    unavailable(() => vault.open(mutate(vault.seal(TOKEN, APP, SUBJECT), index), APP, SUBJECT));
  });
  it('binds the encrypted token to both application and exact Apple subject', () => {
    const { vault } = setup(); const sealed = vault.seal(TOKEN, APP, SUBJECT);
    unavailable(() => vault.open(sealed, 'com.synthetic.other', SUBJECT));
    unavailable(() => vault.open(sealed, APP, 'different-subject'));
    // JSON tuple AAD avoids concatenation ambiguity between two different identity pairs.
    const ambiguous = vault.seal(TOKEN, 'ab', 'c');
    unavailable(() => vault.open(ambiguous, 'a', 'bc'));
  });
  it('supports rotation: old key decrypts existing envelopes while current key seals new tokens', () => {
    const { values, vault } = setup();
    const old = vault.seal(TOKEN, APP, SUBJECT);
    const keys = JSON.parse(values.APPLE_TOKEN_ENCRYPTION_KEYS as string);
    values.APPLE_TOKEN_ENCRYPTION_KEYS = JSON.stringify({ ...keys, 'key-b': randomBytes(32).toString('base64') });
    values.APPLE_TOKEN_ENCRYPTION_KEY_ID = 'key-b';
    const fresh = vault.seal(TOKEN, APP, SUBJECT);
    expect(fresh.split('.')[1]).toBe('key-b');
    expect(vault.open(old, APP, SUBJECT)).toBe(TOKEN);
    expect(vault.open(fresh, APP, SUBJECT)).toBe(TOKEN);
    values.APPLE_TOKEN_ENCRYPTION_KEYS = JSON.stringify({ 'key-b': JSON.parse(values.APPLE_TOKEN_ENCRYPTION_KEYS as string)['key-b'] });
    unavailable(() => vault.open(old, APP, SUBJECT));
    expect(vault.open(fresh, APP, SUBJECT)).toBe(TOKEN);
  });
  it('rejects an envelope moved to a different key ID and wrong key bytes', () => {
    const { values, vault } = setup(); const sealed = vault.seal(TOKEN, APP, SUBJECT);
    const keys = JSON.parse(values.APPLE_TOKEN_ENCRYPTION_KEYS as string);
    values.APPLE_TOKEN_ENCRYPTION_KEYS = JSON.stringify({ ...keys, 'key-b': randomBytes(32).toString('base64') });
    unavailable(() => vault.open(sealed.replace('.key-a.', '.key-b.'), APP, SUBJECT));
    values.APPLE_TOKEN_ENCRYPTION_KEYS = JSON.stringify({ 'key-a': randomBytes(32).toString('base64') });
    unavailable(() => vault.open(sealed, APP, SUBJECT));
  });
  it.each([
    { APPLE_TOKEN_ENCRYPTION_KEYS: undefined }, { APPLE_TOKEN_ENCRYPTION_KEYS: '' },
    { APPLE_TOKEN_ENCRYPTION_KEYS: '{}' }, { APPLE_TOKEN_ENCRYPTION_KEYS: '[]' },
    { APPLE_TOKEN_ENCRYPTION_KEYS: 'null' }, { APPLE_TOKEN_ENCRYPTION_KEYS: '{broken secret config' },
    { APPLE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ 'key-a': Buffer.alloc(31).toString('base64') }) },
    { APPLE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ 'key-a': Buffer.alloc(32).toString('base64').replace(/=+$/, '') }) },
    { APPLE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ 'key-a': ' ' + Buffer.alloc(32).toString('base64') }) },
    { APPLE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ '../key': Buffer.alloc(32).toString('base64') }) },
    { APPLE_TOKEN_ENCRYPTION_KEYS: JSON.stringify(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`key-${i}`, Buffer.alloc(32).toString('base64')]))) },
    { APPLE_TOKEN_ENCRYPTION_KEY_ID: undefined }, { APPLE_TOKEN_ENCRYPTION_KEY_ID: 'missing' },
  ])('fails closed for missing or malformed key configuration (case %#)', (extra) => {
    const { vault } = setup(extra);
    unavailable(() => vault.assertConfigured());
    unavailable(() => vault.seal(TOKEN, APP, SUBJECT));
  });
  it('rejects malformed, non-canonical and unsupported envelopes without exposing config errors', () => {
    const { vault } = setup(); const sealed = vault.seal(TOKEN, APP, SUBJECT); const parts = sealed.split('.');
    for (const value of [null, '', sealed + '.extra', sealed.replace(/^v1/, 'v2'), 'x'.repeat(8193),
      [parts[0], parts[1], parts[2] + '=', parts[3], parts[4]].join('.'),
      [parts[0], parts[1], Buffer.alloc(11).toString('base64url'), parts[3], parts[4]].join('.'),
      [parts[0], parts[1], parts[2], Buffer.alloc(15).toString('base64url'), parts[4]].join('.'),
      [parts[0], parts[1], parts[2], parts[3], ''].join('.')]) {
      unavailable(() => vault.open(value as any, APP, SUBJECT));
    }
  });
  it('rejects empty and oversized provider tokens and round-trips the accepted ASCII boundary', () => {
    const { vault } = setup();
    unavailable(() => vault.seal('', APP, SUBJECT));
    unavailable(() => vault.seal('x'.repeat(4097), APP, SUBJECT));
    const boundary = 'x'.repeat(4096);
    expect(vault.open(vault.seal(boundary, APP, SUBJECT), APP, SUBJECT)).toBe(boundary);
  });
});
