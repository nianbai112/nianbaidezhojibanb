<template>
  <div class="page-shell errand-simple-page">
    <PageHeader title="取件点管理" subtitle="维护校内快递柜、驿站、宿舍楼下等常用取件/寄件点" icon="Location">
      <template #actions>
        <el-button :loading="loading" @click="loadData">刷新</el-button>
        <el-button type="primary" @click="openCreate">新增取件点</el-button>
      </template>
    </PageHeader>

    <el-card class="filter-card" shadow="never">
      <el-select v-model="query.regionId" placeholder="全部区域" clearable filterable>
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-input v-model="query.keyword" placeholder="搜索名称 / 地址" clearable @keyup.enter="search" />
      <el-select v-model="query.type" placeholder="点位类型" clearable>
        <el-option v-for="item in pickupPointTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-select v-model="query.isOpen" placeholder="启用状态" clearable>
        <el-option label="启用" value="true" />
        <el-option label="停用" value="false" />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
    </el-card>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="rows" empty-text="暂无取件点">
        <el-table-column label="点位名称" prop="name" min-width="180" />
        <el-table-column label="区域" min-width="150">
          <template #default="{ row }">{{ regionName(row.regionId) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag>{{ labelOf(pickupPointTypeOptions, row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="地址" prop="address" min-width="260" show-overflow-tooltip />
        <el-table-column label="坐标" width="180">
          <template #default="{ row }">
            <span v-if="row.longitude && row.latitude">{{ row.longitude }}, {{ row.latitude }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isOpen ? 'success' : 'info'">{{ row.isOpen ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <span>共 {{ total }} 条</span>
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="sizes, prev, pager, next, jumper" :total="total" @change="loadData" />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑取件点' : '新增取件点'" width="600px">
      <el-form :model="form" label-width="96px">
        <el-form-item label="所属区域" required>
          <el-select v-model="form.regionId" placeholder="请选择区域" filterable style="width: 100%">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="点位名称" required>
          <el-input v-model="form.name" placeholder="如：菜鸟驿站东门店" />
        </el-form-item>
        <el-form-item label="点位类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="item in pickupPointTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" placeholder="请输入详细地址">
            <template #append>
              <el-button @click="mapVisible = true">地图选择</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="经纬度">
          <div class="inline-two">
            <el-input-number v-model="form.longitude" :precision="6" controls-position="right" placeholder="经度" />
            <el-input-number v-model="form.latitude" :precision="6" controls-position="right" placeholder="纬度" />
          </div>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.isOpen" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <AmapLocationPicker
      v-model:visible="mapVisible"
      :default-center="mapCenter"
      @confirm="onLocationConfirm"
      @cancel="mapVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import AmapLocationPicker from '@/components/common/AmapLocationPicker.vue'
import { fetchRegions } from '@/api/admin'
import {
  createErrandPickupPoint,
  deleteErrandPickupPoint,
  fetchErrandPickupPoints,
  labelOf,
  pickupPointTypeOptions,
  updateErrandPickupPoint,
} from '@/api/errand'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const mapVisible = ref(false)
const regions = ref<any[]>([])
const rows = ref<any[]>([])
const total = ref(0)
const query = reactive({ page: 1, pageSize: 20, regionId: '', keyword: '', type: '', isOpen: '' })
const form = reactive<any>({ id: '', regionId: '', name: '', address: '', type: 'pickup', latitude: undefined, longitude: undefined, isOpen: true })

const mapCenter = computed<[number, number] | undefined>(() => (
  form.longitude && form.latitude ? [Number(form.longitude), Number(form.latitude)] : undefined
))

function regionName(id: string) {
  return regions.value.find(item => item.id === id)?.name || id || '-'
}

function toSubmitPayload(source: any) {
  const { id, createdAt, updatedAt, ...payload } = source || {}
  return payload
}

async function loadRegions() {
  regions.value = await fetchRegions()
}

async function loadData() {
  loading.value = true
  try {
    const res = await fetchErrandPickupPoints(query)
    rows.value = res.list
    total.value = res.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载取件点失败')
  } finally {
    loading.value = false
  }
}

function search() {
  query.page = 1
  loadData()
}

function reset() {
  query.page = 1
  query.regionId = ''
  query.keyword = ''
  query.type = ''
  query.isOpen = ''
  loadData()
}

function openCreate() {
  Object.assign(form, { id: '', regionId: query.regionId || regions.value[0]?.id || '', name: '', address: '', type: 'pickup', latitude: undefined, longitude: undefined, isOpen: true })
  dialogVisible.value = true
}

function openEdit(row: any) {
  Object.assign(form, row)
  dialogVisible.value = true
}

function onLocationConfirm(location: any) {
  form.longitude = Number(location.longitude)
  form.latitude = Number(location.latitude)
  form.address = location.address || form.address
}

async function submit() {
  if (!form.regionId || !form.name) {
    ElMessage.warning('请选择区域并填写点位名称')
    return
  }
  saving.value = true
  try {
    const payload = toSubmitPayload(form)
    if (form.id) await updateErrandPickupPoint(form.id, payload)
    else await createErrandPickupPoint(payload)
    ElMessage.success('保存成功')
    dialogVisible.value = false
    await loadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: any) {
  await ElMessageBox.confirm(`确定删除「${row.name}」吗？`, '删除取件点', { type: 'warning' })
  await deleteErrandPickupPoint(row.id)
  ElMessage.success('已删除')
  await loadData()
}

onMounted(async () => {
  await loadRegions()
  await loadData()
})
</script>

<style scoped>
.errand-simple-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.filter-card :deep(.el-card__body) {
  display: grid;
  grid-template-columns: 220px minmax(200px, 1fr) 150px 130px auto auto;
  gap: 12px;
  align-items: center;
}

.table-card {
  border-radius: 14px;
  border: 1px solid rgba(203, 213, 225, 0.78);
}

.pager {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16px;
  padding-top: 18px;
}

.inline-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
}
</style>
