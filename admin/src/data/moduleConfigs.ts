import type { ModuleConfig } from '@/types/admin'
import { statusOptions, regionOptions, categoryOptions, auditTypeOptions } from './options'

export const moduleConfigs: Record<string, ModuleConfig> = {
  regions: {
    key: 'regions', title: '区域列表', subtitle: '管理校园区域、运营负责人、服务范围、财务规则和前端显示状态。', endpoint: '/region',
    stats: [
      { label:'区域总数', value:18, delta:'+2 本月', tone:'blue', icon:'Location' },
      { label:'启用区域', value:15, delta:'启用率 83.3%', tone:'green', icon:'CircleCheck' },
      { label:'区域用户', value:'42,890', delta:'+1,203 本周', tone:'purple', icon:'User' },
      { label:'区域GMV', value:'¥286万', delta:'+18.2%', tone:'orange', icon:'Money' }
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
    sideTitle:'区域待办', sideMetrics:[{title:'新增区域申请',desc:'等待总部审核',value:3,icon:'Location'},{title:'服务范围异常',desc:'配送范围冲突',value:2,icon:'Warning'},{title:'管理员变更',desc:'待确认交接',value:5,icon:'User'}], chartTitle:'区域GMV分布', detailTabs:['基础信息','运营数据','财务配置','页面配置','操作记录']
  },
  users: {
    key: 'users', title:'用户管理', subtitle:'管理平台用户信息、学生认证、用户标签、钱包积分和风控状态。', endpoint:'/user/list',
    stats:[{label:'总用户数',value:'12,532',delta:'+8.3%',tone:'blue',icon:'User'},{label:'今日新增',value:156,delta:'+12.5%',tone:'green',icon:'UserFilled'},{label:'活跃用户',value:'4,856',delta:'+6.7%',tone:'purple',icon:'TrendCharts'},{label:'待认证',value:382,delta:'-3.2%',down:true,tone:'orange',icon:'Medal'}],
    search:[{key:'keyword',label:'关键词',type:'input',placeholder:'昵称/用户ID/手机号'},{key:'date',label:'注册时间',type:'daterange'},{key:'status',label:'用户状态',type:'select',options:statusOptions},{key:'cert',label:'学生认证',type:'select',options:statusOptions},{key:'tag',label:'用户标签',type:'input',placeholder:'活跃用户/社区之星'},{key:'region',label:'所属区域',type:'select',options:regionOptions}],
    actions:['新增用户','导出数据','批量标签','批量禁用'],
    columns:[{prop:'user',label:'头像/昵称',type:'avatar',minWidth:180},{prop:'id',label:'用户ID',minWidth:120},{prop:'phone',label:'手机号',minWidth:130},{prop:'school',label:'学校/区域',minWidth:160},{prop:'cert',label:'学生认证',type:'tag',minWidth:110},{prop:'posts',label:'发帖数',type:'number',minWidth:90},{prop:'orders',label:'订单数',type:'number',minWidth:90},{prop:'amount',label:'消费金额',type:'money',minWidth:120},{prop:'status',label:'状态',type:'tag',minWidth:90},{prop:'createdAt',label:'注册时间',type:'date',minWidth:160}],
    sideTitle:'用户运营提醒', sideMetrics:[{title:'待认证用户',desc:'需审核学生材料',value:382,icon:'Checked'},{title:'异常登录',desc:'近24小时多地登录',value:12,icon:'Warning'},{title:'高价值用户流失',desc:'7天未活跃',value:46,icon:'TrendCharts'}], chartTitle:'用户增长趋势', detailTabs:['基础资料','学生认证','订单消费','钱包积分','风控记录']
  },
  verification: {
    key:'verification', title:'学生认证', subtitle:'审核学生证、校园邮箱、实名资料及人工复核结果。', endpoint:'/user/verification',
    stats:[{label:'待审核',value:126,delta:'需处理',tone:'orange',icon:'Clock'},{label:'今日通过',value:342,delta:'+18%',tone:'green',icon:'CircleCheck'},{label:'拒绝数量',value:21,delta:'资料不完整',tone:'red',icon:'CircleClose'},{label:'累计认证',value:'72,388',delta:'通过率91.4%',tone:'blue',icon:'Tickets'}],
    search:[{key:'keyword',label:'姓名/学校',type:'input'},{key:'school',label:'学校',type:'input'},{key:'status',label:'审核状态',type:'select',options:statusOptions},{key:'date',label:'提交时间',type:'daterange'}], actions:['批量通过','批量驳回','导出记录'],
    columns:[{prop:'user',label:'申请用户',type:'avatar',minWidth:180},{prop:'realName',label:'真实姓名',minWidth:110},{prop:'school',label:'学校',minWidth:170},{prop:'studentNo',label:'学号',minWidth:130},{prop:'cert',label:'材料',type:'image',minWidth:90},{prop:'status',label:'审核状态',type:'tag',minWidth:110},{prop:'createdAt',label:'提交时间',type:'date',minWidth:160}],
    sideTitle:'审核策略', sideMetrics:[{title:'OCR识别失败',desc:'需人工查看',value:18,icon:'Picture'},{title:'重复认证',desc:'同设备多账号',value:7,icon:'Warning'}], chartTitle:'认证通过率', detailTabs:['认证材料','用户信息','审核记录']
  },
  merchants: {
    key:'merchants', title:'商家管理', subtitle:'管理商家入驻、经营状态、分类评分、资质风控、商品和结算信息。', endpoint:'/merchant/list',
    stats:[{label:'商家总数',value:928,delta:'+17 本月',tone:'blue',icon:'Shop'},{label:'今日新增',value:23,delta:'+21.1%',tone:'green',icon:'Plus'},{label:'营业中',value:693,delta:'在线率74.6%',tone:'cyan',icon:'CircleCheck'},{label:'待审核',value:34,delta:'入驻申请',tone:'orange',icon:'Clock'},{label:'风险商家',value:8,delta:'需巡检',tone:'red',icon:'Warning'}],
    search:[{key:'keyword',label:'商家名称',type:'input',placeholder:'商家名称/联系人'},{key:'phone',label:'联系人/手机号',type:'input'},{key:'status',label:'经营状态',type:'select',options:statusOptions},{key:'category',label:'商家分类',type:'select',options:categoryOptions},{key:'region',label:'所属区域',type:'select',options:regionOptions},{key:'date',label:'入驻时间',type:'daterange'}], actions:['新增商家','导出数据','批量审核','批量下架'],
    columns:[{prop:'merchant',label:'店铺信息',type:'avatar',minWidth:190},{prop:'id',label:'商家ID',minWidth:130},{prop:'category',label:'分类',type:'tag',minWidth:110},{prop:'region',label:'区域',minWidth:110},{prop:'contact',label:'联系人',minWidth:130},{prop:'status',label:'营业状态',type:'tag',minWidth:110},{prop:'score',label:'评分',type:'rating',minWidth:110},{prop:'sales',label:'月销量',type:'number',minWidth:100},{prop:'settle',label:'结算状态',type:'tag',minWidth:110},{prop:'createdAt',label:'入驻时间',type:'date',minWidth:160}],
    sideTitle:'待处理事项', sideMetrics:[{title:'入驻审核',desc:'新商家申请',value:23,icon:'Shop'},{title:'资质补充',desc:'证照即将过期',value:11,icon:'Document'},{title:'店铺巡检',desc:'低分门店',value:8,icon:'Warning'},{title:'差评预警',desc:'近24小时集中差评',value:6,icon:'ChatDotRound'}], chartTitle:'商家分类分布', detailTabs:['门店信息','资质证照','商品菜单','配送规则','财务结算','评价记录']
  },
  products: {
    key:'products', title:'商品管理', subtitle:'管理商家商品、分类、库存、上下架、价格和审核状态。', endpoint:'/merchant/products',
    stats:[{label:'商品总数',value:'18,902',delta:'+508 本周',tone:'blue',icon:'Goods'},{label:'上架商品',value:'15,230',delta:'上架率80.5%',tone:'green',icon:'CircleCheck'},{label:'待审核',value:245,delta:'需处理',tone:'orange',icon:'Clock'},{label:'违规下架',value:32,delta:'本周',tone:'red',icon:'Warning'}],
    search:[{key:'keyword',label:'商品名称',type:'input'},{key:'merchant',label:'商家',type:'input'},{key:'category',label:'分类',type:'select',options:categoryOptions},{key:'status',label:'状态',type:'select',options:statusOptions}], actions:['新增商品','批量上架','批量下架','导出商品'],
    columns:[{prop:'product',label:'商品',type:'avatar',minWidth:200},{prop:'merchant',label:'所属商家',minWidth:160},{prop:'category',label:'分类',type:'tag',minWidth:100},{prop:'price',label:'价格',type:'money',minWidth:100},{prop:'stock',label:'库存',type:'number',minWidth:90},{prop:'sales',label:'销量',type:'number',minWidth:90},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'更新时间',type:'date',minWidth:160}],
    sideTitle:'商品风险', sideMetrics:[{title:'待审核商品',value:245,desc:'新提交/修改'},{title:'库存告警',value:39,desc:'库存低于阈值'},{title:'价格异常',value:6,desc:'价格波动过大'}], chartTitle:'分类销量占比', detailTabs:['商品信息','规格库存','审核记录','销售数据']
  },
  orders: {
    key:'orders', title:'订单中心', subtitle:'实时监控订单状态，提升履约效率，优化用户体验。', endpoint:'/orders',
    stats:[{label:'今日订单',value:'2,458',delta:'+18.6%',tone:'blue',icon:'Tickets'},{label:'待付款',value:156,delta:'-6.5%',down:true,tone:'orange',icon:'Wallet'},{label:'待配送',value:423,delta:'+12.3%',tone:'purple',icon:'Van'},{label:'退款中',value:38,delta:'+2.7%',down:true,tone:'cyan',icon:'Money'},{label:'已完成',value:'1,852',delta:'+21.9%',tone:'green',icon:'CircleCheck'},{label:'异常订单',value:23,delta:'-15.2%',down:true,tone:'red',icon:'Warning'}],
    search:[{key:'orderNo',label:'订单号',type:'input',placeholder:'请输入订单号'},{key:'user',label:'用户',type:'input',placeholder:'搜索用户名/手机号'},{key:'merchant',label:'商家',type:'input',placeholder:'搜索商家名称'},{key:'type',label:'订单类型',type:'select',options:[{label:'全部类型',value:''},{label:'外卖订单',value:'外卖订单'},{label:'自提订单',value:'自提订单'},{label:'跑腿订单',value:'跑腿订单'}]},{key:'payStatus',label:'支付状态',type:'select',options:statusOptions},{key:'status',label:'订单状态',type:'select',options:statusOptions},{key:'delivery',label:'配送方式',type:'select',options:[{label:'全部方式',value:''},{label:'平台配送',value:'平台配送'},{label:'商家自提',value:'商家自提'}]},{key:'date',label:'时间范围',type:'daterange'}], actions:['导出订单','批量处理','刷新'],
    columns:[{prop:'orderNo',label:'订单号',minWidth:170},{prop:'user',label:'用户信息',type:'avatar',minWidth:160},{prop:'merchant',label:'商家',minWidth:160},{prop:'orderType',label:'订单类型',type:'tag',minWidth:110},{prop:'goodsAmount',label:'商品金额',type:'money',minWidth:110},{prop:'deliveryFee',label:'配送费',type:'money',minWidth:100},{prop:'amount',label:'实付金额',type:'money',minWidth:110},{prop:'payStatus',label:'支付状态',type:'tag',minWidth:100},{prop:'status',label:'订单状态',type:'tag',minWidth:100},{prop:'deliveryType',label:'配送方式',minWidth:110},{prop:'createdAt',label:'下单时间',type:'date',minWidth:150}],
    sideTitle:'异常订单提醒', sideMetrics:[{title:'超时未支付订单',desc:'超过30分钟未支付',value:12,icon:'Clock'},{title:'配送超时订单',desc:'超过预计送达时间',value:6,icon:'Van'},{title:'退款处理中',desc:'需人工处理退款',value:3,icon:'Money'},{title:'用户投诉订单',desc:'等待处理',value:2,icon:'Warning'}], chartTitle:'订单状态分布', detailTabs:['订单信息','商品明细','配送轨迹','支付退款','操作日志']
  },
  refunds: {
    key:'refunds', title:'退款售后', subtitle:'处理退款申请、售后纠纷、商家申诉和平台补偿。', endpoint:'/refunds',
    stats:[{label:'待处理退款',value:38,delta:'需审核',tone:'red',icon:'Money'},{label:'今日退款',value:'¥8,954',delta:'+6.2%',down:true,tone:'orange',icon:'Wallet'},{label:'已通过',value:126,delta:'近7日',tone:'green',icon:'CircleCheck'},{label:'商家申诉',value:7,delta:'待复核',tone:'purple',icon:'Warning'}],
    search:[{key:'keyword',label:'订单号/用户',type:'input'},{key:'merchant',label:'商家',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions},{key:'date',label:'申请时间',type:'daterange'}], actions:['批量同意','批量驳回','导出售后'],
    columns:[{prop:'orderNo',label:'售后单号',minWidth:170},{prop:'user',label:'申请用户',type:'avatar',minWidth:160},{prop:'merchant',label:'商家',minWidth:160},{prop:'reason',label:'退款原因',minWidth:160},{prop:'amount',label:'退款金额',type:'money',minWidth:110},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'申请时间',type:'date',minWidth:160}],
    sideTitle:'售后风险', sideMetrics:[{title:'频繁退款用户',value:9,desc:'7天3次以上'},{title:'高争议商家',value:4,desc:'申诉率较高'}], chartTitle:'退款原因分布', detailTabs:['申请信息','订单详情','协商记录','退款日志']
  },
  finance: {
    key:'finance', title:'财务中心', subtitle:'实时监控平台收入、结算、退款与提现等财务数据。', endpoint:'/finance/transactions',
    stats:[{label:'今日收入',value:'¥89,245.68',delta:'+18.62%',tone:'purple',icon:'Wallet'},{label:'平台抽成',value:'¥12,568.32',delta:'+16.35%',tone:'orange',icon:'PieChart'},{label:'待结算商家',value:'¥156,328.21',delta:'+22.14%',tone:'blue',icon:'Shop'},{label:'提现申请',value:'¥63,452.10',delta:'+8.74%',down:true,tone:'green',icon:'CreditCard'},{label:'退款金额',value:'¥8,954.21',delta:'+6.21%',down:true,tone:'red',icon:'Money'},{label:'异常流水',value:'¥1,254.32',delta:'-12.43%',tone:'cyan',icon:'Warning'}],
    search:[{key:'no',label:'流水单号',type:'input',placeholder:'请输入流水单号'},{key:'merchant',label:'商家名称',type:'input',placeholder:'请输入商家名称'},{key:'type',label:'交易类型',type:'select',options:[{label:'全部类型',value:''},{label:'订单收入',value:'订单收入'},{label:'配送服务费',value:'配送服务费'},{label:'提现',value:'提现'}]},{key:'status',label:'结算状态',type:'select',options:statusOptions},{key:'date',label:'时间范围',type:'daterange'},{key:'region',label:'区域',type:'select',options:regionOptions}], actions:['导出流水','批量结算','对账中心'],
    columns:[{prop:'flowNo',label:'流水单号',minWidth:170},{prop:'merchant',label:'交易对象',minWidth:160},{prop:'tradeType',label:'类型',type:'tag',minWidth:110},{prop:'orderAmount',label:'订单金额',type:'money',minWidth:110},{prop:'fee',label:'平台服务费',type:'money',minWidth:120},{prop:'merchantIncome',label:'商家实收',type:'money',minWidth:120},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'settledAt',label:'结算时间',type:'date',minWidth:160}],
    sideTitle:'待处理财务事项', sideMetrics:[{title:'商家提现审核',desc:'待审核提现申请',value:23,icon:'CreditCard'},{title:'退款复核',desc:'待复核退款订单',value:15,icon:'Money'},{title:'对账异常',desc:'对账金额不一致',value:8,icon:'Warning'},{title:'发票申请',desc:'待处理发票申请',value:12,icon:'Document'}], chartTitle:'收入构成', detailTabs:['流水详情','订单关联','结算信息','对账日志']
  },
  contentAudit: {
    key:'contentAudit', title:'内容审核', subtitle:'审核帖子、评论、举报与社区安全风险，维护校园内容生态。', endpoint:'/content/reports',
    stats:[{label:'待审核帖子',value:486,delta:'+38 今日',tone:'orange',icon:'Document'},{label:'待处理举报',value:143,delta:'需人工处理',tone:'red',icon:'Warning'},{label:'今日新增评论',value:'8,902',delta:'+12.8%',tone:'blue',icon:'ChatDotRound'},{label:'风险内容',value:57,delta:'机器命中',tone:'purple',icon:'Filter'},{label:'已处理申诉',value:219,delta:'近7日',tone:'green',icon:'CircleCheck'}],
    search:[{key:'keyword',label:'关键词',type:'input',placeholder:'内容关键词/用户昵称'},{key:'type',label:'内容类型',type:'select',options:auditTypeOptions},{key:'reason',label:'举报类型',type:'input',placeholder:'广告/低俗/人身攻击'},{key:'status',label:'审核状态',type:'select',options:statusOptions},{key:'user',label:'发布用户',type:'input'},{key:'date',label:'发布时间',type:'daterange'}], actions:['批量通过','批量驳回','导出记录'],
    columns:[{prop:'content',label:'内容预览',type:'avatar',minWidth:260},{prop:'user',label:'发布者',type:'avatar',minWidth:150},{prop:'contentType',label:'类型',type:'tag',minWidth:90},{prop:'topic',label:'圈子/话题',minWidth:140},{prop:'reason',label:'举报原因',type:'tag',minWidth:130},{prop:'heat',label:'热度',type:'number',minWidth:90},{prop:'status',label:'审核状态',type:'tag',minWidth:110},{prop:'createdAt',label:'发布时间',type:'date',minWidth:160}],
    sideTitle:'高风险预警', sideMetrics:[{title:'色情低俗',desc:'图片/文本命中',value:12,icon:'Warning'},{title:'广告导流',desc:'外部联系方式',value:34,icon:'Promotion'},{title:'人身攻击',desc:'评论争议',value:18,icon:'ChatDotRound'},{title:'虚假信息',desc:'谣言/诈骗',value:7,icon:'Document'}], chartTitle:'审核分布', detailTabs:['内容详情','举报证据','审核建议','处罚记录']
  },
  posts: {
    key:'posts', title:'帖子管理', subtitle:'管理校园社区帖子、视频、投票、话题热榜和互动数据。', endpoint:'/note/list',
    stats:[{label:'帖子总数',value:'328,901',delta:'+1,208 今日',tone:'blue',icon:'Document'},{label:'今日发帖',value:'2,192',delta:'+9.6%',tone:'green',icon:'Edit'},{label:'待审核',value:486,delta:'机器命中',tone:'orange',icon:'Clock'},{label:'举报内容',value:92,delta:'需复核',tone:'red',icon:'Warning'}],
    search:[{key:'keyword',label:'内容关键词',type:'input'},{key:'topic',label:'话题/圈子',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions},{key:'date',label:'发布时间',type:'daterange'}], actions:['发布公告帖','批量推荐','批量下架','导出数据'],
    columns:[{prop:'content',label:'帖子标题',type:'avatar',minWidth:260},{prop:'user',label:'发布者',type:'avatar',minWidth:150},{prop:'topic',label:'话题',type:'tag',minWidth:110},{prop:'views',label:'浏览',type:'number',minWidth:90},{prop:'comments',label:'评论',type:'number',minWidth:90},{prop:'likes',label:'点赞',type:'number',minWidth:90},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'发布时间',type:'date',minWidth:160}],
    sideTitle:'热榜内容', sideMetrics:[{title:'待上热榜',value:12,desc:'互动增长快'},{title:'负面舆情',value:5,desc:'需运营关注'}], chartTitle:'内容互动趋势', detailTabs:['内容详情','互动数据','审核记录','举报记录']
  },
  marketing: {
    key:'marketing', title:'营销中心', subtitle:'管理优惠券、满减活动、团购、签到、徽章、分享邀请和活动审核。', endpoint:'/marketing/activities',
    stats:[{label:'活动总数',value:126,delta:'+12 本月',tone:'blue',icon:'Present'},{label:'进行中',value:38,delta:'曝光增长',tone:'green',icon:'Promotion'},{label:'待审核',value:9,delta:'商家提交',tone:'orange',icon:'Clock'},{label:'核销金额',value:'¥68,902',delta:'+15.2%',tone:'purple',icon:'Money'}],
    search:[{key:'keyword',label:'活动名称',type:'input'},{key:'type',label:'活动类型',type:'select',options:[{label:'全部类型',value:''},{label:'优惠券',value:'优惠券'},{label:'团购',value:'团购'},{label:'满减',value:'满减'}]},{key:'status',label:'状态',type:'select',options:statusOptions},{key:'date',label:'活动时间',type:'daterange'}], actions:['创建活动','发放优惠券','批量下线','导出数据'],
    columns:[{prop:'activity',label:'活动名称',type:'avatar',minWidth:220},{prop:'activityType',label:'活动类型',type:'tag',minWidth:110},{prop:'merchant',label:'关联商家',minWidth:160},{prop:'budget',label:'预算',type:'money',minWidth:110},{prop:'used',label:'已核销',type:'money',minWidth:110},{prop:'conversion',label:'转化率',type:'progress',minWidth:120},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'创建时间',type:'date',minWidth:160}],
    sideTitle:'营销待办', sideMetrics:[{title:'活动审核',value:9,desc:'商家营销申请'},{title:'预算不足',value:4,desc:'活动即将暂停'},{title:'异常核销',value:3,desc:'需风控复核'}], chartTitle:'活动效果分布', detailTabs:['活动配置','优惠规则','参与商家','核销数据','风控记录']
  },
  delivery: {
    key:'delivery', title:'跑腿配送', subtitle:'管理跑腿订单、骑手、计费规则、配送范围和异常履约。', endpoint:'/delivery/orders',
    stats:[{label:'今日跑腿',value:426,delta:'+11.2%',tone:'blue',icon:'Bicycle'},{label:'在线骑手',value:86,delta:'在线率72%',tone:'green',icon:'User'},{label:'待接单',value:32,delta:'需调度',tone:'orange',icon:'Clock'},{label:'超时订单',value:8,delta:'需处理',tone:'red',icon:'Warning'}],
    search:[{key:'keyword',label:'订单号/用户',type:'input'},{key:'rider',label:'骑手',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions},{key:'date',label:'下单时间',type:'daterange'}], actions:['派单中心','批量改派','骑手排班','导出订单'],
    columns:[{prop:'orderNo',label:'跑腿单号',minWidth:170},{prop:'user',label:'下单用户',type:'avatar',minWidth:150},{prop:'rider',label:'骑手',type:'avatar',minWidth:150},{prop:'serviceType',label:'服务类型',type:'tag',minWidth:110},{prop:'distance',label:'距离',minWidth:90},{prop:'amount',label:'费用',type:'money',minWidth:100},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'下单时间',type:'date',minWidth:160}],
    sideTitle:'调度提醒', sideMetrics:[{title:'待接单',value:32,desc:'超过5分钟'},{title:'骑手低电量',value:6,desc:'定位设备告警'},{title:'异常轨迹',value:4,desc:'轨迹偏离'}], chartTitle:'配送效率趋势', detailTabs:['订单信息','取送地址','骑手轨迹','计费明细','异常处理']
  },
  system: {
    key:'system', title:'系统设置', subtitle:'管理平台配置、权限角色、消息通知、安全策略、存储上传和第三方配置。', endpoint:'/system/systemSetting',
    stats:[{label:'角色数',value:12,delta:'权限组',tone:'blue',icon:'Lock'},{label:'管理员',value:36,delta:'8人在线',tone:'green',icon:'User'},{label:'配置项',value:128,delta:'已启用',tone:'purple',icon:'Setting'},{label:'最近告警',value:3,delta:'需处理',tone:'red',icon:'Warning'}],
    search:[{key:'keyword',label:'配置名称',type:'input'},{key:'group',label:'配置分组',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions}], actions:['保存配置','恢复默认','导出配置'],
    columns:[{prop:'configName',label:'配置项',minWidth:180},{prop:'configGroup',label:'分组',type:'tag',minWidth:110},{prop:'value',label:'当前值',minWidth:170},{prop:'updatedBy',label:'更新人',type:'avatar',minWidth:150},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'更新时间',type:'date',minWidth:160}],
    sideTitle:'系统状态概览', sideMetrics:[{title:'在线终端',value:18,desc:'管理后台会话'},{title:'短信余额',value:'8,920',desc:'条'},{title:'存储用量',value:'62%',desc:'对象存储'}], chartTitle:'配置变更趋势', detailTabs:['基础设置','权限角色','消息通知','安全策略','存储上传']
  },
  admins: {
    key:'admins', title:'管理员权限', subtitle:'管理后台账号、角色权限、数据范围、操作日志和安全策略。', endpoint:'/system/admin',
    stats:[{label:'管理员',value:36,delta:'8人在线',tone:'blue',icon:'User'},{label:'角色',value:12,delta:'权限模板',tone:'purple',icon:'Lock'},{label:'今日登录',value:58,delta:'+5',tone:'green',icon:'Key'},{label:'风险操作',value:4,delta:'需审计',tone:'red',icon:'Warning'}],
    search:[{key:'keyword',label:'姓名/账号',type:'input'},{key:'role',label:'角色',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions}], actions:['新增管理员','创建角色','批量禁用','导出日志'],
    columns:[{prop:'admin',label:'管理员',type:'avatar',minWidth:180},{prop:'account',label:'账号',minWidth:130},{prop:'role',label:'角色',type:'tag',minWidth:120},{prop:'scope',label:'数据范围',minWidth:150},{prop:'lastLogin',label:'最近登录',type:'date',minWidth:160},{prop:'status',label:'状态',type:'tag',minWidth:100}],
    sideTitle:'权限审计', sideMetrics:[{title:'高危权限',value:5,desc:'含财务/删除'},{title:'异地登录',value:2,desc:'需确认'}], chartTitle:'管理员登录趋势', detailTabs:['账号信息','角色权限','数据范围','操作日志']
  },
  files: {
    key:'files', title:'文件中心', subtitle:'管理上传资源、图片视频、附件、对象存储、清理任务和违规文件。', endpoint:'/system/file',
    stats:[{label:'文件总数',value:'86,902',delta:'+1,302 本周',tone:'blue',icon:'FolderOpened'},{label:'存储占用',value:'1.86TB',delta:'62%',tone:'purple',icon:'DataLine'},{label:'待清理',value:428,delta:'临时文件',tone:'orange',icon:'Delete'},{label:'违规文件',value:13,delta:'需处理',tone:'red',icon:'Warning'}],
    search:[{key:'keyword',label:'文件名',type:'input'},{key:'type',label:'文件类型',type:'input'},{key:'status',label:'状态',type:'select',options:statusOptions},{key:'date',label:'上传时间',type:'daterange'}], actions:['上传文件','批量删除','清理缓存','导出清单'],
    columns:[{prop:'file',label:'文件',type:'avatar',minWidth:220},{prop:'fileType',label:'类型',type:'tag',minWidth:90},{prop:'size',label:'大小',minWidth:100},{prop:'usage',label:'使用场景',minWidth:140},{prop:'uploader',label:'上传人',type:'avatar',minWidth:150},{prop:'status',label:'状态',type:'tag',minWidth:100},{prop:'createdAt',label:'上传时间',type:'date',minWidth:160}],
    sideTitle:'存储提醒', sideMetrics:[{title:'大文件',value:76,desc:'超过100MB'},{title:'孤立文件',value:428,desc:'未关联业务'}], chartTitle:'存储类型占比', detailTabs:['文件信息','使用记录','访问日志','清理策略']
  }
}
