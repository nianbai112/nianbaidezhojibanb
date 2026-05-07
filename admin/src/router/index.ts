import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import MainLayout from '@/layout/MainLayout.vue'

const routes: RouteRecordRaw[] = [
  { path:'/', redirect:'/dashboard' },
  { path:'/login', component:()=>import('@/views/auth/Login.vue'), meta:{ public:true, title:'登录' } },
  { path:'/', component:MainLayout, children:[
    { path:'dashboard', component:()=>import('@/views/dashboard/OperationsDashboard.vue'), meta:{ title:'运营控制台' } },
    { path:'region/list', component:()=>import('@/views/modules/RegionsPage.vue'), meta:{ title:'区域管理' } },
    { path:'region/config', component:()=>import('@/views/region/RegionConfigCenter.vue'), meta:{ title:'区域配置中心' } },
    { path:'user/list', component:()=>import('@/views/modules/UsersPage.vue'), meta:{ title:'用户管理' } },
    { path:'user/verification', component:()=>import('@/views/modules/VerificationPage.vue'), meta:{ title:'学生认证' } },
    { path:'merchant/list', component:()=>import('@/views/modules/MerchantsPage.vue'), meta:{ title:'商家管理' } },
    { path:'merchant/products', component:()=>import('@/views/modules/ProductsPage.vue'), meta:{ title:'商品管理' } },
    { path:'order/list', component:()=>import('@/views/modules/OrdersPage.vue'), meta:{ title:'订单中心' } },
    { path:'order/refunds', component:()=>import('@/views/modules/RefundsPage.vue'), meta:{ title:'退款售后' } },
    { path:'finance/center', component:()=>import('@/views/modules/FinancePage.vue'), meta:{ title:'财务中心' } },
    { path:'content/posts', component:()=>import('@/views/modules/PostsPage.vue'), meta:{ title:'帖子管理' } },
    { path:'content/audit', component:()=>import('@/views/modules/ContentAuditPage.vue'), meta:{ title:'内容审核' } },
    { path:'marketing/center', component:()=>import('@/views/modules/MarketingPage.vue'), meta:{ title:'营销活动' } },
    { path:'delivery/center', component:()=>import('@/views/modules/DeliveryPage.vue'), meta:{ title:'跑腿配送' } },
    { path:'system/settings', component:()=>import('@/views/system/SystemSettings.vue'), meta:{ title:'系统设置' } },
    { path:'system/admins', component:()=>import('@/views/modules/AdminsPage.vue'), meta:{ title:'管理员权限' } },
    { path:'system/files', component:()=>import('@/views/modules/FilesPage.vue'), meta:{ title:'文件中心' } }
  ] },
  { path:'/:pathMatch(.*)*', component:()=>import('@/views/error/NotFound.vue') }
]

const router = createRouter({ history:createWebHistory(), routes })
router.beforeEach((to)=> {
  const token = localStorage.getItem('LM_ADMIN_TOKEN') || localStorage.getItem('admin_token')
  if (!to.meta.public && !token) return '/login'
  if (to.path === '/login' && token) return '/dashboard'
})
export default router
