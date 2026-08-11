<template>
  <div class="ai-config-page">
    <div class="page-head">
      <div>
        <div class="breadcrumb">AI运营中心 / AI / 机器人配置</div>
        <h1>AI / 机器人配置</h1>
        <p>统一配置模型服务、AI审核、机器人运营能力、风控频率和执行窗口。</p>
      </div>
      <div class="head-actions">
        <el-button :icon="Refresh" @click="loadConfig">刷新</el-button>
        <el-button v-if="hasTestPermission" :icon="CircleCheckFilled" :loading="testing" @click="testConfig">诊断配置</el-button>
        <el-button v-if="hasTestPermission" :icon="MagicStick" :loading="generating" @click="testGenerate">测试生成</el-button>
        <el-button v-if="hasEditPermission" type="primary" :icon="Check" :loading="saving" @click="saveConfig">保存配置</el-button>
      </div>
    </div>

    <el-alert
      v-if="diagnosis.length"
      class="diagnosis-alert"
      type="warning"
      show-icon
      :closable="false"
      title="配置诊断提醒"
      :description="diagnosis.join('；')"
    />

    <div class="config-layout">
      <section class="config-card main-card">
        <div class="card-head">
          <h3>AI / 机器人服务</h3>
          <span>不在前端明文展示已保存密钥，输入新密钥才会替换。</span>
        </div>
        <el-form label-position="top">
          <div class="form-grid">
            <el-form-item label="服务商">
              <el-select v-model="config.provider" style="width: 100%">
                <el-option label="DeepSeek" value="deepseek" />
                <el-option label="OpenAI" value="openai" />
                <el-option label="通义千问" value="qwen" />
                <el-option label="自定义兼容 OpenAI" value="custom" />
              </el-select>
            </el-form-item>
            <el-form-item label="模型名称">
              <el-input v-model="config.model" placeholder="如 deepseek-chat / gpt-4.1-mini" />
            </el-form-item>
            <el-form-item label="API 地址">
              <el-input v-model="config.apiBaseUrl" placeholder="兼容接口地址，可留空使用默认" />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input
                v-model="config.apiKey"
                type="password"
                show-password
                placeholder="留空或保持星号表示不修改已保存密钥"
              />
            </el-form-item>
            <el-form-item label="温度">
              <el-input-number v-model="config.temperature" :min="0" :max="2" :step="0.1" :precision="1" style="width: 100%" />
            </el-form-item>
            <el-form-item label="最大 Token 数">
              <el-input-number v-model="config.maxTokens" :min="100" :max="32000" style="width: 100%" />
            </el-form-item>
          </div>
          <el-form-item label="配置说明">
            <el-input v-model="config.remark" type="textarea" :rows="3" placeholder="记录本次配置变更，例如：启用新区域冷启动，降低评论频率。" />
          </el-form-item>
        </el-form>
      </section>

      <section class="config-card status-card">
        <div class="status-main" :class="{ active: config.enabled }">
          <span>{{ config.enabled ? '已启用' : '未启用' }}</span>
          <strong>AI / 机器人总开关</strong>
          <el-switch v-model="config.enabled" />
        </div>
        <div class="mini-status">
          <div>
            <b>{{ config.provider || '-' }}</b>
            <span>服务商</span>
          </div>
          <div>
            <b>{{ config.model || '-' }}</b>
            <span>模型</span>
          </div>
        </div>
      </section>
    </div>

    <div class="config-grid">
      <section class="config-card">
        <div class="card-head">
          <h3>AI审核与运营能力</h3>
          <span>同时控制帖子/评论 AI 审核，以及机器人账号池可以自动做哪些动作。</span>
        </div>
        <div class="switch-list">
          <div v-for="item in capabilityItems" :key="item.key" class="switch-item">
            <div>
              <b>{{ item.title }}</b>
              <span>{{ item.desc }}</span>
            </div>
            <el-switch v-model="config[item.key]" />
          </div>
        </div>
      </section>

      <section class="config-card">
        <div class="card-head">
          <h3>AI风控频率</h3>
          <span>控制机器人动作、模型调用、成本和单用户调用上限。</span>
        </div>
        <div class="form-grid compact">
          <el-form-item label="每日最大发帖">
            <el-input-number v-model="config.riskControl.maxPostsPerDay" :min="0" :max="500" style="width:100%" />
          </el-form-item>
          <el-form-item label="每日最大评论">
            <el-input-number v-model="config.riskControl.maxCommentsPerDay" :min="0" :max="2000" style="width:100%" />
          </el-form-item>
          <el-form-item label="每日最大点赞">
            <el-input-number v-model="config.riskControl.maxLikesPerDay" :min="0" :max="5000" style="width:100%" />
          </el-form-item>
          <el-form-item label="最小动作间隔（秒）">
            <el-input-number v-model="config.riskControl.minInterval" :min="0" :max="3600" style="width:100%" />
          </el-form-item>
          <el-form-item label="单机器人日任务">
            <el-input-number v-model="config.riskControl.maxTasksPerBotPerDay" :min="1" :max="200" style="width:100%" />
          </el-form-item>
          <el-form-item label="失败暂停分钟">
            <el-input-number v-model="config.riskControl.failurePauseMinutes" :min="0" :max="1440" style="width:100%" />
          </el-form-item>
          <el-form-item label="每日调用上限">
            <el-input-number v-model="config.riskControl.maxDailyCalls" :min="0" :max="100000" style="width:100%" />
          </el-form-item>
          <el-form-item label="每日Token上限">
            <el-input-number v-model="config.riskControl.maxDailyTokens" :min="0" :max="10000000" style="width:100%" />
          </el-form-item>
          <el-form-item label="每日成本上限">
            <el-input-number v-model="config.riskControl.maxDailyCost" :min="0" :max="100000" :precision="2" style="width:100%" />
          </el-form-item>
          <el-form-item label="单用户AI日调用">
            <el-input-number v-model="config.riskControl.maxMiniProgramCallsPerUserDay" :min="0" :max="1000" style="width:100%" />
          </el-form-item>
        </div>
      </section>

      <section class="config-card">
        <div class="card-head">
          <h3>执行窗口</h3>
          <span>控制批次、静默时间和失败重试。</span>
        </div>
        <div class="form-grid compact">
          <el-form-item label="运营模式">
            <el-select v-model="config.operationMode" style="width:100%">
              <el-option label="保守模式" value="conservative" />
              <el-option label="标准模式" value="standard" />
              <el-option label="积极模式" value="aggressive" />
            </el-select>
          </el-form-item>
          <el-form-item label="每批任务数">
            <el-input-number v-model="config.scheduling.batchSize" :min="1" :max="50" style="width:100%" />
          </el-form-item>
          <el-form-item label="提前生成小时">
            <el-input-number v-model="config.scheduling.taskLookaheadHours" :min="1" :max="168" style="width:100%" />
          </el-form-item>
          <el-form-item label="最大重试次数">
            <el-input-number v-model="config.scheduling.maxRetryTimes" :min="0" :max="5" style="width:100%" />
          </el-form-item>
          <el-form-item label="静默开始">
            <el-input v-model="config.quietStart" placeholder="23:00" />
          </el-form-item>
          <el-form-item label="静默结束">
            <el-input v-model="config.quietEnd" placeholder="07:00" />
          </el-form-item>
        </div>
        <div class="switch-list slim">
          <div class="switch-item">
            <div>
              <b>启用静默时间</b>
              <span>夜间不发布、不评论，减少运营痕迹。</span>
            </div>
            <el-switch v-model="config.quietHoursEnabled" />
          </div>
          <div class="switch-item">
            <div>
              <b>失败自动重试</b>
              <span>接口偶发失败后自动重试。</span>
            </div>
            <el-switch v-model="config.scheduling.autoRetryFailed" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Check, CircleCheckFilled, MagicStick, Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('ai:edit'))
const hasTestPermission = ref(auth.permissions.includes('ai:edit'))  // AUD-P1-114: 测试也会消耗额度，需要 ai:edit
const saving = ref(false)
const testing = ref(false)
const generating = ref(false)
const diagnosis = ref<string[]>([])

const defaultConfig = () => ({
  enabled: false,
  provider: 'deepseek',
  apiBaseUrl: '',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 1000,
  operationMode: 'standard',
  postGenerateEnabled: true,
  commentGenerateEnabled: true,
  interactionEnabled: true,
  coldStartEnabled: true,
  reviewBeforePost: true,
  contentSafetyEnabled: true,
  quietHoursEnabled: true,
  quietStart: '23:00',
  quietEnd: '07:00',
  riskControl: {
    maxPostsPerDay: 50,
    maxCommentsPerDay: 200,
    maxLikesPerDay: 500,
    minInterval: 30,
    maxTasksPerBotPerDay: 8,
    failurePauseMinutes: 30,
    maxDailyCalls: 0,
    maxDailyTokens: 0,
    maxDailyCost: 0,
    maxMiniProgramCallsPerUserDay: 20,
  },
  scheduling: {
    batchSize: 5,
    taskLookaheadHours: 24,
    autoRetryFailed: false,
    maxRetryTimes: 1,
  },
  remark: '',
})

const config = reactive<any>(defaultConfig())

const capabilityItems = [
  { key: 'postGenerateEnabled', title: '自动发帖', desc: '按任务队列生成并发布笔记内容' },
  { key: 'commentGenerateEnabled', title: '自动评论', desc: '围绕真实内容生成自然互动评论' },
  { key: 'interactionEnabled', title: '自动互动', desc: '点赞、评论、补热度等低频动作' },
  { key: 'coldStartEnabled', title: '内容冷启动', desc: '新区域缺内容时自动补基础内容' },
  { key: 'reviewBeforePost', title: '发布前审核', desc: 'AI 生成后先进入人工审核队列' },
  { key: 'contentSafetyEnabled', title: '安全过滤', desc: '敏感词、二维码和低质内容过滤' },
]

function assignConfig(payload: any) {
  const merged = {
    ...defaultConfig(),
    ...(payload || {}),
    riskControl: { ...defaultConfig().riskControl, ...((payload || {}).riskControl || {}) },
    scheduling: { ...defaultConfig().scheduling, ...((payload || {}).scheduling || {}) },
  }
  Object.assign(config, merged)
}

const loadConfig = async () => {
  try {
    const res: any = await request.get('/admin/ai/config')
    assignConfig(res?.data || res)
  } catch (error: any) {
    ElMessage.error(error?.message || '加载AI配置失败')
  }
}

const saveConfig = async () => {
  saving.value = true
  try {
    await request.put('/admin/ai/config', JSON.parse(JSON.stringify(config)))
    ElMessage.success('AI配置已保存')
    await loadConfig()
  } catch (error: any) {
    ElMessage.error(error?.message || '保存AI配置失败')
  } finally {
    saving.value = false
  }
}

const testConfig = async () => {
  testing.value = true
  try {
    const res: any = await request.post('/admin/ai/config/test')
    const payload = res?.data || res
    diagnosis.value = payload?.missing || []
    if (payload?.ok) {
      ElMessage.success('配置诊断通过')
    } else {
      ElMessage.warning('配置仍有缺项，请按提示处理')
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '配置诊断失败')
  } finally {
    testing.value = false
  }
}

const testGenerate = async () => {
  generating.value = true
  try {
    const res: any = await request.post('/admin/ai/config/test-generate')
    const payload = res?.data || res
    const sample = payload?.sample || '模型已返回内容，但没有可展示文本。'
    await ElMessageBox.alert(sample, 'AI 生成测试结果', {
      confirmButtonText: '知道了',
      customClass: 'ai-generate-result',
    })
  } catch (error: any) {
    ElMessage.error(error?.message || 'AI生成测试失败')
  } finally {
    generating.value = false
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.ai-config-page {
  padding: 28px;
  color: var(--mx-text);
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.breadcrumb {
  color: var(--mx-muted);
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 8px;
}

.page-head h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.15;
}

.page-head p {
  margin: 10px 0 0;
  color: var(--mx-sub);
  font-size: 15px;
  font-weight: 700;
}

.head-actions {
  display: flex;
  gap: 10px;
  white-space: nowrap;
}

.diagnosis-alert {
  margin-bottom: 16px;
}

.config-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
  margin-bottom: 18px;
}

.config-grid {
  display: grid;
  grid-template-columns: minmax(300px, .9fr) repeat(2, minmax(380px, 1fr));
  gap: 18px;
}

.config-card {
  border: 1px solid var(--mx-border-strong);
  border-radius: 14px;
  background: var(--mx-card);
  box-shadow: var(--mx-shadow);
  backdrop-filter: blur(14px);
  padding: 20px;
}

.card-head {
  margin-bottom: 18px;
}

.card-head h3 {
  margin: 0 0 6px;
  font-size: 18px;
}

.card-head span,
.switch-item span,
.mini-status span {
  color: var(--mx-sub);
  font-size: 13px;
  font-weight: 700;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}

.form-grid.compact {
  grid-template-columns: 1fr;
  gap: 14px;
}

:deep(.form-grid.compact .el-form-item) {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) 188px;
  align-items: center;
  gap: 12px;
  margin-bottom: 0;
}

:deep(.form-grid.compact .el-form-item__label) {
  min-width: 0;
  margin: 0;
  padding: 0;
  color: var(--mx-text);
  font-size: 14px;
  font-weight: 900;
  line-height: 1.25;
  white-space: normal;
}

:deep(.form-grid.compact .el-input-number),
:deep(.form-grid.compact .el-select),
:deep(.form-grid.compact .el-input) {
  width: 188px !important;
}

:deep(.form-grid.compact .el-input-number .el-input__inner) {
  min-width: 72px;
  text-align: center;
}

.status-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.status-main {
  display: flex;
  min-height: 170px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  border-radius: 14px;
  padding: 18px;
  color: var(--mx-card);
  background: var(--el-color-info);
}

.status-main.active {
  background: var(--el-color-primary);
}

.status-main span {
  font-size: 13px;
  font-weight: 900;
  opacity: .9;
}

.status-main strong {
  font-size: 24px;
}

.mini-status {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.mini-status div {
  min-width: 0;
  border-radius: 14px;
  background: var(--mx-soft);
  padding: 12px;
}

.mini-status b {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.switch-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.switch-list.slim {
  margin-top: 12px;
}

.switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  background: var(--mx-soft);
  padding: 14px;
}

.switch-item div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.switch-item b {
  font-size: 14px;
}

@media (max-width: 1280px) {
  .config-layout,
  .config-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .ai-config-page { padding: 18px; }
  .page-head { flex-direction: column; }
  .head-actions { flex-wrap: wrap; }
  .form-grid,
  .form-grid.compact { grid-template-columns: 1fr; }
  :deep(.form-grid.compact .el-form-item) {
    display: block;
  }
  :deep(.form-grid.compact .el-form-item__label) {
    margin-bottom: 8px;
  }
  :deep(.form-grid.compact .el-input-number),
  :deep(.form-grid.compact .el-select),
  :deep(.form-grid.compact .el-input) {
    width: 100% !important;
  }
}
</style>
