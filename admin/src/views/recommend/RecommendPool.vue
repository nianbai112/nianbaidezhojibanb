<template>
  <div class="page-shell recommend-pool">
    <GlassPageHeader title="推荐池" subtitle="查看真实推荐池内容、分数因子、过期状态，并对单个目标进行置顶、加权、降权或屏蔽">
      <template #actions>
        <el-select v-model="rebuildTarget" class="target-select" placeholder="重建类型">
          <el-option v-for="item in targetOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" :loading="rebuilding" @click="rebuildPool">重建</el-button>
        <el-button :icon="RefreshRight" :loading="loading" @click="loadPool(true)">刷新</el-button>
      </template>
    </GlassPageHeader>

    <div class="glass-card filter-card">
      <el-select v-model="filters.targetType" placeholder="内容类型" clearable>
        <el-option v-for="item in targetOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-input v-model="filters.regionId" clearable placeholder="区域 ID（可选）" />
      <el-button type="primary" @click="reloadFirstPage">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="glass-card table-card">
      <el-table :data="pool" v-loading="loading" stripe>
        <el-table-column label="推荐目标" min-width="300">
          <template #default="{ row }">
            <div class="target-cell">
              <el-avatar :size="38" :src="row.target?.image">{{ firstChar(row.target?.name) }}</el-avatar>
              <div>
                <strong>{{ row.target?.name || row.targetId }}</strong>
                <small>{{ row.target?.subtitle || row.targetId }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="targetTypeLabel" label="类型" width="110" />
        <el-table-column prop="regionName" label="区域" width="150" show-overflow-tooltip />
        <el-table-column label="推荐分" width="110">
          <template #default="{ row }">{{ formatScore(row.score) }}</template>
        </el-table-column>
        <el-table-column label="分数因子" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ factorText(row.factors) }}</template>
        </el-table-column>
        <el-table-column label="过期时间" width="180">
          <template #default="{ row }">{{ formatTime(row.expireAt) }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="入池时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openControl(row)">人工干预</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadPool()"
          @size-change="loadPool()"
        />
      </div>
    </div>

    <el-dialog v-model="controlVisible" title="人工干预推荐" width="520px">
      <el-form :model="controlForm" label-width="90px">
        <el-form-item label="目标">
          <div class="readonly-target">{{ selectedRow?.target?.name || selectedRow?.targetId }}</div>
        </el-form-item>
        <el-form-item label="动作">
          <el-select v-model="controlForm.action" style="width: 100%">
            <el-option label="加权推荐" value="boost" />
            <el-option label="置顶推荐" value="pin" />
            <el-option label="降权" value="downrank" />
            <el-option label="屏蔽" value="block" />
          </el-select>
        </el-form-item>
        <el-form-item label="权重值">
          <el-input-number v-model="controlForm.value" :min="0" :max="10000" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="controlForm.reason" type="textarea" :rows="3" placeholder="记录运营干预原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="controlVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingControl" @click="saveControl">保存干预</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshRight } from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const rebuilding = ref(false)
const savingControl = ref(false)
const pool = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const rebuildTarget = ref('post')
const controlVisible = ref(false)
const selectedRow = ref<any | null>(null)

const filters = reactive({
  targetType: '',
  regionId: '',
})
const controlForm = reactive({
  action: 'boost',
  value: 100,
  reason: '',
})

const targetOptions = [
  { label: '笔记/帖子', value: 'post' },
  { label: '商家', value: 'merchant' },
  { label: '商品', value: 'product' },
  { label: '话题', value: 'topic' },
  { label: '活动', value: 'activity' },
  { label: '二手', value: 'secondhand' },
]

function firstChar(value?: string) {
  return (value || '?').slice(0, 1)
}

function formatScore(value: any) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function formatTime(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

function factorText(value: any) {
  if (!value || typeof value !== 'object') return '-'
  return Object.entries(value)
    .slice(0, 5)
    .map(([key, val]) => `${key}: ${String(val)}`)
    .join(' / ')
}

async function loadPool(showSuccess = false) {
  loading.value = true
  try {
    const res: any = await request.get('/admin/recommend/pool', {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        targetType: filters.targetType || undefined,
        regionId: filters.regionId || undefined,
      },
    })
    pool.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
    if (showSuccess) ElMessage.success('推荐池已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载推荐池失败')
  } finally {
    loading.value = false
  }
}

function reloadFirstPage() {
  page.value = 1
  loadPool()
}

function resetFilters() {
  filters.targetType = ''
  filters.regionId = ''
  page.value = 1
  loadPool()
}

async function rebuildPool() {
  const target = targetOptions.find((item) => item.value === rebuildTarget.value)
  await ElMessageBox.confirm(`确定重建「${target?.label || rebuildTarget.value}」推荐池？`, '重建推荐池', { type: 'warning' })
  rebuilding.value = true
  try {
    const res: any = await request.post('/admin/recommend/rebuild', { targetType: rebuildTarget.value })
    ElMessage.success(`推荐池重建完成，写入 ${res?.count || 0} 条`)
    filters.targetType = rebuildTarget.value
    await reloadFirstPage()
  } catch (e: any) {
    ElMessage.error(e?.message || '重建推荐池失败')
  } finally {
    rebuilding.value = false
  }
}

function openControl(row: any) {
  selectedRow.value = row
  controlForm.action = 'boost'
  controlForm.value = 100
  controlForm.reason = ''
  controlVisible.value = true
}

async function saveControl() {
  if (!selectedRow.value) return
  savingControl.value = true
  try {
    await request.post('/admin/recommend/control', {
      targetType: selectedRow.value.targetType,
      targetId: selectedRow.value.targetId,
      action: controlForm.action,
      value: controlForm.value,
      reason: controlForm.reason,
    })
    ElMessage.success('人工干预已保存')
    controlVisible.value = false
    await loadPool()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存人工干预失败')
  } finally {
    savingControl.value = false
  }
}

onMounted(() => loadPool())
</script>

<style scoped lang="scss">
.recommend-pool {
  display: grid;
  gap: 18px;
}
.target-select {
  width: 150px;
}
.filter-card {
  display: grid;
  grid-template-columns: 180px minmax(180px, 1fr) auto auto;
  gap: 12px;
  padding: 16px;
}
.table-card {
  padding: 16px;
}
.target-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.target-cell strong,
.target-cell small {
  display: block;
}
.target-cell small {
  color: #64748b;
  font-size: 12px;
  font-weight: 750;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.readonly-target {
  color: #0f172a;
  font-weight: 900;
}
@media (max-width: 860px) {
  .filter-card {
    grid-template-columns: 1fr;
  }
}
</style>
