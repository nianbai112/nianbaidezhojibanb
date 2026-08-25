<template>
  <div class="page-container">
    <PageHeader title="通知配置与投递" subtitle="配置通知渠道并投递 notifications；客服私聊请进入客服工作台" />

    <!-- 通知总览 -->
    <StatGrid :items="statItems" />

    <!-- Tab 切换 -->
    <el-tabs v-model="activeTab" type="border-card" class="notify-tabs">
      <el-tab-pane label="通知配置" name="config">
        <NotificationSettingsPanel />
      </el-tab-pane>

      <el-tab-pane label="订阅授权记录" name="consents">
        <div class="tab-toolbar">
          <el-select v-model="consentFilters.status" placeholder="授权状态" clearable @change="loadConsents" style="width:140px">
            <el-option label="全部" value="" />
            <el-option label="接受" value="accept" />
            <el-option label="拒绝" value="reject" />
          </el-select>
          <el-button @click="loadConsents(true)" :loading="loadingConsents" :icon="RefreshRight">刷新</el-button>
        </div>
        <el-table :data="consents" v-loading="loadingConsents" stripe>
          <el-table-column prop="userId" label="用户ID" width="140" show-overflow-tooltip />
          <el-table-column prop="templateType" label="模板类型" width="160" />
          <el-table-column prop="templateId" label="模板ID" width="160" show-overflow-tooltip />
          <el-table-column prop="status" label="授权状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 'accept' ? 'success' : 'danger'" size="small">
                {{ row.status === 'accept' ? '接受' : '拒绝' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sourceScene" label="来源场景" width="140" />
          <el-table-column prop="updatedAt" label="更新时间" width="170">
            <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="consentFilters.page" v-model:page-size="consentFilters.pageSize"
            :total="consentTotal" :page-sizes="[20,50]" layout="total, sizes, prev, pager, next"
            @current-change="loadConsents" @size-change="loadConsents" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="公众号绑定管理" name="bindings">
        <div class="tab-toolbar">
          <el-select v-model="bindingFilters.subscribe" placeholder="关注状态" clearable @change="loadBindings" style="width:140px">
            <el-option label="全部" value="" />
            <el-option label="已关注" :value="true" />
            <el-option label="已取关" :value="false" />
          </el-select>
          <el-button @click="loadBindings(true)" :loading="loadingBindings" :icon="RefreshRight">刷新</el-button>
        </div>
        <el-table :data="bindings" v-loading="loadingBindings" stripe>
          <el-table-column prop="userId" label="用户ID" width="140" show-overflow-tooltip />
          <el-table-column prop="officialOpenid" label="公众号OpenID" width="160" show-overflow-tooltip />
          <el-table-column prop="unionid" label="UnionID" width="160" show-overflow-tooltip />
          <el-table-column prop="subscribe" label="关注状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.subscribe ? 'success' : 'info'" size="small">
                {{ row.subscribe ? '已关注' : '已取关' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="subscribeAt" label="关注时间" width="170">
            <template #default="{ row }">{{ formatTime(row.subscribeAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="copyText(row.officialOpenid)">复制OpenID</el-button>
              <el-popconfirm title="确定解绑？用户需重新扫码绑定。" @confirm="handleUnbind(row.id)">
                <template #reference>
                  <el-button link type="danger" size="small">解绑</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="bindingFilters.page" v-model:page-size="bindingFilters.pageSize"
            :total="bindingTotal" :page-sizes="[20,50]" layout="total, sizes, prev, pager, next"
            @current-change="loadBindings" @size-change="loadBindings" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="通知投递" name="delivery">
        <el-alert
          class="delivery-boundary-alert"
          type="info"
          :closable="false"
          show-icon
          title="这里只投递站内 Notification"
          description="区域和全站通知会写入 notifications 并按配置实时推送；不会创建官方客服私聊，也不会追加工单回复。客服沟通请进入“客服工作台”。"
        />
        <div class="ws-section">
          <h4>单用户通知</h4>
          <div class="ws-row">
            <el-input v-model="userNotice.userId" placeholder="用户 ID" style="width:240px" />
            <el-input v-model="userNotice.title" placeholder="通知标题" style="width:200px" />
            <el-input v-model="userNotice.message" placeholder="通知内容" style="width:300px" />
            <el-button type="primary" :loading="userNotice.loading" @click="doPushUser">投递通知</el-button>
          </div>
          <p class="form-tip">只为该用户写入一条 notifications 记录，不创建客服私聊或工单回复。</p>
        </div>
        <el-divider />
        <div class="ws-section">
          <h4>区域通知</h4>
          <div class="ws-row">
            <el-input v-model="wsRegion.regionId" placeholder="区域 ID" style="width:240px" />
            <el-input v-model="wsRegion.title" placeholder="通知标题" style="width:200px" />
            <el-input v-model="wsRegion.message" placeholder="通知内容" style="width:300px" />
            <el-button type="primary" @click="doPushRegion" :loading="wsRegion.loading">投递通知</el-button>
          </div>
          <p class="form-tip">按区域写入每位用户的 notifications 记录，离线用户重新进入后仍可看到。</p>
        </div>
        <el-divider />
        <div class="ws-section">
          <h4>全站通知</h4>
          <div class="ws-row">
            <el-input v-model="wsBroadcast.title" placeholder="通知标题" style="width:200px" />
            <el-input v-model="wsBroadcast.message" placeholder="通知内容" style="width:300px" />
            <el-button type="warning" @click="doBroadcast" :loading="wsBroadcast.loading">投递全站</el-button>
          </div>
          <p class="form-tip">会为权限范围内的全部用户写入 notifications，并尝试实时推送，请谨慎使用。</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="微信发送日志" name="logs">
        <div class="tab-toolbar">
          <el-select v-model="logFilters.platformType" placeholder="平台" clearable @change="loadLogs" style="width:120px">
            <el-option label="全部" value="" />
            <el-option label="小程序" value="miniprogram" />
            <el-option label="公众号" value="official" />
          </el-select>
          <el-select v-model="logFilters.status" placeholder="状态" clearable @change="loadLogs" style="width:120px">
            <el-option label="全部" value="" />
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failed" />
            <el-option label="待发送" value="pending" />
          </el-select>
          <el-button @click="loadLogs(true)" :loading="loadingLogs" :icon="RefreshRight">刷新</el-button>
          <el-button @click="$router.push('/system/wechat-logs')">全屏查看</el-button>
        </div>
        <el-table :data="logs" v-loading="loadingLogs" stripe>
          <el-table-column prop="userId" label="用户ID" width="120" show-overflow-tooltip />
          <el-table-column prop="platformType" label="平台" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="row.platformType === 'miniprogram' ? 'primary' : 'success'">
                {{ row.platformType === 'miniprogram' ? '小程序' : '公众号' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="templateType" label="模板类型" width="130" />
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'">
                {{ row.status === 'success' ? '成功' : row.status === 'failed' ? '失败' : '待发送' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="errorMessage" label="错误信息" min-width="150" show-overflow-tooltip />
          <el-table-column prop="createdAt" label="时间" width="170">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'failed'" link type="primary" size="small" @click="handleRetry(row)">重试</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="logFilters.page" v-model:page-size="logFilters.pageSize"
            :total="logTotal" :page-sizes="[20,50]" layout="total, sizes, prev, pager, next"
            @current-change="loadLogs" @size-change="loadLogs" />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import NotificationSettingsPanel from './components/NotificationSettingsPanel.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import { buildNotificationDeliveryPayload } from './notificationDelivery.mjs'
import {
  fetchNotifyStats,
  fetchSubscribeConsents,
  fetchOfficialBindings, deleteOfficialBinding,
  fetchWechatMessageLogs, retryWechatMessage,
  sendNotification,
} from '@/api/admin'

const activeTab = ref('config')

function formatTime(t: string) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN')
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => ElMessage.success('已复制'))
}

// ── 总览 ──
const stats = reactive({ todayNotifications: 0, todayWechatMessages: 0, todayWechatFailed: 0, onlineCount: 0 })
const statItems = computed(() => [
  { label: '今日站内通知', value: stats.todayNotifications, icon: 'Bell' },
  { label: '今日微信消息', value: stats.todayWechatMessages, icon: 'ChatDotSquare' },
  { label: '发送失败', value: stats.todayWechatFailed, tone: 'red' as const, icon: 'CircleClose' },
  { label: '在线连接', value: stats.onlineCount, tone: 'green' as const, icon: 'Monitor' },
])
async function loadStats() {
  try {
    const res: any = await fetchNotifyStats()
    Object.assign(stats, res?.data || res)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载通知总览失败')
  }
}

// ── 订阅授权 ──
const consents = ref<any[]>([])
const consentTotal = ref(0)
const loadingConsents = ref(false)
const consentFilters = reactive({ status: '', page: 1, pageSize: 20 })
async function loadConsents(showSuccess = false) {
  loadingConsents.value = true
  try {
    const res: any = await fetchSubscribeConsents(consentFilters)
    consents.value = res?.data?.list || res?.list || []
    consentTotal.value = res?.data?.total || res?.total || 0
    if (showSuccess === true) ElMessage.success('订阅授权记录已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载订阅授权记录失败')
  } finally { loadingConsents.value = false }
}

// ── 公众号绑定 ──
const bindings = ref<any[]>([])
const bindingTotal = ref(0)
const loadingBindings = ref(false)
const bindingFilters = reactive({ subscribe: '', page: 1, pageSize: 20 })
async function loadBindings(showSuccess = false) {
  loadingBindings.value = true
  try {
    const res: any = await fetchOfficialBindings(bindingFilters)
    bindings.value = res?.data?.list || res?.list || []
    bindingTotal.value = res?.data?.total || res?.total || 0
    if (showSuccess === true) ElMessage.success('公众号绑定记录已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载公众号绑定记录失败')
  } finally { loadingBindings.value = false }
}
async function handleUnbind(id: string) {
  try {
    await deleteOfficialBinding(id)
    ElMessage.success('已解绑')
    loadBindings()
  } catch (e: any) { ElMessage.error(e.message || '解绑失败') }
}

// ── 发送日志 ──
const logs = ref<any[]>([])
const logTotal = ref(0)
const loadingLogs = ref(false)
const logFilters = reactive({ platformType: '', status: '', page: 1, pageSize: 20 })
async function loadLogs(showSuccess = false) {
  loadingLogs.value = true
  try {
    const res: any = await fetchWechatMessageLogs(logFilters)
    logs.value = res?.data?.list || res?.list || []
    logTotal.value = res?.data?.total || res?.total || 0
    if (showSuccess === true) ElMessage.success('微信发送日志已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载微信发送日志失败')
  } finally { loadingLogs.value = false }
}
async function handleRetry(row: any) {
  try {
    await retryWechatMessage(row.id)
    ElMessage.success('已标记重试')
    loadLogs()
  } catch (e: any) { ElMessage.error(e.message || '重试失败') }
}

// ── Notification 投递（与客服私聊严格分离） ──
const userNotice = reactive({ userId: '', title: '平台通知', message: '', loading: false })
const wsRegion = reactive({ regionId: '', title: '区域通知', message: '', loading: false })
const wsBroadcast = reactive({ title: '全站通知', message: '', loading: false })

function createdCountOf(result: any) {
  return Number(result?.createdCount ?? result?.count ?? result?.data?.createdCount ?? result?.data?.count ?? 0)
}

async function doPushUser() {
  userNotice.loading = true
  try {
    const result: any = await sendNotification(buildNotificationDeliveryPayload({
      target: 'user',
      userId: userNotice.userId,
      title: userNotice.title,
      content: userNotice.message,
    }))
    ElMessage.success(`单用户通知已投递，写入 ${createdCountOf(result)} 条记录`)
  }
  catch (e: any) { ElMessage.error(e.message || '单用户通知投递失败') }
  finally { userNotice.loading = false }
}
async function doPushRegion() {
  wsRegion.loading = true
  try {
    const result: any = await sendNotification(buildNotificationDeliveryPayload({
      target: 'region',
      regionId: wsRegion.regionId,
      title: wsRegion.title,
      content: wsRegion.message,
    }))
    ElMessage.success(`区域通知已投递，写入 ${createdCountOf(result)} 条记录`)
  }
  catch (e: any) { ElMessage.error(e.message || '区域通知投递失败') }
  finally { wsRegion.loading = false }
}
async function doBroadcast() {
  wsBroadcast.loading = true
  try {
    const result: any = await sendNotification(buildNotificationDeliveryPayload({
      target: 'all',
      title: wsBroadcast.title,
      content: wsBroadcast.message,
    }))
    ElMessage.success(`全站通知已投递，写入 ${createdCountOf(result)} 条记录`)
  }
  catch (e: any) { ElMessage.error(e.message || '全站通知投递失败') }
  finally { wsBroadcast.loading = false }
}

onMounted(() => { loadStats(); loadConsents(); loadBindings(); loadLogs() })
</script>

<style scoped>
.page-container { display: grid; gap: 24px; }
.notify-tabs { border-radius: 14px; overflow: hidden; }
.tab-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.delivery-boundary-alert { margin-bottom: 20px; }
.ws-section h4 { margin: 0 0 12px; font-size: 14px; font-weight: 800; color: #0f2a5f; }
.ws-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.form-tip { color: #94a3b8; font-size: 12px; margin-top: 8px; }
</style>
