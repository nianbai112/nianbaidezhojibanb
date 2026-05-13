<template>
  <div class="page-container">
    <div class="page-header">
      <h2>优惠券管理</h2>
      <el-button type="primary" @click="showCreateDialog = true">创建优惠券</el-button>
    </div>

    <div class="glass-card">
      <el-table :data="coupons" v-loading="loading">
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ row.type === 'discount' ? '折扣' : row.type === 'full_reduction' ? '满减' : '兑换' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="value" label="值" width="100" />
        <el-table-column prop="totalCount" label="总量" width="80" />
        <el-table-column prop="receivedCount" label="已领" width="80" />
        <el-table-column prop="usedCount" label="已用" width="80" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" @click="editCoupon(row)">编辑</el-button>
            <el-button size="small" :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" :title="editingCoupon ? '编辑优惠券' : '创建优惠券'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="优惠券名称" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="折扣" value="discount" />
            <el-option label="满减" value="full_reduction" />
            <el-option label="兑换" value="exchange" />
          </el-select>
        </el-form-item>
        <el-form-item label="值">
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
        <el-form-item label="有效期">
          <el-date-picker v-model="form.dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width: 100%" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitCoupon" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const submitting = ref(false)
const showCreateDialog = ref(false)
const editingCoupon = ref<any>(null)
const coupons = ref<any[]>([])

const form = reactive({
  name: '',
  type: 'discount',
  value: 0,
  minAmount: 0,
  totalCount: 100,
  limitPerUser: 1,
  dateRange: null as any,
  description: '',
})

const loadCoupons = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/marketing/coupons')
    coupons.value = res.data?.list || []
  } catch (error) {
    ElMessage.error('加载优惠券失败')
  } finally {
    loading.value = false
  }
}

const editCoupon = (coupon: any) => {
  editingCoupon.value = coupon
  form.name = coupon.name
  form.type = coupon.type
  form.value = coupon.value
  form.minAmount = coupon.minAmount
  form.totalCount = coupon.totalCount
  form.limitPerUser = coupon.limitPerUser
  form.description = coupon.description
  showCreateDialog.value = true
}

const submitCoupon = async () => {
  submitting.value = true
  try {
    const data = {
      ...form,
      startAt: form.dateRange?.[0]?.toISOString(),
      endAt: form.dateRange?.[1]?.toISOString(),
    }
    if (editingCoupon.value) {
      await request.put(`/admin/marketing/coupons/${editingCoupon.value.id}`, data)
      ElMessage.success('优惠券已更新')
    } else {
      await request.post('/admin/marketing/coupons', data)
      ElMessage.success('优惠券已创建')
    }
    showCreateDialog.value = false
    editingCoupon.value = null
    loadCoupons()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

const toggleStatus = async (coupon: any) => {
  try {
    await request.put(`/admin/marketing/coupons/${coupon.id}/status`, {
      status: coupon.status === 'active' ? 'inactive' : 'active',
    })
    ElMessage.success('状态已更新')
    loadCoupons()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

onMounted(() => { loadCoupons() })
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; padding: 20px; }
</style>
