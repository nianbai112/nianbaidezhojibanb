import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ============ 1. 管理员角色 ============
  const superAdminRole = await prisma.adminRole.upsert({
    where: { code: 'super_admin' },
    update: {},
    create: {
      name: '超级管理员',
      code: 'super_admin',
      description: '系统超级管理员，拥有所有权限',
      isSystem: true,
      sortOrder: 0,
    },
  });

  const platformOpsRole = await prisma.adminRole.upsert({
    where: { code: 'platform_ops' },
    update: {},
    create: {
      name: '平台运营',
      code: 'platform_ops',
      description: '平台运营人员，管理内容和用户',
      isSystem: true,
      sortOrder: 1,
    },
  });

  const financeRole = await prisma.adminRole.upsert({
    where: { code: 'finance' },
    update: {},
    create: {
      name: '财务人员',
      code: 'finance',
      description: '财务管理，审核提现和退款',
      isSystem: true,
      sortOrder: 2,
    },
  });

  const auditorRole = await prisma.adminRole.upsert({
    where: { code: 'auditor' },
    update: {},
    create: {
      name: '审核人员',
      code: 'auditor',
      description: '内容审核，帖子/商家/评论审核',
      isSystem: true,
      sortOrder: 3,
    },
  });

  const cityAgentRole = await prisma.adminRole.upsert({
    where: { code: 'city_agent' },
    update: {},
    create: {
      name: '城市代理管理员',
      code: 'city_agent',
      description: '城市代理，管理区域内容',
      isSystem: true,
      sortOrder: 4,
    },
  });

  const merchantAdminRole = await prisma.adminRole.upsert({
    where: { code: 'merchant_admin' },
    update: {},
    create: {
      name: '商家管理员',
      code: 'merchant_admin',
      description: '商家后台管理员',
      isSystem: true,
      sortOrder: 5,
    },
  });

  console.log('✅ Admin roles created');

  // ============ 2. 权限项 ============
  const permissionDefs = [
    // 仪表盘
    { code: 'dashboard:view', name: '查看仪表盘', module: 'dashboard', action: 'view' },

    // 用户管理
    { code: 'user:view', name: '查看用户', module: 'user', action: 'view' },
    { code: 'user:edit', name: '编辑用户', module: 'user', action: 'edit' },
    { code: 'user:ban', name: '封禁用户', module: 'user', action: 'ban' },
    { code: 'user:delete', name: '删除用户', module: 'user', action: 'delete' },
    { code: 'user:cert', name: '学生认证审核', module: 'user', action: 'cert' },
    { code: 'user:balance', name: '用户余额管理', module: 'user', action: 'balance' },
    { code: 'user:level', name: '用户等级管理', module: 'user', action: 'level' },

    // 内容管理
    { code: 'post:view', name: '查看帖子', module: 'post', action: 'view' },
    { code: 'post:audit', name: '审核帖子', module: 'post', action: 'audit' },
    { code: 'post:delete', name: '删除帖子', module: 'post', action: 'delete' },
    { code: 'post:top', name: '置顶帖子', module: 'post', action: 'top' },

    // 评论
    { code: 'comment:view', name: '查看评论', module: 'comment', action: 'view' },
    { code: 'comment:audit', name: '审核评论', module: 'comment', action: 'audit' },
    { code: 'comment:delete', name: '删除评论', module: 'comment', action: 'delete' },

    // 举报
    { code: 'report:handle', name: '处理举报', module: 'report', action: 'handle' },
    { code: 'circle:manage', name: '圈子管理', module: 'circle', action: 'manage' },
    { code: 'community:view', name: '查看社群管理', module: 'community', action: 'view' },
    { code: 'community:edit', name: '编辑社群', module: 'community', action: 'edit' },
    { code: 'community:config', name: '社群配置', module: 'community', action: 'config' },
    { code: 'topic:manage', name: '话题管理', module: 'topic', action: 'manage' },

    // 商城
    { code: 'merchant:view', name: '查看商家', module: 'merchant', action: 'view' },
    { code: 'merchant:audit', name: '审核商家', module: 'merchant', action: 'audit' },
    { code: 'merchant:batch', name: '批量操作商家', module: 'merchant', action: 'batch' },
    { code: 'merchant:printer', name: '管理打印机配置', module: 'merchant', action: 'printer' },
    { code: 'merchant:price', name: '管理商品加价', module: 'merchant', action: 'price' },
    { code: 'merchant:collection', name: '管理商品采集', module: 'merchant', action: 'collection' },
    { code: 'merchant:config', name: '管理商家配置', module: 'merchant', action: 'config' },
    { code: 'product:view', name: '查看商品', module: 'product', action: 'view' },
    { code: 'product:edit', name: '管理商品', module: 'product', action: 'edit' },
    { code: 'product:batch', name: '批量操作商品', module: 'product', action: 'batch' },

    // 评价
    { code: 'review:manage', name: '评价管理', module: 'review', action: 'manage' },

    // 促销
    { code: 'promotion:manage', name: '促销管理', module: 'promotion', action: 'manage' },

    // 运费模板
    { code: 'freight:manage', name: '运费模板管理', module: 'freight', action: 'manage' },

    // 订单
    { code: 'order:view', name: '查看订单', module: 'order', action: 'view' },
    { code: 'order:refund', name: '退款处理', module: 'order', action: 'refund' },

    // 财务
    { code: 'finance:view', name: '查看财务', module: 'finance', action: 'view' },
    { code: 'withdraw:view', name: '查看提现', module: 'withdraw', action: 'view' },
    { code: 'withdraw:audit', name: '审核提现', module: 'withdraw', action: 'audit' },
    { code: 'withdraw:complete', name: '打款确认', module: 'withdraw', action: 'complete' },
    { code: 'finance:reconciliation', name: '对账管理', module: 'finance', action: 'reconciliation' },
    { code: 'finance:transfer', name: '支付宝转账', module: 'finance', action: 'transfer' },
    { code: 'finance:withdraw', name: '提现管理', module: 'finance', action: 'withdraw' },

    // 区域
    { code: 'region:view', name: '查看区域', module: 'region', action: 'view' },
    { code: 'region:edit', name: '管理区域', module: 'region', action: 'edit' },

    // 管理员
    { code: 'admin:view', name: '查看管理员', module: 'admin', action: 'view' },
    { code: 'admin:create', name: '创建管理员', module: 'admin', action: 'create' },
    { code: 'admin:edit', name: '编辑管理员', module: 'admin', action: 'edit' },
    { code: 'admin:delete', name: '删除管理员', module: 'admin', action: 'delete' },
    { code: 'admin:forcePasswordReset', name: '强制重置密码', module: 'admin', action: 'forcePasswordReset' },
    { code: 'admin:unlock', name: '解锁账号', module: 'admin', action: 'unlock' },

    // 系统
    { code: 'system:config', name: '系统配置', module: 'system', action: 'config' },
    { code: 'system:logs', name: '查看日志', module: 'system', action: 'logs' },
    { code: 'system:upload', name: '文件管理', module: 'system', action: 'upload' },
    { code: 'system:admin', name: '管理员管理', module: 'system', action: 'admin' },

    // 城市代理
    { code: 'city:view', name: '查看城市代理', module: 'city_agent', action: 'view' },
    { code: 'city:audit', name: '审核城市代理', module: 'city_agent', action: 'audit' },
    { code: 'city:settlement', name: '城市代理结算', module: 'city_agent', action: 'settlement' },

    // 配送
    { code: 'rider:view', name: '查看骑手', module: 'rider', action: 'view' },
    { code: 'rider:audit', name: '审核骑手', module: 'rider', action: 'audit' },
    { code: 'delivery:view', name: '查看配送', module: 'delivery', action: 'view' },
    { code: 'errand:config:view', name: '查看跑腿配置', module: 'errand', action: 'config:view' },
    { code: 'errand:config:update', name: '更新跑腿配置', module: 'errand', action: 'config:update' },
    { code: 'errand:item-size:view', name: '查看物品大小', module: 'errand', action: 'item-size:view' },
    { code: 'errand:item-size:create', name: '创建物品大小', module: 'errand', action: 'item-size:create' },
    { code: 'errand:item-size:update', name: '更新物品大小', module: 'errand', action: 'item-size:update' },
    { code: 'errand:item-size:delete', name: '删除物品大小', module: 'errand', action: 'item-size:delete' },
    { code: 'errand:pickup-point:view', name: '查看取件点', module: 'errand', action: 'pickup-point:view' },
    { code: 'errand:pickup-point:create', name: '创建取件点', module: 'errand', action: 'pickup-point:create' },
    { code: 'errand:pickup-point:update', name: '更新取件点', module: 'errand', action: 'pickup-point:update' },
    { code: 'errand:pickup-point:delete', name: '删除取件点', module: 'errand', action: 'pickup-point:delete' },
    { code: 'errand:stats:view', name: '查看跑腿统计', module: 'errand', action: 'stats:view' },
    { code: 'errand:view', name: '查看跑腿管理', module: 'errand', action: 'view' },
    { code: 'errand:config', name: '配置跑腿管理', module: 'errand', action: 'config' },

    // 运营
    { code: 'coupon:view', name: '查看优惠券', module: 'coupon', action: 'view' },
    { code: 'coupon:edit', name: '管理优惠券', module: 'coupon', action: 'edit' },
    { code: 'coupon:records', name: '查看优惠券使用记录', module: 'coupon', action: 'records' },
    { code: 'activity:view', name: '查看活动', module: 'activity', action: 'view' },
    { code: 'activity:edit', name: '管理活动', module: 'activity', action: 'edit' },
    { code: 'activity:audit', name: '审核活动订单', module: 'activity', action: 'audit' },
    { code: 'activity:order', name: '查看活动订单', module: 'activity', action: 'order' },
    { code: 'groupbuy:view', name: '查看团购', module: 'groupbuy', action: 'view' },
    { code: 'groupbuy:edit', name: '管理团购', module: 'groupbuy', action: 'edit' },
    { code: 'groupbuy:order', name: '订单核销退款', module: 'groupbuy', action: 'order' },
    { code: 'groupbuy:config', name: '配置团购', module: 'groupbuy', action: 'config' },

    // 消息
    { code: 'message:view', name: '查看消息', module: 'message', action: 'view' },
    { code: 'content:manage', name: '消息违规管理', module: 'content', action: 'manage' },

    // 审核中心
    { code: 'audit:view', name: '查看审核中心', module: 'audit', action: 'view' },

    // 内容审核（新增）
    { code: 'content:view', name: '查看内容', module: 'content', action: 'view' },
    { code: 'content:edit', name: '编辑内容', module: 'content', action: 'edit' },
    { code: 'content:audit', name: '审核内容', module: 'content', action: 'audit' },
    { code: 'content:delete', name: '删除内容', module: 'content', action: 'delete' },

    // 用户标签（新增）
    { code: 'user:tag', name: '用户标签管理', module: 'user', action: 'tag' },

    // 财务结算（新增）
    { code: 'finance:settlement', name: '结算管理', module: 'finance', action: 'settlement' },

    // 配置管理（新增）
    { code: 'config:view', name: '查看配置', module: 'config', action: 'view' },
    { code: 'config:edit', name: '编辑配置', module: 'config', action: 'edit' },

    // 机器人管理（新增）
    { code: 'bot:view', name: '查看机器人', module: 'bot', action: 'view' },
    { code: 'bot:edit', name: '编辑机器人', module: 'bot', action: 'edit' },
    { code: 'bot:task', name: '机器人任务', module: 'bot', action: 'task' },
    { code: 'bot:list', name: '查看机器人列表', module: 'bot', action: 'list' },
    { code: 'robot:view', name: '查看机器人运营', module: 'robot', action: 'view' },
    { code: 'robot:post', name: '机器人发帖', module: 'robot', action: 'post' },
    { code: 'robot:comment', name: '机器人评论', module: 'robot', action: 'comment' },

    // 运维中心（新增）
    { code: 'ops:view', name: '查看运维中心', module: 'ops', action: 'view' },
    { code: 'ops:restart', name: '重启后端服务', module: 'ops', action: 'restart' },

    // 二手交易（新增）
    { code: 'secondhand:view', name: '查看二手交易', module: 'secondhand', action: 'view' },
    { code: 'secondhand:audit', name: '审核二手交易', module: 'secondhand', action: 'audit' },
    { code: 'secondhand:config', name: '二手配置', module: 'secondhand', action: 'config' },

    // 漂流瓶
    { code: 'driftBottle:list', name: '查看漂流瓶列表', module: 'driftBottle', action: 'list' },
    { code: 'driftBottle:delete', name: '删除漂流瓶', module: 'driftBottle', action: 'delete' },

    // 打卡管理
    { code: 'punchIn:location:list', name: '查看打卡点列表', module: 'punchIn', action: 'location:list' },
    { code: 'punchIn:location:create', name: '创建打卡点', module: 'punchIn', action: 'location:create' },
    { code: 'punchIn:location:update', name: '更新打卡点', module: 'punchIn', action: 'location:update' },
    { code: 'punchIn:location:delete', name: '删除打卡点', module: 'punchIn', action: 'location:delete' },
    { code: 'punchIn:record:list', name: '查看打卡记录', module: 'punchIn', action: 'record:list' },
    { code: 'punchIn:list', name: '查看打卡管理列表', module: 'punchIn', action: 'list' },

    // 评分管理
    { code: 'rating:view', name: '查看评分管理', module: 'rating', action: 'view' },
    { code: 'rating:edit', name: '管理评分', module: 'rating', action: 'edit' },
    { code: 'rating:audit', name: '审核评分', module: 'rating', action: 'audit' },
    { code: 'rating:config', name: '评分配置', module: 'rating', action: 'config' },
    { code: 'rating:list', name: '查看评分列表', module: 'rating', action: 'list' },

    // 商城管理
    { code: 'mall:view', name: '查看商城管理', module: 'mall', action: 'view' },
    { code: 'mall:edit', name: '编辑商城管理', module: 'mall', action: 'edit' },
    { code: 'mall:distributor', name: '管理分销', module: 'mall', action: 'distributor' },
    { code: 'mall:config', name: '商城配置', module: 'mall', action: 'config' },
    { code: 'mall:export', name: '导出商城数据', module: 'mall', action: 'export' },
    { code: 'mall:refund', name: '商城退款', module: 'mall', action: 'refund' },

    // 分享有礼
    { code: 'share:view', name: '查看分享有礼', module: 'share', action: 'view' },
    { code: 'share:config', name: '管理分享活动', module: 'share', action: 'config' },
    { code: 'share:reward', name: '管理分享奖励', module: 'share', action: 'reward' },

    // 网盘资源（新增）
    { code: 'netdisk:view', name: '查看网盘资源', module: 'netdisk', action: 'view' },
    { code: 'netdisk:edit', name: '编辑网盘资源', module: 'netdisk', action: 'edit' },
    { code: 'netdisk:audit', name: '审核网盘资源', module: 'netdisk', action: 'audit' },
    { code: 'netdisk:config', name: '网盘配置', module: 'netdisk', action: 'config' },
    { code: 'netdisk:list', name: '查看网盘列表', module: 'netdisk', action: 'list' },

    // 对象匹配（新增）
    { code: 'dating:view', name: '查看对象匹配', module: 'dating', action: 'view' },
    { code: 'dating:audit', name: '审核对象匹配', module: 'dating', action: 'audit' },
    { code: 'dating:config', name: '配置对象匹配', module: 'dating', action: 'config' },
    { code: 'dating:list', name: '查看对象匹配列表', module: 'dating', action: 'list' },

    // 充值管理
    { code: 'topup:package:list', name: '查看充值套餐', module: 'topup', action: 'package:list' },
    { code: 'topup:package:create', name: '创建充值套餐', module: 'topup', action: 'package:create' },
    { code: 'topup:package:update', name: '更新充值套餐', module: 'topup', action: 'package:update' },
    { code: 'topup:package:delete', name: '删除充值套餐', module: 'topup', action: 'package:delete' },
    { code: 'topup:order:list', name: '查看充值订单', module: 'topup', action: 'order:list' },

    // 社团管理
    { code: 'club:list', name: '查看社团列表', module: 'club', action: 'list' },
    { code: 'club:detail', name: '查看社团详情', module: 'club', action: 'detail' },
    { code: 'club:create', name: '创建社团', module: 'club', action: 'create' },
    { code: 'club:update', name: '更新社团', module: 'club', action: 'update' },
    { code: 'club:audit', name: '审核社团状态', module: 'club', action: 'audit' },
    { code: 'club:delete', name: '删除社团', module: 'club', action: 'delete' },
    { code: 'club:member:list', name: '查看社团成员', module: 'club', action: 'member:list' },
    { code: 'club:member:delete', name: '移除社团成员', module: 'club', action: 'member:delete' },

    // 评论抽奖
    { code: 'lottery:list', name: '查看抽奖列表', module: 'lottery', action: 'list' },
    { code: 'lottery:detail', name: '查看抽奖详情', module: 'lottery', action: 'detail' },
    { code: 'lottery:delete', name: '删除抽奖', module: 'lottery', action: 'delete' },
    { code: 'lottery:record:list', name: '查看中奖记录', module: 'lottery', action: 'record:list' },

    // 排行榜
    { code: 'ranking:list', name: '查看排行榜', module: 'ranking', action: 'list' },
    { code: 'ranking:create', name: '创建排行榜', module: 'ranking', action: 'create' },
    { code: 'ranking:update', name: '更新排行榜', module: 'ranking', action: 'update' },
    { code: 'ranking:delete', name: '删除排行榜', module: 'ranking', action: 'delete' },

    // 用户引导
    { code: 'userGuidance:list', name: '查看引导页列表', module: 'userGuidance', action: 'list' },
    { code: 'userGuidance:create', name: '创建引导页', module: 'userGuidance', action: 'create' },
    { code: 'userGuidance:update', name: '更新引导页', module: 'userGuidance', action: 'update' },
    { code: 'userGuidance:delete', name: '删除引导页', module: 'userGuidance', action: 'delete' },

    // 通讯录
    { code: 'contacts:category:list', name: '查看通讯录分类', module: 'contacts', action: 'category:list' },
    { code: 'contacts:category:create', name: '创建通讯录分类', module: 'contacts', action: 'category:create' },
    { code: 'contacts:category:update', name: '更新通讯录分类', module: 'contacts', action: 'category:update' },
    { code: 'contacts:category:delete', name: '删除通讯录分类', module: 'contacts', action: 'category:delete' },
    { code: 'contacts:list', name: '查看联系人列表', module: 'contacts', action: 'list' },
    { code: 'contacts:create', name: '创建联系人', module: 'contacts', action: 'create' },
    { code: 'contacts:update', name: '更新联系人', module: 'contacts', action: 'update' },
    { code: 'contacts:delete', name: '删除联系人', module: 'contacts', action: 'delete' },

    // 微信文章
    { code: 'wechatArticle:list', name: '查看微信文章', module: 'wechatArticle', action: 'list' },
    { code: 'wechatArticle:delete', name: '删除微信文章', module: 'wechatArticle', action: 'delete' },

    // 打印机
    { code: 'printer:list', name: '查看打印机列表', module: 'printer', action: 'list' },
    { code: 'printer:update', name: '更新打印机状态', module: 'printer', action: 'update' },
    { code: 'printer:delete', name: '删除打印机', module: 'printer', action: 'delete' },

    // 头衔管理
    { code: 'userTitle:list', name: '查看头衔列表', module: 'userTitle', action: 'list' },
    { code: 'userTitle:create', name: '创建头衔', module: 'userTitle', action: 'create' },
    { code: 'userTitle:update', name: '更新头衔', module: 'userTitle', action: 'update' },
    { code: 'userTitle:delete', name: '删除头衔', module: 'userTitle', action: 'delete' },
    { code: 'userTitle:code:list', name: '查看兑换码', module: 'userTitle', action: 'code:list' },
    { code: 'userTitle:code:create', name: '生成兑换码', module: 'userTitle', action: 'code:create' },

    // 贴纸管理
    { code: 'sticker:category:list', name: '查看贴纸分类', module: 'sticker', action: 'category:list' },
    { code: 'sticker:category:create', name: '创建贴纸分类', module: 'sticker', action: 'category:create' },
    { code: 'sticker:category:update', name: '更新贴纸分类', module: 'sticker', action: 'category:update' },
    { code: 'sticker:category:delete', name: '删除贴纸分类', module: 'sticker', action: 'category:delete' },
    { code: 'sticker:list', name: '查看贴纸列表', module: 'sticker', action: 'list' },
    { code: 'sticker:update', name: '更新贴纸状态', module: 'sticker', action: 'update' },
    { code: 'sticker:delete', name: '删除贴纸', module: 'sticker', action: 'delete' },

    // 爆照评选
    { code: 'photoContest:view', name: '查看爆照评选', module: 'photoContest', action: 'view' },
    { code: 'photoContest:audit', name: '审核爆照评选', module: 'photoContest', action: 'audit' },
    { code: 'photoContest:config', name: '配置爆照评选', module: 'photoContest', action: 'config' },
    { code: 'photoContest:list', name: '查看爆照评选列表', module: 'photoContest', action: 'list' },

    // A/B 测试
    { code: 'abtest:view', name: '查看A/B测试', module: 'abtest', action: 'view' },
    { code: 'abtest:edit', name: '编辑A/B测试', module: 'abtest', action: 'edit' },

    // AI
    { code: 'ai:view', name: '查看AI配置', module: 'ai', action: 'view' },
    { code: 'ai:edit', name: '编辑AI配置', module: 'ai', action: 'edit' },

    // 数据分析
    { code: 'analytics:view', name: '查看数据分析', module: 'analytics', action: 'view' },

    // 招聘
    { code: 'job:view', name: '查看招聘', module: 'job', action: 'view' },
    { code: 'job:edit', name: '编辑招聘', module: 'job', action: 'edit' },

    // 页面布局
    { code: 'layout:view', name: '查看页面布局', module: 'layout', action: 'view' },
    { code: 'layout:edit', name: '编辑页面布局', module: 'layout', action: 'edit' },
    { code: 'layout:publish', name: '发布页面布局', module: 'layout', action: 'publish' },

    // 营销
    { code: 'marketing:view', name: '查看营销', module: 'marketing', action: 'view' },
    { code: 'marketing:edit', name: '编辑营销', module: 'marketing', action: 'edit' },

    // 通知
    { code: 'notification:send', name: '发送通知', module: 'notification', action: 'send' },
    { code: 'notification:view', name: '查看通知', module: 'notification', action: 'view' },

    // 打卡
    { code: 'punch:view', name: '查看打卡', module: 'punch', action: 'view' },
    { code: 'punch:edit', name: '编辑打卡', module: 'punch', action: 'edit' },
    { code: 'punch:audit', name: '审核打卡', module: 'punch', action: 'audit' },
    { code: 'punch:config', name: '打卡配置', module: 'punch', action: 'config' },

    // 推荐
    { code: 'recommend:view', name: '查看推荐', module: 'recommend', action: 'view' },
    { code: 'recommend:edit', name: '编辑推荐', module: 'recommend', action: 'edit' },

    // 二手交易
    { code: 'secondHand:list', name: '查看二手交易列表', module: 'secondHand', action: 'list' },

    // 上传管理
    { code: 'upload:admin:image', name: '上传管理图片', module: 'upload', action: 'admin:image' },
    { code: 'upload:admin:video', name: '上传管理视频', module: 'upload', action: 'admin:video' },
    { code: 'upload:admin:qrcode', name: '上传管理二维码', module: 'upload', action: 'admin:qrcode' },

    // 用户引导
    { code: 'userguidance:view', name: '查看用户引导', module: 'userguidance', action: 'view' },
  ];

  const permissions: Record<string, any> = {};
  for (const def of permissionDefs) {
    const p = await prisma.adminPermission.upsert({
      where: { code: def.code },
      update: {},
      create: def,
    });
    permissions[def.code] = p;
  }
  console.log('✅ Admin permissions created');

  // ============ 3. 角色-权限分配 ============
  const allPermissionIds = Object.values(permissions).map((p: any) => ({ id: p.id }));

  // 超级管理员：全部权限
  for (const perm of allPermissionIds) {
    await prisma.adminRolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: perm.id },
    });
  }

  // 平台运营
  const opsPermissions = [
    'user:view', 'user:edit', 'user:ban', 'user:delete', 'user:cert', 'user:balance', 'user:level', 'user:tag',
    'post:view', 'post:audit', 'post:delete', 'post:top',
    'comment:view', 'comment:audit', 'comment:delete',
    'report:handle', 'circle:manage', 'community:view', 'community:edit', 'community:config', 'topic:manage', 'audit:view',
    'merchant:view', 'merchant:audit', 'merchant:batch', 'merchant:printer', 'merchant:price', 'merchant:collection', 'merchant:config', 'product:view', 'product:batch',
    'review:manage', 'promotion:manage', 'freight:manage',
    'region:view', 'region:edit',
    'rider:view', 'rider:audit', 'delivery:view',
    'errand:config:view', 'errand:config:update',
    'errand:item-size:view', 'errand:item-size:create', 'errand:item-size:update', 'errand:item-size:delete',
    'errand:pickup-point:view', 'errand:pickup-point:create', 'errand:pickup-point:update', 'errand:pickup-point:delete',
    'errand:stats:view', 'errand:view', 'errand:config',
    'coupon:view', 'coupon:edit', 'coupon:records', 'activity:view', 'activity:edit', 'activity:audit', 'activity:order',
    'groupbuy:view', 'groupbuy:edit', 'groupbuy:order', 'groupbuy:config',
    'finance:view', 'finance:transfer', 'finance:reconciliation', 'finance:settlement',
    'withdraw:view', 'withdraw:audit', 'withdraw:complete',
    'message:view', 'robot:view', 'robot:post', 'robot:comment',
    'dashboard:view',
    'secondhand:view', 'secondhand:audit', 'secondhand:config',
    'driftBottle:list',
    'punchIn:location:list', 'punchIn:location:create', 'punchIn:location:update', 'punchIn:location:delete', 'punchIn:record:list',
    'netdisk:view', 'netdisk:edit', 'netdisk:audit', 'netdisk:config',
    'dating:view', 'dating:audit', 'dating:config',
    'topup:package:list', 'topup:order:list',
    'club:list', 'club:detail', 'club:create', 'club:update', 'club:audit', 'club:delete', 'club:member:list', 'club:member:delete',
    'lottery:list', 'lottery:detail', 'lottery:record:list',
    'ranking:list', 'ranking:create', 'ranking:update',
    'userGuidance:list', 'userGuidance:create', 'userGuidance:update',
    'contacts:category:list', 'contacts:category:create', 'contacts:category:update', 'contacts:list', 'contacts:create', 'contacts:update',
    'wechatArticle:list',
    'printer:list', 'printer:update',
    'userTitle:list', 'userTitle:create', 'userTitle:update',
    'sticker:category:list', 'sticker:category:create', 'sticker:category:update', 'sticker:list', 'sticker:update',
    'system:config', 'ops:view',
    'rating:view', 'rating:edit', 'rating:audit', 'rating:config',
    'mall:view', 'mall:edit', 'mall:distributor', 'mall:config', 'mall:export', 'mall:refund',
    'share:view', 'share:config', 'share:reward',
    'photoContest:view', 'photoContest:audit', 'photoContest:config',
    'system:upload', 'system:admin',
  ];
  for (const code of opsPermissions) {
    const perm = permissions[code];
    if (perm) {
      await prisma.adminRolePermission.upsert({
        where: { roleId_permissionId: { roleId: platformOpsRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: platformOpsRole.id, permissionId: perm.id },
      });
    }
  }

  // 财务
  const finPermissions = ['finance:view', 'withdraw:view', 'withdraw:audit', 'withdraw:complete', 'order:view', 'order:refund', 'finance:reconciliation', 'finance:transfer', 'finance:settlement', 'dashboard:view', 'topup:order:list'];
  for (const code of finPermissions) {
    const perm = permissions[code];
    if (perm) {
      await prisma.adminRolePermission.upsert({
        where: { roleId_permissionId: { roleId: financeRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: financeRole.id, permissionId: perm.id },
      });
    }
  }

  // 审核人员
  const audPermissions = ['post:view', 'post:audit', 'comment:view', 'comment:audit', 'comment:delete', 'merchant:view', 'merchant:audit', 'report:handle', 'dashboard:view', 'photoContest:view', 'photoContest:audit', 'activity:view', 'activity:order', 'club:audit', 'sticker:update', 'driftBottle:list'];
  for (const code of audPermissions) {
    const perm = permissions[code];
    if (perm) {
      await prisma.adminRolePermission.upsert({
        where: { roleId_permissionId: { roleId: auditorRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: auditorRole.id, permissionId: perm.id },
      });
    }
  }

  // 城市代理
  const agentPermissions = ['user:view', 'post:view', 'post:audit', 'region:view', 'merchant:view', 'city:view'];
  for (const code of agentPermissions) {
    const perm = permissions[code];
    if (perm) {
      await prisma.adminRolePermission.upsert({
        where: { roleId_permissionId: { roleId: cityAgentRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: cityAgentRole.id, permissionId: perm.id },
      });
    }
  }

  // 商家管理员
  const merchantPerms = ['product:view', 'product:edit', 'order:view', 'merchant:view', 'dashboard:view'];
  for (const code of merchantPerms) {
    const perm = permissions[code];
    if (perm) {
      await prisma.adminRolePermission.upsert({
        where: { roleId_permissionId: { roleId: merchantAdminRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: merchantAdminRole.id, permissionId: perm.id },
      });
    }
  }

  console.log('✅ Role-permission mappings created');

  // ============ 4. 管理员菜单 ============
  const menuDefs = [
    { name: '仪表盘', path: '/dashboard', icon: 'DashboardOutlined', sortOrder: 0 },
    { name: '用户管理', path: '/users', icon: 'UserOutlined', sortOrder: 1 },
    { name: '用户列表', path: '/users/list', parentPath: '/users', sortOrder: 0 },
    { name: '学生认证', path: '/users/certifications', parentPath: '/users', sortOrder: 1 },
    { name: '标签管理', path: '/users/tags', parentPath: '/users', sortOrder: 2 },
    { name: '等级管理', path: '/users/levels', parentPath: '/users', sortOrder: 3 },
    { name: '地址管理', path: '/users/addresses', parentPath: '/users', sortOrder: 4 },
    { name: '余额管理', path: '/users/balance', parentPath: '/users', sortOrder: 5 },
    { name: '内容管理', path: '/content', icon: 'FileTextOutlined', sortOrder: 2 },
    { name: '帖子管理', path: '/content/posts', parentPath: '/content', sortOrder: 0 },
    { name: '评论管理', path: '/content/comments', parentPath: '/content', sortOrder: 1 },
    { name: '举报管理', path: '/content/reports', parentPath: '/content', sortOrder: 2 },
    { name: '圈子管理', path: '/content/circles', parentPath: '/content', sortOrder: 3 },
    { name: '商城管理', path: '/shop', icon: 'ShopOutlined', sortOrder: 3 },
    { name: '商家列表', path: '/shop/merchants', parentPath: '/shop', sortOrder: 0 },
    { name: '入驻申请', path: '/shop/applications', parentPath: '/shop', sortOrder: 1 },
    { name: '打印机配置', path: '/shop/printers', parentPath: '/shop', sortOrder: 2 },
    { name: '商品加价', path: '/shop/price-adjustments', parentPath: '/shop', sortOrder: 3 },
    { name: '商品采集', path: '/shop/product-collection', parentPath: '/shop', sortOrder: 4 },
    { name: '评价管理', path: '/shop/reviews', parentPath: '/shop', sortOrder: 5 },
    { name: '商家配置', path: '/shop/merchant-config', parentPath: '/shop', sortOrder: 6 },
    { name: '分销管理', path: '/shop/distributors', parentPath: '/shop', sortOrder: 7 },
    { name: '分销配置', path: '/shop/distributor-config', parentPath: '/shop', sortOrder: 8 },
    { name: '商品列表', path: '/shop/products', parentPath: '/shop', sortOrder: 7 },
    { name: '订单管理', path: '/orders', icon: 'OrderedListOutlined', sortOrder: 4 },
    { name: '商城订单', path: '/orders/list', parentPath: '/orders', sortOrder: 0 },
    { name: '退款管理', path: '/orders/refunds', parentPath: '/orders', sortOrder: 1 },
    { name: '财务管理', path: '/finance', icon: 'DollarOutlined', sortOrder: 5 },
    { name: '提现审核', path: '/finance/withdraws', parentPath: '/finance', sortOrder: 0 },
    { name: '支付流水', path: '/finance/payments', parentPath: '/finance', sortOrder: 1 },
    { name: '配送管理', path: '/delivery', icon: 'CarOutlined', sortOrder: 6 },
    { name: '骑手管理', path: '/delivery/riders', parentPath: '/delivery', sortOrder: 0 },
    { name: '跑腿订单', path: '/delivery/orders', parentPath: '/delivery', sortOrder: 1 },
    { name: '跑腿费调整', path: '/delivery/fee-rules', parentPath: '/delivery', sortOrder: 2 },
    { name: '配送统计', path: '/delivery/stats', parentPath: '/delivery', sortOrder: 3 },
    { name: '奖惩配置', path: '/delivery/reward-punish', parentPath: '/delivery', sortOrder: 4 },
    { name: '物品大小配置', path: '/delivery/item-sizes', parentPath: '/delivery', sortOrder: 5 },
    { name: '取件点配置', path: '/delivery/pickup-points', parentPath: '/delivery', sortOrder: 6 },
    { name: '页面配置', path: '/delivery/page-config', parentPath: '/delivery', sortOrder: 7 },
    { name: '区域管理', path: '/area', icon: 'EnvironmentOutlined', sortOrder: 7 },
    { name: '区域列表', path: '/area/list', parentPath: '/area', sortOrder: 0 },
    { name: 'Tabbar管理', path: '/area/tabbar', parentPath: '/area', sortOrder: 1 },
    { name: '分享设置', path: '/area/share', parentPath: '/area', sortOrder: 2 },
    { name: '功能配置', path: '/area/features', parentPath: '/area', sortOrder: 3 },
    { name: '首页内容配置', path: '/area/home', parentPath: '/area', sortOrder: 4 },
    { name: '区域富文本', path: '/area/rich-text', parentPath: '/area', sortOrder: 5 },
    { name: '机器人配置', path: '/area/robots', parentPath: '/area', sortOrder: 6 },
    { name: '签到与积分配置', path: '/area/signin', parentPath: '/area', sortOrder: 7 },
    { name: '头像库管理', path: '/area/avatars', parentPath: '/area', sortOrder: 8 },
    { name: '表情包管理', path: '/area/emojis', parentPath: '/area', sortOrder: 9 },
    { name: '自定义页面管理', path: '/area/custom-pages', parentPath: '/area', sortOrder: 10 },
    { name: '运营工具', path: '/operations', icon: 'ToolOutlined', sortOrder: 8 },
    { name: '优惠券', path: '/operations/coupons', parentPath: '/operations', sortOrder: 0 },
    { name: '使用记录', path: '/operations/coupon-records', parentPath: '/operations', sortOrder: 1 },
    { name: '通知管理', path: '/operations/notifications', parentPath: '/operations', sortOrder: 2 },
    { name: '城市代理', path: '/city-agent', icon: 'TeamOutlined', sortOrder: 9 },
    { name: '代理申请', path: '/city-agent/applications', parentPath: '/city-agent', sortOrder: 0 },
    { name: '代理列表', path: '/city-agent/list', parentPath: '/city-agent', sortOrder: 1 },
    { name: '系统设置', path: '/system', icon: 'SettingOutlined', sortOrder: 10 },
    { name: '管理员', path: '/system/admins', parentPath: '/system', sortOrder: 0 },
    { name: '角色权限', path: '/system/roles', parentPath: '/system', sortOrder: 1 },
    { name: '操作日志', path: '/system/logs', parentPath: '/system', sortOrder: 2 },
    { name: '系统配置', path: '/system/config', parentPath: '/system', sortOrder: 3 },
    { name: '网站配置', path: '/system/website-config', parentPath: '/system', sortOrder: 4 },
    { name: '邮箱配置', path: '/system/email-config', parentPath: '/system', sortOrder: 5 },
    { name: '文件存储', path: '/system/storage', parentPath: '/system', sortOrder: 6 },
    { name: '微信支付', path: '/system/wechat-pay', parentPath: '/system', sortOrder: 7 },
    { name: '文件管理', path: '/system/files', parentPath: '/system', sortOrder: 8 },
    { name: '地图选点', path: '/system/map-picker', parentPath: '/system', sortOrder: 9 },

    // 小程序工具
    { name: '小程序工具', path: '/miniapp', icon: 'MobileOutlined', sortOrder: 11 },
    { name: '小程序上传', path: '/miniapp/upload', parentPath: '/miniapp', sortOrder: 0 },
    { name: '小程序码', path: '/miniapp/qrcode', parentPath: '/miniapp', sortOrder: 1 },
    { name: '页面路径', path: '/miniapp/pages', parentPath: '/miniapp', sortOrder: 2 },
    { name: '模板消息', path: '/miniapp/subscribe', parentPath: '/miniapp', sortOrder: 3 },

    // 新增模块菜单
    { name: '二手交易', path: '/second-hand', icon: 'ShoppingOutlined', sortOrder: 11 },
    { name: '商品管理', path: '/second-hand/products', parentPath: '/second-hand', sortOrder: 0 },
    { name: '订单管理', path: '/second-hand/orders', parentPath: '/second-hand', sortOrder: 1 },
    { name: '区域配置', path: '/second-hand/settings', parentPath: '/second-hand', sortOrder: 2 },
    { name: '漂流瓶管理', path: '/drift-bottle', icon: 'MailOutlined', sortOrder: 12 },
    { name: '瓶子列表', path: '/drift-bottle/bottles', parentPath: '/drift-bottle', sortOrder: 0 },
    { name: '打卡管理', path: '/punch-in', icon: 'EnvironmentOutlined', sortOrder: 13 },
    { name: '分类管理', path: '/punch-in/categories', parentPath: '/punch-in', sortOrder: 0 },
    { name: '地点管理', path: '/punch-in/locations', parentPath: '/punch-in', sortOrder: 1 },
    { name: '打卡记录', path: '/punch-in/records', parentPath: '/punch-in', sortOrder: 2 },
    { name: '评论管理', path: '/punch-in/comments', parentPath: '/punch-in', sortOrder: 3 },
    { name: '数据统计', path: '/punch-in/stats', parentPath: '/punch-in', sortOrder: 4 },
    { name: '区域配置', path: '/punch-in/config', parentPath: '/punch-in', sortOrder: 5 },
    { name: '分享有礼', path: '/share', icon: 'ShareAltOutlined', sortOrder: 14 },
    { name: '分享活动设置', path: '/share/activity', parentPath: '/share', sortOrder: 0 },
    { name: '邀请记录', path: '/share/invites', parentPath: '/share', sortOrder: 1 },
    { name: '奖励记录', path: '/share/rewards', parentPath: '/share', sortOrder: 2 },
    { name: '网盘资源', path: '/netdisk', icon: 'CloudOutlined', sortOrder: 15 },
    { name: '分类管理', path: '/netdisk/categories', parentPath: '/netdisk', sortOrder: 0 },
    { name: '平台管理', path: '/netdisk/platforms', parentPath: '/netdisk', sortOrder: 1 },
    { name: '资源管理', path: '/netdisk/resources', parentPath: '/netdisk', sortOrder: 2 },
    { name: '举报管理', path: '/netdisk/reports', parentPath: '/netdisk', sortOrder: 3 },
    { name: '评论管理', path: '/netdisk/comments', parentPath: '/netdisk', sortOrder: 4 },
    { name: '下载记录', path: '/netdisk/downloads', parentPath: '/netdisk', sortOrder: 5 },
    { name: '收益配置', path: '/netdisk/profit-config', parentPath: '/netdisk', sortOrder: 6 },
    { name: '对象匹配', path: '/dating', icon: 'HeartOutlined', sortOrder: 16 },
    { name: '资料管理', path: '/dating/profiles', parentPath: '/dating', sortOrder: 0 },
    { name: '匹配记录', path: '/dating/matches', parentPath: '/dating', sortOrder: 1 },
    { name: '套餐管理', path: '/dating/packages', parentPath: '/dating', sortOrder: 2 },
    { name: '订单管理', path: '/dating/orders', parentPath: '/dating', sortOrder: 3 },
    { name: '举报管理', path: '/dating/reports', parentPath: '/dating', sortOrder: 4 },
    { name: '配置管理', path: '/dating/config', parentPath: '/dating', sortOrder: 5 },
    { name: '缓存管理', path: '/dating/cache', parentPath: '/dating', sortOrder: 6 },
    { name: '充值管理', path: '/topup', icon: 'DollarOutlined', sortOrder: 17 },
    { name: '套餐配置', path: '/topup/packages', parentPath: '/topup', sortOrder: 0 },
    { name: '充值订单', path: '/topup/orders', parentPath: '/topup', sortOrder: 1 },
    { name: '社群管理', path: '/community', icon: 'UsergroupAddOutlined', sortOrder: 14 },
    { name: '社群列表', path: '/community/circles', parentPath: '/community', sortOrder: 0 },
    { name: '购买记录', path: '/community/payments', parentPath: '/community', sortOrder: 1 },
    { name: '区域配置', path: '/community/config', parentPath: '/community', sortOrder: 2 },
    { name: '社团管理', path: '/club', icon: 'TeamOutlined', sortOrder: 18 },
    { name: '社团列表', path: '/club/list', parentPath: '/club', sortOrder: 0 },
    { name: '评论抽奖', path: '/lottery', icon: 'GiftOutlined', sortOrder: 19 },
    { name: '抽奖列表', path: '/lottery/list', parentPath: '/lottery', sortOrder: 0 },
    { name: '商家点评', path: '/dianping', icon: 'CommentOutlined', sortOrder: 20 },
    { name: '点评列表', path: '/dianping/reviews', parentPath: '/dianping', sortOrder: 0 },
    { name: '排行榜', path: '/ranking', icon: 'TrophyOutlined', sortOrder: 21 },
    { name: '榜单管理', path: '/ranking/list', parentPath: '/ranking', sortOrder: 0 },
    { name: '用户引导', path: '/user-guidance', icon: 'ReadOutlined', sortOrder: 22 },
    { name: '引导页管理', path: '/user-guidance/pages', parentPath: '/user-guidance', sortOrder: 0 },
    { name: '私信管理', path: '/messages', icon: 'MessageOutlined', sortOrder: 28 },
    { name: '通讯录', path: '/contacts', icon: 'PhoneOutlined', sortOrder: 23 },
    { name: '分类管理', path: '/contacts/categories', parentPath: '/contacts', sortOrder: 0 },
    { name: '联系人管理', path: '/contacts/list', parentPath: '/contacts', sortOrder: 1 },
    { name: '微信文章', path: '/wechat-article', icon: 'FileTextOutlined', sortOrder: 24 },
    { name: '文章管理', path: '/wechat-article/list', parentPath: '/wechat-article', sortOrder: 0 },
    { name: '打印机', path: '/printer', icon: 'PrinterOutlined', sortOrder: 25 },
    { name: '打印机管理', path: '/printer/list', parentPath: '/printer', sortOrder: 0 },
    { name: '头衔管理', path: '/user-title', icon: 'CrownOutlined', sortOrder: 26 },
    { name: '头衔列表', path: '/user-title/list', parentPath: '/user-title', sortOrder: 0 },
    { name: '贴纸管理', path: '/sticker', icon: 'SmileOutlined', sortOrder: 27 },
    { name: '分类管理', path: '/sticker/categories', parentPath: '/sticker', sortOrder: 0 },
    { name: '贴纸审核', path: '/sticker/list', parentPath: '/sticker', sortOrder: 1 },
    // 爆照评选
    { name: '爆照评选', path: '/photo-contest', icon: 'CameraOutlined', sortOrder: 27 },
    { name: '评选项目', path: '/photo-contest/contests', parentPath: '/photo-contest', sortOrder: 0 },
    { name: '待审核照片', path: '/photo-contest/pending', parentPath: '/photo-contest', sortOrder: 1 },
    { name: '作品管理', path: '/photo-contest/entries', parentPath: '/photo-contest', sortOrder: 2 },
    { name: '投票统计', path: '/photo-contest/stats', parentPath: '/photo-contest', sortOrder: 3 },
    { name: '获奖管理', path: '/photo-contest/winners', parentPath: '/photo-contest', sortOrder: 4 },
    { name: '评选配置', path: '/photo-contest/config', parentPath: '/photo-contest', sortOrder: 5 },
    // 活动管理
    { name: '活动管理', path: '/activity', icon: 'ScheduleOutlined', sortOrder: 28 },
    { name: '活动列表', path: '/activity/list', parentPath: '/activity', sortOrder: 0 },
    { name: '活动类型', path: '/activity/types', parentPath: '/activity', sortOrder: 1 },
    { name: '套餐管理', path: '/activity/packages', parentPath: '/activity', sortOrder: 2 },
    { name: '订单管理', path: '/activity/orders', parentPath: '/activity', sortOrder: 3 },
    { name: '奖励管理', path: '/activity/rewards', parentPath: '/activity', sortOrder: 4 },

    // 评分管理
    { name: '评分管理', path: '/rating', icon: 'StarOutlined', sortOrder: 29 },
    { name: '系统概览', path: '/rating/dashboard', parentPath: '/rating', sortOrder: 0 },
    { name: '区域设置', path: '/rating/settings', parentPath: '/rating', sortOrder: 1 },
    { name: '分类管理', path: '/rating/categories', parentPath: '/rating', sortOrder: 2 },
    { name: '项目管理', path: '/rating/items', parentPath: '/rating', sortOrder: 3 },
    { name: '评分记录', path: '/rating/records', parentPath: '/rating', sortOrder: 4 },
    { name: '回复管理', path: '/rating/replies', parentPath: '/rating', sortOrder: 5 },
  ];

  // 创建菜单 - 先创建顶级菜单，再创建子菜单
  const menuMap: Record<string, any> = {};
  for (const def of menuDefs) {
    let parentId: string | null = null;
    if (def.parentPath) {
      parentId = menuMap[def.parentPath]?.id || null;
    }
    const menu = await prisma.adminMenu.upsert({
      where: { id: `menu_${def.path.replace(/\//g, '_')}` },
      update: { name: def.name, path: def.path, icon: def.icon, parentId, sortOrder: def.sortOrder },
      create: {
        id: `menu_${def.path.replace(/\//g, '_')}`,
        name: def.name,
        path: def.path,
        icon: def.icon,
        parentId,
        sortOrder: def.sortOrder,
      },
    });
    menuMap[def.path] = menu;
  }

  // 超级管理员拥有全部菜单
  for (const menu of Object.values(menuMap)) {
    await prisma.adminRoleMenu.upsert({
      where: { roleId_menuId: { roleId: superAdminRole.id, menuId: menu.id } },
      update: {},
      create: { roleId: superAdminRole.id, menuId: menu.id },
    });
  }

  // 平台运营菜单权限
  const opsMenuPaths = [
    '/dashboard',
    '/users', '/users/list', '/users/certifications', '/users/tags', '/users/levels', '/users/addresses', '/users/balance',
    '/content', '/content/posts', '/content/comments', '/content/reports', '/content/circles',
    '/shop', '/shop/merchants', '/shop/applications', '/shop/printers', '/shop/price-adjustments', '/shop/product-collection', '/shop/reviews', '/shop/merchant-config', '/shop/distributors', '/shop/distributor-config', '/shop/products',
    '/group-buy', '/group-buy/dashboard', '/group-buy/config', '/group-buy/categories', '/group-buy/packages', '/group-buy/orders', '/group-buy/reviews',
    '/orders', '/orders/list', '/orders/refunds',
    '/finance', '/finance/withdraws', '/finance/balance-logs', '/finance/alipay-transfers', '/finance/region-balance-logs', '/finance/payments',
    '/delivery', '/delivery/riders', '/delivery/orders', '/delivery/fee-rules', '/delivery/stats', '/delivery/reward-punish', '/delivery/item-sizes', '/delivery/pickup-points', '/delivery/page-config',
    '/area', '/area/list',
    '/operations', '/operations/coupons', '/operations/coupon-records', '/operations/activities', '/operations/notifications',
    '/city-agent', '/city-agent/applications', '/city-agent/list',
    '/system', '/system/admins', '/system/roles', '/system/logs', '/system/config', '/system/website-config', '/system/email-config', '/system/storage', '/system/wechat-pay', '/system/files', '/system/map-picker',
    '/miniapp', '/miniapp/upload', '/miniapp/qrcode', '/miniapp/pages', '/miniapp/subscribe',
    '/second-hand', '/second-hand/products', '/second-hand/orders', '/second-hand/settings',
    '/drift-bottle', '/drift-bottle/bottles',
    '/punch-in', '/punch-in/categories', '/punch-in/locations', '/punch-in/records', '/punch-in/comments', '/punch-in/stats', '/punch-in/config',
    '/share', '/share/activity', '/share/invites', '/share/rewards',
    '/netdisk', '/netdisk/categories', '/netdisk/platforms', '/netdisk/resources', '/netdisk/reports', '/netdisk/comments', '/netdisk/downloads', '/netdisk/profit-config',
    '/dating', '/dating/profiles', '/dating/matches', '/dating/packages', '/dating/orders', '/dating/reports', '/dating/config', '/dating/cache',
    '/topup', '/topup/packages', '/topup/orders',
    '/community', '/community/circles', '/community/payments', '/community/config',
    '/club', '/club/list',
    '/lottery', '/lottery/list',
    '/dianping', '/dianping/reviews',
    '/ranking', '/ranking/list',
    '/user-guidance', '/user-guidance/pages',
    '/messages',
    '/contacts', '/contacts/categories', '/contacts/list',
    '/wechat-article', '/wechat-article/list',
    '/printer', '/printer/list',
    '/user-title', '/user-title/list',
    '/sticker', '/sticker/categories', '/sticker/list',
    '/photo-contest', '/photo-contest/contests', '/photo-contest/pending', '/photo-contest/entries', '/photo-contest/stats', '/photo-contest/winners', '/photo-contest/config',
    '/activity', '/activity/list', '/activity/types', '/activity/packages', '/activity/orders', '/activity/rewards',
    '/rating', '/rating/dashboard', '/rating/settings', '/rating/categories', '/rating/items', '/rating/records', '/rating/replies',
  ];
  for (const path of opsMenuPaths) {
    const menu = menuMap[path];
    if (menu) {
      await prisma.adminRoleMenu.upsert({
        where: { roleId_menuId: { roleId: platformOpsRole.id, menuId: menu.id } },
        update: {},
        create: { roleId: platformOpsRole.id, menuId: menu.id },
      });
    }
  }

  // 财务人员菜单权限
  const financeMenuPaths = [
    '/dashboard',
    '/orders', '/orders/list', '/orders/refunds',
    '/finance', '/finance/withdraws', '/finance/balance-logs', '/finance/alipay-transfers', '/finance/region-balance-logs', '/finance/payments',
    '/system', '/system/config',
  ];
  for (const path of financeMenuPaths) {
    const menu = menuMap[path];
    if (menu) {
      await prisma.adminRoleMenu.upsert({
        where: { roleId_menuId: { roleId: financeRole.id, menuId: menu.id } },
        update: {},
        create: { roleId: financeRole.id, menuId: menu.id },
      });
    }
  }

  // 审核人员菜单权限
  const auditorMenuPaths = [
    '/dashboard',
    '/content', '/content/posts', '/content/comments',
    '/shop', '/shop/merchants',
    '/system', '/system/config',
    '/photo-contest', '/photo-contest/pending',
    '/activity', '/activity/orders',
  ];
  for (const path of auditorMenuPaths) {
    const menu = menuMap[path];
    if (menu) {
      await prisma.adminRoleMenu.upsert({
        where: { roleId_menuId: { roleId: auditorRole.id, menuId: menu.id } },
        update: {},
        create: { roleId: auditorRole.id, menuId: menu.id },
      });
    }
  }

  // 城市代理菜单权限
  const agentMenuPaths = [
    '/dashboard',
    '/users', '/users/list',
    '/content', '/content/posts',
    '/shop', '/shop/merchants',
    '/area', '/area/list',
    '/city-agent', '/city-agent/applications', '/city-agent/list',
  ];
  for (const path of agentMenuPaths) {
    const menu = menuMap[path];
    if (menu) {
      await prisma.adminRoleMenu.upsert({
        where: { roleId_menuId: { roleId: cityAgentRole.id, menuId: menu.id } },
        update: {},
        create: { roleId: cityAgentRole.id, menuId: menu.id },
      });
    }
  }

  // 商家管理员菜单权限
  const merchantMenuPaths = [
    '/dashboard',
    '/shop', '/shop/merchants', '/shop/printers', '/shop/products',
    '/orders', '/orders/list',
    '/system', '/system/config',
  ];
  for (const path of merchantMenuPaths) {
    const menu = menuMap[path];
    if (menu) {
      await prisma.adminRoleMenu.upsert({
        where: { roleId_menuId: { roleId: merchantAdminRole.id, menuId: menu.id } },
        update: {},
        create: { roleId: merchantAdminRole.id, menuId: menu.id },
      });
    }
  }

  console.log('✅ Admin menus created');

  // ============ 5. 默认超级管理员 ============
  const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD;
  if (!defaultPassword) {
    console.error('❌ 环境变量 ADMIN_DEFAULT_PASSWORD 未设置，无法创建默认管理员');
    console.log('   请设置: export ADMIN_DEFAULT_PASSWORD="<强密码>"');
    console.log('   强密码要求: 至少12位，包含大写字母、小写字母、数字、特殊字符中至少3种');
    process.exit(1);
  }
  if (defaultPassword.length < 12) {
    console.error('❌ ADMIN_DEFAULT_PASSWORD 长度不足 12 位');
    process.exit(1);
  }
  // 检查字符类型: 至少包含大写字母、小写字母、数字、特殊字符中的3种
  const hasLower = /[a-z]/.test(defaultPassword);
  const hasUpper = /[A-Z]/.test(defaultPassword);
  const hasDigit = /\d/.test(defaultPassword);
  const hasSpecial = /[^a-zA-Z\d]/.test(defaultPassword);
  const classCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (classCount < 3) {
    console.error('❌ ADMIN_DEFAULT_PASSWORD 必须包含大写字母、小写字母、数字、特殊字符中至少3种 (当前: ' + classCount + ' 种)');
    process.exit(1);
  }
  // 弱词检查
  const weakWords = ['admin', 'password', '123456', 'qwerty', 'abc123', 'test', 'demo', 'lingmeng', 'xiaoyi'];
  const lowerPass = defaultPassword.toLowerCase();
  for (const w of weakWords) {
    if (lowerPass.includes(w)) {
      console.error('❌ ADMIN_DEFAULT_PASSWORD 包含弱词 "' + w + '"，请使用更强密码');
      process.exit(1);
    }
  }
  console.log('✅ 使用环境变量 ADMIN_DEFAULT_PASSWORD 创建管理员');
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const admin = await prisma.adminAccount.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      realName: '超级管理员',
      phone: '13800000000',
      status: 'active',
      passwordChangedAt: new Date(),
    },
  });

  await prisma.adminAccountRole.upsert({
    where: { accountId_roleId_regionId: { accountId: admin.id, roleId: superAdminRole.id, regionId: '' } },
    update: {},
    create: { accountId: admin.id, roleId: superAdminRole.id },
  });

  console.log('✅ Default admin account created (username: admin)');

  // ============ 6. 小程序用户角色 ============
  const roleDefs = [
    { name: '普通用户', type: 'USER' as const, description: '小程序普通用户' },
    { name: '骑手', type: 'RIDER' as const, description: '配送骑手' },
    { name: '商家', type: 'MERCHANT' as const, description: '入驻商家' },
  ];

  for (const def of roleDefs) {
    await prisma.role.upsert({
      where: { name: def.name },
      update: {},
      create: def,
    });
  }
  console.log('✅ User roles created');

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
