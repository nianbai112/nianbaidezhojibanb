<template>
  <div class="page-shell">
    <PageHeader
      title="配送店员与调度"
      subtitle="查看小店自配送状态、在岗店员、自动调度规则和订单分配情况"
      icon="Van"
    />

    <el-alert
      title="配送店员由店主在校园伙伴端按手机号邀请；运营后台只做监管，不代替店员接受邀请。"
      type="info"
      :closable="false"
      show-icon
      class="boundary-alert"
    />

    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索小店/店员/手机号"
        clearable
        style="width: 240px"
        @keyup.enter="searchAll"
        @clear="searchAll"
      />
      <el-select
        v-model="filters.merchantId"
        placeholder="全部小店"
        clearable
        filterable
        style="width: 220px"
        @change="changeMerchant"
      >
        <el-option
          v-for="merchant in merchants"
          :key="merchant.id"
          :label="merchant.name"
          :value="merchant.id"
        />
      </el-select>
      <el-button type="primary" @click="searchAll">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <span>小店</span>
        <strong>{{ overviewSummary.shops }}</strong>
      </div>
      <div class="summary-card">
        <span>有效店员</span>
        <strong>{{ overviewSummary.activeStaff }}</strong>
      </div>
      <div class="summary-card">
        <span>当前在岗</span>
        <strong>{{ overviewSummary.onDutyStaff }}</strong>
      </div>
      <div class="summary-card" :class="{ warning: taskSummary.exceptions > 0 }">
        <span>调度异常</span>
        <strong>{{ taskSummary.exceptions }}</strong>
      </div>
    </div>

    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-header">
          <div>
            <strong>小店调度规则</strong>
            <small>规则由店主在校园伙伴端设置，后台可实时查看。</small>
          </div>
          <el-button :loading="overviewLoading" @click="loadOverview">刷新</el-button>
        </div>
      </template>
      <el-table :data="visibleOverview" v-loading="overviewLoading" border stripe>
        <el-table-column prop="name" label="小店" min-width="150" />
        <el-table-column prop="regionName" label="区域" width="120">
          <template #default="{ row }">{{ row.regionName || '-' }}</template>
        </el-table-column>
        <el-table-column label="自动调度" width="110">
          <template #default="{ row }">
            <el-tag :type="row.policy?.enabled ? 'success' : 'info'" size="small">
              {{ row.policy?.enabled ? '已开启' : '未开启' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="超时分配" width="110">
          <template #default="{ row }">{{ row.policy?.minutes || 5 }} 分钟</template>
        </el-table-column>
        <el-table-column label="接单时限" width="110">
          <template #default="{ row }">{{ row.policy?.acceptSeconds || 90 }} 秒</template>
        </el-table-column>
        <el-table-column label="店员并发" width="110">
          <template #default="{ row }">{{ row.policy?.maxActiveOrders || 2 }} 单/人</template>
        </el-table-column>
        <el-table-column label="店员" min-width="150">
          <template #default="{ row }">
            {{ row.staffSummary?.active || 0 }} 名有效 ·
            {{ row.staffSummary?.onDuty || 0 }} 名在岗
            <span v-if="row.staffSummary?.invited">· {{ row.staffSummary.invited }} 待确认</span>
          </template>
        </el-table-column>
        <el-table-column prop="activeAssignments" label="进行中任务" width="120" />
      </el-table>
    </el-card>

    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-header">
          <div>
            <strong>配送店员</strong>
            <small>可暂停、恢复或移除异常店员；已取货任务完成前不允许停用。</small>
          </div>
          <div class="inline-filter">
            <el-select v-model="staffFilters.status" placeholder="店员状态" clearable style="width: 130px" @change="loadStaff">
              <el-option label="待确认" value="invited" />
              <el-option label="已启用" value="active" />
              <el-option label="已暂停" value="paused" />
              <el-option label="已移除" value="removed" />
            </el-select>
            <el-select v-model="staffFilters.onDuty" placeholder="在岗状态" clearable style="width: 130px" @change="loadStaff">
              <el-option label="在岗" value="true" />
              <el-option label="离岗" value="false" />
            </el-select>
          </div>
        </div>
      </template>
      <el-table :data="staff" v-loading="staffLoading" border stripe>
        <el-table-column prop="nickname" label="店员" min-width="130">
          <template #default="{ row }">{{ row.nickname || '未设置昵称' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="135" />
        <el-table-column prop="merchantName" label="所属小店" min-width="150" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="staffStatusType(row.status)" size="small">{{ staffStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="在岗" width="90">
          <template #default="{ row }">
            <el-tag :type="row.onDuty ? 'success' : 'info'" size="small">{{ row.onDuty ? '在岗' : '离岗' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="activeAssignments" label="当前任务" width="100" />
        <el-table-column label="接受时间" width="175">
          <template #default="{ row }">{{ formatDate(row.acceptedAt) }}</template>
        </el-table-column>
        <el-table-column v-if="canAuditStaff" label="监管操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'active'" size="small" type="warning" @click="changeStaffStatus(row, 'paused')">暂停</el-button>
            <el-button v-if="row.status === 'paused'" size="small" type="success" @click="changeStaffStatus(row, 'active')">恢复</el-button>
            <el-button v-if="row.status !== 'removed'" size="small" type="danger" @click="changeStaffStatus(row, 'removed')">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="staffPage"
          v-model:page-size="staffPageSize"
          :total="staffTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadStaff"
          @current-change="loadStaff"
        />
      </div>
    </el-card>

    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-header">
          <div>
            <strong>近期配送任务</strong>
            <small>分派来源、当前配送人和超时异常一屏对照。</small>
          </div>
          <el-button :loading="taskLoading" @click="loadTasks">刷新</el-button>
        </div>
      </template>
      <el-table :data="tasks" v-loading="taskLoading" border stripe>
        <el-table-column prop="orderNo" label="订单号" width="190" show-overflow-tooltip />
        <el-table-column prop="merchantName" label="小店" min-width="140" />
        <el-table-column label="订单状态" width="100">
          <template #default="{ row }">{{ orderStatusLabel(row.status) }}</template>
        </el-table-column>
        <el-table-column label="配送人" min-width="150">
          <template #default="{ row }">
            <template v-if="row.deliveryAssignment">
              {{ row.deliveryAssignment.assigneeType === 'owner' ? '店主' : (row.deliveryAssignment.assignee?.nickname || '配送店员') }}
              <small v-if="row.deliveryAssignment.assignee?.phone" class="muted">{{ row.deliveryAssignment.assignee.phone }}</small>
            </template>
            <el-tag v-else type="info" size="small">尚未分配</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="分派方式" width="105">
          <template #default="{ row }">{{ assignmentSourceLabel(row.deliveryAssignment?.source) }}</template>
        </el-table-column>
        <el-table-column label="分派状态" width="115">
          <template #default="{ row }">{{ assignmentStatusLabel(row.deliveryAssignment?.status) }}</template>
        </el-table-column>
        <el-table-column label="尝试次数" width="90">
          <template #default="{ row }">{{ row.deliveryAssignment?.attemptNo || 0 }}</template>
        </el-table-column>
        <el-table-column label="调度异常" min-width="220">
          <template #default="{ row }">
            <div v-if="row.dormDispatchAlert" class="alert-cell">
              <el-tag type="danger" size="small">{{ row.dormDispatchAlert.label }}</el-tag>
              <small>{{ row.dormDispatchAlert.suggestion }}</small>
            </div>
            <el-tag v-else type="success" size="small">正常</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="下单时间" width="175">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openOrderCenter(row)">订单中心</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="taskPage"
          v-model:page-size="taskPageSize"
          :total="taskTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadTasks"
          @current-change="loadTasks"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import {
  getDormShopDeliveryMerchants,
  getDormShopDeliveryStaff,
  getMerchantOrders,
  updateDormShopDeliveryStaffStatus,
} from '@/api/merchant'

const router = useRouter()
const auth = useAuthStore()
const canAuditStaff = computed(
  () => auth.user.role === '超级管理员' || auth.permissions.includes('merchant:audit'),
)

const filters = reactive({ keyword: '', merchantId: '' })
const staffFilters = reactive({ status: '', onDuty: '' })
const merchants = ref<any[]>([])
const overviewLoading = ref(false)
const staffLoading = ref(false)
const taskLoading = ref(false)
const staff = ref<any[]>([])
const tasks = ref<any[]>([])
const staffPage = ref(1)
const staffPageSize = ref(20)
const staffTotal = ref(0)
const taskPage = ref(1)
const taskPageSize = ref(20)
const taskTotal = ref(0)

const visibleOverview = computed(() =>
  filters.merchantId
    ? merchants.value.filter((item) => item.id === filters.merchantId)
    : merchants.value,
)

const overviewSummary = computed(() =>
  visibleOverview.value.reduce(
    (summary, merchant) => ({
      shops: summary.shops + 1,
      activeStaff: summary.activeStaff + Number(merchant.staffSummary?.active || 0),
      onDutyStaff: summary.onDutyStaff + Number(merchant.staffSummary?.onDuty || 0),
    }),
    { shops: 0, activeStaff: 0, onDutyStaff: 0 },
  ),
)

const taskSummary = computed(() => ({
  exceptions: tasks.value.filter((item) => item.dormDispatchAlert).length,
}))

const unwrapPage = (res: any) => res?.data || res || {}
const formatDate = (value: any) => (value ? new Date(value).toLocaleString('zh-CN') : '-')
const staffStatusLabel = (value?: string) => ({ invited: '待确认', active: '已启用', paused: '已暂停', removed: '已移除' }[String(value || '')] || value || '-')
const staffStatusType = (value?: string) => ({ invited: 'warning', active: 'success', paused: 'info', removed: 'danger' }[String(value || '')] || 'info')
const assignmentSourceLabel = (value?: string) => ({ manual: '店主手动', auto: '系统自动' }[String(value || '')] || '未分派')
const assignmentStatusLabel = (value?: string) => ({ pending_accept: '待接单', accepted: '已接单', picked_up: '已取货', delivered: '已送达', cancelled: '已取消' }[String(value || '')] || '未分派')
const orderStatusLabel = (value?: string) => ({ PENDING_PAY: '待付款', PAID: '已支付', SHIPPED: '配送中', DELIVERED: '待确认', COMPLETED: '已完成', CANCELLED: '已取消', REFUNDING: '退款中', REFUNDED: '已退款' }[String(value || '')] || value || '-')

async function loadOverview() {
  overviewLoading.value = true
  try {
    const data = unwrapPage(await getDormShopDeliveryMerchants({
      page: 1,
      pageSize: 100,
      keyword: filters.keyword || undefined,
    }))
    merchants.value = data.list || []
    if (filters.merchantId && !merchants.value.some((item) => item.id === filters.merchantId)) {
      filters.merchantId = ''
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '加载小店调度概览失败')
  } finally {
    overviewLoading.value = false
  }
}

async function loadStaff() {
  staffLoading.value = true
  try {
    const data = unwrapPage(await getDormShopDeliveryStaff({
      page: staffPage.value,
      pageSize: staffPageSize.value,
      keyword: filters.keyword || undefined,
      merchantId: filters.merchantId || undefined,
      status: staffFilters.status || undefined,
      onDuty: staffFilters.onDuty || undefined,
    }))
    staff.value = data.list || []
    staffTotal.value = Number(data.total || 0)
  } catch (error: any) {
    ElMessage.error(error?.message || '加载配送店员失败')
  } finally {
    staffLoading.value = false
  }
}

async function loadTasks() {
  taskLoading.value = true
  try {
    const data = unwrapPage(await getMerchantOrders({
      page: taskPage.value,
      pageSize: taskPageSize.value,
      businessType: 'dorm_shop',
      merchantId: filters.merchantId || undefined,
      keyword: filters.keyword || undefined,
    }))
    tasks.value = data.list || []
    taskTotal.value = Number(data.total || 0)
  } catch (error: any) {
    ElMessage.error(error?.message || '加载小店配送任务失败')
  } finally {
    taskLoading.value = false
  }
}

async function loadAll() {
  await loadOverview()
  await Promise.all([loadStaff(), loadTasks()])
}

function searchAll() {
  staffPage.value = 1
  taskPage.value = 1
  loadAll()
}

function changeMerchant() {
  staffPage.value = 1
  taskPage.value = 1
  Promise.all([loadStaff(), loadTasks()])
}

function resetFilters() {
  Object.assign(filters, { keyword: '', merchantId: '' })
  Object.assign(staffFilters, { status: '', onDuty: '' })
  staffPage.value = 1
  taskPage.value = 1
  loadAll()
}

async function changeStaffStatus(row: any, status: 'active' | 'paused' | 'removed') {
  try {
    let reason = ''
    if (status === 'active') {
      await ElMessageBox.confirm(`确认恢复 ${row.nickname || '该店员'} 的配送资格？`, '恢复配送资格', { type: 'warning' })
    } else {
      const action = status === 'removed' ? '移除' : '暂停'
      const result = await ElMessageBox.prompt(`请填写${action}原因。已取货任务完成前不能执行此操作。`, `${action}配送店员`, {
        type: 'warning',
        inputPattern: /\S+/,
        inputErrorMessage: '请填写原因',
        confirmButtonText: `确认${action}`,
      })
      reason = result.value.trim()
    }
    await updateDormShopDeliveryStaffStatus(row.id, { status, reason })
    ElMessage.success(status === 'active' ? '已恢复配送资格' : status === 'removed' ? '已移除配送店员' : '已暂停配送店员')
    await Promise.all([loadOverview(), loadStaff(), loadTasks()])
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '更新店员状态失败')
  }
}

function openOrderCenter(row: any) {
  router.replace({
    query: {
      ...router.currentRoute.value.query,
      sub: 'orders',
      merchantId: row.merchant?.id || row.merchantId || '',
    },
  })
}

onMounted(loadAll)
</script>

<style scoped>
.page-shell { padding: 24px; }
.boundary-alert { margin: 14px 0; }
.filter-bar { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.summary-card { padding: 16px 18px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; display: flex; flex-direction: column; gap: 6px; }
.summary-card span { color: #6b7280; font-size: 13px; }
.summary-card strong { color: #172033; font-size: 26px; }
.summary-card.warning { border-color: #fecaca; background: #fff7f7; }
.summary-card.warning strong { color: #dc2626; }
.section-card { margin-top: 16px; }
.section-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.section-header > div:first-child { display: flex; flex-direction: column; gap: 4px; }
.section-header small, .muted, .alert-cell small { color: #7b8798; font-size: 12px; }
.inline-filter { display: flex; flex-direction: row !important; gap: 8px !important; }
.alert-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.muted { display: block; margin-top: 3px; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 980px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(140px, 1fr)); }
  .section-header { align-items: flex-start; flex-direction: column; }
}
</style>
