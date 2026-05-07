const names = ['小熊软糖','奶茶三分糖','清风徐来','跑腿小能手','篮球少年','草莓味的风','张小明','李同学','王同学','陈同学']
const schools = ['广东工业大学 大学城校区','华南理工大学 五山校区','广州大学 大学城校区','中山大学 南校区','暨南大学 石牌校区','华南师范大学 大学城校区']
const merchants = ['蜜雪冰城（东校区店）','瑞幸咖啡（校内店）','塔斯汀·中国汉堡','正新鸡排（南校区店）','杨国福麻辣烫','书亦烧仙草（北区店）','沪上阿姨（南门店）','小李便利店']
const regions = ['东校区','西校区','南校区','北校区','新区校区']
const statuses = ['正常','已认证','待审核','营业中','待结算','已结算','已完成','配送中','待付款','退款中','禁用','异常']
const categories = ['餐饮外卖','超市便利','奶茶饮品','跑腿服务','生活服务']
function pick<T>(arr:T[], i:number){ return arr[i % arr.length] }
function day(i:number){ return `2025-05-${String(19 - (i % 7)).padStart(2,'0')} ${String(14 - (i%6)).padStart(2,'0')}:${String(32 - (i*3%29)).padStart(2,'0')}` }
function userObj(i:number){ return { name: pick(names,i), sub: `${130+i}****${5678+i}`, avatar: pick(names,i).slice(0,1) } }
function merchantObj(i:number){ return { name: pick(merchants,i), sub: pick(regions,i), avatar: pick(merchants,i).slice(0,1) } }

export function rowsFor(key:string, count=10){
  return Array.from({length: count}).map((_,i)=>{
    const n=i+1
    const base:any = { id:`U1000234${n}`, user:userObj(i), admin:userObj(i+2), createdAt:day(i), status:pick(statuses,i), region:pick(regions,i), amount: 68.9 + i*432.16, gmv: 72341 + i*12345, score: (4.2 + (i%7)/10).toFixed(1), sales: 132 + i*23 }
    if(key==='regions') return { ...base, name:{name:pick(regions,i), sub:`REGION-${1000+i}`, avatar:pick(regions,i).slice(0,1)}, code:`EAST-${1000+i}`, city:['广州','深圳','佛山','珠海'][i%4], userCount:1842+i*682, merchantCount:88+i*13, status:i%5===0?'禁用':'正常' }
    if(key==='users') return { ...base, id:`U1000234${n}`, user:userObj(i), phone:`13${i}****${5678+i}`, school:pick(schools,i), cert:i%3===0?'未认证':'已认证', posts:2+i*7, orders:1+i*5, amount:68.9+i*688, status:i%6===0?'禁用':'正常' }
    if(key==='verification') return { ...base, user:userObj(i), realName:['张伟','李娜','王勇','赵敏'][i%4], school:pick(schools,i).split(' ')[0], studentNo:`20230${i}88${i}`, cert:{name:'学生证', sub:'点击预览', avatar:'证'}, status:i%4===0?'待审核':i%5===0?'拒绝':'已认证' }
    if(key==='merchants') return { ...base, merchant:merchantObj(i), id:`M202505${1000+i}`, category:pick(categories,i), contact:`${pick(names,i)} / 13${i}****${5678+i}`, status:i%5===0?'待审核':i%7===0?'异常':'营业中', settle:i%4===0?'待结算':'已结算' }
    if(key==='products') return { ...base, product:{name:['招牌柠檬茶','原味鸡排','冰美式','麻辣烫套餐','校园便当'][i%5], sub:pick(merchants,i), avatar:'品'}, merchant:pick(merchants,i), category:pick(categories,i), price:8+i*3.5, stock:20+i*8, status:i%4===0?'待审核':'正常' }
    if(key==='orders') return { ...base, orderNo:`DD20250519000${n}`, user:userObj(i), merchant:pick(merchants,i), orderType:i%3===0?'自提订单':'外卖订单', goodsAmount:18+i*7, deliveryFee:i%3===0?0:2.5, amount:20.5+i*7.5, payStatus:i%4===0?'待支付':'已支付', status:['配送中','待自提','待付款','已完成','已取消','退款中'][i%6], deliveryType:i%3===0?'商家自提':'平台配送' }
    if(key==='refunds') return { ...base, orderNo:`RF20250519000${n}`, user:userObj(i), merchant:pick(merchants,i), reason:['商品缺货','配送超时','商家拒单','用户误拍'][i%4], amount:18+i*11, status:['待审核','已退款','商家申诉','已拒绝'][i%4] }
    if(key==='finance') return { ...base, flowNo:`FS2025051900${String(n).padStart(2,'0')}`, merchant:pick(merchants,i), tradeType:i%4===0?'配送服务费':'订单收入', orderAmount:56+i*23, fee:5.6+i*2.3, merchantIncome:50.4+i*20, status:i%5===0?'待结算':i%8===0?'退款':'已结算', settledAt:i%5===0?'--':day(i) }
    if(key==='contentAudit') return { ...base, content:{name:['校园二手出一台显示器','求问东区食堂营业时间','有人捡到校园卡吗','商家广告刷屏举报'][i%4], sub:'内容摘要：这里展示帖子或评论的前 30 个字...', avatar:'文'}, user:userObj(i), contentType:['帖子','评论','举报','话题'][i%4], topic:['校园互助','二手交易','吃喝玩乐','失物招领'][i%4], reason:['广告导流','人身攻击','低俗内容','虚假信息'][i%4], heat:120+i*86, status:i%3===0?'待审核':'已处理' }
    if(key==='posts') return { ...base, content:{name:['今晚操场有人打球吗？','东区新开奶茶测评','二手书低价出','求拼车去高铁站'][i%4], sub:'帖子摘要内容展示，用于运营快速判断...', avatar:'帖'}, user:userObj(i), topic:['校园互助','美食分享','二手交易','拼车出行'][i%4], views:900+i*120, comments:12+i*6, likes:36+i*11, status:i%5===0?'待审核':'正常' }
    if(key==='marketing') return { ...base, activity:{name:['新生开学季满减','奶茶第二杯半价','校园团购节','跑腿免配送费'][i%4], sub:'营销活动 / 覆盖东校区', avatar:'促'}, activityType:['优惠券','满减','团购','补贴'][i%4], merchant:pick(merchants,i), budget:2000+i*500, used:580+i*208, conversion: 20 + i*7, status:i%4===0?'待审核':'进行中' }
    if(key==='delivery') return { ...base, orderNo:`PT20250519000${n}`, user:userObj(i), rider:userObj(i+3), serviceType:['代取快递','代买饭','文件代送','排队服务'][i%4], distance:`${(1.2+i*.4).toFixed(1)}km`, amount:6+i*2, status:['待接单','配送中','已完成','异常'][i%4] }
    if(key==='system') return { ...base, configName:['平台名称','登录验证码','默认抽成比例','上传文件大小','短信通知开关'][i%5], configGroup:['基础设置','安全策略','财务规则','文件上传','消息通知'][i%5], value:['校园本地生活','开启','8%','20MB','开启'][i%5], updatedBy:userObj(i), status:'正常' }
    if(key==='admins') return { ...base, admin:userObj(i), account:`admin${100+i}`, role:['超级管理员','运营管理员','财务管理员','审核员'][i%4], scope:pick(regions,i), lastLogin:day(i), status:i%6===0?'禁用':'正常' }
    if(key==='files') return { ...base, file:{name:['banner-east.png','merchant-logo.jpg','student-card.jpeg','activity-video.mp4'][i%4], sub:'oss://campus/assets/', avatar:'文'}, fileType:['图片','视频','附件','证照'][i%4], size:[ '285KB','1.2MB','860KB','28MB'][i%4], usage:['首页轮播','商家头像','学生认证','活动素材'][i%4], uploader:userObj(i), status:i%5===0?'待清理':'正常' }
    return base
  })
}
