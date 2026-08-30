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
        <span>首次安装 · v1.0.0</span>
        <strong>把新服务器部署变成填表</strong>
        <p>先让后端进入安装模式，只填写数据库、Redis、管理员和后台域名。小程序、对象存储、支付登录后台后继续补齐。</p>
      </div>
      <div class="hero-checklist">
        <div>Node / PM2</div>
        <div>MySQL / Redis</div>
        <div>Nginx / API 代理</div>
        <div>管理员与域名</div>
      </div>
    </section>

    <section class="setup-panel">
      <div class="panel-card">
        <div class="panel-head">
          <div>
            <span>Setup Wizard</span>
            <h2>首次安装向导</h2>
            <p v-if="status.initialized">系统已经初始化。请返回登录页继续使用后台。</p>
            <p v-else>按表单填写数据库、Redis、管理员和后台域名。小程序、对象存储、支付登录后台后继续补齐。</p>
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
            <el-step title="配置" description="填写基础信息" />
            <el-step title="检查" description="服务器与数据库" />
            <el-step title="完成" description="写入配置并初始化" />
          </el-steps>

          <el-form label-position="top" class="setup-form">
            <section class="form-section">
              <div class="section-title">
                <b>安装说明</b>
                <span>{{ status.setupTokenRequired ? '当前服务器已配置安装口令，请填写 .env 里的 SETUP_TOKEN。' : '首次运行包已进入安装模式，不需要客户寻找额外口令。' }}</span>
              </div>
              <el-alert
                type="info"
                :closable="false"
                show-icon
                title="先完成基础安装"
                description="数据库、Redis 和管理员创建成功后，系统会自动写入已安装状态。后续微信小程序、对象存储、支付等业务配置在后台继续补齐。"
              />
              <el-form-item v-if="status.setupTokenRequired" label="安装口令">
                <el-input
                  v-model="setupToken"
                  type="password"
                  show-password
                  autocomplete="one-time-code"
                  placeholder="复制客户服务器 .env 里的 SETUP_TOKEN"
                />
              </el-form-item>
              <div class="section-actions">
                <el-button :loading="loadingStatus" @click="loadStatus">刷新状态</el-button>
                <el-button type="primary" :loading="checking" @click="runCheck">检查服务器环境</el-button>
              </div>
            </section>

            <section v-if="checkResult" class="form-section">
              <div class="section-title">
                <b>环境检查</b>
                <span>红色项会阻止安装，黄色项可以先跳过，登录后台后继续补齐。</span>
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
                <el-form-item label="超级管理员密码" :error="adminPasswordError">
                  <el-input
                    v-model="form.adminPassword"
                    type="password"
                    show-password
                    autocomplete="new-password"
                    placeholder="至少 12 位，包含字母、数字和符号"
                  />
                </el-form-item>
              </div>
            </section>

            <section class="form-section">
              <div class="section-title">
                <b>数据库与 Redis</b>
                <span>默认推荐宝塔 MySQL；如已有 PostgreSQL，也可以切换后再试连。</span>
              </div>
              <div class="form-grid three">
                <el-form-item label="数据库类型">
                  <el-radio-group v-model="database.provider">
                    <el-radio-button label="mysql">MySQL</el-radio-button>
                    <el-radio-button label="postgresql">PostgreSQL</el-radio-button>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="数据库地址">
                  <el-input v-model="database.host" placeholder="127.0.0.1" />
                </el-form-item>
                <el-form-item label="数据库端口">
                  <el-input-number v-model="database.port" :min="1" :max="65535" controls-position="right" />
                </el-form-item>
                <el-form-item label="数据库名">
                  <el-input v-model="database.name" placeholder="lingmeng" />
                </el-form-item>
                <el-form-item label="数据库账号">
                  <el-input v-model="database.user" placeholder="lingmeng" />
                </el-form-item>
                <el-form-item label="数据库密码">
                  <el-input v-model="database.password" type="password" show-password :placeholder="database.provider === 'mysql' ? 'MySQL 密码' : 'PostgreSQL 密码'" />
                </el-form-item>
                <el-form-item v-if="database.provider === 'postgresql'" label="Schema">
                  <el-input v-model="database.schema" placeholder="public" />
                </el-form-item>
              </div>
              <div class="database-preview">
                <span>DATABASE_URL</span>
                <code>{{ maskedDatabaseUrl || '请先填写数据库账号、密码和库名' }}</code>
              </div>
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
                <b>后台访问域名</b>
                <span>系统已自动识别当前后台域名；如域名不对，改成客户真实访问后台的 https 地址。</span>
              </div>
              <div class="form-grid">
                <el-form-item label="后台访问域名">
                  <el-input v-model="form.corsOrigin" placeholder="https://admin.example.com" />
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
                <p>向导已自动尝试迁移，但数据库权限或连接仍有问题。修好后可重试；必要时再手动执行下面命令。</p>
                <code>cd /www/wwwroot/lingmeng/backend && npm run db:migrate:deploy && npm run db:generate && pm2 restart lingmeng-worker lingmeng-realtime lingmeng-backend --update-env</code>
              </div>
              <div v-else-if="initResult.success" class="command-box">
                <p v-if="initResult.autoRestart">初始化成功，API、Worker、Realtime 正在自动重载配置。稍等片刻后会返回登录页。</p>
                <p v-else>初始化成功，系统已自动写入已安装状态。请手动重启 API、Worker、Realtime 后登录后台，继续补齐小程序、对象存储、支付等业务配置。</p>
              </div>
              <div v-else class="command-box">
                <p>初始化没有完成，请按下面顺序排查后再点“执行初始化”。</p>
                <code>cd /www/wwwroot/lingmeng && pm2 logs lingmeng-backend --lines 80 --nostream</code>
                <p v-for="(step, index) in initResult.nextSteps || []" :key="index">{{ index + 1 }}. {{ step }}</p>
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
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
const MIN_ADMIN_PASSWORD_LENGTH = 12

const form = reactive<SetupInitPayload>({
  siteName: '校园本地生活',
  adminUsername: 'admin',
  adminPassword: '',
  databaseProvider: 'mysql',
  redisHost: '127.0.0.1',
  redisPort: 6379,
  corsOrigin: window.location.origin,
  wxMiniAppid: '',
  wxMiniSecret: ''
})

const database = reactive({
  provider: 'mysql',
  host: '127.0.0.1',
  port: 3306,
  name: 'lingmeng',
  user: 'lingmeng',
  password: '',
  schema: 'public'
})

function encodeDatabasePart(value: string) {
  return encodeURIComponent(value.trim())
}

const databaseUrl = computed(() => {
  const host = database.host.trim()
  const name = database.name.trim()
  const user = database.user.trim()
  const password = database.password
  const schema = database.schema.trim() || 'public'
  if (!host || !name || !user || !password) return ''
  if (database.provider === 'mysql') {
    return `mysql://${encodeDatabasePart(user)}:${encodeDatabasePart(password)}@${host}:${database.port}/${encodeDatabasePart(name)}`
  }
  return `postgresql://${encodeDatabasePart(user)}:${encodeDatabasePart(password)}@${host}:${database.port}/${encodeDatabasePart(name)}?schema=${encodeDatabasePart(schema)}`
})

const maskedDatabaseUrl = computed(() => {
  if (!databaseUrl.value) return ''
  const encodedPassword = encodeDatabasePart(database.password)
  return databaseUrl.value.replace(`:${encodedPassword}@`, ':******@')
})

const activeStep = computed(() => {
  if (initResult.value?.success) return 3
  if (checkResult.value) return 2
  return 1
})

const adminPasswordError = computed(() => getAdminPasswordError(form.adminPassword))

function getAdminPasswordError(password: string) {
  if (!password) return ''
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) return `密码长度至少 ${MIN_ADMIN_PASSWORD_LENGTH} 位`
  let classes = 0
  if (/[a-z]/.test(password)) classes += 1
  if (/[A-Z]/.test(password)) classes += 1
  if (/\d/.test(password)) classes += 1
  if (/[^a-zA-Z\d]/.test(password)) classes += 1
  if (classes < 3) return '密码需要至少包含字母、数字、符号中的 3 类'
  return ''
}

function formatApiError(error: any, fallback: string) {
  const message = error?.response?.data?.message || error?.response?.data?.error || error?.message
  if (Array.isArray(message)) return message.join('；')
  if (typeof message === 'string' && message.trim()) return message
  return fallback
}

async function loadStatus() {
  loadingStatus.value = true
  try {
    const data = await getSetupStatus()
    status.initialized = data.initialized
    status.setupTokenRequired = Boolean(data.setupTokenRequired)
    status.setupWizardMode = Boolean(data.setupWizardMode)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '读取安装状态失败，请确认后端已启动')
  } finally {
    loadingStatus.value = false
  }
}

async function runCheck() {
  if (status.setupTokenRequired && !setupToken.value.trim()) {
    ElMessage.warning('请先填写 .env 里的 SETUP_TOKEN')
    return
  }
  syncDatabaseUrl()
  checking.value = true
  try {
    checkResult.value = await checkSetupEnvironment(setupToken.value, normalizePayload(form))
    const type = checkResult.value.overall === 'failed' ? 'error' : checkResult.value.overall === 'warning' ? 'warning' : 'success'
    ElMessage[type](type === 'success' ? '环境检查通过' : '环境检查完成，请处理提示项')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '环境检查失败')
  } finally {
    checking.value = false
  }
}

async function submitInit() {
  if (status.setupTokenRequired && !setupToken.value.trim()) {
    ElMessage.warning('请先填写 .env 里的 SETUP_TOKEN')
    return
  }
  if (!form.adminUsername || !form.adminPassword) {
    ElMessage.warning('请填写超级管理员账号和密码')
    return
  }
  const passwordError = getAdminPasswordError(form.adminPassword)
  if (passwordError) {
    ElMessage.warning(passwordError)
    return
  }
  syncDatabaseUrl()
  if (!form.databaseUrl) {
    ElMessage.warning('请填写数据库账号、密码和库名')
    return
  }
  if (!form.corsOrigin || form.corsOrigin === 'true' || form.corsOrigin === '*') {
    ElMessage.warning('请填写当前后台域名，例如 https://admin.example.com')
    return
  }
  submitting.value = true
  initResult.value = null
  try {
    initResult.value = await initSetup(normalizePayload(form), setupToken.value)
    if (initResult.value?.success) {
      status.initialized = true
      if (initResult.value?.autoRestart) {
        ElMessage.success('初始化完成，服务正在自动重启')
        window.setTimeout(() => {
          goLogin()
        }, 4200)
      } else {
        ElMessage.success('初始化完成，请手动重启后端后登录')
      }
    } else if (initResult.value?.requiresMigration) {
      ElMessage.warning('自动迁移未完成，请检查数据库权限后重试')
    } else {
      ElMessage.warning(initResult.value?.message || '初始化未完成')
    }
  } catch (error: any) {
    const message = formatApiError(error, '初始化失败')
    initResult.value = {
      success: false,
      message,
      nextSteps: [
        '确认 MySQL/Redis 服务已启动，数据库名、账号、密码和端口填写正确',
        '确认数据库账号拥有建表权限；MySQL 客户推荐使用宝塔创建的同名数据库和用户',
        '查看 PM2 日志里的第一条红色错误，按提示修正后重试',
        '如果刚才已经写入 .env，保存后执行 bash restart.sh 再打开 /setup'
      ]
    }
    ElMessage.error(message)
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

function syncDatabaseUrl() {
  form.databaseProvider = database.provider
  form.databaseUrl = databaseUrl.value
}

watch(
  () => database.provider,
  (provider) => {
    form.databaseProvider = provider
    if (provider === 'mysql' && database.port === 5432) {
      database.port = 3306
    }
    if (provider === 'postgresql' && database.port === 3306) {
      database.port = 5432
    }
  }
)

function goLogin() {
  router.push('/login')
}

onMounted(() => {
  loadStatus()
  if (!form.corsOrigin) {
    form.corsOrigin = window.location.origin
  }
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
  border-radius: 14px;
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
  border-radius: 14px;
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
  border-radius: 14px;
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

.database-preview {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  margin: 2px 0 16px;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
}

.database-preview span {
  color: #475569;
  font-size: 12px;
  font-weight: 900;
}

.database-preview code {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.55;
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
  border-radius: 10px;
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
