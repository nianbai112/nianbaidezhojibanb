<template>
  <div class="page-shell">
    <PageHeader title="商品管理" subtitle="管理商家商品" icon="Goods" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索商品名称" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.merchantId" placeholder="商家" clearable filterable style="width: 160px" @change="loadData">
        <el-option v-for="m in merchantList" :key="m.id" :label="m.name" :value="m.id" />
      </el-select>
      <el-select v-model="filters.categoryId" placeholder="分类" clearable filterable style="width: 140px" @change="loadData">
        <el-option v-for="c in categoryList" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="上架" value="on_sale" />
        <el-option label="下架" value="off_sale" />
        <el-option label="已删除" value="deleted" />
      </el-select>
      <el-select v-model="filters.stockAlert" placeholder="库存预警" clearable style="width: 120px" @change="loadData">
        <el-option label="库存不足" :value="true" />
        <el-option label="正常" :value="false" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="success" @click="openEdit()">新增商品</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="images" label="商品图" width="80">
        <template #default="{ row }">
          <el-image v-if="Array.isArray(row.images) && row.images.length" :src="row.images[0]" style="width: 50px; height: 50px; border-radius: 4px;" />
          <span v-else-if="row.image || row.cover" :src="row.image || row.cover" style="width: 50px; height: 50px; border-radius: 4px;" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="商品名" min-width="150" show-overflow-tooltip />
      <el-table-column prop="merchantName" label="商家" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.merchantName || row.merchant?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="categoryName" label="分类" width="100" show-overflow-tooltip>
        <template #default="{ row }">{{ row.categoryName || row.category?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="price" label="售价" width="100">
        <template #default="{ row }">¥{{ Number(row.price || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="originPrice" label="原价" width="100">
        <template #default="{ row }">¥{{ Number(row.originPrice || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="stock" label="库存" width="80" />
      <el-table-column prop="saleCount" label="销量" width="80">
        <template #default="{ row }">{{ row.saleCount || row.sales || 0 }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'on_sale' ? 'success' : 'info'" size="small">{{ row.status === 'on_sale' ? '上架' : row.status === 'off_sale' ? '下架' : row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" width="170">
        <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" :type="row.status === 'on_sale' ? 'warning' : 'success'" @click="toggleStatus(row)">{{ row.status === 'on_sale' ? '下架' : '上架' }}</el-button>
          <el-button v-if="row.auditStatus === 'pending'" size="small" type="success" @click="audit(row, 'approved')">通过</el-button>
          <el-button v-if="row.auditStatus === 'pending'" size="small" type="danger" @click="audit(row, 'rejected')">拒绝</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>

    <el-dialog v-model="editVisible" :title="editingId ? '编辑商品' : '新增商品'" width="720px" :close-on-click-modal="false">
      <el-form :model="form" label-width="100px" :rules="rules" ref="formRef">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="所属商家" prop="merchantId">
              <el-select v-model="form.merchantId" placeholder="请选择商家" style="width: 100%" filterable>
                <el-option v-for="m in merchantList" :key="m.id" :label="m.name" :value="m.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="商品分类" prop="categoryId">
              <el-select v-model="form.categoryId" placeholder="请选择分类" style="width: 100%" filterable>
                <el-option v-for="c in categoryList" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="商品名称" prop="name"><el-input v-model="form.name" placeholder="请输入商品名称" /></el-form-item>
        <el-form-item label="商品图片">
          <div class="image-list">
            <div v-for="(img, idx) in form.images" :key="idx" class="img-item">
              <el-image :src="img" style="width: 80px; height: 80px; border-radius: 4px;" />
              <el-button size="small" type="danger" text @click="removeImage(idx)">删除</el-button>
            </div>
            <div class="product-image-uploader">
              <ImageUploadBox
                :model-value="productImageUploadValue"
                scene="merchant-product"
                shape="square"
                placeholder="上传商品图"
                tip="上传后自动加入列表"
                :max-size="5"
                @update:model-value="appendProductImage"
              />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="商品详情"><el-input v-model="form.detail" type="textarea" :rows="3" placeholder="商品详情（支持HTML）" /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="售价" prop="price"><el-input-number v-model="form.price" :precision="2" :min="0" style="width: 100%" /></el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="原价"><el-input-number v-model="form.originPrice" :precision="2" :min="0" style="width: 100%" /></el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="库存" prop="stock"><el-input-number v-model="form.stock" :min="0" :precision="0" style="width: 100%" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="单位"><el-input v-model="form.unit" placeholder="如：份、个、斤" /></el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="重量(g)"><el-input-number v-model="form.weight" :min="0" :precision="0" style="width: 100%" /></el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width: 100%">
                <el-option label="上架" value="on_sale" />
                <el-option label="下架" value="off_sale" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="SKU/规格">
          <div v-for="(sku, idx) in form.skus" :key="idx" class="sku-row">
            <el-input v-model="sku.name" placeholder="规格名" style="width: 120px;" />
            <el-input-number v-model="sku.price" :precision="2" :min="0" placeholder="售价" style="width: 100px;" />
            <el-input-number v-model="sku.originPrice" :precision="2" :min="0" placeholder="原价" style="width: 100px;" />
            <el-input-number v-model="sku.stock" :min="0" :precision="0" placeholder="库存" style="width: 100px;" />
            <el-select v-model="sku.status" placeholder="状态" style="width: 90px;">
              <el-option label="启用" value="active" />
              <el-option label="停用" value="inactive" />
            </el-select>
            <el-button size="small" type="danger" text @click="form.skus.splice(idx, 1)">删除</el-button>
          </div>
          <el-button size="small" @click="form.skus.push({ name: '', price: 0, originPrice: 0, stock: 0, status: 'active' })">添加规格</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { getProducts, createProduct, updateProduct, updateProductStatus, auditProduct, getCategories, getMerchants, getProductStockAlerts } from '@/api/merchant'
import { ElMessage, ElMessageBox } from 'element-plus'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', merchantId: '', categoryId: '', status: '', stockAlert: '' as any })
const merchantList = ref<any[]>([])
const categoryList = ref<any[]>([])

const editVisible = ref(false)
const editingId = ref('')
const form = reactive<any>({ merchantId: '', categoryId: '', name: '', images: [], detail: '', price: 0, originPrice: 0, stock: 0, unit: '', weight: 0, status: 'on_sale', skus: [] })
const formRef = ref<any>(null)
const productImageUploadValue = ref('')
const rules = {
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  merchantId: [{ required: true, message: '请选择商家', trigger: 'change' }],
  categoryId: [{ required: true, message: '请选择分类', trigger: 'change' }],
  price: [{ required: true, message: '请输入售价', trigger: 'blur' }],
  stock: [{ required: true, message: '请输入库存', trigger: 'blur' }],
}

const formatDate = (d: any) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const loadData = async () => {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value, keyword: filters.keyword, merchantId: filters.merchantId, categoryId: filters.categoryId, status: filters.status }
    if (filters.stockAlert === true) {
      const alertRes: any = await getProductStockAlerts({ pageSize: 100 })
      const alertIds = (alertRes?.list || alertRes?.data?.list || []).map((p: any) => p.id)
      if (!alertIds.length) { list.value = []; total.value = 0; loading.value = false; return }
      // 简化：直接请求库存预警列表并展示
      list.value = alertRes?.list || alertRes?.data?.list || []
      total.value = alertRes?.total ?? alertRes?.data?.total ?? 0
      loading.value = false
      return
    }
    const res: any = await getProducts(params)
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载商品列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', merchantId: '', categoryId: '', status: '', stockAlert: '' })
  page.value = 1
  loadData()
}

const loadOptions = async () => {
  try {
    const mRes: any = await getMerchants({ page: 1, pageSize: 500 })
    merchantList.value = mRes?.list || mRes?.data?.list || []
    const cRes: any = await getCategories()
    categoryList.value = cRes?.list || cRes?.data?.list || []
  } catch (e: any) {
    ElMessage.error(e?.message || '加载选项失败')
  }
}

const openEdit = (row?: any) => {
  editingId.value = row?.id || ''
  if (row) {
    Object.assign(form, {
      merchantId: row.merchantId || '', categoryId: row.categoryId || '', name: row.name || '',
      images: Array.isArray(row.images) ? [...row.images] : row.image ? [row.image] : [],
      detail: row.detail || '', price: Number(row.price || 0), originPrice: Number(row.originPrice || 0),
      stock: Number(row.stock || 0), unit: row.unit || '', weight: Number(row.weight || 0),
      status: row.status || 'on_sale',
      skus: Array.isArray(row.skus) ? row.skus.map((s: any) => ({ ...s })) : []
    })
  } else {
    Object.assign(form, { merchantId: '', categoryId: '', name: '', images: [], detail: '', price: 0, originPrice: 0, stock: 0, unit: '', weight: 0, status: 'on_sale', skus: [] })
  }
  editVisible.value = true
}

const appendProductImage = async (url: string) => {
  const imageUrl = String(url || '').trim()
  if (!imageUrl) return
  if (!form.images.includes(imageUrl)) {
    form.images.push(imageUrl)
  }
  productImageUploadValue.value = imageUrl
  await nextTick()
  productImageUploadValue.value = ''
}
const removeImage = (idx: number) => form.images.splice(idx, 1)

const submitEdit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const payload = { ...form }
    // 前端 SKU 字段名 name 映射为后端字段 specs
    if (payload.skus && Array.isArray(payload.skus)) {
      payload.skus = payload.skus.map((s: any) => ({
        specs: s.name || s.specs,
        price: s.price,
        originPrice: s.originPrice,
        stock: s.stock,
        image: s.image || null,
        status: s.status === 'active' ? 'on_sale' : s.status || 'on_sale',
      }))
    }
    if (editingId.value) {
      await updateProduct(editingId.value, payload)
      ElMessage.success('更新成功')
    } else {
      await createProduct(payload)
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
    const target = row.status === 'on_sale' ? 'off_sale' : 'on_sale'
    await ElMessageBox.confirm(`确定${target === 'on_sale' ? '上架' : '下架'}该商品？`, '确认', { type: 'warning' })
    await updateProductStatus(row.id, target)
    ElMessage.success('操作成功')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

const audit = async (row: any, status: string) => {
  try {
    const msg = status === 'approved' ? '审核通过该商品？' : '拒绝该商品？'
    if (status === 'rejected') {
      const { value: reason } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝商品', { inputPlaceholder: '拒绝原因', type: 'warning' })
      await auditProduct(row.id, { status, reason })
    } else {
      await ElMessageBox.confirm(msg, '确认', { type: 'warning' })
      await auditProduct(row.id, { status })
    }
    ElMessage.success('操作成功')
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

onMounted(() => { loadData(); loadOptions() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.image-list { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.img-item { display: flex; flex-direction: column; align-items: center; }
.product-image-uploader { width: 120px; }
.product-image-uploader :deep(.upload-trigger) { min-height: 96px; padding: 14px; }
.sku-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
</style>
