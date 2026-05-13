<template>
  <div class="page-container">
    <div class="page-header">
      <h2>推荐策略</h2>
      <el-button type="primary" @click="loadStrategies">刷新</el-button>
    </div>

    <div class="glass-card" style="padding: 20px;">
      <el-table :data="strategies" v-loading="loading">
        <el-table-column prop="name" label="策略名称" min-width="150" />
        <el-table-column prop="targetType" label="目标类型" width="100" />
        <el-table-column prop="regionId" label="区域" width="100">
          <template #default="{ row }">{{ row.regionId || '全局' }}</template>
        </el-table-column>
        <el-table-column prop="isEnabled" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isEnabled ? 'success' : 'info'" size="small">{{ row.isEnabled ? '启用' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" @click="editStrategy(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showDialog" title="编辑推荐策略" width="600px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="策略名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="目标类型">
          <el-select v-model="form.targetType" style="width: 100%">
            <el-option label="帖子" value="post" />
            <el-option label="商家" value="merchant" />
            <el-option label="商品" value="product" />
            <el-option label="话题" value="topic" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isEnabled" />
        </el-form-item>
        <el-form-item label="热度权重">
          <el-slider v-model="form.weights.heat" :max="1" :step="0.05" show-input />
        </el-form-item>
        <el-form-item label="时间权重">
          <el-slider v-model="form.weights.time" :max="1" :step="0.05" show-input />
        </el-form-item>
        <el-form-item label="兴趣权重">
          <el-slider v-model="form.weights.interest" :max="1" :step="0.05" show-input />
        </el-form-item>
        <el-form-item label="关注权重">
          <el-slider v-model="form.weights.follow" :max="1" :step="0.05" show-input />
        </el-form-item>
        <el-form-item label="行为权重">
          <el-slider v-model="form.weights.behavior" :max="1" :step="0.05" show-input />
        </el-form-item>
        <el-form-item label="人工权重">
          <el-slider v-model="form.weights.manual" :max="1" :step="0.05" show-input />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="saveStrategy">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/api/request'

const loading = ref(false)
const showDialog = ref(false)
const strategies = ref([])
const editingId = ref('')

const form = reactive({
  name: '',
  targetType: 'post',
  regionId: '',
  isEnabled: true,
  weights: { heat: 0.3, time: 0.25, interest: 0.15, follow: 0.15, behavior: 0.1, manual: 0.05 },
})

const loadStrategies = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/recommend/strategy')
    strategies.value = res.data?.list || []
  } catch { strategies.value = [] } finally { loading.value = false }
}

const editStrategy = (row: any) => {
  editingId.value = row.id
  Object.assign(form, {
    name: row.name,
    targetType: row.targetType,
    regionId: row.regionId || '',
    isEnabled: row.isEnabled,
    weights: row.weights || form.weights,
  })
  showDialog.value = true
}

const saveStrategy = async () => {
  try {
    await request.put('/admin/recommend/strategy', { id: editingId.value, ...form })
    ElMessage.success('策略已保存')
    showDialog.value = false
    loadStrategies()
  } catch { ElMessage.error('保存失败') }
}

onMounted(() => loadStrategies())
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.glass-card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; }
</style>
