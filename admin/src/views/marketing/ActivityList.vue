<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 活动</p>
        <h2>活动管理</h2>
        <p>管理小程序活动报名、费用、封面、参与用户、活动订单和票种数据。</p>
      </div>
      <el-button v-if="hasEditPermission" type="primary" @click="openCreate">创建活动</el-button>
    </div>

    <div class="filter-card">
      <el-input v-model="filters.keyword" clearable placeholder="搜索活动名称" @keyup.enter="loadActivities" />
      <el-select v-model="filters.status" clearable placeholder="状态">
        <el-option label="未开始" value="upcoming" />
        <el-option label="报名中" value="signup" />
        <el-option label="进行中" value="ongoing" />
        <el-option label="已结束" value="ended" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
      <el-button type="primary" @click="loadActivities">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="data-card">
      <el-table :data="activities" v-loading="loading" empty-text="暂无真实活动数据">
        <el-table-column label="活动" min-width="260">
          <template #default="{ row }">
            <div class="media-cell">
              <el-image v-if="row.cover" :src="row.cover" fit="cover" class="thumb" />
              <div v-else class="thumb placeholder">活</div>
              <div>
                <strong>{{ row.title }}</strong>
                <p>{{ row.region?.name || row.location || '未设置区域/地点' }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="费用" width="100">
          <template #default="{ row }">{{ formatMoney(row.fee) }}</template>
        </el-table-column>
        <el-table-column label="参与/订单/票种" width="150">
          <template #default="{ row }">{{ row.joinCount || row._count?.joins || 0 }} / {{ row._count?.orders || 0 }} / {{ row._count?.packages || row.packages?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="人数上限" width="100">
          <template #default="{ row }">{{ row.joinCount || row._count?.joins || 0 }} / {{ row.maxPeople || '不限' }}</template>
        </el-table-column>
        <el-table-column label="活动时间" min-width="240">
          <template #default="{ row }">{{ formatTime(row.startAt) }} 至 {{ formatTime(row.endAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="270" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openActivityDetail(row)">详情</el-button>
            <el-button size="small" @click="openActivityUsers(row)">参与</el-button>
            <el-button v-if="hasEditPermission" size="small" @click="editActivity(row)">编辑</el-button>
            <el-button size="small" @click="openActivityOrders(row)">订单</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadActivities"
          @size-change="loadActivities"
        />
      </div>
    </div>

    <el-dialog v-model="showDialog" :title="editingActivity ? '编辑活动' : '创建活动'" width="980px">
      <el-form :model="form" label-width="100px">
        <el-tabs v-model="formTab">
          <el-tab-pane label="基础信息" name="base">
            <el-form-item label="活动名称" required>
              <el-input v-model="form.title" placeholder="活动名称" />
            </el-form-item>
            <el-form-item label="封面图">
              <ImageUploadBox v-model="form.cover" scene="activity-cover" shape="wide" placeholder="上传活动封面" tip="建议 750x350px，可替换和删除" :max-size="5" />
            </el-form-item>
            <div class="dialog-grid">
              <el-form-item label="地点">
                <el-input v-model="form.location" placeholder="活动地点" />
              </el-form-item>
              <el-form-item label="状态">
                <el-select v-model="form.status" style="width: 100%">
                  <el-option label="未开始" value="upcoming" />
                  <el-option label="报名中" value="signup" />
                  <el-option label="进行中" value="ongoing" />
                  <el-option label="已结束" value="ended" />
                  <el-option label="已取消" value="cancelled" />
                </el-select>
              </el-form-item>
              <el-form-item label="负责人">
                <el-input v-model="form.organizer" placeholder="活动负责人或组织方" />
              </el-form-item>
              <el-form-item label="联系方式">
                <el-input v-model="form.contact" placeholder="电话、微信或群号" />
              </el-form-item>
              <el-form-item label="可见范围">
                <el-select v-model="form.visibility" style="width: 100%">
                  <el-option label="公开展示" value="public" />
                  <el-option label="仅后台维护" value="private" />
                </el-select>
              </el-form-item>
              <el-form-item label="最大人数">
                <el-input-number v-model="form.maxPeople" :min="0" />
              </el-form-item>
            </div>
            <el-form-item label="活动时间" required>
              <el-date-picker
                v-model="form.dateRange"
                type="datetimerange"
                range-separator="至"
                start-placeholder="开始"
                end-placeholder="结束"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="活动描述">
              <el-input v-model="form.description" type="textarea" :rows="5" placeholder="活动介绍、报名须知、集合方式、奖品说明等" />
            </el-form-item>
          </el-tab-pane>

          <el-tab-pane label="报名规则" name="rule">
            <div class="dialog-grid">
              <el-form-item label="基础费用">
                <el-input-number v-model="form.fee" :min="0" :precision="2" />
              </el-form-item>
              <el-form-item label="报名模式">
                <el-select v-model="form.registrationMode" style="width: 100%">
                  <el-option label="直接报名" value="direct" />
                  <el-option label="按票种报名" value="ticket" />
                </el-select>
              </el-form-item>
            </div>
            <div class="rule-hints">
              <div>
                <strong>直接报名</strong>
                <p>适合免费活动，或只有一个固定费用的活动。</p>
              </div>
              <div>
                <strong>按票种报名</strong>
                <p>适合早鸟票、普通票、双人票、团体票等需要库存和限购的活动。</p>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="票种套餐" name="packages">
            <div class="package-toolbar">
              <span>可配置多个票种，用户报名时按票种下单。</span>
              <el-button size="small" type="primary" @click="addPackage">添加票种</el-button>
            </div>
            <div class="package-list">
              <div v-for="(item, index) in form.packages" :key="item.localId" class="package-editor">
                <div class="package-editor-head">
                  <strong>票种 {{ index + 1 }}</strong>
                  <el-button size="small" type="danger" text @click="removePackage(index)">删除</el-button>
                </div>
                <div class="package-grid">
                  <el-form-item label="票种名称">
                    <el-input v-model="item.name" placeholder="例如：早鸟票/普通票/双人票" />
                  </el-form-item>
                  <el-form-item label="票种类型">
                    <el-select v-model="item.ticketType" style="width: 100%">
                      <el-option label="单人票" value="single" />
                      <el-option label="双人票" value="double" />
                      <el-option label="团体票" value="group" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="售价">
                    <el-input-number v-model="item.price" :min="0" :precision="2" />
                  </el-form-item>
                  <el-form-item label="原价">
                    <el-input-number v-model="item.originalPrice" :min="0" :precision="2" />
                  </el-form-item>
                  <el-form-item label="总库存">
                    <el-input-number v-model="item.stock" :min="0" />
                  </el-form-item>
                  <el-form-item label="可售余票">
                    <el-input-number v-model="item.availableTickets" :min="0" />
                  </el-form-item>
                  <el-form-item label="单次限购">
                    <el-input-number v-model="item.limitPerUser" :min="1" />
                  </el-form-item>
                  <el-form-item label="状态">
                    <el-switch v-model="item.isActive" active-text="启用" inactive-text="停用" />
                  </el-form-item>
                </div>
                <el-form-item label="说明">
                  <el-input v-model="item.description" type="textarea" :rows="2" placeholder="票种权益、适用人群或注意事项" />
                </el-form-item>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submitActivity" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="showDetailDrawer"
      :title="selectedActivity?.title || '活动运营详情'"
      size="min(1120px, 92vw)"
      class="activity-detail-drawer"
    >
      <template v-if="selectedActivity">
        <el-tabs v-model="detailTab" @tab-change="handleDetailTabChange">
          <el-tab-pane label="活动概览" name="overview">
            <div class="overview-grid">
              <section class="overview-main">
                <div class="activity-profile">
                  <el-image v-if="selectedActivity.cover" :src="selectedActivity.cover" fit="cover" class="profile-cover" />
                  <div v-else class="profile-cover profile-placeholder">活</div>
                  <div class="profile-content">
                    <div class="profile-title-row">
                      <h3>{{ selectedActivity.title }}</h3>
                      <el-tag :type="statusType(selectedActivity.status)" size="small">{{ statusLabel(selectedActivity.status) }}</el-tag>
                    </div>
                    <p>{{ selectedActivity.description || '暂无活动介绍' }}</p>
                    <div class="profile-meta">
                      <span>{{ selectedActivity.region?.name || selectedActivity.location || '全局活动' }}</span>
                      <span>{{ formatTime(selectedActivity.startAt) }} 至 {{ formatTime(selectedActivity.endAt) }}</span>
                    </div>
                  </div>
                </div>

                <div class="metric-grid">
                  <div class="metric-card">
                    <span>参与用户</span>
                    <strong>{{ overviewMetrics.joinCount }}</strong>
                    <p>{{ selectedActivity.maxPeople ? `上限 ${selectedActivity.maxPeople} 人` : '不限制人数' }}</p>
                  </div>
                  <div class="metric-card">
                    <span>活动订单</span>
                    <strong>{{ overviewMetrics.orderCount }}</strong>
                    <p>已拉取 {{ activityOrders.length }} 条近期订单</p>
                  </div>
                  <div class="metric-card">
                    <span>实收金额</span>
                    <strong>{{ formatMoney(overviewMetrics.paidAmount) }}</strong>
                    <p>待支付 {{ overviewMetrics.pendingOrders }} 单</p>
                  </div>
                  <div class="metric-card">
                    <span>票种数量</span>
                    <strong>{{ overviewMetrics.packageCount }}</strong>
                    <p>{{ overviewMetrics.totalTickets > 0 ? `余票 ${overviewMetrics.availableTickets}` : '未配置票种' }}</p>
                  </div>
                </div>

                <div class="progress-panel">
                  <div class="panel-title">
                    <h3>报名进度</h3>
                    <span>{{ overviewMetrics.capacityLabel }}</span>
                  </div>
                  <el-progress :percentage="overviewMetrics.joinPercent" :status="overviewMetrics.joinPercent >= 90 ? 'exception' : undefined" />
                  <div class="progress-meta">
                    <span>已报名 {{ overviewMetrics.joinCount }} 人</span>
                    <span>{{ overviewMetrics.remainingLabel }}</span>
                  </div>
                </div>

                <div class="sub-section">
                  <div class="panel-title">
                    <h3>票种/套餐运营</h3>
                    <span>{{ overviewMetrics.packageCount ? '按票种售卖' : '按活动费用报名' }}</span>
                  </div>
                  <el-table :data="selectedActivity.packages || []" empty-text="未配置票种，按活动费用报名">
                    <el-table-column prop="name" label="名称" min-width="160" />
                    <el-table-column label="价格" width="120">
                      <template #default="{ row }">{{ formatMoney(row.price) }}</template>
                    </el-table-column>
                    <el-table-column label="余票" width="110">
                      <template #default="{ row }">{{ ticketValue(row.availableTickets) }}</template>
                    </el-table-column>
                    <el-table-column label="库存状态" width="120">
                      <template #default="{ row }">
                        <el-tag :type="ticketStatus(row).type" size="small">{{ ticketStatus(row).label }}</el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column prop="limitPerUser" label="单次限购" width="100" />
                  </el-table>
                </div>
              </section>

              <aside class="overview-side">
                <div class="side-panel">
                  <div class="panel-title">
                    <h3>运营提醒</h3>
                    <span>{{ operationAlerts.length }} 项</span>
                  </div>
                  <div class="alert-list">
                    <div v-for="item in operationAlerts" :key="item.title" class="alert-item" :class="item.level">
                      <strong>{{ item.title }}</strong>
                      <p>{{ item.text }}</p>
                    </div>
                  </div>
                </div>

                <div class="side-panel">
                  <div class="panel-title">
                    <h3>活动节点</h3>
                    <span>{{ overviewMetrics.timeStatus }}</span>
                  </div>
                  <el-timeline>
                    <el-timeline-item :timestamp="formatTime(selectedActivity.startAt)" :type="overviewMetrics.hasStarted ? 'success' : 'primary'">
                      开始时间
                    </el-timeline-item>
                    <el-timeline-item :timestamp="formatTime(selectedActivity.endAt)" :type="overviewMetrics.hasEnded ? 'success' : 'warning'">
                      结束时间
                    </el-timeline-item>
                  </el-timeline>
                </div>

                <div class="side-panel">
                  <div class="panel-title">
                    <h3>建议动作</h3>
                    <span>运营闭环</span>
                  </div>
                  <div class="action-list">
                    <el-button size="small" @click="editActivity(selectedActivity)">编辑活动</el-button>
                    <el-button size="small" @click="detailTab = 'users'; loadActivityUsers()">查看参与用户</el-button>
                    <el-button size="small" @click="detailTab = 'orders'; loadActivityOrders()">查看订单</el-button>
                    <el-button size="small" @click="$router.push(`/order/center?orderType=activity&businessId=${selectedActivity.id}`)">统一订单中心</el-button>
                  </div>
                </div>
              </aside>
            </div>
          </el-tab-pane>
          <el-tab-pane label="参与用户" name="users">
            <el-table :data="activityUsers" v-loading="usersLoading" empty-text="暂无参与用户">
              <el-table-column label="用户" min-width="180">
                <template #default="{ row }">
                  <div class="user-cell">
                    <el-avatar :size="32" :src="row.user?.avatar">{{ row.user?.nickname?.slice(0, 1) || '用' }}</el-avatar>
                    <span>{{ row.user?.nickname || '-' }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="100" />
              <el-table-column label="报名时间" width="180">
                <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="活动订单" name="orders">
            <el-table :data="activityOrders" v-loading="ordersLoading" empty-text="暂无活动订单">
              <el-table-column prop="orderNo" label="订单号" min-width="180" />
              <el-table-column label="用户" width="130">
                <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
              </el-table-column>
              <el-table-column label="票种" width="130">
                <template #default="{ row }">{{ row.package?.name || '活动报名' }}</template>
              </el-table-column>
              <el-table-column prop="quantity" label="数量" width="80" />
              <el-table-column label="金额" width="100">
                <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
              </el-table-column>
              <el-table-column prop="payStatus" label="支付" width="100" />
              <el-table-column prop="orderStatus" label="订单" width="100" />
              <el-table-column label="票据" width="80">
                <template #default="{ row }">{{ row.tickets?.length || 0 }}</template>
              </el-table-column>
              <el-table-column label="下单时间" width="180">
                <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
              </el-table-column>
            </el-table>
            <div class="drawer-actions">
              <el-button @click="$router.push(`/order/center?orderType=activity&businessId=${selectedActivity.id}`)">去统一订单中心</el-button>
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import { request } from '@/api/request'
import { cleanPayload, dateRangeFrom, errorMessage, formatMoney, formatTime, unwrapPage } from './utils'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('activity:view') || auth.permissions.includes('activity:edit'))
const loading = ref(false)
const submitting = ref(false)
const showDialog = ref(false)
const showDetailDrawer = ref(false)
const formTab = ref('base')
const editingActivity = ref<any>(null)
const selectedActivity = ref<any>(null)
const detailTab = ref('overview')
const activities = ref<any[]>([])
const activityOrders = ref<any[]>([])
const activityUsers = ref<any[]>([])
const ordersLoading = ref(false)
const usersLoading = ref(false)
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const filters = reactive({ keyword: '', status: '' })
let packageLocalId = 0

const form = reactive({
  title: '',
  description: '',
  cover: '',
  location: '',
  organizer: '',
  contact: '',
  visibility: 'public',
  status: 'upcoming',
  dateRange: null as any,
  maxPeople: 0,
  fee: 0,
  registrationMode: 'direct',
  packages: [] as any[],
})

function statusType(status: string) {
  const map: Record<string, string> = { upcoming: 'info', signup: 'warning', ongoing: 'success', ended: '', cancelled: 'danger' }
  return map[status] || ''
}

function statusLabel(status: string) {
  const map: Record<string, string> = { upcoming: '未开始', signup: '报名中', ongoing: '进行中', ended: '已结束', cancelled: '已取消' }
  return map[status] || status || '-'
}

function toNumber(value: any, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function getJoinCount(activity: any) {
  return toNumber(activity?.joinCount ?? activity?._count?.joins ?? activity?._count?.participants ?? 0)
}

function getOrderCount(activity: any) {
  return toNumber(activity?._count?.orders ?? activity?.orderCount ?? activityOrders.value.length)
}

function isPaidOrder(order: any) {
  const payStatus = String(order?.payStatus || order?.paymentStatus || order?.status || '').toLowerCase()
  return ['paid', 'success', 'completed', 'finished'].includes(payStatus)
}

function isPendingOrder(order: any) {
  const payStatus = String(order?.payStatus || order?.paymentStatus || order?.status || '').toLowerCase()
  return ['pending', 'unpaid', 'wait_pay', 'created'].includes(payStatus)
}

function ticketValue(value: any) {
  const num = toNumber(value)
  return num > 0 ? num : '不限'
}

function ticketStatus(row: any) {
  const available = toNumber(row?.availableTickets)
  if (!row?.availableTickets && row?.availableTickets !== 0) return { label: '不限量', type: 'info' }
  if (available <= 0) return { label: '已售罄', type: 'danger' }
  if (available <= 10) return { label: '库存紧张', type: 'warning' }
  return { label: '库存充足', type: 'success' }
}

const overviewMetrics = computed(() => {
  const activity = selectedActivity.value || {}
  const packages = Array.isArray(activity.packages) ? activity.packages : []
  const joinCount = getJoinCount(activity)
  const maxPeople = toNumber(activity.maxPeople)
  const orderCount = Math.max(getOrderCount(activity), activityOrders.value.length)
  const paidAmount = activityOrders.value
    .filter(isPaidOrder)
    .reduce((sum, order) => sum + toNumber(order.amount ?? order.totalAmount ?? order.payAmount), 0)
  const pendingOrders = activityOrders.value.filter(isPendingOrder).length
  const totalTickets = packages.reduce((sum: number, item: any) => sum + toNumber(item.totalTickets ?? item.stock ?? item.availableTickets), 0)
  const availableTickets = packages.reduce((sum: number, item: any) => sum + toNumber(item.availableTickets), 0)
  const joinPercent = maxPeople > 0 ? Math.min(100, Math.round((joinCount / maxPeople) * 100)) : 0
  const now = Date.now()
  const start = activity.startAt ? new Date(activity.startAt).getTime() : 0
  const end = activity.endAt ? new Date(activity.endAt).getTime() : 0
  const hasStarted = start > 0 && now >= start
  const hasEnded = end > 0 && now >= end
  const timeStatus = hasEnded ? '已结束' : hasStarted ? '进行中' : '未开始'

  return {
    joinCount,
    maxPeople,
    orderCount,
    paidAmount,
    pendingOrders,
    packageCount: packages.length,
    totalTickets,
    availableTickets,
    joinPercent,
    hasStarted,
    hasEnded,
    timeStatus,
    capacityLabel: maxPeople > 0 ? `${joinPercent}%` : '不限人数',
    remainingLabel: maxPeople > 0 ? `剩余 ${Math.max(maxPeople - joinCount, 0)} 个名额` : '不限制报名名额',
  }
})

const operationAlerts = computed(() => {
  const activity = selectedActivity.value || {}
  const metrics = overviewMetrics.value
  const alerts: Array<{ title: string; text: string; level: string }> = []

  if (!activity.cover) {
    alerts.push({ title: '缺少封面', text: '小程序活动卡片展示会变弱，建议补充清晰封面。', level: 'warning' })
  }
  if (!activity.description) {
    alerts.push({ title: '缺少说明', text: '活动规则、报名须知、奖品说明没有填写，容易影响报名转化。', level: 'warning' })
  }
  if (metrics.maxPeople > 0 && metrics.joinPercent >= 90) {
    alerts.push({ title: '名额紧张', text: '报名人数接近上限，请评估是否扩容或关闭报名。', level: 'danger' })
  }
  if (metrics.packageCount > 0 && metrics.availableTickets <= 10) {
    alerts.push({ title: '票种库存低', text: '余票较少，请确认是否需要补票或调整套餐。', level: 'danger' })
  }
  if (metrics.pendingOrders > 0) {
    alerts.push({ title: '存在待支付', text: `当前拉取到 ${metrics.pendingOrders} 个待支付订单，可到订单页继续跟进。`, level: 'info' })
  }
  if (metrics.hasEnded && activity.status !== 'ended') {
    alerts.push({ title: '状态未同步', text: '活动时间已结束，但状态未标记为已结束。', level: 'warning' })
  }
  if (!alerts.length) {
    alerts.push({ title: '状态正常', text: '基础资料、时间和库存暂未发现明显运营风险。', level: 'success' })
  }
  return alerts
})

function resetForm() {
  Object.assign(form, {
    title: '',
    description: '',
    cover: '',
    location: '',
    organizer: '',
    contact: '',
    visibility: 'public',
    status: 'upcoming',
    dateRange: null,
    maxPeople: 0,
    fee: 0,
    registrationMode: 'direct',
    packages: [],
  })
  formTab.value = 'base'
}

function makePackage(item: any = {}) {
  const stock = toNumber(item.stock ?? item.availableTickets)
  return {
    localId: item.id || `new_${++packageLocalId}`,
    id: item.id,
    name: item.name || '',
    ticketType: item.ticketType || 'single',
    price: toNumber(item.price, 0),
    originalPrice: item.originalPrice !== undefined && item.originalPrice !== null ? toNumber(item.originalPrice, 0) : 0,
    stock,
    availableTickets: toNumber(item.availableTickets, stock),
    limitPerUser: toNumber(item.limitPerUser, 1) || 1,
    description: item.description || '',
    isActive: item.isActive !== false,
  }
}

function addPackage() {
  form.registrationMode = 'ticket'
  form.packages.push(makePackage({
    name: form.packages.length ? '' : '普通票',
    price: form.fee,
    stock: form.maxPeople || 0,
    availableTickets: form.maxPeople || 0,
  }))
}

function removePackage(index: number) {
  form.packages.splice(index, 1)
  if (!form.packages.length) form.registrationMode = 'direct'
}

function openCreate() {
  editingActivity.value = null
  resetForm()
  showDialog.value = true
}

async function loadActivities() {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/activities', {
      params: { page: pagination.page, pageSize: pagination.pageSize, ...filters },
    })
    const page = unwrapPage(res)
    activities.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载活动失败'))
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  pagination.page = 1
  loadActivities()
}

function editActivity(activity: any) {
  editingActivity.value = activity
  const packages = Array.isArray(activity.packages) ? activity.packages.map(makePackage) : []
  Object.assign(form, {
    title: activity.title,
    description: activity.description || '',
    cover: activity.cover || '',
    location: activity.location || '',
    organizer: activity.organizer || '',
    contact: activity.contact || '',
    visibility: activity.visibility || 'public',
    status: activity.status || 'upcoming',
    dateRange: dateRangeFrom(activity),
    maxPeople: Number(activity.maxPeople || 0),
    fee: Number(activity.fee || 0),
    registrationMode: packages.length ? 'ticket' : 'direct',
    packages,
  })
  formTab.value = 'base'
  showDialog.value = true
}

function openActivityDetail(activity: any) {
  selectedActivity.value = activity
  detailTab.value = 'overview'
  showDetailDrawer.value = true
  loadActivityUsers()
  loadActivityOrders()
}

async function openActivityUsers(activity: any) {
  selectedActivity.value = activity
  detailTab.value = 'users'
  showDetailDrawer.value = true
  await loadActivityUsers()
}

async function openActivityOrders(activity: any) {
  selectedActivity.value = activity
  detailTab.value = 'orders'
  showDetailDrawer.value = true
  await loadActivityOrders()
}

async function handleDetailTabChange(name: string | number) {
  if (name === 'users') await loadActivityUsers()
  if (name === 'orders') await loadActivityOrders()
}

async function loadActivityUsers() {
  if (!selectedActivity.value?.id) return
  usersLoading.value = true
  try {
    const res = await request.get(`/admin/marketing/activities/${selectedActivity.value.id}/users`, { params: { page: 1, pageSize: 50 } })
    activityUsers.value = unwrapPage(res).list
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载参与用户失败'))
  } finally {
    usersLoading.value = false
  }
}

async function loadActivityOrders() {
  if (!selectedActivity.value?.id) return
  ordersLoading.value = true
  try {
    const res = await request.get(`/admin/marketing/activities/${selectedActivity.value.id}/orders`, { params: { page: 1, pageSize: 50 } })
    activityOrders.value = unwrapPage(res).list
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载活动订单失败'))
  } finally {
    ordersLoading.value = false
  }
}

async function submitActivity() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写活动名称')
    return
  }
  if (!form.dateRange?.[0] || !form.dateRange?.[1]) {
    ElMessage.warning('请选择活动时间')
    return
  }
  if (form.registrationMode === 'ticket') {
    const invalid = form.packages.some((item) => !String(item.name || '').trim())
    if (!form.packages.length || invalid) {
      formTab.value = 'packages'
      ElMessage.warning('请至少配置一个完整票种')
      return
    }
  }
  submitting.value = true
  try {
    const packages = form.registrationMode === 'ticket'
      ? form.packages.map((item, index) => ({
          id: item.id,
          name: String(item.name || '').trim(),
          ticketType: item.ticketType,
          price: item.price,
          originalPrice: item.originalPrice,
          stock: item.stock,
          availableTickets: item.availableTickets,
          limitPerUser: item.limitPerUser,
          description: item.description,
          isActive: item.isActive,
          sortOrder: index,
        }))
      : []
    const payload = cleanPayload({
      title: form.title.trim(),
      description: form.description,
      cover: form.cover,
      location: form.location,
      organizer: form.organizer,
      contact: form.contact,
      visibility: form.visibility,
      status: form.status,
      maxPeople: form.maxPeople,
      fee: form.fee,
      startAt: form.dateRange[0].toISOString(),
      endAt: form.dateRange[1].toISOString(),
      packages,
    })
    if (editingActivity.value) {
      await request.put(`/admin/marketing/activities/${editingActivity.value.id}`, payload)
      ElMessage.success('活动已更新')
    } else {
      await request.post('/admin/marketing/activities', payload)
      ElMessage.success('活动已创建')
    }
    showDialog.value = false
    await loadActivities()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '保存活动失败'))
  } finally {
    submitting.value = false
  }
}

onMounted(loadActivities)
</script>

<style scoped>
.marketing-page { padding: 24px; }
.marketing-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.filter-card,
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 14px; box-shadow: 0 14px 36px rgba(37,99,235,.08); }
.filter-card { display: grid; grid-template-columns: minmax(220px, 1fr) 180px auto auto; gap: 12px; padding: 16px; margin-bottom: 18px; }
.data-card { padding: 18px; }
.media-cell { display: flex; align-items: center; gap: 12px; }
.media-cell strong { color: #0f172a; }
.media-cell p { margin: 4px 0 0; color: #64748b; }
.thumb { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; background: #eff6ff; flex: none; }
.placeholder { display: grid; place-items: center; color: #2563eb; font-weight: 900; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.rule-hints { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px; }
.rule-hints > div { border: 1px solid #e5edf7; border-radius: 10px; background: #f8fafc; padding: 14px; }
.rule-hints strong { color: #0f172a; }
.rule-hints p { margin: 6px 0 0; color: #64748b; line-height: 1.6; }
.package-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; color: #64748b; font-weight: 700; }
.package-list { display: grid; gap: 14px; max-height: 520px; overflow: auto; padding-right: 4px; }
.package-editor { border: 1px solid #dbe7f5; border-radius: 10px; background: #fff; padding: 14px; }
.package-editor-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.package-editor-head strong { color: #0f172a; }
.package-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.overview-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 280px); gap: 16px; align-items: start; }
.overview-main,
.overview-side { display: grid; gap: 16px; min-width: 0; }
.activity-profile,
.progress-panel,
.side-panel { background: #fff; border: 1px solid #e5edf7; border-radius: 10px; padding: 16px; }
.overview-main,
.activity-profile,
.metric-grid,
.side-panel { min-width: 0; }
.activity-profile { display: grid; grid-template-columns: 152px minmax(0, 1fr); gap: 16px; }
.profile-cover { width: 152px; height: 104px; border-radius: 10px; background: #eff6ff; }
.profile-placeholder { display: grid; place-items: center; color: #2563eb; font-size: 28px; font-weight: 900; }
.profile-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.profile-content h3 { margin: 0; font-size: 20px; color: #0f172a; }
.profile-content p { margin: 10px 0; color: #475569; line-height: 1.7; }
.profile-meta { display: flex; flex-wrap: wrap; gap: 8px; color: #64748b; font-size: 13px; }
.profile-meta span { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 999px; padding: 4px 10px; }
.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.metric-card { background: #fff; border: 1px solid #e5edf7; border-radius: 10px; padding: 14px; }
.metric-card span { color: #64748b; font-size: 13px; font-weight: 700; }
.metric-card strong { display: block; margin-top: 8px; color: #0f172a; font-size: 24px; line-height: 1; }
.metric-card p { margin: 8px 0 0; color: #94a3b8; font-size: 12px; }
.panel-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.panel-title h3 { margin: 0; font-size: 16px; color: #0f172a; }
.panel-title span { color: #64748b; font-size: 12px; font-weight: 700; }
.progress-meta { display: flex; justify-content: space-between; margin-top: 10px; color: #64748b; font-size: 13px; }
.alert-list,
.action-list { display: grid; gap: 10px; }
.alert-item { border-radius: 10px; border: 1px solid #e2e8f0; background: #f8fafc; padding: 10px 12px; }
.alert-item strong { display: block; color: #0f172a; font-size: 13px; }
.alert-item p { margin: 4px 0 0; color: #64748b; font-size: 12px; line-height: 1.6; }
.alert-item.warning { border-color: #fde68a; background: #fffbeb; }
.alert-item.danger { border-color: #fecaca; background: #fef2f2; }
.alert-item.success { border-color: #bbf7d0; background: #f0fdf4; }
.alert-item.info { border-color: #bfdbfe; background: #eff6ff; }
.action-list :deep(.el-button) { width: 100%; min-height: 32px; margin-left: 0; justify-content: flex-start; white-space: normal; }
.sub-section { margin-top: 20px; }
.sub-section h3 { margin: 0 0 12px; font-size: 16px; color: #0f172a; }
.user-cell { display: flex; align-items: center; gap: 10px; }
.drawer-actions { display: flex; justify-content: flex-end; margin-top: 16px; }
:deep(.activity-detail-drawer .el-drawer__body) { overflow-x: hidden; }
@media (max-width: 1100px) {
  .filter-card { grid-template-columns: 1fr; }
  .dialog-grid,
  .rule-hints,
  .package-grid { grid-template-columns: 1fr; }
  .overview-grid,
  .activity-profile,
  .metric-grid { grid-template-columns: 1fr; }
  .profile-cover { width: 100%; height: 180px; }
}
</style>
