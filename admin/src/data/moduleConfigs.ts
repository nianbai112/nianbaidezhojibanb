import type { ModuleConfig } from '@/types/admin'
import { statusOptions, regionOptions, categoryOptions, auditTypeOptions } from './options'

export const moduleConfigs: Record<string, ModuleConfig> = {
  regions: {
    key: 'regions', title: '区域列表', subtitle: '管理校园区域、运营负责人、服务范围、财务规则和前端显示状态。', endpoint: '/region',
    stats: [
      { label:'区域总数', value:0, delta:'-', tone:'blue', icon:'Location', key:'totalRegions' },
      { label:'启用区域', value:0, delta:'-', tone:'green', icon:'CircleCheck', key:'activeRegions' },
      { label:'区域用户', value:'0', delta:'-', tone:'purple', icon:'User', key:'totalUsers' },
      { label:'区域GMV', value:'¥0', delta:'-', tone:'orange', icon:'Money', key:'totalGmv' }
    ],
    search:[
      { key:'keyword', label:'区域名称', type:'input', placeholder:'输入区域名称/编码' },
      { key:'city', label:'城市', type:'input', placeholder:'城市名称' },
      { key:'status', label:'状态', type:'select', options:statusOptions },
      { key:'createdAt', label:'创建时间', type:'daterange' }
    ], actions:['新增区域','导出区域','批量启用','批量禁用'],
    columns:[
      { prop:'name', label:'区域名称', type:'avatar', minWidth:180 }, { prop:'code', label:'区域编码', minWidth:130 }, { prop:'city', label:'城市', minWidth:110 }, { prop:'admin', label:'管理员', type:'avatar', minWidth:160 }, { prop:'userCount', label:'用户数', type:'number', minWidth:100 }, { prop:'merchantCount', label:'商家数', type:'number', minWidth:100 }, { prop:'gmv', label:'GMV', type:'money', minWidth:120 }, { prop:'status', label:'状态', type:'tag', minWidth:90 }, { prop:'createdAt', label:'创建时间', type:'date', minWidth:160 }
    ],
    sideTitle:'区域待办', sideMetrics:[{title:'新增区域申请',desc:'等待总部审核',value:0,icon:'Location'},{title:'服务范围异常',desc:'配送范围冲突',value:0,icon:'Warning'},{title:'管理员变更',desc:'待确认交接',value:0,icon:'User'}], chartTitle:'区域GMV分布', detailTabs:['基础信息','运营数据','财务配置','页面配置','操作记录']
  },
  users: {
    key: 'users', title:'用户管理', subtitle:'管理小程序用户、机器人账号、学生认证、余额状态、内容与交易行为。', endpoint:'/user/list',
    stats:[
      {label:'总用户数',value:'0',delta:'-',tone:'blue',icon:'User',key:'totalUsers'},
      {label:'真实用户',value:'0',delta:'-',tone:'green',icon:'UserFilled',key:'realUsers'},
      {label:'机器人用户',value:'0',delta:'-',tone:'purple',icon:'Avatar',key:'robotUsers'},
      {label:'今日新增',value:'0',delta:'-',tone:'orange',icon:'Plus',key:'todayNew'},
      {label:'学生认证',value:'0',delta:'-',tone:'cyan',icon:'Checked',key:'certified'},
      {label:'封禁/禁用',value:'0',delta:'-',tone:'red',icon:'Warning',key:'banned'}
    ],
    search:[
      {key:'keyword',label:'关键词',type:'input',placeholder:'搜索昵称、手机号、用户ID、openid'},
      {key:'userId',label:'用户ID',type:'input',placeholder:'精确搜索用户ID'},
      {key:'userType',label:'用户类型',type:'select',options:[{label:'全部',value:''},{label:'小程序用户',value:'normal'},{label:'机器人用户',value:'robot'},{label:'商家用户',value:'merchant'},{label:'骑手用户',value:'rider'},{label:'区域代理',value:'agent'}]},
      {key:'regionId',label:'所属区域',type:'select',options:regionOptions},
      {key:'studentCertStatus',label:'学生认证',type:'select',options:[{label:'全部',value:''},{label:'未认证',value:'none'},{label:'待审核',value:'pending'},{label:'已认证',value:'approved'},{label:'已驳回',value:'rejected'}]},
      {key:'status',label:'账号状态',type:'select',options:[{label:'全部',value:''},{label:'正常',value:'active'},{label:'禁用',value:'disabled'},{label:'封禁',value:'banned'}]},
      {key:'balanceSort',label:'余额排序',type:'select',options:[{label:'默认',value:''},{label:'余额从高到低',value:'desc'},{label:'余额从低到高',value:'asc'}]},
      {key:'startDate',label:'注册开始时间',type:'date'},
      {key:'endDate',label:'注册结束时间',type:'date'},
      {key:'lastLoginStart',label:'最后登录开始',type:'date'},
      {key:'lastLoginEnd',label:'最后登录结束',type:'date'}
    ],
    actions:['添加机器人','批量启用','批量禁用','批量封禁','导出数据'],
    columns:[
      {prop:'user',label:'头像/昵称',type:'avatar',minWidth:180},
      {prop:'phone',label:'手机号',minWidth:130},
      {prop:'userType',label:'用户类型',type:'tag',minWidth:100},
      {prop:'regionName',label:'所属区域',minWidth:120},
      {prop:'studentCertStatus',label:'学生认证',type:'tag',minWidth:100},
      {prop:'balance',label:'余额',type:'money',minWidth:100},
      {prop:'contentData',label:'内容数据',minWidth:140},
      {prop:'orderData',label:'订单数据',minWidth:140},
      {prop:'registerIp',label:'注册IP',minWidth:120},
      {prop:'lastLoginIp',label:'最后登录IP',minWidth:120},
      {prop:'status',label:'账号状态',type:'tag',minWidth:90},
      {prop:'createdAt',label:'注册时间',type:'date',minWidth:160},
      {prop:'lastLoginAt',label:'最后登录',type:'date',minWidth:160}
    ],
    sideTitle:'用户运营提醒', sideMetrics:[{title:'待认证用户',desc:'需审核学生材料',value:0,icon:'Checked'},{title:'异常登录',desc:'近24小时多地登录',value:0,icon:'Warning'},{title:'高价值用户流失',desc:'7天未活跃',value:0,icon:'TrendCharts'}], chartTitle:'用户增长趋势', detailTabs:['基础资料','学生认证','订单消费','钱包积分','风控记录']
  },
  verification: {
    key:'verification', title:'学生认证', subtitle:'审核学生证、校园邮箱、实名资料及人工复核结果。', endpoint:'/user/verification',
    stats:[
      {label:'待审核',value:0,delta:'-',tone:'orange',icon:'Clock',key:'pending'},
      {label:'今日通过',value:0,delta:'-',tone:'green',icon:'CircleCheck',key:'todayApproved'},
      {label:'拒绝数量',value:0,delta:'-',tone:'red',icon:'CircleClose',key:'rejected'},
      {label:'累计认证',value:'0',delta:'-',tone:'blue',icon:'Tickets',key:'totalApproved'}
    ],
    search:[{key:'keyword',label:'姓名/学校',type:'input'},{key:'school',label:'学校',type:'input'},{key:'status',label:'审核状态',type:'select',options:statusOptions},{key:'date',label:'提交时间',type:'daterange'}], actions:['批量通过','批量驳回','导出记录'],
    columns:[{prop:'user',label:'申请用户',type:'avatar',minWidth:180},{prop:'realName',label:'真实姓名',minWidth:110},{prop:'school',label:'学校',minWidth:170},{prop:'studentNo',label:'学号',minWidth:130},{prop:'cert',label:'材料',type:'image',minWidth:90},{prop:'status',label:'审核状态',type:'tag',minWidth:110},{prop:'createdAt',label:'提交时间',type:'date',minWidth:160}],
    sideTitle:'审核策略', sideMetrics:[{title:'OCR识别失败',desc:'需人工查看',value:0,icon:'Picture'},{title:'重复认证',desc:'同设备多账号',value:0,icon:'Warning'}], chartTitle:'认证通过率', detailTabs:['认证材料','用户信息','审核记录']
  },
  merchants: {
    key:'merchants', title:'商家管理', subtitle:'管理商家入驻、经营状态、分类评分、资质风控、商品和结算信息。', endpoint:'/merchant/list',
    stats:[
      {label:'商家总数',value:0,delta:'-',tone:'blue',icon:'Shop',key:'totalMerchants'},
      {label:'今日新增',value:0,delta:'-',tone:'green',icon:'Plus',key:'todayNew'},
      {label:'营业中',value:0,delta:'-',tone:'cyan',icon:'CircleCheck',key:'active'},
      {label:'待审核',value:0,delta:'-',tone:'orange',icon:'Clock',key:'pendingAudit'},
      {label:'风险商家',value:0,delta:'-',tone:'red',icon:'Warning',key:'riskMerchants'}
    ],
    search:[{key:'keyword',label:'商家名称',type:'input',placeholder:'商家名称/联系人'},{key:'phone',label:'联系人/手机号',type:'input'},{key:'status',label:'经营状态',type:'select',options:statusOptions},{key:'category',label:'商家分类',type:'select',options:categoryOptions},{key:'region',label:'所属区域',type:'select',options:regionOptions},{key:'date',label:'入驻时间',type:'daterange'}], actions:['新增商家','导出数据','批量审核','批量下架'],
    columns:[{prop:'merchant',label:'店铺信息',type:'avatar',minWidth:190},{prop:'id',label:'商家ID',minWidth:130},{prop:'category',label:'分类',type:'tag',minWidth:110},{prop:'region',label:'区域',minWidth:110},{prop:'contact',label:'联系人',minWidth:130},{prop:'status',label:'营业状态',type:'tag',minWidth:110},{prop:'score',label:'评分',type:'rating',minWidth:110},{prop:'sales',label:'月销量',type:'number',minWidth:100},{prop:'settle',label:'结算状态',type:'tag',minWidth:110},{prop:'createdAt',label:'入驻时间',type:'date',minWidth:160}],
    sideTitle:'待处理事项', sideMetrics:[{title:'入驻审核',desc:'新商家申请',value:0,icon:'Shop'},{title:'资质补充',desc:'证照即将过期',value:0,icon:'Document'},{title:'店铺巡检',desc:'低分门店',value:0,icon:'Warning'},{title:'差评预警',desc:'近24小时集中差评',value:0,icon:'ChatDotRound'}], chartTitle:'商家分类分布', detailTabs:['门店信息','资质证照','商品菜单','配送规则','财务结算','评价记录']
  },
  products: {
    key:'products', title:'商品管理', subtitle:'管理商家商品、分类、库存、上下架、价格和审核状态。', endpoint:'/merchant/products',
    stats:[
      {label:'商品总数',value:0,delta:'-',tone:'blue',icon:'Goods',key:'totalProducts'},
      {label:'上架商品',value:0,delta:'-',tone:'green',icon:'CircleCheck',key:'activeProducts'},
      {label:'待审核',value:0,delta:'-',tone:'orange',icon:'Clock',key:'pendingAudit'},
      {label:'违规下架',value:0,delta:'-',tone:'red',icon:'Warning',key:'violationProducts'}
    ],
    search:[{key:'keyword',label:'商品名称',type:'input'},{key:'merchant',label:'商家',type:'input'},{key:'category',label:'分类',type:'select',options:categoryOptions},{key:'status',label:'状态',type:'select',options:statusOptions}], actions:['新增商品','批量上架','批量下架','导出商品'],
    columns:[{prop:'product',label:'商品',type:'avatar',minWidth:200},{prop:'merchant',label:'所属商家',minWidth:160},{prop:'category',label:'分类',type:'tag',minWidth:100},{prop:'price',label:'价格',type:'money',minWidth:100},{prop:'stock',label:'库存',type:'number',minWidth:90},{prop:'sales',label:'销量',type:'number',minWidth:90},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'更新时间',type:'date',minWidth:160}],
    sideTitle:'商品风险', sideMetrics:[{title:'待审核商品',value:0,desc:'新提交/修改'},{title:'库存告警',value:0,desc:'库存低于阈值'},{title:'价格异常',value:0,desc:'价格波动过大'}], chartTitle:'分类销量占比', detailTabs:['商品信息','规格库存','审核记录','销售数据']
  },
  orders: {
    key:'orders', title:'订单中心', subtitle:'实时监控订单状态，提升履约效率，优化用户体验。', endpoint:'/orders',
    stats:[
      {label:'今日订单',value:0,delta:'-',tone:'blue',icon:'Tickets',key:'todayOrders'},
      {label:'待付款',value:0,delta:'-',tone:'orange',icon:'Wallet',key:'pendingPay'},
      {label:'待配送',value:0,delta:'-',tone:'purple',icon:'Van',key:'pendingDelivery'},
      {label:'退款中',value:0,delta:'-',tone:'cyan',icon:'Money',key:'refunding'},
      {label:'已完成',value:0,delta:'-',tone:'green',icon:'CircleCheck',key:'completed'},
      {label:'异常订单',value:0,delta:'-',tone:'red',icon:'Warning',key:'abnormalOrders'}
    ],
    search:[{key:'orderNo',label:'订单号',type:'input',placeholder:'请输入订单号'},{key:'user',label:'用户',type:'input',placeholder:'搜索用户名/手机号'},{key:'merchant',label:'商家',type:'input',placeholder:'搜索商家名称'},{key:'type',label:'订单类型',type:'select',options:[{label:'全部类型',value:''},{label:'外卖订单',value:'外卖订单'},{label:'自提订单',value:'自提订单'},{label:'跑腿订单',value:'跑腿订单'}]},{key:'payStatus',label:'支付状态',type:'select',options:statusOptions},{key:'status',label:'订单状态',type:'select',options:statusOptions},{key:'delivery',label:'配送方式',type:'select',options:[{label:'全部方式',value:''},{label:'平台配送',value:'平台配送'},{label:'商家自提',value:'商家自提'}]},{key:'date',label:'时间范围',type:'daterange'}], actions:['导出订单','批量处理','刷新'],
    columns:[{prop:'orderNo',label:'订单号',minWidth:170},{prop:'user',label:'用户信息',type:'avatar',minWidth:160},{prop:'merchant',label:'商家',minWidth:160},{prop:'orderType',label:'订单类型',type:'tag',minWidth:110},{prop:'goodsAmount',label:'商品金额',type:'money',minWidth:110},{prop:'deliveryFee',label:'配送费',type:'money',minWidth:100},{prop:'amount',label:'实付金额',type:'money',minWidth:110},{prop:'payStatus',label:'支付状态',type:'tag',minWidth:100},{prop:'status',label:'订单状态',type:'tag',minWidth:100},{prop:'deliveryType',label:'配送方式',minWidth:110},{prop:'createdAt',label:'下单时间',type:'date',minWidth:150}],
    sideTitle:'异常订单提醒', sideMetrics:[{title:'超时未支付订单',desc:'超过30分钟未支付',value:0,icon:'Clock'},{title:'配送超时订单',desc:'超过预计送达时间',value:0,icon:'Van'},{title:'退款处理中',desc:'需人工处理退款',value:0,icon:'Money'},{title:'用户投诉订单',desc:'等待处理',value:0,icon:'Warning'}], chartTitle:'订单状态分布', detailTabs:['订单信息','商品明细','配送轨迹','支付退款','操作日志']
  },
  refunds: {
    key:'refunds', title:'退款售后', subtitle:'处理退款申请、售后纠纷、平台补偿与退款流水。', endpoint:'/refunds',
    stats:[
      {label:'待处理退款',value:0,delta:'-',tone:'red',icon:'Money',key:'pendingRefunds'},
      {label:'今日退款',value:'¥0',delta:'-',tone:'orange',icon:'Wallet',key:'todayRefundAmount'},
      {label:'已通过',value:0,delta:'-',tone:'green',icon:'CircleCheck',key:'approvedCount'},
      {label:'已退款',value:0,delta:'-',tone:'purple',icon:'CircleCheck',key:'refundedCount'}
    ],
    search:[{key:'keyword',label:'订单号/用户',type:'input'},{key:'merchant',label:'商家',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions},{key:'date',label:'申请时间',type:'daterange'}], actions:['批量同意','批量驳回','导出售后'],
    columns:[{prop:'orderNo',label:'售后单号',minWidth:170},{prop:'user',label:'申请用户',type:'avatar',minWidth:160},{prop:'merchant',label:'商家',minWidth:160},{prop:'reason',label:'退款原因',minWidth:160},{prop:'amount',label:'退款金额',type:'money',minWidth:110},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'申请时间',type:'date',minWidth:160}],
    sideTitle:'售后风险', sideMetrics:[{title:'频繁退款用户',value:0,desc:'7天3次以上'},{title:'高争议商家',value:0,desc:'申诉率较高'}], chartTitle:'退款原因分布', detailTabs:['申请信息','订单详情','协商记录','退款日志']
  },
  finance: {
    key:'finance', title:'财务中心', subtitle:'实时监控平台收入、结算、退款与提现等财务数据。', endpoint:'/finance/transactions',
    stats:[
      {label:'今日收入',value:'¥0',delta:'-',tone:'purple',icon:'Wallet',key:'todayRevenue'},
      {label:'累计收入',value:'¥0',delta:'-',tone:'orange',icon:'PieChart',key:'totalRevenue'},
      {label:'今日订单',value:0,delta:'-',tone:'blue',icon:'Shop',key:'todayOrders'},
      {label:'待提现',value:0,delta:'-',tone:'green',icon:'CreditCard',key:'pendingWithdraws'},
      {label:'退款金额',value:'¥0',delta:'-',tone:'red',icon:'Money',key:'totalRefunds'},
      {label:'客单价',value:'¥0',delta:'-',tone:'cyan',icon:'Warning',key:'avgOrderValue'}
    ],
    search:[{key:'no',label:'流水单号',type:'input',placeholder:'请输入流水单号'},{key:'merchant',label:'商家名称',type:'input',placeholder:'请输入商家名称'},{key:'type',label:'交易类型',type:'select',options:[{label:'全部类型',value:''},{label:'订单收入',value:'订单收入'},{label:'配送服务费',value:'配送服务费'},{label:'提现',value:'提现'}]},{key:'status',label:'结算状态',type:'select',options:statusOptions},{key:'date',label:'时间范围',type:'daterange'},{key:'region',label:'区域',type:'select',options:regionOptions}], actions:['导出流水','批量结算','对账中心'],
    columns:[{prop:'flowNo',label:'流水单号',minWidth:170},{prop:'merchant',label:'交易对象',minWidth:160},{prop:'tradeType',label:'类型',type:'tag',minWidth:110},{prop:'orderAmount',label:'订单金额',type:'money',minWidth:110},{prop:'fee',label:'平台服务费',type:'money',minWidth:120},{prop:'merchantIncome',label:'商家实收',type:'money',minWidth:120},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'settledAt',label:'结算时间',type:'date',minWidth:160}],
    sideTitle:'待处理财务事项', sideMetrics:[{title:'商家提现审核',desc:'待审核提现申请',value:0,icon:'CreditCard'},{title:'退款复核',desc:'待复核退款订单',value:0,icon:'Money'},{title:'对账异常',desc:'对账金额不一致',value:0,icon:'Warning'},{title:'发票申请',desc:'待处理发票申请',value:0,icon:'Document'}], chartTitle:'收入构成', detailTabs:['流水详情','订单关联','结算信息','对账日志']
  },
  contentAudit: {
    key:'contentAudit', title:'内容审核', subtitle:'审核帖子、评论、举报与社区安全风险，维护校园内容生态。', endpoint:'/content/reports',
    stats:[
      {label:'待审帖子',value:0,delta:'-',tone:'orange',icon:'Document',key:'pendingPosts'},
      {label:'待处理举报',value:0,delta:'-',tone:'red',icon:'Warning',key:'pendingReports'},
      {label:'今日评论',value:0,delta:'-',tone:'blue',icon:'ChatDotRound',key:'todayComments'},
      {label:'风险内容',value:0,delta:'-',tone:'purple',icon:'Filter',key:'riskContent'},
      {label:'已处理举报',value:0,delta:'-',tone:'green',icon:'CircleCheck',key:'handledReports'}
    ],
    search:[{key:'keyword',label:'关键词',type:'input',placeholder:'内容关键词/用户昵称'},{key:'type',label:'内容类型',type:'select',options:auditTypeOptions},{key:'reason',label:'举报类型',type:'input',placeholder:'广告/低俗/人身攻击'},{key:'status',label:'审核状态',type:'select',options:statusOptions},{key:'user',label:'发布用户',type:'input'},{key:'date',label:'发布时间',type:'daterange'}], actions:['批量通过','批量驳回','导出记录'],
    columns:[{prop:'content',label:'内容预览',type:'avatar',minWidth:260},{prop:'user',label:'发布者',type:'avatar',minWidth:150},{prop:'contentType',label:'类型',type:'tag',minWidth:90},{prop:'topic',label:'圈子/话题',minWidth:140},{prop:'reason',label:'举报原因',type:'tag',minWidth:130},{prop:'heat',label:'热度',type:'number',minWidth:90},{prop:'status',label:'审核状态',type:'tag',minWidth:110},{prop:'createdAt',label:'发布时间',type:'date',minWidth:160}],
    sideTitle:'高风险预警', sideMetrics:[{title:'色情低俗',desc:'图片/文本命中',value:0,icon:'Warning'},{title:'广告导流',desc:'外部联系方式',value:0,icon:'Promotion'},{title:'人身攻击',desc:'评论争议',value:0,icon:'ChatDotRound'},{title:'虚假信息',desc:'谣言/诈骗',value:0,icon:'Document'}], chartTitle:'审核分布', detailTabs:['内容详情','举报证据','审核建议','处罚记录']
  },
  posts: {
    key:'posts', title:'帖子管理', subtitle:'管理校园社区帖子、视频、投票、话题热榜和互动数据。', endpoint:'/note/list',
    stats:[
      {label:'帖子总数',value:0,delta:'-',tone:'blue',icon:'Document',key:'totalPosts'},
      {label:'今日发帖',value:0,delta:'-',tone:'green',icon:'Edit',key:'todayPosts'},
      {label:'待审核',value:0,delta:'-',tone:'orange',icon:'Clock',key:'pendingAudit'},
      {label:'举报内容',value:0,delta:'-',tone:'red',icon:'Warning',key:'reportedPosts'}
    ],
    search:[{key:'keyword',label:'内容关键词',type:'input'},{key:'topic',label:'话题/圈子',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions},{key:'date',label:'发布时间',type:'daterange'}], actions:['发布公告帖','批量推荐','批量下架','导出数据'],
    columns:[{prop:'content',label:'帖子标题',type:'avatar',minWidth:260},{prop:'user',label:'发布者',type:'avatar',minWidth:150},{prop:'topic',label:'话题',type:'tag',minWidth:110},{prop:'views',label:'浏览',type:'number',minWidth:90},{prop:'comments',label:'评论',type:'number',minWidth:90},{prop:'likes',label:'点赞',type:'number',minWidth:90},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'发布时间',type:'date',minWidth:160}],
    sideTitle:'热榜内容', sideMetrics:[{title:'待上热榜',value:0,desc:'互动增长快'},{title:'负面舆情',value:0,desc:'需运营关注'}], chartTitle:'内容互动趋势', detailTabs:['内容详情','互动数据','审核记录','举报记录']
  },
  marketing: {
    key:'marketing', title:'营销中心', subtitle:'管理优惠券、满减活动、团购、签到、徽章、分享邀请和活动审核。', endpoint:'/marketing/activities',
    stats:[
      {label:'活动总数',value:0,delta:'-',tone:'blue',icon:'Present',key:'total'},
      {label:'进行中',value:0,delta:'-',tone:'green',icon:'Promotion',key:'active'},
      {label:'待审核',value:0,delta:'-',tone:'orange',icon:'Clock',key:'pending'},
      {label:'核销金额',value:'¥0',delta:'-',tone:'purple',icon:'Money',key:'usedAmount'}
    ],
    search:[{key:'keyword',label:'活动名称',type:'input'},{key:'type',label:'活动类型',type:'select',options:[{label:'全部类型',value:''},{label:'优惠券',value:'优惠券'},{label:'团购',value:'团购'},{label:'满减',value:'满减'}]},{key:'status',label:'状态',type:'select',options:statusOptions},{key:'date',label:'活动时间',type:'daterange'}], actions:['创建活动','发放优惠券','批量下线','导出数据'],
    columns:[{prop:'activity',label:'活动名称',type:'avatar',minWidth:220},{prop:'activityType',label:'活动类型',type:'tag',minWidth:110},{prop:'merchant',label:'关联商家',minWidth:160},{prop:'budget',label:'预算',type:'money',minWidth:110},{prop:'used',label:'已核销',type:'money',minWidth:110},{prop:'conversion',label:'转化率',type:'progress',minWidth:120},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'创建时间',type:'date',minWidth:160}],
    sideTitle:'营销待办', sideMetrics:[{title:'活动审核',value:0,desc:'商家营销申请'},{title:'预算不足',value:0,desc:'活动即将暂停'},{title:'异常核销',value:0,desc:'需风控复核'}], chartTitle:'活动效果分布', detailTabs:['活动配置','优惠规则','参与商家','核销数据','风控记录']
  },
  delivery: {
    key:'delivery', title:'跑腿配送', subtitle:'管理跑腿订单、骑手、计费规则、配送范围和异常履约。', endpoint:'/delivery/orders',
    stats:[
      {label:'今日跑腿',value:0,delta:'-',tone:'blue',icon:'Bicycle',key:'todayOrders'},
      {label:'在线骑手',value:0,delta:'-',tone:'green',icon:'User',key:'onlineRiders'},
      {label:'待接单',value:0,delta:'-',tone:'orange',icon:'Clock',key:'pendingAccept'},
      {label:'超时订单',value:0,delta:'-',tone:'red',icon:'Warning',key:'overdue'}
    ],
    search:[{key:'keyword',label:'订单号/用户',type:'input'},{key:'rider',label:'骑手',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions},{key:'date',label:'下单时间',type:'daterange'}], actions:['派单中心','批量改派','骑手排班','导出订单'],
    columns:[{prop:'orderNo',label:'跑腿单号',minWidth:170},{prop:'user',label:'下单用户',type:'avatar',minWidth:150},{prop:'rider',label:'骑手',type:'avatar',minWidth:150},{prop:'serviceType',label:'服务类型',type:'tag',minWidth:110},{prop:'distance',label:'距离',minWidth:90},{prop:'amount',label:'费用',type:'money',minWidth:100},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'下单时间',type:'date',minWidth:160}],
    sideTitle:'调度提醒', sideMetrics:[{title:'待接单',value:0,desc:'超过5分钟'},{title:'骑手低电量',value:0,desc:'定位设备告警'},{title:'异常轨迹',value:0,desc:'轨迹偏离'}], chartTitle:'配送效率趋势', detailTabs:['订单信息','取送地址','骑手轨迹','计费明细','异常处理']
  },
  system: {
    key:'system', title:'系统设置', subtitle:'管理平台配置、权限角色、消息通知、安全策略、存储上传和第三方配置。', endpoint:'/system/systemSetting',
    stats:[
      {label:'角色数',value:0,delta:'-',tone:'blue',icon:'Lock',key:'roles'},
      {label:'管理员',value:0,delta:'-',tone:'green',icon:'User',key:'admins'},
      {label:'配置项',value:0,delta:'-',tone:'purple',icon:'Setting',key:'configs'},
      {label:'异常告警',value:0,delta:'-',tone:'red',icon:'Warning',key:'alerts'}
    ],
    search:[{key:'keyword',label:'配置名称',type:'input'},{key:'group',label:'配置分组',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions}], actions:['保存配置','恢复默认','导出配置'],
    columns:[{prop:'configName',label:'配置项',minWidth:180},{prop:'configGroup',label:'分组',type:'tag',minWidth:110},{prop:'value',label:'当前值',minWidth:170},{prop:'updatedBy',label:'更新人',type:'avatar',minWidth:150},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'更新时间',type:'date',minWidth:160}],
    sideTitle:'系统状态概览', sideMetrics:[{title:'在线终端',value:0,desc:'管理后台会话'},{title:'短信余额',value:0,desc:'条'},{title:'存储用量',value:'0%',desc:'对象存储'}], chartTitle:'配置变更趋势', detailTabs:['基础设置','权限角色','消息通知','安全策略','存储上传']
  },
  admins: {
    key:'admins', title:'管理员权限', subtitle:'管理后台账号、角色权限、数据范围、操作日志和安全策略。', endpoint:'/system/admin',
    stats:[
      {label:'管理员',value:0,delta:'-',tone:'blue',icon:'User',key:'admins'},
      {label:'角色',value:0,delta:'-',tone:'purple',icon:'Lock',key:'roles'},
      {label:'今日登录',value:0,delta:'-',tone:'green',icon:'Key',key:'todayLogins'},
      {label:'风险操作',value:0,delta:'-',tone:'red',icon:'Warning',key:'risks'}
    ],
    search:[{key:'keyword',label:'姓名/账号',type:'input'},{key:'role',label:'角色',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions}], actions:['新增管理员','创建角色','批量禁用','导出日志'],
    columns:[{prop:'admin',label:'管理员',type:'avatar',minWidth:180},{prop:'account',label:'账号',minWidth:130},{prop:'role',label:'角色',type:'tag',minWidth:120},{prop:'scope',label:'数据范围',minWidth:150},{prop:'lastLogin',label:'最近登录',type:'date',minWidth:160},{prop:'status',label:'状态',type:'tag',minWidth:100}],
    sideTitle:'权限审计', sideMetrics:[{title:'高危权限',value:0,desc:'含财务/删除'},{title:'异地登录',value:0,desc:'需确认'}], chartTitle:'管理员登录趋势', detailTabs:['账号信息','角色权限','数据范围','操作日志']
  },
  files: {
    key:'files', title:'文件中心', subtitle:'管理上传资源、图片视频、附件、对象存储、清理任务和违规文件。', endpoint:'/system/file',
    stats:[
      {label:'文件总数',value:0,delta:'-',tone:'blue',icon:'FolderOpened',key:'totalFiles'},
      {label:'存储占用',value:'0 B',delta:'-',tone:'purple',icon:'DataLine',key:'totalSize'},
      {label:'今日上传',value:0,delta:'-',tone:'orange',icon:'Upload',key:'todayFiles'},
      {label:'违规文件',value:0,delta:'-',tone:'red',icon:'Warning',key:'violations'}
    ],
    search:[{key:'keyword',label:'文件名',type:'input'},{key:'type',label:'文件类型',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions},{key:'date',label:'上传时间',type:'daterange'}], actions:['上传文件','批量删除','清理缓存','导出清单'],
    columns:[{prop:'file',label:'文件',type:'avatar',minWidth:220},{prop:'fileType',label:'类型',type:'tag',minWidth:90},{prop:'size',label:'大小',minWidth:100},{prop:'usage',label:'使用场景',minWidth:140},{prop:'uploader',label:'上传人',type:'avatar',minWidth:150},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'上传时间',type:'date',minWidth:160}],
    sideTitle:'存储提醒', sideMetrics:[{title:'大文件',value:0,desc:'超过100MB'},{title:'孤立文件',value:0,desc:'未关联业务'}], chartTitle:'存储类型占比', detailTabs:['文件信息','使用记录','访问日志','清理策略']
  }
}
