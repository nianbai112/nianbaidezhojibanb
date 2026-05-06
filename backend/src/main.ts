import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import compression from "compression";
import { AppModule } from "./app.module";
import { TransformInterceptor } from "./interceptors/transform.interceptor";
import { LoggerService } from "./common/services/logger.service";

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
      "posts/(.*)",
      "posts",
      "comments/(.*)",
      "comments",
      "likes/(.*)",
      "likes",
      "favorites/(.*)",
      "favorites",
      "user-followers/(.*)",
      "circles/(.*)",
      "circles",
      "circle/(.*)",
      "merchants/(.*)",
      "merchants",
      "categories",
      "categories/(.*)",
      "products",
      "products/(.*)",
      "order/(.*)",
      "shopping-cart/(.*)",
      "errand/(.*)",
      "delivery/(.*)",
      "wxpay/(.*)",
      "finance/(.*)",
      "messages/(.*)",
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
      "setup/(.*)",
      "healthz",
      "AnonymousIdentity/(.*)",
      "notifications",
    ],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV || "development"}`);
}
bootstrap();
