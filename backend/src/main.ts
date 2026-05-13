import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import compression from "compression";
import express from "express";
import path from "node:path";
import { AppModule } from "./app.module";
import { TransformInterceptor } from "./interceptors/transform.interceptor";
import { LoggerService } from "./common/services/logger.service";
import { WsNativeGateway } from "./modules/websocket/ws-native.gateway";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // ===========================================================================
  // 安全
  // ===========================================================================
  app.use(helmet());
  app.use(compression());

  // ---- CORS ----
  // env.validation 已在启动时校验 CORS_ORIGIN 在 production 下不得为 'true' 或 '*'
  // 此处做二次运行时防护：如果 production 下 CORS_ORIGIN 未正确配置，拒绝启动
  const corsOriginEnv = process.env.CORS_ORIGIN;
  const corsOrigins = corsOriginEnv
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isProduction = process.env.NODE_ENV === "production";
  const isSetupWizard = process.env.SETUP_WIZARD === "true";

  if (isProduction && !isSetupWizard) {
    if (!corsOriginEnv || corsOriginEnv === "true" || corsOriginEnv === "*") {
      logger.error(
        "FATAL: CORS_ORIGIN is required in production and must be a specific origin " +
          '(e.g. "https://yuntingzhe.cn"), not "true" or "*". ' +
          "Application will now exit.",
      );
      process.exit(1);
    }
  }

  app.enableCors({
    origin: isProduction
      ? isSetupWizard
        ? corsOrigins?.length
          ? corsOrigins
          : true
        : corsOrigins
      : corsOrigins?.length
        ? corsOrigins
        : true,
    credentials: true,
  });

  // ---- 本地上传文件访问 ----
  // 后台运营上传的图片会落到 backend/uploads 下，开发环境和生产反代都需要能直接预览。
  // 注意：外部对象存储不走这里；这里仅兜底本地存储 provider。
  const uploadDir = process.env.UPLOAD_DIR || "uploads";
  app.use(
    "/uploads",
    express.static(path.resolve(process.cwd(), uploadDir), {
      maxAge: isProduction ? "7d" : 0,
      fallthrough: true,
    }),
  );

  // ---- 旧小程序商城管理端路径兼容 ----
  // 小程序源码中商户后台相关接口使用 /api/mall/...，而新后台管理接口集中在
  // /mall/... 下。这里只重写“管理/商户端”子路径，避免影响真实用户端
  // /api/mall/products/list、/api/mall/cart 等接口。
  app.use((req: any, _res: any, next: any) => {
    const [pathname, search = ""] = req.url.split("?");
    let rewritten = pathname;

    if (pathname.startsWith("/api/mall/admin/products/")) {
      rewritten = pathname.replace("/api/mall/admin/products/", "/mall/products/admin/");
    } else if (pathname.startsWith("/api/mall/admin/categories")) {
      rewritten = pathname.replace("/api/mall/", "/mall/");
    } else if (
      /^\/api\/mall\/(products|refunds|reviews|promotions|freight|distributor|merchants)\/admin(\/|$)/.test(
        pathname,
      )
    ) {
      rewritten = pathname.replace("/api/mall/", "/mall/");
    }

    if (rewritten !== pathname) {
      req.url = `${rewritten}${search ? `?${search}` : ""}`;
    }
    next();
  });

  // ---- 旧后台页面路径兼容 ----
  // 新页面中还保留了少量 /admin/finance/*、/admin/ranking/* 请求。
  // 后端真实实现已在 /admin/* 与 /admin/recommend/*，这里统一收口，避免重复控制器。
  app.use((req: any, _res: any, next: any) => {
    const [pathname, search = ""] = req.url.split("?");
    let rewritten = pathname;

    if (pathname.startsWith("/admin/finance/")) {
      rewritten = pathname.replace("/admin/finance/", "/admin/");
    } else if (pathname === "/admin/ranking/rules") {
      rewritten = "/admin/rankings";
    } else if (pathname.startsWith("/admin/ranking/rules/")) {
      rewritten = pathname.replace("/admin/ranking/rules/", "/admin/rankings/");
    } else if (pathname.startsWith("/admin/ranking/slots/")) {
      rewritten = pathname.replace("/admin/ranking/slots/", "/admin/recommend/slots/");
    }

    if (rewritten !== pathname) {
      req.url = `${rewritten}${search ? `?${search}` : ""}`;
    }
    next();
  });

  // ---- ValidationPipe ----
  // production 下严格拒绝未声明的字段，防止批量赋值攻击
  // 注意：开启 forbidNonWhitelisted 后，DTO 中所有需要接收的字段都须用装饰器显式声明，
  // 若某些接口报 400 "property X should not exist"，请检查对应 DTO 是否遗漏 @ApiProperty / 装饰器
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: isProduction,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ---- 全局拦截器（条件包装——小程序路径跳过） ----
  app.useGlobalInterceptors(new TransformInterceptor());

  // ---- Swagger 文档 ----
  // production 下禁用 Swagger，避免暴露 API 结构和测试入口
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle("灵萌 / Xiaoyi API")
      .setDescription("区域/校园生活服务平台 API 文档")
      .setVersion("1.0.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  // ---- 全局前缀（兼容小程序根路径 + 后台 /api 路径） ----
  const apiPrefix = process.env.API_PREFIX || "/api/v1";
  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      // 小程序接口保持根路径
      "wx-auth/(.*)",
      "regions/(.*)",
      "regions",
      "schools/(.*)",
      "schools",
      "posts/(.*)",
      "posts",
      "comments/(.*)",
      "comments",
      "likes/(.*)",
      "likes",
      "favorites/(.*)",
      "favorites",
      "user-followers/(.*)",
      "circle-members/(.*)",
      "topics",
      "topics/(.*)",
      "circles/(.*)",
      "circles",
      "circle/(.*)",
      "status/location",
      "merchants/(.*)",
      "merchants",
      "categories",
      "categories/(.*)",
      "products",
      "products/(.*)",
      "product-options",
      "product-options/(.*)",
      "order",
      "order/(.*)",
      "shopping-cart",
      "shopping-cart/(.*)",
      "addresses",
      "addresses/(.*)",
      "merchant",
      "merchant/(.*)",
      "second-hand",
      "second-hand/(.*)",
      "coupons",
      "coupons/(.*)",
      "post-management",
      "post-management/(.*)",
      "squats",
      "squats/(.*)",
      "delivery-products",
      "delivery-products/(.*)",
      "specs",
      "specs/(.*)",
      "errand/(.*)",
      "delivery/(.*)",
      "wxpay/(.*)",
      "finance/(.*)",
      "alipay-transfer",
      "alipay-transfer/(.*)",
      "messages/(.*)",
      "wechat/(.*)",
      "wechat",
      "notifications/(.*)",
      "upload",
      "upload/(.*)",
      "auth/(.*)",
      "activity/(.*)",
      "activities/(.*)",
      "explosivesel/(.*)",
      "topnotes/(.*)",
      "api/(.*)",
      "config/(.*)",
      "dashboard",
      "dashboard/(.*)",
      "region",
      "region/(.*)",
      "admin/(.*)",
      "mall/(.*)",
      "setup/(.*)",
      "healthz",
      "AnonymousIdentity/(.*)",
      "notifications",
    ],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  // ---- 原生 WebSocket（给小程序用） ----
  const wsNative = app.get(WsNativeGateway);
  const httpServer = app.getHttpServer();
  wsNative.attach(httpServer);

  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Native WebSocket available at: ws://localhost:${port}/ws-native`);
  logger.log(`Environment: ${process.env.NODE_ENV || "development"}`);
}
bootstrap();
