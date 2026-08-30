import "./config/bootstrap-env";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { LoggerService } from "./common/services/logger.service";
import { WorkerModule } from "./worker.module";

function isSetupWizardMode() {
  const installed = String(process.env.DB_IS_INSTALLED || "").toLowerCase();
  const wizard = String(process.env.SETUP_WIZARD || "").toLowerCase();
  return installed !== "1" || wizard === "true";
}

async function bootstrap() {
  process.env.SERVICE_ROLE = "worker";
  const bootstrapLogger = new Logger("WorkerBootstrap");

  if (isSetupWizardMode()) {
    bootstrapLogger.log(
      "Worker is idle until setup completes (DB_IS_INSTALLED=1, SETUP_WIZARD=false)",
    );
    const idleTimer = setInterval(() => undefined, 60_000);
    const stop = () => {
      clearInterval(idleTimer);
      process.exit(0);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return;
  }

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.enableShutdownHooks();
  const logger = app.get(LoggerService);
  app.useLogger(logger);
  logger.log(`Worker service started: pid=${process.pid}`);
}

bootstrap().catch((error) => {
  new Logger("WorkerBootstrap").error(
    `Worker failed to start: ${error?.message || error}`,
    error?.stack,
  );
  process.exit(1);
});
