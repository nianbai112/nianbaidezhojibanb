#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

function loadLocalEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').replaceAll('\r', '').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const ROLLBACK = 'OFFICIAL_SUPPORT_SCHEMA_SMOKE_ROLLBACK';

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const openid = `schema_smoke_${suffix}`;
  try {
    await prisma.$transaction(async (tx) => {
      const official = await tx.user.findFirst({
        where: { OR: [{ systemRole: 'OFFICIAL_ASSISTANT' }, { openid: 'lingmeng_official_message_account' }] },
        select: { id: true },
      });
      assert.ok(official, 'official account must exist before the smoke test');

      const user = await tx.user.create({ data: { openid } });
      const scopeKey = `support:schema-smoke:${user.id}`;
      const conversation = await tx.conversation.create({
        data: {
          type: 'private',
          scopeKey,
          regionId: 'schema-smoke',
          members: { create: [{ userId: user.id }, { userId: official.id, role: 'admin' }] },
        },
      });
      const ticket = await tx.assistantTicket.create({
        data: {
          ticketNo: `SMOKE${suffix}`,
          userId: user.id,
          regionId: 'schema-smoke',
          conversationId: conversation.id,
          content: 'schema smoke',
        },
      });
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: user.id,
          ticketId: ticket.id,
          type: 'TEXT',
          content: 'schema smoke',
          clientMessageId: `smoke_${suffix}`,
        },
      });
      const reply = await tx.assistantTicketReply.create({
        data: {
          ticketId: ticket.id,
          messageId: message.id,
          senderType: 'user',
          senderId: user.id,
          clientMessageId: `smoke_${suffix}`,
          content: 'schema smoke',
        },
      });
      const notification = await tx.notification.create({
        data: {
          userId: user.id,
          eventKey: `schema-smoke:${suffix}`,
          type: 'SYSTEM',
          title: 'schema smoke',
          content: 'schema smoke',
        },
      });

      const linked = await tx.message.findUnique({
        where: { id: message.id },
        include: { ticket: true, ticketReply: true, conversation: true },
      });
      assert.equal(linked?.ticket?.id, ticket.id);
      assert.equal(linked?.ticketReply?.id, reply.id);
      assert.equal(linked?.conversation.scopeKey, scopeKey);
      assert.equal(notification.eventKey, `schema-smoke:${suffix}`);
      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (error?.message !== ROLLBACK) throw error;
  } finally {
    const leaked = await prisma.user.findUnique({ where: { openid }, select: { id: true } });
    assert.equal(leaked, null, 'smoke transaction must roll back all temporary data');
    await prisma.$disconnect();
  }
  process.stdout.write('official support schema smoke passed; temporary rows rolled back\n');
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exitCode = 1;
});
