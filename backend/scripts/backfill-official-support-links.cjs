#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const OFFICIAL_OPENID = 'lingmeng_official_message_account';
const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 1000;

function loadLocalEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').replaceAll('\r', '').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function readAll(fetchPage) {
  const rows = [];
  let cursor;
  for (;;) {
    const page = await fetchPage(cursor);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    cursor = page[page.length - 1].id;
  }
}

async function runBatches(prisma, operations, batchSize = 100) {
  for (let index = 0; index < operations.length; index += batchSize) {
    await prisma.$transaction(operations.slice(index, index + batchSize));
  }
}

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  try {
    const official = await prisma.user.findFirst({
      where: { OR: [{ systemRole: 'OFFICIAL_ASSISTANT' }, { openid: OFFICIAL_OPENID }] },
      select: { id: true, openid: true, systemRole: true },
    });
    if (!official) throw new Error('未找到固定官方助手账号');

    const conversations = await readAll((cursor) => prisma.conversation.findMany({
      where: { type: 'private', members: { some: { userId: official.id } } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        regionId: true,
        scopeKey: true,
        members: { select: { userId: true } },
      },
    }));

    const conversationsByScope = new Map();
    const skipped = [];
    for (const conversation of conversations) {
      const userId = conversation.members.find((member) => member.userId !== official.id)?.userId;
      if (!userId || !conversation.regionId) {
        skipped.push({ kind: 'conversation', id: conversation.id, reason: 'missing-user-or-region' });
        continue;
      }
      const key = `support:${conversation.regionId}:${userId}`;
      const group = conversationsByScope.get(key) || [];
      group.push(conversation);
      conversationsByScope.set(key, group);
    }

    const scopeUpdates = [];
    const uniqueConversationByScope = new Map();
    for (const [scopeKey, group] of conversationsByScope.entries()) {
      if (group.length !== 1) {
        skipped.push({ kind: 'scope', scopeKey, reason: 'duplicate-conversations', conversationIds: group.map((item) => item.id) });
        continue;
      }
      const conversation = group[0];
      uniqueConversationByScope.set(scopeKey, conversation);
      if (!conversation.scopeKey) scopeUpdates.push({ id: conversation.id, scopeKey });
      if (conversation.scopeKey && conversation.scopeKey !== scopeKey) {
        skipped.push({ kind: 'scope', id: conversation.id, reason: 'existing-scope-mismatch', current: conversation.scopeKey, expected: scopeKey });
        uniqueConversationByScope.delete(scopeKey);
      }
    }

    const tickets = await readAll((cursor) => prisma.assistantTicket.findMany({
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, regionId: true, conversationId: true },
    }));
    const ticketConversation = new Map();
    const ticketUpdates = [];
    for (const ticket of tickets) {
      const scopeKey = `support:${ticket.regionId}:${ticket.userId}`;
      const conversation = uniqueConversationByScope.get(scopeKey);
      if (!conversation) {
        skipped.push({ kind: 'ticket', id: ticket.id, reason: 'no-unambiguous-conversation', scopeKey });
        continue;
      }
      if (ticket.conversationId && ticket.conversationId !== conversation.id) {
        skipped.push({ kind: 'ticket', id: ticket.id, reason: 'existing-conversation-mismatch', current: ticket.conversationId, expected: conversation.id });
        continue;
      }
      ticketConversation.set(ticket.id, conversation.id);
      if (!ticket.conversationId) ticketUpdates.push({ id: ticket.id, conversationId: conversation.id });
    }

    const replies = await readAll((cursor) => prisma.assistantTicketReply.findMany({
      where: { messageId: null, clientMessageId: { not: null }, senderId: { not: null } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, ticketId: true, senderId: true, clientMessageId: true },
    }));
    const replyLinks = [];
    for (const reply of replies) {
      const expectedConversationId = ticketConversation.get(reply.ticketId);
      if (!expectedConversationId) {
        skipped.push({ kind: 'reply', id: reply.id, reason: 'ticket-conversation-ambiguous' });
        continue;
      }
      const message = await prisma.message.findUnique({
        where: { senderId_clientMessageId: { senderId: reply.senderId, clientMessageId: reply.clientMessageId } },
        select: { id: true, conversationId: true, ticketId: true },
      });
      if (!message || message.conversationId !== expectedConversationId) {
        skipped.push({ kind: 'reply', id: reply.id, reason: message ? 'message-conversation-mismatch' : 'message-not-found' });
        continue;
      }
      if (message.ticketId && message.ticketId !== reply.ticketId) {
        skipped.push({ kind: 'reply', id: reply.id, reason: 'message-ticket-mismatch', messageId: message.id });
        continue;
      }
      replyLinks.push({ replyId: reply.id, messageId: message.id, ticketId: reply.ticketId, messageNeedsTicket: !message.ticketId });
    }

    const plan = {
      mode: APPLY ? 'apply' : 'dry-run',
      officialAccountId: official.id,
      updates: {
        conversationScopeKeys: scopeUpdates.length,
        ticketConversationLinks: ticketUpdates.length,
        replyMessageLinks: replyLinks.length,
        messageTicketLinks: replyLinks.filter((item) => item.messageNeedsTicket).length,
      },
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 100),
    };
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

    if (!APPLY) {
      process.stdout.write('未写入数据库；确认审计结果后使用 --apply。\n');
      return;
    }

    await runBatches(prisma, scopeUpdates.map((item) => prisma.conversation.update({
      where: { id: item.id },
      data: { scopeKey: item.scopeKey },
    })));
    await runBatches(prisma, ticketUpdates.map((item) => prisma.assistantTicket.update({
      where: { id: item.id },
      data: { conversationId: item.conversationId },
    })));
    await runBatches(prisma, replyLinks.flatMap((item) => [
      prisma.assistantTicketReply.update({ where: { id: item.replyId }, data: { messageId: item.messageId } }),
      ...(item.messageNeedsTicket
        ? [prisma.message.update({ where: { id: item.messageId }, data: { ticketId: item.ticketId } })]
        : []),
    ]));
    process.stdout.write('确定性关联已写入；所有歧义记录均保持原样。\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`官方助手关联回填失败：${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
