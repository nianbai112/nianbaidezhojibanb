<template>
  <div class="page-container">
    <PageHeader title="微信通知中心" desc="统一配置服务号模板消息与跑腿小程序订阅消息" />

    <!-- 接入状态横幅 -->
    <el-alert
      v-if="!configured"
      title="服务号尚未完成接入配置，消息无法发送。请先完成下方「接入向导」步骤。"
      type="warning"
      show-icon
      :closable="false"
      class="setup-banner"
    />

    <el-tabs v-model="activeTab" type="border-card" class="notify-tabs">

      <!-- ===== TAB 1：接入向导 ===== -->
      <el-tab-pane label="接入向导" name="setup">
        <div class="guide-wrap">
          <div class="guide-intro">
            <p>完成以下 5 步配置，即可向已关注服务号的用户推送消息。每一步右侧都有跳转链接，点击可直接打开对应的微信后台页面。</p>
          </div>

          <el-steps direction="vertical" :active="setupStep" class="setup-steps">

            <!-- Step 1 -->
            <el-step title="开通微信服务号">
              <template #description>
                <div class="step-body">
                  <p>服务号每月可向关注用户群发 4 条消息，并支持模板消息推送。个人主体无法申请，需以企业、学校或社会组织名义注册。</p>
                  <ul>
                    <li>前往 <strong>微信公众平台</strong>（mp.weixin.qq.com）注册服务号</li>
                    <li>完成微信认证（企业认证约需 300 元/年）</li>
                    <li>完成认证后，在公众平台确认模板消息权限和匹配的服务类目</li>
                  </ul>
                  <el-button size="small" @click="openUrl('https://mp.weixin.qq.com')">打开微信公众平台 →</el-button>
                </div>
              </template>
            </el-step>

            <!-- Step 2 -->
            <el-step title="绑定用户身份（专属二维码 / UnionID）">
              <template #description>
                <div class="step-body">
                  <p>系统支持登录用户的专属二维码绑定服务号身份。需要自动关联时，还可把小程序与服务号绑定到同一个微信开放平台账号，通过 UnionID 关联。</p>
                  <ul>
                    <li>前往 <strong>微信开放平台</strong>（open.weixin.qq.com）登录或注册</li>
                    <li>进入「管理中心」→「公众账号」，点击「绑定公众账号」</li>
                    <li>把本产品的小程序绑定到同一个开放平台账号；小程序和服务号各有自己的 AppID</li>
                    <li>使用 UnionID 自动关联前，应确认两端能够获取 UnionID；专属二维码绑定不依赖此条件</li>
                  </ul>
                  <el-button size="small" @click="openUrl('https://open.weixin.qq.com')">打开微信开放平台 →</el-button>
                </div>
              </template>
            </el-step>

            <!-- Step 3 -->
            <el-step title="配置消息与事件接收服务器">
              <template #description>
                <div class="step-body">
                  <p>配置后，微信会将用户关注/取关事件推送到你的后端，系统才能自动完成用户绑定。</p>
                  <ul>
                    <li>在公众平台进入「设置与开发」→「基本配置」</li>
                    <li>填写服务器地址（URL）：</li>
                  </ul>
                  <el-input
                    :value="serverCallbackUrl"
                    readonly
                    class="copy-input"
                    @click="copyText(serverCallbackUrl)"
                  >
                    <template #append>
                      <el-button @click="copyText(serverCallbackUrl)">复制</el-button>
                    </template>
                  </el-input>
                  <ul>
                    <li>Token 和 EncodingAESKey 填写后，需与下方「系统配置」中填入的值保持一致</li>
                    <li>消息加解密方式选「安全模式」</li>
                  </ul>
                  <el-button size="small" @click="openUrl('https://mp.weixin.qq.com/advanced/advanced?action=dev&t=advancedmenu/index')">打开公众平台服务器配置 →</el-button>
                </div>
              </template>
            </el-step>

            <!-- Step 4 -->
            <el-step title="申请消息模板">
              <template #description>
                <div class="step-body">
                  <p>服务号模板消息需在微信后台申请，审核通过后会分配一个模板 ID。建议申请以下模板，审核关键词需与实际发送内容匹配。</p>
                  <el-table :data="suggestedTemplates" border size="small" class="tpl-suggest-table">
                    <el-table-column prop="scene" label="推送场景" width="140" />
                    <el-table-column prop="name" label="建议模板名称" width="180" />
                    <el-table-column prop="keywords" label="参考关键词" />
                  </el-table>
                  <p style="margin-top:10px;color:var(--el-color-warning);">⚠️ 申请时标题和行业类目要与实际场景相符，否则审核容易被拒。</p>
                  <el-button size="small" @click="openUrl('https://mp.weixin.qq.com/advanced/tmplmsg?action=list')">打开模板消息管理 →</el-button>
                </div>
              </template>
            </el-step>

            <!-- Step 5 -->
            <el-step title="填写系统配置并保存">
              <template #description>
                <div class="step-body">
                  <p>保存服务号凭据后，还需完成模板配置、场景开关与用户关注绑定；实际送达请查看发送日志。</p>
                  <el-form :model="configForm" label-width="160px" class="config-form">
                    <el-form-item label="AppID（服务号）">
                      <el-input v-model="configForm.appId" placeholder="wx开头的字符串，在「设置」→「帐号信息」中查看" />
                    </el-form-item>
                    <el-form-item label="AppSecret">
                      <el-input v-model="configForm.appSecret" type="password" show-password placeholder="在「设置」→「基本配置」中生成" />
                    </el-form-item>
                    <el-form-item label="Token（消息校验）">
                      <el-input v-model="configForm.token" type="password" show-password placeholder="自定义字符串，需与公众平台配置一致" />
                    </el-form-item>
                    <el-form-item label="EncodingAESKey">
                      <el-input v-model="configForm.aesKey" type="password" show-password placeholder="43位随机字符串，需与公众平台配置一致" />
                    </el-form-item>
                    <el-form-item>
                      <el-button type="primary" :loading="savingConfig" @click="saveConfig">保存配置</el-button>
                      <el-button @click="testConnection" :loading="testingConn">测试连接</el-button>
                      <el-tag v-if="connStatus === 'ok'" type="success" style="margin-left:8px">连接正常</el-tag>
                      <el-tag v-else-if="connStatus === 'fail'" type="danger" style="margin-left:8px">连接失败</el-tag>
                    </el-form-item>
                  </el-form>
                </div>
              </template>
            </el-step>

          </el-steps>
        </div>
      </el-tab-pane>

      <!-- ===== TAB 2：场景开关 ===== -->
      <el-tab-pane label="场景开关" name="scenes">
        <div class="scene-wrap">
          <div class="scene-global">
            <span class="scene-global-label">全局推送开关</span>
            <el-switch v-model="globalEnabled" active-text="开启" inactive-text="关闭" @change="saveGlobal" />
            <span class="scene-global-hint">仅控制服务号外发，不会覆盖用户个人通知选择</span>
          </div>

          <el-divider />

          <div class="scene-group">
            <div class="scene-group-title">
              <el-icon><Bicycle /></el-icon> 跑腿通知
            </div>
            <div class="scene-list">
              <div v-for="s in errandScenes" :key="s.key" class="scene-item">
                <div class="scene-info">
                  <span class="scene-name">{{ s.name }}</span>
                  <span class="scene-desc">{{ s.desc }}</span>
                </div>
                <div class="scene-ctrl">
                  <el-tag size="small" type="info">立即发送</el-tag>
                  <el-switch v-model="s.enabled" :disabled="s.key === 'community_circle_new'" @change="saveScene(s)" />
                </div>
              </div>
            </div>
          </div>

          <el-divider />

          <div class="scene-group">
            <div class="scene-group-title">
              <el-icon><ChatDotRound /></el-icon> 社区通知
            </div>
            <div class="scene-list">
              <div v-for="s in communityScenes" :key="s.key" class="scene-item">
                <div class="scene-info">
                  <span class="scene-name">{{ s.name }}</span>
                  <span class="scene-desc">{{ s.desc }}</span>
                </div>
                <div class="scene-ctrl">
                  <el-tag size="small" :type="s.strategy === 'immediate' ? 'info' : 'warning'">
                    {{ s.strategyLabel }}
                  </el-tag>
                  <el-switch v-model="s.enabled" :disabled="s.key === 'community_circle_new'" @change="saveScene(s)" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ===== TAB 3：消息模板 ===== -->
      <el-tab-pane label="消息模板" name="templates">
        <div class="tpl-hint">
          <el-icon><InfoFilled /></el-icon>
          有系统配置权限的运营人员和超级管理员可在这里配置模板。复制微信模板 ID 后，点击「配置模板」填写并保存。
          <el-link type="primary" :underline="false" @click="openUrl('https://mp.weixin.qq.com/advanced/tmplmsg?action=list')" style="margin-left:6px">打开模板消息管理 →</el-link>
        </div>

        <div class="tpl-scene-list">
          <div v-for="row in templateRows" :key="row.key" class="tpl-scene-card">
            <div class="tpl-scene-header">
              <div class="tpl-scene-meta">
                <span class="tpl-scene-name">{{ row.scene }}</span>
                <span class="tpl-scene-desc">{{ row.desc }}</span>
              </div>
              <div class="tpl-status-tags">
                <el-tag v-if="row.supportsOfficial !== false" :type="row.officialConnection?.type || 'info'" size="small">
                  服务号 · {{ row.officialConnection?.label || '检查中' }}
                </el-tag>
                <el-tag v-if="row.supportsMiniProgram" :type="row.miniConnection?.type || 'info'" size="small">
                  小程序 · {{ row.miniConnection?.label || '检查中' }}
                </el-tag>
              </div>
            </div>

            <div class="tpl-scene-body">
              <section v-if="row.supportsOfficial !== false" class="tpl-platform-section">
                <div class="tpl-platform-title">
                  <span>服务号模板消息</span>
                  <el-button size="small" type="primary" :disabled="!canConfigureTemplates || !templateRecords.official" @click="openTemplateEditor(row, 'official')">配置模板</el-button>
                </div>
                <div class="managed-template-summary">
                  <span class="managed-template-state">{{ row.officialConnection?.label || '检查中' }}</span>
                  <span>{{ row.officialConnection?.note || '正在读取模板配置。' }}</span>
                </div>
              </section>

              <section v-if="row.supportsMiniProgram" class="tpl-platform-section tpl-mini-section">
                <div class="tpl-platform-title">
                  <span>小程序订阅消息</span>
                  <el-button size="small" type="primary" :disabled="!canConfigureTemplates || !templateRecords.miniprogram" @click="openTemplateEditor(row, 'miniprogram')">配置模板</el-button>
                </div>
                <div class="managed-template-summary">
                  <span class="managed-template-state">{{ row.miniConnection?.label || '检查中' }}</span>
                  <span>{{ row.miniConnection?.note || '正在读取模板配置。' }}</span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ===== TAB 4：防骚扰规则 ===== -->
      <el-tab-pane label="防骚扰规则" name="antispam">
        <div class="antispam-wrap">
          <el-alert
            title="这里是平台级服务号防骚扰上限；用户仍可在小程序「设置 - 消息通知」关闭点赞、评论和回复等提醒。两层同时生效，以更严格的一层为准。跑腿订单状态不受社区限频规则影响。"
            type="info"
            show-icon
            :closable="false"
            style="margin-bottom:20px"
          />

          <el-form :model="antispamForm" label-width="200px" class="antispam-form">
            <div class="antispam-section-title">回复消息</div>
            <el-form-item label="合并窗口时长（分钟）">
              <el-input-number v-model="antispamForm.replyMergeMinutes" :min="5" :max="120" :step="5" />
              <span class="form-tip">窗口内仅发送第一条服务号提醒，完整消息仍保留在站内通知中</span>
            </el-form-item>

            <el-divider />
            <div class="antispam-section-title">点赞消息</div>
            <el-form-item label="触发推送的最低点赞数">
              <el-input-number v-model="antispamForm.likeThreshold" :min="1" :max="50" />
              <span class="form-tip">累计满此数量才发送一条汇总，如「你的帖子收到 5 个赞」</span>
            </el-form-item>
            <el-form-item label="每天最多推送点赞消息">
              <el-input-number v-model="antispamForm.likeDailyMax" :min="1" :max="10" />
              <span class="form-tip">条（超出后当天不再推送点赞通知）</span>
            </el-form-item>

            <el-divider />
            <div class="antispam-section-title">每日上限（全部社区通知）</div>
            <el-form-item label="单用户每日最多收到">
              <el-input-number v-model="antispamForm.dailyMax" :min="1" :max="20" />
              <span class="form-tip">条社区通知（跑腿通知不计入）</span>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="savingAntispam" @click="saveAntispam">保存规则</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- ===== TAB 5：发送日志 ===== -->
      <el-tab-pane label="发送日志" name="logs">
        <div class="tab-toolbar">
          <el-select v-model="logFilters.scene" placeholder="场景" clearable style="width:150px" @change="loadLogs">
            <el-option v-for="s in allTemplateSceneOptions" :key="s.key" :label="s.name" :value="s.key" />
          </el-select>
          <el-select v-model="logFilters.status" placeholder="状态" clearable style="width:120px" @change="loadLogs">
            <el-option label="发送成功" value="success" />
            <el-option label="发送失败" value="failed" />
            <el-option label="等待微信回执" value="pending" />
          </el-select>
          <el-date-picker
            v-model="logFilters.dateRange"
            type="daterange"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width:240px"
            @change="loadLogs"
          />
          <el-button :icon="RefreshRight" :loading="loadingLogs" @click="loadLogs(true)">刷新</el-button>
        </div>

        <el-table :data="logs" v-loading="loadingLogs" stripe>
          <el-table-column prop="sentAt" label="发送时间" width="170">
            <template #default="{ row }">{{ formatTime(row.sentAt) }}</template>
          </el-table-column>
          <el-table-column prop="userId" label="用户ID" width="130" show-overflow-tooltip />
          <el-table-column prop="sceneName" label="场景" width="140" />
          <el-table-column prop="status" label="状态" width="110" align="center">
            <template #default="{ row }">
              <el-tag
                :type="row.status === 'success' ? 'success' : row.status === 'pending' ? 'warning' : 'danger'"
                size="small"
              >
                {{ { success: '送达成功', failed: '送达失败', pending: '等待微信回执' }[row.status] ?? row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="summary" label="内容摘要" show-overflow-tooltip />
          <el-table-column prop="errMsg" label="失败原因" width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span style="color:var(--el-color-danger-light-3)">{{ row.errMsg }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right" align="center">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'failed'"
                link
                type="primary"
                :loading="retryingLogId === row.id"
                @click="retryLog(row)"
              >重试</el-button>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="logFilters.page"
            v-model:page-size="logFilters.pageSize"
            :total="logTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @current-change="loadLogs"
            @size-change="loadLogs"
          />
        </div>
      </el-tab-pane>

    </el-tabs>
    <WechatTemplateEditor ref="templateEditor" @saved="reloadTemplatesAfterSave" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { RefreshRight, InfoFilled, Bicycle, ChatDotRound } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import WechatTemplateEditor from './WechatTemplateEditor.vue'
import { useAuthStore } from '@/stores/auth'
import { isSuperRole } from '@/router/access'
import {
  fetchConfigGroup,
  fetchWechatMessageLogs,
  fetchWechatOfficialConfig,
  fetchWechatTemplates,
  retryWechatMessage,
  saveConfigGroup,
  testWechatOfficialToken,
} from '@/api/admin'

import { describeWechatTemplateState } from './wechatTemplateState.mjs'

const activeTab = ref('setup')
const auth = useAuthStore()
const canConfigureTemplates = computed(() => isSuperRole(auth.user.role) || auth.permissions.includes('system:config'))
const templateEditor = ref<InstanceType<typeof WechatTemplateEditor>>()
const templateRecords = ref<Record<string, any[] | null>>({ official: null, miniprogram: null })
function openTemplateEditor(row: any, channel: string) {
  if (canConfigureTemplates.value && templateRecords.value[channel]) templateEditor.value?.open(row, channel, templateRecords.value[channel]!)
}
async function reloadTemplatesAfterSave() {
  try { await loadTemplates() } catch { ElMessage.error('模板已保存，但状态刷新失败，请刷新页面查看') }
}

// ===== 接入状态 =====
const configured = ref(false)
const setupStep = ref(0)

const serverCallbackUrl = computed(() => {
  const configuredBase = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
  if (configuredBase && !configuredBase.startsWith('/')) {
    return `${configuredBase}/wechat/official/callback`
  }
  const { protocol, hostname, origin } = window.location
  const backendOrigin = ['localhost', '127.0.0.1'].includes(hostname)
    ? `${protocol}//${hostname}:3000`
    : origin
  return `${backendOrigin}/api/wechat/official/callback`
})

function openUrl(url: string) { window.open(url, '_blank') }
function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => ElMessage.success('已复制'))
}

const suggestedTemplates = [
  { scene: '骑手新订单', name: '新订单通知（生活服务／跑腿）', keywords: '订单编号、订单金额、服务名称、下单时间、服务地址' },
  { scene: '跑腿接单通知', name: '服务订单状态通知', keywords: '订单编号、骑手姓名、预计时间、备注' },
  { scene: '跑腿取货/送达', name: '配送状态更新通知', keywords: '配送状态、地点、时间、提示语' },
  { scene: '跑腿异常', name: '订单异常提醒', keywords: '异常原因、处理建议、联系方式' },
  { scene: '社区回复', name: '帖子互动通知', keywords: '互动类型、内容摘要、发布者、时间' },
  { scene: '社区点赞汇总', name: '内容获赞通知', keywords: '获赞数量、内容标题、时间段' },
]

// ===== 系统配置 =====
const configForm = ref({ appId: '', appSecret: '', token: '', aesKey: '' })
const savingConfig = ref(false)
const testingConn = ref(false)
const connStatus = ref<'idle' | 'ok' | 'fail'>('idle')

async function saveConfig() {
  savingConfig.value = true
  try {
    await saveConfigGroup('wechat_official', {
      wechat_official: {
        appId: configForm.value.appId.trim(),
        appSecret: configForm.value.appSecret,
        token: configForm.value.token.trim(),
        encodingAESKey: configForm.value.aesKey.trim(),
      },
    })
    configured.value = !!(configForm.value.appId && configForm.value.appSecret)
    setupStep.value = configured.value ? 5 : 4
    connStatus.value = 'idle'
    ElMessage.success('配置已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存配置失败')
  } finally {
    savingConfig.value = false
  }
}

async function testConnection() {
  testingConn.value = true
  try {
    const res: any = await testWechatOfficialToken()
    connStatus.value = res?.success ? 'ok' : 'fail'
    if (res?.success) ElMessage.success('服务号 AccessToken 获取成功，连接正常')
    else ElMessage.error(res?.error || '服务号连接失败')
  } catch (e: any) {
    connStatus.value = 'fail'
    ElMessage.error(e?.message || '服务号连接失败')
  } finally {
    testingConn.value = false
  }
}

// ===== 场景开关 =====
const globalEnabled = ref(false)

const errandScenes = ref([
  { key: 'new_errand_order', name: '骑手新订单', desc: '通知同校区符合接单条件的兼职骑手和官方骑手', enabled: false, strategy: 'immediate', strategyLabel: '立即发送' },
  { key: 'errand_accepted', name: '骑手已接单', desc: '订单被骑手接受时推送', enabled: false, strategy: 'immediate', strategyLabel: '立即发送' },
  { key: 'errand_picked', name: '骑手已取货', desc: '骑手到达取件地点并取货后推送', enabled: false, strategy: 'immediate', strategyLabel: '立即发送' },
  { key: 'errand_delivered', name: '订单送达/完成', desc: '送达待收货、用户确认收货或系统自动完成时推送', enabled: false, strategy: 'immediate', strategyLabel: '立即发送' },
  { key: 'errand_abnormal', name: '订单异常', desc: '退款处理及结果通知；超时风险目前仅进入后台异常记录', enabled: false, strategy: 'immediate', strategyLabel: '立即发送' },
])

const communityScenes = ref([
  { key: 'community_at', name: '@提醒', desc: '帖子或评论中被@时推送', enabled: false, strategy: 'immediate', strategyLabel: '立即发送' },
  { key: 'community_reply', name: '收到回复', desc: '有人回复我的帖子或评论', enabled: false, strategy: 'merge', strategyLabel: '限频推送' },
  { key: 'community_like', name: '收到点赞汇总', desc: '累计满阈值时推送一条汇总', enabled: false, strategy: 'threshold', strategyLabel: '阈值汇总' },
  { key: 'community_circle_new', name: '关注圈子新内容（预留）', desc: '当前未接入业务触发，请保持关闭', enabled: false, strategy: 'daily', strategyLabel: '未启用' },
])

const allScenes = computed(() => [...errandScenes.value, ...communityScenes.value])

async function saveGlobal() {
  try {
    await saveNotifySettings()
    ElMessage.success(globalEnabled.value ? '已开启全局推送' : '已关闭全局推送')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存全局开关失败')
  }
}

async function saveScene(s: any) {
  try {
    await saveNotifySettings()
    ElMessage.success(`「${s.name}」已${s.enabled ? '开启' : '关闭'}`)
  } catch (e: any) {
    ElMessage.error(e?.message || `保存「${s.name}」开关失败`)
  }
}

// ===== 消息模板 =====
// 编辑器通过已有权限接口保存配置；场景开关独立管理。
const templateRows = ref<any[]>([
  {
    key: 'new_errand_order', scene: '跑腿骑手新订单',
    desc: '新订单通知（生活服务／跑腿），接收者为合格的兼职骑手和官方骑手',
    templateId: '', supportsOfficial: true, supportsMiniProgram: false,
  },
  {
    key: 'takeaway_order_status',
    scene: '外卖订单状态',
    desc: '付款用户接收商家接单、配送和送达状态',
    templateId: '',
    supportsOfficial: false,
    supportsMiniProgram: true,
    miniTemplateId: '',
  },
  {
    key: 'takeaway_merchant_order',
    scene: '商家新订单',
    desc: '商家接收新外卖订单和催处理提醒',
    templateId: '',
    supportsOfficial: false,
    supportsMiniProgram: true,
    miniTemplateId: '',
  },
  {
    key: 'takeaway_rider_order',
    scene: '骑手新配送任务',
    desc: '骑手上线后接收取餐和配送任务提醒',
    templateId: '',
    supportsOfficial: false,
    supportsMiniProgram: true,
    miniTemplateId: '',
  },
  {
    key: 'errand_accepted',
    scene: '骑手已接单',
    desc: '骑手接受订单时推送给下单用户',
    templateId: '',
    supportsMiniProgram: true,
    miniTemplateId: '',
  },
  {
    key: 'errand_picked',
    scene: '骑手已取货',
    desc: '骑手到达取件点并取货后推送',
    templateId: '',
    supportsMiniProgram: true,
    miniTemplateId: '',
  },
  {
    key: 'errand_delivered',
    scene: '订单已完成',
    desc: '送达待收货与确认完成时推送',
    templateId: '',
    supportsMiniProgram: true,
    miniTemplateId: '',
  },
  {
    key: 'errand_abnormal',
    scene: '订单异常',
    desc: '退款处理和结果通过服务号通知；超时风险目前记录在后台',
    templateId: '',
  },
  {
    key: 'welfare_draw',
    scene: '校园抽奖结果',
    desc: '报名用户主动订阅后接收开奖提醒，未配置模板时仍保留站内结果',
    templateId: '',
    supportsOfficial: false,
    supportsMiniProgram: true,
    miniTemplateId: '',
  },
  {
    key: 'post_audit_result',
    scene: '帖子审核结果',
    desc: '人工审核完成后通知帖子发布者',
    templateId: '',
    supportsOfficial: false,
    supportsMiniProgram: true,
    miniTemplateId: '',
  },
  {
    key: 'post_comment',
    scene: '帖子收到评论',
    desc: '帖子作者收到新评论时推送一次性订阅消息',
    templateId: '',
    supportsOfficial: false,
    supportsMiniProgram: true,
    miniTemplateId: '',
  },
  {
    key: 'comment_reply',
    scene: '评论收到回复',
    desc: '评论用户收到新回复时推送一次性订阅消息',
    templateId: '',
    supportsOfficial: false,
    supportsMiniProgram: true,
    miniTemplateId: '',
  },
  {
    key: 'community_at',
    scene: '@提醒',
    desc: '服务号提醒已绑定用户在帖子或评论中被@',
    templateId: '',
  },
  {
    key: 'community_reply',
    scene: '收到回复',
    desc: '有人回复我的帖子或评论时推送',
    templateId: '',
  },
  {
    key: 'community_like',
    scene: '点赞汇总',
    desc: '累计满阈值时推送一条汇总',
    templateId: '',
  },
])

const allTemplateSceneOptions = computed(() => {
  const rows = [
    ...allScenes.value,
    ...templateRows.value.map((row: any) => ({ key: row.key, name: row.scene })),
  ]
  return Array.from(new Map(rows.map(item => [item.key, item])).values())
})

// ===== 防骚扰规则 =====
const antispamForm = ref({ replyMergeMinutes: 30, likeThreshold: 5, likeDailyMax: 1, dailyMax: 5 })
const savingAntispam = ref(false)

async function saveAntispam() {
  savingAntispam.value = true
  try {
    await saveNotifySettings()
    ElMessage.success('防骚扰规则已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存防骚扰规则失败')
  } finally {
    savingAntispam.value = false
  }
}

// ===== 发送日志 =====
const logs = ref<any[]>([])
const logTotal = ref(0)
const loadingLogs = ref(false)
const retryingLogId = ref('')
const logFilters = ref({ scene: '', status: '', dateRange: null as any, page: 1, pageSize: 20 })

async function loadLogs(reset?: boolean) {
  if (reset) logFilters.value.page = 1
  loadingLogs.value = true
  try {
    const dateRange = logFilters.value.dateRange as string[] | null
    const res: any = await fetchWechatMessageLogs({
      platformType: 'official',
      templateType: logFilters.value.scene,
      status: logFilters.value.status,
      startDate: dateRange?.[0],
      endDate: dateRange?.[1],
      page: logFilters.value.page,
      pageSize: logFilters.value.pageSize,
    })
    const list = res?.list || res?.data?.list || []
    logs.value = list.map((item: any) => ({
      ...item,
      sentAt: item.sentAt || item.createdAt,
      sceneName: allTemplateSceneOptions.value.find(scene => scene.key === item.templateType)?.name || item.templateType,
      summary: item.page || item.templateId || '-',
      errMsg: item.errorMessage || '',
    }))
    logTotal.value = Number(res?.total || res?.data?.total || 0)
    if (reset) ElMessage.success('发送日志已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载发送日志失败')
  } finally {
    loadingLogs.value = false
  }
}

async function retryLog(row: any) {
  retryingLogId.value = row.id
  try {
    const res: any = await retryWechatMessage(row.id)
    if (res?.success === false) throw new Error(res?.error || res?.message || '重试失败')
    ElMessage.success(res?.message || '已重新提交，等待微信回执')
    await loadLogs()
  } catch (e: any) {
    ElMessage.error(e?.message || '重试失败')
  } finally {
    retryingLogId.value = ''
  }
}

function formatTime(t: string) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

function buildNotifySettingsPayload() {
  const scenes: Record<string, boolean> = {}
  for (const scene of allScenes.value) scenes[scene.key] = !!scene.enabled
  return {
    globalEnabled: globalEnabled.value,
    scenes,
    antispam: { ...antispamForm.value },
  }
}

async function saveNotifySettings() {
  return saveConfigGroup('wechat_official_notify', {
    wechat_official_notify: buildNotifySettingsPayload(),
  })
}

async function loadOfficialConfig() {
  const [groupRes, statusRes]: any[] = await Promise.all([
    fetchConfigGroup('wechat_official'),
    fetchWechatOfficialConfig(),
  ])
  const group = groupRes?.data || groupRes || {}
  const cfg = group.wechat_official || group
  configForm.value = {
    appId: String(cfg?.appId || cfg?.appid || statusRes?.appId || ''),
    appSecret: String(cfg?.appSecret || cfg?.secret || ''),
    token: String(cfg?.token || ''),
    aesKey: String(cfg?.encodingAESKey || cfg?.encodingAesKey || ''),
  }
  configured.value = !!statusRes?.configured
  setupStep.value = configured.value ? 5 : 4
}

async function loadNotifySettings() {
  const res: any = await fetchConfigGroup('wechat_official_notify')
  const data = res?.data || res || {}
  const settings = data.wechat_official_notify || data
  if (!settings || typeof settings !== 'object') return
  globalEnabled.value = settings.globalEnabled === true
  const scenes = settings.scenes && typeof settings.scenes === 'object' ? settings.scenes : {}
  for (const scene of allScenes.value) {
    scene.enabled = scene.key !== 'community_circle_new' && scenes[scene.key] === true
  }
  if (settings.antispam && typeof settings.antispam === 'object') {
    antispamForm.value = { ...antispamForm.value, ...settings.antispam }
  }
}

async function loadTemplatePages(platformType: string) {
  const records: any[] = []
  for (let page = 1; ; page++) {
    const res: any = await fetchWechatTemplates({ platformType, page, pageSize: 100 })
    const data = res?.data || res || {}
    const list = data.list || []
    records.push(...list)
    if (list.length < 100 || records.length >= Number(data.total || Infinity)) return records
  }
}

async function loadTemplates() {
  const results = await Promise.allSettled([
    loadTemplatePages('official'),
    loadTemplatePages('miniprogram'),
  ])
  templateRecords.value = {
    official: results[0].status === 'fulfilled' ? results[0].value : null,
    miniprogram: results[1].status === 'fulfilled' ? results[1].value : null,
  }
  for (const row of templateRows.value as any[]) {
    for (const [index, field] of [[0, 'officialConnection'], [1, 'miniConnection']] as const) {
      const result = results[index]
      row[field] = result.status === 'fulfilled'
        ? describeWechatTemplateState(result.value.filter((item: any) => item.templateType === row.key))
        : describeWechatTemplateState([], 'failed')
    }
  }
  if (results.some(result => result.status === 'rejected')) throw new Error('模板配置读取失败')
}

onMounted(async () => {
  const jobs = [loadOfficialConfig(), loadNotifySettings(), loadTemplates(), loadLogs()]
  const results = await Promise.allSettled(jobs)
  if (results.some(item => item.status === 'rejected')) {
    ElMessage.error('部分服务号通知配置加载失败，请刷新后重试')
  }
})
</script>

<style scoped>
.setup-banner { margin-bottom: 16px; }
.notify-tabs { margin-top: 16px; }

.guide-wrap { padding: 4px 0 16px; }
.guide-intro { color: var(--el-text-color-regular); margin-bottom: 24px; line-height: 1.7; }
.setup-steps { padding: 0 8px; }
.step-body { padding: 10px 0 18px; color: var(--el-text-color-regular); line-height: 1.75; font-size: 13px; }
.step-body ul { margin: 8px 0 12px 0; padding-left: 20px; }
.step-body li { margin-bottom: 5px; }
.step-body p { margin: 0 0 8px; }
.copy-input { margin: 8px 0 12px; max-width: 520px; font-size: 12px; }
.config-form { max-width: 560px; margin-top: 12px; }
.tpl-suggest-table { margin: 10px 0; }

.scene-wrap { padding: 8px 0; }
.scene-global { display: flex; align-items: center; gap: 16px; padding: 8px 4px; }
.scene-global-label { font-weight: 600; font-size: 14px; }
.scene-global-hint { color: var(--el-text-color-placeholder); font-size: 12px; }
.scene-group { margin: 4px 0; }
.scene-group-title {
  display: flex; align-items: center; gap: 6px;
  font-weight: 600; font-size: 14px; margin-bottom: 12px;
  color: var(--el-text-color-primary);
}
.scene-list { display: flex; flex-direction: column; gap: 8px; }
.scene-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border: 1px solid var(--el-border-color-light);
  border-radius: 8px; background: var(--el-fill-color-blank);
}
.scene-info { display: flex; flex-direction: column; gap: 3px; }
.scene-name { font-size: 13px; font-weight: 500; }
.scene-desc { font-size: 12px; color: var(--el-text-color-placeholder); }
.scene-ctrl { display: flex; align-items: center; gap: 12px; }

.tpl-hint {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px; margin-bottom: 20px;
  background: var(--el-color-info-light-9); border-radius: 6px;
  font-size: 13px; color: var(--el-text-color-regular);
}
.tpl-hint code { background: var(--el-fill-color); padding: 1px 5px; border-radius: 3px; font-size: 12px; }

/* 场景卡片列表 */
.tpl-scene-list { display: flex; flex-direction: column; gap: 16px; }

.tpl-scene-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  overflow: hidden;
  background: var(--el-fill-color-blank);
}

.tpl-scene-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.tpl-scene-meta { display: flex; flex-direction: column; gap: 3px; }
.tpl-scene-name { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.tpl-scene-desc { font-size: 12px; color: var(--el-text-color-placeholder); }
.tpl-status-tags { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

.tpl-scene-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 16px; }
.tpl-platform-section { display: flex; flex-direction: column; gap: 14px; }
.tpl-platform-section + .tpl-platform-section { border-top: 1px solid var(--el-border-color-lighter); padding-top: 18px; }
.tpl-platform-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); }
.managed-template-summary { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 8px; background: var(--el-fill-color-light); color: var(--el-text-color-secondary); font-size: 12px; }
.managed-template-state { color: var(--el-text-color-primary); font-weight: 600; white-space: nowrap; }
.tpl-mini-section { background: var(--el-color-primary-light-9); margin: 0 -6px -4px; padding: 14px 6px 4px; border-radius: 8px; }

.antispam-wrap { padding: 4px 0; }
.antispam-form { max-width: 640px; }
.antispam-section-title { font-weight: 600; font-size: 13px; margin: 0 0 14px; color: var(--el-text-color-primary); }
.form-tip { margin-left: 10px; font-size: 12px; color: var(--el-text-color-placeholder); }

.tab-toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; align-items: center; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>
