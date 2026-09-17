import { ErrandService } from './errand.service';

describe('rider transfer decision summary', () => {
  it('includes pickup, delivery and compensation without revealing the customer receipt code', async () => {
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = {
      transferRequest: { findMany: jest.fn().mockResolvedValue([{ id: 'transfer', orderId: 'order', fromRiderId: 'from', toRiderId: 'to', status: 'pending' }]) },
      errandOrder: { findMany: jest.fn().mockResolvedValue([{ id: 'order', orderNo: 'E-1', riderId: 'from', status: 'accepted', title: '取快递', pickupAddress: '南门驿站', deliverAddress: '3栋门厅', description: '请轻放', price: 4, tip: 1, payAmount: 5, receiptCode: '123456' }]) },
      regionRider: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const result = await service.getTransferRequests('to');
    expect(service.prisma.transferRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { toRiderId: 'to', status: 'pending' } }));
    expect(result.requests[0].order).toMatchObject({ order_no: 'E-1', title: '取快递', pickup_address: '南门驿站', delivery_address: '3栋门厅', delivery_fee: '5.00', description: '请轻放' });
    expect(result.requests[0].order).not.toHaveProperty('receiptCode');
    expect(result.requests[0].order).not.toHaveProperty('receipt_code');
  });
});
