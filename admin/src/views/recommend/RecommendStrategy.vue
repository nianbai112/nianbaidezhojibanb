<template>
  <div class="page-shell recommend-strategy">
    <GlassPageHeader title="推荐策略" subtitle="按内容类型配置推荐权重、过滤规则和排序衰减，保存后用于推荐池重建与小程序推荐流">
      <template #actions>
        <el-button :icon="RefreshRight" :loading="loading" @click="loadStrategies(true)">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openDialog()">新增策略</el-button>
      </template>
    </GlassPageHeader>

    <div class="glass-card table-card">
      <el-table :data="strategies" v-loading="loading" stripe>
        <el-table-column prop="name" label="策略名称" min-width="180" />
        <el-table-column label="目标类型" width="120">
          <template #default="{ row }">{{ targetLabel(row.targetType) }}</template>
        </el-table-column>
        <el-table-column label="区域" width="150">
          <template #default="{ row }">{{ row.regionId || '全局策略' }}</template>
        </el-table-column>
        <el-table-column label="权重结构" min-width="260">
          <template #default="{ row }">
            <div class="weight-line">
              <span>热 {{ percent(row.weights?.heat) }}</span>
              <span>时 {{ percent(row.weights?.time) }}</span>
              <span>趣 {{ percent(row.weights?.interest) }}</span>
              <span>人 {{ percent(row.weights?.manual) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="衰减/新鲜度" width="150">
          <template #default="{ row }">
            {{ row.rankRules?.timeDecay || 72 }}h / {{ row.rankRules?.freshness || 24 }}h
          </template>
        </el-table-column>
        <el-table-column prop="isEnabled" label="状态" width="95">
          <template #default="{ row }">
            <el-tag :type="row.isEnabled ? 'success' : 'info'" effect="plain">
              {{ row.isEnabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !strategies.length" description="暂无推荐策略，请先新增策略或重建推荐池时使用默认策略" />
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑推荐策略' : '新增推荐策略'" width="760px">
      <el-form :model="form" label-width="110px">
        <div class="form-grid">
          <el-form-item label="策略名称" required>
            <el-input v-model="form.name" placeholder="如：首页帖子热度策略" />
          </el-form-item>
          <el-form-item label="目标类型" required>
            <el-select v-model="form.targetType" style="width: 100%">
              <el-option v-for="item in targetOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="区域 ID">
          <el-input v-model="form.regionId" clearable placeholder="留空表示全局策略" />
        </el-form-item>
        <el-form-item label="启用策略">
          <el-switch v-model="form.isEnabled" />
        </el-form-item>

        <div class="section-title">推荐权重</div>
        <div class="slider-grid">
          <el-form-item label="热度">
            <el-slider v-model="form.weights.heat" :max="1" :step="0.05" show-input />
          </el-form-item>
          <el-form-item label="时间">
            <el-slider v-model="form.weights.time" :max="1" :step="0.05" show-input />
          </el-form-item>
          <el-form-item label="兴趣">
            <el-slider v-model="form.weights.interest" :max="1" :step="0.05" show-input />
          </el-form-item>
          <el-form-item label="关注">
            <el-slider v-model="form.weights.follow" :max="1" :step="0.05" show-input />
          </el-form-item>
          <el-form-item label="行为">
            <el-slider v-model="form.weights.behavior" :max="1" :step="0.05" show-input />
          </el-form-item>
          <el-form-item label="人工">
            <el-slider v-model="form.weights.manual" :max="1" :step="0.05" show-input />
          </el-form-item>
        </div>

        <div class="section-title">排序规则</div>
        <div class="form-grid">
          <el-form-item label="时间衰减">
            <el-input-number v-model="form.rankRules.timeDecay" :min="1" :max="720" />
            <span class="unit">小时</span>
          </el-form-item>
          <el-form-item label="新鲜度">
            <el-input-number v-model="form.rankRules.freshness" :min="1" :max="168" />
            <span class="unit">小时</span>
          </el-form-item>
        </div>
        <el-form-item label="过滤规则">
          <el-checkbox v-model="form.filters.blacklist">过滤黑名单</el-checkbox>
          <el-checkbox v-model="form.filters.sensitive">过滤敏感内容</el-checkbox>
          <el-checkbox v-model="form.filters.region">区域隔离</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveStrategy">保存策略</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, RefreshRight } from '@element-plus/icons-vue'
import GlassPageHeader from '@/components/glass/GlassPageHeader.vue'
import { request } from '@/api/request'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const strategies = ref<any[]>([])

const targetOptions = [
  { label: '笔记/帖子', value: 'post' },
  { label: '商家', value: 'merchant' },
  { label: '商品', value: 'product' },
  { label: '话题', value: 'topic' },
  { label: '活动', value: 'activity' },
  { label: '二手', value: 'secondhand' },
]

const form = reactive({
  id: '',
  name: '',
  targetType: 'post',
  regionId: '',
  isEnabled: true,
  weights: { heat: 0.3, time: 0.25, interest: 0.15, follow: 0.15, behavior: 0.1, manual: 0.05 },
  filters: { blacklist: true, sensitive: true, region: true },
  rankRules: { timeDecay: 72, diversity: true, freshness: 24 },
})

function targetLabel(value: string) {
  return targetOptions.find((item) => item.value === value)?.label || value || '-'
}

function percent(value: any) {
  const n = Number(value || 0)
  return `${Math.round(n * 100)}%`
}

function resetForm() {
  form.id = ''
  form.name = ''
  form.targetType = 'post'
  form.regionId = ''
  form.isEnabled = true
  Object.assign(form.weights, { heat: 0.3, time: 0.25, interest: 0.15, follow: 0.15, behavior: 0.1, manual: 0.05 })
  Object.assign(form.filters, { blacklist: true, sensitive: true, region: true })
  Object.assign(form.rankRules, { timeDecay: 72, diversity: true, freshness: 24 })
}

function openDialog(row?: any) {
  resetForm()
  if (row) {
    form.id = row.id
    form.name = row.name || ''
    form.targetType = row.targetType || 'post'
    form.regionId = row.regionId || ''
    form.isEnabled = !!row.isEnabled
    Object.assign(form.weights, row.weights || {})
    Object.assign(form.filters, row.filters || {})
    Object.assign(form.rankRules, row.rankRules || {})
  }
  dialogVisible.value = true
}

async function loadStrategies(showSuccess = false) {
  loading.value = true
  try {
    const res: any = await request.get('/admin/recommend/strategy')
    strategies.value = res?.list || res?.data?.list || []
    if (showSuccess) ElMessage.success('推荐策略已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '加载推荐策略失败')
  } finally {
    loading.value = false
  }
}

async function saveStrategy() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入策略名称')
    return
  }
  saving.value = true
  try {
    await request.put('/admin/recommend/strategy', {
      id: form.id || undefined,
      name: form.name,
      targetType: form.targetType,
      regionId: form.regionId || null,
      isEnabled: form.isEnabled,
      weights: form.weights,
      filters: form.filters,
      rankRules: form.rankRules,
    })
    ElMessage.success('推荐策略已保存')
    dialogVisible.value = false
    await loadStrategies()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存推荐策略失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => loadStrategies())
</script>

<style scoped lang="scss">
.recommend-strategy {
  display: grid;
  gap: 18px;
}
.table-card {
  padding: 16px;
}
.weight-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.weight-line span {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, .08);
  color: #2563eb;
  font-size: 12px;
  font-weight: 850;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}
.slider-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 18px;
}
.section-title {
  margin: 8px 0 14px;
  padding-left: 10px;
  border-left: 4px solid #2f7cff;
  color: #0f172a;
  font-size: 15px;
  font-weight: 950;
}
.unit {
  margin-left: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 750;
}
@media (max-width: 860px) {
  .form-grid,
  .slider-grid {
    grid-template-columns: 1fr;
  }
}
</style>
