<template>
  <div class="page-shell">
    <PageHeader title="运费模板">
      <template #actions>
        <el-button type="primary" @click="showCreateDialog = true; resetForm()">
          <el-icon><Plus /></el-icon>
          新增模板
        </el-button>
      </template>
    </PageHeader>

    <el-table :data="templates" v-loading="loading" border stripe>
      <el-table-column prop="name" label="模板名称" min-width="200" />
      <el-table-column label="计费方式" width="100">
        <template #default="{ row }">
          {{ getChargingTypeLabel(getRuleField(row, 'chargingType')) }}
        </template>
      </el-table-column>
      <el-table-column label="首件/首重" width="100">
        <template #default="{ row }">
          {{ getRuleField(row, 'defaultFirstUnit') }}
        </template>
      </el-table-column>
      <el-table-column label="首费" width="100">
        <template #default="{ row }">¥{{ Number(getRuleField(row, 'defaultFirstFee') || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="续件/续重" width="100">
        <template #default="{ row }">
          {{ getRuleField(row, 'defaultContinueUnit') }}
        </template>
      </el-table-column>
      <el-table-column label="续费" width="100">
        <template #default="{ row }">¥{{ Number(getRuleField(row, 'defaultContinueFee') || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="包邮金额" width="100">
        <template #default="{ row }">
          {{ getRuleField(row, 'freeFreightAmount') ? `¥${Number(getRuleField(row, 'freeFreightAmount')).toFixed(2)}` : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="isDefault" label="默认模板" width="100">
        <template #default="{ row }">
          <el-tag :type="row.isDefault ? 'success' : 'info'" size="small">
            {{ row.isDefault ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="editTemplate(row)">编辑</el-button>
          <el-button size="small" :type="row.isDefault ? 'info' : 'success'" @click="setDefault(row)">
            {{ row.isDefault ? '取消默认' : '设为默认' }}
          </el-button>
          <el-button size="small" type="danger" @click="deleteTemplate(row)">删除</el-button>
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
        @size-change="loadTemplates"
        @current-change="loadTemplates"
      />
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="showCreateDialog" :title="editingTemplate ? '编辑模板' : '新增模板'" width="600px">
      <el-form :model="templateForm" label-width="120px">
        <el-form-item label="关联商户" required>
          <el-select v-model="templateForm.merchantId" placeholder="选择商户" filterable style="width: 100%">
            <el-option v-for="m in merchants" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板名称" required>
          <el-input v-model="templateForm.name" placeholder="请输入模板名称" />
        </el-form-item>
        <el-form-item label="计费方式" required>
          <el-radio-group v-model="templateForm.chargingType">
            <el-radio value="piece">按件</el-radio>
            <el-radio value="weight">按重量</el-radio>
            <el-radio value="volume">按体积</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="首件/首重" required>
          <el-input-number v-model="templateForm.defaultFirstUnit" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="首费" required>
          <el-input-number v-model="templateForm.defaultFirstFee" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="续件/续重" required>
          <el-input-number v-model="templateForm.defaultContinueUnit" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="续费" required>
          <el-input-number v-model="templateForm.defaultContinueFee" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="包邮金额">
          <el-input-number v-model="templateForm.freeFreightAmount" :min="0" :precision="2" style="width: 100%" />
          <div class="form-tip">设置包邮金额，0表示不包邮</div>
        </el-form-item>
        <el-form-item label="设为默认">
          <el-switch v-model="templateForm.isDefault" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitTemplate" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '@/api/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'

const loading = ref(false)
const templates = ref<any[]>([])
const merchants = ref<any[]>([])
const pagination = ref({ page: 1, pageSize: 20, total: 0 })
const showCreateDialog = ref(false)
const editingTemplate = ref<any>(null)
const submitting = ref(false)

const templateForm = ref({
  merchantId: '',
  name: '',
  chargingType: 'piece',
  defaultFirstUnit: 1,
  defaultFirstFee: 0,
  defaultContinueUnit: 1,
  defaultContinueFee: 0,
  freeFreightAmount: 0,
  isDefault: false,
})

const getRuleField = (row: any, field: string) => {
  const rules = row.rules || {}
  return rules[field] ?? row[field] ?? ''
}

const getChargingTypeLabel = (type: string) => {
  const map: Record<string, string> = { piece: '按件', weight: '按重量', volume: '按体积' }
  return map[type] || type || '按件'
}

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const resetForm = () => {
  templateForm.value = {
    merchantId: '',
    name: '',
    chargingType: 'piece',
    defaultFirstUnit: 1,
    defaultFirstFee: 0,
    defaultContinueUnit: 1,
    defaultContinueFee: 0,
    freeFreightAmount: 0,
    isDefault: false,
  }
  editingTemplate.value = null
}

const loadTemplates = async () => {
  loading.value = true
  try {
    const res = await request.get('/mall/freight/admin/template/list', {
      params: {
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
      },
    })
    const data = (res as any).data || res
    templates.value = data.list || []
    pagination.value.total = data.total || 0
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const editTemplate = (template: any) => {
  editingTemplate.value = template
  const rules = template.rules || {}
  templateForm.value = {
    merchantId: template.merchantId || '',
    name: template.name,
    chargingType: rules.chargingType || 'piece',
    defaultFirstUnit: rules.defaultFirstUnit || 1,
    defaultFirstFee: rules.defaultFirstFee || 0,
    defaultContinueUnit: rules.defaultContinueUnit || 1,
    defaultContinueFee: rules.defaultContinueFee || 0,
    freeFreightAmount: rules.freeFreightAmount || 0,
    isDefault: template.isDefault || false,
  }
  showCreateDialog.value = true
}

const submitTemplate = async () => {
  if (!templateForm.value.name.trim()) {
    ElMessage.warning('请输入模板名称')
    return
  }
  if (!templateForm.value.merchantId) {
    ElMessage.warning('请选择商户')
    return
  }
  submitting.value = true
  try {
    const payload = { ...templateForm.value }
    if (editingTemplate.value) {
      await request.put(`/mall/freight/admin/template/${editingTemplate.value.id}`, payload)
      ElMessage.success('更新成功')
    } else {
      await request.post('/mall/freight/admin/template/create', payload)
      ElMessage.success('创建成功')
    }
    showCreateDialog.value = false
    resetForm()
    loadTemplates()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

const setDefault = async (template: any) => {
  try {
    await request.put(`/mall/freight/admin/template/${template.id}`, { isDefault: !template.isDefault })
    ElMessage.success(template.isDefault ? '已取消默认' : '已设为默认')
    loadTemplates()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const deleteTemplate = async (template: any) => {
  try {
    await ElMessageBox.confirm('确定删除该运费模板吗？', '确认删除', { type: 'warning' })
    await request.delete(`/mall/freight/admin/template/${template.id}`)
    ElMessage.success('删除成功')
    loadTemplates()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
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
    ElMessage.warning('加载商户列表失败，运费模板无法选择商户')
  }
}

onMounted(() => {
  loadTemplates()
  loadMerchants()
})
</script>

<style scoped>
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
