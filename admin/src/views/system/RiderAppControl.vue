<template>
  <div class="page-shell" v-loading="loading">
    <PageHeader title="骑手 App 控制中心" subtitle="控制骑手端运行状态、版本发布、定位参数和功能入口">
      <template #actions>
        <el-button @click="loadConfig">刷新</el-button>
        <el-button type="primary" :loading="saving" @click="saveConfig">保存配置</el-button>
      </template>
    </PageHeader>

    <el-alert
      title="这里控制 App 运行能力；骑手审核、订单调度和结算继续在原业务菜单处理。"
      type="info"
      :closable="false"
      show-icon
    />

    <div class="config-grid">
      <el-card shadow="never">
        <template #header><span class="card-title">运行状态</span></template>
        <el-form label-position="top">
          <el-form-item label="App 总开关">
            <el-switch v-model="form.enabled" active-text="允许使用" inactive-text="停止服务" />
          </el-form-item>
          <el-form-item label="维护模式">
            <el-switch v-model="form.maintenance.enabled" active-text="维护中" inactive-text="正常运行" />
          </el-form-item>
          <el-form-item label="维护标题">
            <el-input v-model="form.maintenance.title" maxlength="40" show-word-limit />
          </el-form-item>
          <el-form-item label="维护说明">
            <el-input v-model="form.maintenance.message" type="textarea" :rows="3" maxlength="200" show-word-limit />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never">
        <template #header><span class="card-title">版本发布</span></template>
        <el-form label-position="top">
          <div class="two-cols">
            <el-form-item label="最新版本">
              <el-input v-model="form.version.latest" placeholder="1.0.0" />
            </el-form-item>
            <el-form-item label="最低可用版本">
              <el-input v-model="form.version.minimum" placeholder="1.0.0" />
            </el-form-item>
          </div>
          <el-form-item label="强制更新">
            <el-switch v-model="form.version.forceUpdate" active-text="强制" inactive-text="可跳过" />
          </el-form-item>
          <el-form-item label="更新说明">
            <el-input v-model="form.version.releaseNotes" type="textarea" :rows="3" maxlength="500" show-word-limit />
          </el-form-item>
          <el-form-item label="iOS 下载地址">
            <el-input v-model="form.version.iosDownloadUrl" placeholder="https://..." />
          </el-form-item>
          <el-form-item label="Android 下载地址">
            <el-input v-model="form.version.androidDownloadUrl" placeholder="https://..." />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never">
        <template #header><span class="card-title">运行参数</span></template>
        <el-form label-position="top">
          <el-form-item label="WebSocket 相对路径">
            <el-input v-model="form.runtime.wsPath" placeholder="/api/ws-native" />
            <div class="form-tip">只允许站内相对路径，不能配置其他服务器。</div>
          </el-form-item>
          <el-form-item label="定位上传间隔">
            <el-input-number v-model="form.runtime.locationIntervalSeconds" :min="15" :max="300" :step="5" />
            <span class="unit">秒</span>
          </el-form-item>
          <el-form-item label="后台持续定位">
            <el-switch
              v-model="form.runtime.backgroundLocationEnabled"
              active-text="允许"
              inactive-text="停止"
            />
            <div class="form-tip">关闭后，骑手 App 将停止新轨迹采集，但仍会保留尚未补传的本地轨迹。</div>
          </el-form-item>
          <div class="two-cols">
            <el-form-item label="本地轨迹队列上限">
              <el-input-number v-model="form.runtime.locationQueueMaxPoints" :min="50" :max="1000" :step="50" />
              <span class="unit">点</span>
            </el-form-item>
            <el-form-item label="单次补传数量">
              <el-input-number v-model="form.runtime.locationBatchSize" :min="1" :max="50" :step="5" />
              <span class="unit">点</span>
            </el-form-item>
          </div>
          <el-form-item label="最长补传时效">
            <el-input-number v-model="form.runtime.locationMaxAgeHours" :min="1" :max="72" />
            <span class="unit">小时</span>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never">
        <template #header><span class="card-title">功能开关与公告</span></template>
        <div class="switch-list">
          <div v-for="item in featureItems" :key="item.key" class="switch-row">
            <div>
              <div class="switch-title">{{ item.title }}</div>
              <div class="switch-desc">{{ item.desc }}</div>
            </div>
            <el-switch v-model="form.features[item.key]" />
          </div>
        </div>
        <el-divider />
        <el-form label-position="top">
          <el-form-item label="App 公告">
            <el-switch v-model="form.notice.enabled" active-text="显示" inactive-text="隐藏" />
          </el-form-item>
          <el-form-item label="公告标题">
            <el-input v-model="form.notice.title" maxlength="40" show-word-limit />
          </el-form-item>
          <el-form-item label="公告内容">
            <el-input v-model="form.notice.content" type="textarea" :rows="3" maxlength="300" show-word-limit />
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { request } from '@/api/request'

type FeatureKey = 'orderPool' | 'chat' | 'income' | 'incentives'

const defaults = () => ({
  enabled: true,
  maintenance: { enabled: false, title: '系统维护中', message: '骑手 App 正在维护，请稍后再试。' },
  version: {
    latest: '1.0.0', minimum: '1.0.0', forceUpdate: false, releaseNotes: '',
    iosDownloadUrl: '', androidDownloadUrl: ''
  },
  notice: { enabled: false, title: '', content: '' },
  runtime: {
    wsPath: '/api/ws-native', locationIntervalSeconds: 30, backgroundLocationEnabled: true,
    locationQueueMaxPoints: 300, locationBatchSize: 50, locationMaxAgeHours: 24
  },
  features: { orderPool: true, chat: true, income: true, incentives: true } as Record<FeatureKey, boolean>
})

const form = reactive(defaults())
const saved = ref(defaults())
const loading = ref(false)
const saving = ref(false)
const featureItems: Array<{ key: FeatureKey; title: string; desc: string }> = [
  { key: 'orderPool', title: '订单大厅', desc: '控制订单池展示与接单入口' },
  { key: 'chat', title: '骑手聊天', desc: '控制消息列表和聊天入口' },
  { key: 'income', title: '收入信息', desc: '控制余额与收入卡片' },
  { key: 'incentives', title: '奖励活动', desc: '控制奖励记录入口' }
]

function assignConfig(value: any) {
  const next = defaults()
  Object.assign(next, value || {})
  Object.assign(next.maintenance, value?.maintenance || {})
  Object.assign(next.version, value?.version || {})
  Object.assign(next.notice, value?.notice || {})
  Object.assign(next.runtime, value?.runtime || {})
  Object.assign(next.features, value?.features || {})
  Object.assign(form, next)
  saved.value = JSON.parse(JSON.stringify(next))
}

async function loadConfig() {
  loading.value = true
  try {
    const response: any = await request.get('/admin/rider-app/config')
    assignConfig(response?.data || response)
  } finally {
    loading.value = false
  }
}

function validate() {
  const versionPattern = /^\d+\.\d+\.\d+$/
  if (!versionPattern.test(form.version.latest) || !versionPattern.test(form.version.minimum)) {
    throw new Error('版本号必须使用 x.y.z 格式')
  }
  for (const [label, url] of [['iOS', form.version.iosDownloadUrl], ['Android', form.version.androidDownloadUrl]]) {
    if (url && !/^https:\/\//i.test(url)) throw new Error(`${label} 下载地址必须使用 HTTPS`)
  }
  if (!form.runtime.wsPath.startsWith('/') || form.runtime.wsPath.startsWith('//') || form.runtime.wsPath.includes('://')) {
    throw new Error('WebSocket 必须填写站内相对路径')
  }
  if (form.runtime.locationQueueMaxPoints < 50 || form.runtime.locationQueueMaxPoints > 1000) {
    throw new Error('本地轨迹队列上限必须为 50 至 1000 点')
  }
  if (form.runtime.locationBatchSize < 1 || form.runtime.locationBatchSize > 50) {
    throw new Error('单次补传数量必须为 1 至 50 点')
  }
  if (form.runtime.locationMaxAgeHours < 1 || form.runtime.locationMaxAgeHours > 72) {
    throw new Error('最长补传时效必须为 1 至 72 小时')
  }
}

async function confirmDangerousChanges() {
  const changes: string[] = []
  if (saved.value.enabled && !form.enabled) changes.push('停止整个骑手 App 服务')
  if (!saved.value.maintenance.enabled && form.maintenance.enabled) changes.push('开启维护模式')
  if (!saved.value.version.forceUpdate && form.version.forceUpdate) changes.push('开启强制更新')
  if (!changes.length) return
  await ElMessageBox.confirm(`本次将${changes.join('、')}，确认继续？`, '高影响配置确认', { type: 'warning' })
}

async function saveConfig() {
  try {
    validate()
    await confirmDangerousChanges()
    saving.value = true
    const response: any = await request.put('/admin/rider-app/config', JSON.parse(JSON.stringify(form)))
    assignConfig(response?.data || response)
    ElMessage.success('骑手 App 配置已保存')
  } catch (error: any) {
    if (error !== 'cancel' && error?.message !== 'cancel') ElMessage.error(error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.page-shell { display: flex; flex-direction: column; gap: 16px; }
.config-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.card-title, .switch-title { font-weight: 700; color: var(--mx-text); }
.two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.switch-list { display: flex; flex-direction: column; gap: 16px; }
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.switch-desc, .form-tip { margin-top: 4px; color: var(--mx-muted); font-size: 12px; }
.unit { margin-left: 8px; color: var(--mx-muted); }
@media (max-width: 900px) {
  .config-grid, .two-cols { grid-template-columns: 1fr; }
}
</style>
