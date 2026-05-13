<template>
  <div class="page-container">
    <div class="page-header">
      <h2>商城商品管理</h2>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新增商品
      </el-button>
    </div>

    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索商品名称"
        clearable
        style="width: 200px"
        @clear="loadProducts"
        @keyup.enter="loadProducts"
      />
      <el-select v-model="filters.status" placeholder="商品状态" clearable style="width: 120px" @change="loadProducts">
        <el-option label="在售" value="on_sale" />
        <el-option label="下架" value="off_sale" />
      </el-select>
      <el-select v-model="filters.categoryId" placeholder="商品分类" clearable style="width: 150px" @change="loadProducts">
        <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
      </el-select>
      <el-select v-model="filters.merchantId" placeholder="商户筛选" clearable filterable style="width: 150px" @change="loadProducts">
        <el-option v-for="m in merchants" :key="m.id" :label="m.name" :value="m.id" />
      </el-select>
      <el-button type="primary" @click="loadProducts">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="products" v-loading="loading" border stripe>
      <el-table-column prop="name" label="商品名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="price" label="价格" width="100">
        <template #default="{ row }">
          ¥{{ Number(row.price || 0).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="stock" label="库存" width="80" />
      <el-table-column prop="saleCount" label="销量" width="80" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'on_sale' ? 'success' : 'info'" size="small">
            {{ row.status === 'on_sale' ? '在售' : '下架' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="editProduct(row)">编辑</el-button>
          <el-button size="small" @click="manageSku(row)">SKU</el-button>
          <el-button size="small" :type="row.status === 'on_sale' ? 'warning' : 'success'" @click="toggleStatus(row)">
            {{ row.status === 'on_sale' ? '下架' : '上架' }}
          </el-button>
          <el-button size="small" type="danger" @click="deleteProduct(row)">删除</el-button>
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
        @size-change="loadProducts"
        @current-change="loadProducts"
      />
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="showCreateDialog" :title="editingProduct ? '编辑商品' : '新增商品'" width="700px">
      <el-form :model="productForm" label-width="100px">
        <el-form-item label="关联商户" required>
          <el-select v-model="productForm.merchantId" placeholder="选择商户" filterable style="width: 100%">
            <el-option v-for="m in merchants" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="商品名称" required>
          <el-input v-model="productForm.name" placeholder="请输入商品名称" />
        </el-form-item>
        <el-form-item label="商品副标题">
          <el-input v-model="productForm.subtitle" placeholder="请输入副标题" />
        </el-form-item>
        <el-form-item label="商品分类">
          <el-select v-model="productForm.categoryId" placeholder="选择分类" clearable style="width: 100%">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="价格" required>
              <el-input-number v-model="productForm.price" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="划线价">
              <el-input-number v-model="productForm.originPrice" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="库存">
              <el-input-number v-model="productForm.stock" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="排序">
              <el-input-number v-model="productForm.sortOrder" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="状态">
              <el-select v-model="productForm.status" style="width: 100%">
                <el-option label="在售" value="on_sale" />
                <el-option label="下架" value="off_sale" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="热门/新品">
              <div style="display: flex; gap: 8px;">
                <el-checkbox v-model="productForm.isHot" label="热门" />
                <el-checkbox v-model="productForm.isNew" label="新品" />
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="主图">
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <el-image v-if="productForm.mainImage" :src="productForm.mainImage" style="width: 80px; height: 80px" fit="cover" />
            <div>
              <el-upload
                action="/admin/upload/image"
                :headers="uploadHeaders"
                :on-success="(res: any) => { productForm.mainImage = res?.url || res?.data?.url || '' }"
                :show-file-list="false"
                accept="image/*"
              >
                <el-button size="small">上传主图</el-button>
              </el-upload>
              <el-input v-model="productForm.mainImage" placeholder="或手动输入URL" style="margin-top: 8px; width: 300px" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="轮播图">
          <div v-for="(img, index) in productForm.images" :key="index" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
            <el-image :src="img" style="width: 60px; height: 60px" fit="cover" />
            <el-input v-model="productForm.images[index]" placeholder="图片URL" style="flex: 1" />
            <el-button type="danger" size="small" @click="productForm.images.splice(index, 1)">删除</el-button>
          </div>
          <div style="display: flex; gap: 8px;">
            <el-upload
              action="/admin/upload/image"
              :headers="uploadHeaders"
              :on-success="(res: any) => { const url = res?.url || res?.data?.url; if (url) productForm.images.push(url) }"
              :show-file-list="false"
              accept="image/*"
            >
              <el-button size="small">上传图片</el-button>
            </el-upload>
            <el-button size="small" @click="productForm.images.push('')">手动添加</el-button>
          </div>
        </el-form-item>
        <el-form-item label="商品详情">
          <el-input v-model="productForm.detail" type="textarea" :rows="4" placeholder="商品详情描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="submitProduct" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- SKU Dialog -->
    <el-dialog v-model="showSkuDialog" title="SKU管理" width="700px">
      <div v-if="skuProduct" style="margin-bottom: 12px;">
        <strong>{{ skuProduct.name }}</strong> - 管理商品规格
      </div>
      <el-table :data="skuList" border size="small">
        <el-table-column prop="skuName" label="规格名称" min-width="150">
          <template #default="{ row }">
            <el-input v-if="row._editing" v-model="row.skuName" size="small" />
            <span v-else>{{ row.skuName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="price" label="价格" width="120">
          <template #default="{ row }">
            <el-input-number v-if="row._editing" v-model="row.price" :min="0" :precision="2" size="small" style="width: 100px" />
            <span v-else>¥{{ Number(row.price || 0).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="stock" label="库存" width="100">
          <template #default="{ row }">
            <el-input-number v-if="row._editing" v-model="row.stock" :min="0" size="small" style="width: 80px" />
            <span v-else>{{ row.stock }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="isDefault" label="默认" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.isDefault" type="success" size="small">默认</el-tag>
            <el-button v-else size="small" @click="setDefaultSku(row)">设为默认</el-button>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <template v-if="row._editing">
              <el-button size="small" type="success" @click="saveSku(row)">保存</el-button>
              <el-button size="small" @click="cancelEditSku(row)">取消</el-button>
            </template>
            <template v-else>
              <el-button size="small" @click="row._editing = true">编辑</el-button>
              <el-button size="small" type="danger" @click="deleteSku(row)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top: 12px;">
        <el-button type="primary" size="small" @click="addSku">新增SKU</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { request } from '@/api/request'

const loading = ref(false)
const submitting = ref(false)
const showCreateDialog = ref(false)
const showSkuDialog = ref(false)
const editingProduct = ref<any>(null)
const skuProduct = ref<any>(null)
const products = ref<any[]>([])
const categories = ref<any[]>([])
const merchants = ref<any[]>([])
const skuList = ref<any[]>([])

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('LM_ADMIN_TOKEN') || localStorage.getItem('admin_token')}`,
}))

const filters = reactive({
  keyword: '',
  status: '',
  categoryId: '',
  merchantId: '',
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const productForm = reactive({
  merchantId: '',
  name: '',
  subtitle: '',
  categoryId: '',
  price: 0,
  originPrice: 0,
  stock: 0,
  sortOrder: 0,
  mainImage: '',
  images: [] as string[],
  detail: '',
  status: 'on_sale',
  isHot: false,
  isNew: false,
})

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const loadProducts = async () => {
  loading.value = true
  try {
    const res = await request.get('/mall/products/admin/list', {
      params: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters,
      },
    })
    const data = (res as any).data || res
    products.value = data.list || []
    pagination.total = data.total || 0
  } catch (error) {
    ElMessage.error('加载商品列表失败')
  } finally {
    loading.value = false
  }
}

const loadCategories = async () => {
  try {
    const res = await request.get('/mall/admin/categories', {
      params: { pageSize: 100 },
    })
    const data = (res as any).data || res
    categories.value = data.list || []
  } catch (e: any) {
    console.error('加载分类失败', e)
    ElMessage.warning('加载商品分类失败，分类筛选不可用')
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
    console.error('加载商户列表失败', e)
    ElMessage.warning('加载商户列表失败，商户筛选不可用')
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.status = ''
  filters.categoryId = ''
  filters.merchantId = ''
  loadProducts()
}

const editProduct = (product: any) => {
  editingProduct.value = product
  productForm.merchantId = product.merchantId || ''
  productForm.name = product.name
  productForm.subtitle = product.subtitle || ''
  productForm.categoryId = product.categoryId || ''
  productForm.price = product.price
  productForm.originPrice = product.originPrice || 0
  productForm.stock = product.stock
  productForm.sortOrder = product.sortOrder || 0
  productForm.mainImage = product.mainImage || ''
  productForm.images = Array.isArray(product.images) ? [...product.images] : []
  productForm.detail = product.detail || ''
  productForm.status = product.status
  productForm.isHot = product.isHot || false
  productForm.isNew = product.isNew || false
  showCreateDialog.value = true
}

const submitProduct = async () => {
  if (!productForm.name) {
    ElMessage.warning('请输入商品名称')
    return
  }
  if (!productForm.merchantId) {
    ElMessage.warning('请选择商户')
    return
  }
  submitting.value = true
  try {
    const data = {
      ...productForm,
      images: productForm.images.filter(img => img.trim()),
      mainImage: productForm.mainImage || productForm.images[0] || '',
    }
    if (editingProduct.value) {
      await request.put(`/mall/products/admin/${editingProduct.value.id}`, data)
      ElMessage.success('商品更新成功')
    } else {
      await request.post('/mall/products/admin/create', data)
      ElMessage.success('商品创建成功')
    }
    showCreateDialog.value = false
    editingProduct.value = null
    resetForm()
    loadProducts()
  } catch (error) {
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

const toggleStatus = async (product: any) => {
  const newStatus = product.status === 'on_sale' ? 'off_sale' : 'on_sale'
  try {
    await request.patch(`/mall/products/admin/${product.id}/status`, { status: newStatus })
    ElMessage.success('状态更新成功')
    loadProducts()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const deleteProduct = async (product: any) => {
  try {
    await ElMessageBox.confirm(
      `确定删除商品「${product.name}」吗？删除后不可恢复。`,
      '确认删除',
      { type: 'error', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
    await request.delete(`/mall/products/admin/${product.id}`)
    ElMessage.success('商品已删除')
    loadProducts()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

const manageSku = async (product: any) => {
  skuProduct.value = product
  showSkuDialog.value = true
  await loadSkus(product.id)
}

const loadSkus = async (productId: string) => {
  try {
    const res = await request.get(`/mall/products/admin/${productId}/skus`)
    const data = (res as any).data || res
    skuList.value = (data.list || []).map((s: any) => ({ ...s, _editing: false, _backup: null }))
  } catch (error) {
    ElMessage.error('加载SKU失败')
    skuList.value = []
  }
}

const addSku = () => {
  skuList.value.push({
    id: '',
    skuName: '',
    price: 0,
    stock: 0,
    isDefault: false,
    _editing: true,
    _backup: null,
    _isNew: true,
  })
}

const saveSku = async (sku: any) => {
  if (!sku.skuName?.trim()) {
    ElMessage.warning('请输入规格名称')
    return
  }
  try {
    if (sku._isNew) {
      await request.post(`/mall/products/admin/${skuProduct.value.id}/skus`, {
        skuName: sku.skuName,
        price: sku.price,
        stock: sku.stock,
        isDefault: sku.isDefault,
      })
      ElMessage.success('SKU创建成功')
    } else {
      await request.put(`/mall/products/admin/skus/${sku.id}`, {
        skuName: sku.skuName,
        price: sku.price,
        stock: sku.stock,
        isDefault: sku.isDefault,
      })
      ElMessage.success('SKU更新成功')
    }
    sku._editing = false
    sku._isNew = false
    await loadSkus(skuProduct.value.id)
  } catch (error) {
    ElMessage.error('保存SKU失败')
  }
}

const cancelEditSku = (sku: any) => {
  if (sku._isNew) {
    const idx = skuList.value.indexOf(sku)
    if (idx > -1) skuList.value.splice(idx, 1)
  } else {
    if (sku._backup) {
      Object.assign(sku, sku._backup)
    }
    sku._editing = false
  }
}

const deleteSku = async (sku: any) => {
  try {
    await ElMessageBox.confirm('确定删除该SKU吗？', '确认删除', { type: 'warning' })
    if (sku.id) {
      await request.delete(`/mall/products/admin/skus/${sku.id}`)
      ElMessage.success('SKU已删除')
      await loadSkus(skuProduct.value.id)
    } else {
      const idx = skuList.value.indexOf(sku)
      if (idx > -1) skuList.value.splice(idx, 1)
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除SKU失败')
    }
  }
}

const setDefaultSku = async (sku: any) => {
  try {
    await request.put(`/mall/products/admin/skus/${sku.id}`, { isDefault: true })
    ElMessage.success('已设为默认SKU')
    await loadSkus(skuProduct.value.id)
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const resetForm = () => {
  productForm.merchantId = ''
  productForm.name = ''
  productForm.subtitle = ''
  productForm.categoryId = ''
  productForm.price = 0
  productForm.originPrice = 0
  productForm.stock = 0
  productForm.sortOrder = 0
  productForm.mainImage = ''
  productForm.images = []
  productForm.detail = ''
  productForm.status = 'on_sale'
  productForm.isHot = false
  productForm.isNew = false
}

onMounted(() => {
  loadProducts()
  loadCategories()
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
