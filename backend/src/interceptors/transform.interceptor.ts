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
  "/regions",
  "/regions/",
  "/posts/",
  "/posts",
  "/comments/",
  "/comments",
  "/likes/",
  "/likes",
  "/favorites/",
  "/favorites",
  "/user-followers/",
  "/circles/",
  "/circles",
  "/circle/",
  "/merchants/",
  "/merchants",
  "/categories",
  "/products",
  "/order/",
  "/shopping-cart/",
  "/errand/",
  "/delivery/",
  "/wxpay/",
  "/finance/",
  "/messages/",
  "/notifications/",
  "/upload",
  "/setup",
  "/setup/",
  "/healthz",
  "/auth/me",
  "/auth/user/",
  "/activity/",
  "/explosivesel/",
  "/topnotes/",
  "/api/mall/",
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
