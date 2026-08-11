<template>
  <div class="page-shell">
    <PageHeader title="平台价格规则" subtitle="影响用户支付价格，仅限授权运营人员配置" icon="PriceTag" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索规则名称" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.scope" placeholder="适用范围" clearable style="width: 140px" @change="loadData">
        <el-option label="全部" value="ALL" />
        <el-option label="区域" value="REGION" />
        <el-option label="分类" value="CATEGORY" />
        <el-option label="商家" value="MERCHANT" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="inactive" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="primary" @click="openEdit()">新增规则</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="name" label="规则名称" min-width="150" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="90">
        <template #default="{ row }">
          <el-tag size="small">{{ row.type === 'percentage' ? '百分比' : '固定金额' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="value" label="加价值" width="100">
        <template #default="{ row }">{{ row.type === 'percentage' ? `${row.value}%` : `¥${row.value}` }}</template>
      </el-table-column>
      <el-table-column prop="scope" label="适用范围" width="100">
        <template #default="{ row }">{{ scopeMap[row.scope] || row.scope }}</template>
      </el-table-column>
      <el-table-column prop="targetName" label="目标" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.targetName || row.region?.name || row.category?.name || row.merchant?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="priority" label="优先级" width="80" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">{{ row.status === 'active' ? '停用' : '启用' }}</el-button>
          <el-button size="small" type="danger" text @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>

    <el-dialog v-model="editVisible" :title="editingId ? '编辑规则' : '新增规则'" width="560px" :close-on-click-modal="false">
      <el-form :model="form" label-width="100px" :rules="rules" ref="formRef">
        <el-form-item label="规则名称" prop="name"><el-input v-model="form.name" placeholder="请输入规则名称" /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="类型" prop="type">
              <el-select v-model="form.type" style="width: 100%">
                <el-option label="百分比" value="percentage" />
                <el-option label="固定金额" value="fixed" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="加价值" prop="value">
              <el-input-number v-model="form.value" :precision="form.type === 'percentage' ? 2 : 2" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="适用范围" prop="scope">
          <el-select v-model="form.scope" style="width: 100%">
            <el-option label="全部" value="ALL" />
            <el-option label="区域" value="REGION" />
            <el-option label="分类" value="CATEGORY" />
            <el-option label="商家" value="MERCHANT" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.scope === 'REGION'" label="选择区域">
          <el-select v-model="form.regionId" placeholder="请选择区域" style="width: 100%" filterable>
            <el-option v-for="r in regionList" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.scope === 'CATEGORY'" label="选择分类">
          <el-select v-model="form.categoryId" placeholder="请选择分类" style="width: 100%" filterable>
            <el-option v-for="c in categoryList" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.scope === 'MERCHANT'" label="选择商家">
          <el-select v-model="form.merchantId" placeholder="请选择商家" style="width: 100%" filterable>
            <el-option v-for="m in merchantList" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级"><el-input-number v-model="form.priority" :min="0" :precision="0" style="width: 100%" /></el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio label="active">启用</el-radio>
            <el-radio label="inactive">停用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" placeholder="备注说明" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { getPriceAdjustments, createPriceAdjustment, updatePriceAdjustment, deletePriceAdjustment } from '@/api/merchant'
import { getMerchants, getCategories } from '@/api/merchant'
import { fetchRegions } from '@/api/admin'
import { ElMessage, ElMessageBox } from 'element-plus'

const scopeMap: Record<string, string> = { ALL: '全部', REGION: '区域', CATEGORY: '分类', MERCHANT: '商家' }

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', scope: '', status: '' })
const regionList = ref<any[]>([])
const categoryList = ref<any[]>([])
const merchantList = ref<any[]>([])

const editVisible = ref(false)
const editingId = ref('')
const form = reactive({ name: '', type: 'percentage', value: 0, scope: 'ALL', regionId: '', categoryId: '', merchantId: '', priority: 0, status: 'active', remark: '' })
const formRef = ref<any>(null)
const rules = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  value: [{ required: true, message: '请输入加价值', trigger: 'blur' }],
}

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getPriceAdjustments({ page: page.value, pageSize: pageSize.value, ...filters })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', scope: '', status: '' })
  page.value = 1
  loadData()
}

const loadOptions = async () => {
  try {
    regionList.value = await fetchRegions()
    const cRes: any = await getCategories()
    categoryList.value = cRes?.list || cRes?.data?.list || []
    const mRes: any = await getMerchants({ page: 1, pageSize: 500 })
    merchantList.value = mRes?.list || mRes?.data?.list || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载选项失败')
  }
}

const openEdit = (row?: any) => {
  editingId.value = row?.id || ''
  if (row) {
    Object.assign(form, { name: row.name, type: row.type, value: row.value, scope: row.scope, regionId: row.regionId || '', categoryId: row.categoryId || '', merchantId: row.merchantId || '', priority: row.priority || 0, status: row.status || 'active', remark: row.remark || '' })
  } else {
    Object.assign(form, { name: '', type: 'percentage', value: 0, scope: 'ALL', regionId: '', categoryId: '', merchantId: '', priority: 0, status: 'active', remark: '' })
  }
  editVisible.value = true
}

const submitEdit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const payload: any = { name: form.name, type: form.type, value: form.value, scope: form.scope, priority: form.priority, status: form.status, remark: form.remark }
    if (form.scope === 'REGION' && form.regionId) payload.regionId = form.regionId
    if (form.scope === 'CATEGORY' && form.categoryId) payload.categoryId = form.categoryId
    if (form.scope === 'MERCHANT' && form.merchantId) payload.merchantId = form.merchantId
    if (editingId.value) {
      await updatePriceAdjustment(editingId.value, payload)
      ElMessage.success('更新成功')
    } else {
      await createPriceAdjustment(payload)
      ElMessage.success('创建成功')
    }
    editVisible.value = false
    loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  }
}

const toggleStatus = async (row: any) => {
  try {
    const target = row.status === 'active' ? 'inactive' : 'active'
    await updatePriceAdjustment(row.id, { status: target })
    ElMessage.success('操作成功')
    loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  }
}

const del = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定删除该规则？', '确认', { type: 'warning' })
    await deletePriceAdjustment(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '删除失败')
  }
}

onMounted(() => { loadData(); loadOptions() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
