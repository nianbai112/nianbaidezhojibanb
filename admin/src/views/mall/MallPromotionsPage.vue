<template>
  <div class="page-container">
    <div class="page-header">
      <h2>促销活动</h2>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新增活动
      </el-button>
    </div>

    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索活动名称"
        clearable
        style="width: 200px"
        @clear="loadPromotions"
        @keyup.enter="loadPromotions"
      />
      <el-select v-model="filters.status" placeholder="活动状态" clearable style="width: 120px" @change="loadPromotions">
        <el-option label="进行中" value="active" />
        <el-option label="已禁用" value="inactive" />
        <el-option label="已结束" value="ended" />
      </el-select>
      <el-button type="primary" @click="loadPromotions">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="promotions" v-loading="loading" border stripe>
      <el-table-column prop="name" label="活动名称" min-width="150" />
      <el-table-column prop="type" label="活动类型" width="100">
        <template #default="{ row }">
          <el-tag :type="row.type === 'full_reduction' ? 'success' : 'warning'" size="small">
            {{ row.type === 'full_reduction' ? '满减' : '折扣' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="活动规则" min-width="150">
        <template #default="{ row }">
          <span v-if="row.type === 'full_reduction'">
            满{{ row.rules?.full || 0 }}减{{ row.rules?.reduction || 0 }}
          </span>
          <span v-else>
            {{ row.rules?.discount || 10 }}折
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="startAt" label="开始时间" width="160">
        <template #default="{ row }">{{ formatDate(row.startAt) }}</template>
      </el-table-column>
      <el-table-column prop="endAt" label="结束时间" width="160">
        <template #default="{ row }">{{ formatDate(row.endAt) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="160">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="editPromotion(row)">编辑</el-button>
          <el-button
            size="small"
            :type="row.status === 'active' ? 'warning' : 'success'"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" type="danger" @click="deletePromotion(row)">删除</el-button>
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
        @size-change="loadPromotions"
        @current-change="loadPromotions"
      />
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="showCreateDialog" :title="editingPromotion ? '编辑活动' : '新增活动'" width="600px">
      <el-form :model="promotionForm" label-width="100px">
        <el-form-item label="活动名称" required>
          <el-input v-model="promotionForm.name" placeholder="请输入活动名称" />
        </el-form-item>
        <el-form-item label="活动类型" required>
          <el-radio-group v-model="promotionForm.type">
            <el-radio value="full_reduction">满减</el-radio>
            <el-radio value="discount">折扣</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="promotionForm.type === 'full_reduction'" label="满减规则" required>
          <div style="display: flex; gap: 10px; align-items: center;">
            <span>满</span>
            <el-input-number v-model="promotionForm.rules.full" :min="0" :precision="2" placeholder="满减金额" />
            <span>减</span>
            <el-input-number v-model="promotionForm.rules.reduction" :min="0" :precision="2" placeholder="减免金额" />
          </div>
        </el-form-item>
        <el-form-item v-else label="折扣规则" required>
          <div style="display: flex; gap: 10px; align-items: center;">
            <el-input-number v-model="promotionForm.rules.discount" :min="0.1" :max="9.9" :precision="1" :step="0.5" />
            <span>折</span>
          </div>
        </el-form-item>
        <el-form-item label="开始时间" required>
          <el-date-picker
            v-model="promotionForm.startAt"
            type="datetime"
            placeholder="选择开始时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束时间" required>
          <el-date-picker
            v-model="promotionForm.endAt"
            type="datetime"
            placeholder="选择结束时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="关联商户">
          <el-select v-model="promotionForm.merchantId" placeholder="选择商户（不选则全局）" clearable filterable style="width: 100%">
            <el-option v-for="m in merchants" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="promotionForm.status" style="width: 100%">
            <el-option label="启用" value="active" />
            <el-option label="禁用" value="inactive" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitPromotion" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const submitting = ref(false)
const showCreateDialog = ref(false)
const editingPromotion = ref<any>(null)
const promotions = ref<any[]>([])
const merchants = ref<any[]>([])

const filters = reactive({
  keyword: '',
  status: '',
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const promotionForm = reactive({
  name: '',
  type: 'full_reduction',
  rules: { full: 0, reduction: 0, discount: 9 },
  startAt: '',
  endAt: '',
  merchantId: '',
  status: 'active',
})

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const loadPromotions = async () => {
  loading.value = true
  try {
    const res = await request.get('/mall/promotions/admin/list', {
      params: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters,
      },
    })
    const data = (res as any).data || res
    promotions.value = data.list || []
    pagination.total = data.total || 0
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const loadMerchants = async () => {
  try {
    const res = await request.get('/mall/merchants/admin/list', {
      params: { page: 1, pageSize: 100 },
    })
    const data = (res as any).data || res
    merchants.value = data.list || []
  } catch (e: any) {
    console.error('加载商户列表失败:', e)
    ElMessage.warning('加载商户列表失败，活动无法选择商户')
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.status = ''
  loadPromotions()
}

const editPromotion = (promotion: any) => {
  editingPromotion.value = promotion
  promotionForm.name = promotion.name
  promotionForm.type = promotion.type
  promotionForm.rules = promotion.rules || { full: 0, reduction: 0, discount: 9 }
  promotionForm.startAt = promotion.startAt
  promotionForm.endAt = promotion.endAt
  promotionForm.merchantId = promotion.merchantId || ''
  promotionForm.status = promotion.status
  showCreateDialog.value = true
}

const submitPromotion = async () => {
  if (!promotionForm.name.trim()) {
    ElMessage.warning('请输入活动名称')
    return
  }
  if (!promotionForm.startAt || !promotionForm.endAt) {
    ElMessage.warning('请选择活动时间')
    return
  }
  submitting.value = true
  try {
    const data = {
      ...promotionForm,
      startAt: new Date(promotionForm.startAt).toISOString(),
      endAt: new Date(promotionForm.endAt).toISOString(),
    }
    if (editingPromotion.value) {
      await request.put(`/mall/promotions/admin/${editingPromotion.value.id}`, data)
      ElMessage.success('更新成功')
    } else {
      await request.post('/mall/promotions/admin/create', data)
      ElMessage.success('创建成功')
    }
    showCreateDialog.value = false
    editingPromotion.value = null
    resetForm()
    loadPromotions()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

const toggleStatus = async (promotion: any) => {
  const newStatus = promotion.status === 'active' ? 'inactive' : 'active'
  try {
    await request.put(`/mall/promotions/admin/${promotion.id}`, { status: newStatus })
    ElMessage.success('状态更新成功')
    loadPromotions()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const deletePromotion = async (promotion: any) => {
  try {
    await ElMessageBox.confirm('确定删除该促销活动吗？', '确认删除', { type: 'warning' })
    await request.delete(`/mall/promotions/admin/${promotion.id}`)
    ElMessage.success('删除成功')
    loadPromotions()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const resetForm = () => {
  promotionForm.name = ''
  promotionForm.type = 'full_reduction'
  promotionForm.rules = { full: 0, reduction: 0, discount: 9 }
  promotionForm.startAt = ''
  promotionForm.endAt = ''
  promotionForm.merchantId = ''
  promotionForm.status = 'active'
}

onMounted(() => {
  loadPromotions()
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
  flex-wrap: wrap;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
