#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const OFFICIAL_OPENID = 'lingmeng_official_message_account';
const ACTIVE_TICKET_STATUSES = ['pending', 'processing', 'waiting_user'];
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

function duplicateGroups(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(row.id);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, count: ids.length, conversationIds: ids }))
    .sort((a, b) => b.count - a.count);
}

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  try {
    const official = await prisma.user.findUnique({
      where: { openid: OFFICIAL_OPENID },
      select: { id: true, openid: true, userType: true },
    });

    const [sourceCounts, activeTicketGroups, officialConversations, botUsers] = await Promise.all([
      Promise.all([
        prisma.officialAssistantMessage.count(),
        prisma.notification.count(),
        prisma.message.count(),
        prisma.assistantTicket.count(),
        prisma.assistantTicketReply.count(),
      ]),
      prisma.assistantTicket.groupBy({
        by: ['userId', 'regionId'],
        where: { status: { in: ACTIVE_TICKET_STATUSES } },
        _count: { _all: true },
      }),
      official
        ? readAll((cursor) => prisma.conversation.findMany({
            where: { type: 'private', members: { some: { userId: official.id } } },
            orderBy: { id: 'asc' },
            take: PAGE_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              regionId: true,
              members: { select: { userId: true, unreadCount: true } },
            },
          }))
        : Promise.resolve([]),
      prisma.user.findMany({
        where: { userType: 4, openid: { not: OFFICIAL_OPENID } },
        select: { id: true, openid: true },
      }),
    ]);

    const duplicateSupportConversations = official
      ? duplicateGroups(officialConversations, (conversation) => {
          const userId = conversation.members.find((member) => member.userId !== official.id)?.userId;
          return userId ? `${conversation.regionId || 'NO_REGION'}:${userId}` : '';
        })
      : [];

    const ordinaryBotIds = new Set(botUsers.map((user) => user.id));
    const ordinaryBotConversations = ordinaryBotIds.size
      ? await prisma.conversation.count({
          where: { type: 'private', members: { some: { userId: { in: [...ordinaryBotIds] } } } },
        })
      : 0;

    const officialConversationIds = officialConversations.map((conversation) => conversation.id);
    const [officialMessages, ticketReplies] = await Promise.all([
      officialConversationIds.length
        ? readAll((cursor) => prisma.message.findMany({
            where: {
              conversationId: { in: officialConversationIds },
              senderId: { not: official?.id },
              clientMessageId: { not: null },
            },
            orderBy: { id: 'asc' },
            take: PAGE_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: { id: true, senderId: true, clientMessageId: true, conversationId: true },
          }))
        : Promise.resolve([]),
      readAll((cursor) => prisma.assistantTicketReply.findMany({
        where: { clientMessageId: { not: null } },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, ticketId: true, senderId: true, clientMessageId: true },
      })),
    ]);

    const messageKeys = new Set(officialMessages.map((row) => `${row.senderId}:${row.clientMessageId}`));
    const replyKeys = new Set(ticketReplies.map((row) => `${row.senderId}:${row.clientMessageId}`));
    const messagesWithoutTicketProjection = officialMessages.filter(
      (row) => !replyKeys.has(`${row.senderId}:${row.clientMessageId}`),
    );
    const repliesWithoutMessage = ticketReplies.filter(
      (row) => !messageKeys.has(`${row.senderId}:${row.clientMessageId}`),
    );

    const report = {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      officialAccount: official || null,
      persistentSources: {
        officialAssistantMessages: sourceCounts[0],
        notifications: sourceCounts[1],
        messages: sourceCounts[2],
        assistantTickets: sourceCounts[3],
        assistantTicketReplies: sourceCounts[4],
      },
      risks: {
        usersWithMultipleActiveTicketsInRegion: activeTicketGroups
          .filter((group) => group._count._all > 1)
          .map((group) => ({ userId: group.userId, regionId: group.regionId, count: group._count._all })),
        duplicateSupportConversationGroups: duplicateSupportConversations,
        officialMessagesWithoutTicketProjection: {
          count: messagesWithoutTicketProjection.length,
          samples: messagesWithoutTicketProjection.slice(0, 20),
        },
        ticketRepliesWithoutOfficialMessage: {
          count: repliesWithoutMessage.length,
          samples: repliesWithoutMessage.slice(0, 20),
        },
        ordinaryBotAccounts: botUsers.length,
        privateConversationsContainingOrdinaryBots: ordinaryBotConversations,
        officialConversationUnreadTotal: officialConversations.reduce(
          (total, conversation) => total + conversation.members.reduce((sum, member) => sum + (member.unreadCount || 0), 0),
          0,
        ),
      },
    };

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`官方助手只读审计失败：${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
