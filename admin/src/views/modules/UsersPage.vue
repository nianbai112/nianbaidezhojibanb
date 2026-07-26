<template>
  <div class="page-shell">
    <GlassPageHeader title="用户管理" subtitle="管理小程序用户、机器人账号、学生认证、余额状态、内容与交易行为">
      <template #actions>
        <el-button :icon="Refresh" @click="loadUsers">刷新</el-button>
      </template>
    </GlassPageHeader>

    <StatGrid :items="statsItems" />

    <div class="page-main-col">
      <SearchPanel :fields="searchFields" @search="onSearch" />

      <div class="action-bar">
        <div class="btn-row">
          <el-button type="primary" :icon="Plus" @click="showRobotDialog = true">添加机器人</el-button>
          <el-button type="warning" :icon="Open" @click="batchAction('enable')">批量启用</el-button>
          <el-button type="warning" :icon="Close" @click="batchAction('disable')">批量禁用</el-button>
          <el-button type="danger" :icon="Lock" @click="batchAction('ban')">批量封禁</el-button>
          <el-button :icon="Download" @click="handleExport">导出数据</el-button>
        </div>
        <div class="action-bar-right">
          <span class="muted">共 {{ total }} 条</span>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="users"
        style="width: 100%"
        @selection-change="handleSelectionChange"
        border
        stripe
      >
        <el-table-column type="selection" width="55" />
        <el-table-column label="头像/昵称" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :src="row.avatar" :size="40">{{ (row.nickname || '?')[0] }}</el-avatar>
              <div class="user-info">
                <div class="nickname">{{ row.nickname || '-' }}</div>
                <div class="user-id">{{ row.id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="手机号" prop="phone" min-width="130">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column label="用户类型" min-width="100">
          <template #default="{ row }">
            <el-tag :type="row.userType === 'robot' ? 'info' : 'success'" size="small">
              {{ row.typeLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所属区域" prop="regionName" min-width="120">
          <template #default="{ row }">{{ row.regionName || '-' }}</template>
        </el-table-column>
        <el-table-column label="学生认证" min-width="100">
          <template #default="{ row }">
            <el-tag :type="certTagType(row.studentCertStatus)" size="small">
              {{ certLabel(row.studentCertStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="余额" min-width="100">
          <template #default="{ row }">
            <span class="money">¥{{ formatCents(row.balance) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="内容数据" min-width="140">
          <template #default="{ row }">
            <div class="data-cell">
              <span>帖 {{ row.postCount || 0 }}</span>
              <span>评 {{ row.commentCount || 0 }}</span>
              <span>举报 {{ row.reportCount || 0 }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="订单数据" min-width="140">
          <template #default="{ row }">
            <div class="data-cell">
              <span>单 {{ row.orderCount || 0 }}</span>
              <span>退 {{ row.refundCount || 0 }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="账号状态" min-width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" prop="createdAt" min-width="160">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="最后登录" prop="lastLoginAt" min-width="160">
          <template #default="{ row }">{{ row.lastLoginAt ? formatDate(row.lastLoginAt) : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" min-width="200">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button link :type="row.status === 'active' ? 'warning' : 'success'" size="small" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
            <el-button link :type="row.status === 'banned' ? 'success' : 'danger'" size="small" @click="toggleBan(row)">
              {{ row.status === 'banned' ? '解封' : '封禁' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadUsers"
          @size-change="loadUsers"
        />
      </div>
    </div>

    <el-drawer v-model="detailVisible" title="用户详情" size="600px" direction="rtl">
      <template v-if="detailUser">
        <div class="detail-section">
          <h4>基础信息</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">头像</span>
              <el-avatar :src="detailUser.avatar" :size="48">{{ (detailUser.nickname || '?')[0] }}</el-avatar>
            </div>
            <div class="detail-item">
              <span class="label">昵称</span>
              <span>{{ detailUser.nickname || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">手机号</span>
              <span>{{ detailUser.phone || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">用户ID</span>
              <span class="id-text">{{ detailUser.id }}</span>
            </div>
            <div class="detail-item">
              <span class="label">OpenID</span>
              <span class="id-text">{{ detailUser.openid || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">注册时间</span>
              <span>{{ formatDate(detailUser.createdAt) }}</span>
            </div>
            <div class="detail-item">
              <span class="label">最后登录</span>
              <span>{{ detailUser.lastLoginAt ? formatDate(detailUser.lastLoginAt) : '-' }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h4>区域与身份</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">所属区域</span>
              <span>{{ detailUser.regionName || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">用户类型</span>
              <el-tag :type="detailUser.userType === 'robot' ? 'info' : 'success'" size="small">
                {{ detailUser.typeLabel }}
              </el-tag>
            </div>
            <div class="detail-item">
              <span class="label">学生认证</span>
              <el-tag :type="certTagType(detailUser.studentCertStatus)" size="small">
                {{ certLabel(detailUser.studentCertStatus) }}
              </el-tag>
            </div>
            <div class="detail-item">
              <span class="label">学校</span>
              <span>{{ detailUser.school || '-' }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h4>钱包余额</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">余额</span>
              <span class="money">¥{{ formatCents(detailUser.balance) }}</span>
            </div>
            <div class="detail-item">
              <span class="label">冻结金额</span>
              <span class="money">¥{{ (detailUser.freezeAmount / 100).toFixed(2) }}</span>
            </div>
            <div class="detail-item">
              <span class="label">累计收入</span>
              <span class="money">¥{{ (detailUser.totalIn / 100).toFixed(2) }}</span>
            </div>
            <div class="detail-item">
              <span class="label">累计支出</span>
              <span class="money">¥{{ (detailUser.totalOut / 100).toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h4>内容行为</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">发帖数</span>
              <span>{{ detailUser.postCount || 0 }}</span>
            </div>
            <div class="detail-item">
              <span class="label">评论数</span>
              <span>{{ detailUser.commentCount || 0 }}</span>
            </div>
            <div class="detail-item">
              <span class="label">点赞数</span>
              <span>{{ detailUser.likeCount || 0 }}</span>
            </div>
            <div class="detail-item">
              <span class="label">收藏数</span>
              <span>{{ detailUser.favoriteCount || 0 }}</span>
            </div>
            <div class="detail-item">
              <span class="label">被举报数</span>
              <span>{{ detailUser.reportCount || 0 }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h4>交易行为</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">订单数</span>
              <span>{{ detailUser.orderCount || 0 }}</span>
            </div>
            <div class="detail-item">
              <span class="label">退款数</span>
              <span>{{ detailUser.refundCount || 0 }}</span>
            </div>
            <div class="detail-item">
              <span class="label">跑腿订单</span>
              <span>{{ detailUser.errandOrderCount || 0 }}</span>
            </div>
            <div class="detail-item">
              <span class="label">二手发布</span>
              <span>{{ detailUser.secondHandCount || 0 }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section" v-if="detailUser.botInfo">
          <h4>机器人信息</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">机器人状态</span>
              <el-tag :type="detailUser.botInfo.status === 'active' ? 'success' : 'info'" size="small">
                {{ detailUser.botInfo.status === 'active' ? '运行中' : '已暂停' }}
              </el-tag>
            </div>
            <div class="detail-item">
              <span class="label">每日限制</span>
              <span>{{ detailUser.botInfo.dailyLimit }} 条</span>
            </div>
            <div class="detail-item">
              <span class="label">创建时间</span>
              <span>{{ formatDate(detailUser.botInfo.createdAt) }}</span>
            </div>
          </div>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="showRobotDialog" title="添加机器人用户" width="600px">
      <el-form :model="robotForm" label-width="120px">
        <el-form-item label="所属区域" required>
          <el-select v-model="robotForm.regionId" placeholder="选择区域" style="width: 100%">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="机器人数量" required>
          <el-input-number v-model="robotForm.count" :min="1" :max="500" style="width: 100%" />
        </el-form-item>
        <el-form-item label="统一密码">
          <el-input v-model="robotForm.password" placeholder="admin123" />
        </el-form-item>
        <el-form-item label="昵称前缀">
          <el-input v-model="robotForm.nicknamePrefix" placeholder="萌友" />
        </el-form-item>
        <el-form-item label="性别">
          <el-select v-model="robotForm.gender" style="width: 100%">
            <el-option label="随机" value="random" />
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
          </el-select>
        </el-form-item>
        <el-form-item label="头像生成">
          <el-select v-model="robotForm.avatarMode" style="width: 100%">
            <el-option label="随机头像" value="random" />
            <el-option label="使用默认头像" value="default" />
          </el-select>
        </el-form-item>
        <el-form-item label="是否启用">
          <el-switch v-model="robotForm.enabled" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="robotForm.remark" type="textarea" :rows="2" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRobotDialog = false">取消</el-button>
        <el-button type="primary" :loading="robotLoading" @click="handleCreateRobots">确认创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus, Open, Close, Lock, Download } from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import SearchPanel from '@/components/glass/SearchPanel.vue'
import { fetchModulePage, fetchUserStats, createRobots, fetchUserDetail, fetchRegions, runModuleAction, exportRows } from '@/api/admin'
import type { SearchField } from '@/types/admin'

const loading = ref(false)
const users = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const selectedRows = ref<any[]>([])
const lastQuery = ref<Record<string, any>>({})

const stats = ref({
  totalUsers: 0,
  realUsers: 0,
  robotUsers: 0,
  todayNewUsers: 0,
  verifiedUsers: 0,
  disabledUsers: 0,
})

const statsItems = computed(() => [
  { label: '总用户数', value: stats.value.totalUsers.toLocaleString(), delta: '-', tone: 'blue' as const, icon: 'User' },
  { label: '真实用户', value: stats.value.realUsers.toLocaleString(), delta: '-', tone: 'green' as const, icon: 'UserFilled' },
  { label: '机器人用户', value: stats.value.robotUsers.toLocaleString(), delta: '-', tone: 'purple' as const, icon: 'Avatar' },
  { label: '今日新增', value: stats.value.todayNewUsers.toLocaleString(), delta: '-', tone: 'orange' as const, icon: 'Plus' },
  { label: '学生认证', value: stats.value.verifiedUsers.toLocaleString(), delta: '-', tone: 'cyan' as const, icon: 'Checked' },
  { label: '封禁/禁用', value: stats.value.disabledUsers.toLocaleString(), delta: '-', tone: 'red' as const, icon: 'Warning' },
])

const searchFields: SearchField[] = [
  { key: 'keyword', label: '关键词', type: 'input', placeholder: '搜索昵称、手机号、用户ID、openid' },
  { key: 'userId', label: '用户ID', type: 'input', placeholder: '精确搜索用户ID' },
  { key: 'userType', label: '用户类型', type: 'select', options: [
    { label: '全部', value: '' },
    { label: '小程序用户', value: 'normal' },
    { label: '机器人用户', value: 'robot' },
    { label: '商家用户', value: 'merchant' },
    { label: '骑手用户', value: 'rider' },
    { label: '区域代理', value: 'agent' },
  ]},
  { key: 'regionId', label: '所属区域', type: 'select', options: [] },
  { key: 'studentCertStatus', label: '学生认证', type: 'select', options: [
    { label: '全部', value: '' },
    { label: '未认证', value: 'none' },
    { label: '待审核', value: 'pending' },
    { label: '已认证', value: 'approved' },
    { label: '已驳回', value: 'rejected' },
  ]},
  { key: 'status', label: '账号状态', type: 'select', options: [
    { label: '全部', value: '' },
    { label: '正常', value: 'active' },
    { label: '禁用', value: 'disabled' },
    { label: '封禁', value: 'banned' },
  ]},
  { key: 'balanceSort', label: '余额排序', type: 'select', options: [
    { label: '默认', value: '' },
    { label: '余额从高到低', value: 'desc' },
    { label: '余额从低到高', value: 'asc' },
  ]},
  { key: 'startDate', label: '注册开始时间', type: 'date' },
  { key: 'endDate', label: '注册结束时间', type: 'date' },
  { key: 'lastLoginStart', label: '最后登录开始', type: 'date' },
  { key: 'lastLoginEnd', label: '最后登录结束', type: 'date' },
]

const detailVisible = ref(false)
const detailUser = ref<any>(null)

const showRobotDialog = ref(false)
const robotLoading = ref(false)
const robotForm = reactive({
  regionId: '',
  count: 10,
  password: 'admin123',
  nicknamePrefix: '萌友',
  gender: 'random',
  avatarMode: 'random',
  enabled: true,
  remark: '',
})

const regions = ref<any[]>([])

function formatDate(date: string | Date | null | undefined) {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatCents(value: any) {
  const amount = Number(value)
  return Number.isFinite(amount) ? (amount / 100).toFixed(2) : '0.00'
}

function certTagType(status: string) {
  const map: Record<string, string> = { approved: 'success', pending: 'warning', rejected: 'danger', none: 'info' }
  return map[status] || 'info'
}

function certLabel(status: string) {
  const map: Record<string, string> = { approved: '已认证', pending: '待审核', rejected: '已驳回', none: '未认证' }
  return map[status] || '未认证'
}

function statusTagType(status: string) {
  const map: Record<string, string> = { active: 'success', banned: 'danger', disabled: 'warning' }
  return map[status] || 'info'
}

function statusLabel(status: string) {
  const map: Record<string, string> = { active: '正常', banned: '封禁', disabled: '禁用' }
  return map[status] || '未知'
}

async function loadStats() {
  try {
    const data = await fetchUserStats()
    if (data) stats.value = data as any
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function loadRegions() {
  try {
    const data = await fetchRegions()
    regions.value = Array.isArray(data) ? data : []
    const regionField = searchFields.find(f => f.key === 'regionId')
    if (regionField) {
      regionField.options = [{ label: '全部', value: '' }, ...regions.value.map(r => ({ label: r.name, value: r.id }))]
    }
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function loadUsers() {
  loading.value = true
  try {
    const params = { ...lastQuery.value, page: page.value, pageSize: pageSize.value }
    const data = await fetchModulePage('users', params)
    users.value = data.rows
    total.value = data.total
  } catch (e: any) {
    ElMessage.error('加载用户列表失败: ' + (e?.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

function onSearch(params: Record<string, any>) {
  lastQuery.value = params
  page.value = 1
  loadUsers()
}

function handleSelectionChange(rows: any[]) {
  selectedRows.value = rows
}

async function loadUserDetail(id: string) {
  try {
    const data = await fetchUserDetail(id)
    detailUser.value = data
    detailVisible.value = true
  } catch (e: any) {
    ElMessage.error('加载用户详情失败: ' + (e?.message || '未知错误'))
  }
}

function openDetail(row: any) {
  loadUserDetail(row.id)
}

async function toggleStatus(row: any) {
  const newStatus = row.status === 'active' ? 'disabled' : 'active'
  const label = newStatus === 'active' ? '启用' : '禁用'
  try {
    await ElMessageBox.confirm(`确认${label}用户 "${row.nickname || row.id}" 吗？`, '确认操作', { type: 'warning' })
    await runModuleAction('users', 'update', { row, data: { status: newStatus } })
    ElMessage.success(`${label}成功`)
    loadUsers()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

async function toggleBan(row: any) {
  const isBanned = row.status === 'banned'
  const label = isBanned ? '解封' : '封禁'
  try {
    const { value: reason } = await ElMessageBox.prompt(`确认${label}用户 "${row.nickname || row.id}" 吗？`, label + '用户', {
      inputType: 'textarea',
      inputPlaceholder: '请输入原因（可选）',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    }).catch(() => ({ value: '' }))
    await runModuleAction('users', 'update', { row, data: { status: isBanned ? 'active' : 'banned' } })
    ElMessage.success(`${label}成功`)
    loadUsers()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

async function batchAction(action: string) {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择要操作的用户')
    return
  }
  const labels: Record<string, string> = { enable: '启用', disable: '禁用', ban: '封禁' }
  const label = labels[action] || action
  try {
    await ElMessageBox.confirm(`确认对 ${selectedRows.value.length} 个用户执行「${label}」操作吗？`, '批量操作', { type: 'warning' })
    await runModuleAction('users', `batch${action.charAt(0).toUpperCase() + action.slice(1)}` as any, { rows: selectedRows.value })
    ElMessage.success('操作成功')
    loadUsers()
    loadStats()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

function handleExport() {
  exportRows('用户数据', users.value)
}

async function handleCreateRobots() {
  if (!robotForm.regionId) {
    ElMessage.warning('请选择所属区域')
    return
  }
  robotLoading.value = true
  try {
    const res = await createRobots(robotForm)
    ElMessage.success(`成功创建 ${(res as any)?.created || 0} 个机器人用户`)
    showRobotDialog.value = false
    loadUsers()
    loadStats()
  } catch (e: any) {
    ElMessage.error('创建失败: ' + (e?.message || '未知错误'))
  } finally {
    robotLoading.value = false
  }
}

onMounted(() => {
  loadStats()
  loadRegions()
  loadUsers()
})
</script>

<style scoped>
.page-main-col {
  display: grid;
  gap: 24px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.nickname {
  font-weight: 600;
  font-size: 14px;
}

.user-id {
  font-size: 12px;
  color: #909399;
}

.data-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.money {
  color: #e6a23c;
  font-weight: 600;
}

.id-text {
  font-size: 12px;
  color: #909399;
  word-break: break-all;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section h4 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item .label {
  font-size: 12px;
  color: #909399;
}

.muted {
  color: #909399;
  font-size: 13px;
}
</style>
