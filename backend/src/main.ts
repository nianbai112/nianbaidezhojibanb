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
import {
  getMiniProgramGlobalPrefixExcludes,
  miniProgramApiCompatMiddleware,
} from "./common/middleware/mini-program-api-compat";
import { mallAdminApiCompatMiddleware } from "./common/middleware/mall-admin-api-compat";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // 校园地图清单可包含内联 GeoJSON；只为该管理端路由放宽请求体限制。
  app.use('/admin/campus-map', express.json({ limit: '5mb' }));
  // 小程序代码包素材库走 base64 上传（5MB 图片 ≈ 6.7MB base64），放宽到 10mb。
  app.use('/admin/miniapp/code/assets', express.json({ limit: '10mb' }));

  // 修复：全局前缀 + 排除路径场景下 Nest 内置 JSON 解析器未覆盖排除路由，
  // 导致 @Body() 为 undefined（urlencoded 正常、application/json 失效）。
  // 显式注册 JSON/urlencoded 解析，幂等且与 Nest 默认行为一致。
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // ===========================================================================
  // 安全
  // ===========================================================================
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
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

  // AUD-P0-001: 生产环境绝不允许 CORS 回退到 true（完全放开跨域）。
  // 非生产环境在未配置 CORS_ORIGIN 时才回退 true，方便本地开发。
  const corsOrigin: any = isProduction
    ? corsOrigins?.length
      ? corsOrigins
      : (() => {
          logger.error(
            'FATAL: CORS_ORIGIN must be set to specific origin(s) in production. ' +
              'Application will now exit.',
          );
          process.exit(1);
        })()
    : corsOrigins?.length
      ? corsOrigins
      : true;
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // ---- 本地上传文件访问 ----
  // 后台运营上传的图片会落到 backend/uploads 下，开发环境和生产反代都需要能直接预览。
  // 注意：外部对象存储不走这里；这里仅兜底本地存储 provider。
  const uploadDirs = Array.from(
    new Set(
      [
        process.env.UPLOAD_DIR,
        "uploads",
        path.join("public", "uploads"),
        path.join("backend", "public", "uploads"),
        path.join("backend", "uploads"),
      ]
        .filter(Boolean)
        .map((dir) => path.resolve(process.cwd(), dir as string)),
    ),
  );

  for (const dir of uploadDirs) {
    app.use(
      "/uploads",
      express.static(dir, {
        maxAge: isProduction ? "7d" : 0,
        fallthrough: true,
        setHeaders: (res) => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
          // 上传资源本身不执行脚本，移除全局 CSP，避免小程序开发者工具误拦截图片预览。
          res.removeHeader("Content-Security-Policy");
        },
      }),
    );
  }

  // ---- 小程序 /api 前缀源码级兼容 ----
  // 前端统一补 /api；后端早期小程序接口大多挂在根路径。
  // 这里只转换已知小程序根路径，保留 /api/mall、/api/rating 等真实 /api 模块。
  app.use(miniProgramApiCompatMiddleware);

  // ---- 旧小程序商城管理端路径兼容 ----
  // 小程序源码中商户后台相关接口使用 /api/mall/...，而新后台管理接口集中在
  // /mall/... 下。这里只重写“管理/商户端”子路径，避免影响真实用户端
  // /api/mall/products/list、/api/mall/cart 等接口。
  app.use(mallAdminApiCompatMiddleware);

  // ---- 旧后台页面路径兼容 ----
  // 后端已提供 /admin/finance/* 财务接口，不能再把它们收口到 /admin/*。
  // 排行相关旧路径仍统一映射到新的推荐/排行接口。
  app.use((req: any, _res: any, next: any) => {
    const [pathname, search = ""] = req.url.split("?");
    let rewritten = pathname;

    if (pathname === "/admin/ranking/rules") {
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
	      ...getMiniProgramGlobalPrefixExcludes(),
        // Only non-mini-program legacy routes stay here. Mini-program roots are
        // derived from the single compatibility list above.
      "balance-recharge",
      "balance-recharge/(.*)",
      "api/(.*)",
      "dashboard",
      "dashboard/(.*)",
      "admin/(.*)",
      "mall/(.*)",
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
