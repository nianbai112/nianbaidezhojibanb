import { IsString, IsOptional, IsEnum, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DeliveryTaskType, DeliveryOrderStatus } from '@prisma/client';

export class CreateDeliveryOrderDto {
  @ApiProperty({ enum: DeliveryTaskType })
  @IsEnum(DeliveryTaskType)
  type: DeliveryTaskType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  pickupAddress: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pickupContact?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pickupPhone?: string;

  @ApiProperty()
  @IsString()
  deliverAddress: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deliverContact?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deliverPhone?: string;

  @ApiProperty()
  @IsNumber()
  price: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  tip?: number = 0;
}

export class UpdateLocationDto {
  @ApiProperty()
  @IsNumber()
  lat: number;

  @ApiProperty()
  @IsNumber()
  lng: number;
}

export class DeliveryQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(DeliveryOrderStatus)
  status?: DeliveryOrderStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(DeliveryTaskType)
  type?: DeliveryTaskType;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @IsNumber()
  pageSize?: number = 20;
}
