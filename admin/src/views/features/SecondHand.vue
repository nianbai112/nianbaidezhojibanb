<template>
  <div class="page-shell">
    <PageHeader title="二手交易" subtitle="管理二手商品、订单和区域配置" icon="ShoppingCart" />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="商品列表" name="products">
        <div class="tab-toolbar">
          <el-input v-model="prodFilters.keyword" placeholder="搜索商品" clearable style="width:180px" @keyup.enter="loadProducts" />
          <el-select v-model="prodFilters.status" clearable placeholder="状态" style="width:120px" @change="loadProducts">
            <el-option label="在售" value="ON_SALE" />
            <el-option label="已售" value="SOLD" />
            <el-option label="下架" value="OFFLINE" />
          </el-select>
          <el-button @click="loadProducts" :loading="prodLoading">刷新</el-button>
        </div>
        <el-table :data="products" v-loading="prodLoading" stripe>
          <el-table-column prop="title" label="商品标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="user.nickname" label="卖家" width="120">
            <template #default="{ row }">{{ row.user?.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column prop="price" label="价格" width="100">
            <template #default="{ row }">¥{{ row.price }}</template>
          </el-table-column>
          <el-table-column prop="category" label="分类" width="100" />
          <el-table-column prop="viewCount" label="浏览" width="70" />
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ON_SALE' ? 'success' : row.status === 'SOLD' ? 'info' : 'warning'" size="small">
                {{ row.status === 'ON_SALE' ? '在售' : row.status === 'SOLD' ? '已售' : '下架' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="发布时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'ON_SALE'" size="small" type="warning" link @click="setProductStatus(row.id, 'OFFLINE')">下架</el-button>
              <el-button v-if="row.status === 'OFFLINE'" size="small" type="success" link @click="setProductStatus(row.id, 'ON_SALE')">上架</el-button>
              <el-popconfirm title="确定删除？" @confirm="deleteProduct(row.id)">
                <template #reference><el-button size="small" type="danger" link>删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="prodPage" v-model:page-size="prodPageSize" :total="prodTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadProducts" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="订单列表" name="orders">
        <div class="tab-toolbar">
          <el-input v-model="orderFilters.keyword" placeholder="搜索订单号" clearable style="width:180px" @keyup.enter="loadOrders" />
          <el-button @click="loadOrders" :loading="orderLoading">刷新</el-button>
        </div>
        <el-table :data="orders" v-loading="orderLoading" stripe>
          <el-table-column prop="orderNo" label="订单号" width="180" />
          <el-table-column prop="buyerId" label="买家ID" width="120" show-overflow-tooltip />
          <el-table-column prop="sellerId" label="卖家ID" width="120" show-overflow-tooltip />
          <el-table-column prop="productId" label="商品ID" width="120" show-overflow-tooltip />
          <el-table-column prop="price" label="金额" width="100">
            <template #default="{ row }">¥{{ row.price }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'completed' ? 'success' : row.status === 'cancelled' ? 'info' : 'warning'" size="small">
                {{ row.status === 'pending' ? '待付款' : row.status === 'paid' ? '已付款' : row.status === 'completed' ? '已完成' : row.status === 'cancelled' ? '已取消' : row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="下单时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="orderPage" v-model:page-size="orderPageSize" :total="orderTotal"
            :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="loadOrders" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="区域配置" name="settings">
        <div class="tab-toolbar">
          <el-select v-model="settingRegionId" placeholder="选择区域" style="width:200px" @change="loadSetting">
            <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <el-button type="primary" @click="saveSetting" :loading="settingSaving" :disabled="!settingRegionId">保存</el-button>
        </div>
        <el-form v-if="settingRegionId" :model="settingForm" label-width="140px" style="max-width:600px">
          <el-form-item label="启用二手交易"><el-switch v-model="settingForm.enableSecondHand" /></el-form-item>
          <el-form-item label="最大发布数"><el-input-number v-model="settingForm.maxListings" :min="1" :max="999" /></el-form-item>
          <el-form-item label="需要手机号"><el-switch v-model="settingForm.requirePhone" /></el-form-item>
          <el-form-item label="需要审核"><el-switch v-model="settingForm.requireAudit" /></el-form-item>
        </el-form>
        <el-empty v-else description="请先选择区域" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'

const activeTab = ref('products')
const formatDate = (d: string) => d ? new Date(d).toLocaleString('zh-CN') : '-'

const regions = ref<any[]>([])

const products = ref<any[]>([])
const prodLoading = ref(false)
const prodPage = ref(1)
const prodPageSize = ref(20)
const prodTotal = ref(0)
const prodFilters = reactive({ keyword: '', status: '' })

const orders = ref<any[]>([])
const orderLoading = ref(false)
const orderPage = ref(1)
const orderPageSize = ref(20)
const orderTotal = ref(0)
const orderFilters = reactive({ keyword: '' })

const settingRegionId = ref('')
const settingForm = reactive({ enableSecondHand: true, maxListings: 10, requirePhone: false, requireAudit: false })
const settingSaving = ref(false)

async function loadRegions() {
  try {
    const res: any = await request.get('/admin/regions')
    regions.value = res.list || res.data?.list || (Array.isArray(res) ? res : [])
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); regions.value = [] }
}

async function loadProducts() {
  prodLoading.value = true
  try {
    const params = { page: prodPage.value, pageSize: prodPageSize.value, ...prodFilters }
    const res: any = await request.get('/admin/second-hand/products', { params })
    products.value = res.list || res.data?.list || []
    prodTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); products.value = [] }
  finally { prodLoading.value = false }
}

async function setProductStatus(id: string, status: string) {
  try {
    await request.put(`/admin/second-hand/products/${id}/status`, { status })
    ElMessage.success('操作成功')
    loadProducts()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function deleteProduct(id: string) {
  try {
    await request.delete(`/admin/second-hand/products/${id}`)
    ElMessage.success('已删除')
    loadProducts()
  } catch (e: any) { ElMessage.error(e?.message || '操作失败') }
}

async function loadOrders() {
  orderLoading.value = true
  try {
    const params = { page: orderPage.value, pageSize: orderPageSize.value, orderNo: orderFilters.keyword || undefined }
    const res: any = await request.get('/admin/second-hand/orders', { params })
    orders.value = res.list || res.data?.list || []
    orderTotal.value = res.total || res.data?.total || 0
  } catch (e: any) { ElMessage.error(e?.message || '加载失败'); orders.value = [] }
  finally { orderLoading.value = false }
}

async function loadSetting() {
  if (!settingRegionId.value) return
  try {
    const res: any = await request.get(`/admin/second-hand/settings/${settingRegionId.value}`)
    if (res) Object.assign(settingForm, res)
  } catch (e: any) { ElMessage.error(e?.message || '加载失败') }
}

async function saveSetting() {
  settingSaving.value = true
  try {
    const payload = {
      enableSecondHand: settingForm.enableSecondHand,
      maxListings: settingForm.maxListings,
      requirePhone: settingForm.requirePhone,
      requireAudit: settingForm.requireAudit,
    }
    await request.put(`/admin/second-hand/settings/${settingRegionId.value}`, payload)
    ElMessage.success('保存成功')
  } catch (e: any) { ElMessage.error(e?.message || '保存失败') }
  finally { settingSaving.value = false }
}

function handleTabChange() {
  const loaders: Record<string, () => void> = {
    products: loadProducts, orders: loadOrders, settings: () => {},
  }
  loaders[activeTab.value]?.()
}

onMounted(() => {
  loadRegions()
  loadProducts()
})
</script>

<style scoped>
.page-shell { padding: 24px; }
.tab-toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
