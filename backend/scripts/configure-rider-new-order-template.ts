import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { validateErrandNewOrderTemplate } from '../src/modules/wechat/wechat-template-contracts';

// Default is offline validation only. --apply saves the template but never changes notification policy.
async function main() {
  const filename = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  if (!filename) throw new Error('用法: ts-node scripts/configure-rider-new-order-template.ts <配置.json> [--apply]');
  const input = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
  const error = validateErrandNewOrderTemplate(input.templateId, input.fieldMapping);
  if (error) throw new Error(error);
  const regionId = typeof input.regionId === 'string' && input.regionId.trim() ? input.regionId.trim() : null;
  const data = {
    platformType: 'official', templateType: 'new_errand_order', templateId: input.templateId,
    title: '新订单通知', regionId, fieldMapping: input.fieldMapping,
    defaultPage: '/pagesA/Grab/Grab?status=awaiting_delivery', enabled: true,
  };
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ mode: 'validate-only', template: data, message: '校验通过，未连接数据库、未发送消息' }, null, 2));
    return;
  }
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async tx => {
      if (regionId && !await tx.region.findUnique({ where: { id: regionId }, select: { id: true } })) throw new Error('指定校区不存在');
      const rows = await tx.wechatTemplateConfig.findMany({ where: { platformType: data.platformType, templateType: data.templateType, regionId } });
      if (rows.length > 1) throw new Error('同一校区存在重复的新单模板，请先处理重复配置');
      if (rows[0]) await tx.wechatTemplateConfig.update({ where: { id: rows[0].id }, data });
      else await tx.wechatTemplateConfig.create({ data });
    });
    console.log('已保存新订单模板，未更改通知开关。需在后台启用服务号通知总开关和“骑手新订单”场景后才会发送。未发送测试消息。');
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
