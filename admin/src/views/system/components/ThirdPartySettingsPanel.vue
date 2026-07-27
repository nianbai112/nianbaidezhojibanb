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
            <el-form-item label="公众号二维码地址">
              <el-input v-model="official.qrUrl" placeholder="请输入公众号二维码图片 URL" />
              <div class="form-tip">小程序“绑定微信公众号”弹窗会展示此二维码。</div>
            </el-form-item>
            <el-form-item label="身份绑定链接">
              <el-input v-model="official.bindUrl" placeholder="请输入公众号身份绑定页面 URL，可选" />
              <div class="form-tip">填写后，小程序弹窗会显示“绑定身份”入口。</div>
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
          <el-alert
            class="pay-alert"
            type="info"
            show-icon
            :closable="false"
            title="运营者直接在后台填写微信支付 V3 资料，后端会优先使用这里的配置"
          />
          <div class="form-grid two">
            <el-form-item label="商户号 (mchId)">
              <el-input v-model="wechatPay.mchId" placeholder="请输入微信支付商户号" />
            </el-form-item>
            <el-form-item label="APIv3 密钥">
              <el-input v-model="wechatPay.apiV3Key" type="password" show-password placeholder="请输入APIv3密钥" />
              <div class="form-tip" v-if="wechatPay.apiV3Key === '******'">已配置密钥，留空则不修改</div>
            </el-form-item>
            <el-form-item label="证书序列号">
              <el-input v-model="wechatPay.certSerialNo" placeholder="请输入证书序列号" />
            </el-form-item>
            <el-form-item label="支付回调地址">
              <el-input v-model="wechatPay.notifyUrl" placeholder="如：https://api.example.com/wxpay/notify">
                <template #append>
                  <el-button @click="wechatPay.notifyUrl = payNotifyUrl">推荐地址</el-button>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item label="退款回调地址">
              <el-input v-model="wechatPay.refundNotifyUrl" placeholder="如：https://api.example.com/wxpay/refund-notify">
                <template #append>
                  <el-button @click="wechatPay.refundNotifyUrl = payRefundNotifyUrl">推荐地址</el-button>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item label="微信支付公钥 ID（可选）">
              <el-input v-model="wechatPay.platformPublicKeyId" placeholder="如：PUB_KEY_ID_011..." />
              <div class="form-tip">微信商户平台显示的公钥 ID，一般以 PUB_KEY_ID_ 开头</div>
            </el-form-item>
            <el-form-item class="wide-field" label="微信支付公钥">
              <el-input
                v-model="wechatPay.platformPublicKey"
                type="textarea"
                :rows="5"
                placeholder="粘贴 -----BEGIN PUBLIC KEY----- 开头的微信支付公钥"
              />
              <div class="form-tip">用于微信支付回调验签；如果使用平台证书，也可以填写下面的平台证书</div>
            </el-form-item>
            <el-form-item class="wide-field" label="微信支付平台证书（兼容旧版）">
              <el-input
                v-model="wechatPay.platformCert"
                type="textarea"
                :rows="5"
                placeholder="粘贴 -----BEGIN CERTIFICATE----- 开头的平台证书"
              />
              <div class="form-tip" v-if="wechatPay.platformCert === '******'">已配置证书，留空则不修改</div>
            </el-form-item>
            <el-form-item class="wide-field" label="商户证书 CERT（可选留存）">
              <el-input
                v-model="wechatPay.merchantCert"
                type="textarea"
                :rows="5"
                placeholder="粘贴 apiclient_cert.pem 内容，可选"
              />
              <div class="form-tip" v-if="wechatPay.merchantCert === '******'">已配置证书，留空则不修改</div>
            </el-form-item>
            <el-form-item class="wide-field" label="商户私钥 KEY">
              <el-input
                v-model="wechatPay.merchantPrivateKey"
                type="textarea"
                :rows="6"
                placeholder="粘贴 apiclient_key.pem 内容，必须是 -----BEGIN PRIVATE KEY----- 开头"
              />
              <div class="form-tip" v-if="wechatPay.merchantPrivateKey === '******'">已配置私钥，留空则不修改</div>
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
      <div class="card-header"><div class="card-title">飞鹅云平台托管设备（可选）</div></div>
      <div class="card-body">
        <el-alert class="pay-alert" type="info" show-icon :closable="false" title="只有平台自购、租赁或统一代管的飞鹅云设备才需要这里的 USER/UKEY。商家自有设备在商家打印机配置中填写自己的凭证，不依赖超级管理员。" />
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="启用飞鹅云"><el-switch v-model="feie.enabled" active-text="开启" inactive-text="关闭" /></el-form-item>
            <el-form-item label="USER"><el-input v-model="feie.user" placeholder="飞鹅云开发者账号" /></el-form-item>
            <el-form-item label="UKEY"><el-input v-model="feie.ukey" type="password" show-password placeholder="飞鹅云开发者 UKEY" /><div v-if="feie.ukey === '******'" class="form-tip">已配置 UKEY，留空则不修改</div></el-form-item>
          </div>
        </el-form>
        <div class="section-actions"><el-button type="primary" :loading="savingFeie" @click="saveFeie">保存平台托管飞鹅云配置</el-button></div>
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

    <!-- 阿里云短信配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">阿里云短信配置</div></div>
      <div class="card-body">
        <el-form label-position="top">
          <el-alert
            class="pay-alert"
            type="info"
            show-icon
            :closable="false"
            title="用于手机号验证码登录。需先在阿里云开通短信服务，并完成签名、模板审核。"
          />
          <div class="form-grid two">
            <el-form-item label="短信服务商">
              <el-select v-model="sms.provider" placeholder="请选择短信服务商" style="width: 100%">
                <el-option label="阿里云短信" value="aliyun" />
              </el-select>
            </el-form-item>
            <el-form-item label="AccessKey ID">
              <el-input v-model="sms.aliyunAccessKeyId" type="password" show-password placeholder="请输入阿里云 AccessKey ID" />
              <div class="form-tip" v-if="sms.aliyunAccessKeyId === '******'">已配置密钥，留空则不修改</div>
            </el-form-item>
            <el-form-item label="AccessKey Secret">
              <el-input v-model="sms.aliyunAccessKeySecret" type="password" show-password placeholder="请输入阿里云 AccessKey Secret" />
              <div class="form-tip" v-if="sms.aliyunAccessKeySecret === '******'">已配置密钥，留空则不修改</div>
            </el-form-item>
            <el-form-item label="短信签名">
              <el-input v-model="sms.aliyunSignName" placeholder="请输入已审核通过的短信签名" />
            </el-form-item>
            <el-form-item label="模板 Code">
              <el-input v-model="sms.aliyunTemplateCode" placeholder="如：SMS_123456789" />
              <div class="form-tip">模板内容需包含验证码变量 code，例如：验证码为 ${code}</div>
            </el-form-item>
            <el-form-item label="Endpoint">
              <el-input v-model="sms.aliyunEndpoint" placeholder="dysmsapi.aliyuncs.com" />
            </el-form-item>
            <el-form-item label="Region ID">
              <el-input v-model="sms.aliyunRegionId" placeholder="cn-hangzhou" />
            </el-form-item>
          </div>
        </el-form>
        <div class="section-actions">
          <el-button type="primary" @click="saveSms" :loading="savingSms">保存短信配置</el-button>
        </div>
      </div>
    </div>

    <!-- 阿里云市场 IP 归属地配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">IP 归属地解析（阿里云市场）</div></div>
      <div class="card-body">
        <el-alert
          class="pay-alert"
          type="info"
          show-icon
          :closable="false"
          title="已对接蓝笛全球 IP 归属地接口；只需填写 AppCode。仅在用户登录或用户主动刷新 IP 归属地时调用。"
        />
        <el-form label-position="top">
          <div class="form-grid two">
            <el-form-item label="AppCode">
              <el-input v-model="ipGeo.appCode" type="password" show-password placeholder="请输入阿里云市场 AppCode" />
              <div class="form-tip" v-if="ipGeo.appCode === '******'">已配置 AppCode，留空则不修改</div>
            </el-form-item>
            <el-form-item label="解析服务">
              <el-switch v-model="ipGeo.enabled" active-text="开启" inactive-text="关闭" />
              <div class="form-tip">关闭后不请求第三方接口，不消耗调用次数。</div>
            </el-form-item>
          </div>
          <div class="switch-item">
            <div><div class="switch-label">国家/地区</div><div class="switch-desc">后台用户列表与详情中显示国家或地区</div></div>
            <el-switch v-model="ipGeo.showCountry" />
          </div>
          <div class="switch-item">
            <div><div class="switch-label">省/州/区域</div><div class="switch-desc">小程序个人中心默认展示这一层级</div></div>
            <el-switch v-model="ipGeo.showProvince" />
          </div>
          <div class="switch-item">
            <div><div class="switch-label">城市</div><div class="switch-desc">在后台用户列表与详情中展示</div></div>
            <el-switch v-model="ipGeo.showCity" />
          </div>
          <div class="switch-item">
            <div><div class="switch-label">区/县</div><div class="switch-desc">供应商未返回时会自动留空</div></div>
            <el-switch v-model="ipGeo.showDistrict" />
          </div>
        </el-form>
        <div class="section-actions">
          <el-button type="primary" @click="saveIpGeo" :loading="savingIpGeo">保存 IP 归属地配置</el-button>
        </div>
      </div>
    </div>

    <!-- AI / 机器人配置 -->
    <div class="glass-card">
      <div class="card-header"><div class="card-title">AI / 机器人配置已归入 AI 运营中心</div></div>
      <div class="card-body">
        <div class="ai-entry-card">
          <div>
            <b>模型、审核、机器人账号池、运营频率统一维护</b>
            <p>第三方配置只保留微信、支付、邮件、地图等外部平台资料，避免运营者在两个地方重复填写。</p>
          </div>
          <div class="ai-entry-actions">
            <el-button type="primary" @click="goAi('/ai/config')">AI / 机器人配置</el-button>
            <el-button @click="goAi('/ai/bots')">机器人管理</el-button>
            <el-button @click="goAi('/ai/ops-config')">AI运营配置</el-button>
          </div>
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
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  fetchConfigGroup, saveConfigGroup,
  fetchEmailConfig, saveEmailConfig, testEmailConfig,
  fetchWechatAccessToken,
  fetchAmapConfig, saveAmapConfig,
  fetchFeieConfig, saveFeieConfig,
  testAmapWebKey as apiTestAmapWebKey,
  testAmapJsKey as apiTestAmapJsKey,
  testWechatOfficialToken as apiTestOfficialToken
} from '@/api/admin'

const router = useRouter()

const savingMiniapp = ref(false)
const testingMiniapp = ref(false)
const savingOfficial = ref(false)
const testingOfficial = ref(false)
const savingWechatPay = ref(false)
const savingEmail = ref(false)
const testingEmail = ref(false)
const showTestEmail = ref(false)
const savingSms = ref(false)
const savingAmap = ref(false)
const testingAmapWeb = ref(false)
const testingAmapJs = ref(false)
const savingIpGeo = ref(false)
const savingFeie = ref(false)

const ipGeo = reactive<Record<string, any>>({
  enabled: false,
  appCode: '',
  showCountry: true,
  showProvince: true,
  showCity: true,
  showDistrict: false,
})

const amap = reactive<Record<string, any>>({
  webServiceKey: '',
  jsApiKey: '',
  securityJsCode: '',
  serviceHost: '',
  defaultCity: '全国',
  defaultLongitude: null,
  defaultLatitude: null
})

const feie = reactive<Record<string, any>>({ enabled: false, user: '', ukey: '' })

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
  qrUrl: '',
  bindUrl: '',
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
  notifyUrl: '',
  refundNotifyUrl: '',
  platformPublicKeyId: '',
  platformPublicKey: '',
  platformCert: '',
  merchantCert: '',
  merchantPrivateKey: ''
})

const backendOrigin = computed(() => {
  const configuredBase = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
  if (configuredBase && !configuredBase.startsWith('/')) return configuredBase
  const { protocol, hostname, origin } = window.location
  return ['localhost', '127.0.0.1'].includes(hostname)
    ? `${protocol}//${hostname}:3000`
    : origin
})

const payNotifyUrl = computed(() => `${backendOrigin.value}/wxpay/notify`)
const payRefundNotifyUrl = computed(() => `${backendOrigin.value}/wxpay/refund-notify`)

const email = reactive<Record<string, any>>({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  fromEmail: ''
})

const sms = reactive<Record<string, any>>({
  provider: 'aliyun',
  aliyunAccessKeyId: '',
  aliyunAccessKeySecret: '',
  aliyunSignName: '',
  aliyunTemplateCode: '',
  aliyunEndpoint: 'dysmsapi.aliyuncs.com',
  aliyunRegionId: 'cn-hangzhou'
})

const testEmailForm = reactive({
  toEmail: '',
  subject: '测试邮件',
  content: ''
})

function goAi(path: string) {
  router.push(path)
}

async function loadMiniapp() {
  try {
    const res: any = await fetchConfigGroup('miniapp')
    const data = res?.data || res
    if (data && typeof data === 'object') {
      const cfg = data.miniapp || data
      Object.assign(miniapp, cfg)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载小程序配置失败')
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
  } catch (e: any) {
    ElMessage.error(e?.message || '加载公众号配置失败')
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
  } catch (e: any) {
    ElMessage.error(e?.message || '加载微信支付配置失败')
  }
}

async function loadEmail() {
  try {
    const data = await fetchEmailConfig()
    if (data && typeof data === 'object') {
      Object.assign(email, data)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载邮件配置失败')
  }
}

async function loadSms() {
  try {
    const res: any = await fetchConfigGroup('sms')
    const data = res?.data || res
    if (data && typeof data === 'object') {
      const cfg = data.sms || data
      Object.assign(sms, {
        provider: 'aliyun',
        aliyunEndpoint: 'dysmsapi.aliyuncs.com',
        aliyunRegionId: 'cn-hangzhou',
        ...cfg
      })
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载短信配置失败')
  }
}

async function loadAmap() {
  try {
    const res: any = await fetchAmapConfig()
    const data = res?.data || res
    if (data && typeof data === 'object') {
      Object.assign(amap, data)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载高德地图配置失败')
  }
}

async function loadFeie() {
  try {
    const data: any = await fetchFeieConfig()
    if (data && typeof data === 'object') Object.assign(feie, data)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载飞鹅云配置失败')
  }
}

async function saveFeie() {
  if (feie.enabled && (!String(feie.user || '').trim() || !String(feie.ukey || '').trim())) {
    ElMessage.warning('开启飞鹅云前请填写 USER 与 UKEY')
    return
  }
  savingFeie.value = true
  try {
    await saveFeieConfig({ ...feie })
    ElMessage.success('飞鹅云配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingFeie.value = false
  }
}

async function loadIpGeo() {
  try {
    const res: any = await fetchConfigGroup('ip_geo')
    const data = res?.data || res
    const config = data?.ip_geo || data
    if (config && typeof config === 'object') Object.assign(ipGeo, config)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载 IP 归属地配置失败')
  }
}

async function saveIpGeo() {
  if (ipGeo.enabled && !String(ipGeo.appCode || '').trim()) {
    ElMessage.warning('开启解析前请填写阿里云市场 AppCode')
    return
  }
  savingIpGeo.value = true
  try {
    await saveConfigGroup('ip_geo', { ip_geo: { ...ipGeo } })
    ElMessage.success('IP 归属地配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingIpGeo.value = false
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

async function saveSms() {
  if (sms.provider === 'aliyun' && (!sms.aliyunSignName || !sms.aliyunTemplateCode)) {
    ElMessage.warning('请填写阿里云短信签名和模板 Code')
    return
  }
  savingSms.value = true
  try {
    await saveConfigGroup('sms', { sms: { ...sms } })
    ElMessage.success('短信配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingSms.value = false
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

onMounted(() => {
  loadMiniapp()
  loadOfficial()
  loadWechatPay()
  loadEmail()
  loadSms()
  loadAmap()
  loadFeie()
  loadIpGeo()
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
.pay-alert {
  margin-bottom: 16px;
}
.wide-field {
  grid-column: 1 / -1;
}
.section-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}
.ai-entry-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border: 1px solid rgba(191, 219, 254, 0.8);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.9));
  padding: 18px;
}
.ai-entry-card b {
  display: block;
  color: #0f172a;
  font-size: 16px;
  margin-bottom: 6px;
}
.ai-entry-card p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.7;
}
.ai-entry-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  white-space: nowrap;
}
.external-links {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(226, 232, 240, 0.6);
}
@media (max-width: 900px) {
  .ai-entry-card {
    align-items: flex-start;
    flex-direction: column;
  }
  .ai-entry-actions {
    justify-content: flex-start;
    white-space: normal;
  }
}
</style>
