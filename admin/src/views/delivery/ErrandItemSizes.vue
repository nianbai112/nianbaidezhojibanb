<template>
  <div class="page-shell errand-simple-page">
    <PageHeader title="物品大小" subtitle="配置代取、代寄、外卖代拿下单时可选的物品规格和附加费用" icon="Box">
      <template #actions>
        <el-button :loading="loading" @click="loadData">刷新</el-button>
        <el-button type="primary" @click="openCreate">新增规格</el-button>
      </template>
    </PageHeader>

    <el-card class="filter-card" shadow="never">
      <el-select v-model="query.regionId" placeholder="全部区域" clearable filterable>
        <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
      </el-select>
      <el-input v-model="query.keyword" placeholder="搜索规格名称" clearable @keyup.enter="search" />
      <el-select v-model="query.applyTo" placeholder="适用服务" clearable>
        <el-option label="全部服务" value="all" />
        <el-option v-for="item in applyToOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
    </el-card>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="rows" empty-text="暂无物品规格">
        <el-table-column label="规格名称" prop="name" min-width="160" />
        <el-table-column label="适用服务" width="140">
          <template #default="{ row }">{{ applyToLabel(row.applyTo) }}</template>
        </el-table-column>
        <el-table-column label="重量范围" min-width="160">
          <template #default="{ row }">
            {{ row.weightMin ?? 0 }}kg - {{ row.weightMax ?? '不限' }}kg
          </template>
        </el-table-column>
        <el-table-column label="附加费" width="120">
          <template #default="{ row }">
            <strong class="money">¥{{ money(row.price) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="排序" prop="sortOrder" width="100" />
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
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

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑物品规格' : '新增物品规格'" width="520px">
      <el-form :model="form" label-width="96px">
        <el-form-item label="所属区域" required>
          <el-select v-model="form.regionId" placeholder="请选择区域" filterable style="width: 100%">
            <el-option v-for="region in regions" :key="region.id" :label="region.name" :value="region.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="规格名称" required>
          <el-input v-model="form.name" placeholder="如：小件、中件、大件" />
        </el-form-item>
        <el-form-item label="适用服务">
          <el-select v-model="form.applyTo" style="width: 100%">
            <el-option label="全部服务" value="all" />
            <el-option v-for="item in applyToOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="重量范围">
          <div class="inline-two">
            <el-input-number v-model="form.weightMin" :min="0" :precision="1" placeholder="最小" />
            <el-input-number v-model="form.weightMax" :min="0" :precision="1" placeholder="最大" />
          </div>
        </el-form-item>
        <el-form-item label="附加费">
          <el-input-number v-model="form.price" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { fetchRegions } from '@/api/admin'
import {
  createErrandItemSize,
  deleteErrandItemSize,
  fetchErrandItemSizes,
  updateErrandItemSize,
} from '@/api/errand'

const applyToOptions = [
  { label: '代取快递', value: 'pickup' },
  { label: '代寄快递', value: 'deliver' },
  { label: '外卖代拿', value: 'meal' },
  { label: '万能任务', value: 'universal' },
]

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const regions = ref<any[]>([])
const rows = ref<any[]>([])
const total = ref(0)
const query = reactive({ page: 1, pageSize: 20, regionId: '', keyword: '', applyTo: '' })
const form = reactive<any>({ id: '', regionId: '', name: '', applyTo: 'all', weightMin: 0, weightMax: 5, price: 0, sortOrder: 0 })

function money(value: any) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

function applyToLabel(value: string) {
  if (value === 'all') return '全部服务'
  return applyToOptions.find(item => item.value === value)?.label || value || '-'
}

async function loadRegions() {
  regions.value = await fetchRegions()
}

async function loadData() {
  loading.value = true
  try {
    const res = await fetchErrandItemSizes(query)
    rows.value = res.list
    total.value = res.total
  } catch (e: any) {
    ElMessage.error(e?.message || '加载物品规格失败')
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
  query.applyTo = ''
  loadData()
}

function openCreate() {
  Object.assign(form, { id: '', regionId: query.regionId || regions.value[0]?.id || '', name: '', applyTo: 'all', weightMin: 0, weightMax: 5, price: 0, sortOrder: 0 })
  dialogVisible.value = true
}

function openEdit(row: any) {
  Object.assign(form, row, { price: Number(row.price || 0) })
  dialogVisible.value = true
}

async function submit() {
  if (!form.regionId || !form.name) {
    ElMessage.warning('请选择区域并填写规格名称')
    return
  }
  saving.value = true
  try {
    const payload = { ...form }
    delete payload.id
    if (form.id) await updateErrandItemSize(form.id, payload)
    else await createErrandItemSize(payload)
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
  await ElMessageBox.confirm(`确定删除「${row.name}」吗？`, '删除物品规格', { type: 'warning' })
  await deleteErrandItemSize(row.id)
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
  grid-template-columns: 220px minmax(180px, 1fr) 180px auto auto;
  gap: 12px;
  align-items: center;
}

.table-card {
  border-radius: 18px;
  border: 1px solid rgba(203, 213, 225, 0.78);
}

.money {
  color: #16a34a;
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
