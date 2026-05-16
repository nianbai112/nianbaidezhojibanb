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

    <el-drawer v-model="detailVisible" title="跑腿订单详情" size="520px">
      <div v-if="detail" class="detail-box">
        <section>
          <h3>{{ detail.title || labelOf(errandTypeOptions, detail.type) }}</h3>
          <el-tag :type="statusTone(detail.status)">{{ labelOf(errandStatusOptions, detail.status) }}</el-tag>
        </section>
        <dl>
          <dt>订单号</dt><dd>{{ detail.orderNo }}</dd>
          <dt>用户</dt><dd>{{ detail.userName || '-' }} {{ detail.userPhone || '' }}</dd>
          <dt>骑手</dt><dd>{{ detail.riderName || '未分配' }} {{ detail.riderPhone || '' }}</dd>
          <dt>取件地址</dt><dd>{{ detail.pickupAddress || '-' }}</dd>
          <dt>送达地址</dt><dd>{{ detail.deliverAddress || '-' }}</dd>
          <dt>任务描述</dt><dd>{{ detail.description || '-' }}</dd>
          <dt>重量/距离</dt><dd>{{ detail.weight || '-' }} kg / {{ detail.distance || '-' }} km</dd>
          <dt>费用</dt><dd>基础 ¥{{ money(detail.price) }}，小费 ¥{{ money(detail.tip) }}，实付 ¥{{ money(detail.payAmount) }}</dd>
        </dl>
        <el-timeline>
          <el-timeline-item v-for="item in timelineRows" :key="item.label" :timestamp="formatTime(item.time)">
            {{ item.label }}
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>

    <el-dialog v-model="assignVisible" title="分配骑手" width="440px">
      <el-select v-model="assignForm.riderId" placeholder="请选择在线骑手" filterable style="width: 100%">
        <el-option
          v-for="rider in riders"
          :key="rider.id"
          :label="`${rider.realName || rider.User?.nickname || '骑手'} ${rider.phone || ''}`"
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
import {
  assignErrandOrder,
  cancelErrandOrder,
  errandStatusOptions,
  errandTypeOptions,
  fetchErrandOrderDetail,
  fetchErrandOrderTimeline,
  fetchErrandOrders,
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
const timeline = ref<any>(null)
const currentOrder = ref<any>(null)
const dateRange = ref<string[]>([])

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
  return [
    { label: '下单', time: source.createdAt },
    { label: '接单', time: source.acceptTime },
    { label: '取件', time: source.pickupTime },
    { label: '送达', time: source.deliverTime },
    { label: '完成', time: source.completeTime },
    { label: '取消', time: source.cancelTime },
  ].filter(item => item.time)
})

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
  detailVisible.value = true
  detail.value = row
  timeline.value = null
  try {
    const [detailData, timelineData] = await Promise.all([
      fetchErrandOrderDetail(row.id),
      fetchErrandOrderTimeline(row.id),
    ])
    detail.value = detailData
    timeline.value = timelineData
  } catch (e: any) {
    ElMessage.error(e?.message || '加载订单详情失败')
  }
}

async function openAssign(row: any) {
  currentOrder.value = row
  assignForm.riderId = ''
  assignVisible.value = true
  try {
    const payload: any = await fetchRiders({ page: 1, pageSize: 100, status: 'online', regionId: row.regionId || query.regionId })
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
  border-radius: 18px;
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
  grid-template-columns: 90px 1fr;
  gap: 12px;
  margin: 0 0 22px;
}

.detail-box dt {
  color: #64748b;
  font-weight: 700;
}

.detail-box dd {
  margin: 0;
  color: #0f172a;
  font-weight: 700;
}

@media (max-width: 1280px) {
  .filter-card :deep(.el-card__body) {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
