import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AddressService } from './address.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('地址')
@Controller()
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get('addresses')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getAddresses(@CurrentUser('sub') userId: string, @Query('region_id') regionId: string) {
    return this.addressService.getAddresses(userId, regionId);
  }

  @Post('addresses')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  addAddress(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.addressService.addAddress(userId, dto);
  }

  @Put('addresses/:addressId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  updateAddress(@Param('addressId') addressId: string, @CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.addressService.updateAddress(addressId, userId, dto);
  }

  @Delete('addresses/:addressId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  removeAddress(@Param('addressId') addressId: string, @CurrentUser('sub') userId: string, @Query('region_id') regionId: string) {
    return this.addressService.removeAddress(addressId, userId, regionId);
  }

  @Get('addresses/specified/detail/:addressId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  getSpecifiedDetail(@Param('addressId') addressId: string) {
    return this.addressService.getDetail(addressId);
  }
}
