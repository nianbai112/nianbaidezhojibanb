<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 兑换码</p>
        <h2>卡券兑换码</h2>
        <p>为优惠券生成独立兑换码，支持区域、有效期、次数和兑换记录管理。</p>
      </div>
      <el-button type="primary" @click="openCreate">生成兑换码</el-button>
    </div>

    <div class="filter-card">
      <el-input v-model="filters.keyword" clearable placeholder="搜索兑换码/批次" @keyup.enter="loadCodes" />
      <el-select v-model="filters.regionId" clearable filterable placeholder="区域">
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-select v-model="filters.couponId" clearable filterable placeholder="绑定优惠券">
        <el-option v-for="coupon in coupons" :key="coupon.id" :label="couponLabel(coupon)" :value="coupon.id" />
      </el-select>
      <el-select v-model="filters.status" clearable placeholder="状态">
        <el-option label="启用" value="active" />
        <el-option label="禁用" value="disabled" />
      </el-select>
      <el-button type="primary" @click="loadCodes">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="data-card">
      <el-alert
        v-if="createdCodes.length"
        class="created-alert"
        type="success"
        show-icon
        :closable="true"
        title="本次生成的兑换码"
        @close="createdCodes = []"
      >
        <template #default>
          <div class="created-codes">
            <el-tag v-for="item in createdCodes" :key="item" effect="plain">{{ item }}</el-tag>
            <el-button size="small" @click="copyCreatedCodes">复制全部</el-button>
          </div>
        </template>
      </el-alert>
      <el-table :data="codes" v-loading="loading" empty-text="暂无兑换码">
        <el-table-column prop="code" label="兑换码" min-width="170" />
        <el-table-column prop="batchName" label="批次" min-width="150" />
        <el-table-column label="优惠券" min-width="180">
          <template #default="{ row }">{{ row.coupon?.name || row.couponId }}</template>
        </el-table-column>
        <el-table-column label="区域" min-width="130">
          <template #default="{ row }">{{ row.coupon?.region?.name || regionName(row.regionId) }}</template>
        </el-table-column>
        <el-table-column label="使用" width="110">
          <template #default="{ row }">{{ row.usedCount || 0 }} / {{ row.totalLimit || 0 }}</template>
        </el-table-column>
        <el-table-column label="每人" width="80" prop="perUserLimit" />
        <el-table-column label="有效期" min-width="230">
          <template #default="{ row }">{{ formatTime(row.startAt) }} 至 {{ formatTime(row.endAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status === 'active' ? '启用' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">
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
          @current-change="loadCodes"
          @size-change="loadCodes"
        />
      </div>
    </div>

    <div class="data-card records-card">
      <div class="sub-title">兑换记录</div>
      <el-table :data="records" v-loading="recordLoading" empty-text="暂无兑换记录">
        <el-table-column label="兑换码" min-width="160">
          <template #default="{ row }">{{ row.redeemCode?.code || row.redeemCodeId }}</template>
        </el-table-column>
        <el-table-column label="优惠券" min-width="170">
          <template #default="{ row }">{{ row.redeemCode?.coupon?.name || row.couponId }}</template>
        </el-table-column>
        <el-table-column prop="userId" label="用户ID" min-width="190" />
        <el-table-column prop="receiveId" label="卡券记录" min-width="190" />
        <el-table-column label="时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showDialog" title="生成兑换码" width="640px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="绑定优惠券" required>
          <el-select v-model="form.couponId" filterable placeholder="请选择优惠券" style="width: 100%" @change="syncCouponTime">
            <el-option v-for="coupon in coupons" :key="coupon.id" :label="couponLabel(coupon)" :value="coupon.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属区域">
          <el-select v-model="form.regionId" clearable filterable placeholder="默认跟随优惠券区域；全平台券可指定区域" style="width: 100%">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <div class="dialog-grid">
          <el-form-item label="批次名称">
            <el-input v-model="form.batchName" placeholder="如：开学礼包" />
          </el-form-item>
          <el-form-item label="生成数量">
            <el-input-number v-model="form.count" :min="1" :max="500" />
          </el-form-item>
          <el-form-item label="指定兑换码">
            <el-input v-model="form.code" placeholder="单个码可手填" />
          </el-form-item>
          <el-form-item label="随机前缀">
            <el-input v-model="form.prefix" placeholder="如 NEW" />
          </el-form-item>
          <el-form-item label="总可兑次数">
            <el-input-number v-model="form.totalLimit" :min="1" />
          </el-form-item>
          <el-form-item label="每人次数">
            <el-input-number v-model="form.perUserLimit" :min="1" />
          </el-form-item>
        </div>
        <el-form-item label="有效期">
          <el-date-picker v-model="form.dateRange" type="datetimerange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="内部备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCodes">生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import { fetchRegions } from '@/api/admin'
import { cleanPayload, dateRangeFrom, errorMessage, formatTime, unwrapPage } from './utils'

const loading = ref(false)
const recordLoading = ref(false)
const submitting = ref(false)
const showDialog = ref(false)
const codes = ref<any[]>([])
const records = ref<any[]>([])
const coupons = ref<any[]>([])
const regions = ref<any[]>([])
const createdCodes = ref<string[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const filters = reactive({ keyword: '', regionId: '', couponId: '', status: '' })
const form = reactive({
  couponId: '',
  regionId: '',
  batchName: '',
  count: 1,
  code: '',
  prefix: '',
  totalLimit: 1,
  perUserLimit: 1,
  dateRange: null as any,
  remark: '',
})

function regionName(regionId: string) {
  if (!regionId) return '全区域'
  const region = regions.value.find(item => String(item.id) === String(regionId))
  return region?.name || regionId
}

const businessScopeLabels: Record<string, string> = {
  all: '通用',
  shop: '外卖/小店',
  mall: '商城',
  errand: '跑腿',
  activity: '活动',
  membership: '会员权益',
}

function businessScopeLabel(scope: any) {
  return businessScopeLabels[String(scope || 'all')] || '通用'
}

function couponLabel(coupon: any) {
  const scope = coupon?.region?.name || regionName(coupon?.regionId)
  return `${coupon.name} · ${businessScopeLabel(coupon?.businessScope)} · ${scope}`
}

async function loadRegions() {
  try {
    regions.value = await fetchRegions()
  } catch (error: any) {
    regions.value = []
    ElMessage.warning(errorMessage(error, '加载区域失败'))
  }
}

async function loadCoupons() {
  const res = await request.get('/admin/marketing/coupons', { params: { page: 1, pageSize: 200, status: 'active' } })
  coupons.value = unwrapPage(res).list
}

async function loadCodes() {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/coupon-redeem-codes', {
      params: { page: pagination.page, pageSize: pagination.pageSize, ...filters },
    })
    const page = unwrapPage(res)
    codes.value = page.list
    pagination.total = page.total
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '加载兑换码失败'))
  } finally {
    loading.value = false
  }
}

async function loadRecords() {
  recordLoading.value = true
  try {
    records.value = unwrapPage(await request.get('/admin/marketing/coupon-redeem-records', { params: { page: 1, pageSize: 20 } })).list
  } catch {
    records.value = []
  } finally {
    recordLoading.value = false
  }
}

function resetFilters() {
  Object.assign(filters, { keyword: '', regionId: '', couponId: '', status: '' })
  pagination.page = 1
  loadCodes()
}

function openCreate() {
  Object.assign(form, { couponId: '', regionId: filters.regionId || '', batchName: '', count: 1, code: '', prefix: '', totalLimit: 1, perUserLimit: 1, dateRange: null, remark: '' })
  createdCodes.value = []
  showDialog.value = true
}

function syncCouponTime() {
  const coupon = coupons.value.find(item => item.id === form.couponId)
  if (coupon) {
    form.dateRange = dateRangeFrom(coupon)
    if (coupon.regionId) form.regionId = coupon.regionId
  }
}

async function copyCreatedCodes() {
  const text = createdCodes.value.join('\n')
  try {
    await navigator.clipboard?.writeText(text)
    ElMessage.success('已复制兑换码')
  } catch {
    ElMessage.info(text)
  }
}

async function submitCodes() {
  if (!form.couponId) {
    ElMessage.warning('请选择绑定优惠券')
    return
  }
  if (form.code && form.count > 1) {
    ElMessage.warning('指定兑换码时只能生成 1 个')
    return
  }
  submitting.value = true
  try {
    const res = await request.post('/admin/marketing/coupon-redeem-codes', cleanPayload({
      couponId: form.couponId,
      regionId: form.regionId,
      batchName: form.batchName,
      count: form.count,
      code: form.code,
      prefix: form.prefix,
      totalLimit: form.totalLimit,
      perUserLimit: form.perUserLimit,
      startAt: form.dateRange?.[0]?.toISOString(),
      endAt: form.dateRange?.[1]?.toISOString(),
      remark: form.remark,
    }))
    const result = res?.data?.data || res?.data || {}
    createdCodes.value = Array.isArray(result.codes) ? result.codes : []
    ElMessage.success(`兑换码已生成${result.count ? ` ${result.count} 个` : ''}`)
    showDialog.value = false
    await Promise.all([loadCodes(), loadRecords()])
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '生成兑换码失败'))
  } finally {
    submitting.value = false
  }
}

async function toggleStatus(row: any) {
  try {
    await request.put(`/admin/marketing/coupon-redeem-codes/${row.id}/status`, { status: row.status === 'active' ? 'disabled' : 'active' })
    ElMessage.success('状态已更新')
    await loadCodes()
  } catch (error: any) {
    ElMessage.error(errorMessage(error, '更新状态失败'))
  }
}

onMounted(async () => {
  await Promise.all([loadRegions(), loadCoupons()])
  await Promise.all([loadCodes(), loadRecords()])
})
</script>

<style scoped>
.marketing-page { padding: 24px; }
.marketing-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.marketing-header h2 { margin: 4px 0; font-size: 28px; color: #0f172a; }
.marketing-header p { margin: 0; color: #64748b; font-weight: 700; }
.eyebrow { color: #2563eb !important; font-size: 13px; }
.filter-card,
.data-card { background: rgba(255,255,255,0.86); border: 1px solid #dbe7f5; border-radius: 14px; box-shadow: 0 14px 36px rgba(37,99,235,.08); }
.filter-card { display: grid; grid-template-columns: minmax(220px,1fr) 180px 220px 150px auto auto; gap: 12px; padding: 16px; margin-bottom: 18px; }
.data-card { padding: 18px; }
.created-alert { margin-bottom: 14px; }
.created-codes { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.records-card { margin-top: 18px; }
.sub-title { margin-bottom: 12px; font-weight: 900; color: #0f172a; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
@media (max-width: 900px) {
  .filter-card, .dialog-grid { grid-template-columns: 1fr; }
}
</style>
