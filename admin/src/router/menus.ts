export const menuGroups = [
  { title:'运营总览', children:[{ path:'/dashboard', title:'控制台', icon:'House' }] },
  { title:'区域与用户', children:[{ path:'/region/list', title:'区域管理', icon:'Location' }, { path:'/region/config', title:'区域配置中心', icon:'Setting' }, { path:'/user/list', title:'用户管理', icon:'User' }, { path:'/user/verification', title:'学生认证', icon:'Checked' }] },
  { title:'商家与订单', children:[{ path:'/merchant/list', title:'商家管理', icon:'Shop' }, { path:'/merchant/products', title:'商品管理', icon:'Goods' }, { path:'/order/list', title:'订单中心', icon:'Tickets' }, { path:'/order/refunds', title:'退款售后', icon:'Money' }] },
  { title:'财务与内容', children:[{ path:'/finance/center', title:'财务中心', icon:'Wallet' }, { path:'/content/posts', title:'帖子管理', icon:'Document' }, { path:'/content/audit', title:'内容审核', icon:'Warning' }] },
  { title:'增长与履约', children:[{ path:'/marketing/center', title:'营销活动', icon:'Present' }, { path:'/delivery/center', title:'跑腿配送', icon:'Van' }] },
  { title:'系统治理', children:[{ path:'/system/settings', title:'系统设置', icon:'Tools' }, { path:'/system/admins', title:'管理员权限', icon:'Lock' }, { path:'/system/files', title:'文件中心', icon:'FolderOpened' }] }
]
