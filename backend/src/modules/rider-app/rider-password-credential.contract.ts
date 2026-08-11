import { BadRequestException } from '@nestjs/common';

export const PASSWORD_LOGIN_GENERIC_MESSAGE = '账号或密码错误，或账号暂不可用';

export interface RiderPasswordCredentialInput {
  username: string;
  userId: string;
  enabled: boolean;
  expiresAt: Date | null;
  password?: string;
}

export function normalizeRiderPasswordUsername(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function parseRiderPasswordCredentialInput(value: any, hasPassword: boolean): RiderPasswordCredentialInput {
  const username = normalizeRiderPasswordUsername(value?.username);
  const userId = String(value?.userId || '').trim();
  const password = String(value?.password || '');
  if (!/^[a-z0-9._-]{4,40}$/.test(username)) throw new BadRequestException('账号需为 4-40 位字母、数字或 ._-');
  if (!userId) throw new BadRequestException('请选择绑定的官方骑手');
  if (!password && !hasPassword) throw new BadRequestException('请设置登录密码');
  if (password && (password.length < 10 || password.length > 64 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
    throw new BadRequestException('密码需为 10-64 位并同时包含字母和数字');
  }
  const expiresAt = value?.expiresAt ? new Date(value.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new BadRequestException('失效时间无效');
  return { username, userId, enabled: value?.enabled !== false, expiresAt, ...(password ? { password } : {}) };
}
