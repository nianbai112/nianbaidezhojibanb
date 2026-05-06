import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from '../common/services/logger.service';
import { PrismaService } from '../common/services/prisma.service';

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as any).message || exception.message
        : 'Internal server error';

    this.logger.error(
      `${request.method} ${request.url} ${status} - ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : undefined,
      'ExceptionFilter',
    );

    // 写入 ServerLog（500 错误必须记录）
    if (status >= 500) {
      const user = (request as any).user;
      this.prisma.serverLog.create({
        data: {
          level: 'error',
          module: 'system',
          message: typeof message === 'string' ? message : JSON.stringify(message).slice(0, 500),
          detail: {
            stack: exception instanceof Error ? (exception.stack || '').slice(0, 2000) : undefined,
            name: exception instanceof Error ? exception.name : undefined,
          },
          requestId: request.headers['x-request-id'] as string || undefined,
          userId: user?.isAdmin ? undefined : user?.sub,
          adminId: user?.isAdmin ? user?.sub : undefined,
          ip: request.ip || (request.headers['x-forwarded-for'] as string) || undefined,
          userAgent: request.headers['user-agent'] as string || undefined,
          path: request.url,
          method: request.method,
          statusCode: status,
        },
      }).catch(() => {
        // 日志写入失败不影响主流程
      });
    }

    response.status(status).json({
      code: status,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
