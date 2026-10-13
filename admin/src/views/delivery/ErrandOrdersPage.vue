<template>
  <div class="page-shell errand-orders">
    <PageHeader
      title="跑腿代拿订单"
      subtitle="处理代取快递、代寄快递、外卖代拿和万能任务订单"
      icon="Tickets"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadData">刷新</el-button>
        <el-button type="primary" @click="$router.push('/errand/dashboard')">回到工作台</el-button>
      </template>
    </PageHeader>

    <el-card class="filter-card" shadow="never">
      <el-input v-model="query.keyword" placeholder="订单号 / 标题 / 用户" clearable @keyup.enter="search" />
      <el-select v-model="query.regionId" placeholder="全部区域" clearable filterable>
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-select v-model="query.type" placeholder="服务类型" clearable>
        <el-option v-for="item in errandTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-select v-model="query.status" placeholder="订单状态" clearable>
        <el-option v-for="item in errandStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
      />
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="rows" row-key="id" empty-text="暂无跑腿订单">
        <el-table-column label="订单" min-width="210">
          <template #default="{ row }">
            <div class="order-cell">
              <strong>{{ row.orderNo }}</strong>
              <span>{{ row.title || labelOf(errandTypeOptions, row.type) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="服务" width="120">
          <template #default="{ row }">
            <el-tag>{{ labelOf(errandTypeOptions, row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="32" :src="row.user?.avatar">{{ row.userName?.slice(0, 1) || '用' }}</el-avatar>
              <div>
                <strong>{{ row.userName || '-' }}</strong>
                <span>{{ row.userPhone || row.userId }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="取送信息" min-width="280">
          <template #default="{ row }">
            <div class="address-cell">
              <span>取：{{ row.pickupAddress || '-' }}</span>
              <span>送：{{ row.deliverAddress || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="骑手" min-width="140">
          <template #default="{ row }">
            <span>{{ row.riderName || '未分配' }}</span>
            <small v-if="row.riderPhone">{{ row.riderPhone }}</small>
            <small v-if="row.riderName">{{ riderTypeLabel(row.riderType) }} · {{ displayModeLabel(row.deliveryDisplayMode) }}</small>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110">
          <template #default="{ row }">
            <strong class="money">¥{{ money(row.payAmount || row.amount) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTone(row.status)">{{ labelOf(errandStatusOptions, row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" :disabled="!canAssign(row)" @click="openAssign(row)">派单</el-button>
            <el-button link type="danger" :disabled="!canCancel(row)" @click="cancel(row)">取消</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <span>共 {{ total }} 条</span>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          layout="sizes, prev, pager, next, jumper"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          @change="loadData"
        />
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="跑腿订单详情" size="min(520px, 100vw)">
      <div v-if="detail" class="detail-box">
        <section>
          <h3>{{ detail.title || labelOf(errandTypeOptions, detail.type) }}</h3>
          <el-tag :type="statusTone(detail.status)">{{ labelOf(errandStatusOptions, detail.status) }}</el-tag>
        </section>
        <dl>
          <dt>订单号</dt><dd>{{ detail.orderNo }}</dd>
          <dt>用户</dt><dd>{{ detail.userName || '-' }} {{ detail.userPhone || '' }}</dd>
          <dt>骑手</dt><dd>{{ detail.riderName || '未分配' }} {{ detail.riderPhone || '' }}</dd>
          <dt>骑手类型</dt><dd>{{ detail.riderId ? `${riderTypeLabel(detail.riderType)} / ${displayModeLabel(detail.deliveryDisplayMode)}` : '未分配骑手' }}</dd>
          <dt>订单风险</dt><dd><el-tag :type="openRiskCount ? 'danger' : 'info'">{{ openRiskCount ? `${openRiskCount} 条异常待核查` : '暂无待处理异常' }}</el-tag></dd>
          <dt>骑手风控</dt><dd>{{ detail.riderId ? `${riskLevelLabel(detail.riskLevel)}，违规 ${detail.violationCount || 0} 次` : '未分配骑手，暂无骑手风控信息' }}</dd>
          <dt>取件地址</dt><dd>{{ detail.pickupAddress || '-' }}</dd>
          <dt>送达地址</dt><dd>{{ detail.deliverAddress || '-' }}</dd>
          <dt>骑手性别要求</dt><dd>{{ detail.rider_gender_requirement_label || '骑手性别不限' }}</dd>
          <dt>交接位置</dt><dd>{{ detail.handoff_mode_label || '按原订单约定交接' }}</dd>
          <dt>宿舍通行要求</dt><dd>{{ detail.dorm_access_rule_label || '按原订单约定' }}（骑手性别由本人填写）</dd>
          <dt>任务描述</dt><dd>{{ detail.description || '-' }}</dd>
          <dt>重量/距离</dt><dd>{{ detail.weight || '-' }} kg / {{ detail.distance || '-' }} km</dd>
          <dt>费用</dt><dd>基础 ¥{{ money(detail.price) }}，小费 ¥{{ money(detail.tip) }}，实付 ¥{{ money(detail.payAmount) }}</dd>
        </dl>
        <section class="coupon-repair-section">
          <div class="coupon-repair-heading">
            <h4>退款与优惠券</h4>
            <el-button link type="primary" :loading="couponChecking" :disabled="couponRestoring" @click="checkCouponRepair(detail.id)">重新核查</el-button>
          </div>
          <dl>
            <dt>退款状态</dt><dd>{{ refundStatusLabel(couponRepair?.refundStatus || detail.refundStatus) }}</dd>
            <dt>原优惠金额</dt><dd>¥{{ money(couponRepair?.couponDiscount ?? detail.couponDiscount) }}</dd>
            <template v-if="couponRepair?.refundedAmount">
              <dt>已核实退款</dt><dd>¥{{ money(couponRepair.refundedAmount) }}</dd>
            </template>
            <template v-if="couponRepair?.coupon">
              <dt>待归还券</dt><dd>{{ couponRepair.coupon.name }}</dd>
              <dt>原有效期</dt><dd>{{ couponRepair.coupon.expiresAt ? formatTime(couponRepair.coupon.expiresAt) : '未设置到期时间' }}</dd>
            </template>
          </dl>
          <p v-if="couponChecking" class="coupon-repair-hint">正在核查退款与优惠券归还情况…</p>
          <el-alert v-else-if="couponCheckError" type="error" :title="couponCheckError" :closable="false" show-icon />
          <el-alert v-else-if="couponRepair" :type="couponRepair.eligible ? 'warning' : 'info'" :title="couponRepair.reason" :closable="false" show-icon />
          <p v-if="couponRepair?.coupon?.expired" class="coupon-expired">该券原有效期已过，补回后仍不可使用，不会自动延期。</p>
          <div class="coupon-repair-actions">
            <el-button type="primary" :loading="couponRestoring" :disabled="couponChecking || !couponRepair?.eligible || !canRepairCoupon" @click="submitCouponRepair">补回优惠券</el-button>
            <span v-if="!canRepairCoupon" class="coupon-repair-hint">当前账号没有跑腿管理权限</span>
          </div>
          <p class="coupon-repair-hint">仅补回全额退款后仍被订单占用的优惠券，不会再次退款；保留优惠券原有效期。</p>
        </section>
        <section v-if="detail.tasks?.length" class="task-detail-section">
          <h4>任务明细：{{ detail.taskSummary || `${detail.tasks.length} 个任务` }}</h4>
          <div v-for="task in detail.tasks" :key="task.taskNo" class="task-card">
            <div class="task-card-head">
              <strong>{{ task.typeLabel || '跑腿任务' }} {{ task.taskNo }}</strong>
              <el-tag size="small" type="info">{{ taskSizeName(task) }}</el-tag>
            </div>
            <dl>
              <dt>{{ task.platform ? '外卖平台' : '快递公司' }}</dt><dd>{{ taskSource(task) }}</dd>
              <dt>{{ task.platform ? '取餐点' : '取件点' }}</dt><dd>{{ taskPickupName(task) }}</dd>
              <dt>{{ task.platform ? '取餐码' : '取件码' }}</dt><dd>{{ task.code || '-' }}</dd>
              <dt>地点地址</dt><dd>{{ task.pickupPointAddress || '-' }}</dd>
              <dt v-if="taskImages(task).length">图片</dt>
              <dd v-if="taskImages(task).length" class="task-images">
                <a v-for="(image, index) in taskImages(task)" :key="image" :href="image" target="_blank">图片{{ index + 1 }}</a>
              </dd>
            </dl>
          </div>
        </section>
        <section class="delivery-node-section">
          <h4>收货确认</h4>
          <dl><dt>确认方式</dt><dd>{{ receiptMethodLabel(detail.receiptConfirmedBy) }}</dd>
          <dt>确认时间</dt><dd>{{ detail.receiptConfirmedAt ? formatTime(detail.receiptConfirmedAt) : '尚未确认' }}</dd></dl>
        </section>
        <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" show-icon />
        <el-button v-if="detailError" link type="primary" :loading="detailLoading" @click="openDetail(detail)">重新加载详情</el-button>
        <section class="delivery-node-section">
          <p v-if="!deliveryNodes.length">{{ detailLoading ? '正在加载配送记录…' : detailError ? '配送记录加载失败，请重试' : '暂无配送记录' }}</p>
          <h4>配送节点</h4>
          <div v-for="node in deliveryNodes" :key="node.id || `${node.nodeType}-${node.createdAt}`" class="node-row">
            <strong>{{ node.nodeLabel || deliveryNodeLabel(node.nodeType) }}</strong>
            <span>{{ formatTime(node.createdAt) }}</span>
            <small v-if="node.remark">{{ node.remark }}</small>
            <small v-if="hasLocation(node)">送达坐标：{{ Number(node.lat).toFixed(6) }}, {{ Number(node.lng).toFixed(6) }}</small>
            <small v-if="['arrived', 'merchant_completed'].includes(node.nodeType) && !nodeProofImages(node).length">暂无送达照片</small>
            <div v-if="nodeProofImages(node).length" class="node-proofs">
              <el-image :initial-index="previewIndex" preview-teleported v-for="(image, previewIndex) in nodeProofImages(node)" :key="image" :src="image" fit="cover" :preview-src-list="nodeProofImages(node)" />
            </div>
          </div>
        </section>
        <section v-if="detail.riskEvents?.length" class="delivery-node-section">
          <h4>异常记录</h4>
          <div v-for="event in detail.riskEvents" :key="event.id" class="node-row risk">
            <strong>{{ event.description || event.eventType }}</strong>
            <span>{{ formatTime(event.createdAt) }} · {{ event.handled ? '已处理' : '待处理' }}</span>
            <small v-if="event.eventType === 'marketing_related_account_assignment_attempt'">这是接单尝试被拦截的记录。请核对发布人与尝试接单人的绑定信息；有强关联的账号不能承接此优惠订单。</small>
          </div>
          <el-button link type="primary" @click="$router.push('/errand/abnormal')">前往异常订单核查</el-button>
        </section>
        <el-timeline>
          <el-timeline-item v-for="item in timelineRows" :key="item.label" :timestamp="formatTime(item.time)">
            {{ item.label }}
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>

    <el-dialog v-model="assignVisible" title="分配骑手" width="440px">
      <p>{{ currentOrder?.rider_gender_requirement_label || '骑手性别不限' }} · {{ currentOrder?.handoff_mode_label || '按原订单约定交接' }}</p>
      <el-select v-model="assignForm.riderId" placeholder="请选择在线骑手" filterable style="width: 100%">
        <el-option
          v-for="rider in riders"
          :key="rider.id"
          :label="`${rider.realName || rider.User?.nickname || '骑手'} ${rider.phone || ''} ${riderTypeLabel(rider.riderType)} · ${rider.User?.profile?.gender === 'FEMALE' ? '女' : rider.User?.profile?.gender === 'MALE' ? '男' : '性别未填写'}`"
          :disabled="!matchesOrderGender(rider)"
          :value="rider.id"
        />
      </el-select>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :loading="assigning" @click="submitAssign">确认派单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { fetchRegions, fetchRiders } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'
import {
  assignErrandOrder,
  cancelErrandOrder,
  errandStatusOptions,
  errandTypeOptions,
  fetchErrandOrderDetail,
  fetchErrandOrderTimeline,
  fetchErrandOrders,
  fetchErrandCouponRepair,
  repairErrandCoupon,
  type ErrandCouponRepairPreview,
  labelOf,
} from '@/api/errand'

const loading = ref(false)
const detailVisible = ref(false)
const assignVisible = ref(false)
const assigning = ref(false)
const rows = ref<any[]>([])
const regions = ref<any[]>([])
const riders = ref<any[]>([])
const total = ref(0)
const detail = ref<any>(null)
const detailLoading = ref(false)
const detailError = ref('')
const receiptMethodLabel = (value?: string) => ({ user: '用户主动确认', rider: '骑手凭收货码确认', system: '系统自动确认', admin: '管理员代确认' }[value || ''] || (value ? '其他确认方式' : '尚未确认'))
const timeline = ref<any>(null)
const currentOrder = ref<any>(null)
const dateRange = ref<string[]>([])
const auth = useAuthStore()
const couponChecking = ref(false)
const couponRestoring = ref(false)
const couponCheckError = ref('')
const couponRepair = ref<ErrandCouponRepairPreview | null>(null)
const canRepairCoupon = computed(() => ['super_admin', 'SUPER_ADMIN', '超级管理员'].includes(auth.user.role) || auth.permissions.includes('errand:config'))
const openRiskCount = computed(() => (detail.value?.riskEvents || []).filter((event: any) => !event.handled).length)
let detailRequest = 0
let couponCheckRequest = 0

const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  regionId: '',
  type: '',
  status: '',
})
const assignForm = reactive({ riderId: '' })

const timelineRows = computed(() => {
  const source = timeline.value || detail.value || {}
  const baseRows = [
    { label: '下单', time: source.createdAt },
    { label: '接单', time: source.acceptTime },
    { label: '取件', time: source.pickupTime },
    { label: '送达', time: source.deliverTime },
    { label: '完成', time: source.completeTime },
    { label: '取消', time: source.cancelTime },
  ].filter(item => item.time)
  const nodeRows = (source.deliveryNodes || detail.value?.deliveryNodes || []).map((node: any) => ({
    label: node.nodeLabel || deliveryNodeLabel(node.nodeType),
    time: node.createdAt,
  }))
  return [...baseRows, ...nodeRows].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
})

const deliveryNodes = computed(() => detail.value?.deliveryNodes?.length ? detail.value.deliveryNodes : timeline.value?.deliveryNodes || [])
const hasLocation = (node: any) => node?.lat != null && node?.lng != null && Number.isFinite(Number(node.lat)) && Number.isFinite(Number(node.lng))
const nodeProofImages = (node: any) => (Array.isArray(node?.proofImages || node?.proof_images) ? (node.proofImages || node.proof_images) : []).filter((image: any) => typeof image === 'string' && image)

function money(value: any) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function formatTime(value?: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function statusTone(status: string) {
  if (['completed'].includes(status)) return 'success'
  if (['cancelled', 'refunded'].includes(status)) return 'info'
  if (['refunding'].includes(status)) return 'danger'
  if (['pending_accept', 'accepted', 'in_progress', 'arrived'].includes(status)) return 'warning'
  return 'primary'
}

function riderTypeLabel(value?: string) {
  return value === 'official' ? '官方骑手' : '兼职骑手'
}

function displayModeLabel(value?: string) {
  return value === 'live_map' ? '实时轨迹' : '状态节点'
}

function riskLevelLabel(value?: string) {
  const map: Record<string, string> = {
    normal: '正常',
    warning: '关注',
    restricted: '限制接单',
    banned: '封禁',
  }
  return map[value || 'normal'] || value || '正常'
}

function refundStatusLabel(value?: string) {
  return ({ none: '未退款', refunding: '退款处理中', refunded: '已全额退款', partial: '已部分退款' } as Record<string, string>)[value || 'none'] || '退款状态待核查'
}

function deliveryNodeLabel(value?: string) {
  const map: Record<string, string> = {
    accepted: '骑手已接单',
    in_progress: '骑手已取货',
    arrived: '骑手已送达',
    completed: '订单已完成',
    cancelled: '订单已取消',
    admin_assigned: '后台已派单',
    returned_pool: '订单退回接单池',
  }
  return map[value || ''] || '配送状态更新'
}

function taskSource(task: any) {
  return task?.express_company || task?.platform || task?.item_description || task?.description || '-'
}

function taskPickupName(task: any) {
  return task?.pickupPointName || task?.pickup_point_name || task?.pickup_point_id || '-'
}

function taskSizeName(task: any) {
  return task?.itemSizeName || task?.item_size_name || task?.item_size_id || '未标注大小'
}

function taskImages(task: any) {
  return task?.imageUrls || task?.image_urls || []
}

function canAssign(row: any) {
  return ['pending_accept', 'accepted'].includes(row.status)
}

function canCancel(row: any) {
  return !['completed', 'cancelled', 'refunded'].includes(row.status)
}

async function loadRegions() {
  regions.value = await fetchRegions()
}

function params() {
  return {
    ...query,
    startDate: dateRange.value?.[0],
    endDate: dateRange.value?.[1],
  }
}

async function loadData() {
  loading.value = true
  try {
    const res = await fetchErrandOrders(params())
    rows.value = res.list
    total.value = res.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载跑腿订单失败')
  } finally {
    loading.value = false
  }
}

function search() {
  query.page = 1
  loadData()
}

function reset() {
  query.page = 1
  query.keyword = ''
  query.regionId = ''
  query.type = ''
  query.status = ''
  dateRange.value = []
  loadData()
}

async function openDetail(row: any) {
  const requestId = ++detailRequest
  detailVisible.value = true
  detail.value = row
  timeline.value = null
  couponRepair.value = null
  void checkCouponRepair(row.id)
  detailLoading.value = true
  detailError.value = ''
  const [detailResult, timelineResult] = await Promise.allSettled([
    fetchErrandOrderDetail(row.id), fetchErrandOrderTimeline(row.id),
  ])
  if (requestId !== detailRequest || detail.value?.id !== row.id) return
  detailLoading.value = false
  if (detailResult.status === 'fulfilled') detail.value = detailResult.value
  else detailError.value = '订单详情加载失败，请重试'
  if (timelineResult.status === 'fulfilled') timeline.value = timelineResult.value
  else if (detailResult.status === 'fulfilled') ElMessage.warning('时间线加载失败，已显示订单详情及配送凭证')

}

async function checkCouponRepair(orderId: string) {
  const requestId = ++couponCheckRequest
  couponChecking.value = true
  couponCheckError.value = ''
  couponRepair.value = null
  try {
    const result = await fetchErrandCouponRepair(orderId)
    if (requestId === couponCheckRequest && detail.value?.id === orderId) couponRepair.value = result
  } catch (e: any) {
    if (requestId === couponCheckRequest) couponCheckError.value = e?.message || '优惠券核查失败，请重试'
  } finally {
    if (requestId === couponCheckRequest) couponChecking.value = false
  }
}

async function submitCouponRepair() {
  if (!couponRepair.value?.eligible || !canRepairCoupon.value || couponRestoring.value || couponChecking.value) return
  const orderId = detail.value.id
  const orderNo = detail.value.orderNo
  const couponName = couponRepair.value.coupon?.name || '优惠券'
  couponRestoring.value = true
  try {
    const { value } = await ElMessageBox.prompt(`为订单 ${orderNo} 补回“${couponName}”。请填写补券说明；不会再次退款，优惠券原有效期不变。`, '补回优惠券', {
      inputValue: '历史订单已全额退款，优惠券未归还',
      inputPlaceholder: '填写补券原因，便于后续核查',
      inputType: 'textarea',
      inputValidator: value => !!value?.trim() && value.trim().length <= 500 || '请填写 1 至 500 字的补券说明',
      confirmButtonText: '确认补回',
      cancelButtonText: '返回',
      closeOnClickModal: false,
    })
    if (!detailVisible.value || detail.value?.id !== orderId) return
    const result = await repairErrandCoupon(orderId, value.trim())
    if (result.restored) ElMessage.success(result.message)
    else ElMessage.info(result.message)
    if (detailVisible.value && detail.value?.id === orderId) await checkCouponRepair(orderId)
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '补券失败，请重新核查后重试')
  } finally {
    couponRestoring.value = false
  }
}

function matchesOrderGender(rider: any) {
  const required = currentOrder.value?.rider_gender_requirement || 'any'
  return required === 'any' || String(rider.User?.profile?.gender || '').toLowerCase() === required
}

async function openAssign(row: any) {
  currentOrder.value = row
  assignForm.riderId = ''
  assignVisible.value = true
  try {
    const payload: any = await fetchRiders({ page: 1, pageSize: 100, status: 'online', auditStatus: 'approved', regionId: row.regionId || query.regionId })
    riders.value = payload?.list || payload?.data?.list || payload || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载在线骑手失败')
  }
}

async function submitAssign() {
  if (!currentOrder.value?.id || !assignForm.riderId) {
    ElMessage.warning('请选择骑手')
    return
  }
  assigning.value = true
  try {
    await assignErrandOrder(currentOrder.value.id, assignForm.riderId)
    ElMessage.success('派单成功')
    assignVisible.value = false
    await loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '派单失败')
  } finally {
    assigning.value = false
  }
}

async function cancel(row: any) {
  const { value } = await ElMessageBox.prompt('请输入取消原因', '取消跑腿订单', {
    inputValue: '运营后台取消',
    confirmButtonText: '确认取消',
    cancelButtonText: '返回',
  })
  await cancelErrandOrder(row.id, value || '运营后台取消')
  ElMessage.success('订单已取消')
  await loadData()
}

onMounted(async () => {
  await loadRegions()
  await loadData()
})
</script>

<style scoped>
.errand-orders {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.filter-card :deep(.el-card__body) {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 180px 150px 150px 280px auto auto;
  gap: 12px;
  align-items: center;
}

.table-card {
  border-radius: 14px;
  border: 1px solid rgba(203, 213, 225, 0.78);
}

.order-cell,
.address-cell,
.user-cell > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.order-cell strong,
.user-cell strong {
  color: #0f172a;
  font-weight: 800;
}

.order-cell span,
.address-cell span,
.user-cell span,
small {
  color: #64748b;
  font-size: 12px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.money {
  color: #dc2626;
}

.pager {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16px;
  padding-top: 18px;
}

.detail-box section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.detail-box h3 {
  margin: 0;
  color: #0f172a;
}

.detail-box dl {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  gap: 12px;
  margin: 0 0 22px;
}

.detail-box dt {
  color: #64748b;
  font-weight: 700;
}

.detail-box dd {
  min-width: 0;
  margin: 0;
  color: #0f172a;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.detail-box .task-detail-section {
  display: block;
  margin: 8px 0 22px;
}

.detail-box .coupon-repair-section {
  display: block;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.coupon-repair-heading,
.coupon-repair-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.coupon-repair-heading h4 { margin: 0; }
.coupon-repair-actions { justify-content: flex-start; flex-wrap: wrap; margin-top: 14px; }
.coupon-repair-hint { color: #64748b; font-size: 12px; line-height: 1.7; margin-bottom: 0; }
.coupon-expired { color: #b45309; font-size: 13px; line-height: 1.6; }

.task-detail-section h4 {
  margin: 0 0 12px;
  font-size: 15px;
  color: #0f172a;
}

.task-card {
  padding: 14px;
  border: 1px solid rgba(203, 213, 225, 0.8);
  border-radius: 10px;
  background: #f8fafc;
  margin-bottom: 12px;
}

.task-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.task-card dl {
  margin-bottom: 0;
}

.task-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.task-images a {
  color: #2563eb;
  text-decoration: none;
}

.delivery-node-section {
  display: block !important;
  margin: 8px 0 22px;
}

.delivery-node-section h4 {
  margin: 0 0 12px;
  font-size: 15px;
  color: #0f172a;
}

.node-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.node-row strong {
  color: #0f172a;
}

.node-row span,
.node-row small {
  color: #64748b;
  font-size: 12px;
}

.node-row small {
  grid-column: 1 / -1;
}

.node-proofs {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.node-proofs :deep(.el-image) {
  width: 88px;
  height: 88px;
  border-radius: 6px;
}

.node-row.risk strong {
  color: #dc2626;
}

.node-row.risk {
  grid-template-columns: minmax(0, 1fr);
  overflow-wrap: anywhere;
  line-height: 1.7;
}

@media (max-width: 1280px) {
  .filter-card :deep(.el-card__body) {
    grid-template-columns: 1fr 1fr;
  }
}
</style>

<style scoped>
.node-row { min-width: 0; overflow-wrap: anywhere; }
.detail-box dd { min-width: 0; overflow-wrap: anywhere; }
</style>
