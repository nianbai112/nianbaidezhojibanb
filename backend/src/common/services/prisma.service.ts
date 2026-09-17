import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { currentRequestMetadata, redactAuditDetail, requestContext } from '../request-context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    this.$use(async (params, next) => {
      if (params.model === 'AdminOperationLog' && params.action === 'create') {
        const metadata = currentRequestMetadata();
        params.args.data.ip = metadata.ip || params.args.data.ip;
        params.args.data.ua = metadata.ua || params.args.data.ua;
        if (params.args.data.detail) params.args.data.detail = redactAuditDetail(params.args.data.detail);
        const result = await next(params);
        const context = requestContext.getStore();
        if (context) context.operationLogged = true;
        return result;
      }
      return next(params);
    });
  }
  async onModuleInit() {
    if (process.env.SETUP_WIZARD === 'true') {
      return;
    }
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') return;
    const models = Reflect.ownKeys(this).filter(
      (key) => typeof key === 'string' && !key.startsWith('$') && !key.startsWith('_'),
    );
    return Promise.all(models.map((modelKey) => (this as any)[modelKey].deleteMany()));
  }
}
