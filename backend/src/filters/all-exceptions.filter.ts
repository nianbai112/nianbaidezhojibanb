import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from '../common/services/logger.service';
import { PrismaService } from '../common/services/prisma.service';
import { PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime/library';

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

    let message: string;
    if (exception instanceof HttpException) {
      const resp = exception.getResponse() as any;
      message = resp.message || exception.message;
      if (
        status === HttpStatus.TOO_MANY_REQUESTS &&
        typeof message === 'string' &&
        (message.includes('Too Many Requests') || message.includes('ThrottlerException'))
      ) {
        message = request.url.startsWith('/upload') || request.url.includes('/upload')
          ? '上传太频繁，请稍后再试'
          : '请求太频繁，请稍后再试';
      }
    } else if (exception instanceof PrismaClientKnownRequestError) {
      message = this.mapPrismaError(exception);
    } else if (exception instanceof PrismaClientValidationError) {
      message = '提交内容格式异常，请刷新页面后重试';
    } else {
      message = '服务器内部错误，请稍后重试';
    }

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

  private mapPrismaError(error: PrismaClientKnownRequestError): string {
    switch (error.code) {
      case 'P2025':
        return '记录不存在或已被删除，请刷新后重试';
      case 'P2002':
        return '数据已存在，唯一字段冲突，请检查重复项';
      case 'P2003':
        return '存在关联数据，无法删除或更新';
      case 'P2014':
        return '关联关系冲突，请检查数据依赖';
      case 'P2021':
        return '数据库表不存在，请检查迁移是否已执行';
      case 'P2022':
        return '数据库字段不存在，请检查迁移是否已执行';
      case 'P2016':
        return '查询条件不合法';
      case 'P2000':
        return '输入数据超长或格式错误';
      default:
        return '数据库操作失败，请联系技术支持';
    }
  }
}
