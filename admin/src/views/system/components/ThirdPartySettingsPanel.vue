<template>
  <div class="panel-container">
    <!-- 微信小程序配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">微信小程序配置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="AppID">
              <el-input v-model="miniapp.appId" placeholder="请输入小程序AppID" />
            </el-form-item>
            <el-form-item label="AppSecret">
              <el-input v-model="miniapp.appSecret" type="password" show-password placeholder="请输入小程序AppSecret" />
              <div class="form-tip" v-if="miniapp.appSecret === '******'">已配置密钥，留空则不修改</div>
            </el-form-item>
            <el-form-item label="原始ID">
              <el-input v-model="miniapp.originalId" placeholder="如：gh_xxxxxxxxx" />
            </el-form-item>
            <el-form-item label="小程序名称">
              <el-input v-model="miniapp.name" placeholder="请输入小程序名称" />
            </el-form-item>
          </div>
        </el-form>
        <div class="section-actions">
          <el-button @click="testWechatToken('miniapp')" :loading="testingMiniapp">测试获取 AccessToken</el-button>
          <el-button type="primary" @click="saveMiniapp" :loading="savingMiniapp">保存</el-button>
        </div>
      </div>
    </div>

    <!-- 微信公众号配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">微信公众号配置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="AppID">
              <el-input v-model="official.appId" placeholder="请输入公众号AppID" />
            </el-form-item>
            <el-form-item label="AppSecret">
              <el-input v-model="official.appSecret" type="password" show-password placeholder="请输入公众号AppSecret" />
              <div class="form-tip" v-if="official.appSecret === '******'">已配置密钥，留空则不修改</div>
            </el-form-item>
            <el-form-item label="原始ID">
              <el-input v-model="official.originalId" placeholder="如：gh_xxxxxxxxx" />
            </el-form-item>
            <el-form-item label="公众号名称">
              <el-input v-model="official.name" placeholder="请输入公众号名称" />
            </el-form-item>
            <el-form-item label="Token">
              <el-input v-model="official.token" placeholder="用于公众号服务器配置校验" />
              <div class="form-tip">在公众号后台「开发 → 基本配置 → 服务器配置」中填写</div>
            </el-form-item>
            <el-form-item label="EncodingAESKey">
              <el-input v-model="official.encodingAESKey" type="password" show-password placeholder="可选，用于安全模式" />
              <div class="form-tip" v-if="official.encodingAESKey === '******'">已配置密钥，留空则不修改</div>
            </el-form-item>
          </div>
          <el-form-item label="回调地址">
            <el-input :model-value="officialCallbackUrl" readonly>
              <template #append>
                <el-button @click="copyCallbackUrl">复制</el-button>
              </template>
            </el-input>
            <div class="form-tip">在公众号后台「开发 → 基本配置 → 服务器配置」中填写此 URL</div>
          </el-form-item>
        </el-form>
        <div class="section-actions">
          <el-button @click="testOfficialToken" :loading="testingOfficial">测试获取 AccessToken</el-button>
          <el-button type="primary" @click="saveOfficial" :loading="savingOfficial">保存</el-button>
        </div>
      </div>
    </div>

    <!-- 微信支付配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">微信支付配置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="商户号 (mchId)">
              <el-input v-model="wechatPay.mchId" placeholder="请输入微信支付商户号" />
            </el-form-item>
            <el-form-item label="APIv3 密钥">
              <el-input v-model="wechatPay.apiV3Key" type="password" show-password placeholder="请输入APIv3密钥" />
            </el-form-item>
            <el-form-item label="证书序列号">
              <el-input v-model="wechatPay.certSerialNo" placeholder="请输入证书序列号" />
            </el-form-item>
            <el-form-item label="支付回调地址">
              <el-input v-model="wechatPay.notifyUrl" placeholder="如：https://api.example.com/wxpay/notify" />
            </el-form-item>
          </div>
        </el-form>
        <div class="section-actions">
          <el-button type="primary" @click="saveWechatPay" :loading="savingWechatPay">保存</el-button>
        </div>
      </div>
    </div>

    <!-- 邮件配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">邮件配置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="SMTP 服务器">
              <el-input v-model="email.host" placeholder="如：smtp.qq.com" />
            </el-form-item>
            <el-form-item label="端口">
              <el-input-number v-model="email.port" :min="1" :max="65535" style="width: 100%" />
            </el-form-item>
            <el-form-item label="用户名">
              <el-input v-model="email.user" placeholder="请输入邮箱用户名" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="email.pass" type="password" show-password placeholder="请输入邮箱密码" />
            </el-form-item>
            <el-form-item label="发件人地址">
              <el-input v-model="email.fromEmail" placeholder="如：noreply@example.com" />
            </el-form-item>
            <el-form-item label="SSL">
              <el-switch v-model="email.secure" active-text="启用" inactive-text="关闭" />
            </el-form-item>
          </div>
        </el-form>
        <div class="section-actions">
          <el-button @click="showTestEmail = true">发送测试邮件</el-button>
          <el-button type="primary" @click="saveEmail" :loading="savingEmail">保存</el-button>
        </div>
      </div>
    </div>

    <!-- AI 配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">AI / 机器人配置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="AI 服务提供商">
              <el-select v-model="ai.provider" style="width: 100%">
                <el-option label="OpenAI" value="openai" />
                <el-option label="DeepSeek" value="deepseek" />
                <el-option label="通义千问" value="qwen" />
                <el-option label="自定义" value="custom" />
              </el-select>
            </el-form-item>
            <el-form-item label="API Key">
              <el-input v-model="ai.apiKey" type="password" show-password placeholder="请输入API Key" />
            </el-form-item>
            <el-form-item label="API 端点">
              <el-input v-model="ai.apiEndpoint" placeholder="如：https://api.openai.com/v1" />
            </el-form-item>
            <el-form-item label="模型">
              <el-input v-model="ai.model" placeholder="如：gpt-4" />
            </el-form-item>
            <el-form-item label="温度">
              <el-input-number v-model="ai.temperature" :min="0" :max="2" :step="0.1" :precision="1" style="width: 100%" />
            </el-form-item>
            <el-form-item label="最大 Token 数">
              <el-input-number v-model="ai.maxTokens" :min="100" :max="32000" style="width: 100%" />
            </el-form-item>
          </div>
          <div class="switch-item" style="margin-top: 16px">
            <div>
              <div class="switch-label">启用 AI 功能</div>
              <div class="switch-desc">开启后可使用 AI 生成内容、智能审核等功能</div>
            </div>
            <el-switch v-model="ai.enabled" />
          </div>
        </el-form>
        <div class="section-actions">
          <el-button @click="testAi" :loading="testingAi">测试 AI 连接</el-button>
          <el-button type="primary" @click="saveAi" :loading="savingAi">保存</el-button>
        </div>
      </div>
    </div>

    <!-- 机器人配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">机器人配置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="每日发帖限制">
              <el-input-number v-model="robot.postDailyLimit" :min="0" :max="1000" style="width: 100%" />
            </el-form-item>
            <el-form-item label="每日评论限制">
              <el-input-number v-model="robot.commentDailyLimit" :min="0" :max="10000" style="width: 100%" />
            </el-form-item>
            <el-form-item label="默认间隔（秒）">
              <el-input-number v-model="robot.defaultInterval" :min="10" :max="3600" style="width: 100%" />
            </el-form-item>
            <el-form-item label="自动审核">
              <el-switch v-model="robot.autoAudit" active-text="开启" inactive-text="关闭" />
            </el-form-item>
          </div>
        </el-form>
        <div class="section-actions">
          <el-button type="primary" @click="saveRobot" :loading="savingRobot">保存</el-button>
        </div>
      </div>
    </div>

    <!-- 高德地图配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">高德地图配置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="Web服务 Key">
              <el-input v-model="amap.webServiceKey" placeholder="用于后端调用高德 Web 服务 API" />
              <div class="form-tip">用于地理编码、逆地理编码、POI 搜索等服务端接口</div>
            </el-form-item>
            <el-form-item label="JS-API Key">
              <el-input v-model="amap.jsApiKey" placeholder="用于后台前端加载高德 JavaScript API 2.0" />
              <div class="form-tip">用于后台地图展示、选点等功能</div>
            </el-form-item>
            <el-form-item label="JS-API 安全密钥">
              <el-input v-model="amap.securityJsCode" type="password" show-password placeholder="用于高德 JS API 安全校验" />
              <div class="form-tip" v-if="amap.securityJsCode === '******'">已配置密钥，留空则不修改</div>
              <div class="form-tip" v-else>注意：生产环境建议使用代理服务方式保护安全密钥</div>
            </el-form-item>
            <el-form-item label="代理服务地址">
              <el-input v-model="amap.serviceHost" placeholder="如：/_AMapService（生产环境推荐）" />
              <div class="form-tip">可选。生产环境建议用代理服务方式保护安全密钥</div>
            </el-form-item>
            <el-form-item label="默认城市">
              <el-input v-model="amap.defaultCity" placeholder="全国" />
            </el-form-item>
            <el-form-item label="默认中心点经度">
              <el-input-number v-model="amap.defaultLongitude" :precision="6" :step="0.01" style="width: 100%" placeholder="如：113.264385" />
            </el-form-item>
            <el-form-item label="默认中心点纬度">
              <el-input-number v-model="amap.defaultLatitude" :precision="6" :step="0.01" style="width: 100%" placeholder="如：23.129112" />
            </el-form-item>
          </div>
        </el-form>
        <div class="section-actions">
          <el-button @click="testAmapWebKey" :loading="testingAmapWeb">测试 Web服务 Key</el-button>
          <el-button @click="testAmapJsKey" :loading="testingAmapJs">测试 JS API Key</el-button>
          <el-button type="primary" @click="saveAmap" :loading="savingAmap">保存高德配置</el-button>
        </div>
        <div class="external-links">
          <el-link type="primary" href="https://console.amap.com/dev/key/app" target="_blank">获取 Web服务 Key</el-link>
          <el-link type="primary" href="https://console.amap.com/dev/key/app" target="_blank">获取 JS-API Key</el-link>
          <el-link type="primary" href="https://console.amap.com/dev/key/app" target="_blank">管理安全密钥</el-link>
        </div>
      </div>
    </div>

    <!-- 测试邮件弹窗 -->
    <el-dialog v-model="showTestEmail" title="发送测试邮件" width="500px">
      <el-form label-position="top">
        <el-form-item label="收件人邮箱" required>
          <el-input v-model="testEmailForm.toEmail" placeholder="请输入收件人邮箱" />
        </el-form-item>
        <el-form-item label="邮件主题">
          <el-input v-model="testEmailForm.subject" placeholder="测试邮件" />
        </el-form-item>
        <el-form-item label="邮件内容">
          <el-input v-model="testEmailForm.content" type="textarea" :rows="4" placeholder="请输入邮件内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTestEmail = false">取消</el-button>
        <el-button type="primary" :loading="testingEmail" @click="sendTestEmail">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  fetchConfigGroup, saveConfigGroup,
  fetchEmailConfig, saveEmailConfig, testEmailConfig,
  fetchAiConfig, saveAiConfig, testAiConfig,
  fetchRobotConfig, saveRobotConfig,
  fetchWechatAccessToken,
  fetchAmapConfig, saveAmapConfig,
  testAmapWebKey as apiTestAmapWebKey,
  testAmapJsKey as apiTestAmapJsKey,
  testWechatOfficialToken as apiTestOfficialToken
} from '@/api/admin'

const savingMiniapp = ref(false)
const testingMiniapp = ref(false)
const savingOfficial = ref(false)
const testingOfficial = ref(false)
const savingWechatPay = ref(false)
const savingEmail = ref(false)
const testingEmail = ref(false)
const showTestEmail = ref(false)
const savingAi = ref(false)
const testingAi = ref(false)
const savingRobot = ref(false)
const savingAmap = ref(false)
const testingAmapWeb = ref(false)
const testingAmapJs = ref(false)

const amap = reactive<Record<string, any>>({
  webServiceKey: '',
  jsApiKey: '',
  securityJsCode: '',
  serviceHost: '',
  defaultCity: '全国',
  defaultLongitude: null,
  defaultLatitude: null
})

const miniapp = reactive<Record<string, any>>({
  appId: '',
  appSecret: '',
  originalId: '',
  name: ''
})

const official = reactive<Record<string, any>>({
  appId: '',
  appSecret: '',
  originalId: '',
  name: '',
  token: '',
  encodingAESKey: ''
})

const officialCallbackUrl = computed(() => {
  const configuredBase = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
  if (configuredBase && !configuredBase.startsWith('/')) {
    return `${configuredBase}/wechat/official/callback`
  }
  const { protocol, hostname, origin } = window.location
  const localBackendOrigin = ['localhost', '127.0.0.1'].includes(hostname)
    ? `${protocol}//${hostname}:3000`
    : origin
  return `${localBackendOrigin}/wechat/official/callback`
})

function copyCallbackUrl() {
  navigator.clipboard.writeText(officialCallbackUrl.value).then(() => {
    ElMessage.success('已复制回调地址')
  }).catch(() => {
    ElMessage.info(officialCallbackUrl.value)
  })
}

const wechatPay = reactive<Record<string, any>>({
  mchId: '',
  apiV3Key: '',
  certSerialNo: '',
  notifyUrl: ''
})

const email = reactive<Record<string, any>>({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  fromEmail: ''
})

const ai = reactive<Record<string, any>>({
  enabled: false,
  provider: 'openai',
  apiKey: '',
  apiEndpoint: '',
  model: '',
  temperature: 0.7,
  maxTokens: 2000
})

const robot = reactive<Record<string, any>>({
  postDailyLimit: 10,
  commentDailyLimit: 50,
  defaultInterval: 60,
  autoAudit: false,
  enabledRegions: []
})

const testEmailForm = reactive({
  toEmail: '',
  subject: '测试邮件',
  content: ''
})

async function loadMiniapp() {
  try {
    const res: any = await fetchConfigGroup('miniapp')
    const data = res?.data || res
    if (data && typeof data === 'object') {
      const cfg = data.miniapp || data
      Object.assign(miniapp, cfg)
    }
  } catch {
    // ignore
  }
}

async function loadOfficial() {
  try {
    const res: any = await fetchConfigGroup('wechat_official')
    const data = res?.data || res
    if (data && typeof data === 'object') {
      const cfg = data.wechat_official || data
      Object.assign(official, cfg)
    }
  } catch {
    // ignore
  }
}

async function saveOfficial() {
  savingOfficial.value = true
  try {
    await saveConfigGroup('wechat_official', { wechat_official: { ...official } })
    ElMessage.success('公众号配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingOfficial.value = false
  }
}

async function testOfficialToken() {
  testingOfficial.value = true
  try {
    const res: any = await apiTestOfficialToken()
    if (res?.success) {
      ElMessage.success(`AccessToken 获取成功: ${res.tokenPreview}`)
    } else {
      ElMessage.error(res?.error || '获取失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '获取失败')
  } finally {
    testingOfficial.value = false
  }
}

async function loadWechatPay() {
  try {
    const res: any = await fetchConfigGroup('wechat_pay')
    const data = res?.data || res
    if (data && typeof data === 'object') {
      const cfg = data.wechat_pay || data
      Object.assign(wechatPay, cfg)
    }
  } catch {
    // ignore
  }
}

async function loadEmail() {
  try {
    const data = await fetchEmailConfig()
    if (data && typeof data === 'object') {
      Object.assign(email, data)
    }
  } catch {
    // ignore
  }
}

async function loadAi() {
  try {
    const res = await fetchAiConfig()
    const data = res?.data || res
    if (data && typeof data === 'object') {
      Object.assign(ai, data)
    }
  } catch {
    // ignore
  }
}

async function loadRobot() {
  try {
    const res = await fetchRobotConfig()
    const data = res?.data || res
    if (data && typeof data === 'object') {
      Object.assign(robot, data)
    }
  } catch {
    // ignore
  }
}

async function loadAmap() {
  try {
    const res: any = await fetchAmapConfig()
    const data = res?.data || res
    if (data && typeof data === 'object') {
      Object.assign(amap, data)
    }
  } catch {
    // ignore
  }
}

async function saveMiniapp() {
  savingMiniapp.value = true
  try {
    await saveConfigGroup('miniapp', { miniapp: { ...miniapp } })
    ElMessage.success('小程序配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingMiniapp.value = false
  }
}

async function saveWechatPay() {
  savingWechatPay.value = true
  try {
    await saveConfigGroup('wechat_pay', { wechat_pay: { ...wechatPay } })
    ElMessage.success('微信支付配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingWechatPay.value = false
  }
}

async function saveEmail() {
  savingEmail.value = true
  try {
    await saveEmailConfig({ ...email })
    ElMessage.success('邮件配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingEmail.value = false
  }
}

async function saveAi() {
  savingAi.value = true
  try {
    await saveAiConfig({ ...ai })
    ElMessage.success('AI 配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingAi.value = false
  }
}

async function saveRobot() {
  savingRobot.value = true
  try {
    await saveRobotConfig({ ...robot })
    ElMessage.success('机器人配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingRobot.value = false
  }
}

async function saveAmap() {
  savingAmap.value = true
  try {
    await saveAmapConfig({ ...amap })
    ElMessage.success('高德地图配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingAmap.value = false
  }
}

async function testAmapWebKey() {
  testingAmapWeb.value = true
  try {
    const res: any = await apiTestAmapWebKey()
    if (res?.success) {
      ElMessage.success(res?.message || 'Web服务 Key 测试成功')
    } else {
      ElMessage.warning(res?.message || 'Web服务 Key 未配置或测试失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '测试失败')
  } finally {
    testingAmapWeb.value = false
  }
}

async function testAmapJsKey() {
  testingAmapJs.value = true
  try {
    const res: any = await apiTestAmapJsKey()
    if (res?.success) {
      ElMessage.success(res?.message || 'JS API Key 测试成功')
    } else {
      ElMessage.warning(res?.message || 'JS API Key 未配置或测试失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '测试失败')
  } finally {
    testingAmapJs.value = false
  }
}

async function testWechatToken(platform: string) {
  if (platform === 'miniapp') testingMiniapp.value = true
  else testingOfficial.value = true
  try {
    const payload = platform === 'miniapp' ? { ...miniapp } : { ...official }
    const res: any = await fetchWechatAccessToken(platform, payload)
    ElMessage.success(`AccessToken 获取成功: ${(res?.accessToken || '').substring(0, 20)}...`)
  } catch (e: any) {
    ElMessage.error(e?.message || '获取失败')
  } finally {
    if (platform === 'miniapp') testingMiniapp.value = false
    else testingOfficial.value = false
  }
}

async function sendTestEmail() {
  if (!testEmailForm.toEmail) {
    ElMessage.warning('请输入收件人邮箱')
    return
  }
  testingEmail.value = true
  try {
    await testEmailConfig({ ...testEmailForm })
    ElMessage.success('测试邮件已发送')
    showTestEmail.value = false
  } catch (e: any) {
    ElMessage.error(e?.message || '发送失败')
  } finally {
    testingEmail.value = false
  }
}

async function testAi() {
  testingAi.value = true
  try {
    const res: any = await testAiConfig()
    if (res?.success) {
      ElMessage.success(res?.message || 'AI 连接测试成功')
    } else {
      ElMessage.warning(res?.message || 'AI 未配置')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '测试失败')
  } finally {
    testingAi.value = false
  }
}

onMounted(() => {
  loadMiniapp()
  loadOfficial()
  loadWechatPay()
  loadEmail()
  loadAi()
  loadRobot()
  loadAmap()
})
</script>

<style scoped>
.panel-container {
  display: grid;
  gap: 24px;
}
.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.6);
}
.switch-label {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
}
.switch-desc {
  color: #94a3b8;
  font-size: 12px;
}
.form-tip {
  color: #94a3b8;
  font-size: 12px;
  margin-top: 4px;
}
.section-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}
.external-links {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(226, 232, 240, 0.6);
}
</style>
