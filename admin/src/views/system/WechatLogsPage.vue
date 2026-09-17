<template>
  <div class="page-shell wechat-log-page">
    <GlassPageHeader title="微信发送日志" subtitle="查看小程序订阅消息、公众号模板消息的真实发送记录和失败原因">
      <template #actions>
        <el-button :icon="RefreshRight" :loading="loading" @click="loadLogs(true)">刷新</el-button>
      </template>
    </GlassPageHeader>

    <StatGrid :items="statItems" />

    <div class="glass-card filter-card">
      <el-input v-model="filters.keyword" clearable placeholder="用户名称、用户编号或微信标识" @keyup.enter="searchLogs" />
      <el-select v-model="filters.templateType" clearable placeholder="通知类型" @change="searchLogs"><el-option v-for="item in templateOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
      <el-select v-model="filters.status" placeholder="发送状态" clearable @change="searchLogs">
        <el-option label="全部状态" value="" />
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
        <el-option label="等待微信回执" value="pending" /><el-option label="未发送" value="skipped" />
      </el-select>
      <el-select v-model="filters.platformType" placeholder="平台" clearable @change="searchLogs">
        <el-option label="全部平台" value="" />
        <el-option label="小程序" value="miniprogram" />
        <el-option label="公众号" value="official" />
      </el-select>
      <el-button type="primary" @click="searchLogs">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="glass-card table-card">
      <el-table :data="logs" v-loading="loading" stripe>
        <el-table-column label="接收用户" min-width="220"><template #default="{ row }"><strong>{{ row.userName }}</strong><div class="detail-value">用户编号：{{ row.userId || '未关联' }}</div></template></el-table-column>
        <el-table-column label="发送触发 IP" min-width="200"><template #default="{ row }">{{ ipText(row.requestIp) }}<div class="detail-value">{{ row.requestIpSourceLabel }}</div></template></el-table-column>
        <el-table-column label="用户微信标识（OpenID）" min-width="240"><template #default="{ row }"><span class="full-identifier">{{ row.openid || '未记录' }}</span></template></el-table-column>
        <el-table-column prop="platformType" label="平台" width="96">
          <template #default="{ row }">
            <el-tag size="small" :type="row.platformType === 'miniprogram' ? 'primary' : 'success'" effect="plain">
              {{ platformText(row.platformType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="templateName" label="通知类型" min-width="180" />
        <el-table-column label="微信模板编号" min-width="260"><template #default="{ row }"><div>{{ row.templateName }}</div><div class="full-identifier">{{ row.templateId || '未配置' }}</div></template></el-table-column>
        <el-table-column label="跳转页面" min-width="310"><template #default="{ row }"><strong>{{ row.pageDescription }}</strong><div class="full-identifier">{{ row.page || '未设置跳转' }}</div></template></el-table-column>
        <el-table-column prop="status" label="状态" width="96">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.displayStatus || row.status)" effect="plain">
              {{ statusText(row.displayStatus || row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="错误码" width="120"><template #default="{ row }">{{ row.errorCodeLabel || (/^-?\d+$/.test(row.errorCode || '') ? row.errorCode : '未请求微信') }}</template></el-table-column>
        <el-table-column label="中文原因与处理建议" min-width="350"><template #default="{ row }"><strong>{{ row.errorMessageZh || '无错误' }}</strong><div class="detail-value">{{ row.errorAdvice }}</div><details v-if="row.errorMessage"><summary>查看微信原始返回</summary><div class="full-identifier">{{ row.errorMessage }}</div></details></template></el-table-column>
        <el-table-column prop="sentAt" label="发送时间" width="175">
          <template #default="{ row }">{{ formatTime(row.sentAt) }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="175">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="selectedLog = row">完整详情</el-button>
            <el-button v-if="row.retryable" :loading="retryingId === row.id" :disabled="!!retryingId" type="primary" link size="small" @click="handleRetry(row)">
              重试
            </el-button>
            <span v-else class="empty-text">-</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="filters.page"
          v-model:page-size="filters.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadLogs()"
          @size-change="loadLogs()"
        />
      </div>
    </div>
    <el-drawer v-model="detailVisible" title="微信通知完整记录" size="min(760px, 95vw)">
      <template v-if="selectedLog">
        <el-alert :title="selectedLog.errorMessageZh || statusText(selectedLog.displayStatus || selectedLog.status)" :description="selectedLog.errorAdvice" :type="selectedLog.status === 'failed' ? 'error' : 'info'" :closable="false" show-icon />
        <el-descriptions :column="1" border style="margin-top: 18px">
          <el-descriptions-item label="用户名称">{{ selectedLog.userName }}</el-descriptions-item>
          <el-descriptions-item label="用户编号">{{ selectedLog.userId || '未关联' }}</el-descriptions-item>
          <el-descriptions-item label="发送触发 IP">{{ ipText(selectedLog.requestIp) }} · {{ selectedLog.requestIpSourceLabel }}</el-descriptions-item>
          <el-descriptions-item label="用户微信标识"><span class="full-identifier">{{ selectedLog.openid || '未记录' }}</span></el-descriptions-item>
          <el-descriptions-item label="微信渠道">{{ platformText(selectedLog.platformType) }}</el-descriptions-item>
          <el-descriptions-item label="通知类型">{{ selectedLog.templateName }}</el-descriptions-item>
          <el-descriptions-item label="微信模板编号"><span class="full-identifier">{{ selectedLog.templateId || '未配置' }}</span></el-descriptions-item>
          <el-descriptions-item label="跳转页面">{{ selectedLog.pageDescription }}<div class="full-identifier">{{ selectedLog.page || '未设置跳转' }}</div></el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusText(selectedLog.displayStatus || selectedLog.status) }}</el-descriptions-item>
          <el-descriptions-item label="错误码">{{ selectedLog.errorCodeLabel || selectedLog.errorCode || '无' }}</el-descriptions-item>
          <el-descriptions-item label="中文原因">{{ selectedLog.errorMessageZh || '无错误' }}</el-descriptions-item>
          <el-descriptions-item label="处理建议">{{ selectedLog.errorAdvice || '无需处理' }}</el-descriptions-item>
          <el-descriptions-item label="发送时间">{{ formatTime(selectedLog.sentAt) }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(selectedLog.createdAt) }}</el-descriptions-item>
        </el-descriptions>
        <details v-if="selectedLog.errorMessage"><summary>查看微信原始返回</summary><div class="full-identifier">{{ selectedLog.errorMessage }}</div></details>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RefreshRight } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import { fetchWechatMessageLogs, retryWechatMessage } from '@/api/admin'
import { ipText } from './logPresentation.mjs'

const loading = ref(false)
const logs = ref<any[]>([])
const total = ref(0)
const selectedLog = ref<any>(null)
const detailVisible = computed({ get: () => !!selectedLog.value, set: (open) => { if (!open) selectedLog.value = null } })
const retryingId = ref('')
const templateOptions = [{"value":"errand_accepted","label":"跑腿订单接单通知"},{"value":"errand_picked","label":"跑腿订单取货通知"},{"value":"errand_delivered","label":"跑腿订单完成通知"},{"value":"errand_abnormal","label":"跑腿订单异常通知"},{"value":"takeaway_order_status","label":"外卖订单状态通知"},{"value":"takeaway_merchant_order","label":"商家新订单通知"},{"value":"takeaway_rider_order","label":"骑手新任务通知"},{"value":"post_audit_result","label":"帖子审核结果通知"},{"value":"post_comment","label":"帖子评论通知"},{"value":"comment_reply","label":"评论回复通知"},{"value":"community_at","label":"社区提及通知"},{"value":"community_reply","label":"社区回复通知"},{"value":"community_like","label":"社区点赞通知"}]

const filters = reactive({
  keyword: '',
  templateType: '',
  status: '',
  platformType: '',
  page: 1,
  pageSize: 20,
})

const pageStats = computed(() => ({
  success: logs.value.filter((item) => (item.displayStatus || item.status) === 'success').length,
  failed: logs.value.filter((item) => (item.displayStatus || item.status) === 'failed').length,
  pending: logs.value.filter((item) => (item.displayStatus || item.status) === 'pending').length,
  skipped: logs.value.filter((item) => (item.displayStatus || item.status) === 'skipped').length,
}))

const statItems = computed(() => [
  { label: '当前筛选记录', value: total.value, icon: 'Document' },
  { label: '本页未发送', value: pageStats.value.skipped, tone: 'orange' as const, icon: 'InfoFilled' },
  { label: '本页成功', value: pageStats.value.success, tone: 'green' as const, icon: 'CircleCheck' },
  { label: '本页失败', value: pageStats.value.failed, tone: 'red' as const, icon: 'CircleClose' },
  { label: '本页等待回执', value: pageStats.value.pending, tone: 'orange' as const, icon: 'Clock' },
])

function formatTime(t: string) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN')
}

function platformText(value: string) {
  if (value === 'miniprogram') return '小程序'
  if (value === 'official') return '公众号'
  return value || '-'
}

function statusText(value: string) {
  const map: Record<string, string> = { success: '成功', failed: '失败', pending: '等待微信回执', skipped: '未发送' }
  return map[value] || value || '-'
}

function statusType(value: string) {
  if (value === 'success') return 'success'
  if (value === 'failed') return 'danger'
  if (value === 'skipped') return 'info'
  return 'warning'
}

async function loadLogs(showSuccess = false) {
  if (loading.value) return
  loading.value = true
  try {
    const res: any = await fetchWechatMessageLogs(filters)
    logs.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
    if (showSuccess) ElMessage.success('微信发送日志已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载微信发送日志失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.templateType = ''
  filters.status = ''
  filters.platformType = ''
  filters.page = 1
  loadLogs()
}

function searchLogs() { filters.page = 1; loadLogs() }

async function handleRetry(row: any) {
  if (retryingId.value) return
  retryingId.value = row.id
  try {
    await ElMessageBox.confirm(`将立即重新发送「${row.templateName}」给「${row.userName}」。请先按处理建议修正失败原因。`, '重试发送', { type: 'warning', confirmButtonText: '重新发送', cancelButtonText: '取消' })
    const res: any = await retryWechatMessage(row.id)
    if (res?.success === false) { ElMessage.error(res.error || res.message || '重新发送失败'); return }
    ElMessage.success(res?.message || '已提交重新发送')
    await loadLogs()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.error || e?.message || '重试失败')
  } finally { retryingId.value = '' }
}

onMounted(() => loadLogs())
</script>

<style scoped lang="scss">
.detail-value { margin-top: 6px; color: #64748b; line-height: 1.6; }
.full-identifier { overflow-wrap: anywhere; white-space: normal; user-select: text; line-height: 1.6; }
summary { cursor: pointer; color: #2563eb; margin-top: 6px; }
.wechat-log-page {
  display: grid;
  gap: 18px;
}
.filter-card {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto auto;
  gap: 12px;
  padding: 16px;
}
.table-card {
  padding: 14px;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.empty-text {
  color: #94a3b8;
}
@media (max-width: 1200px) {
  .filter-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .filter-card {
    grid-template-columns: 1fr;
  }
}
</style>
