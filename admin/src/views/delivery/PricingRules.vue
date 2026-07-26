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

          <el-empty v-if="!feeConfig.banners.length" description="暂无跑腿轮播图">
            <el-button type="primary" @click="addBanner">添加轮播图</el-button>
          </el-empty>

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
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
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
    pageConfig.value = { ...pageConfig.value, ...(page || {}) }
    rewardConfig.value = { ...rewardConfig.value, ...(reward || {}) }
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
      saveErrandFeeConfig(selectedRegionId.value, payload),
      saveErrandPageConfig(selectedRegionId.value, pageConfig.value),
      saveErrandRewardPunish(selectedRegionId.value, rewardConfig.value),
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
  border: 1px solid rgba(203, 213, 225, 0.78);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.05);
}

.service-board {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  padding: 24px;
  background: linear-gradient(135deg, #eff6ff, #f8fafc 52%, #ecfeff);
}

.board-copy p,
.section-title span,
.service-head span {
  margin: 0;
  color: #64748b;
}

.board-copy h3 {
  margin: 6px 0;
  color: #0f172a;
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
  color: #0f172a;
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

.service-icon.blue { background: linear-gradient(135deg, #2563eb, #38bdf8); }
.service-icon.cyan { background: linear-gradient(135deg, #0891b2, #22d3ee); }
.service-icon.orange { background: linear-gradient(135deg, #f97316, #facc15); }
.service-icon.purple { background: linear-gradient(135deg, #7c3aed, #c084fc); }

.service-body {
  display: grid;
  gap: 8px;
}

.service-body label {
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.service-body :deep(.el-input-number) {
  width: 100%;
}

.settings-tabs {
  border-radius: 18px;
}

.settings-card {
  border-radius: 18px;
}

.section-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 18px;
}

.section-title strong {
  color: #0f172a;
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
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
}

.switch-row strong {
  display: block;
  color: #0f172a;
  font-size: 16px;
}

.switch-row span {
  color: #64748b;
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
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
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

@media (max-width: 1400px) {
  .service-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .service-grid,
  .banner-grid,
  .form-grid,
  .form-grid.two {
    grid-template-columns: 1fr;
  }

  .service-board,
  .section-title.with-action {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
