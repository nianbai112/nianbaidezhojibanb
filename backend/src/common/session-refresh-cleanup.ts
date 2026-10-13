import { tokenAuthVersion, UserTokenPayload } from './user-token-policy';

export function assertRevocationCutoff(version: number): void {
  if (!Number.isSafeInteger(version) || version <= 0) throw new Error('A positive committed authVersion is required for session cleanup');
}

/** Payload was verified at handshake, or read from a server-owned Redis refresh key.
 * Decoding Redis values here only narrows deletion; it never authorizes a session. */
export function isSessionBeforeVersion(payload: UserTokenPayload | undefined, userId: string, cutoff: number): boolean {
  assertRevocationCutoff(cutoff);
  if (!payload || payload.sub !== userId || payload.isAdmin === true) return false;
  const version = payload.sv === undefined && payload.token_use === undefined ? 0 : payload.sv;
  return Number.isSafeInteger(version) && Number(version) >= 0 && Number(version) < cutoff;
}

export async function clearRefreshSessionsBefore(redis: any, userId: string, cutoff: number): Promise<void> {
  assertRevocationCutoff(cutoff);
  const client = redis.getClient();
  const root = `refresh:${userId}`;
  const cleanupKey = async (key: string) => {
    // SCAN is advisory: independently constrain both the key and its subject.
    if (key !== root && !key.startsWith(`${root}:`)) return;
    const value = await client.get(key);
    if (typeof value !== 'string' || value.length > 65536) return;
    let payload: UserTokenPayload;
    try {
      const parts = value.split('.');
      if (parts.length !== 3) return;
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      tokenAuthVersion(payload, 'refresh', true);
    } catch { return; }
    if (!isSessionBeforeVersion(payload, userId, cutoff)) return;
    // A concurrent refresh/login may replace the value between GET and cleanup.
    await client.eval('if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0', 1, key, value);
  };
  await cleanupKey(root);
  let cursor = '0';
  const escapedRoot = root.replace(/[\\*?\[\]]/g, '\\$&');
  do {
    const [next, keys] = await client.scan(cursor, 'MATCH', `${escapedRoot}:*`, 'COUNT', 200);
    cursor = next;
    for (const key of keys) await cleanupKey(key);
  } while (cursor !== '0');
}
