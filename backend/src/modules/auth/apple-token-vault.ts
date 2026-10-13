import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Key ring is an explicit JSON object of key-id -> canonical base64 32-byte keys.
// Rotation: retain old IDs until their outstanding tokens have been revoked/re-encrypted.
export class AppleTokenVault {
  constructor(private readonly config: ConfigService) {}
  private unavailable(): never {
    throw new ServiceUnavailableException({ code: 'APPLE_TOKEN_VAULT_UNAVAILABLE', message: 'Apple 授权保护服务暂不可用，请稍后重试' });
  }
  private keys(): Record<string, Buffer> {
    try {
      const raw = this.config.get<unknown>('APPLE_TOKEN_ENCRYPTION_KEYS');
      if (typeof raw !== 'string') return this.unavailable();
      const parsed = JSON.parse(raw);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.keys(parsed).length === 0 || Object.keys(parsed).length > 8) return this.unavailable();
      const result: Record<string, Buffer> = Object.create(null);
      for (const [id, value] of Object.entries(parsed)) {
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || typeof value !== 'string') return this.unavailable();
        const key = Buffer.from(value, 'base64');
        if (key.length !== 32 || key.toString('base64') !== value) return this.unavailable();
        result[id] = key;
      }
      return result;
    } catch { return this.unavailable(); }
  }
  assertConfigured(): void {
    const id = this.config.get<unknown>('APPLE_TOKEN_ENCRYPTION_KEY_ID');
    if (typeof id !== 'string' || !this.keys()[id]) this.unavailable();
  }
  seal(token: string, appId: string, subject: string): string {
    this.assertConfigured();
    if (!token || token.length > 4096) return this.unavailable();
    const id = this.config.get<string>('APPLE_TOKEN_ENCRYPTION_KEY_ID')!;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys()[id], iv);
    cipher.setAAD(Buffer.from(JSON.stringify(['apple-refresh-token-v1', appId, subject])));
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return ['v1', id, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
  }
  open(envelope: string, appId: string, subject: string): string {
    try {
      if (typeof envelope !== 'string' || envelope.length > 8192) return this.unavailable();
      const parts = envelope.split('.');
      if (parts.length !== 5 || parts[0] !== 'v1' || !/^[A-Za-z0-9_-]{1,40}$/.test(parts[1])) return this.unavailable();
      const key = this.keys()[parts[1]];
      if (!key) return this.unavailable();
      const [iv, tag, ciphertext] = parts.slice(2).map((value) => {
        if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return this.unavailable();
        const bytes = Buffer.from(value, 'base64url');
        if (bytes.toString('base64url') !== value) return this.unavailable();
        return bytes;
      });
      if (iv.length !== 12 || tag.length !== 16) return this.unavailable();
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(JSON.stringify(['apple-refresh-token-v1', appId, subject])));
      decipher.setAuthTag(tag);
      const token = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      if (!token || token.length > 4096) return this.unavailable();
      return token;
    } catch { return this.unavailable(); }
  }
}
