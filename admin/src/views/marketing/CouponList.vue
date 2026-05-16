<template>
  <div class="marketing-page">
    <div class="marketing-header">
      <div>
        <p class="eyebrow">营销增长 / 优惠券</p>
        <h2>优惠券管理</h2>
        <p>真实读取优惠券、领取量和使用量，支持创建、编辑、启停。</p>
      </div>
      <el-button type="primary" @click="openCreate">创建优惠券</el-button>
    </div>

    <div class="filter-card">
      <el-input v-model="filters.keyword" clearable placeholder="搜索优惠券名称" @keyup.enter="loadCoupons" />
      <el-select v-model="filters.status" clearable placeholder="状态">
        <el-option label="启用" value="active" />
        <el-option label="禁用" value="inactive" />
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
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editCoupon(row)">编辑</el-button>
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
          @current-change="loadCoupons"
          @size-change="loadCoupons"
        />
      </div>
    </div>

    <el-dialog v-model="showDialog" :title="editingCoupon ? '编辑优惠券' : '创建优惠券'" width="640px">
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
        <div class="dialog-grid">
          <el-form-item label="面值">
            <el-input-number v-model="form.value" :min="0" :precision="2" />
          </el-form-item>
          <el-form-item label="最低消费">
            <el-input-number v-model="form.minAmount" :min="0" :precision="2" />
          </el-form-item>
          <el-form-item label="总量">
            <el-input-number v-model="form.totalCount" :min="1" />
          </el-form-item>
          <el-form-item label="每人限领">
            <el-input-number v-model="form.limitPerUser" :min="1" />
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
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import { cleanPayload, dateRangeFrom, errorMessage, formatMoney, formatTime, unwrapPage } from './utils'

const loading = ref(false)
const submitting = ref(false)
const showDialog = ref(false)
const editingCoupon = ref<any>(null)
const coupons = ref<any[]>([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const filters = reactive({ keyword: '', status: '' })

const form = reactive({
  name: '',
  type: 'DISCOUNT',
  value: 0,
  minAmount: 0,
  totalCount: 100,
  limitPerUser: 1,
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

function resetForm() {
  Object.assign(form, {
    name: '',
    type: 'DISCOUNT',
    value: 0,
    minAmount: 0,
    totalCount: 100,
    limitPerUser: 1,
    dateRange: null,
    description: '',
  })
}

function openCreate() {
  editingCoupon.value = null
  resetForm()
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
  pagination.page = 1
  loadCoupons()
}

function editCoupon(coupon: any) {
  editingCoupon.value = coupon
  Object.assign(form, {
    name: coupon.name,
    type: coupon.type || 'DISCOUNT',
    value: Number(coupon.value || 0),
    minAmount: Number(coupon.minAmount || 0),
    totalCount: Number(coupon.totalCount || 1),
    limitPerUser: Number(coupon.limitPerUser || 1),
    dateRange: dateRangeFrom(coupon),
    description: coupon.description || '',
  })
  showDialog.value = true
}

async function submitCoupon() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写优惠券名称')
    return
  }
  if (!form.dateRange?.[0] || !form.dateRange?.[1]) {
    ElMessage.warning('请选择有效期')
    return
  }
  submitting.value = true
  try {
    const payload = cleanPayload({
      name: form.name.trim(),
      type: form.type,
      value: form.value,
      minAmount: form.minAmount,
      totalCount: form.totalCount,
      limitPerUser: form.limitPerUser,
      startAt: form.dateRange[0].toISOString(),
      endAt: form.dateRange[1].toISOString(),
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

onMounted(loadCoupons)
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
  border-radius: 16px;
  box-shadow: 0 14px 36px rgba(37, 99, 235, .08);
}
.filter-card {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 180px auto auto;
  gap: 12px;
  padding: 16px;
  margin-bottom: 18px;
}
.data-card { padding: 18px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
@media (max-width: 900px) {
  .filter-card { grid-template-columns: 1fr; }
  .dialog-grid { grid-template-columns: 1fr; }
}
</style>
