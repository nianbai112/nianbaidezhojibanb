import { assertRiderPasswordTokenActive } from './rider-password-token.util';

describe('assertRiderPasswordTokenActive', () => {
  function createPrisma() {
    return {
      riderAppPasswordCredential: {
        findUnique: jest.fn(),
      },
    };
  }

  it('accepts ordinary SMS tokens without a credential lookup', async () => {
    const prisma = createPrisma();

    await expect(assertRiderPasswordTokenActive(prisma as any, {
      sub: 'user-1',
      isAdmin: false,
    })).resolves.toBeUndefined();
    expect(prisma.riderAppPasswordCredential.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a rotated password credential token', async () => {
    const prisma = createPrisma();
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      enabled: true,
      expiresAt: null,
      sessionVersion: 3,
    });

    await expect(assertRiderPasswordTokenActive(prisma as any, {
      sub: 'user-1',
      authSource: 'rider_password',
      credentialId: 'credential-1',
      credentialVersion: 2,
    })).rejects.toThrow('登录状态已失效');
  });

  it.each([
    { claims: { credentialVersion: 3 }, label: 'missing credential id' },
    { claims: { credentialId: 'credential-1' }, label: 'missing credential version' },
    {
      claims: { credentialId: 'credential-1', credentialVersion: 'not-a-number' },
      label: 'invalid credential version',
    },
  ])('fails closed for password tokens with $label', async ({ claims }) => {
    const prisma = createPrisma();

    await expect(assertRiderPasswordTokenActive(prisma as any, {
      sub: 'user-1',
      authSource: 'rider_password',
      ...claims,
    })).rejects.toThrow('登录状态已失效');
    expect(prisma.riderAppPasswordCredential.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    { override: { enabled: false }, label: 'disabled' },
    { override: { userId: 'user-2' }, label: 'bound to another user' },
    {
      override: { expiresAt: new Date('2026-08-11T00:00:00.000Z') },
      label: 'expired',
    },
  ])('rejects a password credential that is $label', async ({ override }) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-11T01:00:00.000Z'));
    const prisma = createPrisma();
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      enabled: true,
      expiresAt: null,
      sessionVersion: 3,
      ...override,
    });

    await expect(assertRiderPasswordTokenActive(prisma as any, {
      sub: 'user-1',
      authSource: 'rider_password',
      credentialId: 'credential-1',
      credentialVersion: 3,
    })).rejects.toThrow('登录状态已失效');
    jest.useRealTimers();
  });

  it('accepts a matching active password credential', async () => {
    const prisma = createPrisma();
    prisma.riderAppPasswordCredential.findUnique.mockResolvedValue({
      id: 'credential-1',
      userId: 'user-1',
      enabled: true,
      expiresAt: null,
      sessionVersion: 3,
    });

    await expect(assertRiderPasswordTokenActive(prisma as any, {
      sub: 'user-1',
      authSource: 'rider_password',
      credentialId: 'credential-1',
      credentialVersion: 3,
    })).resolves.toBeUndefined();
    expect(prisma.riderAppPasswordCredential.findUnique).toHaveBeenCalledWith({
      where: { id: 'credential-1' },
    });
  });
});
