import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  pageSize?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  startAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  endAt?: string;
}

export class CreateAlipayTransferDto {
  @IsString()
  payeeAccount: string;

  @IsOptional()
  @IsString()
  payeeName?: string;

  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class RegionBalanceQueryDto extends QueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  regionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  type?: string;
}

export class RegionBalanceAdjustDto {
  @IsString()
  regionId: string;

  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  description?: string;
}
