<template>
  <div class="page-container">
    <div class="page-header">
      <h2>商户管理</h2>
    </div>

    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索商户名称"
        clearable
        style="width: 200px"
        @clear="loadMerchants"
        @keyup.enter="loadMerchants"
      />
      <el-select v-model="filters.status" placeholder="审核状态" clearable style="width: 120px" @change="loadMerchants">
        <el-option label="待审核" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已拒绝" value="rejected" />
        <el-option label="已关闭" value="closed" />
      </el-select>
      <el-button type="primary" @click="loadMerchants">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="merchants" v-loading="loading" border stripe>
      <el-table-column prop="name" label="商户名称" min-width="150" />
      <el-table-column prop="logo" label="Logo" width="80">
        <template #default="{ row }">
          <el-image v-if="row.logo" :src="row.logo" :preview-src-list="[row.logo]" style="width: 40px; height: 40px" fit="cover" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="联系电话" width="120" />
      <el-table-column prop="rating" label="评分" width="80">
        <template #default="{ row }">
          <el-rate v-model="row.rating" disabled :max="5" size="small" />
        </template>
      </el-table-column>
      <el-table-column prop="saleCount" label="销量" width="80" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="300" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
          <el-button size="small" @click="editMerchant(row)">编辑</el-button>
          <el-button v-if="row.status === 'pending'" size="small" type="success" @click="approveMerchant(row)">通过</el-button>
          <el-button v-if="row.status === 'pending'" size="small" type="warning" @click="rejectMerchant(row)">拒绝</el-button>
          <el-button v-if="row.status === 'approved'" size="small" type="danger" @click="closeMerchant(row)">关闭</el-button>
          <el-button v-if="row.status === 'closed' || row.status === 'rejected'" size="small" type="success" @click="restoreMerchant(row)">恢复</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadMerchants"
        @current-change="loadMerchants"
      />
    </div>

    <!-- Detail Dialog -->
    <el-dialog v-model="showDetailDialog" title="商户详情" width="700px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="商户名称">{{ selectedMerchant?.name }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ selectedMerchant?.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="Logo">
          <el-image v-if="selectedMerchant?.logo" :src="selectedMerchant.logo" style="width: 60px; height: 60px" fit="cover" />
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="封面图">
          <el-image v-if="selectedMerchant?.cover" :src="selectedMerchant.cover" style="width: 100px; height: 60px" fit="cover" />
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="地址" :span="2">{{ selectedMerchant?.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="经纬度">
          {{ selectedMerchant?.latitude || '-' }}, {{ selectedMerchant?.longitude || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="营业时间">{{ selectedMerchant?.businessHours || '-' }}</el-descriptions-item>
        <el-descriptions-item label="评分">{{ selectedMerchant?.rating }}</el-descriptions-item>
        <el-descriptions-item label="销量">{{ selectedMerchant?.saleCount }}</el-descriptions-item>
        <el-descriptions-item label="订单数">{{ selectedMerchant?.totalOrders || 0 }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(selectedMerchant?.status)">
            {{ getStatusLabel(selectedMerchant?.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="描述" :span="2">{{ selectedMerchant?.description || '-' }}</el-descriptions-item>
        <el-descriptions-item label="拒绝原因" :span="2" v-if="selectedMerchant?.rejectReason">
          {{ selectedMerchant.rejectReason }}
        </el-descriptions-item>
        <el-descriptions-item label="申请时间" :span="2">{{ formatDate(selectedMerchant?.createdAt) }}</el-descriptions-item>
      </el-descriptions>

      <div v-if="merchantStats" style="margin-top: 20px">
        <h4>商户统计</h4>
        <el-descriptions :column="3" border style="margin-top: 10px">
          <el-descriptions-item label="商品数">{{ merchantStats.products?.total_products || 0 }}</el-descriptions-item>
          <el-descriptions-item label="总订单">{{ merchantStats.orders?.total_orders || 0 }}</el-descriptions-item>
          <el-descriptions-item label="总销售额">¥{{ merchantStats.orders?.total_amount || '0.00' }}</el-descriptions-item>
          <el-descriptions-item label="今日订单">{{ merchantStats.todayOrders || 0 }}</el-descriptions-item>
          <el-descriptions-item label="今日销售额">¥{{ Number(merchantStats.todaySales || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="待发货">{{ merchantStats.pendingShip || 0 }}</el-descriptions-item>
          <el-descriptions-item label="评价数">{{ merchantStats.reviewCount || 0 }}</el-descriptions-item>
          <el-descriptions-item label="平均评分">{{ Number(merchantStats.avgRating || 0).toFixed(1) }}</el-descriptions-item>
          <el-descriptions-item label="待处理退款">{{ merchantStats.pendingRefund || 0 }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
        <el-button v-if="selectedMerchant?.status === 'pending'" type="success" @click="approveMerchant(selectedMerchant)">通过</el-button>
        <el-button v-if="selectedMerchant?.status === 'pending'" type="warning" @click="rejectMerchant(selectedMerchant)">拒绝</el-button>
      </template>
    </el-dialog>

    <!-- Edit Dialog -->
    <el-dialog v-model="showEditDialog" title="编辑商户" width="600px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="商户名称">
          <el-input v-model="editForm.name" placeholder="商户名称" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="editForm.phone" placeholder="联系电话" />
        </el-form-item>
        <el-form-item label="Logo">
          <ImageUploadBox
            v-model="editForm.logo"
            scene="mall-merchant-logo"
            shape="square"
            placeholder="上传商户 Logo"
            tip="建议 300x300，可替换和删除"
            :max-size="3"
          />
        </el-form-item>
        <el-form-item label="封面图">
          <ImageUploadBox
            v-model="editForm.cover"
            scene="mall-merchant-cover"
            shape="wide"
            placeholder="上传商户封面"
            tip="建议 750x350，可替换和删除"
            :max-size="5"
          />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="editForm.address" placeholder="详细地址" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="纬度">
              <el-input-number v-model="editForm.latitude" :precision="6" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="经度">
              <el-input-number v-model="editForm.longitude" :precision="6" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="营业时间">
          <el-input v-model="editForm.businessHours" placeholder="如：09:00-22:00" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" placeholder="商户描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="submitEdit" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

const loading = ref(false)
const submitting = ref(false)
const merchants = ref<any[]>([])
const filters = ref({ keyword: '', status: '' })
const pagination = ref({ page: 1, pageSize: 20, total: 0 })
const showDetailDialog = ref(false)
const showEditDialog = ref(false)
const selectedMerchant = ref<any>(null)
const merchantStats = ref<any>(null)

const editForm = reactive({
  id: '',
  name: '',
  phone: '',
  logo: '',
  cover: '',
  address: '',
  latitude: 0,
  longitude: 0,
  businessHours: '',
  description: '',
})

const getStatusType = (status: string) => {
  const map: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'danger', closed: 'info' }
  return map[status] || 'info'
}

const getStatusLabel = (status: string) => {
  const map: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝', closed: '已关闭' }
  return map[status] || status
}

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const loadMerchants = async () => {
  loading.value = true
  try {
    const res = await request.get('/mall/merchants/admin/list', {
      params: {
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
        ...filters.value,
      },
    })
    const data = (res as any).data || res
    merchants.value = data.list || []
    pagination.value.total = data.total || 0
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.value = { keyword: '', status: '' }
  loadMerchants()
}

const viewDetail = async (merchant: any) => {
  selectedMerchant.value = merchant
  showDetailDialog.value = true
  merchantStats.value = null
  try {
    const res = await request.get(`/mall/merchants/admin/${merchant.id}/stats`)
    merchantStats.value = (res as any).data || res
  } catch (e: any) {
    console.error('加载商户统计失败:', e)
    ElMessage.warning('加载商户统计数据失败')
  }
}

const editMerchant = (merchant: any) => {
  editForm.id = merchant.id
  editForm.name = merchant.name || ''
  editForm.phone = merchant.phone || ''
  editForm.logo = merchant.logo || ''
  editForm.cover = merchant.cover || ''
  editForm.address = merchant.address || ''
  editForm.latitude = merchant.latitude || 0
  editForm.longitude = merchant.longitude || 0
  editForm.businessHours = merchant.businessHours || ''
  editForm.description = merchant.description || ''
  showEditDialog.value = true
}

const submitEdit = async () => {
  submitting.value = true
  try {
    await request.put(`/mall/merchants/admin/${editForm.id}`, {
      name: editForm.name,
      phone: editForm.phone,
      logo: editForm.logo,
      cover: editForm.cover,
      address: editForm.address,
      latitude: editForm.latitude,
      longitude: editForm.longitude,
      businessHours: editForm.businessHours,
      description: editForm.description,
    })
    ElMessage.success('商户信息已更新')
    showEditDialog.value = false
    loadMerchants()
  } catch (error) {
    ElMessage.error('更新失败')
  } finally {
    submitting.value = false
  }
}

const approveMerchant = async (merchant: any) => {
  try {
    await ElMessageBox.confirm('确定通过该商户的入驻申请吗？', '确认操作', { type: 'warning' })
    await request.put(`/mall/merchants/admin/${merchant.id}/review`, { status: 'approved' })
    ElMessage.success('审核通过')
    showDetailDialog.value = false
    loadMerchants()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

const rejectMerchant = async (merchant: any) => {
  try {
    const { value: reason } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝商户', {
      inputPlaceholder: '拒绝原因',
      type: 'warning',
      inputValidator: (val) => !!val?.trim() || '请输入拒绝原因',
    })
    await request.put(`/mall/merchants/admin/${merchant.id}/review`, { status: 'rejected', rejectReason: reason })
    ElMessage.success('已拒绝')
    showDetailDialog.value = false
    loadMerchants()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

const closeMerchant = async (merchant: any) => {
  try {
    await ElMessageBox.confirm('确定关闭该商户吗？关闭后商户将无法营业。', '确认操作', { type: 'warning' })
    await request.put(`/mall/merchants/admin/${merchant.id}/review`, { status: 'closed' })
    ElMessage.success('已关闭')
    loadMerchants()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

const restoreMerchant = async (merchant: any) => {
  try {
    await ElMessageBox.confirm('确定恢复该商户吗？恢复后商户将可以正常营业。', '确认操作', { type: 'success' })
    await request.put(`/mall/merchants/admin/${merchant.id}/review`, { status: 'approved' })
    ElMessage.success('已恢复')
    loadMerchants()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

onMounted(() => {
  loadMerchants()
})
</script>

<style scoped>
.page-container {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
