<template>
  <div class="page-shell">
    <PageHeader title="对象匹配" subtitle="资料审核、喜欢记录、互相喜欢、套餐订单和举报风控统一工作台" icon="Heart" />

    <div class="overview-grid">
      <div v-for="item in overviewCards" :key="item.label" class="metric-card">
        <div class="metric-value">{{ item.value }}</div>
        <div class="metric-label">{{ item.label }}</div>
        <div class="metric-help">{{ item.help }}</div>
      </div>
    </div>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="运营总览" name="overview">
        <div class="ops-board">
          <div class="ops-panel">
            <h3>运营动作</h3>
            <p>每天优先处理待审核资料和待处理举报，避免用户资料不合规或争议内容继续曝光。</p>
            <el-button type="primary" @click="activeTab = 'profiles'; loadProfiles()">处理资料审核</el-button>
            <el-button @click="activeTab = 'reports'; loadReports()">查看举报</el-button>
          </div>
          <div class="ops-panel">
            <h3>业务状态</h3>
            <p>用户资料通过后才进入推荐；互相喜欢后小程序才开放私聊入口；购买套餐只增加喜欢次数，不绕过审核。</p>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="资料审核" name="profiles">
        <div class="tab-toolbar">
          <el-input v-model="profileFilters.keyword" clearable placeholder="搜索昵称、学校、简介" style="width:240px" @keyup.enter="loadProfiles" />
          <el-select v-model="profileFilters.auditStatus" clearable placeholder="审核状态" style="width:140px" @change="loadProfiles">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="未通过" value="rejected" />
          </el-select>
          <el-select v-model="profileFilters.gender" clearable placeholder="性别" style="width:120px" @change="loadProfiles">
            <el-option label="男生" value="male" />
            <el-option label="女生" value="female" />
          </el-select>
          <el-button type="primary" @click="loadProfiles" :loading="profileLoading">查询</el-button>
          <el-button @click="resetProfiles">重置</el-button>
        </div>
        <el-table :data="profiles" v-loading="profileLoading" stripe>
          <el-table-column label="用户资料" min-width="260">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar :src="firstPhoto(row) || row.user?.avatar" :size="46">{{ row.user?.nickname?.[0] || '用' }}</el-avatar>
                <div>
                  <div class="user-name">{{ row.displayName || row.user?.nickname || '-' }}</div>
                  <div class="sub-line">UID {{ uidText(row.user?.uid) }} · {{ genderText(row.gender || row.user?.profile?.gender) }} · {{ ageText(row) }}</div>
                  <div class="sub-line">{{ row.school || row.user?.profile?.school || '未填学校' }} {{ row.major || row.user?.profile?.major || '' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="简介" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">{{ row.bio || '-' }}</template>
          </el-table-column>
          <el-table-column label="区域" width="130">
            <template #default="{ row }">{{ row.region?.name || '-' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="profileStatusType(row.auditStatus)" size="small">{{ profileStatusText(row.auditStatus) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="收到/互相" width="110">
            <template #default="{ row }">{{ row.likedCount || 0 }} / {{ row.matchedCount || 0 }}</template>
          </el-table-column>
          <el-table-column label="提交时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="210" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openProfile(row)">详情</el-button>
              <el-button v-if="row.auditStatus !== 'approved'" size="small" type="success" link @click="auditProfile(row, 'approved')">通过</el-button>
              <el-button v-if="row.auditStatus !== 'rejected'" size="small" type="danger" link @click="auditProfile(row, 'rejected')">拒绝</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="profilePage" v-model:page-size="profilePageSize" :total="profileTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadProfiles" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="匹配记录" name="matches">
        <div class="tab-toolbar">
          <el-select v-model="matchFilters.status" clearable placeholder="状态" style="width:150px" @change="loadMatches">
            <el-option label="待回应" value="PENDING" />
            <el-option label="互相喜欢" value="MATCHED" />
            <el-option label="已跳过" value="REJECTED" />
          </el-select>
          <el-button type="primary" @click="loadMatches" :loading="matchLoading">查询</el-button>
          <el-button @click="resetMatches">重置</el-button>
        </div>
        <el-table :data="matches" v-loading="matchLoading" stripe>
          <el-table-column label="主动方" min-width="170">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}（UID {{ uidText(row.user?.uid) }}）</template>
          </el-table-column>
          <el-table-column label="被喜欢方" min-width="170">
            <template #default="{ row }">{{ row.target?.nickname || '-' }}（UID {{ uidText(row.target?.uid) }}）</template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }"><el-tag :type="matchStatusType(row.status)" size="small">{{ matchStatusText(row.status) }}</el-tag></template>
          </el-table-column>
          <el-table-column label="来源" width="120">
            <template #default="{ row }">{{ row.actionSource === 'mini_program' ? '小程序' : row.actionSource || '-' }}</template>
          </el-table-column>
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.matchedAt || row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="matchPage" v-model:page-size="matchPageSize" :total="matchTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadMatches" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="套餐订单" name="packages">
        <div class="two-panel">
          <div class="panel">
            <div class="panel-head">
              <h3>喜欢次数套餐</h3>
              <div>
                <el-button type="primary" @click="openPackageDialog()">新增套餐</el-button>
                <el-button @click="loadPackages" :loading="pkgLoading">刷新</el-button>
              </div>
            </div>
            <el-table :data="packages" v-loading="pkgLoading" stripe>
              <el-table-column prop="name" label="套餐名称" min-width="140" />
              <el-table-column label="价格" width="90"><template #default="{ row }">¥{{ money(row.price) }}</template></el-table-column>
              <el-table-column prop="matchCount" label="次数" width="80" />
              <el-table-column prop="validDays" label="有效期" width="90"><template #default="{ row }">{{ row.validDays || '-' }}天</template></el-table-column>
              <el-table-column label="操作" width="130" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" type="primary" link @click="openPackageDialog(row)">编辑</el-button>
                  <el-popconfirm title="确定删除此套餐？" @confirm="deletePackage(row.id)">
                    <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
                  </el-popconfirm>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="panel">
            <div class="panel-head">
              <h3>套餐订单</h3>
              <el-button @click="loadOrders" :loading="orderLoading">刷新</el-button>
            </div>
            <el-table :data="orders" v-loading="orderLoading" stripe>
              <el-table-column prop="orderNo" label="订单号" min-width="170" show-overflow-tooltip />
              <el-table-column label="用户" width="120"><template #default="{ row }">{{ row.User?.nickname || '-' }}</template></el-table-column>
              <el-table-column label="套餐" width="120"><template #default="{ row }">{{ row.package?.name || '-' }}</template></el-table-column>
              <el-table-column label="金额" width="90"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
              <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="orderStatusType(row.status)" size="small">{{ orderStatusText(row.status) }}</el-tag></template></el-table-column>
              <el-table-column label="操作" width="90" fixed="right">
                <template #default="{ row }">
                  <el-popconfirm v-if="row.status === 'paid'" title="确定退款？" @confirm="refundOrder(row.id)">
                    <template #reference><el-button size="small" type="danger" link>退款</el-button></template>
                  </el-popconfirm>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="举报风控" name="reports">
        <div class="tab-toolbar">
          <el-select v-model="reportFilters.status" clearable placeholder="状态" style="width:140px" @change="loadReports">
            <el-option label="待处理" value="pending" />
            <el-option label="已处理" value="resolved" />
            <el-option label="已忽略" value="rejected" />
          </el-select>
          <el-button type="primary" @click="loadReports" :loading="reportLoading">查询</el-button>
          <el-button @click="resetReports">重置</el-button>
        </div>
        <el-table :data="reports" v-loading="reportLoading" stripe>
          <el-table-column label="举报人" width="160"><template #default="{ row }">{{ row.reporter?.nickname || '-' }}（UID {{ uidText(row.reporter?.uid) }}）</template></el-table-column>
          <el-table-column label="被举报人" width="170"><template #default="{ row }">{{ row.target?.nickname || '-' }}（UID {{ uidText(row.target?.uid) }}）</template></el-table-column>
          <el-table-column prop="reason" label="原因" min-width="180" show-overflow-tooltip />
          <el-table-column prop="detail" label="补充说明" min-width="220" show-overflow-tooltip />
          <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status === 'pending' ? 'warning' : 'success'" size="small">{{ reportStatusText(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'pending'" size="small" type="primary" link @click="handleReport(row, 'resolved')">确认处理</el-button>
              <el-button v-if="row.status === 'pending'" size="small" type="info" link @click="handleReport(row, 'rejected')">忽略</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="reportPage" v-model:page-size="reportPageSize" :total="reportTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadReports" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="区域配置" name="configs">
        <div class="tab-toolbar">
          <el-button type="primary" @click="loadConfigs" :loading="configLoading">刷新配置</el-button>
        </div>
        <el-table :data="configs" v-loading="configLoading" stripe>
          <el-table-column label="区域" min-width="160"><template #default="{ row }">{{ row.region?.name || row.regionId }}</template></el-table-column>
          <el-table-column label="启用" width="90"><template #default="{ row }"><el-tag :type="row.isOpen ? 'success' : 'info'" size="small">{{ row.isOpen ? '启用' : '停用' }}</el-tag></template></el-table-column>
          <el-table-column label="每日免费次数" width="120" prop="dailyMatchLimit" />
          <el-table-column label="资料审核" width="120"><template #default="{ row }">{{ row.requireAudit ? '需要审核' : '自动通过' }}</template></el-table-column>
          <el-table-column label="学生认证" width="120"><template #default="{ row }">{{ row.requireStudentAuth ? '必须认证' : '不强制' }}</template></el-table-column>
          <el-table-column label="看谁喜欢我" width="120"><template #default="{ row }">{{ row.enableWhoLikedMe ? '开启' : '关闭' }}</template></el-table-column>
          <el-table-column label="付费套餐" width="120"><template #default="{ row }">{{ row.enablePaidPackage ? '开启' : '关闭' }}</template></el-table-column>
          <el-table-column label="操作" width="120" fixed="right"><template #default="{ row }"><el-button size="small" type="primary" link @click="editConfig(row)">编辑</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="showProfileDrawer" title="对象匹配资料详情" size="520px">
      <div v-if="currentProfile" class="drawer-body">
        <div class="photo-list">
          <el-image v-for="photo in photoList(currentProfile)" :key="photo" :src="photo" fit="cover" :preview-src-list="photoList(currentProfile)" />
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="用户">{{ currentProfile.displayName || currentProfile.user?.nickname || '-' }}（UID {{ uidText(currentProfile.user?.uid) }}）</el-descriptions-item>
          <el-descriptions-item label="性别/年龄/身高">{{ genderText(currentProfile.gender || currentProfile.user?.profile?.gender) }} / {{ ageText(currentProfile) }} / {{ currentProfile.height || '-' }}cm</el-descriptions-item>
          <el-descriptions-item label="学校专业">{{ currentProfile.school || currentProfile.user?.profile?.school || '-' }} {{ currentProfile.major || currentProfile.user?.profile?.major || '' }}</el-descriptions-item>
          <el-descriptions-item label="简介">{{ currentProfile.bio || '-' }}</el-descriptions-item>
          <el-descriptions-item label="审核状态">{{ profileStatusText(currentProfile.auditStatus) }}</el-descriptions-item>
          <el-descriptions-item label="审核说明">{{ currentProfile.auditRemark || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="drawer-actions">
          <el-button type="success" @click="auditProfile(currentProfile, 'approved')">通过</el-button>
          <el-button type="danger" @click="auditProfile(currentProfile, 'rejected')">拒绝</el-button>
        </div>
      </div>
    </el-drawer>

    <el-dialog v-model="showConfigDialog" title="编辑对象匹配配置" width="560px" destroy-on-close>
      <el-form :model="configForm" label-width="130px">
        <el-form-item label="启用对象匹配"><el-switch v-model="configForm.isOpen" /></el-form-item>
        <el-form-item label="每日免费次数"><el-input-number v-model="configForm.dailyMatchLimit" :min="0" /></el-form-item>
        <el-form-item label="资料需要审核"><el-switch v-model="configForm.requireAudit" /></el-form-item>
        <el-form-item label="要求学生认证"><el-switch v-model="configForm.requireStudentAuth" /></el-form-item>
        <el-form-item label="看谁喜欢我"><el-switch v-model="configForm.enableWhoLikedMe" /></el-form-item>
        <el-form-item label="允许买次数"><el-switch v-model="configForm.enablePaidPackage" /></el-form-item>
        <el-form-item label="AI推荐开关"><el-switch v-model="configForm.aiRecommendEnabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="saveConfig" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPackageDialog" :title="editingPkg ? '编辑套餐' : '新增套餐'" width="520px" destroy-on-close>
      <el-form :model="pkgForm" label-width="100px">
        <el-form-item label="套餐名称" required><el-input v-model="pkgForm.name" /></el-form-item>
        <el-form-item label="价格" required><el-input-number v-model="pkgForm.price" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="喜欢次数"><el-input-number v-model="pkgForm.matchCount" :min="1" /></el-form-item>
        <el-form-item label="有效天数"><el-input-number v-model="pkgForm.validDays" :min="1" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="pkgForm.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="pkgForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPackageDialog = false">取消</el-button>
        <el-button type="primary" @click="savePackage" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const activeTab = ref('overview')
const saving = ref(false)
const overview = ref<any>({})
const formatDate = (d?: string) => d ? new Date(d).toLocaleString('zh-CN') : '-'
const money = (value: any) => Number(value || 0).toFixed(2)
const uidText = (uid?: number) => uid ? String(uid).padStart(6, '0') : '-'

const overviewCards = computed(() => [
  { label: '资料总数', value: overview.value.totalProfiles || 0, help: '所有提交过对象匹配资料的用户' },
  { label: '待审核资料', value: overview.value.pendingProfiles || 0, help: '需要运营尽快处理' },
  { label: '正常推荐中', value: overview.value.openedProfiles || 0, help: '已通过并开放展示' },
  { label: '今日喜欢', value: overview.value.todayLikes || 0, help: '今天用户发起的喜欢' },
  { label: '互相喜欢', value: overview.value.matchedCount || 0, help: '双方都喜欢后可私聊' },
  { label: '待处理举报', value: overview.value.pendingReports || 0, help: '涉及风控和冲突处理' },
])

const configs = ref<any[]>([])
const configLoading = ref(false)
const showConfigDialog = ref(false)
const configForm = reactive({
  id: '',
  isOpen: true,
  dailyMatchLimit: 10,
  requireAudit: true,
  requireStudentAuth: false,
  enableWhoLikedMe: true,
  enablePaidPackage: true,
  aiRecommendEnabled: false,
})

const profiles = ref<any[]>([])
const profileLoading = ref(false)
const profilePage = ref(1)
const profilePageSize = ref(20)
const profileTotal = ref(0)
const profileFilters = reactive({ keyword: '', auditStatus: '', gender: '' })
const showProfileDrawer = ref(false)
const currentProfile = ref<any>(null)

const matches = ref<any[]>([])
const matchLoading = ref(false)
const matchPage = ref(1)
const matchPageSize = ref(20)
const matchTotal = ref(0)
const matchFilters = reactive({ status: '' })

const packages = ref<any[]>([])
const pkgLoading = ref(false)
const showPackageDialog = ref(false)
const editingPkg = ref<any>(null)
const pkgForm = reactive({ name: '', price: 0, validDays: 30, matchCount: 10, sortOrder: 0, description: '' })

const orders = ref<any[]>([])
const orderLoading = ref(false)

const reports = ref<any[]>([])
const reportLoading = ref(false)
const reportPage = ref(1)
const reportPageSize = ref(20)
const reportTotal = ref(0)
const reportFilters = reactive({ status: '' })

async function loadOverview() {
  try {
    overview.value = await request.get('/admin/dating/overview') as any
  } catch (e: any) {
    ElMessage.error(e?.message || '加载总览失败')
  }
}

async function loadConfigs() {
  configLoading.value = true
  try {
    const res: any = await request.get('/admin/dating/configs')
    configs.value = Array.isArray(res) ? res : res.list || res.data?.list || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载配置失败')
    configs.value = []
  } finally {
    configLoading.value = false
  }
}

function editConfig(row: any) {
  Object.assign(configForm, {
    id: row.id,
    isOpen: row.isOpen,
    dailyMatchLimit: row.dailyMatchLimit || 0,
    requireAudit: row.requireAudit ?? true,
    requireStudentAuth: row.requireStudentAuth ?? false,
    enableWhoLikedMe: row.enableWhoLikedMe ?? true,
    enablePaidPackage: row.enablePaidPackage ?? true,
    aiRecommendEnabled: row.aiRecommendEnabled ?? false,
  })
  showConfigDialog.value = true
}

async function saveConfig() {
  saving.value = true
  try {
    const { id, ...payload } = configForm
    await request.put(`/admin/dating/configs/${id}`, payload)
    ElMessage.success('配置已保存')
    showConfigDialog.value = false
    await loadConfigs()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function loadProfiles() {
  profileLoading.value = true
  try {
    const params = { page: profilePage.value, pageSize: profilePageSize.value, ...profileFilters }
    const res: any = await request.get('/admin/dating/profiles', { params })
    profiles.value = res.list || res.data?.list || []
    profileTotal.value = res.total || res.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载资料失败')
    profiles.value = []
  } finally {
    profileLoading.value = false
  }
}

function resetProfiles() {
  Object.assign(profileFilters, { keyword: '', auditStatus: '', gender: '' })
  profilePage.value = 1
  loadProfiles()
}

function openProfile(row: any) {
  currentProfile.value = row
  showProfileDrawer.value = true
}

async function auditProfile(row: any, status: string) {
  const statusText = status === 'approved' ? '通过' : '拒绝'
  let auditRemark = ''
  if (status === 'rejected') {
    const result = await ElMessageBox.prompt('请填写拒绝原因，用户侧会看到原因', '拒绝资料', {
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消',
      inputPattern: /.+/,
      inputErrorMessage: '拒绝原因不能为空',
    }).catch(() => null)
    if (!result) return
    auditRemark = result.value
  }
  try {
    await request.put(`/admin/dating/profiles/${row.id}/audit`, { auditStatus: status, auditRemark })
    ElMessage.success(`已${statusText}`)
    showProfileDrawer.value = false
    await Promise.all([loadProfiles(), loadOverview()])
  } catch (e: any) {
    ElMessage.error(e?.message || '审核失败')
  }
}

async function loadMatches() {
  matchLoading.value = true
  try {
    const params = { page: matchPage.value, pageSize: matchPageSize.value, ...matchFilters }
    const res: any = await request.get('/admin/dating/matches', { params })
    matches.value = res.list || res.data?.list || []
    matchTotal.value = res.total || res.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载匹配记录失败')
    matches.value = []
  } finally {
    matchLoading.value = false
  }
}

function resetMatches() {
  matchFilters.status = ''
  matchPage.value = 1
  loadMatches()
}

async function loadPackages() {
  pkgLoading.value = true
  try {
    const res: any = await request.get('/admin/dating/packages')
    packages.value = Array.isArray(res) ? res : res.list || res.data?.list || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载套餐失败')
    packages.value = []
  } finally {
    pkgLoading.value = false
  }
}

function openPackageDialog(row?: any) {
  editingPkg.value = row || null
  Object.assign(pkgForm, row
    ? { name: row.name, price: Number(row.price), validDays: row.validDays || 30, matchCount: row.matchCount || 1, sortOrder: row.sortOrder || 0, description: row.description || '' }
    : { name: '', price: 0, validDays: 30, matchCount: 10, sortOrder: 0, description: '' })
  showPackageDialog.value = true
}

async function savePackage() {
  saving.value = true
  try {
    const payload = { ...pkgForm }
    if (editingPkg.value) await request.put(`/admin/dating/packages/${editingPkg.value.id}`, payload)
    else await request.post('/admin/dating/packages', payload)
    ElMessage.success('套餐已保存')
    showPackageDialog.value = false
    await loadPackages()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function deletePackage(id: string) {
  try {
    await request.delete(`/admin/dating/packages/${id}`)
    ElMessage.success('已删除')
    await loadPackages()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败')
  }
}

async function loadOrders() {
  orderLoading.value = true
  try {
    const res: any = await request.get('/admin/dating/orders', { params: { page: 1, pageSize: 20 } })
    orders.value = res.list || res.data?.list || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载订单失败')
    orders.value = []
  } finally {
    orderLoading.value = false
  }
}

async function refundOrder(id: string) {
  const result = await ElMessageBox.prompt('请填写退款原因', '退款确认', {
    confirmButtonText: '确认退款',
    cancelButtonText: '取消',
    inputValue: '运营手动退款',
  }).catch(() => null)
  if (!result) return
  try {
    await request.post(`/admin/dating/orders/${id}/refund`, { reason: result.value })
    ElMessage.success('已退款')
    await loadOrders()
  } catch (e: any) {
    ElMessage.error(e?.message || '退款失败')
  }
}

async function loadReports() {
  reportLoading.value = true
  try {
    const params = { page: reportPage.value, pageSize: reportPageSize.value, ...reportFilters }
    const res: any = await request.get('/admin/dating/reports', { params })
    reports.value = res.list || res.data?.list || []
    reportTotal.value = res.total || res.data?.total || 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载举报失败')
    reports.value = []
  } finally {
    reportLoading.value = false
  }
}

function resetReports() {
  reportFilters.status = ''
  reportPage.value = 1
  loadReports()
}

async function handleReport(row: any, status: string) {
  const resultText = status === 'resolved' ? '已核查并处理' : '举报信息不足，已忽略'
  try {
    await ElMessageBox.confirm(`确定${status === 'resolved' ? '处理' : '忽略'}此举报？`, '举报处理')
    await request.post(`/admin/dating/reports/${row.id}/handle`, { status, result: resultText })
    ElMessage.success('举报已更新')
    await Promise.all([loadReports(), loadOverview()])
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

function handleTabChange() {
  const loaders: Record<string, () => void> = {
    overview: loadOverview,
    configs: loadConfigs,
    profiles: loadProfiles,
    matches: loadMatches,
    packages: () => { loadPackages(); loadOrders() },
    reports: loadReports,
  }
  loaders[activeTab.value]?.()
}

function profileStatusText(status: string) {
  if (status === 'approved') return '已通过'
  if (status === 'rejected') return '未通过'
  return '待审核'
}

function profileStatusType(status: string) {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  return 'warning'
}

function matchStatusText(status: string) {
  if (status === 'MATCHED') return '互相喜欢'
  if (status === 'REJECTED') return '已跳过'
  if (status === 'EXPIRED') return '已过期'
  return '待回应'
}

function matchStatusType(status: string) {
  if (status === 'MATCHED') return 'success'
  if (status === 'REJECTED') return 'info'
  return 'warning'
}

function orderStatusText(status: string) {
  if (status === 'paid') return '已支付'
  if (status === 'refunded') return '已退款'
  if (status === 'pending') return '待支付'
  return status || '-'
}

function orderStatusType(status: string) {
  if (status === 'paid') return 'success'
  if (status === 'refunded') return 'danger'
  return 'warning'
}

function reportStatusText(status: string) {
  if (status === 'pending') return '待处理'
  if (status === 'rejected') return '已忽略'
  return '已处理'
}

function genderText(gender?: string) {
  const text = String(gender || '').toLowerCase()
  if (text === 'male' || text === '1' || text === '男') return '男'
  if (text === 'female' || text === '2' || text === '女') return '女'
  if (text === 'MALE'.toLowerCase()) return '男'
  if (text === 'FEMALE'.toLowerCase()) return '女'
  return '未填'
}

function ageText(row: any) {
  if (row.birthYear) return `${new Date().getFullYear() - Number(row.birthYear)}岁`
  const birthday = row.user?.profile?.birthday
  if (!birthday) return '-'
  return `${Math.floor((Date.now() - new Date(birthday).getTime()) / 31557600000)}岁`
}

function photoList(row: any) {
  if (!row?.photos) return []
  return Array.isArray(row.photos) ? row.photos : []
}

function firstPhoto(row: any) {
  return photoList(row)[0]
}

onMounted(async () => {
  await Promise.all([loadOverview(), loadProfiles()])
})
</script>

<style scoped>
.page-shell {
  padding: 24px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin: 18px 0 22px;
}

.metric-card,
.ops-panel,
.panel {
  border: 1px solid #e6edf5;
  background: #fff;
  border-radius: 6px;
  padding: 18px;
}

.metric-value {
  font-size: 28px;
  font-weight: 800;
  color: #111827;
}

.metric-label {
  margin-top: 6px;
  font-weight: 700;
  color: #334155;
}

.metric-help,
.sub-line,
.ops-panel p {
  color: #8492a6;
  font-size: 12px;
  line-height: 1.6;
}

.ops-board,
.two-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.tab-toolbar,
.panel-head,
.drawer-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
}

.panel-head {
  justify-content: space-between;
}

.panel-head h3,
.ops-panel h3 {
  margin: 0 0 8px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.user-cell {
  display: flex;
  gap: 12px;
  align-items: center;
}

.user-name {
  font-weight: 700;
  color: #1f2937;
}

.photo-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.photo-list :deep(.el-image) {
  width: 100%;
  height: 130px;
  border-radius: 6px;
  background: #f3f4f6;
}

.drawer-body {
  padding-right: 8px;
}

.drawer-actions {
  margin-top: 18px;
  justify-content: flex-end;
}

@media (max-width: 1200px) {
  .overview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .two-panel,
  .ops-board {
    grid-template-columns: 1fr;
  }
}
</style>
