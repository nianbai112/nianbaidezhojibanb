import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { AdministrativeDivisionService } from './administrative-division.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { hasDeliveryCoordinates, joinAddressParts } from './address-location';

@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly divisions?: AdministrativeDivisionService) {}

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
    const codes = await this.validateDivisionPayload(dto);
    const data = { ...this.normalizeAddressPayload(dto, { userId }), ...codes };
    const address = await this.withAddressTransaction(async (tx) => {
      if (data.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.create({ data });
    });
    return this.formatAddress(address);
  }

  async updateAddress(addressId: string, userId: string, dto: any) {
    const codes = await this.validateDivisionPayload(dto);
    const updated = await this.withAddressTransaction(async (tx) => {
      // 重试时重新读取，避免旧快照将另一请求已更新的联系人或默认状态写回。
      const address = await tx.address.findUnique({ where: { id: addressId } });
      if (!address || address.userId !== userId) throw new NotFoundException('地址不存在');
      const data = { ...this.normalizeAddressPayload(dto, address), ...codes };
      if (data.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id: addressId }, data });
    });
    return this.formatAddress(updated);
  }

  private async withAddressTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    // 默认地址属于用户全局；Serializable 同时保护“尚无地址”的并发新增。
    // 清旧默认与保存必须一起提交，任何写入失败均由数据库回滚。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        });
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2034') throw error;
      }
    }
    throw new ConflictException({ code: 'ADDRESS_CONCURRENT_UPDATE', message: '地址正在被其他操作修改，请刷新后重试' });
  }

  async removeAddress(addressId: string, userId: string, regionId: string) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException('地址不存在');
    await this.prisma.address.delete({ where: { id: addressId } });
    return { success: true };
  }

  async getDetail(addressId: string, userId: string) {
    if (!userId) throw new NotFoundException('地址不存在');
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    }) || await this.prisma.address.findFirst({
      where: { userId, specifiedAddressId: addressId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
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

  private async validateDivisionPayload(dto: any, current: any = {}) {
    const names = ['provinceCode', 'cityCode', 'districtCode'];
    const aliases = ['province_code', 'city_code', 'district_code'];
    const supplied = names.some((name, i) => dto[name] !== undefined || dto[aliases[i]] !== undefined);
    if (!supplied) {
      // Changed address text cannot silently retain stale shipping area codes.
      const changed = [dto.full_address, dto.fullAddress, dto.address].some(value => value !== undefined && value !== (current.fullAddress || current.detail));
      return changed ? { provinceCode: null, cityCode: null, districtCode: null } : {};
    }
    const values = names.map((name, i) => String(dto[name] ?? dto[aliases[i]] ?? '').trim());
    if (values.every(value => !value)) return { provinceCode: null, cityCode: null, districtCode: null };
    if (!this.divisions) throw new ServiceUnavailableException('省市区服务不可用');
    const result = await this.divisions.validatePath(values[0], values[1], values[2]);
    return { provinceCode: result.provinceCode, cityCode: result.cityCode, districtCode: result.districtCode };
  }

  private normalizeAddressPayload(dto: any, current: any = {}) {
    const name = this.clean(dto.name ?? dto.contact ?? dto.receiver_name ?? current.name);
    const phone = this.clean(dto.phone ?? dto.telNumber ?? current.phone);
    const fullAddress = joinAddressParts([dto.full_address ?? dto.fullAddress ?? dto.address ?? current.fullAddress ?? current.detail]);
    const dormitoryNumber = this.clean(dto.dormitory_number ?? dto.dormitoryNumber ?? current.dormitoryNumber);
    const detail = joinAddressParts(dto.detail ? [dto.detail] : [fullAddress, dormitoryNumber]);
    const latitude = this.toCoordinate(dto.latitude, current.latitude, 90, '纬度');
    const longitude = this.toCoordinate(dto.longitude, current.longitude, 180, '经度');
    if ((latitude === null) !== (longitude === null)) {
      throw new BadRequestException('请在地图上重新选择完整的收货位置');
    }
    if (this.toBoolean(dto.require_location) && !hasDeliveryCoordinates({ latitude, longitude })) {
      throw new BadRequestException('代买收货地址需要地图位置，请先在地图上选择收货点');
    }

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
      specifiedAddressId: this.clean(dto.specified_address_id !== undefined ? dto.specified_address_id : dto.specifiedAddressId !== undefined ? dto.specifiedAddressId : current.specifiedAddressId) || null,
      regionId: this.clean(dto.region_id ?? dto.regionId ?? current.regionId) || null,
      latitude,
      longitude,
      isDefault: this.toBoolean(dto.is_default ?? dto.isDefault ?? current.isDefault ?? false),
    };
  }

  private formatAddress(address: any) {
    const fullAddress = joinAddressParts([address.fullAddress || address.detail]);
    const dormitoryNumber = address.dormitoryNumber || '';
    const specifiedAddress = address.specifiedAddressId
      ? this.formatSpecifiedAddress(address.specifiedAddressId, fullAddress)
      : null;
    return {
      ...address,
      fullAddress,
      detail: joinAddressParts([fullAddress, dormitoryNumber]),
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
    const parts = joinAddressParts([addressText]).split(/\s+/).filter(Boolean);
    const first = parts[0] || addressText || '默认区域';
    const second = parts[1] || '';
    const third = parts.slice(2).join(' ');
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
                full_address: joinAddressParts([region.address, region.name]),
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

  private toCoordinate(value: any, fallback: number | null | undefined, max: number, label: string) {
    if (value === undefined) value = fallback ?? null;
    if (value === null || typeof value === 'string' && value.trim() === '') return null;
    if (typeof value !== 'number' && typeof value !== 'string') throw new BadRequestException(`${label}无效，请在地图上选择位置`);
    const num = Number(value);
    if (!Number.isFinite(num) || Math.abs(num) > max) throw new BadRequestException(`${label}无效，请在地图上选择位置`);
    return num;
  }
}
