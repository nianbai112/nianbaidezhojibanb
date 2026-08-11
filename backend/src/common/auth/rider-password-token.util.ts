import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';

const INVALID_PASSWORD_SESSION_MESSAGE = '登录状态已失效，请重新登录';

export async function assertRiderPasswordTokenActive(
  prisma: PrismaService,
  payload: any,
): Promise<void> {
  if (payload?.authSource !== 'rider_password') return;

  const credentialId = String(payload?.credentialId || '').trim();
  const credentialVersion = Number(payload?.credentialVersion);
  if (!credentialId || !Number.isInteger(credentialVersion) || credentialVersion < 1) {
    throw new UnauthorizedException(INVALID_PASSWORD_SESSION_MESSAGE);
  }

  const credential = await prisma.riderAppPasswordCredential.findUnique({
    where: { id: credentialId },
  });
  if (
    !credential
    || !credential.enabled
    || credential.userId !== payload.sub
    || credential.sessionVersion !== credentialVersion
    || (credential.expiresAt && credential.expiresAt.getTime() <= Date.now())
  ) {
    throw new UnauthorizedException(INVALID_PASSWORD_SESSION_MESSAGE);
  }
}
