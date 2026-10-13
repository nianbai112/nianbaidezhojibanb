import { AdministrativeDivisionService } from './administrative-division.service';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';

@Module({
  imports: [ConfigModule],
  exports: [AdministrativeDivisionService],
  controllers: [AddressController],
  providers: [AddressService, AdministrativeDivisionService],
})
export class AddressModule {}
