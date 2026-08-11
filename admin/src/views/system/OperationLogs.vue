<template>
  <div class="page-container">
    <PageHeader title="操作日志" subtitle="查看管理员操作日志，支持按模块、风险等级和闭环状态筛选" icon="Document">
      <template #actions>
        <el-button v-if="hasExportPermission" @click="exportLogs">导出</el-button>
        <el-button @click="loadLogs">刷新</el-button>
      </template>
    </PageHeader>

    <SearchPanel @search="loadLogs" @reset="resetFilters">
      <el-input v-model="filters.keyword" placeholder="搜索操作内容" clearable style="width: 200px" />
      <el-select v-model="filters.module" placeholder="模块" clearable style="width: 120px">
        <el-option label="区域" value="region" />
        <el-option label="圈子" value="circle" />
        <el-option label="用户" value="user" />
        <el-option label="商家" value="merchant" />
        <el-option label="订单" value="order" />
        <el-option label="内容" value="content" />
        <el-option label="财务" value="finance" />
        <el-option label="系统" value="system" />
      </el-select>
      <el-select v-model="filters.action" placeholder="操作类型" clearable style="width: 120px">
        <el-option label="新增" value="create" />
        <el-option label="修改" value="update" />
        <el-option label="删除" value="delete" />
        <el-option label="审核" value="audit" />
        <el-option label="登录" value="login" />
      </el-select>
      <el-select v-model="filters.riskLevel" placeholder="风险等级" clearable style="width: 120px">
        <el-option label="紧急" value="critical" />
        <el-option label="高" value="high" />
        <el-option label="普通" value="low" />
      </el-select>
      <el-select v-model="filters.alertStatus" placeholder="闭环状态" clearable style="width: 120px">
        <el-option label="待处理" value="pending" />
        <el-option label="处理中" value="processing" />
        <el-option label="已处理" value="resolved" />
        <el-option label="已忽略" value="ignored" />
      </el-select>
      <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 240px" />
    </SearchPanel>

    <div class="glass-card" style="padding: 0;">
      <el-table :data="logs" v-loading="loading" border stripe :row-class-name="getRowClassName">
        <el-table-column label="操作说明" min-width="380">
          <template #default="{ row }">
            <div class="log-summary">
              <div class="summary-title">{{ buildPlainSummary(row) }}</div>
              <div class="summary-meta">
                <el-tag size="small" effect="plain">{{ getModuleLabel(row.module) }}</el-tag>
                <el-tag :type="getActionType(row.action)" size="small" effect="plain">{{ getActionLabel(row.action) }}</el-tag>
                <span>{{ describeTarget(row) }}</span>
              </div>
              <div v-if="formatPlainDetail(row.detail, row)" class="summary-detail">{{ formatPlainDetail(row.detail, row) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作人" width="150">
          <template #default="{ row }">
            <div class="operator-cell">
              <strong>{{ row.operatorDisplayName || row.adminDisplayName || row.adminName || '后台管理员' }}</strong>
              <small v-if="row.operatorAccount || row.accountId">{{ row.operatorAccount || row.accountId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="riskLevel" label="风险" width="96">
          <template #default="{ row }">
            <el-tooltip :content="row.riskReason || '普通后台操作'" placement="top">
              <el-tag :type="getRiskType(row.riskLevel)" size="small" effect="plain">{{ getRiskLabel(row.riskLevel) }}</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="闭环" width="120">
          <template #default="{ row }">
            <el-button v-if="row.alertId && row.alertStatus === 'pending'" size="small" type="danger" text @click="gotoAlert(row)">去处理</el-button>
            <el-tag v-else-if="row.alertStatus" :type="getAlertStatusType(row.alertStatus)" size="small">{{ getAlertStatusLabel(row.alertStatus) }}</el-tag>
            <span v-else class="muted-text">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="120" />
        <el-table-column label="时间" width="160">
          <template #default="{ row }">
            <TimeText :time="row.createdAt" />
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadLogs"
          @size-change="loadLogs"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '@/api/request'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import TimeText from '@/components/common/TimeText.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasExportPermission = ref(auth.permissions.includes('admin:view'))
const router = useRouter()
const loading = ref(false)
const logs = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const dateRange = ref<any[]>([])

const filters = reactive({
  keyword: '',
  module: '',
  action: '',
  riskLevel: '',
  alertStatus: ''
})

const moduleLabels: Record<string, string> = {
  user: '用户',
  merchant: '商家',
  order: '订单',
  content: '内容',
  finance: '财务',
  system: '系统',
  region: '区域',
  delivery: '配送',
  circle: '圈子',
  admin: '管理员',
  activity: '活动',
  popup: '首页权益卡片',
  marketing: '营销',
  role: '角色权限',
  permission: '权限',
  payment: '支付',
  refund: '退款',
  withdraw: '提现',
  region_content: '区域内容',
  region_banner: '区域轮播',
  region_notice: '区域公告',
  region_tabbar: '底部导航'
}

const actionLabels: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '删除',
  audit: '审核',
  login: '登录',
  logout: '登出',
  ban: '封禁',
  unban: '解封',
  dissolve: '解散',
  remove_member: '踢出成员',
  update_config: '配置保存',
  batch: '批量操作',
  force_password_reset: '强制重置',
  soft_delete: '软删除',
  grant_membership: '发放会员',
  grant_member: '发放会员',
  grant_coupon: '发放优惠券',
  grant_m: '发放权益',
  enable: '启用',
  disable: '禁用',
  save: '保存',
  publish: '发布'
}

const actionTypes: Record<string, string> = {
  create: 'success',
  update: '',
  delete: 'danger',
  audit: 'warning',
  login: 'info'
}

const riskLabels: Record<string, string> = { critical: '紧急', high: '高', medium: '中', low: '普通' }
const riskTypes: Record<string, string> = { critical: 'danger', high: 'warning', medium: '', low: 'info' }
const alertStatusLabels: Record<string, string> = { pending: '待处理', processing: '处理中', resolved: '已处理', ignored: '已忽略' }
const alertStatusTypes: Record<string, string> = { pending: 'danger', processing: 'warning', resolved: 'success', ignored: 'info' }

const normalizeKey = (value: string) => String(value || '').trim().replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
const getModuleLabel = (module: string) => moduleLabels[normalizeKey(module)] || module
const getActionLabel = (action: string) => actionLabels[normalizeKey(action)] || action
const getActionType = (action: string) => actionTypes[normalizeKey(action)] || ''
const getRiskLabel = (level: string) => riskLabels[level] || level || '普通'
const getRiskType = (level: string) => riskTypes[level] || 'info'
const getAlertStatusLabel = (status: string) => alertStatusLabels[status] || status
const getAlertStatusType = (status: string) => alertStatusTypes[status] || ''
const getRowClassName = ({ row }: { row: any }) => {
  if (row.riskLevel === 'critical') return 'critical-row'
  if (row.riskLevel === 'high') return 'high-risk-row'
  return ''
}

const shortId = (value: any) => {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.length <= 14) return text
  return `${text.slice(0, 8)}...${text.slice(-4)}`
}

const detailValue = (detail: any, keys: string[]) => {
  if (!detail || typeof detail !== 'object') return ''
  for (const key of keys) {
    const value = detail[key]
    if (value !== undefined && value !== null && String(value) !== '') return value
  }
  return ''
}

const describeTarget = (row: any) => {
  const targetType = getModuleLabel(row.targetType || row.module || '')
  const targetId = row.targetId || detailValue(row.detail, ['id', 'regionId', 'userId', 'activityId', 'popupId'])
  if (!targetId) return '未记录具体对象'
  return `${targetType || '对象'}：${shortId(targetId)}`
}

const formatPlainDetail = (detail: any, row?: any) => {
  if (!detail) return ''
  if (typeof detail === 'string') return detail === '-' ? '' : detail
  if (typeof detail !== 'object') return String(detail)
  const moduleKey = normalizeKey(row?.module || '')
  if (moduleKey.includes('tabbar') && Array.isArray(detail.list)) {
    const names = detail.list.map((item: any) => item?.name).filter(Boolean).join('、')
    return `调整了底部导航，共 ${detail.list.length} 项${names ? `：${names}` : ''}`
  }
  if (moduleKey.includes('activity')) {
    const title = detail.title || detail.name || detail.activityName
    const start = detail.startTime || detail.startedAt
    const end = detail.endTime || detail.endedAt
    return [title ? `活动「${title}」` : '', start || end ? `时间：${start || '-'} 至 ${end || '-'}` : ''].filter(Boolean).join('，')
  }
  if (moduleKey.includes('popup')) {
    const title = detail.title || detail.name
    const region = detail.regionName || detail.regionId
    return [title ? `权益卡片「${title}」` : '', region ? `区域：${region}` : ''].filter(Boolean).join('，')
  }
  if (moduleKey.includes('user') || normalizeKey(row?.action || '').startsWith('grant')) {
    const amount = detail.amount ? `${detail.amount}元` : ''
    const quantity = detail.quantity ? `${detail.quantity}份` : ''
    const benefit = detail.benefitName || detail.benefitKey
    const reason = detail.reason
    return [benefit ? `权益：${benefit}` : '', amount ? `金额：${amount}` : '', quantity ? `数量：${quantity}` : '', reason ? `原因：${reason}` : ''].filter(Boolean).join('，')
  }
  const readable: Record<string, string> = {
    title: '标题',
    name: '名称',
    status: '状态',
    reason: '原因',
    amount: '金额',
    quantity: '数量',
    regionId: '区域',
    userId: '用户',
    durationDays: '有效天数',
    benefitKey: '权益',
    page: '页面',
    path: '路径',
  }
  const parts = Object.entries(detail)
    .filter(([, value]) => value !== undefined && value !== null && value !== '' && typeof value !== 'object')
    .slice(0, 4)
    .map(([key, value]) => `${readable[key] || key}：${String(value)}`)
  if (parts.length) return parts.join('，')
  try {
    return JSON.stringify(detail).substring(0, 80)
  } catch {
    return ''
  }
}

const buildPlainSummary = (row: any) => {
  const operator = row.operatorDisplayName || row.adminDisplayName || row.adminName || '后台管理员'
  const moduleName = getModuleLabel(row.module)
  const actionName = getActionLabel(row.action)
  const detail = row.detail || {}
  const targetName = detail?.title || detail?.name || detail?.nickname || detail?.realName || ''
  const target = targetName ? `「${targetName}」` : ''
  return `${operator}${actionName}了${moduleName}${target}`
}

import { formatDateRangeParams } from '@/utils/date'

const loadLogs = async () => {
  loading.value = true
  try {
    const params: any = {
      page: page.value,
      pageSize: pageSize.value,
      ...filters
    }
    if (dateRange.value?.length === 2) {
      const { startDate, endDate } = formatDateRangeParams(dateRange.value)
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
    }
    const res: any = await request.get('/admin/operation-logs', { params })
    logs.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
  } catch (e: any) {
    logs.value = []
    total.value = 0
    ElMessage.error(e?.message || '加载操作日志失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.module = ''
  filters.action = ''
  filters.riskLevel = ''
  filters.alertStatus = ''
  dateRange.value = []
  loadLogs()
}

const gotoAlert = (row: any) => {
  router.push({ path: '/dashboard/alerts', query: { type: 'operation', status: row.alertStatus || 'pending', businessId: row.id } })
}

const exportLogs = () => {
  const csv = ['操作说明,操作人,模块,操作,风险,闭环状态,目标,详情,IP,时间']
  logs.value.forEach(l => {
    csv.push(`"${buildPlainSummary(l)}",${l.operatorDisplayName || l.adminDisplayName || l.adminName || ''},${getModuleLabel(l.module)},${getActionLabel(l.action)},${getRiskLabel(l.riskLevel)},${getAlertStatusLabel(l.alertStatus)},"${describeTarget(l)}","${formatPlainDetail(l.detail, l)}",${l.ip || ''},${l.createdAt || ''}`)
  })
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '操作日志.csv'
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  loadLogs()
})
</script>

<style scoped>
.page-container { padding: 24px; }
.muted-text { color: #94a3b8; }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border-radius: 14px; border: 1px solid rgba(255,255,255,0.8); }
.log-summary { display: grid; gap: 7px; padding: 4px 0; }
.summary-title { color: #0f172a; font-size: 14px; font-weight: 800; line-height: 1.35; }
.summary-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #64748b; font-size: 12px; }
.summary-detail { color: #475569; font-size: 12px; line-height: 1.5; word-break: break-word; }
.operator-cell { display: grid; gap: 4px; }
.operator-cell strong { color: #0f172a; font-size: 13px; }
.operator-cell small { color: #94a3b8; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:deep(.high-risk-row) { --el-table-tr-bg-color: #fff8ed; }
:deep(.critical-row) { --el-table-tr-bg-color: #fff1f2; }
</style>
