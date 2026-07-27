#!/usr/bin/env node

const DAY_MS = 24 * 60 * 60 * 1000;

async function runBackfill(args = [], prisma) {
  const applied = args.includes('--apply');
  const [arrivedOrders, completedOrders] = await Promise.all([
    prisma.errandOrder.findMany({
      where: { status: 'arrived', receiptConfirmDeadline: null },
      select: { id: true, deliverTime: true, updatedAt: true },
    }),
    prisma.errandOrder.findMany({
      where: {
        status: 'completed',
        OR: [{ receiptConfirmedAt: null }, { receiptConfirmedBy: null }],
      },
      select: {
        id: true,
        receiptConfirmedAt: true,
        receiptConfirmedBy: true,
        completeTime: true,
        updatedAt: true,
      },
    }),
  ]);

  const result = {
    applied,
    arrivedCandidates: arrivedOrders.length,
    completedCandidates: completedOrders.length,
    updatedArrived: 0,
    updatedCompleted: 0,
  };
  if (!applied) return result;

  for (const order of arrivedOrders) {
    const anchor = order.deliverTime || order.updatedAt;
    if (!anchor) continue;
    const updated = await prisma.errandOrder.updateMany({
      where: { id: order.id, status: 'arrived', receiptConfirmDeadline: null },
      data: { receiptConfirmDeadline: new Date(new Date(anchor).getTime() + DAY_MS) },
    });
    result.updatedArrived += updated.count;
  }

  for (const order of completedOrders) {
    const data = {};
    const where = { id: order.id, status: 'completed' };
    if (!order.receiptConfirmedAt) {
      const receiptConfirmedAt = order.completeTime || order.updatedAt;
      if (!receiptConfirmedAt) continue;
      data.receiptConfirmedAt = receiptConfirmedAt;
      where.receiptConfirmedAt = null;
    }
    if (!order.receiptConfirmedBy) data.receiptConfirmedBy = 'legacy';
    if (!order.receiptConfirmedBy) where.receiptConfirmedBy = null;
    if (!Object.keys(data).length) continue;
    const updated = await prisma.errandOrder.updateMany({
      where,
      data,
    });
    result.updatedCompleted += updated.count;
  }
  return result;
}

async function main() {
  try { process.loadEnvFile?.(`${__dirname}/../.env`); } catch {}
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const result = await runBackfill(process.argv.slice(2), prisma);
    console.log(JSON.stringify(result, null, 2));
    if (!result.applied) console.error('dry-run：未修改数据；确认结果后使用 --apply 执行。');
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

module.exports = { runBackfill };
