import { PurchaseService } from "./purchase.service";

describe("代买货款返还到骑手", () => {
  const order = { id: "p", type: "purchase", status: "completed", riderId: "rider", orderNo: "DM1" };
  const purchase = {
    id: "p",
    order,
    reimbursementStatus: "pending",
    approvedGoodsCents: 500,
    stops: [{ status: "purchased", auditStatus: "approved", actualCents: 500 }],
    refunds: [],
    changes: [],
  };
  const setup = (payout: any) => {
    const tx: any = {
      errandAssigneeMutex: { upsert: jest.fn() },
      errandOrder: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn() },
      errandPurchase: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue(purchase) },
      orderAppeal: { findFirst: jest.fn().mockResolvedValue(null) },
      deliveryRiskEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      errandSettlementHold: { findUnique: jest.fn().mockResolvedValue(null) },
      wallet: { upsert: jest.fn().mockResolvedValue({ balance: 5 }) },
      walletTransaction: { create: jest.fn() },
      purchaseEvent: { create: jest.fn() },
    };
    const riderPayout: any = {
      reserve: jest.fn().mockResolvedValue(payout),
      kick: jest.fn(),
      announce: jest.fn(),
    };
    const service: any = Object.create(PurchaseService.prototype);
    service.prisma = { $transaction: (run: any) => run(tx) };
    service.riderPayout = riderPayout;
    return { service, tx, riderPayout };
  };

  test("入账钱包后在同一事务排队微信转账，到账时再通知", async () => {
    const { service, tx, riderPayout } = setup({ status: "QUEUED", reason: "" });
    await service.reimburse("p");
    expect(tx.wallet.upsert).toHaveBeenCalled();
    expect(riderPayout.reserve).toHaveBeenCalledWith(tx, order, 5, "purchase_principal");
    expect(riderPayout.kick).toHaveBeenCalled();
    expect(riderPayout.announce).not.toHaveBeenCalled();
  });

  test("不能转微信时立即通知骑手钱在钱包", async () => {
    const { service, riderPayout } = setup({ status: "SKIPPED", reason: "你还没有开通微信自动收款" });
    await service.reimburse("p");
    expect(riderPayout.kick).not.toHaveBeenCalled();
    expect(riderPayout.announce).toHaveBeenCalledWith(expect.objectContaining({
      userId: "rider",
      kind: "purchase_principal",
      amountFen: 500,
      outcome: "WALLET",
      reason: "你还没有开通微信自动收款",
      eventKey: "purchase_reimbursed:p",
    }));
  });
});
