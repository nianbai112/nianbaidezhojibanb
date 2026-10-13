<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 优惠券</p>
        <h2>优惠券管理</h2>
        <p>真实读取优惠券、领取量和使用量，支持创建、编辑、启停。</p>
      </div>
      <el-button v-if="hasEditPermission" type="primary" @click="openCreate">创建优惠券</el-button>
    </div>

    <div class="filter-card">
      <el-input v-model="filters.keyword" clearable placeholder="搜索优惠券名称" @keyup.enter="loadCoupons" />
      <el-select v-model="filters.status" clearable placeholder="状态">
        <el-option label="启用" value="active" />
        <el-option label="禁用" value="inactive" />
      </el-select>
      <el-select v-model="filters.businessScope" clearable placeholder="适用板块">
        <el-option v-for="item in businessScopeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-select v-model="filters.regionId" clearable filterable placeholder="区域">
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-button type="primary" @click="loadCoupons">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="data-card">
      <el-table :data="coupons" v-loading="loading" empty-text="暂无真实优惠券数据">
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="面值" width="110">
          <template #default="{ row }">{{ displayValue(row) }}</template>
        </el-table-column>
        <el-table-column label="门槛" width="110">
          <template #default="{ row }">{{ formatMoney(row.minAmount) }}</template>
        </el-table-column>
        <el-table-column label="适用板块" width="120">
          <template #default="{ row }">
            <el-tag size="small" type="warning" effect="plain">{{ businessScopeLabel(row.businessScope) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="适用范围" min-width="170">
          <template #default="{ row }">
            <div class="scope-cell">
              <el-tag v-if="row.region?.name" size="small" effect="plain">{{ row.region.name }}</el-tag>
              <el-tag v-if="row.merchant?.name" size="small" type="success" effect="plain">{{ row.merchant.name }}</el-tag>
              <span v-if="!row.region?.name && !row.merchant?.name">全平台</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="totalCount" label="总量" width="90" />
        <el-table-column prop="receivedCount" label="已领" width="90" />
        <el-table-column prop="usedCount" label="已用" width="90" />
        <el-table-column label="有效期" min-width="240">
          <template #default="{ row }">{{ formatTime(row.startAt) }} 至 {{ formatTime(row.endAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="270" fixed="right">
          <template #default="{ row }">
            <el-button v-if="hasEditPermission" size="small" type="primary" plain :disabled="row.status !== 'active'" @click="openRandomGrant(row)">随机发放</el-button>
            <el-button v-if="hasEditPermission" size="small" @click="editCoupon(row)">编辑</el-button>
            <el-button v-if="hasEditPermission" size="small" :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="loadCoupons"
          @size-change="loadCoupons"
        />
      </div>
    </div>

    <el-dialog v-model="showDialog" :title="editingCoupon ? '编辑优惠券' : '创建优惠券'" width="640px" top="5vh">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：新用户满减券" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="折扣券" value="DISCOUNT" />
            <el-option label="满减券" value="FULL_REDUCTION" />
            <el-option label="兑换券" value="EXCHANGE" />
          </el-select>
        </el-form-item>
        <p class="coupon-value-hint">{{ form.type === 'DISCOUNT' ? '填写 8 表示八折，20 元商品优惠 4 元' : '减免金额单位为元；最多抵扣可优惠金额' }}</p>
        <div class="dialog-grid">
          <el-form-item :label="form.type === 'DISCOUNT' ? '折扣' : '减免金额'" required>
            <el-input-number v-model="form.value" :min="0.01" :max="form.type === 'DISCOUNT' ? 9.99 : 99999999.99" :precision="2" />
          </el-form-item>
          <el-form-item label="最低消费">
            <el-input-number v-model="form.minAmount" :min="0" :max="99999999.99" :precision="2" />
          </el-form-item>
          <el-form-item label="总量">
            <el-input-number v-model="form.totalCount" :min="Math.max(1, Number(editingCoupon?.receivedCount || 0))" :max="2147483647" :precision="0" />
          </el-form-item>
          <el-form-item label="每人限领">
            <el-input-number v-model="form.limitPerUser" :min="1" :max="2147483647" :precision="0" />
          </el-form-item>
        </div>
        <div class="dialog-grid">
          <el-form-item label="适用板块">
            <el-select v-model="form.businessScope" style="width: 100%">
              <el-option v-for="item in businessScopeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="适用区域">
            <el-select v-model="form.regionId" clearable filterable placeholder="不选则全区域" style="width: 100%" @change="handleRegionFilterChange">
              <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="适用商家">
            <el-select v-model="form.merchantId" clearable filterable placeholder="不选则不限商家" style="width: 100%" :loading="loadingMerchants">
              <el-option v-for="merchant in merchants" :key="merchant.id" :label="merchant.name || merchant.shopName" :value="merchant.id" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="有效期" required>
          <el-date-picker
            v-model="form.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="运营备注或领取说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submitCoupon" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="randomDialog" title="随机批量发放优惠券" width="560px" :close-on-click-modal="false" :close-on-press-escape="!randomSaving" :show-close="!randomSaving">
      <el-alert type="info" :closable="false" title="从全平台正常用户中随机抽取，每人一张；排除机器人和已达限领次数的用户。全平台发放需要超级管理员权限。" />
      <el-form label-width="100px" style="margin-top: 20px">
        <el-form-item label="优惠券">{{ randomCoupon?.name }}（{{ displayValue(randomCoupon || {}) }}）</el-form-item>
        <el-form-item label="适用范围">{{ randomCoupon?.region?.name || '全平台' }} · {{ randomCoupon?.merchant?.name || '不限商家' }} · {{ businessScopeLabel(randomCoupon?.businessScope) }}</el-form-item>
        <el-form-item label="剩余库存">{{ Math.max(0, Number(randomCoupon?.totalCount || 0) - Number(randomCoupon?.receivedCount || 0)) }}</el-form-item>
        <el-form-item label="发放人数" required><el-input-number v-model="randomForm.count" :min="1" :max="1000" :precision="0" :disabled="randomLocked" /> 人（每批最多 1000 人）</el-form-item>
        <el-form-item label="发放原因" required><el-input v-model="randomForm.reason" type="textarea" maxlength="200" show-word-limit :disabled="randomLocked" placeholder="例如：开学随机福利" /></el-form-item>
      </el-form>
      <el-alert v-if="randomLocked" type="warning" :closable="false" title="本批次已提交。若未收到结果，请点击“重试本批次”；系统按批次防止重复发放。" />
      <template #footer>
        <el-button :disabled="randomSaving" @click="randomDialog = false">关闭</el-button>
        <el-button type="primary" :loading="randomSaving" @click="submitRandomGrant">{{ randomLocked ? '重试本批次' : '确认随机发放' }}</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="randomResultDialog" title="优惠券发放成功" width="600px" :close-on-click-modal="false">
      <el-alert type="success" :closable="false" :title="`本批次成功发放 ${randomResult.count} 人，每人一张`" />
      <p>批次编号：{{ randomResult.batchId }}</p>
      <el-table :data="randomResultRows" max-height="420" empty-text="此历史批次未保存 UID 明细，可在操作日志中核对用户记录。">
        <el-table-column prop="uid" label="用户 UID" min-width="160" />
        <el-table-column label="发放结果" min-width="160">
          <template #default="{ row }"><el-tag v-if="row.status === 'success'" type="success">发放成功</el-tag></template>
        </el-table-column>
      </el-table>
      <el-pagination v-if="randomResult.recipients.length > 20" v-model:current-page="randomResultPage" :page-size="20" :total="randomResult.recipients.length" layout="total, prev, pager, next" style="margin-top: 16px" />
      <template #footer><el-button type="primary" @click="randomResultDialog = false">完成</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import { fetchRegions } from '@/api/admin'
import { cleanPayload, dateRangeFrom, errorMessage, formatMoney, formatTime, unwrapPage } from './utils'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('coupon:view') || auth.permissions.includes('marketing:view'))
const randomDialog = ref(false)
const randomResultDialog = ref(false)
const randomResultPage = ref(1)
const randomResult = ref<{ batchId: string; count: number; recipients: Array<{ userId: string; uid: number; status: string }> }>({ batchId: '', count: 0, recipients: [] })
const randomResultRows = computed(() => randomResult.value.recipients.slice((randomResultPage.value - 1) * 20, randomResultPage.value * 20))
const randomSaving = ref(false)
const randomLocked = ref(false)
const randomCoupon = ref<any>(null)
const randomForm = reactive({ count: 100, reason: '', batchId: '' })
const pendingKey = (id: string) => `coupon-random-grant:${id}`

function openRandomGrant(row: any) {
  randomCoupon.value = row
  const saved = sessionStorage.getItem(pendingKey(row.id))
  let pending: any = null
  try { pending = saved ? JSON.parse(saved) : null } catch { /* discard malformed draft */ }
  Object.assign(randomForm, pending || { count: 100, reason: '', batchId: crypto.randomUUID() })
  randomLocked.value = !!pending
  randomDialog.value = true
}

async function submitRandomGrant() {
  if (randomSaving.value) return
  if (!randomForm.reason.trim()) { ElMessage.warning('请填写发放原因'); return }
  if (!Number.isInteger(randomForm.count) || randomForm.count < 1 || randomForm.count > 1000) { ElMessage.warning('请输入 1 至 1000 的整数人数'); return }
  randomSaving.value = true
  try {
    if (!randomLocked.value) {
      await ElMessageBox.confirm(`将从全平台正常用户中随机抽取 ${randomForm.count} 人，每人发放一张「${randomCoupon.value.name}」。确认发放？`, '确认本批次', { type: 'warning' })
    }
    sessionStorage.setItem(pendingKey(randomCoupon.value.id), JSON.stringify(randomForm))
    randomLocked.value = true
    const result: any = await request.post(`/admin/coupons/${randomCoupon.value.id}/random-grant`, { ...randomForm }, { timeout: 75000 })
    sessionStorage.removeItem(pendingKey(randomCoupon.value.id))
    randomDialog.value = false
    randomResult.value = { batchId: result.batchId, count: result.count, recipients: result.recipients || [] }
    randomResultPage.value = 1
    randomResultDialog.value = true
    await loadCoupons()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    // Explicit validation/authorization failures are safe to correct; network/server
    // failures retain the request ID because the transaction may have committed.
    if ([400, 401, 403, 404].includes(error?.response?.status)) {
      sessionStorage.removeItem(pendingKey(randomCoupon.value.id))
      randomLocked.value = false
    }
    ElMessage.error(errorMessage(error, '未确认发放结果，请重试本批次，勿另建批次重复发放'))
  } finally { randomSaving.value = false }
}

const route = useRoute()
const loading = ref(false)
const submitting = ref(false)
const showDialog = ref(false)
const editingCoupon = ref<any>(null)
const coupons = ref<any[]>([])
const regions = ref<any[]>([])
const merchants = ref<any[]>([])
const loadingMerchants = ref(false)
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const filters = reactive({ keyword: '', status: '', businessScope: '', regionId: '' })
const businessScopeOptions = [
  { label: '通用', value: 'all' },
  { label: '外卖/小店', value: 'shop' },
  { label: '商城', value: 'mall' },
  { label: '跑腿/代买', value: 'errand' },
  { label: '活动', value: 'activity' },
  { label: '会员权益', value: 'membership' },
]

const form = reactive({
  name: '',
  type: 'DISCOUNT',
  businessScope: 'all',
  value: 8,
  minAmount: 0,
  totalCount: 100,
  limitPerUser: 1,
  regionId: '',
  merchantId: '',
  dateRange: null as any,
  description: '',
})

function typeLabel(type: string) {
  const map: Record<string, string> = {
    DISCOUNT: '折扣',
    discount: '折扣',
    FULL_REDUCTION: '满减',
    full_reduction: '满减',
    EXCHANGE: '兑换',
    exchange: '兑换',
  }
  return map[type] || type || '-'
}

function displayValue(row: any) {
  return String(row.type).toUpperCase() === 'DISCOUNT' ? `${Number(row.value || 0)} 折` : formatMoney(row.value)
}

function businessScopeLabel(scope: string) {
  return businessScopeOptions.find((item) => item.value === String(scope || 'all'))?.label || '通用'
}

function resetForm() {
  Object.assign(form, {
    name: '',
    type: 'DISCOUNT',
    businessScope: 'all',
    value: 8,
    minAmount: 0,
    totalCount: 100,
    limitPerUser: 1,
    regionId: '',
    merchantId: '',
    dateRange: null,
    description: '',
  })
}

function applyTemplate(template: any) {
  if (!template) return
  const now = new Date()
  const end = new Date(now)
  end.setDate(end.getDate() + 30)
  const presets: Record<string, any> = {
    'new-user': {
      name: '新用户注册礼包',
      type: 'FULL_REDUCTION',
      value: 5,
      minAmount: 0,
      totalCount: 1000,
      limitPerUser: 1,
      businessScope: 'all',
      description: '新用户注册后可领取，适合新区域冷启动。',
    },
    'first-order': {
      name: '首单立减券',
      type: 'FULL_REDUCTION',
      value: 3,
      minAmount: 0,
      totalCount: 1000,
      limitPerUser: 1,
      businessScope: 'all',
      description: '用于首单转化，可结合配送补贴展示。',
    },
    merchant: {
      name: '指定商家促单券',
      type: 'FULL_REDUCTION',
      value: 5,
      minAmount: 20,
      totalCount: 300,
      limitPerUser: 1,
      businessScope: 'shop',
      merchantId: '__select__',
      description: '用于指定商家促单，保存后请在适用商家中绑定目标商家。',
    },
  }
  const preset = presets[String(template)] || null
  if (!preset) return
  Object.assign(form, {
    ...preset,
    merchantId: preset.merchantId === '__select__' ? '' : (preset.merchantId || form.merchantId),
    dateRange: [now, end],
  })
}

function openCreate(template?: any) {
  editingCoupon.value = null
  resetForm()
  applyTemplate(template)
  showDialog.value = true
}

async function loadCoupons() {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/coupons', {
      params: { page: pagination.page, pageSize: pagination.pageSize, ...filters },
    })
    const page = unwrapPage(res)
    coupons.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载优惠券失败'))
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  filters.businessScope = ''
  filters.regionId = ''
  pagination.page = 1
  loadCoupons()
}

function editCoupon(coupon: any) {
  editingCoupon.value = coupon
  Object.assign(form, {
    name: coupon.name,
    type: String(coupon.type || 'DISCOUNT').toUpperCase(),
    businessScope: coupon.businessScope || 'all',
    value: Number(coupon.value || 0),
    minAmount: Number(coupon.minAmount || 0),
    totalCount: Number(coupon.totalCount || 1),
    limitPerUser: Number(coupon.limitPerUser || 1),
    regionId: coupon.regionId || '',
    merchantId: coupon.merchantId || '',
    dateRange: dateRangeFrom(coupon),
    description: coupon.description || '',
  })
  loadMerchants(coupon.regionId || '')
  showDialog.value = true
}

async function submitCoupon() {
  if (submitting.value) return
  if (!form.name.trim()) {
    ElMessage.warning('请填写优惠券名称')
    return
  }
  if (!form.dateRange?.[0] || !form.dateRange?.[1]) {
    ElMessage.warning('请选择有效期')
    return
  }
  if (!['DISCOUNT', 'FULL_REDUCTION', 'EXCHANGE'].includes(form.type)) {
    ElMessage.warning('请选择有效的优惠券类型')
    return
  }
  if (!Number.isFinite(form.value) || form.value <= 0 || form.value > 99999999.99 || (form.type === 'DISCOUNT' && form.value >= 10)) {
    ElMessage.warning(form.type === 'DISCOUNT' ? '折扣必须大于 0 且小于 10，例如 8 表示八折' : '请填写大于 0 的减免金额')
    return
  }
  const validMoney = (value: number) => Number.isFinite(value) && value >= 0 && value <= 99999999.99 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
  if (!validMoney(form.value) || !validMoney(form.minAmount)) {
    ElMessage.warning('面值和最低消费须为有效金额，最多保留两位小数')
    return
  }
  if (![form.totalCount, form.limitPerUser].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 2147483647) || form.totalCount < Number(editingCoupon.value?.receivedCount || 0)) {
    ElMessage.warning('总量和每人限领须为正整数，总量不能小于已领取数量')
    return
  }
  const startAt = new Date(form.dateRange[0])
  const endAt = new Date(form.dateRange[1])
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) {
    ElMessage.warning('请选择有效的起止时间')
    return
  }
  if (endAt.getTime() < startAt.getTime()) {
    ElMessage.warning('结束时间不能早于开始时间')
    return
  }
  submitting.value = true
  try {
    const payload = cleanPayload({
      name: form.name.trim(),
      type: form.type,
      businessScope: form.businessScope || 'all',
      value: form.value,
      minAmount: form.minAmount,
      totalCount: form.totalCount,
      limitPerUser: form.limitPerUser,
      regionId: form.regionId || null,
      merchantId: form.merchantId || null,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      description: form.description,
    })
    if (editingCoupon.value) {
      await request.put(`/admin/marketing/coupons/${editingCoupon.value.id}`, payload)
      ElMessage.success('优惠券已更新')
    } else {
      await request.post('/admin/marketing/coupons', payload)
      ElMessage.success('优惠券已创建')
    }
    showDialog.value = false
    await loadCoupons()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '保存优惠券失败'))
  } finally {
    submitting.value = false
  }
}

async function toggleStatus(coupon: any) {
  try {
    await request.put(`/admin/marketing/coupons/${coupon.id}/status`, {
      status: coupon.status === 'active' ? 'inactive' : 'active',
    })
    ElMessage.success('状态已更新')
    await loadCoupons()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '更新状态失败'))
  }
}

async function loadRegions() {
  try {
    regions.value = await fetchRegions()
  } catch {
    regions.value = []
  }
}

async function loadMerchants(regionId = '') {
  loadingMerchants.value = true
  try {
    const res = await request.get('/admin/merchants', {
      params: {
        page: 1,
        pageSize: 100,
        status: 'approved',
        regionId: regionId || undefined,
      },
    })
    merchants.value = unwrapPage(res).list
  } catch {
    merchants.value = []
  } finally {
    loadingMerchants.value = false
  }
}

async function handleRegionFilterChange() {
  form.merchantId = ''
  await loadMerchants(form.regionId)
}

onMounted(async () => {
  await Promise.all([loadRegions(), loadMerchants(), loadCoupons()])
  if (route.query.create === '1') {
    openCreate(route.query.template)
  }
})
</script>

<style scoped>
.marketing-page { padding: 24px; }
.marketing-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
}
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.filter-card,
.data-card {
  background: rgba(255,255,255,0.86);
  border: 1px solid #dbe7f5;
  border-radius: 14px;
  box-shadow: 0 14px 36px rgba(37, 99, 235, .08);
}
.filter-card {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 150px 150px 180px auto auto;
  gap: 12px;
  padding: 16px;
  margin-bottom: 18px;
}
.data-card { padding: 18px; }
.scope-cell { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: #94a3b8; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.coupon-value-hint { margin: -4px 0 12px 100px; color: #64748b; font-size: 12px; line-height: 20px; }
.dialog-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 12px; }
.dialog-grid :deep(.el-input-number) { width: 100%; min-width: 0; }
@media (max-width: 900px) {
  .filter-card { grid-template-columns: 1fr; }
  .dialog-grid { grid-template-columns: 1fr; }
}
</style>
