<template>
  <div class="campaign-page">
    <PageHeader title="运营活动中心" subtitle="按运营目标创建活动，底层自动衔接优惠券、分享有礼、会员运营、区域和商家配置" icon="Promotion">
      <template #actions>
        <el-button :icon="DataLine" @click="go('/marketing/overview')">数据概览</el-button>
        <el-button :icon="Promotion" @click="openCampaign()">创建活动</el-button>
        <el-button type="primary" :icon="Ticket" @click="go('/marketing/coupons?create=1')">创建优惠券</el-button>
      </template>
    </PageHeader>

    <section class="summary-band">
      <div v-for="item in summary" :key="item.label" class="summary-item">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.tip }}</small>
      </div>
    </section>

    <section class="workflow-band">
      <div class="section-heading">
        <div>
          <span>推荐流程</span>
          <h3>运营者只需要按目标选择模板</h3>
        </div>
      </div>
      <div class="workflow-steps">
        <div v-for="step in workflow" :key="step.title" class="workflow-step">
          <div class="step-index">{{ step.index }}</div>
          <div>
            <strong>{{ step.title }}</strong>
            <p>{{ step.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="template-band">
      <div class="section-heading">
        <div>
          <span>活动模板</span>
          <h3>选择要达成的运营目标</h3>
        </div>
        <el-segmented v-model="activeGoal" :options="goalOptions" />
      </div>

      <div class="template-grid">
        <article v-for="template in filteredTemplates" :key="template.key" class="template-card">
          <div class="template-top">
            <div class="template-icon">
              <el-icon><component :is="template.icon" /></el-icon>
            </div>
            <el-tag :type="template.tagType" effect="plain">{{ template.group }}</el-tag>
          </div>
          <h4>{{ template.title }}</h4>
          <p>{{ template.desc }}</p>
          <div class="template-rules">
            <span v-for="rule in template.rules" :key="rule">{{ rule }}</span>
          </div>
          <div class="template-footer">
            <small>{{ template.owner }}</small>
            <el-button type="primary" link @click="go(template.route)">去配置</el-button>
          </div>
        </article>
      </div>
    </section>

    <section class="campaign-band">
      <div class="section-heading">
        <div>
          <span>活动规则</span>
          <h3>统一管理预算、首单和新人限制</h3>
        </div>
        <el-button type="primary" :icon="Promotion" @click="openCampaign()">新增活动</el-button>
      </div>

      <el-table v-loading="loading" :data="campaigns" class="campaign-table">
        <el-table-column prop="title" label="活动名称" min-width="180">
          <template #default="{ row }">
            <strong>{{ row.title }}</strong>
            <div class="muted">{{ row.description || typeText(row.type) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="绑定优惠券" min-width="180">
          <template #default="{ row }">
            <span>{{ row.coupon ? couponLabel(row.coupon) : (row.couponId || '-') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="规则" min-width="170">
          <template #default="{ row }">
            <el-tag v-if="row.firstOrderOnly" size="small" type="danger" effect="plain">首单</el-tag>
            <el-tag v-if="row.newUserOnly" size="small" type="success" effect="plain">新用户</el-tag>
            <el-tag v-if="!row.firstOrderOnly && !row.newUserOnly" size="small" effect="plain">通用</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="预算" min-width="220">
          <template #default="{ row }">
            <div>今日 {{ money(row.metrics?.todaySpent) }} / {{ budget(row.dailyBudget) }}</div>
            <div class="muted">总计 {{ money(row.metrics?.totalSpent) }} / {{ budget(row.totalBudget) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="活动效果" min-width="230">
          <template #default="{ row }">
            <div class="metric-line">
              <span>领取 {{ row.metrics?.claimCount || 0 }}</span>
              <span>使用 {{ row.metrics?.usedCount || 0 }}</span>
              <span>订单 {{ row.metrics?.orderCount || 0 }}</span>
            </div>
            <div class="muted">核销率 {{ percent(row.metrics?.useRate) }} · 单单成本 {{ money(row.metrics?.costPerOrder) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="plain">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openCampaign(row)">编辑</el-button>
            <el-button link :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleCampaign(row)">
              {{ row.status === 'active' ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="guard-band">
      <div class="section-heading compact">
        <div>
          <span>上线前检查</span>
          <h3>每个活动都要过这几道控制阀</h3>
        </div>
      </div>
      <div class="guard-grid">
        <div v-for="guard in guards" :key="guard.title" class="guard-item">
          <el-icon><component :is="guard.icon" /></el-icon>
          <div>
            <strong>{{ guard.title }}</strong>
            <p>{{ guard.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <el-dialog v-model="campaignDialog.visible" :title="campaignDialog.id ? '编辑活动' : '创建活动'" width="640px">
      <el-form label-width="104px">
        <el-form-item label="活动名称">
          <el-input v-model="campaignForm.title" placeholder="例如：新用户首单免配送" />
        </el-form-item>
        <el-form-item label="活动类型">
          <el-select v-model="campaignForm.type" class="full">
            <el-option label="新用户活动" value="new_user" />
            <el-option label="首单活动" value="first_order" />
            <el-option label="商家补贴" value="merchant" />
            <el-option label="区域补贴" value="region" />
            <el-option label="通用优惠券活动" value="coupon" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定优惠券">
          <el-select v-model="campaignForm.couponId" class="full" filterable placeholder="选择后台已创建的优惠券">
            <el-option v-for="coupon in coupons" :key="coupon.id" :label="couponLabel(coupon)" :value="coupon.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="活动时间">
          <el-date-picker v-model="campaignForm.dateRange" type="datetimerange" start-placeholder="开始时间" end-placeholder="结束时间" class="full" />
        </el-form-item>
        <el-form-item label="预算控制">
          <div class="form-grid">
            <el-input-number v-model="campaignForm.dailyBudget" :min="0" :precision="2" placeholder="每日预算" />
            <el-input-number v-model="campaignForm.totalBudget" :min="0" :precision="2" placeholder="总预算" />
            <el-input-number v-model="campaignForm.perUserBudget" :min="0" :precision="2" placeholder="每人预算" />
            <el-input-number v-model="campaignForm.userLimit" :min="1" :precision="0" placeholder="每人次数" />
          </div>
        </el-form-item>
        <el-form-item label="使用限制">
          <el-checkbox v-model="campaignForm.firstOrderOnly">仅首单可用</el-checkbox>
          <el-checkbox v-model="campaignForm.newUserOnly">仅新用户可用</el-checkbox>
          <el-input-number v-if="campaignForm.newUserOnly" v-model="campaignForm.newUserDays" :min="1" :max="365" controls-position="right" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="campaignForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="campaignDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCampaign">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'
import { unwrapData, unwrapPage } from './utils'
import {
  Bell,
  DataLine,
  Discount,
  Finished,
  Flag,
  Location,
  Money,
  Promotion,
  Share,
  Shop,
  Ticket,
  Timer,
  User,
  Van,
  Wallet,
  Warning,
} from '@element-plus/icons-vue'

const router = useRouter()
const activeGoal = ref('all')
const loading = ref(false)
const saving = ref(false)
const campaigns = ref<any[]>([])
const coupons = ref<any[]>([])
const campaignDialog = reactive({ visible: false, id: '' })
const campaignForm = reactive<any>({
  title: '',
  type: 'new_user',
  couponId: '',
  dateRange: [],
  dailyBudget: 0,
  totalBudget: 0,
  perUserBudget: 0,
  userLimit: 1,
  firstOrderOnly: false,
  newUserOnly: true,
  newUserDays: 7,
  description: '',
})

const businessScopeLabels: Record<string, string> = {
  all: '通用',
  shop: '外卖/小店',
  mall: '商城',
  errand: '跑腿',
  activity: '活动',
  membership: '会员权益',
}

function businessScopeLabel(scope: any) {
  return businessScopeLabels[String(scope || 'all')] || '通用'
}

function couponLabel(coupon: any) {
  if (!coupon) return '-'
  const scope = businessScopeLabel(coupon.businessScope)
  const region = coupon.region?.name || (coupon.regionId ? '指定区域' : '全区域')
  return `${coupon.name} · ${scope} · ${region}`
}

const goalOptions = [
  { label: '全部', value: 'all' },
  { label: '拉新', value: 'acquisition' },
  { label: '促单', value: 'conversion' },
  { label: '补贴', value: 'subsidy' },
  { label: '激励', value: 'incentive' },
]

const summary = [
  { label: '推荐先做', value: '4 类', tip: '新客、邀请、区域、商家' },
  { label: '复用能力', value: '现有模块', tip: '优惠券、分享、会员、订单' },
  { label: '预算控制', value: '必须配置', tip: '每日、总额、每人上限' },
  { label: '小程序触点', value: '少而准', tip: '领券、商家、结算页' },
]

const workflow = [
  { index: '01', title: '选目标', desc: '先选拉新、促单、补贴或激励，不从技术模块开始找。' },
  { index: '02', title: '套模板', desc: '模板带出默认规则，运营只填金额、时间、范围和预算。' },
  { index: '03', title: '看效果', desc: '活动上线后统一看领取、核销、订单、成本和退款影响。' },
]

const templates = [
  {
    key: 'new-user-bundle',
    goal: 'acquisition',
    group: '新客拉新',
    tagType: 'success',
    icon: User,
    title: '新用户注册礼包',
    desc: '给新注册用户发放首单券、配送券或复购券，适合区域冷启动。',
    rules: ['仅新用户', '自动发券', '每人一次'],
    owner: '去优惠券配置',
    route: '/marketing/coupons?create=1&template=new-user',
  },
  {
    key: 'first-order',
    goal: 'conversion',
    group: '首单转化',
    tagType: 'danger',
    icon: Discount,
    title: '首单立减 / 免配送',
    desc: '首单直接减金额或免配送费，用在用户第一次下单前的临门一脚。',
    rules: ['首单判断', '结算页展示', '预算限制'],
    owner: '去优惠券配置',
    route: '/marketing/coupons?create=1&template=first-order',
  },
  {
    key: 'invite',
    goal: 'acquisition',
    group: '邀请裂变',
    tagType: 'warning',
    icon: Share,
    title: '邀请好友双方得券',
    desc: '邀请人和新人分别获得奖励，建议新人首单完成后再给邀请人奖励。',
    rules: ['防自邀', '首单后发奖', '区域独立'],
    owner: '去分享有礼',
    route: '/marketing/share',
  },
  {
    key: 'member',
    goal: 'conversion',
    group: '会员运营',
    tagType: 'info',
    icon: Wallet,
    title: '会员专属券',
    desc: '面向会员发放月度券、活动报名券或配送权益，提升开通和续费理由。',
    rules: ['会员可领', '按周期发放', '权益记录'],
    owner: '去会员运营',
    route: '/membership/overview',
  },
  {
    key: 'region',
    goal: 'subsidy',
    group: '区域补贴',
    tagType: 'primary',
    icon: Location,
    title: '指定区域补贴',
    desc: '给指定校区或城市区域配置补贴，适合新区域开通和低活跃区域唤醒。',
    rules: ['限定区域', '每日预算', '总预算'],
    owner: '去区域配置',
    route: '/region/config',
  },
  {
    key: 'merchant',
    goal: 'subsidy',
    group: '商家促单',
    tagType: 'success',
    icon: Shop,
    title: '指定商家补贴',
    desc: '对重点商家、冷启动商家或联合出资商家配置专属券和满减。',
    rules: ['限定商家', '可联合出资', '订单核销'],
    owner: '去优惠券配置',
    route: '/marketing/coupons?create=1&template=merchant',
  },
  {
    key: 'rider',
    goal: 'incentive',
    group: '骑手激励',
    tagType: 'warning',
    icon: Van,
    title: '指定骑手奖励',
    desc: '按区域、时段或完成单量给骑手奖励，建议订单完成后再结算。',
    rules: ['完成后结算', '异常剔除', '财务可追踪'],
    owner: '去骑手结算',
    route: '/finance/rider-settle',
  },
  {
    key: 'popup',
    goal: 'conversion',
    group: '触达提醒',
    tagType: 'info',
    icon: Bell,
    title: '首页权益卡片 / 通知',
    desc: '活动上线后用首页权益卡片和系统通知触达用户，避免活动配置好了没人知道。',
    rules: ['指定区域', '指定时间', '可跳转页面'],
    owner: '去首页权益卡片',
    route: '/marketing/popups',
  },
]

const guards = [
  { icon: Money, title: '预算上限', desc: '每日预算、活动总预算、单用户上限必须明确。' },
  { icon: Warning, title: '风控限制', desc: '手机号、openid、设备、重复邀请和异常订单要拦截。' },
  { icon: Timer, title: '生效时间', desc: '开始结束时间、指定时段、预算耗尽后的自动暂停。' },
  { icon: Finished, title: '核销回滚', desc: '未支付、取消、退款时要释放预算或标记成本。' },
]

const filteredTemplates = computed(() => {
  if (activeGoal.value === 'all') return templates
  return templates.filter(item => item.goal === activeGoal.value)
})

function go(path: string) {
  router.push(path)
}

function money(value: any) {
  return `¥${Number(value || 0).toFixed(2)}`
}

function budget(value: any) {
  const amount = Number(value || 0)
  return amount > 0 ? money(amount) : '不限'
}

function percent(value: any) {
  return `${Number(value || 0).toFixed(1)}%`
}

function typeText(type: string) {
  const map: Record<string, string> = {
    new_user: '新用户活动',
    first_order: '首单活动',
    merchant: '商家补贴',
    region: '区域补贴',
    coupon: '通用优惠券活动',
  }
  return map[type] || '运营活动'
}

function resetCampaignForm(row?: any) {
  campaignDialog.id = row?.id || ''
  Object.assign(campaignForm, {
    title: row?.title || '',
    type: row?.type || 'new_user',
    couponId: row?.couponId || '',
    dateRange: row?.startAt && row?.endAt ? [new Date(row.startAt), new Date(row.endAt)] : [],
    dailyBudget: Number(row?.dailyBudget || 0),
    totalBudget: Number(row?.totalBudget || 0),
    perUserBudget: Number(row?.perUserBudget || 0),
    userLimit: Number(row?.userLimit || 1),
    firstOrderOnly: row?.firstOrderOnly ?? row?.type === 'first_order',
    newUserOnly: row?.newUserOnly ?? row?.type === 'new_user',
    newUserDays: Number(row?.newUserDays || 7),
    description: row?.description || '',
  })
}

function openCampaign(row?: any) {
  resetCampaignForm(row)
  campaignDialog.visible = true
}

async function loadCampaigns() {
  loading.value = true
  try {
    campaigns.value = unwrapPage(await request.get('/admin/marketing/campaigns', { params: { page: 1, pageSize: 50 } })).list
  } finally {
    loading.value = false
  }
}

async function loadCoupons() {
  coupons.value = unwrapPage(await request.get('/admin/marketing/coupons', { params: { page: 1, pageSize: 200, status: 'active' } })).list
}

async function saveCampaign() {
  const [startAt, endAt] = campaignForm.dateRange || []
  const payload = {
    ...campaignForm,
    startAt,
    endAt,
    dateRange: undefined,
  }
  saving.value = true
  try {
    if (campaignDialog.id) {
      await request.put(`/admin/marketing/campaigns/${campaignDialog.id}`, payload)
    } else {
      await request.post('/admin/marketing/campaigns', payload)
    }
    ElMessage.success('活动已保存')
    campaignDialog.visible = false
    await loadCampaigns()
  } finally {
    saving.value = false
  }
}

async function toggleCampaign(row: any) {
  await request.put(`/admin/marketing/campaigns/${row.id}/status`, { status: row.status === 'active' ? 'inactive' : 'active' })
  ElMessage.success('状态已更新')
  await loadCampaigns()
}

onMounted(() => {
  loadCampaigns()
  loadCoupons()
})
</script>

<style scoped>
.campaign-page {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.summary-band,
.workflow-band,
.template-band,
.campaign-band,
.guard-band {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.summary-band {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
}

.summary-item {
  padding: 18px 20px;
  border-right: 1px solid #eef2f7;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-item:last-child { border-right: 0; }
.summary-item span,
.section-heading span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}
.summary-item strong {
  color: #0f172a;
  font-size: 24px;
  line-height: 1.2;
}
.summary-item small {
  color: #94a3b8;
  line-height: 1.4;
}

.workflow-band,
.template-band,
.campaign-band,
.guard-band {
  padding: 20px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 16px;
}
.section-heading.compact { margin-bottom: 14px; }
.section-heading h3 {
  margin: 4px 0 0;
  color: #0f172a;
  font-size: 20px;
  line-height: 1.25;
}

.workflow-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.workflow-step {
  min-height: 94px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f8fafc;
  display: flex;
  gap: 12px;
}
.step-index {
  width: 38px;
  height: 38px;
  border-radius: 6px;
  background: #0f172a;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  flex: 0 0 auto;
}
.workflow-step strong,
.guard-item strong {
  color: #0f172a;
}
.workflow-step p,
.guard-item p,
.template-card p {
  margin: 6px 0 0;
  color: #64748b;
  line-height: 1.6;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.template-card {
  min-height: 246px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.template-top,
.template-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.template-icon {
  width: 38px;
  height: 38px;
  border-radius: 6px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
}
.template-card h4 {
  margin: 0;
  color: #0f172a;
  font-size: 17px;
  line-height: 1.35;
}
.template-rules {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
}
.template-rules span {
  padding: 4px 8px;
  border-radius: 6px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  border: 1px solid #e2e8f0;
}
.template-footer small {
  color: #94a3b8;
}

.campaign-table {
  width: 100%;
}

.muted {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.4;
}

.metric-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.metric-line span {
  padding: 3px 7px;
  border-radius: 6px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  border: 1px solid #e2e8f0;
}

.full {
  width: 100%;
}

.form-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.guard-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.guard-item {
  padding: 14px;
  border-radius: 6px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  display: flex;
  gap: 10px;
}
.guard-item .el-icon {
  margin-top: 2px;
  color: #2563eb;
  flex: 0 0 auto;
}

@media (max-width: 1280px) {
  .template-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .guard-grid,
  .summary-band { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary-item:nth-child(2) { border-right: 0; }
}

@media (max-width: 860px) {
  .campaign-page { padding: 16px; }
  .section-heading { align-items: flex-start; flex-direction: column; }
  .workflow-steps,
  .template-grid,
  .form-grid,
  .guard-grid,
  .summary-band { grid-template-columns: 1fr; }
  .summary-item { border-right: 0; border-bottom: 1px solid #eef2f7; }
  .summary-item:last-child { border-bottom: 0; }
}
</style>
