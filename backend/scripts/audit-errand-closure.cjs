#!/usr/bin/env node

const OPEN_APPEAL_STATUSES = ['resolved', 'rejected', 'closed', 'cancelled', 'completed'];
const KNOWN_BUDGET_UNITS = new Set(['yuan', 'cny', 'fen', 'cent']);

function ids(rows, key = 'id') {
  return [...new Set(rows.map(row => row?.[key]).filter(Boolean))].sort();
}

function jsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function auditErrandClosure(prisma, now = new Date()) {
  const refundCutoff = new Date(now.getTime() - 30 * 60 * 1000);
  const [arrived, completedWithoutSource, completedOrders, refunding, settlements, customBudgetTasks] = await Promise.all([
    prisma.errandOrder.findMany({
      where: { status: 'arrived', receiptConfirmDeadline: null },
      select: { id: true },
    }),
    prisma.errandOrder.findMany({
      where: { status: 'completed', receiptConfirmedBy: null },
      select: { id: true },
    }),
    prisma.errandOrder.findMany({
      where: { status: 'completed' },
      select: { id: true },
    }),
    prisma.errandOrder.findMany({
      where: { refundStatus: 'refunding', updatedAt: { lte: refundCutoff } },
      select: { id: true },
    }),
    prisma.riderSettlement.findMany({
      where: { remark: { not: null } },
      select: { id: true, remark: true },
    }),
    prisma.errandOrderTask.findMany({
      where: { budgetAmount: { not: null } },
      select: { orderId: true, budgetAmount: true, metadata: true },
    }),
  ]);

  const completedIds = ids(completedOrders);
  const openAppeals = completedIds.length
    ? await prisma.orderAppeal.findMany({
        where: {
          orderType: { in: ['errand', 'errand_order'] },
          orderId: { in: completedIds },
          status: { notIn: OPEN_APPEAL_STATUSES },
        },
        select: { orderId: true },
      })
    : [];

  const settlementIds = ids(settlements);
  const settlementItems = settlementIds.length
    ? await prisma.riderSettlementItem.findMany({
        where: { settlementId: { in: settlementIds } },
        select: { settlementId: true, orderType: true, orderId: true },
      })
    : [];
  const linkedSources = new Set(settlementItems.map(item => `${item.settlementId}:${item.orderType}:${item.orderId}`));
  const unlinkedSources = [];
  for (const settlement of settlements) {
    const sources = jsonObject(settlement.remark).sourceOrders;
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      const orderId = source?.id || source?.orderId;
      const orderType = source?.source === 'errand_order' ? 'errand' : source?.source;
      if (orderId && orderType === 'errand' && !linkedSources.has(`${settlement.id}:errand:${orderId}`)) {
        unlinkedSources.push(orderId);
      }
    }
  }

  const unknownBudgetOrders = customBudgetTasks.filter(task => {
    if (Number(task.budgetAmount || 0) <= 0) return false;
    const metadata = jsonObject(task.metadata);
    const unit = String(metadata.budget_unit || metadata.budgetUnit || '').toLowerCase();
    return !KNOWN_BUDGET_UNITS.has(unit);
  });

  const orderIds = {
    arrivedWithoutDeadline: ids(arrived),
    completedWithoutReceiptSource: ids(completedWithoutSource),
    completedWithOpenAppeal: ids(openAppeals, 'orderId'),
    refundingOver30Minutes: ids(refunding),
    settlementSourcesWithoutItems: [...new Set(unlinkedSources)].sort(),
    unknownCustomBudgetUnits: ids(unknownBudgetOrders, 'orderId'),
  };
  return {
    generatedAt: now.toISOString(),
    counts: Object.fromEntries(Object.entries(orderIds).map(([key, value]) => [key, value.length])),
    orderIds,
  };
}

async function main() {
  try { process.loadEnvFile?.(`${__dirname}/../.env`); } catch {}
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    console.log(JSON.stringify(await auditErrandClosure(prisma), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { auditErrandClosure };
