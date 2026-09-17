import { ShopService } from './shop.service';

function checkoutHarness() {
  const merchant = { id: 'merchant-1', userId: 'merchant-user', regionId: 'region-1', status: 'approved', businessType: 'dorm_shop', deliveryMode: 'self_delivery', deliveryFee: 0, packagingFee: 0, minOrderAmount: 0 };
  const cartItem = { id: 'cart-1', productId: 'product-1', skuId: null, quantity: 1, updatedAt: new Date('2026-09-08T00:00:00Z'), product: { id: 'product-1', name: '零食', price: 10, images: [] }, sku: null };
  const tx: any = {
    cart: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    order: { create: jest.fn().mockResolvedValue({ id: 'order-1', items: [], businessType: 'dorm_shop', payAmount: 9 }) },
    couponReceive: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    coupon: { update: jest.fn().mockResolvedValue({}) },
    subsidyLedger: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    merchant: { findUnique: jest.fn().mockResolvedValue(merchant) },
    cart: { findMany: jest.fn().mockResolvedValue([cartItem]) },
    address: { findFirst: jest.fn().mockResolvedValue({ id: 'address-1', regionId: 'region-1', specifiedAddressId: 'region-1', name: '测试用户', phone: '13800000000', fullAddress: '宿舍 101' }) },
    $transaction: jest.fn((handler: any) => handler(tx)),
  };
  const service: any = new ShopService(prisma, {} as any, {} as any);
  service.resolveShopUserCoupon = jest.fn().mockResolvedValue({ discountAmount: 1, receive: { id: 'receive-1' }, coupon: { id: 'coupon-1', name: '测试券', type: 'FULL_REDUCTION' }, campaign: null });
  return { service, tx, prisma, cartItem };
}

describe('shop checkout and cart release guards', () => {
  it('rejects an outdated cart snapshot before reserving inventory or creating an order', async () => {
    const { service, tx, cartItem } = checkoutHarness();
    const liveCart = { ...cartItem, quantity: 2 };
    tx.cart.deleteMany.mockImplementation(async ({ where }: any) => ({ count: where.OR.some((row: any) => row.id === liveCart.id && row.quantity === liveCart.quantity && row.updatedAt === liveCart.updatedAt) ? 1 : 0 }));
    await expect(service.createOrder('merchant-1', 'user-1', { address_id: 'address-1' })).rejects.toThrow('购物车已变化');
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('propagates subsidy ledger failures through the order transaction', async () => {
    const { service, tx } = checkoutHarness();
    tx.subsidyLedger.create.mockRejectedValue(new Error('ledger unavailable'));
    await expect(service.createOrder('merchant-1', 'user-1', { address_id: 'address-1' })).rejects.toThrow('ledger unavailable');
  });

  it('removes an off-sale selection using its saved key without consulting the live catalog', async () => {
    const service: any = Object.create(ShopService.prototype);
    service.prisma = { cart: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await expect(service.removeFromCart('user-1', { product_id: 'product-1', option_id: 'sku-1', attribute_ids: ['b', 'a', 'a'], extra_id: 'c' })).resolves.toEqual({ success: true });
    expect(service.prisma.cart.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', productId: 'product-1', skuId: 'sku-1', selectionKey: 'a|b|c' } });
  });

  it('rejects a changed modifier price rather than charging its stale cart price', async () => {
    const { service, tx } = checkoutHarness();
    tx.productModifierOption = { findUnique: jest.fn().mockResolvedValue({ id: 'extra-1', price: 3, stock: null, status: 'on_sale', group: { productId: 'product-1', status: 'on_sale' } }) };
    await expect(service.reserveOrderInventory(tx, [{ productId: 'product-1', productName: '零食', quantity: 1, modifierSelections: [{ optionId: 'extra-1', additionalPrice: 1 }] }])).rejects.toThrow('价格已变化');
  });
});
