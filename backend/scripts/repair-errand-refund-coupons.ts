import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { restoreErrandOrderCoupon } from '../src/modules/errand/errand-coupon-restoration';
import { inspectRefundedErrandCoupon } from '../src/modules/errand/errand-refund-coupon-repair';
export { inspectRefundedErrandCoupon } from '../src/modules/errand/errand-refund-coupon-repair';

// Review one confirmed full refund at a time. Never issue another payment refund.
export async function repairRefundedErrandCoupon(db: any, orderNo: string, apply = false) {
  const inspected = await inspectRefundedErrandCoupon(db, orderNo);
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    orderNo,
    couponReceiveId: inspected.receive?.id || null,
    originalExpiry: inspected.receive?.coupon?.endAt || null,
    action: inspected.receive ? 'restore_coupon' : 'no_used_coupon',
  };
  if (!apply || !inspected.receive) return report;
  await db.$transaction(async (tx: any) => {
    // Re-check payment proof and coupon binding inside the write transaction.
    const current = await inspectRefundedErrandCoupon(tx, orderNo);
    if (current.receive) await restoreErrandOrderCoupon(tx, current.order);
  });
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('用法: npx ts-node scripts/repair-errand-refund-coupons.ts --order-no=订单号 [--apply]');
    console.log('默认只核查；--apply 才补券。不发起退款，不延长优惠券有效期。使用当前 DATABASE_URL。');
    return;
  }
  const orderNo = args.find(arg => arg.startsWith('--order-no='))?.slice('--order-no='.length).trim();
  if (!orderNo || args.some(arg => arg !== '--apply' && !arg.startsWith('--order-no='))) {
    throw new Error('必须指定 --order-no=订单号；先不带 --apply 核查结果');
  }
  const envFile = path.resolve(__dirname, '..', '.env');
  if (!process.env.DATABASE_URL && fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^DATABASE_URL=(.*)$/);
      if (match) process.env.DATABASE_URL = match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  if (!process.env.DATABASE_URL) throw new Error('未配置 DATABASE_URL');
  const db = new PrismaClient();
  try {
    console.log(JSON.stringify(await repairRefundedErrandCoupon(db, orderNo, args.includes('--apply')), null, 2));
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
