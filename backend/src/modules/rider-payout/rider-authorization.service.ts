import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AuthService } from '../auth/auth.service';
import { WechatTransferError, WechatTransferGateway } from './wechat-transfer.gateway';
import { authorizationNo, payoutKindText, payoutSettings, payoutStatusText } from './rider-payout.policy';
import { isMiniappOpenid } from '../../common/wechat-identity';

const BASE = '/v3/fund-app/mch-transfer/user-confirm-authorization';

@Injectable()
export class RiderAuthorizationService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService,
    private readonly gateway: WechatTransferGateway, private readonly auth: AuthService) {}

  async settings() {
    const row = await this.prisma.config.findUnique({ where: { key: 'wechat_pay' } });
    return payoutSettings(row?.value);
  }

  async status(userId: string) {
    const settings = await this.settings();
    let row: any = null;
    let records: any[] = [];
    try {
      [row, records] = await Promise.all([
        this.prisma.riderWechatAuthorization.findUnique({ where: { userId } }),
        this.prisma.riderWechatPayout.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      ]);
    } catch (error: any) { if (settings.enabled || error.code !== 'P2021') throw error; }
    const publicRecords = records.map(p => ({ id: p.id, orderNo: p.orderNo, kind: p.kind, kindText: payoutKindText(p.kind), amount: p.amountFen / 100,
      status: p.status, statusText: payoutStatusText(p.status), reason: p.reason || '', createdAt: p.createdAt }));
    if (!settings.enabled) return { available: false, authorized: false, message: '平台暂未开启微信自动到账', records: publicRecords };
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { openid: true, phone: true } });
    const runtime = await this.gateway.runtime();
    const sameIdentity = !!row && isMiniappOpenid(user?.openid) && row.openid === user.openid && row.appid === runtime.appid &&
      row.mchid === runtime.mchid && row.sceneId === settings.sceneId;
    return {
      available: true, bound: !!user?.phone && isMiniappOpenid(user?.openid),
      authorized: sameIdentity && row?.state === 'TAKING_EFFECT' && !!row?.authorizationId,
      enabled: sameIdentity && row?.enabled === true,
      state: sameIdentity ? row?.state || 'NOT_AUTHORIZED' : 'NOT_AUTHORIZED',
      maxAmount: settings.maxFen / 100,
      message: '开通后，符合结算条件的新跑腿收入和审核通过的代买垫付货款将自动转入微信零钱；历史余额仍按原提现流程处理。',
      records: publicRecords,
    };
  }

  async start(userId: string, loginCode: string) {
    const identity = await this.auth.verifyMiniappIdentity(userId, loginCode);
    if (!isMiniappOpenid(identity.openid)) throw new BadRequestException('请先使用微信小程序绑定收款账号');
    const result = await this.redis.withRenewingLock(`rider-auth:${userId}`, 45, async () => {
      const settings = await this.settings();
      if (!settings.enabled) throw new BadRequestException('平台暂未开启微信自动到账');
      const cfg = await this.gateway.runtime();
      if (identity.appid !== cfg.appid) throw new BadRequestException('小程序身份配置不一致');
      let notify: URL;
      try { notify = new URL(settings.notifyUrl); } catch { throw new BadRequestException('微信收款授权回调地址未配置'); }
      if (notify.protocol !== 'https:' || notify.search || notify.hash || notify.username || notify.password) {
        throw new BadRequestException('授权回调地址必须为不带参数的 HTTPS 地址');
      }
      let row = await this.prisma.riderWechatAuthorization.findUnique({ where: { userId } });
      if (row && row.state !== 'CLOSED' && (row.appid !== cfg.appid || row.mchid !== cfg.mchid ||
        row.openid !== identity.openid || row.sceneId !== settings.sceneId)) {
        throw new BadRequestException('收款账号或商户配置已变化，请先关闭旧授权');
      }
      if (row && row.state !== 'CLOSED') {
        await this.syncRow(row, cfg);
        row = await this.prisma.riderWechatAuthorization.findUnique({ where: { userId } });
      }
      if (row?.state === 'TAKING_EFFECT') {
        await this.prisma.riderWechatAuthorization.update({ where: { userId }, data: { enabled: true } });
        return { authorized: true };
      }
      if (row?.state === 'WAIT_USER_CONFIRM' && row.packageInfo && Date.now() - row.requestedAt.getTime() < 86400000) {
        await this.prisma.riderWechatAuthorization.update({ where: { userId }, data: { enabled: true } });
        return { authorized: false, mchId: cfg.mchid, appId: cfg.appid, package: row.packageInfo };
      }
      if (!row || row.state === 'CLOSED' || Date.now() - row.requestedAt.getTime() >= 86400000) {
        const data = { outAuthorizationNo: authorizationNo(), authorizationId: null, packageInfo: null,
          appid: cfg.appid, mchid: cfg.mchid, openid: identity.openid, sceneId: settings.sceneId,
          state: 'WAIT_USER_CONFIRM', enabled: true, requestedAt: new Date() };
        row = await this.prisma.riderWechatAuthorization.upsert({ where: { userId },
          create: { userId, ...data }, update: data });
      }
      // Persist the business number BEFORE contacting WeChat; timeouts reuse it.
      const response = await this.gateway.request('POST', BASE, {
        out_authorization_no: row.outAuthorizationNo, appid: row.appid, openid: row.openid,
        transfer_scene_id: row.sceneId, user_display_name: `骑手${userId.slice(-12)}`,
        authorization_notify_url: notify.toString(),
      }, cfg);
      await this.apply(row, response);
      if (!response.package_info && response.state !== 'TAKING_EFFECT') throw new BadRequestException('授权参数未就绪，请刷新后重试');
      return { authorized: response.state === 'TAKING_EFFECT', mchId: cfg.mchid,
        appId: cfg.appid, package: response.package_info };
    });
    if (!result) throw new BadRequestException('收款授权正在处理中，请稍后重试');
    return result;
  }

  private async apply(row: any, data: any) {
    if (data.out_authorization_no !== row.outAuthorizationNo ||
      (data.mch_id && data.mch_id !== row.mchid) || (data.appid && data.appid !== row.appid) ||
      (data.openid && data.openid !== row.openid) || (data.transfer_scene_id && data.transfer_scene_id !== row.sceneId) ||
      !['WAIT_USER_CONFIRM', 'TAKING_EFFECT', 'CLOSED'].includes(data.state) ||
      (data.state === 'TAKING_EFFECT' && !data.authorization_id)) throw new BadRequestException('微信授权结果与当前账号不一致');
    await this.prisma.riderWechatAuthorization.updateMany({
      where: { userId: row.userId, outAuthorizationNo: row.outAuthorizationNo,
        // Delayed pending responses must not downgrade an effective grant.
        state: data.state === 'WAIT_USER_CONFIRM' ? 'WAIT_USER_CONFIRM' : { not: 'CLOSED' } },
      data: { state: data.state, authorizationId: data.authorization_id || row.authorizationId,
        packageInfo: data.package_info || row.packageInfo,
        ...(data.state === 'CLOSED' ? { enabled: false, packageInfo: null } : {}) },
    });
  }

  async syncRow(row: any, cfg: any) {
    if (row.mchid !== cfg.mchid || row.appid !== cfg.appid) throw new BadRequestException('商户配置已变化，无法查询旧授权');
    try {
      const result = await this.gateway.request('GET', `${BASE}/out-authorization-no/${row.outAuthorizationNo}`, undefined, cfg);
      await this.apply(row, result);
    } catch (error) {
      if (!(error instanceof WechatTransferError && error.code === 'NOT_FOUND' && row.state === 'WAIT_USER_CONFIRM')) throw error;
    }
  }

  async refresh(userId: string) {
    const row = await this.prisma.riderWechatAuthorization.findUnique({ where: { userId } });
    if (row && row.state !== 'CLOSED') await this.syncRow(row, await this.gateway.runtime());
    return this.status(userId);
  }

  async close(userId: string) {
    const result = await this.redis.withRenewingLock(`rider-auth:${userId}`, 45, async () => {
      const row = await this.prisma.riderWechatAuthorization.findUnique({ where: { userId } });
      if (!row) return { success: true };
      // Stop reserving new income even if the remote close request times out.
      await this.prisma.riderWechatAuthorization.update({ where: { userId }, data: { enabled: false } });
      if (row.state !== 'CLOSED') {
        const cfg = await this.gateway.runtime();
        if (cfg.mchid !== row.mchid || cfg.appid !== row.appid) throw new BadRequestException('已暂停自动到账，请在微信支付收款设置中解除旧授权');
        await this.gateway.request('POST', `${BASE}/out-authorization-no/${row.outAuthorizationNo}/close`, undefined, cfg);
        await this.syncRow(row, cfg);
      }
      return { success: true };
    });
    if (!result) throw new BadRequestException('授权正在处理中，请稍后重试');
    return result;
  }

  async notification(raw: Buffer, headers: any) {
    const { cfg, data } = await this.gateway.decodeNotification(raw, headers);
    if (!data.out_authorization_no) throw new BadRequestException('授权通知缺少单号');
    const row = await this.prisma.riderWechatAuthorization.findUnique({ where: { outAuthorizationNo: data.out_authorization_no } });
    // Old replaced authorizations cannot change the current recipient.
    if (row) await this.syncRow(row, cfg);
  }
}
