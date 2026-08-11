<template>
  <div class="page-shell ab-test-page">
    <GlassPageHeader title="A/B 测试" subtitle="创建、启动、停止小程序页面布局、推荐算法和运营策略实验，并查看真实分组与指标结果">
      <template #actions>
        <el-button :icon="RefreshRight" :loading="loading" @click="loadTests(true)">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">创建实验</el-button>
      </template>
    </GlassPageHeader>

    <div class="glass-card filter-card">
      <el-select v-model="filters.status" placeholder="实验状态" clearable>
        <el-option label="草稿" value="draft" />
        <el-option label="运行中" value="running" />
        <el-option label="已暂停" value="paused" />
        <el-option label="已完成" value="completed" />
      </el-select>
      <el-select v-model="filters.type" placeholder="实验类型" clearable>
        <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-button type="primary" @click="reloadFirstPage">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <div class="glass-card table-card">
      <el-table :data="tests" v-loading="loading" stripe>
        <el-table-column prop="name" label="实验名称" min-width="180" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ typeLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="targetMetric" label="目标指标" min-width="140" />
        <el-table-column label="变体" min-width="220">
          <template #default="{ row }">
            <div class="variant-chips">
              <el-tag v-for="item in row.variants || []" :key="item.id" size="small" effect="plain">
                {{ item.name || item.id }} {{ item.weight || 1 }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" effect="plain">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" min-width="180">
          <template #default="{ row }">
            <div class="time-cell">
              <span>开始：{{ formatTime(row.startAt) }}</span>
              <span>结束：{{ formatTime(row.endAt) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewResults(row)">结果</el-button>
            <el-button v-if="row.status === 'draft'" link type="success" @click="startTest(row)">启动</el-button>
            <el-button v-if="row.status === 'running'" link type="warning" @click="stopTest(row)">停止</el-button>
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
          @current-change="loadTests()"
          @size-change="loadTests()"
        />
      </div>
    </div>

    <el-dialog v-model="createVisible" title="创建 A/B 测试" width="760px">
      <el-form :model="form" label-width="100px">
        <div class="form-grid">
          <el-form-item label="实验名称" required>
            <el-input v-model="form.name" placeholder="如：首页 Tabs 样式实验" />
          </el-form-item>
          <el-form-item label="实验类型">
            <el-select v-model="form.type" style="width: 100%">
              <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="区域 ID">
          <el-input v-model="form.regionId" clearable placeholder="留空表示全局实验" />
        </el-form-item>
        <el-form-item label="目标指标">
          <el-input v-model="form.targetMetric" placeholder="如 click_rate / conversion_rate / retention_rate" />
        </el-form-item>
        <el-form-item label="实验说明">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="说明本次实验要验证什么" />
        </el-form-item>
        <el-form-item label="变体配置">
          <div class="variant-editor">
            <div v-for="(variant, index) in form.variants" :key="variant.id" class="variant-row">
              <el-input v-model="variant.id" placeholder="变体ID" />
              <el-input v-model="variant.name" placeholder="变体名称" />
              <el-input-number v-model="variant.weight" :min="1" :max="100" />
              <el-input v-model="variant.configText" placeholder="JSON配置，可留空" />
              <el-button v-if="form.variants.length > 2" type="danger" plain @click="removeVariant(index)">删除</el-button>
            </div>
            <el-button plain @click="addVariant">添加变体</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="createTest">创建实验</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resultsVisible" title="实验结果" width="780px">
      <div v-if="testResults" class="results-panel">
        <div class="result-head">
          <div>
            <h3>{{ testResults.testName }}</h3>
            <p>目标指标：{{ testResults.targetMetric || '-' }} / 总分配：{{ testResults.totalAssignments || 0 }} 人</p>
          </div>
          <el-tag :type="statusType(testResults.status)" effect="plain">{{ statusLabel(testResults.status) }}</el-tag>
        </div>
        <el-table :data="testResults.variants || []" stripe>
          <el-table-column prop="variantName" label="变体" min-width="140" />
          <el-table-column prop="assignments" label="分配人数" width="110" />
          <el-table-column label="指标" min-width="320">
            <template #default="{ row }">
              <div v-if="Object.keys(row.metrics || {}).length" class="metric-list">
                <span v-for="(metric, key) in row.metrics" :key="key">
                  {{ key }}：{{ metric.total }} / {{ metric.count }}
                </span>
              </div>
              <span v-else class="empty-text">暂无指标回传</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, RefreshRight } from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const saving = ref(false)
const tests = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const createVisible = ref(false)
const resultsVisible = ref(false)
const testResults = ref<any | null>(null)

const filters = reactive({
  status: '',
  type: '',
})
const form = reactive({
  name: '',
  description: '',
  type: 'layout',
  regionId: '',
  targetMetric: 'click_rate',
  variants: [
    { id: 'control', name: '对照组', weight: 50, configText: '{}' },
    { id: 'variant_a', name: '实验组 A', weight: 50, configText: '{}' },
  ],
})

const typeOptions = [
  { label: '布局测试', value: 'layout' },
  { label: '信息流样式', value: 'feed_style' },
  { label: '首页权益卡片', value: 'popup' },
  { label: '分享链路', value: 'share' },
  { label: '优惠券', value: 'coupon' },
  { label: '推荐算法', value: 'recommend' },
]

function statusType(value: string) {
  return ({ draft: 'info', running: 'success', paused: 'warning', completed: '' } as Record<string, string>)[value] || 'info'
}

function statusLabel(value: string) {
  return ({ draft: '草稿', running: '运行中', paused: '已暂停', completed: '已完成' } as Record<string, string>)[value] || value || '-'
}

function typeLabel(value: string) {
  return typeOptions.find((item) => item.value === value)?.label || value || '-'
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-'
}

function resetForm() {
  form.name = ''
  form.description = ''
  form.type = 'layout'
  form.regionId = ''
  form.targetMetric = 'click_rate'
  form.variants = [
    { id: 'control', name: '对照组', weight: 50, configText: '{}' },
    { id: 'variant_a', name: '实验组 A', weight: 50, configText: '{}' },
  ]
}

function openCreateDialog() {
  resetForm()
  createVisible.value = true
}

function addVariant() {
  const next = form.variants.length + 1
  form.variants.push({ id: `variant_${next}`, name: `实验组 ${next}`, weight: 50, configText: '{}' })
}

function removeVariant(index: number) {
  form.variants.splice(index, 1)
}

function parseVariantConfig(text: string) {
  const raw = String(text || '').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('变体 JSON 配置格式不正确')
  }
}

async function loadTests(showSuccess = false) {
  loading.value = true
  try {
    const res: any = await request.get('/admin/ab-tests', {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        status: filters.status || undefined,
        type: filters.type || undefined,
      },
    })
    tests.value = res?.list || res?.data?.list || []
    total.value = res?.total || res?.data?.total || 0
    if (showSuccess) ElMessage.success('A/B 测试已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载 A/B 测试失败')
  } finally {
    loading.value = false
  }
}

function reloadFirstPage() {
  page.value = 1
  loadTests()
}

function resetFilters() {
  filters.status = ''
  filters.type = ''
  page.value = 1
  loadTests()
}

async function createTest() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入实验名称')
    return
  }
  saving.value = true
  try {
    const variants = form.variants.map((item) => ({
      id: item.id,
      name: item.name,
      weight: item.weight,
      config: parseVariantConfig(item.configText),
    }))
    await request.post('/admin/ab-tests', {
      name: form.name,
      description: form.description,
      type: form.type,
      regionId: form.regionId || null,
      targetMetric: form.targetMetric,
      variants,
    })
    ElMessage.success('实验已创建')
    createVisible.value = false
    await loadTests()
  } catch (e: any) {
    ElMessage.error(e?.message || '创建实验失败')
  } finally {
    saving.value = false
  }
}

async function startTest(row: any) {
  await ElMessageBox.confirm(`确定启动实验「${row.name}」？`, '启动实验', { type: 'warning' })
  try {
    await request.put(`/admin/ab-tests/${row.id}/start`)
    ElMessage.success('实验已启动')
    await loadTests()
  } catch (e: any) {
    ElMessage.error(e?.message || '启动实验失败')
  }
}

async function stopTest(row: any) {
  await ElMessageBox.confirm(`确定停止实验「${row.name}」？`, '停止实验', { type: 'warning' })
  try {
    await request.put(`/admin/ab-tests/${row.id}/stop`)
    ElMessage.success('实验已停止')
    await loadTests()
  } catch (e: any) {
    ElMessage.error(e?.message || '停止实验失败')
  }
}

async function viewResults(row: any) {
  try {
    const res: any = await request.get(`/admin/ab-tests/${row.id}/results`)
    testResults.value = res?.data || res
    resultsVisible.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '获取实验结果失败')
  }
}

onMounted(() => loadTests())
</script>

<style scoped lang="scss">
.ab-test-page {
  display: grid;
  gap: 18px;
}
.filter-card {
  display: grid;
  grid-template-columns: 180px 180px auto auto 1fr;
  gap: 12px;
  padding: 16px;
}
.table-card {
  padding: 16px;
}
.variant-chips,
.metric-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.time-cell span {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 750;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.variant-editor {
  width: 100%;
  display: grid;
  gap: 10px;
}
.variant-row {
  display: grid;
  grid-template-columns: 110px 140px 110px 1fr auto;
  gap: 8px;
  align-items: center;
}
.result-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.result-head h3 {
  margin: 0 0 4px;
}
.result-head p,
.empty-text {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 750;
}
@media (max-width: 960px) {
  .filter-card,
  .form-grid,
  .variant-row {
    grid-template-columns: 1fr;
  }
}
</style>
