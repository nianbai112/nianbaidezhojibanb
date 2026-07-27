import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsNumber,
  IsString,
  Length,
} from "class-validator";

export class CreateOrderAppealDto {
  @IsIn(["order", "errand"]) orderType: "order" | "errand";
  @IsString() orderId: string;
  @IsIn(["delivery_issue", "service_issue", "item_issue", "other"])
  appealType: string;
  @IsString() @Length(5, 500) description: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) evidenceImages?: string[];
  @IsOptional() @IsString() @Length(5, 32) contactPhone?: string;
}

export class UpdateOrderAppealDto {
  @IsOptional()
  @IsIn(["pending", "processing", "waiting_user", "resolved", "rejected"])
  status?: string;
  @IsOptional() @IsString() @Length(1, 500) reply?: string;
  @IsOptional()
  @IsIn(["no_action", "full_refund", "partial_refund", "compensate_user", "penalize_rider"])
  resolutionAction?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) refundAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) riderPenaltyAmount?: number;
}

export class SupplementOrderAppealDto {
  @IsString() @Length(1, 500) content: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) evidenceImages?: string[];
}

export class MerchantReplyOrderAppealDto {
  @IsString() @Length(1, 500) content: string;
}
