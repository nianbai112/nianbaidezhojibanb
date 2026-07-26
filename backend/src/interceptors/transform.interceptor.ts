import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

export interface Response<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
}

/** 小程序路径列表——这些路径不包装 { code, message, data } */
const MINI_PROGRAM_PREFIXES = [
  "/wx-auth/",
  "/rider-app/",
  "/regions",
  "/regions/",
  "/schools",
  "/schools/",
  "/region",
  "/region/",
  "/posts/",
  "/posts",
  "/comments/",
  "/comments",
  "/likes/",
  "/likes",
  "/favorites/",
  "/favorites",
  "/user-followers/",
  "/circle-members/",
  "/topics",
  "/topics/",
  "/circles/",
  "/circles",
  "/circle/",
  "/status/location",
  "/merchants/",
  "/merchants",
  "/categories",
  "/products",
  "/product-options",
  "/product-options/",
  "/order",
  "/order/",
  "/shopping-cart",
  "/shopping-cart/",
  "/addresses",
  "/addresses/",
  "/merchant",
  "/merchant/",
  "/second-hand",
  "/second-hand/",
  "/coupons",
  "/coupons/",
  "/post-management",
  "/post-management/",
  "/squats",
  "/squats/",
  "/delivery-products",
  "/delivery-products/",
  "/specs",
  "/specs/",
  "/errand/",
  "/delivery/",
  "/wxpay/",
  "/finance/",
  "/alipay-transfer",
  "/alipay-transfer/",
  "/messages/",
  "/notifications/",
  "/upload",
  "/setup",
  "/setup/",
  "/healthz",
  "/auth/",
  "/admin/",
  "/dashboard",
  "/dashboard/",
  "/auth/me",
  "/auth/user/",
  "/activity/",
  "/explosivesel/",
  "/topnotes/",
  "/api/",
  "/config/",
  "/api/mall/",
  "/mall/",
  "/config/ai",
  "/AnonymousIdentity/",
];

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T> | T> {
    const request = context.switchToHttp().getRequest();
    const url = request.url || "";

    // 小程序路径跳过包装，直接返回原始数据
    const isMiniProgram = MINI_PROGRAM_PREFIXES.some((prefix) =>
      url.startsWith(prefix),
    );
    if (isMiniProgram) {
      return next.handle();
    }

    // 后台 API 统一包装
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: "success",
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
