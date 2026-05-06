import { IsString, IsOptional, IsEnum, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentChannel, TransactionType } from '@prisma/client';

export class RechargeDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ enum: PaymentChannel })
  @IsEnum(PaymentChannel)
  channel: PaymentChannel;
}

export class WithdrawDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ enum: PaymentChannel })
  @IsEnum(PaymentChannel)
  channel: PaymentChannel;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  account: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  realName?: string;
}

export class QueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @IsNumber()
  pageSize?: number = 20;
}
