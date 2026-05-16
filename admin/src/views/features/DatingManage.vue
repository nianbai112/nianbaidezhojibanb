<template>
  <div class="page-shell">
    <PageHeader title="对象匹配" subtitle="管理交友匹配业务，包括资料审核、套餐、订单和举报" icon="Heart" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="区域配置" name="configs">
        <div class="tab-toolbar">
          <el-button @click="loadConfigs" :loading="configLoading">刷新</el-button>
        </div>
        <el-table :data="configs" v-loading="configLoading" stripe>
          <el-table-column prop="isOpen" label="启用状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.isOpen ? 'success' : 'info'" size="small">{{ row.isOpen ? '已启用' : '已禁用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="price" label="价格" width="100">
            <template #default="{ row }">¥{{ row.price }}</template>
          </el-table-column>
          <el-table-column prop="dailyMatchLimit" label="每日匹配上限" width="130" />
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="editConfig(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="资料审核" name="profiles">
        <div class="tab-toolbar">
          <el-select v-model="profileFilters.auditStatus" clearable placeholder="审核状态" style="width:140px" @change="loadProfiles">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
          </el-select>
          <el-button @click="loadProfiles" :loading="profileLoading">刷新</el-button>
        </div>
        <el-table :data="profiles" v-loading="profileLoading" stripe>
          <el-table-column prop="user.nickname" label="用户" width="120">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="gender" label="性别" width="70">
            <template #default="{ row }">{{ row.user?.profile?.gender === 'MALE' ? '男' : row.user?.profile?.gender === 'FEMALE' ? '女' : '-' }}</template>
          </el-table-column>
          <el-table-column label="年龄" width="70">
            <template #default="{ row }">{{ row.user?.profile?.birthday ? Math.floor((Date.now() - new Date(row.user.profile.birthday).getTime()) / 31557600000) : '-' }}</template>
          </el-table-column>
          <el-table-column label="学校" width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.user?.profile?.school || '-' }}</template>
          </el-table-column>
          <el-table-column prop="bio" label="简介" min-width="200" show-overflow-tooltip />
          <el-table-column prop="auditStatus" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.auditStatus === 'approved' ? 'success' : row.auditStatus === 'rejected' ? 'danger' : 'warning'" size="small">
                {{ row.auditStatus === 'approved' ? '已通过' : row.auditStatus === 'rejected' ? '已拒绝' : '待审核' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="提交时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <template v-if="row.auditStatus === 'pending'">
                <el-button size="small" type="success" link @click="auditProfile(row.id, 'approved')">通过</el-button>
                <el-button size="small" type="danger" link @click="auditProfile(row.id, 'rejected')">拒绝</el-button>
              </template>
              <span v-else class="text-muted">已处理</span>
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
          <el-button @click="loadMatches" :loading="matchLoading">刷新</el-button>
        </div>
        <el-table :data="matches" v-loading="matchLoading" stripe>
          <el-table-column prop="user.nickname" label="用户A" width="120">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="target.nickname" label="用户B" width="120">
            <template #default="{ row }">{{ row.target?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'matched' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="匹配时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="matchPage" v-model:page-size="matchPageSize" :total="matchTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadMatches" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="套餐管理" name="packages">
        <div class="tab-toolbar">
          <el-button type="primary" @click="openPackageDialog()">新增套餐</el-button>
          <el-button @click="loadPackages" :loading="pkgLoading">刷新</el-button>
        </div>
        <el-table :data="packages" v-loading="pkgLoading" stripe>
          <el-table-column prop="name" label="套餐名称" width="150" />
          <el-table-column prop="price" label="价格" width="100">
            <template #default="{ row }">¥{{ row.price }}</template>
          </el-table-column>
          <el-table-column prop="validDays" label="时长(天)" width="100" />
          <el-table-column prop="matchCount" label="匹配次数" width="100" />
          <el-table-column prop="description" label="权益说明" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="openPackageDialog(row)">编辑</el-button>
              <el-popconfirm title="确定删除此套餐？" @confirm="deletePackage(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="订单退款" name="orders">
        <div class="tab-toolbar">
          <el-button @click="loadOrders" :loading="orderLoading">刷新</el-button>
        </div>
        <el-table :data="orders" v-loading="orderLoading" stripe>
          <el-table-column prop="orderNo" label="订单号" width="180" />
          <el-table-column prop="User.nickname" label="用户" width="120">
            <template #default="{ row }">{{ row.User?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="package.name" label="套餐" width="120">
            <template #default="{ row }">{{ row.package?.name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="amount" label="金额" width="100">
            <template #default="{ row }">¥{{ row.amount }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'paid' ? 'success' : row.status === 'refunded' ? 'danger' : 'warning'" size="small">
                {{ row.status === 'paid' ? '已支付' : row.status === 'refunded' ? '已退款' : row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="下单时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-popconfirm v-if="row.status === 'paid'" title="确定退款？此操作不可撤销！" @confirm="refundOrder(row.id)">
                <template #reference><el-button size="small" type="danger" link>退款</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="orderPage" v-model:page-size="orderPageSize" :total="orderTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadOrders" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="举报处理" name="reports">
        <div class="tab-toolbar">
          <el-select v-model="reportFilters.status" clearable placeholder="状态" style="width:140px" @change="loadReports">
            <el-option label="待处理" value="pending" />
            <el-option label="已处理" value="resolved" />
            <el-option label="已忽略" value="rejected" />
          </el-select>
          <el-button @click="loadReports" :loading="reportLoading">刷新</el-button>
        </div>
        <el-table :data="reports" v-loading="reportLoading" stripe>
          <el-table-column prop="reporter.nickname" label="举报人" width="120">
            <template #default="{ row }">{{ row.reporter?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="target.nickname" label="举报对象" width="120">
            <template #default="{ row }">{{ row.target?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="举报原因" min-width="200" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'pending' ? 'warning' : 'success'" size="small">
                {{ reportStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="举报时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'pending'" size="small" type="primary" link @click="handleReport(row)">处理</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="reportPage" v-model:page-size="reportPageSize" :total="reportTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadReports" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="缓存管理" name="cache">
        <div class="tab-toolbar">
          <el-button type="warning" @click="clearCache">清理缓存</el-button>
          <el-button @click="loadCache" :loading="cacheLoading">刷新</el-button>
        </div>
        <el-descriptions :column="2" border v-loading="cacheLoading">
          <el-descriptions-item label="缓存状态">{{ cacheInfo.status || '-' }}</el-descriptions-item>
          <el-descriptions-item label="缓存数量">{{ cacheInfo.count ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="最后更新">{{ formatDate(cacheInfo.lastUpdated) }}</el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showConfigDialog" title="编辑配置" width="500px" destroy-on-close>
      <el-form :model="configForm" label-width="120px">
        <el-form-item label="启用状态"><el-switch v-model="configForm.isOpen" /></el-form-item>
        <el-form-item label="价格"><el-input-number v-model="configForm.price" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="每日匹配上限"><el-input-number v-model="configForm.dailyMatchLimit" :min="1" /></el-form-item>
        <el-form-item label="需要审核"><el-switch v-model="configForm.requireAudit" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="saveConfig" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showPackageDialog" :title="editingPkg ? '编辑套餐' : '新增套餐'" width="500px" destroy-on-close>
      <el-form :model="pkgForm" label-width="100px">
        <el-form-item label="套餐名称" required><el-input v-model="pkgForm.name" /></el-form-item>
        <el-form-item label="价格" required><el-input-number v-model="pkgForm.price" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="时长(天)" required><el-input-number v-model="pkgForm.validDays" :min="1" /></el-form-item>
        <el-form-item label="匹配次数"><el-input-number v-model="pkgForm.matchCount" :min="0" /></el-form-item>
        <el-form-item label="权益说明"><el-input v-model="pkgForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPackageDialog = false">取消</el-button>
        <el-button type="primary" @click="savePackage" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const activeTab = ref('configs')
const saving = ref(false)
const formatDate = (d: string) => d ? new Date(d).toLocaleString('zh-CN') : '-'

// configs
const configs = ref<any[]>([])
const configLoading = ref(false)
const showConfigDialog = ref(false)
const configForm = reactive({ id: '', isOpen: true, price: 0, dailyMatchLimit: 10, requireAudit: true })

// profiles
const profiles = ref<any[]>([])
const profileLoading = ref(false)
const profilePage = ref(1)
const profilePageSize = ref(20)
const profileTotal = ref(0)
const profileFilters = reactive({ auditStatus: '' })

// matches
const matches = ref<any[]>([])
const matchLoading = ref(false)
const matchPage = ref(1)
const matchPageSize = ref(20)
const matchTotal = ref(0)

// packages
const packages = ref<any[]>([])
const pkgLoading = ref(false)
const showPackageDialog = ref(false)
const editingPkg = ref<any>(null)
const pkgForm = reactive({ name: '', price: 0, validDays: 30, matchCount: 0, description: '' })

// orders
const orders = ref<any[]>([])
const orderLoading = ref(false)
const orderPage = ref(1)
const orderPageSize = ref(20)
const orderTotal = ref(0)

// reports
const reports = ref<any[]>([])
const reportLoading = ref(false)
const reportPage = ref(1)
const reportPageSize = ref(20)
const reportTotal = ref(0)
const reportFilters = reactive({ status: '' })

// cache
const cacheInfo = ref<any>({})
const cacheLoading = ref(false)

async function loadConfigs() {
  configLoading.value = true
  try {
    const res: any = await request.get('/admin/dating/configs')
    configs.value = Array.isArray(res) ? res : res.list || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); configs.value = [] }
  finally { configLoading.value = false }
}

function editConfig(row: any) {
  Object.assign(configForm, { id: row.id, isOpen: row.isOpen, price: row.price || 0, dailyMatchLimit: row.dailyMatchLimit || 10, requireAudit: row.requireAudit ?? true })
  showConfigDialog.value = true
}

async function saveConfig() {
  saving.value = true
  try {
    const payload = {
      isOpen: configForm.isOpen,
      price: configForm.price,
      dailyMatchLimit: configForm.dailyMatchLimit,
      requireAudit: configForm.requireAudit,
    }
    await request.put(`/admin/dating/configs/${configForm.id}`, payload)
    ElMessage.success('保存成功')
    showConfigDialog.value = false
    loadConfigs()
  } catch (e: any) { ElMessage.error(e?.message || '保存失败') }
  finally { saving.value = false }
}

async function loadProfiles() {
  profileLoading.value = true
  try {
    const params = { page: profilePage.value, pageSize: profilePageSize.value, ...profileFilters }
    const res: any = await request.get('/admin/dating/profiles', { params })
    profiles.value = res.list || res.data?.list || []
    profileTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); profiles.value = [] }
  finally { profileLoading.value = false }
}

async function auditProfile(id: string, status: string) {
  try {
    await request.put(`/admin/dating/profiles/${id}/audit`, { auditStatus: status })
    ElMessage.success('审核成功')
    loadProfiles()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadMatches() {
  matchLoading.value = true
  try {
    const params = { page: matchPage.value, pageSize: matchPageSize.value }
    const res: any = await request.get('/admin/dating/matches', { params })
    matches.value = res.list || res.data?.list || []
    matchTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); matches.value = [] }
  finally { matchLoading.value = false }
}

async function loadPackages() {
  pkgLoading.value = true
  try {
    const res: any = await request.get('/admin/dating/packages')
    packages.value = Array.isArray(res) ? res : res.list || []
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); packages.value = [] }
  finally { pkgLoading.value = false }
}

function openPackageDialog(row?: any) {
  editingPkg.value = row || null
  if (row) {
    Object.assign(pkgForm, { name: row.name, price: Number(row.price), validDays: row.validDays, matchCount: row.matchCount || 0, description: row.description || '' })
  } else {
    Object.assign(pkgForm, { name: '', price: 0, validDays: 30, matchCount: 0, description: '' })
  }
  showPackageDialog.value = true
}

async function savePackage() {
  saving.value = true
  try {
    const payload = {
      name: pkgForm.name,
      price: pkgForm.price,
      validDays: pkgForm.validDays,
      matchCount: pkgForm.matchCount,
      description: pkgForm.description || undefined,
    }
    if (editingPkg.value) {
      await request.put(`/admin/dating/packages/${editingPkg.value.id}`, payload)
    } else {
      await request.post('/admin/dating/packages', payload)
    }
    ElMessage.success('保存成功')
    showPackageDialog.value = false
    loadPackages()
  } catch (e: any) { ElMessage.error(e?.message || '保存失败') }
  finally { saving.value = false }
}

async function deletePackage(id: string) {
  try {
    await request.delete(`/admin/dating/packages/${id}`)
    ElMessage.success('已删除')
    loadPackages()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadOrders() {
  orderLoading.value = true
  try {
    const params = { page: orderPage.value, pageSize: orderPageSize.value }
    const res: any = await request.get('/admin/dating/orders', { params })
    orders.value = res.list || res.data?.list || []
    orderTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); orders.value = [] }
  finally { orderLoading.value = false }
}

async function refundOrder(id: string) {
  try {
    await request.post(`/admin/dating/orders/${id}/refund`)
    ElMessage.success('退款成功')
    loadOrders()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadReports() {
  reportLoading.value = true
  try {
    const params = { page: reportPage.value, pageSize: reportPageSize.value, ...reportFilters }
    const res: any = await request.get('/admin/dating/reports', { params })
    reports.value = res.list || res.data?.list || []
    reportTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); reports.value = [] }
  finally { reportLoading.value = false }
}

async function handleReport(row: any) {
  try {
    await ElMessageBox.confirm('确定已处理此举报？', '处理举报')
    await request.post(`/admin/dating/reports/${row.id}/handle`, { status: 'resolved', result: '后台已处理' })
    ElMessage.success('已处理')
    loadReports()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

function reportStatusText(status: string) {
  if (status === 'pending') return '待处理'
  if (status === 'rejected') return '已忽略'
  return '已处理'
}

async function loadCache() {
  cacheLoading.value = true
  try {
    const res: any = await request.get('/admin/dating/cache')
    cacheInfo.value = res || {}
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); cacheInfo.value = {} }
  finally { cacheLoading.value = false }
}

async function clearCache() {
  try {
    await ElMessageBox.confirm('确定清理缓存？', '清理缓存')
    await request.post('/admin/dating/cache/clear')
    ElMessage.success('缓存已清理')
    loadCache()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.message || '操作失败') }
}

function handleTabChange() {
  const loaders: Record<string, () => void> = {
    configs: loadConfigs, profiles: loadProfiles, matches: loadMatches,
    packages: loadPackages, orders: loadOrders, reports: loadReports, cache: loadCache,
  }
  loaders[activeTab.value]?.()
}

onMounted(() => { loadConfigs() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
.text-muted { color: #999; font-size: 12px; }
</style>
