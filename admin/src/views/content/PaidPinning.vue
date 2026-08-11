<template>
  <div class="pin-page">
    <div class="pin-header">
      <div>
        <p class="eyebrow">内容中心 / 商业化</p>
        <h2>付费置顶</h2>
        <p>配置笔记置顶套餐，查看用户购买记录和置顶到期时间。</p>
      </div>
      <div class="header-actions">
        <el-select v-model="selectedRegionId" filterable placeholder="选择区域" @change="handleRegionChange">
          <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
        <el-button @click="loadAll">刷新</el-button>
        <el-button type="primary" @click="openPackageDialog()">新增套餐</el-button>
      </div>
    </div>

    <div class="metric-row">
      <div class="metric-card">
        <span>套餐数</span>
        <strong>{{ packages.length }}</strong>
      </div>
      <div class="metric-card">
        <span>置顶订单</span>
        <strong>{{ orderPager.total }}</strong>
      </div>
      <div class="metric-card">
        <span>已支付</span>
        <strong>{{ paidOrderCount }}</strong>
      </div>
      <div class="metric-card">
        <span>订单收入</span>
        <strong>¥{{ paidAmount.toFixed(2) }}</strong>
      </div>
    </div>

    <div class="content-grid">
      <section class="data-card">
        <div class="card-title">
          <h3>置顶套餐</h3>
          <span>小程序发布页和帖子推广入口会读取这里的套餐。</span>
        </div>
        <el-table :data="packages" v-loading="loadingPackages" empty-text="暂无置顶套餐">
          <el-table-column label="套餐" min-width="180">
            <template #default="{ row }">
              <div class="main-cell">
                <strong>{{ row.package_name || row.name }}</strong>
                <span>{{ formatDuration(row) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="价格" width="130">
            <template #default="{ row }">
              <strong>¥{{ money(row.current_price ?? row.amount) }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="原价" width="120">
            <template #default="{ row }">¥{{ money(row.original_price ?? row.originalPrice) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.isShow || row.is_show ? 'success' : 'info'" size="small">
                {{ row.isShow || row.is_show ? '上架' : '隐藏' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="排序" width="90" prop="sortOrder" />
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openPackageDialog(row)">编辑</el-button>
              <el-button size="small" type="danger" plain @click="deletePackage(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section class="data-card">
        <div class="card-title">
          <h3>运营提示</h3>
        </div>
        <div class="tips-list">
          <div>
            <strong>建议套餐</strong>
            <span>1天、3天、7天三个档位最容易被学生理解。</span>
          </div>
          <div>
            <strong>展示逻辑</strong>
            <span>支付成功后帖子会按置顶优先展示，到期自动回到普通排序。</span>
          </div>
          <div>
            <strong>风控建议</strong>
            <span>违规笔记仍然可以在帖子管理里下架或取消置顶。</span>
          </div>
        </div>
      </section>
    </div>

    <section class="data-card">
      <div class="card-title">
        <h3>置顶订单</h3>
        <div class="table-tools">
          <el-select v-model="orderFilters.status" clearable placeholder="支付状态" @change="loadOrders(true)">
            <el-option label="待支付" value="pending" />
            <el-option label="支付中" value="paying" />
            <el-option label="已支付" value="success" />
            <el-option label="已取消" value="cancelled" />
            <el-option label="失败" value="failed" />
          </el-select>
          <el-input v-model="orderFilters.orderNo" clearable placeholder="订单号" @keyup.enter="loadOrders(true)" />
          <el-button @click="loadOrders(true)">查询</el-button>
        </div>
      </div>
      <el-table :data="orders" v-loading="loadingOrders" empty-text="暂无置顶订单">
        <el-table-column label="订单号" min-width="180" prop="orderNo" />
        <el-table-column label="用户" min-width="140">
          <template #default="{ row }">{{ row.user?.nickname || row.User?.nickname || row.userId }}</template>
        </el-table-column>
        <el-table-column label="笔记" min-width="200">
          <template #default="{ row }">{{ row.postTitle || row.post?.title || row.post?.content || row.postId || '-' }}</template>
        </el-table-column>
        <el-table-column label="套餐" min-width="140">
          <template #default="{ row }">{{ row.package_name || row.packageName || '-' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="110">
          <template #default="{ row }">¥{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="orderStatusType(row.status)" size="small">{{ orderStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="置顶到期" width="180">
          <template #default="{ row }">{{ formatTime(row.topExpireAt || row.top_expire_at) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt || row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canSyncOrder(row)"
              size="small"
              type="primary"
              plain
              :loading="syncingOrderId === row.id"
              @click="syncOrder(row)"
            >
              同步
            </el-button>
            <span v-else class="muted-text">-</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="orderPager.page"
          v-model:page-size="orderPager.pageSize"
          :total="orderPager.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadOrders"
          @size-change="loadOrders"
        />
      </div>
    </section>

    <el-dialog v-model="packageDialog.visible" :title="packageDialog.form.id ? '编辑置顶套餐' : '新增置顶套餐'" width="560px">
      <el-form :model="packageDialog.form" label-position="top">
        <div class="dialog-grid">
          <el-form-item label="套餐名称" required>
            <el-input v-model="packageDialog.form.name" maxlength="20" placeholder="例如 置顶一天" />
          </el-form-item>
          <el-form-item label="状态">
            <el-switch v-model="packageDialog.form.isShow" active-text="上架" inactive-text="隐藏" />
          </el-form-item>
          <el-form-item label="现价" required>
            <el-input-number v-model="packageDialog.form.amount" :min="0.01" :precision="2" />
          </el-form-item>
          <el-form-item label="原价">
            <el-input-number v-model="packageDialog.form.originalPrice" :min="0" :precision="2" />
          </el-form-item>
          <el-form-item label="置顶时长" required>
            <el-input-number v-model="packageDialog.form.duration" :min="1" />
          </el-form-item>
          <el-form-item label="时长单位">
            <el-select v-model="packageDialog.form.durationUnit" style="width: 100%">
              <el-option label="分钟" value="minutes" />
              <el-option label="小时" value="hours" />
              <el-option label="天" value="days" />
              <el-option label="周" value="weeks" />
              <el-option label="月" value="months" />
            </el-select>
          </el-form-item>
          <el-form-item label="排序">
            <el-input-number v-model="packageDialog.form.sortOrder" :min="0" />
          </el-form-item>
        </div>
        <el-form-item label="说明">
          <el-input v-model="packageDialog.form.description" type="textarea" :rows="3" maxlength="120" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="packageDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="savingPackage" @click="savePackage">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fetchRegions } from '@/api/admin'
import { request } from '@/api/request'

const regions = ref<any[]>([])
const selectedRegionId = ref('')
const packages = ref<any[]>([])
const orders = ref<any[]>([])
const loadingPackages = ref(false)
const loadingOrders = ref(false)
const savingPackage = ref(false)
const syncingOrderId = ref('')
const orderFilters = reactive({ status: '', orderNo: '' })
const orderPager = reactive({ page: 1, pageSize: 20, total: 0 })
const packageDialog = reactive({
  visible: false,
  form: defaultPackageForm(),
})

const paidOrderCount = computed(() => orders.value.filter(order => order.status === 'success').length)
const paidAmount = computed(() => orders.value
  .filter(order => order.status === 'success')
  .reduce((sum, order) => sum + Number(order.amount || 0), 0))

function defaultPackageForm() {
  return {
    id: '',
    regionId: '',
    name: '',
    amount: 3,
    originalPrice: 3,
    duration: 24,
    durationUnit: 'hours',
    description: '',
    sortOrder: 0,
    isShow: true,
  }
}

function pageOf(data: any) {
  return data?.data && typeof data.data === 'object' ? data.data : data
}

function money(value: any) {
  return Number(value || 0).toFixed(2)
}

function formatDuration(row: any) {
  const unitMap: Record<string, string> = { minutes: '分钟', hours: '小时', days: '天', weeks: '周', months: '月' }
  const unit = row.duration_unit || row.durationUnit || 'hours'
  return `${row.duration || 0}${unitMap[unit] || unit}`
}

function formatTime(value: any) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function orderStatusLabel(status: string) {
  return ({ pending: '待支付', paying: '支付中', success: '已支付', failed: '失败', cancelled: '已取消' } as Record<string, string>)[status] || status || '-'
}

function orderStatusType(status: string) {
  return ({ success: 'success', paying: 'warning', pending: 'info', failed: 'danger', cancelled: 'info' } as Record<string, string>)[status] || 'info'
}

function canSyncOrder(row: any) {
  return ['pending', 'paying'].includes(String(row?.status || row?.order_status || '')) && !!(row?.paymentNo || row?.payment_no)
}

async function loadRegions() {
  regions.value = await fetchRegions()
  const preferred = String(localStorage.getItem('LM_SELECTED_REGION_ID') || localStorage.getItem('selectedRegionId') || '')
  selectedRegionId.value = preferred && regions.value.some(region => String(region.id) === preferred)
    ? preferred
    : String(regions.value[0]?.id || '')
  await handleRegionChange()
}

async function handleRegionChange() {
  if (!selectedRegionId.value) return
  localStorage.setItem('LM_SELECTED_REGION_ID', selectedRegionId.value)
  localStorage.setItem('selectedRegionId', selectedRegionId.value)
  await loadAll()
}

async function loadAll() {
  await Promise.all([loadPackages(), loadOrders(true)])
}

async function loadPackages() {
  if (!selectedRegionId.value) return
  loadingPackages.value = true
  try {
    const data = pageOf(await request.get('/admin/topup/packages', {
      params: { page: 1, pageSize: 100, regionId: selectedRegionId.value },
    }))
    packages.value = data?.list || []
  } finally {
    loadingPackages.value = false
  }
}

async function loadOrders(reset = false) {
  if (!selectedRegionId.value) return
  if (reset === true) orderPager.page = 1
  loadingOrders.value = true
  try {
    const data = pageOf(await request.get('/admin/topup/orders', {
      params: {
        page: orderPager.page,
        pageSize: orderPager.pageSize,
        regionId: selectedRegionId.value,
        status: orderFilters.status || undefined,
        orderNo: orderFilters.orderNo || undefined,
      },
    }))
    orders.value = data?.list || []
    orderPager.total = Number(data?.total || 0)
  } finally {
    loadingOrders.value = false
  }
}

function openPackageDialog(row?: any) {
  packageDialog.form = row
    ? {
        id: row.id,
        regionId: row.regionId || row.region_id || selectedRegionId.value,
        name: row.name || row.package_name || '',
        amount: Number(row.amount ?? row.current_price ?? 0),
        originalPrice: Number(row.originalPrice ?? row.original_price ?? row.amount ?? 0),
        duration: Number(row.duration || 24),
        durationUnit: row.durationUnit || row.duration_unit || 'hours',
        description: row.description || '',
        sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
        isShow: row.isShow ?? !!row.is_show,
      }
    : { ...defaultPackageForm(), regionId: selectedRegionId.value }
  packageDialog.visible = true
}

async function savePackage() {
  const payload = { ...packageDialog.form, regionId: selectedRegionId.value }
  if (!payload.name.trim()) {
    ElMessage.warning('请输入套餐名称')
    return
  }
  if (!payload.amount || payload.amount <= 0) {
    ElMessage.warning('套餐价格必须大于0')
    return
  }
  savingPackage.value = true
  try {
    if (payload.id) await request.put(`/admin/topup/packages/${payload.id}`, payload)
    else await request.post('/admin/topup/packages', payload)
    ElMessage.success('已保存')
    packageDialog.visible = false
    await loadPackages()
  } finally {
    savingPackage.value = false
  }
}

async function deletePackage(row: any) {
  await ElMessageBox.confirm(`确定删除「${row.package_name || row.name}」吗？`, '删除套餐', { type: 'warning' })
  await request.delete(`/admin/topup/packages/${row.id}`)
  ElMessage.success('已删除')
  await loadPackages()
}

async function syncOrder(row: any) {
  if (!row?.id) return
  syncingOrderId.value = row.id
  try {
    const result = pageOf(await request.post(`/admin/topup/orders/${row.id}/sync-payment`))
    const status = result?.status || result?.order_status
    ElMessage.success(status === 'success' ? '支付已同步，置顶已生效' : '已查询支付状态，请稍后刷新')
    await loadOrders()
  } finally {
    syncingOrderId.value = ''
  }
}

onMounted(loadRegions)
</script>

<style scoped>
.pin-page {
  padding: 32px;
}

.pin-header,
.data-card,
.metric-card {
  border: 1px solid #dbe6f7;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(35, 70, 120, 0.06);
}

.pin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 28px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #2563eb;
  font-weight: 700;
}

h2,
h3,
p {
  margin: 0;
}

.pin-header h2 {
  font-size: 28px;
  line-height: 36px;
}

.pin-header p:last-child,
.card-title span,
.tips-list span,
.metric-card span,
.muted-text {
  color: #64748b;
}

.header-actions,
.table-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-actions .el-select,
.table-tools .el-select,
.table-tools .el-input {
  width: 220px;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin: 18px 0;
}

.metric-card {
  padding: 20px;
}

.metric-card strong {
  display: block;
  margin-top: 8px;
  font-size: 26px;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 18px;
  margin-bottom: 18px;
}

.data-card {
  padding: 18px;
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.main-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.main-cell span {
  color: #64748b;
  font-size: 12px;
}

.tips-list {
  display: grid;
  gap: 14px;
}

.tips-list div {
  display: grid;
  gap: 4px;
  padding: 14px;
  border-radius: 6px;
  background: #f8fbff;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.dialog-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

@media (max-width: 1180px) {
  .pin-header,
  .card-title {
    align-items: flex-start;
    flex-direction: column;
  }

  .metric-row,
  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
