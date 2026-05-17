<template>
  <main class="setup-page">
    <section class="setup-hero">
      <div class="hero-brand">
        <div class="brand-mark">校</div>
        <div>
          <h1>校园本地生活</h1>
          <p>Lingmeng Deploy Wizard</p>
        </div>
      </div>
      <div class="hero-copy">
        <span>首次安装 · v1.0.1</span>
        <strong>把宝塔服务器第一次部署走稳</strong>
        <p>按步骤完成环境检查、数据库连接、超级管理员创建和基础配置写入。初始化完成后请关闭安装模式。</p>
      </div>
      <div class="hero-checklist">
        <div>后端 3000 端口</div>
        <div>MySQL / Redis</div>
        <div>管理员账号</div>
        <div>小程序 AppID</div>
      </div>
    </section>

    <section class="setup-panel">
      <div class="panel-card">
        <div class="panel-head">
          <div>
            <span>Setup Wizard</span>
            <h2>首次安装向导</h2>
            <p v-if="status.initialized">系统已经初始化。请返回登录页继续使用后台。</p>
            <p v-else>请先在后端 `.env` 设置 `SETUP_WIZARD=true` 和 `SETUP_TOKEN`，再填写下面配置。</p>
          </div>
          <el-tag :type="status.initialized ? 'success' : 'warning'" size="large">
            {{ status.initialized ? '已初始化' : '待初始化' }}
          </el-tag>
        </div>

        <el-alert
          v-if="status.initialized"
          type="success"
          :closable="false"
          show-icon
          title="系统已安装完成"
          description="如果你只是更新版本，不需要重新初始化。请直接回到登录页。"
        />

        <template v-else>
          <el-steps :active="activeStep" finish-status="success" align-center class="setup-steps">
            <el-step title="口令" description="填写 SETUP_TOKEN" />
            <el-step title="配置" description="写入 .env" />
            <el-step title="完成" description="迁移与登录" />
          </el-steps>

          <el-form label-position="top" class="setup-form">
            <section class="form-section">
              <div class="section-title">
                <b>安装口令</b>
                <span>来自后端 `.env` 的 SETUP_TOKEN，不是后台登录密码。</span>
              </div>
              <el-input v-model="setupToken" type="password" show-password size="large" placeholder="请输入 SETUP_TOKEN" />
              <div class="section-actions">
                <el-button :loading="loadingStatus" @click="loadStatus">刷新状态</el-button>
                <el-button type="primary" :loading="checking" @click="runCheck">检查服务器环境</el-button>
              </div>
            </section>

            <section v-if="checkResult" class="form-section">
              <div class="section-title">
                <b>环境检查</b>
                <span>红色项必须处理，黄色项建议上线前处理。</span>
              </div>
              <div class="check-grid">
                <article v-for="item in checkResult.checks" :key="item.name" :class="['check-card', item.status]">
                  <strong>{{ item.name }}</strong>
                  <p>{{ item.message }}</p>
                </article>
              </div>
            </section>

            <section class="form-section">
              <div class="section-title">
                <b>平台与管理员</b>
                <span>超级管理员密码至少 12 位，建议包含大小写字母、数字和符号。</span>
              </div>
              <div class="form-grid">
                <el-form-item label="平台名称">
                  <el-input v-model="form.siteName" placeholder="校园本地生活" />
                </el-form-item>
                <el-form-item label="平台 Logo URL（可选）">
                  <el-input v-model="form.siteLogo" placeholder="https://cdn.example.com/logo.png" />
                </el-form-item>
                <el-form-item label="超级管理员账号">
                  <el-input v-model="form.adminUsername" placeholder="admin" />
                </el-form-item>
                <el-form-item label="超级管理员手机号（可选）">
                  <el-input v-model="form.adminPhone" placeholder="用于找回或备注" />
                </el-form-item>
                <el-form-item label="超级管理员密码">
                  <el-input v-model="form.adminPassword" type="password" show-password placeholder="至少 12 位强密码" />
                </el-form-item>
                <el-form-item label="JWT 密钥">
                  <div class="input-action">
                    <el-input v-model="form.jwtSecret" type="password" show-password placeholder="建议自动生成" />
                    <el-button @click="generateJwt">生成</el-button>
                  </div>
                </el-form-item>
              </div>
            </section>

            <section class="form-section">
              <div class="section-title">
                <b>数据库与 Redis</b>
                <span>宝塔里创建 MySQL 数据库后，把库名、账号、密码填到 DATABASE_URL。</span>
              </div>
              <el-form-item label="DATABASE_URL">
                <el-input
                  v-model="form.databaseUrl"
                  placeholder="mysql://数据库账号:数据库密码@127.0.0.1:3306/数据库名"
                />
              </el-form-item>
              <div class="form-grid three">
                <el-form-item label="Redis Host">
                  <el-input v-model="form.redisHost" placeholder="127.0.0.1" />
                </el-form-item>
                <el-form-item label="Redis Port">
                  <el-input-number v-model="form.redisPort" :min="1" :max="65535" controls-position="right" />
                </el-form-item>
                <el-form-item label="Redis Password（可空）">
                  <el-input v-model="form.redisPassword" type="password" show-password placeholder="没有密码就留空" />
                </el-form-item>
              </div>
            </section>

            <section class="form-section">
              <div class="section-title">
                <b>小程序与跨域</b>
                <span>微信小程序 AppID/Secret 是必填；CORS 建议填后台域名和 API 域名。</span>
              </div>
              <div class="form-grid">
                <el-form-item label="微信小程序 AppID">
                  <el-input v-model="form.wxMiniAppid" placeholder="wx..." />
                </el-form-item>
                <el-form-item label="微信小程序 AppSecret">
                  <el-input v-model="form.wxMiniSecret" type="password" show-password placeholder="小程序密钥" />
                </el-form-item>
                <el-form-item label="CORS_ORIGIN">
                  <el-input v-model="form.corsOrigin" placeholder="https://admin.example.com,https://api.example.com" />
                </el-form-item>
              </div>
            </section>

            <section class="form-section">
              <div class="section-title">
                <b>对象存储 COS（可稍后配置）</b>
                <span>没有开通腾讯云 COS 时可以先留空，后续在系统配置里补。</span>
              </div>
              <div class="form-grid">
                <el-form-item label="SecretId">
                  <el-input v-model="form.cosSecretId" type="password" show-password />
                </el-form-item>
                <el-form-item label="SecretKey">
                  <el-input v-model="form.cosSecretKey" type="password" show-password />
                </el-form-item>
                <el-form-item label="存储桶名称 Bucket">
                  <el-input v-model="form.cosBucket" placeholder="nianbai-1340278115" />
                </el-form-item>
                <el-form-item label="所属地域 Region">
                  <el-select v-model="form.cosRegion" filterable clearable placeholder="请选择或输入 ap-chongqing">
                    <el-option v-for="region in cosRegions" :key="region.value" :label="region.label" :value="region.value" />
                  </el-select>
                </el-form-item>
                <el-form-item label="CDN / COS 访问域名">
                  <el-input v-model="form.cosDomain" placeholder="https://bucket.cos.ap-chongqing.myqcloud.com" />
                </el-form-item>
              </div>
            </section>

            <section class="form-section">
              <div class="section-title">
                <b>微信支付（可稍后配置）</b>
                <span>未开通支付时先留空；涉及下单支付、退款、提现时再补齐。</span>
              </div>
              <div class="form-grid">
                <el-form-item label="商户号 MCHID">
                  <el-input v-model="form.wxPayMchid" />
                </el-form-item>
                <el-form-item label="APIv3 密钥">
                  <el-input v-model="form.wxPayApiv3Key" type="password" show-password />
                </el-form-item>
                <el-form-item label="证书序列号">
                  <el-input v-model="form.wxPayCertSerialNo" />
                </el-form-item>
                <el-form-item label="商户私钥路径">
                  <el-input v-model="form.wxPayPrivateKeyPath" placeholder="/www/wwwroot/lingmeng/certs/apiclient_key.pem" />
                </el-form-item>
                <el-form-item label="平台证书路径">
                  <el-input v-model="form.wxPayPlatformCertPath" placeholder="/www/wwwroot/lingmeng/certs/platform.pem" />
                </el-form-item>
                <el-form-item label="支付回调地址">
                  <el-input v-model="form.wxPayNotifyUrl" placeholder="https://api.example.com/wxpay/notify" />
                </el-form-item>
                <el-form-item label="退款回调地址">
                  <el-input v-model="form.wxPayRefundNotifyUrl" placeholder="https://api.example.com/wxpay/refund-notify" />
                </el-form-item>
              </div>
            </section>
          </el-form>

          <el-alert
            v-if="initResult"
            class="result-alert"
            :type="initResult.success ? 'success' : initResult.requiresMigration ? 'warning' : 'error'"
            :closable="false"
            show-icon
          >
            <template #title>{{ initResult.message || (initResult.success ? '初始化完成' : '初始化未完成') }}</template>
            <template #default>
              <div v-if="initResult.requiresMigration" class="command-box">
                <p>请在宝塔终端执行下面命令，然后重启后端，再回到本页点击“执行初始化”。</p>
                <code>cd /www/wwwroot/lingmeng/backend && npm run db:migrate:deploy && npm run db:generate && pm2 restart lingmeng-backend</code>
              </div>
              <div v-else-if="initResult.success" class="command-box">
                <p>初始化成功。上线前请把后端 `.env` 的 `SETUP_WIZARD=true` 改为 `SETUP_WIZARD=false`，并重启后端。</p>
              </div>
            </template>
          </el-alert>

          <div class="setup-footer">
            <el-button @click="goLogin">返回登录</el-button>
            <el-button type="primary" size="large" :loading="submitting" @click="submitInit">执行初始化</el-button>
          </div>
        </template>

        <div v-if="status.initialized" class="setup-footer">
          <el-button type="primary" size="large" @click="goLogin">去登录后台</el-button>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  checkSetupEnvironment,
  getSetupStatus,
  initSetup,
  type SetupCheckResult,
  type SetupInitPayload,
  type SetupStatus
} from '@/api/setup'

const router = useRouter()
const setupToken = ref('')
const loadingStatus = ref(false)
const checking = ref(false)
const submitting = ref(false)
const status = reactive<SetupStatus>({ initialized: false })
const checkResult = ref<SetupCheckResult | null>(null)
const initResult = ref<any>(null)

const form = reactive<SetupInitPayload>({
  siteName: '校园本地生活',
  adminUsername: 'admin',
  adminPassword: '',
  redisHost: '127.0.0.1',
  redisPort: 6379,
  corsOrigin: '',
  wxMiniAppid: '',
  wxMiniSecret: '',
  jwtSecret: ''
})

const cosRegions = [
  { label: '北京 ap-beijing', value: 'ap-beijing' },
  { label: '上海 ap-shanghai', value: 'ap-shanghai' },
  { label: '广州 ap-guangzhou', value: 'ap-guangzhou' },
  { label: '成都 ap-chengdu', value: 'ap-chengdu' },
  { label: '重庆 ap-chongqing', value: 'ap-chongqing' },
  { label: '南京 ap-nanjing', value: 'ap-nanjing' },
  { label: '中国香港 ap-hongkong', value: 'ap-hongkong' }
]

const activeStep = computed(() => {
  if (initResult.value?.success) return 3
  if (checkResult.value) return 2
  return setupToken.value ? 1 : 0
})

async function loadStatus() {
  loadingStatus.value = true
  try {
    const data = await getSetupStatus()
    status.initialized = data.initialized
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '读取安装状态失败，请确认后端已启动')
  } finally {
    loadingStatus.value = false
  }
}

async function runCheck() {
  if (!setupToken.value) {
    ElMessage.warning('请先填写 SETUP_TOKEN')
    return
  }
  checking.value = true
  try {
    checkResult.value = await checkSetupEnvironment(setupToken.value)
    const type = checkResult.value.overall === 'failed' ? 'error' : checkResult.value.overall === 'warning' ? 'warning' : 'success'
    ElMessage[type](type === 'success' ? '环境检查通过' : '环境检查完成，请处理提示项')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '环境检查失败')
  } finally {
    checking.value = false
  }
}

async function submitInit() {
  if (!setupToken.value) {
    ElMessage.warning('请先填写 SETUP_TOKEN')
    return
  }
  if (!form.adminUsername || !form.adminPassword) {
    ElMessage.warning('请填写超级管理员账号和密码')
    return
  }
  submitting.value = true
  initResult.value = null
  try {
    initResult.value = await initSetup(normalizePayload(form), setupToken.value)
    if (initResult.value?.success) {
      status.initialized = true
      ElMessage.success('初始化完成')
    } else if (initResult.value?.requiresMigration) {
      ElMessage.warning('需要先执行数据库迁移')
    } else {
      ElMessage.warning(initResult.value?.message || '初始化未完成')
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '初始化失败')
  } finally {
    submitting.value = false
  }
}

function normalizePayload(payload: SetupInitPayload) {
  const next: Record<string, unknown> = {}
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (typeof value === 'string' && value.trim() === '') return
    next[key] = typeof value === 'string' ? value.trim() : value
  })
  return next as unknown as SetupInitPayload
}

function generateJwt() {
  const bytes = new Uint8Array(48)
  window.crypto.getRandomValues(bytes)
  form.jwtSecret = Array.from(bytes, (item) => item.toString(16).padStart(2, '0')).join('')
}

function goLogin() {
  router.push('/login')
}

onMounted(() => {
  loadStatus()
  generateJwt()
})
</script>

<style scoped>
.setup-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(360px, .86fr) minmax(620px, 1.14fr);
  background:
    radial-gradient(circle at 18% 16%, rgba(37, 99, 235, .13), transparent 30%),
    radial-gradient(circle at 82% 14%, rgba(14, 165, 233, .12), transparent 26%),
    #f5f8fc;
  color: #101827;
}

.setup-hero {
  min-height: 100vh;
  padding: 48px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 1px solid #dbe5f1;
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 950;
  font-size: 24px;
  background: linear-gradient(135deg, #2563eb, #08a7e8);
}

.hero-brand h1,
.hero-copy strong,
.panel-head h2 {
  margin: 0;
  letter-spacing: 0;
}

.hero-brand h1 {
  font-size: 24px;
  line-height: 1.15;
}

.hero-brand p,
.hero-copy p,
.panel-head p,
.section-title span {
  color: #64748b;
  line-height: 1.7;
  font-weight: 650;
}

.hero-brand p {
  margin: 5px 0 0;
  font-size: 13px;
}

.hero-copy span {
  display: inline-flex;
  padding: 7px 12px;
  margin-bottom: 18px;
  border-radius: 999px;
  background: #fff;
  color: #2563eb;
  border: 1px solid #dbe5f1;
  font-size: 13px;
  font-weight: 850;
}

.hero-copy strong {
  display: block;
  max-width: 680px;
  font-size: 48px;
  line-height: 1.1;
  font-weight: 950;
}

.hero-copy p {
  margin: 18px 0 0;
  max-width: 620px;
  font-size: 15px;
}

.hero-checklist {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.hero-checklist div,
.panel-card,
.form-section,
.check-card {
  border: 1px solid #dbe5f1;
  background: rgba(255, 255, 255, .88);
  box-shadow: 0 16px 42px rgba(15, 23, 42, .055);
}

.hero-checklist div {
  padding: 16px;
  border-radius: 16px;
  font-weight: 850;
}

.setup-panel {
  min-height: 100vh;
  padding: 42px;
  overflow: auto;
}

.panel-card {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px;
  border-radius: 24px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 22px;
}

.panel-head span {
  color: #2563eb;
  font-weight: 900;
}

.panel-head h2 {
  margin-top: 7px;
  font-size: 30px;
  line-height: 1.15;
}

.panel-head p {
  margin: 8px 0 0;
}

.setup-steps {
  margin: 24px 0;
}

.setup-form {
  display: grid;
  gap: 16px;
}

.form-section {
  padding: 20px;
  border-radius: 18px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}

.section-title b {
  font-size: 17px;
}

.section-title span {
  font-size: 13px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}

.form-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.input-action {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}

.section-actions,
.setup-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.check-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.check-card {
  padding: 14px;
  border-radius: 14px;
}

.check-card strong {
  display: block;
  color: #172033;
}

.check-card p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
}

.check-card.passed {
  border-color: #bbf7d0;
}

.check-card.warning {
  border-color: #fde68a;
}

.check-card.failed {
  border-color: #fecaca;
}

.result-alert {
  margin-top: 18px;
}

.command-box {
  margin-top: 10px;
}

.command-box p {
  margin: 0 0 8px;
}

.command-box code {
  display: block;
  padding: 12px;
  border-radius: 12px;
  white-space: normal;
  word-break: break-all;
  color: #e2e8f0;
  background: #111827;
}

@media (max-width: 1180px) {
  .setup-page {
    grid-template-columns: 1fr;
  }

  .setup-hero {
    display: none;
  }
}

@media (max-width: 760px) {
  .setup-panel {
    padding: 18px;
  }

  .panel-card {
    padding: 18px;
  }

  .panel-head,
  .section-title {
    display: block;
  }

  .form-grid,
  .form-grid.three,
  .check-grid {
    grid-template-columns: 1fr;
  }
}
</style>
