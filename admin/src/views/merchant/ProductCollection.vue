<template>
  <div class="page-shell">
    <PageHeader title="商品批量复制" subtitle="将已获授权的商品复制到目标商家" icon="DocumentCopy" />
    <div class="filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索商品名称" clearable style="width: 200px" @clear="loadData" @keyup.enter="loadData" />
      <el-select v-model="filters.categoryId" placeholder="分类" clearable filterable style="width: 140px" @change="loadData">
        <el-option v-for="c in categoryList" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="filters.merchantId" placeholder="来源商家" clearable filterable style="width: 160px" @change="loadData">
        <el-option v-for="m in merchantList" :key="m.id" :label="m.name" :value="m.id" />
      </el-select>
      <el-select v-model="filters.regionId" placeholder="区域" clearable filterable style="width: 140px" @change="loadData">
        <el-option v-for="r in regionList" :key="r.id" :label="r.name" :value="r.id" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="loadData">
        <el-option label="上架" value="on_sale" />
        <el-option label="下架" value="off_sale" />
      </el-select>
      <el-button type="primary" @click="loadData">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>
    <div class="batch-bar">
      <el-select v-model="targetMerchantId" placeholder="选择目标商家" clearable filterable style="width: 240px">
        <el-option v-for="m in merchantList" :key="m.id" :label="m.name" :value="m.id" />
      </el-select>
      <el-button type="success" :disabled="!selectedIds.length || !targetMerchantId" @click="batchCollect">批量采集 ({{ selectedIds.length }})</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border stripe @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="55" />
      <el-table-column prop="images" label="商品图" width="80">
        <template #default="{ row }">
          <el-image v-if="Array.isArray(row.images) && row.images.length" :src="row.images[0]" style="width: 50px; height: 50px; border-radius: 6px;" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="商品名" min-width="150" show-overflow-tooltip />
      <el-table-column prop="merchantName" label="来源商家" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.merchantName || row.merchant?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="categoryName" label="分类" width="100" show-overflow-tooltip>
        <template #default="{ row }">{{ row.categoryName || row.category?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="price" label="售价" width="100">
        <template #default="{ row }">¥{{ Number(row.price || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="stock" label="库存" width="80" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'on_sale' ? 'success' : 'info'" size="small">{{ row.status === 'on_sale' ? '上架' : '下架' }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @size-change="loadData" @current-change="loadData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { getProductCollection, batchCollectProducts } from '@/api/merchant'
import { getMerchants, getCategories } from '@/api/merchant'
import { fetchRegions } from '@/api/admin'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filters = reactive({ keyword: '', categoryId: '', merchantId: '', regionId: '', status: '' })
const regionList = ref<any[]>([])
const categoryList = ref<any[]>([])
const merchantList = ref<any[]>([])

const selectedIds = ref<string[]>([])
const targetMerchantId = ref('')

const handleSelectionChange = (rows: any[]) => {
  selectedIds.value = rows.map(r => r.id)
}

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getProductCollection({ page: page.value, pageSize: pageSize.value, ...filters })
    list.value = res?.list || res?.data?.list || []
    total.value = res?.total ?? res?.data?.total ?? 0
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', categoryId: '', merchantId: '', regionId: '', status: '' })
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

const batchCollect = async () => {
  if (!selectedIds.value.length) { ElMessage.warning('请选择商品'); return }
  if (!targetMerchantId.value) { ElMessage.warning('请选择目标商家'); return }
  try {
    await ElMessageBox.confirm(`确定将选中的 ${selectedIds.value.length} 个商品采集到目标商家？`, '确认', { type: 'warning' })
    const res: any = await batchCollectProducts({ productIds: selectedIds.value, targetMerchantId: targetMerchantId.value })
    ElMessage.success(res?.message || `成功采集 ${res?.count || selectedIds.value.length} 个商品`)
    selectedIds.value = []
    loadData()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '采集失败')
  }
}

onMounted(() => { loadData(); loadOptions() })
</script>

<style scoped>
.page-shell { padding: 24px; }
.filter-bar { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
.batch-bar { display: flex; gap: 12px; margin: 12px 0; align-items: center; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
