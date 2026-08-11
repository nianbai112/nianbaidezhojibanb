<template>
  <div class="page-shell errand-settings">
    <PageHeader
      title="跑腿配置"
      subtitle="配置小程序帮我取件、帮我寄件、帮我取餐、万能任务的开关、价格、页面素材和运营规则"
      icon="Tools"
    >
      <template #actions>
        <el-select v-model="selectedRegionId" placeholder="请选择区域" filterable class="region-select" @change="loadAll">
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-button :loading="loading" @click="loadAll">刷新</el-button>
        <el-button type="primary" :loading="saving" @click="saveAll">保存配置</el-button>
      </template>
    </PageHeader>

    <section class="service-board">
      <div class="board-copy">
        <p>小程序入口状态</p>
        <h3>{{ feeConfig.isOpen ? '跑腿服务开放中' : '跑腿服务已关闭' }}</h3>
        <span>关闭总开关后，小程序端应停止创建新的跑腿订单；单项开关控制四个入口是否展示为可下单。</span>
      </div>
      <el-switch v-model="feeConfig.isOpen" active-text="总开关开放" inactive-text="总开关关闭" />
    </section>

    <div class="service-grid">
      <article v-for="service in serviceCards" :key="service.key" class="service-card">
        <div class="service-head">
          <div class="service-icon" :class="service.tone">
            <el-icon><component :is="service.icon" /></el-icon>
          </div>
          <div>
            <strong>{{ service.title }}</strong>
            <span>{{ service.scene }}</span>
          </div>
          <el-switch v-model="feeConfig.serviceSwitches[service.switchKey]" />
        </div>
        <div class="service-body">
          <label>入口起步价</label>
          <el-input-number v-model="feeConfig.baseFees[service.key]" :min="0" :precision="2" />
          <label>小程序说明文案</label>
          <el-input v-model="feeConfig.serviceDescriptions[service.key]" type="textarea" :rows="2" />
        </div>
      </article>
    </div>

    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane label="服务开关" name="services">
        <el-card shadow="never" class="settings-card" v-loading="loading">
          <div class="section-title">
            <strong>入口与服务能力</strong>
            <span>这部分直接对应小程序顶部四个 Tab。</span>
          </div>
          <div class="switch-list">
            <div class="switch-row">
              <div>
                <strong>快递服务</strong>
                <span>同时控制「帮我取件」和「帮我寄件」。</span>
              </div>
              <el-switch v-model="feeConfig.serviceSwitches.express" active-text="开启" inactive-text="关闭" />
            </div>
            <div class="switch-row">
              <div>
                <strong>外卖代拿</strong>
                <span>控制「帮我取餐」入口，配合外卖取餐点使用。</span>
              </div>
              <el-switch v-model="feeConfig.serviceSwitches.food" active-text="开启" inactive-text="关闭" />
            </div>
            <div class="switch-row">
              <div>
                <strong>万能任务</strong>
                <span>控制打印、买东西、送资料等自定义任务。</span>
              </div>
              <el-switch v-model="feeConfig.serviceSwitches.custom" active-text="开启" inactive-text="关闭" />
            </div>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="轮播与页面" name="page">
        <el-card shadow="never" class="settings-card" v-loading="loading">
          <div class="section-title with-action">
            <div>
              <strong>跑腿页轮播图</strong>
              <span>小程序页面顶部广告图，适合放校园跑腿规则、快递节活动、骑手招募。</span>
            </div>
            <el-button type="primary" plain @click="addBanner">添加轮播</el-button>
          </div>

          <div class="banner-grid">
            <article v-for="(banner, index) in feeConfig.banners" :key="index" class="banner-card">
              <ImageUploadBox
                v-model="banner.image_url"
                scene="errand"
                shape="wide"
                placeholder="上传跑腿轮播图"
                tip="建议 750 x 350px"
                :max-size="3"
              />
              <div class="banner-fields">
                <el-input v-model="banner.title" placeholder="轮播标题，后台识别用" />
                <el-input v-model="banner.link_url" placeholder="跳转路径，可留空" />
                <div class="banner-actions">
                  <el-switch v-model="banner.enabled" active-text="显示" inactive-text="隐藏" />
                  <el-button :disabled="index === 0" @click="moveBanner(index, -1)">上移</el-button>
                  <el-button :disabled="index === feeConfig.banners.length - 1" @click="moveBanner(index, 1)">下移</el-button>
                  <el-button type="danger" plain @click="removeBanner(index)">删除</el-button>
                </div>
              </div>
            </article>
          </div>

          <EmptyState v-if="!feeConfig.banners.length" description="暂无跑腿轮播图">
            <el-button type="primary" @click="addBanner">添加轮播图</el-button>
          </EmptyState>

          <el-divider />
          <div class="form-grid two">
            <el-form-item label="公告提示">
              <el-input v-model="pageConfig.notice" placeholder="如：下单前请确认取件码有效" />
            </el-form-item>
            <el-form-item label="客服电话">
              <el-input v-model="pageConfig.servicePhone" placeholder="展示给用户的服务电话" />
            </el-form-item>
          </div>
          <el-form-item label="下单提示">
            <el-input v-model="pageConfig.orderTips" type="textarea" :rows="4" placeholder="告诉用户如何填写取件码、地址、备注等" />
          </el-form-item>
          <el-form-item label="默认骑手头像">
            <ImageUploadBox
              v-model="pageConfig.defaultRiderAvatar"
              scene="errand"
              shape="square"
              placeholder="上传默认头像"
              tip="骑手无头像时使用"
              :max-size="2"
            />
          </el-form-item>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="计费规则" name="fee">
        <el-card shadow="never" class="settings-card" v-loading="loading">
          <div class="section-title">
            <strong>通用费用规则</strong>
            <span>四个入口各有起步价；下面是距离、重量、夜间等全局加价规则。</span>
          </div>
          <div class="form-grid">
            <el-form-item label="默认基础服务费">
              <el-input-number v-model="feeConfig.basePrice" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="每公里费用">
              <el-input-number v-model="feeConfig.distancePrice" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="重量加价">
              <el-input-number v-model="feeConfig.weightPrice" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="时段加价">
              <el-input-number v-model="feeConfig.timePrice" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="夜间加价">
              <el-input-number v-model="feeConfig.nightPrice" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="最大距离(km)">
              <el-input-number v-model="feeConfig.maxDistance" :min="1" />
            </el-form-item>
            <el-form-item label="最大重量(kg)">
              <el-input-number v-model="feeConfig.maxWeight" :min="1" />
            </el-form-item>
            <el-form-item label="普通小费选项">
              <el-input v-model="tipOptionsText" placeholder="用逗号分隔，如：不需要,¥2,¥5,¥10,其他" />
            </el-form-item>
            <el-form-item label="万能任务小费">
              <el-input v-model="customTipOptionsText" placeholder="用逗号分隔，如：¥2,¥5,¥10,¥15,其他" />
            </el-form-item>
          </div>
        </el-card>
	      </el-tab-pane>

	      <el-tab-pane label="接单规则" name="taking">
	        <el-card shadow="never" class="settings-card" v-loading="loading">
	          <div class="section-title">
	            <strong>接单人范围</strong>
	            <span>后端按这里的规则决定订单进入认证骑手池，还是允许普通用户接单。</span>
	          </div>
	          <div class="switch-list">
	            <div class="switch-row">
	              <div>
	                <strong>允许普通用户接单</strong>
	                <span>开启后，符合规则的同校用户可在接单大厅接低风险跑腿单。</span>
	              </div>
	              <el-switch v-model="feeConfig.orderTakingPolicy.ordinaryUserEnabled" active-text="开启" inactive-text="关闭" />
	            </div>
	            <div class="switch-row">
	              <div>
	                <strong>允许下单人选择接单身份</strong>
	                <span>开启后，小程序下单页展示「认证骑手 / 同校用户」，认证骑手加价只在用户主动选择认证骑手时生效。</span>
	              </div>
	              <el-switch v-model="feeConfig.orderTakingPolicy.receiverChoiceEnabled" active-text="开启" inactive-text="关闭" />
	            </div>
	            <div class="switch-row">
	              <div>
	                <strong>无人接单兜底给认证骑手</strong>
	                <span>同校用户单超过等待时间无人接后，进入认证骑手兜底池，按用户原价结算。</span>
	              </div>
	              <el-switch v-model="feeConfig.orderTakingPolicy.ordinaryUserFallbackEnabled" active-text="开启" inactive-text="关闭" />
	            </div>
	            <div class="switch-row">
	              <div>
	                <strong>手机号验证</strong>
	                <span>开启后，普通用户必须绑定手机号后才能接单。</span>
	              </div>
	              <el-switch v-model="feeConfig.orderTakingPolicy.ordinaryUserRequirePhone" active-text="需要" inactive-text="不需要" />
	            </div>
	            <div class="switch-row">
	              <div>
	                <strong>学生认证</strong>
	                <span>开启后，普通用户必须通过学生认证后才能接单。</span>
	              </div>
	              <el-switch v-model="feeConfig.orderTakingPolicy.ordinaryUserRequireStudentVerify" active-text="需要" inactive-text="不需要" />
	            </div>
	            <div class="switch-row">
	              <div>
	                <strong>高风险任务必须认证骑手</strong>
	                <span>蛋糕、贵重、易碎、大件重物等风险任务不进入普通用户池。</span>
	              </div>
	              <el-switch v-model="feeConfig.orderTakingPolicy.highRiskRequiresApprovedRider" active-text="开启" inactive-text="关闭" />
	            </div>
	          </div>

	          <el-divider />
	          <div class="form-grid">
	            <el-form-item label="认证骑手加价金额">
	              <el-input-number
	                v-model="feeConfig.orderTakingPolicy.approvedRiderSurchargeAmount"
	                :min="0"
	                :max="100"
	                :precision="2"
	                :step="0.5"
	              />
	            </el-form-item>
	            <el-form-item label="认证骑手优先(分钟)">
	              <el-input-number v-model="feeConfig.orderTakingPolicy.riderPriorityMinutes" :min="0" :max="120" />
	            </el-form-item>
	            <el-form-item label="兜底等待时间(分钟)">
	              <el-input-number v-model="feeConfig.orderTakingPolicy.ordinaryUserFallbackMinutes" :min="1" :max="120" />
	            </el-form-item>
	            <el-form-item label="普通用户进行中上限">
	              <el-input-number v-model="feeConfig.orderTakingPolicy.ordinaryUserMaxActiveOrders" :min="0" :max="10" />
	            </el-form-item>
	            <el-form-item label="普通用户每日接单上限">
	              <el-input-number v-model="feeConfig.orderTakingPolicy.ordinaryUserDailyLimit" :min="0" :max="100" />
	            </el-form-item>
	          </div>
	          <el-form-item label="普通用户可接任务">
	            <el-checkbox-group v-model="feeConfig.orderTakingPolicy.ordinaryUserTaskTypes" class="task-type-checks">
	              <el-checkbox v-for="service in serviceCards" :key="service.key" :label="service.key">
	                {{ service.title }}
	              </el-checkbox>
	            </el-checkbox-group>
	          </el-form-item>
	        </el-card>
	      </el-tab-pane>

	      <el-tab-pane label="风险标签" name="risk">
	        <el-card shadow="never" class="settings-card" v-loading="loading">
	          <div class="section-title">
	            <strong>按任务场景配置风险项</strong>
	            <span>小程序按这里下发的配置展示风险标签；AI建议只进入建议中心，不会自动改这里。</span>
	          </div>
	          <div class="risk-service-list">
	            <article v-for="service in serviceCards" :key="service.key" class="risk-service-card">
	              <div class="risk-service-head">
	                <div>
	                  <strong>{{ service.title }}</strong>
	                  <span>{{ service.scene }}</span>
	                </div>
	                <el-button size="small" plain @click="resetRiskTags(service.key)">恢复默认</el-button>
	              </div>
	              <div class="risk-tag-editor">
	                <div v-for="tag in feeConfig.riskTagConfig[service.key]" :key="tag.key" class="risk-tag-row">
	                  <el-switch v-model="tag.enabled" active-text="显示" inactive-text="隐藏" />
	                  <el-input v-model="tag.label" placeholder="标签名称" />
	                  <el-input v-model="tag.desc" placeholder="给用户看的简短说明" />
	                  <el-switch v-model="tag.requiresApprovedRider" active-text="需认证骑手" inactive-text="不强制" />
	                  <el-input-number v-model="tag.extraEtaMinutes" :min="0" :max="60" controls-position="right" />
	                </div>
	              </div>
	            </article>
	          </div>
	        </el-card>
	      </el-tab-pane>

      <el-tab-pane label="奖惩规则" name="reward">
	        <el-card shadow="never" class="settings-card" v-loading="loading">
          <div class="section-title">
            <strong>骑手奖惩</strong>
            <span>用于后续结算、调度和服务质量治理。</span>
          </div>
          <div class="form-grid">
            <el-form-item label="超时分钟">
              <el-input-number v-model="rewardConfig.timeoutMinutes" :min="1" />
            </el-form-item>
            <el-form-item label="超时扣款">
              <el-input-number v-model="rewardConfig.timeoutPenalty" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="差评扣款">
              <el-input-number v-model="rewardConfig.badReviewPenalty" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="好评奖励">
              <el-input-number v-model="rewardConfig.goodReviewReward" :min="0" :precision="2" />
            </el-form-item>
            <el-form-item label="夜间奖励">
              <el-input-number v-model="rewardConfig.nightReward" :min="0" :precision="2" />
            </el-form-item>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="闭环与结算" name="closure">
        <el-card shadow="never" class="settings-card" v-loading="loading">
          <div class="section-title">
            <strong>交易闭环开关</strong>
            <span>按区域控制自动确认和新结算链路，关闭时不会直接改写已有订单。</span>
          </div>
          <div class="form-grid">
            <el-form-item label="闭环版本">
              <el-input-number v-model="feeConfig.closureVersion" :min="1" :max="99" :precision="0" />
            </el-form-item>
            <el-form-item label="24小时自动确认">
              <el-switch v-model="feeConfig.autoReceiptEnabled" active-text="开启" inactive-text="暂停" />
            </el-form-item>
            <el-form-item label="V2结算与追偿">
              <el-switch v-model="feeConfig.settlementV2Enabled" active-text="开启" inactive-text="暂停" />
            </el-form-item>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { fetchRegions } from '@/api/admin'
import {
  fetchErrandFeeConfig,
  fetchErrandPageConfig,
  fetchErrandRewardPunish,
  saveErrandFeeConfig,
  saveErrandPageConfig,
  saveErrandRewardPunish,
} from '@/api/errand'

const serviceCards = [
  { key: 'express_pickup', switchKey: 'express', title: '帮我取件', scene: '快递到站、驿站取件、宿舍送达', icon: 'Box', tone: 'blue' },
  { key: 'express_send', switchKey: 'express', title: '帮我寄件', scene: '代寄快递、上门取件、送到寄件点', icon: 'Promotion', tone: 'cyan' },
  { key: 'food_delivery', switchKey: 'food', title: '帮我取餐', scene: '外卖、奶茶、校园餐代拿', icon: 'Bowl', tone: 'orange' },
  { key: 'custom_task', switchKey: 'custom', title: '万能任务', scene: '打印、代买、送资料等自定义任务', icon: 'MagicStick', tone: 'purple' },
]

const defaultDescriptions: Record<string, string> = {
  express_pickup: '快递到了不方便拿，同校同学顺路帮取',
  express_send: '寄快递不用跑驿站，填写信息后等人上门',
  food_delivery: '外卖、奶茶、校园餐，到点帮你送到手边',
  custom_task: '打印、买东西、送资料等临时任务都可以发布',
}

const defaultRiskTagConfig: Record<string, any[]> = {
  express_pickup: [
    { key: 'large', label: '包裹大件', desc: '箱子/大包裹', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'heavy', label: '包裹较重', desc: '桶装/重物', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'fragile', label: '易碎标识', desc: '玻璃/陶瓷', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
    { key: 'valuable', label: '贵重包裹', desc: '手机/电脑', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
  ],
  express_send: [
    { key: 'valuable', label: '贵重物品', desc: '手机/电脑/证件', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
    { key: 'fragile', label: '易碎物品', desc: '玻璃/陶瓷', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
    { key: 'large', label: '大件包裹', desc: '箱子/大包', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'heavy', label: '重物包裹', desc: '较重需搬运', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'liquid', label: '液体粉末', desc: '需确认可寄', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 5 },
    { key: 'prohibited', label: '疑似禁寄', desc: '需人工确认', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 0 },
  ],
  food_delivery: [
    { key: 'cake', label: '蛋糕', desc: '需平放', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 8 },
    { key: 'liquid', label: '汤水/奶茶', desc: '易洒漏', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 5 },
    { key: 'hot', label: '热餐热饮', desc: '注意保温', enabled: true, requiresApprovedRider: false, extraEtaMinutes: 2 },
    { key: 'cold', label: '冷饮冷食', desc: '注意时效', enabled: true, requiresApprovedRider: false, extraEtaMinutes: 2 },
    { key: 'large', label: '多人餐', desc: '餐品较多', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
  ],
  custom_task: [
    { key: 'valuable', label: '贵重物品', desc: '需当面交接', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
    { key: 'fragile', label: '易碎物品', desc: '需轻拿轻放', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
    { key: 'large', label: '大件任务', desc: '搬运/大包', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'heavy', label: '重物任务', desc: '搬运较重', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'liquid', label: '液体物品', desc: '易洒漏', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 5 },
    { key: 'prohibited', label: '不确定风险', desc: '需平台确认', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 0 },
  ],
}

const activeTab = ref('services')
const loading = ref(false)
const saving = ref(false)
const regions = ref<any[]>([])
const selectedRegionId = ref('')
const tipOptionsText = ref('不需要,¥2,¥5,¥10,其他')
const customTipOptionsText = ref('¥2,¥5,¥10,¥15,其他')
const feeConfig = ref<any>(makeFeeConfig())
const pageConfig = ref<any>({
  notice: '',
  orderTips: '',
  defaultRiderAvatar: '',
  servicePhone: '',
})
const rewardConfig = ref<any>({
  timeoutPenalty: 0,
  timeoutMinutes: 30,
  badReviewPenalty: 0,
  goodReviewReward: 0,
  nightReward: 0,
})

const persistedMetaKeys = new Set(['id', 'regionId', 'region_id', 'createdAt', 'created_at', 'updatedAt', 'updated_at'])

function stripPersistedMeta<T = any>(source: T): T {
  if (Array.isArray(source)) return source.map(item => stripPersistedMeta(item)) as T
  if (!source || typeof source !== 'object') return source
  return Object.entries(source as Record<string, any>).reduce((result, [key, value]) => {
    if (!persistedMetaKeys.has(key)) result[key] = stripPersistedMeta(value)
    return result
  }, {} as Record<string, any>) as T
}

function cloneRiskTags(list: any[] = []) {
  return list.map(item => ({
    key: item.key,
    label: item.label,
    desc: item.desc || item.description || '',
    enabled: item.enabled !== false,
    requiresApprovedRider: item.requiresApprovedRider ?? item.requires_approved_rider ?? true,
    extraEtaMinutes: Number(item.extraEtaMinutes ?? item.extra_eta_minutes ?? 0),
  }))
}

function normalizeRiskTagConfig(source: any = {}) {
  const raw = source.riskTagConfig || source.risk_tag_config || {}
  return serviceCards.reduce((result, service) => {
    const list = Array.isArray(raw[service.key]) && raw[service.key].length
      ? raw[service.key]
      : defaultRiskTagConfig[service.key]
    result[service.key] = cloneRiskTags(list)
    return result
  }, {} as Record<string, any[]>)
}

function makeFeeConfig(source: any = {}) {
  const basePrice = Number(source.basePrice ?? 0)
  const baseFees = { ...(source.baseFees || source.base_fees || {}) }
  const serviceDescriptions = { ...defaultDescriptions, ...(source.serviceDescriptions || source.service_descriptions || {}) }
  const serviceSwitches = {
    express: source.serviceSwitches?.express ?? source.service_switches?.express ?? true,
    food: source.serviceSwitches?.food ?? source.service_switches?.food ?? true,
    custom: source.serviceSwitches?.custom ?? source.service_switches?.custom ?? true,
  }
  serviceCards.forEach(service => {
    if (baseFees[service.key] === undefined) baseFees[service.key] = basePrice
    if (!serviceDescriptions[service.key]) serviceDescriptions[service.key] = defaultDescriptions[service.key]
  })
	  const banners = Array.isArray(source.banners || source.bannerJson || source.banner_json)
	    ? (source.banners || source.bannerJson || source.banner_json)
	    : []
	  const rawPolicy = source.orderTakingPolicy || source.order_taking_policy || {}
	  const orderTakingPolicy = {
	    ordinaryUserEnabled: rawPolicy.ordinaryUserEnabled ?? rawPolicy.ordinary_user_enabled ?? false,
	    ordinaryUserTaskTypes: Array.isArray(rawPolicy.ordinaryUserTaskTypes || rawPolicy.ordinary_user_task_types)
	      ? (rawPolicy.ordinaryUserTaskTypes || rawPolicy.ordinary_user_task_types)
	      : ['express_pickup'],
	    ordinaryUserRequirePhone: rawPolicy.ordinaryUserRequirePhone ?? rawPolicy.ordinary_user_require_phone ?? false,
	    ordinaryUserRequireStudentVerify: rawPolicy.ordinaryUserRequireStudentVerify ?? rawPolicy.ordinary_user_require_student_verify ?? false,
	    ordinaryUserMaxActiveOrders: Number(rawPolicy.ordinaryUserMaxActiveOrders ?? rawPolicy.ordinary_user_max_active_orders ?? 1),
	    ordinaryUserDailyLimit: Number(rawPolicy.ordinaryUserDailyLimit ?? rawPolicy.ordinary_user_daily_limit ?? 3),
	    riderPriorityMinutes: Number(rawPolicy.riderPriorityMinutes ?? rawPolicy.rider_priority_minutes ?? 0),
	    receiverChoiceEnabled: rawPolicy.receiverChoiceEnabled ?? rawPolicy.receiver_choice_enabled ?? false,
	    ordinaryUserFallbackEnabled: rawPolicy.ordinaryUserFallbackEnabled ?? rawPolicy.ordinary_user_fallback_enabled ?? false,
	    ordinaryUserFallbackMinutes: Number(rawPolicy.ordinaryUserFallbackMinutes ?? rawPolicy.ordinary_user_fallback_minutes ?? 10),
	    approvedRiderSurchargeAmount: Number(rawPolicy.approvedRiderSurchargeAmount ?? rawPolicy.approved_rider_surcharge_amount ?? 0),
	    highRiskRequiresApprovedRider: rawPolicy.highRiskRequiresApprovedRider ?? rawPolicy.high_risk_requires_approved_rider ?? true,
	  }

	  return {
    basePrice,
    distancePrice: Number(source.distancePrice ?? 0),
    weightPrice: Number(source.weightPrice ?? 0),
    timePrice: Number(source.timePrice ?? 0),
    nightPrice: Number(source.nightPrice ?? 0),
    maxDistance: Number(source.maxDistance ?? 10),
    maxWeight: Number(source.maxWeight ?? 20),
    isOpen: source.isOpen ?? true,
    serviceSwitches,
    baseFees,
    serviceDescriptions,
	    banners: banners.map((item: any) => ({
	      image_url: item.image_url || item.imageUrl || '',
	      link_url: item.link_url || item.linkUrl || '',
	      title: item.title || '',
	      enabled: item.enabled !== false,
	    })),
	    tipOptions: Array.isArray(source.tipOptions) ? source.tipOptions : ['不需要', '¥2', '¥5', '¥10', '其他'],
	    customTaskTipOptions: Array.isArray(source.customTaskTipOptions) ? source.customTaskTipOptions : ['¥2', '¥5', '¥10', '¥15', '其他'],
	    orderTakingPolicy,
	    riskTagConfig: normalizeRiskTagConfig(source),
	    closureVersion: Number(source.closureVersion ?? source.closure_version ?? 2),
	    autoReceiptEnabled: source.autoReceiptEnabled ?? source.auto_receipt_enabled ?? true,
	    settlementV2Enabled: source.settlementV2Enabled ?? source.settlement_v2_enabled ?? true,
	  }
}

function parseOptions(text: string) {
  return text.split(/[,，]/).map(item => item.trim()).filter(Boolean)
}

async function loadRegions() {
  regions.value = await fetchRegions()
  if (!selectedRegionId.value) selectedRegionId.value = regions.value[0]?.id || ''
}

async function loadAll() {
  if (!selectedRegionId.value) return
  loading.value = true
  try {
    const [fee, page, reward] = await Promise.all([
      fetchErrandFeeConfig(selectedRegionId.value),
      fetchErrandPageConfig(selectedRegionId.value),
      fetchErrandRewardPunish(selectedRegionId.value),
    ])
    feeConfig.value = makeFeeConfig(fee || {})
    tipOptionsText.value = feeConfig.value.tipOptions.join(',')
    customTipOptionsText.value = feeConfig.value.customTaskTipOptions.join(',')
    pageConfig.value = { ...pageConfig.value, ...stripPersistedMeta(page || {}) }
    rewardConfig.value = { ...rewardConfig.value, ...stripPersistedMeta(reward || {}) }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载跑腿配置失败')
  } finally {
    loading.value = false
  }
}

function addBanner() {
  feeConfig.value.banners.push({ image_url: '', link_url: '', title: '', enabled: true })
}

function removeBanner(index: number) {
  feeConfig.value.banners.splice(index, 1)
}

function moveBanner(index: number, step: number) {
  const next = index + step
  if (next < 0 || next >= feeConfig.value.banners.length) return
  const [item] = feeConfig.value.banners.splice(index, 1)
  feeConfig.value.banners.splice(next, 0, item)
}

function resetRiskTags(serviceKey: string) {
  feeConfig.value.riskTagConfig[serviceKey] = cloneRiskTags(defaultRiskTagConfig[serviceKey] || [])
}

async function saveAll() {
  if (!selectedRegionId.value) {
    ElMessage.warning('请先选择区域')
    return
  }
  saving.value = true
  try {
    const payload = {
      ...feeConfig.value,
      tipOptions: parseOptions(tipOptionsText.value),
      customTaskTipOptions: parseOptions(customTipOptionsText.value),
      banners: feeConfig.value.banners.filter((item: any) => item.image_url),
    }
    await Promise.all([
      saveErrandFeeConfig(selectedRegionId.value, stripPersistedMeta(payload)),
      saveErrandPageConfig(selectedRegionId.value, stripPersistedMeta(pageConfig.value)),
      saveErrandRewardPunish(selectedRegionId.value, stripPersistedMeta(rewardConfig.value)),
    ])
    ElMessage.success('跑腿配置已保存，小程序刷新后生效')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存跑腿配置失败')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadRegions()
  await loadAll()
})
</script>

<style scoped>
.errand-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.region-select {
  width: 220px;
}

.service-board,
.service-card,
.settings-card {
  border: 1px solid var(--mx-border-strong);
  border-radius: 14px;
  background: var(--mx-card);
  box-shadow: var(--mx-shadow);
}

.service-board {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 24px;
  background: var(--mx-soft);
}

.board-copy p,
.section-title span,
.service-head span {
  margin: 0;
  color: var(--mx-sub);
}

.board-copy h3 {
  margin: 6px 0;
  color: var(--mx-text);
  font-size: 26px;
  font-weight: 850;
}

.service-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.service-card {
  padding: 18px;
}

.service-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.service-head strong {
  display: block;
  color: var(--mx-text);
  font-size: 17px;
}

.service-head .el-switch {
  margin-left: auto;
}

.service-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  color: #fff;
  font-size: 20px;
}

.service-icon.blue { background: var(--el-color-primary); }
.service-icon.cyan { background: var(--mx-cyan); }
.service-icon.orange { background: var(--el-color-warning); }
.service-icon.purple { background: var(--mx-purple); }

.service-body {
  display: grid;
  gap: 8px;
}

.service-body label {
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 700;
}

.service-body :deep(.el-input-number) {
  width: 100%;
}

.settings-tabs {
  border-radius: 14px;
}

.settings-card {
  border-radius: 14px;
}

.section-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 18px;
}

.section-title strong {
  color: var(--mx-text);
  font-size: 18px;
}

.section-title.with-action {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.switch-list {
  display: grid;
  gap: 14px;
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 18px;
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  background: var(--mx-soft);
}

.switch-row strong {
  display: block;
  color: var(--mx-text);
  font-size: 16px;
}

.switch-row span {
  color: var(--mx-sub);
}

.banner-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.banner-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  background: var(--mx-soft);
}

.banner-fields {
  display: grid;
  gap: 10px;
}

.banner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px 24px;
}

.form-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.form-grid :deep(.el-input-number),
.form-grid :deep(.el-select),
.form-grid :deep(.el-input) {
  width: 100%;
}

.task-type-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
}

.risk-service-list {
  display: grid;
  gap: 18px;
}

.risk-service-card {
  padding: 18px;
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  background: var(--mx-soft);
}

.risk-service-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.risk-service-head strong {
  display: block;
  color: var(--mx-text);
  font-size: 16px;
}

.risk-service-head span {
  color: var(--mx-sub);
}

.risk-tag-editor {
  display: grid;
  gap: 10px;
}

.risk-tag-row {
  display: grid;
  grid-template-columns: 120px minmax(110px, 0.7fr) minmax(180px, 1.2fr) 150px 120px;
  gap: 10px;
  align-items: center;
}

@media (max-width: 1400px) {
  .service-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .service-grid,
  .banner-grid,
  .form-grid,
  .form-grid.two,
  .risk-tag-row {
    grid-template-columns: 1fr;
  }

  .service-board,
  .section-title.with-action {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
