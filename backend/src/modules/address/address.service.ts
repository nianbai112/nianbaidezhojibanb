import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  async getAddresses(userId: string, regionId: string) {
    return this.prisma.address.findMany({ where: { userId, ...(regionId && { regionId }) }, orderBy: { isDefault: 'desc', createdAt: 'desc' } });
  }

  async addAddress(userId: string, dto: any) {
    if (dto.is_default) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return this.prisma.address.create({ data: { userId, name: dto.name, phone: dto.phone, detail: dto.detail, regionId: dto.region_id, latitude: dto.latitude, longitude: dto.longitude, isDefault: dto.is_default || false } });
  }

  async updateAddress(addressId: string, userId: string, dto: any) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException('地址不存在');
    if (dto.is_default) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return this.prisma.address.update({ where: { id: addressId }, data: { name: dto.name, phone: dto.phone, detail: dto.detail, latitude: dto.latitude, longitude: dto.longitude, isDefault: dto.is_default } });
  }

  async removeAddress(addressId: string, userId: string, regionId: string) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException('地址不存在');
    await this.prisma.address.delete({ where: { id: addressId } });
    return { success: true };
  }

  async getDetail(addressId: string) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address) throw new NotFoundException('地址不存在');
    return address;
  }
}
