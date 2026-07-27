import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  async getAddresses(userId: string, regionId: string) {
    const [rows, specifiedAddresses] = await Promise.all([
      this.prisma.address.findMany({
        where: { userId, ...(regionId && { regionId }) },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }),
      this.getSpecifiedAddressTree(regionId),
    ]);
    const addresses = rows.map((row) => this.formatAddress(row));
    return {
      data: { addresses, specified_addresses: specifiedAddresses },
      addresses,
      specified_addresses: specifiedAddresses,
      defaultAddress: addresses.find((item) => item.is_default) || addresses[0] || null,
    };
  }

  async addAddress(userId: string, dto: any) {
    const data = this.normalizeAddressPayload(dto, { userId });
    if (data.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const address = await this.prisma.address.create({ data });
    return this.formatAddress(address);
  }

  async updateAddress(addressId: string, userId: string, dto: any) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException('地址不存在');
    const data = this.normalizeAddressPayload(dto, address);
    if (data.isDefault) {
      await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const updated = await this.prisma.address.update({ where: { id: addressId }, data });
    return this.formatAddress(updated);
  }

  async removeAddress(addressId: string, userId: string, regionId: string) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException('地址不存在');
    await this.prisma.address.delete({ where: { id: addressId } });
    return { success: true };
  }

  async getDetail(addressId: string) {
    const address =
      (await this.prisma.address.findUnique({ where: { id: addressId } }).catch(() => null)) ||
      (await this.prisma.address.findFirst({ where: { specifiedAddressId: addressId } }));
    if (address) return { data: this.formatSpecifiedAddress(address.specifiedAddressId || address.id, address.fullAddress || address.detail) };

    const region = await this.prisma.region.findUnique({
      where: { id: addressId },
      select: { id: true, name: true, address: true },
    }).catch(() => null);
    if (region) {
      return { data: this.formatSpecifiedAddress(region.id, region.address || region.name) };
    }

    throw new NotFoundException('地址不存在');
  }

  private normalizeAddressPayload(dto: any, current: any = {}) {
    const name = this.clean(dto.name ?? dto.contact ?? dto.receiver_name ?? current.name);
    const phone = this.clean(dto.phone ?? dto.telNumber ?? current.phone);
    const fullAddress = this.clean(dto.full_address ?? dto.fullAddress ?? dto.address ?? current.fullAddress ?? current.detail);
    const dormitoryNumber = this.clean(dto.dormitory_number ?? dto.dormitoryNumber ?? current.dormitoryNumber);
    const detail = this.clean(dto.detail ?? [fullAddress, dormitoryNumber].filter(Boolean).join(' ') ?? current.detail);

    if (!current.id && (!name || !phone || !detail)) {
      throw new BadRequestException('请完整填写联系人、手机号和地址');
    }

    return {
      userId: current.userId,
      name,
      phone,
      detail,
      gender: this.toInt(dto.gender, current.gender ?? 0),
      fullAddress: fullAddress || detail,
      dormitoryNumber: dormitoryNumber || null,
      specifiedAddressId: this.clean(dto.specified_address_id ?? dto.specifiedAddressId ?? current.specifiedAddressId) || null,
      regionId: this.clean(dto.region_id ?? dto.regionId ?? current.regionId) || null,
      latitude: this.toOptionalNumber(dto.latitude, current.latitude),
      longitude: this.toOptionalNumber(dto.longitude, current.longitude),
      isDefault: this.toBoolean(dto.is_default ?? dto.isDefault ?? current.isDefault ?? false),
    };
  }

  private formatAddress(address: any) {
    const fullAddress = address.fullAddress || address.detail || '';
    const dormitoryNumber = address.dormitoryNumber || '';
    const specifiedAddress = address.specifiedAddressId
      ? this.formatSpecifiedAddress(address.specifiedAddressId, fullAddress)
      : null;
    return {
      ...address,
      contact: address.name,
      gender: address.gender || 0,
      full_address: fullAddress,
      dormitory_number: dormitoryNumber,
      specified_address_id: address.specifiedAddressId || null,
      specified_address: specifiedAddress,
      is_default: address.isDefault,
    };
  }

  private formatSpecifiedAddress(id: string, addressText: string) {
    const parts = (addressText || '').split(/\s+/).filter(Boolean);
    const first = parts[0] || addressText || '默认区域';
    const second = parts[1] || '';
    const third = parts.slice(2).join(' ') || (second ? '' : first);
    return {
      id,
      first_level_address: first,
      second_level_address: second,
      third_level_address: third,
      // 平台外卖目前采用统一配送费，必须与 ShopService 的服务端实收保持一致。
      delivery_cost: 2,
    };
  }

  private async getSpecifiedAddressTree(regionId?: string) {
    if (!regionId) return [];
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true, name: true, address: true },
    }).catch(() => null);
    if (!region) return [];

    const detail = this.formatSpecifiedAddress(region.id, region.address || region.name);
    return [
      {
        name: detail.first_level_address,
        children: [
          {
            name: detail.second_level_address || region.name,
            children: [
              {
                id: detail.id,
                name: detail.third_level_address || region.name,
              },
            ],
          },
        ],
      },
    ];
  }

  private clean(value: any) {
    return typeof value === 'string' ? value.trim() : value;
  }

  private toBoolean(value: any) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  private toInt(value: any, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  private toOptionalNumber(value: any, fallback?: number | null) {
    if (value === undefined) return fallback ?? null;
    if (value === null || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback ?? null;
  }
}
